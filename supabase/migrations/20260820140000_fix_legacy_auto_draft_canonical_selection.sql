begin;

-- Classify legacy Drafts by immutable provenance and commercial value equality.
-- Timestamp-only checks are insufficient because an idempotent save/publication
-- can refresh system metadata without turning an automatic award Draft into a
-- meaningful user revision.
create or replace function public.classify_legacy_automatic_project_quote_draft_v1(
  p_organization_id uuid,
  p_quote_id uuid
)
returns table (
  manifest_linked boolean,
  deterministic_id_match boolean,
  expected_predecessor boolean,
  expected_revision_kind boolean,
  expected_status boolean,
  quote_values_match boolean,
  line_values_match boolean,
  workbook_untouched boolean,
  successor_absent boolean,
  is_legacy_automatic_draft boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with evidence as (
    select
      manifest.id as manifest_id,
      manifest.created_at as manifest_created_at,
      accepted.id as accepted_id,
      working.*,
      to_jsonb(accepted) as accepted_json,
      to_jsonb(working) as working_json
    from public.opportunity_award_pricing_manifests manifest
    join public.project_quotes accepted
      on accepted.organization_id = manifest.organization_id
     and accepted.id = manifest.accepted_quote_id
    join public.project_quotes working
      on working.organization_id = manifest.organization_id
     and working.id = manifest.working_quote_id
    where manifest.organization_id = p_organization_id
      and manifest.working_quote_id = p_quote_id
  ), predicates as (
    select
      true as manifest_linked,
      evidence.id = md5(evidence.manifest_id::text || ':working-quote')::uuid
        as deterministic_id_match,
      evidence.predecessor_quote_id = evidence.accepted_id as expected_predecessor,
      evidence.revision_kind = 'project_working' as expected_revision_kind,
      evidence.status = 'Draft' as expected_status,
      (evidence.working_json - array[
        'id', 'quote_number', 'status', 'predecessor_quote_id',
        'revision_number', 'revision_kind', 'revision_created_at',
        'revision_created_by', 'award_locked_at', 'award_locked_reason',
        'pricing_basis_status', 'pricing_basis_checked_at',
        'publication_basis_hash', 'publication_basis_json', 'published_at',
        'created_at', 'updated_at'
      ]::text[]) = (evidence.accepted_json - array[
        'id', 'quote_number', 'status', 'predecessor_quote_id',
        'revision_number', 'revision_kind', 'revision_created_at',
        'revision_created_by', 'award_locked_at', 'award_locked_reason',
        'pricing_basis_status', 'pricing_basis_checked_at',
        'publication_basis_hash', 'publication_basis_json', 'published_at',
        'created_at', 'updated_at'
      ]::text[]) as quote_values_match,
      not exists (
        (select line.section, line.description, line.quantity, line.unit, line.rate,
          line.total, line.is_optional, line.sort_order, line.pricing_source_kind
         from public.project_quote_line_items line
         where line.organization_id = p_organization_id
           and line.quote_id = evidence.accepted_id)
        except all
        (select line.section, line.description, line.quantity, line.unit, line.rate,
          line.total, line.is_optional, line.sort_order, line.pricing_source_kind
         from public.project_quote_line_items line
         where line.organization_id = p_organization_id
           and line.quote_id = evidence.id)
      ) and not exists (
        (select line.section, line.description, line.quantity, line.unit, line.rate,
          line.total, line.is_optional, line.sort_order, line.pricing_source_kind
         from public.project_quote_line_items line
         where line.organization_id = p_organization_id
           and line.quote_id = evidence.id)
        except all
        (select line.section, line.description, line.quantity, line.unit, line.rate,
          line.total, line.is_optional, line.sort_order, line.pricing_source_kind
         from public.project_quote_line_items line
         where line.organization_id = p_organization_id
           and line.quote_id = evidence.accepted_id)
      ) as line_values_match,
      not exists (
        select 1 from public.opportunity_pricing_worksheets workbook
        where workbook.organization_id = p_organization_id
          and workbook.quote_id = evidence.id
          and workbook.updated_at > evidence.manifest_created_at + interval '5 seconds'
      ) as workbook_untouched,
      not exists (
        select 1 from public.project_quotes successor
        where successor.organization_id = p_organization_id
          and successor.predecessor_quote_id = evidence.id
      ) as successor_absent
    from evidence
  )
  select predicates.*,
    predicates.manifest_linked
      and predicates.deterministic_id_match
      and predicates.expected_predecessor
      and predicates.expected_revision_kind
      and predicates.expected_status
      and predicates.quote_values_match
      and predicates.line_values_match
      and predicates.workbook_untouched
      and predicates.successor_absent as is_legacy_automatic_draft
  from predicates;
$$;

revoke all on function public.classify_legacy_automatic_project_quote_draft_v1(uuid, uuid)
  from public, anon;
grant execute on function public.classify_legacy_automatic_project_quote_draft_v1(uuid, uuid)
  to authenticated, service_role;

-- Preserve P1 as history. If the old automatic P1 is the direct successor,
-- bridge through it and create/reuse P2 as the first explicit user revision.
create or replace function public.create_project_quote_revision_v1(
  p_organization_id uuid,
  p_project_id uuid,
  p_predecessor_quote_id uuid,
  p_quote_number text
)
returns table (
  quote_id uuid,
  quote_number text,
  revision_number integer,
  cloned_workbook_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  created_revision record;
  legacy_evidence record;
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  default_source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  destination_workbook_id uuid;
  destination_sheet_id uuid;
  parent_worksheet jsonb;
  next_quote_number text;
  project_suffix integer;
begin
  select * into created_revision
  from public.create_project_quote_revision_core_v1(
    p_organization_id, p_project_id, p_predecessor_quote_id, p_quote_number
  );

  select * into legacy_evidence
  from public.classify_legacy_automatic_project_quote_draft_v1(
    p_organization_id, created_revision.quote_id
  );

  if found
    and legacy_evidence.manifest_linked
    and legacy_evidence.deterministic_id_match
    and legacy_evidence.expected_predecessor
    and legacy_evidence.expected_revision_kind
    and legacy_evidence.expected_status
    and legacy_evidence.quote_values_match
    and legacy_evidence.line_values_match
    and legacy_evidence.workbook_untouched
  then
    project_suffix := substring(created_revision.quote_number from '-P([0-9]+)$')::integer;
    if project_suffix is null then
      raise exception 'Legacy automatic Draft has an unsupported quote number'
        using errcode = 'TS409';
    end if;
    next_quote_number := regexp_replace(created_revision.quote_number, '-P[0-9]+$', '')
      || '-P' || (project_suffix + 1)::text;

    select * into created_revision
    from public.create_project_quote_revision_core_v1(
      p_organization_id, p_project_id, created_revision.quote_id, next_quote_number
    );
  end if;

  for source_workbook in
    select * from public.opportunity_pricing_worksheets workbook
    where workbook.organization_id = p_organization_id
      and workbook.project_id = p_project_id
      and workbook.quote_id is null
      and workbook.variation_id is null
      and workbook.clone_kind = 'project_workspace'
      and workbook.archived_at is null
    order by workbook.sort_order, workbook.created_at
  loop
    if exists (
      select 1 from public.opportunity_pricing_worksheets clone
      where clone.organization_id = p_organization_id
        and clone.quote_id = created_revision.quote_id
        and clone.source_workbook_id = source_workbook.id
        and clone.clone_kind = 'quote_revision'
    ) then
      continue;
    end if;

    destination_workbook_id := md5(created_revision.quote_id::text || ':workspace:' || source_workbook.id::text)::uuid;
    select * into default_source_sheet
    from public.opportunity_pricing_workbook_sheets sheet
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
      destination_workbook_id, p_organization_id, source_workbook.opportunity_id,
      p_project_id, created_revision.quote_id, null, source_workbook.name,
      source_workbook.trade_package, source_workbook.sort_order, null,
      case when source_workbook.last_active_sheet_id is null then null
        else md5(created_revision.quote_id::text || ':workspace-sheet:' || source_workbook.last_active_sheet_id::text)::uuid end,
      parent_worksheet,
      coalesce(default_source_sheet.pricing_summary, source_workbook.pricing_summary),
      coalesce(default_source_sheet.extracted_pricing_data, source_workbook.extracted_pricing_data),
      greatest(coalesce(default_source_sheet.version, source_workbook.version, 1), 1),
      actor_user_id, actor_user_id, source_workbook.id, source_workbook.version,
      source_workbook.source_award_manifest_id, p_predecessor_quote_id, 'quote_revision'
    ) on conflict (id) do nothing;

    for source_sheet in
      select * from public.opportunity_pricing_workbook_sheets sheet
      where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
      order by sheet.sheet_order, sheet.created_at
    loop
      destination_sheet_id := md5(created_revision.quote_id::text || ':workspace-sheet:' || source_sheet.id::text)::uuid;
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order,
        is_default, worksheet_data, pricing_summary, extracted_pricing_data,
        version, created_by, updated_by
      ) values (
        destination_sheet_id, destination_workbook_id, p_organization_id,
        source_workbook.opportunity_id, source_sheet.name, source_sheet.sheet_order,
        source_sheet.is_default,
        case when source_sheet.id = default_source_sheet.id then parent_worksheet
          else public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data) end,
        source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
        source_sheet.version, actor_user_id, actor_user_id
      ) on conflict (id) do nothing;
    end loop;
  end loop;

  return query select created_revision.quote_id, created_revision.quote_number,
    created_revision.revision_number,
    (select count(*)::integer from public.opportunity_pricing_worksheets workbook
      where workbook.organization_id = p_organization_id
        and workbook.quote_id = created_revision.quote_id);
end;
$$;

revoke all on function public.create_project_quote_revision_v1(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.create_project_quote_revision_v1(uuid, uuid, uuid, text)
  to authenticated;

commit;
