begin;

alter table public.opportunity_pricing_worksheets
  drop constraint if exists opportunity_pricing_worksheets_clone_lineage_check;

alter table public.opportunity_pricing_worksheets
  add constraint opportunity_pricing_worksheets_clone_lineage_check
  check (
    (clone_kind is null and source_workbook_id is null and source_workbook_version is null
      and source_award_manifest_id is null and source_quote_id is null)
    or (
      clone_kind = 'project_working' and source_workbook_id is not null
      and source_workbook_version is not null and source_workbook_version > 0
      and source_award_manifest_id is not null and source_quote_id is null
      and project_id is not null and quote_id is not null and variation_id is null
    )
    or (
      clone_kind = 'project_workspace' and source_workbook_id is not null
      and source_workbook_version is not null and source_workbook_version > 0
      and source_award_manifest_id is not null and source_quote_id is null
      and project_id is not null and quote_id is null and variation_id is null
    )
    or (
      clone_kind = 'quote_revision' and source_workbook_id is not null
      and source_workbook_version is not null and source_workbook_version > 0
      and source_quote_id is not null and project_id is not null and quote_id is not null
    )
  );

create unique index if not exists opportunity_pricing_worksheets_project_source_continuation_unique
  on public.opportunity_pricing_worksheets (organization_id, project_id, source_workbook_id)
  where clone_kind in ('project_working', 'project_workspace') and archived_at is null;

create or replace function public.can_write_pricing_workbook_owner(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid default null,
  p_quote_id uuid default null,
  p_variation_id uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  resolved_project_source_opportunity_id uuid;
begin
  if not public.is_member_of_organization(p_organization_id) then
    return false;
  end if;

  if p_variation_id is not null then
    if p_quote_id is not null or p_project_id is null
      or not public.has_org_permission(p_organization_id, 'variations.write') then
      return false;
    end if;

    select project.source_opportunity_id into resolved_project_source_opportunity_id
    from public.project_variations variation
    join public.organization_projects project
      on project.id = variation.project_id and project.organization_id = variation.organization_id
    where variation.id = p_variation_id
      and variation.organization_id = p_organization_id
      and variation.project_id = p_project_id;

    return found and resolved_project_source_opportunity_id is not distinct from p_opportunity_id;
  end if;

  if p_quote_id is not null then
    if p_project_id is null or not public.has_org_permission(p_organization_id, 'quotes.write') then
      return false;
    end if;

    return exists (
      select 1 from public.project_quotes quote
      where quote.id = p_quote_id
        and quote.organization_id = p_organization_id
        and quote.project_id = p_project_id
        and quote.originating_opportunity_id = p_opportunity_id
    );
  end if;

  if p_project_id is not null then
    if not public.has_org_permission(p_organization_id, 'quotes.write') then
      return false;
    end if;

    return exists (
      select 1 from public.organization_projects project
      where project.id = p_project_id
        and project.organization_id = p_organization_id
        and project.source_opportunity_id = p_opportunity_id
    );
  end if;

  return public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and exists (
      select 1 from public.organization_opportunities opportunity
      where opportunity.id = p_opportunity_id
        and opportunity.organization_id = p_organization_id
    );
end;
$$;

create or replace function public.validate_pricing_workbook_owner_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_project_source_opportunity_id uuid;
begin
  if new.project_id is not null then
    select project.source_opportunity_id into resolved_project_source_opportunity_id
    from public.organization_projects project
    where project.id = new.project_id and project.organization_id = new.organization_id;

    if not found or resolved_project_source_opportunity_id is distinct from new.opportunity_id then
      raise exception 'Project worksheet opportunity lineage is invalid.';
    end if;
  end if;

  if new.variation_id is not null and not exists (
    select 1 from public.project_variations variation
    where variation.id = new.variation_id
      and variation.organization_id = new.organization_id
      and variation.project_id = new.project_id
  ) then
    raise exception 'Variation worksheet lineage is invalid.';
  end if;

  if new.quote_id is not null and not exists (
    select 1 from public.project_quotes quote
    where quote.id = new.quote_id
      and quote.organization_id = new.organization_id
      and quote.project_id = new.project_id
      and quote.originating_opportunity_id = new.opportunity_id
  ) then
    raise exception 'Quote worksheet lineage is invalid.';
  end if;

  return new;
end;
$$;

create or replace function public.rename_pricing_workbook_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid,
  p_workbook_id uuid,
  p_user_id uuid,
  p_next_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workbook public.opportunity_pricing_worksheets%rowtype;
  primary_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  next_name text;
  next_worksheet jsonb;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Pricing worksheet actor mismatch.' using errcode = '42501';
  end if;

  select * into workbook from public.opportunity_pricing_worksheets candidate
  where candidate.id = p_workbook_id
    and candidate.organization_id = p_organization_id
    and candidate.opportunity_id = p_opportunity_id
    and candidate.archived_at is null
    and candidate.variation_id is null
    and (
      (p_project_id is null and candidate.project_id is null and candidate.quote_id is null)
      or (p_project_id is not null and candidate.project_id = p_project_id
        and (candidate.quote_id is null or candidate.clone_kind = 'project_working'))
    );

  if not found or not public.can_write_pricing_workbook_owner(
    workbook.organization_id, workbook.opportunity_id, workbook.project_id,
    workbook.quote_id, workbook.variation_id
  ) then
    raise exception 'Pricing worksheet not found or not writable.' using errcode = '42501';
  end if;

  next_name := public._normalize_opportunity_pricing_workbook_name(
    p_next_name, coalesce(nullif(trim(workbook.name), ''), 'Pricing Worksheet')
  );
  next_worksheet := public._sync_opportunity_pricing_workbook_sheet_name(workbook.worksheet_data, next_name);

  update public.opportunity_pricing_worksheets
  set name = next_name, worksheet_data = next_worksheet, updated_by = p_user_id
  where id = workbook.id returning * into workbook;

  select * into primary_sheet from public.opportunity_pricing_workbook_sheets sheet
  where sheet.workbook_id = workbook.id and sheet.organization_id = p_organization_id
  order by sheet.is_default desc, sheet.sheet_order, sheet.created_at limit 1;

  if found then
    update public.opportunity_pricing_workbook_sheets
    set name = next_name,
        worksheet_data = public._sync_opportunity_pricing_workbook_sheet_name(primary_sheet.worksheet_data, next_name),
        updated_by = p_user_id
    where id = primary_sheet.id returning * into primary_sheet;
  end if;

  return jsonb_build_object(
    'workbook', to_jsonb(workbook),
    'sheets', (select coalesce(jsonb_agg(to_jsonb(sheet) order by sheet.sheet_order, sheet.created_at), '[]'::jsonb)
      from public.opportunity_pricing_workbook_sheets sheet where sheet.workbook_id = workbook.id)
  );
end;
$$;

create or replace function public.duplicate_pricing_workbook_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid,
  p_workbook_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  payload jsonb;
  duplicate_id uuid;
  duplicated_workbook public.opportunity_pricing_worksheets%rowtype;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Pricing worksheet actor mismatch.' using errcode = '42501';
  end if;

  select * into source_workbook from public.opportunity_pricing_worksheets candidate
  where candidate.id = p_workbook_id
    and candidate.organization_id = p_organization_id
    and candidate.opportunity_id = p_opportunity_id
    and candidate.archived_at is null
    and candidate.variation_id is null
    and (
      (p_project_id is null and candidate.project_id is null and candidate.quote_id is null)
      or (p_project_id is not null and candidate.project_id = p_project_id
        and (candidate.quote_id is null or candidate.clone_kind = 'project_working'))
    );

  if not found or not public.can_write_pricing_workbook_owner(
    source_workbook.organization_id, source_workbook.opportunity_id,
    source_workbook.project_id, source_workbook.quote_id, source_workbook.variation_id
  ) then
    raise exception 'Pricing worksheet not found or not writable.' using errcode = '42501';
  end if;

  payload := public.duplicate_opportunity_pricing_workbook(
    p_organization_id, p_opportunity_id, p_workbook_id, p_user_id
  );
  duplicate_id := (payload #>> '{workbook,id}')::uuid;

  if p_project_id is not null then
    update public.opportunity_pricing_worksheets
    set project_id = p_project_id, updated_by = p_user_id
    where id = duplicate_id returning * into duplicated_workbook;
  else
    select * into duplicated_workbook from public.opportunity_pricing_worksheets where id = duplicate_id;
  end if;

  return jsonb_set(payload, '{workbook}', to_jsonb(duplicated_workbook), false);
end;
$$;

revoke all on function public.rename_pricing_workbook_v1(uuid, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.rename_pricing_workbook_v1(uuid, uuid, uuid, uuid, uuid, text) to authenticated;
revoke all on function public.duplicate_pricing_workbook_v1(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.duplicate_pricing_workbook_v1(uuid, uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.ensure_opportunity_project_pricing_workbooks_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid,
  p_accepted_quote_id uuid
)
returns table (source_count integer, reused_count integer, created_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  manifest_id uuid;
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  default_source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  continuation public.opportunity_pricing_worksheets%rowtype;
  destination_workbook_id uuid;
  destination_sheet_id uuid;
  parent_worksheet jsonb;
  resolved_source_count integer := 0;
  resolved_reused_count integer := 0;
  resolved_created_count integer := 0;
  sheet_count integer;
begin
  if actor_user_id is null or not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.opportunity_final_projects mapping
    where mapping.organization_id = p_organization_id
      and mapping.opportunity_id = p_opportunity_id
      and mapping.project_id = p_project_id
      and mapping.accepted_quote_id = p_accepted_quote_id
  ) then
    raise exception 'Final Project mapping is invalid.' using errcode = 'TS409';
  end if;

  select manifest.id into manifest_id from public.opportunity_award_pricing_manifests manifest
  where manifest.organization_id = p_organization_id
    and manifest.opportunity_id = p_opportunity_id
    and manifest.project_id = p_project_id
    and manifest.accepted_quote_id = p_accepted_quote_id;

  if manifest_id is null then
    raise exception 'Award pricing manifest must be finalized before Project continuations.' using errcode = 'TS409';
  end if;

  for source_workbook in
    select * from public.opportunity_pricing_worksheets source
    where source.organization_id = p_organization_id
      and source.opportunity_id = p_opportunity_id
      and source.project_id is null and source.quote_id is null and source.variation_id is null
      and source.clone_kind is null and source.archived_at is null
    order by source.created_at, source.id
  loop
    resolved_source_count := resolved_source_count + 1;

    select * into continuation from public.opportunity_pricing_worksheets candidate
    where candidate.organization_id = p_organization_id
      and candidate.project_id = p_project_id
      and candidate.source_workbook_id = source_workbook.id
      and candidate.clone_kind in ('project_working', 'project_workspace')
      and candidate.archived_at is null
    order by case when candidate.clone_kind = 'project_working' then 0 else 1 end
    limit 1;

    if found then
      resolved_reused_count := resolved_reused_count + 1;
      continue;
    end if;

    destination_workbook_id := md5(manifest_id::text || ':project-workbook:' || source_workbook.id::text)::uuid;
    select * into default_source_sheet from public.opportunity_pricing_workbook_sheets sheet
    where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
    order by sheet.is_default desc, sheet.sheet_order, sheet.created_at limit 1;

    parent_worksheet := public.regenerate_worksheet_material_binding_ids(
      coalesce(default_source_sheet.worksheet_data, source_workbook.worksheet_data)
    );

    insert into public.opportunity_pricing_worksheets (
      id, organization_id, opportunity_id, project_id, quote_id, variation_id,
      name, trade_package, sort_order, archived_at, last_active_sheet_id,
      worksheet_data, pricing_summary, extracted_pricing_data, version,
      created_by, updated_by, source_workbook_id, source_workbook_version,
      source_award_manifest_id, source_quote_id, clone_kind
    ) values (
      destination_workbook_id, p_organization_id, p_opportunity_id, p_project_id, null, null,
      source_workbook.name, source_workbook.trade_package, source_workbook.sort_order, null, null,
      parent_worksheet,
      coalesce(default_source_sheet.pricing_summary, source_workbook.pricing_summary),
      coalesce(default_source_sheet.extracted_pricing_data, source_workbook.extracted_pricing_data),
      greatest(coalesce(default_source_sheet.version, source_workbook.version, 1), 1),
      actor_user_id, actor_user_id, source_workbook.id, greatest(source_workbook.version, 1),
      manifest_id, null, 'project_workspace'
    ) on conflict do nothing;

    get diagnostics sheet_count = row_count;
    if sheet_count = 0 then
      resolved_reused_count := resolved_reused_count + 1;
      continue;
    end if;

    resolved_created_count := resolved_created_count + 1;
    sheet_count := 0;
    for source_sheet in
      select * from public.opportunity_pricing_workbook_sheets sheet
      where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
      order by sheet.sheet_order, sheet.created_at
    loop
      destination_sheet_id := md5(manifest_id::text || ':project-sheet:' || source_sheet.id::text)::uuid;
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
        worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
      ) values (
        destination_sheet_id, destination_workbook_id, p_organization_id, p_opportunity_id,
        source_sheet.name, source_sheet.sheet_order, source_sheet.is_default,
        case when source_sheet.id = default_source_sheet.id then parent_worksheet
          else public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data) end,
        source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
        source_sheet.version, actor_user_id, actor_user_id
      ) on conflict (id) do nothing;
      sheet_count := sheet_count + 1;
    end loop;

    if sheet_count = 0 then
      destination_sheet_id := md5(manifest_id::text || ':project-sheet:legacy:' || source_workbook.id::text)::uuid;
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
        worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
      ) values (
        destination_sheet_id, destination_workbook_id, p_organization_id, p_opportunity_id,
        coalesce(nullif(btrim(source_workbook.name), ''), 'Pricing Worksheet'), 0, true,
        parent_worksheet, source_workbook.pricing_summary, source_workbook.extracted_pricing_data,
        greatest(source_workbook.version, 1), actor_user_id, actor_user_id
      ) on conflict (id) do nothing;
    end if;

    update public.opportunity_pricing_worksheets destination
    set last_active_sheet_id = case
      when source_workbook.last_active_sheet_id is not null
        then md5(manifest_id::text || ':project-sheet:' || source_workbook.last_active_sheet_id::text)::uuid
      else (select sheet.id from public.opportunity_pricing_workbook_sheets sheet
        where sheet.workbook_id = destination_workbook_id
        order by sheet.is_default desc, sheet.sheet_order, sheet.created_at limit 1)
      end
    where destination.id = destination_workbook_id;
  end loop;

  update public.opportunity_pricing_worksheets source
  set award_locked_at = coalesce(source.award_locked_at, timezone('utc', now())),
      award_locked_reason = coalesce(source.award_locked_reason, 'accepted_tender_basis'),
      updated_by = actor_user_id
  where source.organization_id = p_organization_id
    and source.opportunity_id = p_opportunity_id
    and source.project_id is null and source.quote_id is null and source.variation_id is null
    and source.clone_kind is null and source.archived_at is null
    and source.award_locked_at is null;

  return query select resolved_source_count, resolved_reused_count, resolved_created_count;
end;
$$;

revoke all on function public.ensure_opportunity_project_pricing_workbooks_v1(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.ensure_opportunity_project_pricing_workbooks_v1(uuid, uuid, uuid, uuid)
  to authenticated;

alter function public.finalize_opportunity_award_pricing_v1(uuid, uuid, uuid, uuid)
  rename to finalize_opportunity_award_pricing_core_v1;

revoke all on function public.finalize_opportunity_award_pricing_core_v1(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

create function public.finalize_opportunity_award_pricing_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid,
  p_accepted_quote_id uuid
)
returns table (
  manifest_id uuid,
  working_quote_id uuid,
  classification text,
  source_workbook_count integer,
  worksheet_line_count integer,
  manual_line_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select * from public.finalize_opportunity_award_pricing_core_v1(
    p_organization_id, p_opportunity_id, p_project_id, p_accepted_quote_id
  );

  perform * from public.ensure_opportunity_project_pricing_workbooks_v1(
    p_organization_id, p_opportunity_id, p_project_id, p_accepted_quote_id
  );
end;
$$;

revoke all on function public.finalize_opportunity_award_pricing_v1(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.finalize_opportunity_award_pricing_v1(uuid, uuid, uuid, uuid)
  to authenticated;

create or replace function public.reconcile_project_pricing_workbooks_v1(
  p_dry_run boolean default true,
  p_organization_id uuid default null
)
returns table (
  organization_id uuid,
  opportunity_id uuid,
  project_id uuid,
  source_workbook_count integer,
  existing_continuation_count integer,
  missing_continuation_count integer,
  applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  mapping public.opportunity_final_projects%rowtype;
  source_total integer;
  existing_total integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  for mapping in
    select final_mapping.* from public.opportunity_final_projects final_mapping
    where (p_organization_id is null or final_mapping.organization_id = p_organization_id)
      and public.is_member_of_organization(final_mapping.organization_id)
      and public.has_org_permission(final_mapping.organization_id, 'leads.opportunities.write')
      and public.has_org_permission(final_mapping.organization_id, 'quotes.write')
    order by final_mapping.created_at, final_mapping.id
  loop
    select count(*)::integer into source_total
    from public.opportunity_pricing_worksheets source
    where source.organization_id = mapping.organization_id
      and source.opportunity_id = mapping.opportunity_id
      and source.project_id is null and source.quote_id is null and source.variation_id is null
      and source.clone_kind is null and source.archived_at is null;

    select count(*)::integer into existing_total
    from public.opportunity_pricing_worksheets source
    where source.organization_id = mapping.organization_id
      and source.opportunity_id = mapping.opportunity_id
      and source.project_id is null and source.quote_id is null and source.variation_id is null
      and source.clone_kind is null and source.archived_at is null
      and exists (
        select 1 from public.opportunity_pricing_worksheets continuation
        where continuation.organization_id = mapping.organization_id
          and continuation.project_id = mapping.project_id
          and continuation.source_workbook_id = source.id
          and continuation.clone_kind in ('project_working', 'project_workspace')
          and continuation.archived_at is null
      );

    if not p_dry_run and source_total > existing_total then
      perform * from public.finalize_opportunity_award_pricing_v1(
        mapping.organization_id, mapping.opportunity_id,
        mapping.project_id, mapping.accepted_quote_id
      );
    end if;

    organization_id := mapping.organization_id;
    opportunity_id := mapping.opportunity_id;
    project_id := mapping.project_id;
    source_workbook_count := source_total;
    existing_continuation_count := existing_total;
    missing_continuation_count := greatest(source_total - existing_total, 0);
    applied := not p_dry_run and source_total > existing_total;
    return next;
  end loop;
end;
$$;

revoke all on function public.reconcile_project_pricing_workbooks_v1(boolean, uuid)
  from public, anon;
grant execute on function public.reconcile_project_pricing_workbooks_v1(boolean, uuid)
  to authenticated;

commit;
