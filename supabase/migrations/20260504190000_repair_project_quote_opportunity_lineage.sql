create or replace function public.repair_project_quote_opportunity_lineage(
  p_project_quote_id uuid
)
returns table (
  repaired_line_count integer,
  mirrored_cost_item_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  project_quote_row public.project_quotes%rowtype;
  missing_line_count integer := 0;
  unresolved_line_count integer := 0;
  duplicate_source_match_count integer := 0;
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into project_quote_row
  from public.project_quotes pq
  where pq.id = p_project_quote_id;

  if not found then
    raise exception 'Project quote not found';
  end if;

  if not public.has_org_permission(project_quote_row.organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if project_quote_row.source_opportunity_quote_id is null then
    raise exception 'Project quote does not have a source opportunity quote';
  end if;

  select count(*)
  into missing_line_count
  from public.project_quote_line_items pqli
  where pqli.organization_id = project_quote_row.organization_id
    and pqli.project_id = project_quote_row.project_id
    and pqli.quote_id = project_quote_row.id
    and pqli.source_opportunity_quote_line_item_id is null;

  if missing_line_count = 0 then
    repaired_line_count := 0;
    cost_item_revision_key := public.begin_cost_item_revision('project_quote', project_quote_row.id);
    perform public.supersede_previous_cost_items('project_quote', project_quote_row.id, cost_item_revision_key);
    mirrored_cost_item_count := public.upsert_cost_items_for_document('project_quote', project_quote_row.id, cost_item_revision_key);
    return next;
    return;
  end if;

  create temporary table tmp_project_quote_lineage_matches (
    project_line_id uuid primary key,
    opportunity_line_id uuid not null
  ) on commit drop;

  with target_lines as (
    select
      pqli.id,
      pqli.sort_order,
      pqli.section,
      pqli.description,
      pqli.quantity,
      pqli.unit,
      pqli.rate,
      pqli.total,
      pqli.is_optional
    from public.project_quote_line_items pqli
    where pqli.organization_id = project_quote_row.organization_id
      and pqli.project_id = project_quote_row.project_id
      and pqli.quote_id = project_quote_row.id
      and pqli.source_opportunity_quote_line_item_id is null
  ),
  available_source_lines as (
    select
      oqli.id,
      oqli.sort_order,
      oqli.section,
      oqli.description,
      oqli.quantity,
      oqli.unit,
      oqli.rate,
      oqli.total,
      oqli.is_optional
    from public.opportunity_quote_line_items oqli
    where oqli.organization_id = project_quote_row.organization_id
      and oqli.quote_id = project_quote_row.source_opportunity_quote_id
      and not exists (
        select 1
        from public.project_quote_line_items existing
        where existing.quote_id = project_quote_row.id
          and existing.source_opportunity_quote_line_item_id = oqli.id
      )
  ),
  exact_candidates as (
    select
      tl.id as project_line_id,
      asl.id as opportunity_line_id
    from target_lines tl
    join available_source_lines asl
      on asl.sort_order = tl.sort_order
     and asl.section = tl.section
     and asl.is_optional = tl.is_optional
     and round(asl.quantity::numeric, 2) = round(tl.quantity::numeric, 2)
     and lower(regexp_replace(btrim(asl.unit), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(tl.unit), '\s+', ' ', 'g'))
     and round(asl.rate::numeric, 2) = round(tl.rate::numeric, 2)
     and round(coalesce(asl.total, round(asl.quantity * asl.rate, 2))::numeric, 2)
         = round(coalesce(tl.total, round(tl.quantity * tl.rate, 2))::numeric, 2)
     and lower(regexp_replace(btrim(asl.description), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(tl.description), '\s+', ' ', 'g'))
  ),
  exact_candidate_counts as (
    select
      ec.project_line_id,
      count(*) as candidate_count,
      min(ec.opportunity_line_id) as chosen_opportunity_line_id
    from exact_candidates ec
    group by ec.project_line_id
  ),
  broad_candidates as (
    select
      tl.id as project_line_id,
      asl.id as opportunity_line_id
    from target_lines tl
    join available_source_lines asl
      on asl.sort_order = tl.sort_order
     and asl.section = tl.section
     and asl.is_optional = tl.is_optional
     and round(asl.quantity::numeric, 2) = round(tl.quantity::numeric, 2)
     and lower(regexp_replace(btrim(asl.unit), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(tl.unit), '\s+', ' ', 'g'))
     and round(asl.rate::numeric, 2) = round(tl.rate::numeric, 2)
     and round(coalesce(asl.total, round(asl.quantity * asl.rate, 2))::numeric, 2)
         = round(coalesce(tl.total, round(tl.quantity * tl.rate, 2))::numeric, 2)
    where not exists (
      select 1
      from exact_candidate_counts ecc
      where ecc.project_line_id = tl.id
        and ecc.candidate_count = 1
    )
  ),
  broad_candidate_counts as (
    select
      bc.project_line_id,
      count(*) as candidate_count,
      min(bc.opportunity_line_id) as chosen_opportunity_line_id
    from broad_candidates bc
    group by bc.project_line_id
  ),
  chosen_matches as (
    select
      tl.id as project_line_id,
      case
        when ecc.candidate_count = 1 then ecc.chosen_opportunity_line_id
        when coalesce(ecc.candidate_count, 0) = 0 and bcc.candidate_count = 1 then bcc.chosen_opportunity_line_id
        else null
      end as opportunity_line_id
    from target_lines tl
    left join exact_candidate_counts ecc
      on ecc.project_line_id = tl.id
    left join broad_candidate_counts bcc
      on bcc.project_line_id = tl.id
  )
  insert into tmp_project_quote_lineage_matches (project_line_id, opportunity_line_id)
  select
    cm.project_line_id,
    cm.opportunity_line_id
  from chosen_matches cm
  where cm.opportunity_line_id is not null;

  select count(*)
  into unresolved_line_count
  from public.project_quote_line_items pqli
  where pqli.organization_id = project_quote_row.organization_id
    and pqli.project_id = project_quote_row.project_id
    and pqli.quote_id = project_quote_row.id
    and pqli.source_opportunity_quote_line_item_id is null
    and not exists (
      select 1
      from tmp_project_quote_lineage_matches m
      where m.project_line_id = pqli.id
    );

  if unresolved_line_count > 0 then
    raise exception 'Lineage repair failed: one or more project quote lines could not be matched safely to the source opportunity quote';
  end if;

  select count(*)
  into duplicate_source_match_count
  from (
    select m.opportunity_line_id
    from tmp_project_quote_lineage_matches m
    group by m.opportunity_line_id
    having count(*) > 1
  ) duplicates;

  if duplicate_source_match_count > 0 then
    raise exception 'Lineage repair failed: one or more source opportunity quote lines matched multiple project quote lines';
  end if;

  update public.project_quote_line_items pqli
  set
    source_opportunity_quote_id = project_quote_row.source_opportunity_quote_id,
    source_opportunity_quote_line_item_id = m.opportunity_line_id,
    source_opportunity_quote_number = project_quote_row.source_opportunity_quote_number
  from tmp_project_quote_lineage_matches m
  where pqli.id = m.project_line_id
    and pqli.quote_id = project_quote_row.id;

  get diagnostics repaired_line_count = row_count;

  cost_item_revision_key := public.begin_cost_item_revision('project_quote', project_quote_row.id);
  perform public.supersede_previous_cost_items('project_quote', project_quote_row.id, cost_item_revision_key);
  mirrored_cost_item_count := public.upsert_cost_items_for_document('project_quote', project_quote_row.id, cost_item_revision_key);

  return next;
end;
$$;

grant execute on function public.repair_project_quote_opportunity_lineage(uuid) to authenticated;
