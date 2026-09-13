begin;

-- commercial_items.description is NOT NULL with an empty-string default. Keep
-- create_commercial_item aligned with that contract for sparse worksheet lines.
create or replace function public.create_commercial_item(p_input jsonb)
returns table (
  id uuid,
  organization_id uuid,
  opportunity_id uuid,
  project_id uuid,
  source_type text,
  source_workbook_id uuid,
  source_worksheet_id uuid,
  source_sheet_id uuid,
  source_range text,
  source_signature text,
  source_version integer,
  source_status text,
  stale_reason_code text,
  last_source_checked_at timestamptz,
  last_source_changed_at timestamptz,
  description text,
  quantity numeric,
  unit text,
  rate numeric,
  total numeric,
  snapshot_json jsonb,
  source_link_json jsonb,
  ucl_classification text,
  ucl_validation_status text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  inserted_row public.commercial_items%rowtype;
  resolved_organization_id uuid;
  resolved_opportunity_id uuid;
  resolved_project_id uuid;
  resolved_source_workbook_id uuid;
  resolved_source_worksheet_id uuid;
  resolved_source_sheet_id uuid;
  resolved_source_range text;
  resolved_source_signature text;
  resolved_source_version integer;
  resolved_source_status text;
  resolved_snapshot_json jsonb;
  resolved_source_link_json jsonb;
  resolved_locked_metadata_json jsonb;
  resolved_ucl_validation_status text;
  resolved_project_source_opportunity_id uuid;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  resolved_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;
  resolved_project_id := nullif(p_input->>'projectId', '')::uuid;
  resolved_source_workbook_id := nullif(p_input->>'sourceWorkbookId', '')::uuid;
  resolved_source_worksheet_id := coalesce(
    nullif(p_input->>'sourceWorksheetId', '')::uuid,
    resolved_source_workbook_id
  );
  resolved_source_sheet_id := nullif(p_input->>'sourceSheetId', '')::uuid;
  resolved_source_range := coalesce(nullif(btrim(coalesce(p_input->>'sourceRange', '')), ''), '');
  resolved_source_signature := coalesce(nullif(btrim(coalesce(p_input->>'sourceSignature', '')), ''), '');
  resolved_source_version := coalesce(nullif(p_input->>'sourceVersion', '')::integer, 1);
  resolved_source_status := coalesce(nullif(p_input->>'sourceStatus', ''), 'current');
  resolved_snapshot_json := coalesce(p_input->'snapshotJson', '{}'::jsonb);
  resolved_source_link_json := coalesce(p_input->'sourceLinkJson', '{}'::jsonb);
  resolved_locked_metadata_json := coalesce(p_input->'lockedMetadataJson', '{}'::jsonb);
  resolved_ucl_validation_status := coalesce(nullif(p_input->>'uclValidationStatus', ''), 'not_reviewed');

  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  if resolved_opportunity_id is null then
    raise exception 'opportunityId is required';
  end if;

  if resolved_source_workbook_id is null then
    raise exception 'sourceWorkbookId is required';
  end if;

  if resolved_source_sheet_id is null then
    raise exception 'sourceSheetId is required';
  end if;

  if resolved_source_range = '' then
    raise exception 'sourceRange is required';
  end if;

  if resolved_source_signature = '' then
    raise exception 'sourceSignature is required';
  end if;

  if not public.has_org_permission(resolved_organization_id, 'leads.opportunities.write') then
    raise exception 'Not authorized to create commercial items for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_opportunities o
    where o.id = resolved_opportunity_id
      and o.organization_id = resolved_organization_id
  ) then
    raise exception 'Opportunity not found for organization';
  end if;

  if resolved_project_id is not null then
    select p.source_opportunity_id
    into resolved_project_source_opportunity_id
    from public.organization_projects p
    where p.id = resolved_project_id
      and p.organization_id = resolved_organization_id;

    if not found then
      raise exception 'Project not found for organization';
    end if;

    if resolved_project_source_opportunity_id is distinct from resolved_opportunity_id then
      raise exception 'Project must belong to the same opportunity';
    end if;
  end if;

  if not exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = resolved_source_workbook_id
      and workbook.organization_id = resolved_organization_id
      and workbook.opportunity_id = resolved_opportunity_id
  ) then
    raise exception 'Workbook not found for organization opportunity';
  end if;

  if not exists (
    select 1
    from public.opportunity_pricing_worksheets worksheet
    where worksheet.id = resolved_source_worksheet_id
      and worksheet.organization_id = resolved_organization_id
      and worksheet.opportunity_id = resolved_opportunity_id
  ) then
    raise exception 'Worksheet not found for organization opportunity';
  end if;

  if not exists (
    select 1
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.id = resolved_source_sheet_id
      and sheet.workbook_id = resolved_source_workbook_id
      and sheet.organization_id = resolved_organization_id
      and sheet.opportunity_id = resolved_opportunity_id
  ) then
    raise exception 'Worksheet page not found for organization opportunity';
  end if;

  if not public.validate_commercial_item_snapshot_json(resolved_snapshot_json) then
    raise exception 'snapshotJson failed commercial item validation';
  end if;

  if not public.validate_commercial_item_source_link_json(resolved_source_link_json) then
    raise exception 'sourceLinkJson failed commercial item validation';
  end if;

  if not public.validate_commercial_item_locked_metadata_json(resolved_locked_metadata_json) then
    raise exception 'lockedMetadataJson failed commercial item validation';
  end if;

  insert into public.commercial_items (
    organization_id,
    opportunity_id,
    project_id,
    source_type,
    source_workbook_id,
    source_worksheet_id,
    source_sheet_id,
    source_range,
    source_signature,
    source_version,
    source_status,
    stale_reason_code,
    last_source_checked_at,
    last_source_changed_at,
    description,
    quantity,
    unit,
    rate,
    total,
    snapshot_json,
    source_link_json,
    locked_metadata_json,
    ucl_classification,
    ucl_validation_status,
    created_by,
    updated_by
  )
  values (
    resolved_organization_id,
    resolved_opportunity_id,
    resolved_project_id,
    coalesce(nullif(p_input->>'sourceType', ''), 'worksheet_selection'),
    resolved_source_workbook_id,
    resolved_source_worksheet_id,
    resolved_source_sheet_id,
    resolved_source_range,
    resolved_source_signature,
    resolved_source_version,
    resolved_source_status,
    nullif(p_input->>'staleReasonCode', ''),
    nullif(p_input->>'lastSourceCheckedAt', '')::timestamptz,
    nullif(p_input->>'lastSourceChangedAt', '')::timestamptz,
    coalesce(p_input->>'description', ''),
    nullif(p_input->>'quantity', '')::numeric,
    nullif(p_input->>'unit', ''),
    nullif(p_input->>'rate', '')::numeric,
    nullif(p_input->>'total', '')::numeric,
    resolved_snapshot_json,
    resolved_source_link_json,
    resolved_locked_metadata_json,
    nullif(p_input->>'uclClassification', ''),
    resolved_ucl_validation_status,
    actor_user_id,
    actor_user_id
  )
  returning * into inserted_row;

  return query
  select
    inserted_row.id,
    inserted_row.organization_id,
    inserted_row.opportunity_id,
    inserted_row.project_id,
    inserted_row.source_type,
    inserted_row.source_workbook_id,
    inserted_row.source_worksheet_id,
    inserted_row.source_sheet_id,
    inserted_row.source_range,
    inserted_row.source_signature,
    inserted_row.source_version,
    inserted_row.source_status,
    inserted_row.stale_reason_code,
    inserted_row.last_source_checked_at,
    inserted_row.last_source_changed_at,
    inserted_row.description,
    inserted_row.quantity,
    inserted_row.unit,
    inserted_row.rate,
    inserted_row.total,
    inserted_row.snapshot_json,
    inserted_row.source_link_json,
    inserted_row.ucl_classification,
    inserted_row.ucl_validation_status,
    inserted_row.created_by,
    inserted_row.updated_by,
    inserted_row.created_at,
    inserted_row.updated_at;
end;
$$;

commit;
