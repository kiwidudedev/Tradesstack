create or replace function public.commercial_item_json_value_is_type(
  p_value jsonb,
  p_allowed_types text[]
)
returns boolean
language sql
immutable
as $$
  select case
    when p_value is null then false
    else jsonb_typeof(p_value) = any (p_allowed_types)
  end;
$$;

create or replace function public.commercial_item_json_text_matches_regex(
  p_value jsonb,
  p_pattern text
)
returns boolean
language sql
immutable
as $$
  select case
    when jsonb_typeof(p_value) <> 'string' then false
    else btrim(trim(both '"' from p_value::text)) ~ p_pattern
  end;
$$;

create or replace function public.validate_commercial_item_snapshot_json(p_snapshot jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  snapshot_cell jsonb;
  snapshot_column jsonb;
  snapshot_row jsonb;
begin
  if jsonb_typeof(p_snapshot) <> 'object' then
    return false;
  end if;

  if not public.commercial_item_json_object_has_only_keys(
    p_snapshot,
    array[
      'version',
      'sheetName',
      'rangeLabel',
      'rowCount',
      'columnCount',
      'cellCount',
      'nonEmptyCellCount',
      'columns',
      'rows',
      'cells'
    ]
  ) then
    return false;
  end if;

  if not public.commercial_item_json_object_has_required_keys(
    p_snapshot,
    array[
      'version',
      'sheetName',
      'rangeLabel',
      'rowCount',
      'columnCount',
      'cellCount',
      'nonEmptyCellCount',
      'columns',
      'rows',
      'cells'
    ]
  ) then
    return false;
  end if;

  if p_snapshot->>'version' <> '1'
    or not public.commercial_item_json_value_is_type(p_snapshot->'sheetName', array['string'])
    or not public.commercial_item_json_value_is_type(p_snapshot->'rangeLabel', array['string'])
    or not public.commercial_item_json_text_matches_regex(p_snapshot->'rowCount', '^\d+$')
    or not public.commercial_item_json_text_matches_regex(p_snapshot->'columnCount', '^\d+$')
    or not public.commercial_item_json_text_matches_regex(p_snapshot->'cellCount', '^\d+$')
    or not public.commercial_item_json_text_matches_regex(p_snapshot->'nonEmptyCellCount', '^\d+$') then
    return false;
  end if;

  if btrim(coalesce(p_snapshot->>'sheetName', '')) = ''
    or btrim(coalesce(p_snapshot->>'rangeLabel', '')) = '' then
    return false;
  end if;

  if jsonb_typeof(p_snapshot->'columns') <> 'array'
    or jsonb_typeof(p_snapshot->'rows') <> 'array'
    or jsonb_typeof(p_snapshot->'cells') <> 'array' then
    return false;
  end if;

  for snapshot_column in
    select value
    from jsonb_array_elements(p_snapshot->'columns')
  loop
    if jsonb_typeof(snapshot_column) <> 'object' then
      return false;
    end if;

    if not public.commercial_item_json_object_has_only_keys(snapshot_column, array['id', 'index', 'label'])
      or not public.commercial_item_json_object_has_required_keys(snapshot_column, array['id', 'index', 'label'])
      or not public.commercial_item_json_value_is_type(snapshot_column->'id', array['string'])
      or not public.commercial_item_json_value_is_type(snapshot_column->'label', array['string'])
      or not public.commercial_item_json_text_matches_regex(snapshot_column->'index', '^\d+$') then
      return false;
    end if;
  end loop;

  for snapshot_row in
    select value
    from jsonb_array_elements(p_snapshot->'rows')
  loop
    if jsonb_typeof(snapshot_row) <> 'object' then
      return false;
    end if;

    if not public.commercial_item_json_object_has_only_keys(snapshot_row, array['id', 'index'])
      or not public.commercial_item_json_object_has_required_keys(snapshot_row, array['id', 'index'])
      or not public.commercial_item_json_value_is_type(snapshot_row->'id', array['string'])
      or not public.commercial_item_json_text_matches_regex(snapshot_row->'index', '^\d+$') then
      return false;
    end if;
  end loop;

  for snapshot_cell in
    select value
    from jsonb_array_elements(p_snapshot->'cells')
  loop
    if jsonb_typeof(snapshot_cell) <> 'object' then
      return false;
    end if;

    if not public.commercial_item_json_object_has_only_keys(
      snapshot_cell,
      array[
        'cellKey',
        'rowId',
        'rowIndex',
        'columnId',
        'columnIndex',
        'type',
        'value',
        'computedValue',
        'displayValue',
        'format'
      ]
    )
      or not public.commercial_item_json_object_has_required_keys(
        snapshot_cell,
        array[
          'cellKey',
          'rowId',
          'rowIndex',
          'columnId',
          'columnIndex',
          'type',
          'value',
          'computedValue',
          'displayValue',
          'format'
        ]
      ) then
      return false;
    end if;

    if snapshot_cell ? 'formula' or snapshot_cell ? 'metadata' then
      return false;
    end if;

    if not public.commercial_item_json_value_is_type(snapshot_cell->'cellKey', array['string'])
      or not public.commercial_item_json_value_is_type(snapshot_cell->'rowId', array['string'])
      or not public.commercial_item_json_text_matches_regex(snapshot_cell->'rowIndex', '^\d+$')
      or not public.commercial_item_json_value_is_type(snapshot_cell->'columnId', array['string'])
      or not public.commercial_item_json_text_matches_regex(snapshot_cell->'columnIndex', '^\d+$')
      or not public.commercial_item_json_value_is_type(snapshot_cell->'type', array['string'])
      or not public.commercial_item_json_value_is_type(snapshot_cell->'value', array['string', 'number', 'null'])
      or not public.commercial_item_json_value_is_type(snapshot_cell->'computedValue', array['string', 'number', 'null'])
      or not public.commercial_item_json_value_is_type(snapshot_cell->'displayValue', array['string'])
      or jsonb_typeof(coalesce(snapshot_cell->'format', '{}'::jsonb)) <> 'object' then
      return false;
    end if;

    if not public.commercial_item_json_object_has_only_keys(
      coalesce(snapshot_cell->'format', '{}'::jsonb),
      array['numberKind', 'textAlign', 'textWrapMode']
    )
      or not public.commercial_item_json_object_has_required_keys(
        coalesce(snapshot_cell->'format', '{}'::jsonb),
        array['numberKind', 'textAlign', 'textWrapMode']
      )
      or not public.commercial_item_json_value_is_type(snapshot_cell->'format'->'numberKind', array['string', 'null'])
      or not public.commercial_item_json_value_is_type(snapshot_cell->'format'->'textAlign', array['string', 'null'])
      or not public.commercial_item_json_value_is_type(snapshot_cell->'format'->'textWrapMode', array['string', 'null']) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.validate_commercial_item_source_link_json(p_source_link jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(p_source_link) <> 'object' then
    return false;
  end if;

  if not public.commercial_item_json_object_has_only_keys(
    p_source_link,
    array[
      'version',
      'sourceType',
      'worksheetId',
      'workbookId',
      'sheetId',
      'worksheetName',
      'sheetName',
      'range',
      'rowCount',
      'columnCount',
      'cellCount',
      'worksheetVersion',
      'capturedAt'
    ]
  )
    or not public.commercial_item_json_object_has_required_keys(
      p_source_link,
      array[
        'version',
        'sourceType',
        'worksheetId',
        'workbookId',
        'sheetId',
        'worksheetName',
        'sheetName',
        'range',
        'rowCount',
        'columnCount',
        'cellCount',
        'worksheetVersion',
        'capturedAt'
      ]
    ) then
    return false;
  end if;

  if p_source_link->>'version' <> '1'
    or p_source_link->>'sourceType' <> 'worksheet_selection'
    or not public.commercial_item_json_value_is_type(p_source_link->'worksheetId', array['string'])
    or not public.commercial_item_json_value_is_type(p_source_link->'workbookId', array['string'])
    or not public.commercial_item_json_value_is_type(p_source_link->'sheetId', array['string'])
    or not public.commercial_item_json_value_is_type(p_source_link->'worksheetName', array['string'])
    or not public.commercial_item_json_value_is_type(p_source_link->'sheetName', array['string'])
    or not public.commercial_item_json_value_is_type(p_source_link->'range', array['string'])
    or not public.commercial_item_json_text_matches_regex(p_source_link->'rowCount', '^\d+$')
    or not public.commercial_item_json_text_matches_regex(p_source_link->'columnCount', '^\d+$')
    or not public.commercial_item_json_text_matches_regex(p_source_link->'cellCount', '^\d+$')
    or not public.commercial_item_json_text_matches_regex(p_source_link->'worksheetVersion', '^\d+$') then
    return false;
  end if;

  if btrim(coalesce(p_source_link->>'worksheetName', '')) = ''
    or btrim(coalesce(p_source_link->>'sheetName', '')) = ''
    or btrim(coalesce(p_source_link->>'range', '')) = '' then
    return false;
  end if;

  if p_source_link ? 'formula'
    or p_source_link ? 'metadata'
    or p_source_link ? 'worksheetMetadata'
    or p_source_link ? 'cells' then
    return false;
  end if;

  begin
    perform (p_source_link->>'capturedAt')::timestamptz;
  exception
    when others then
      return false;
  end;

  return true;
end;
$$;

create or replace function public.validate_commercial_item_locked_metadata_json(p_locked_metadata jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  locked_cell jsonb;
begin
  if jsonb_typeof(p_locked_metadata) <> 'object' then
    return false;
  end if;

  if not public.commercial_item_json_object_has_only_keys(
    p_locked_metadata,
    array[
      'version',
      'worksheetVersion',
      'sheetName',
      'rangeLabel',
      'worksheetMetadata',
      'cells'
    ]
  )
    or not public.commercial_item_json_object_has_required_keys(
      p_locked_metadata,
      array[
        'version',
        'worksheetVersion',
        'sheetName',
        'rangeLabel',
        'worksheetMetadata',
        'cells'
      ]
    ) then
    return false;
  end if;

  if p_locked_metadata->>'version' <> '1'
    or not public.commercial_item_json_text_matches_regex(p_locked_metadata->'worksheetVersion', '^\d+$')
    or not public.commercial_item_json_value_is_type(p_locked_metadata->'sheetName', array['string'])
    or not public.commercial_item_json_value_is_type(p_locked_metadata->'rangeLabel', array['string'])
    or jsonb_typeof(p_locked_metadata->'worksheetMetadata') <> 'object'
    or jsonb_typeof(p_locked_metadata->'cells') <> 'array' then
    return false;
  end if;

  if btrim(coalesce(p_locked_metadata->>'sheetName', '')) = ''
    or btrim(coalesce(p_locked_metadata->>'rangeLabel', '')) = '' then
    return false;
  end if;

  for locked_cell in
    select value
    from jsonb_array_elements(p_locked_metadata->'cells')
  loop
    if jsonb_typeof(locked_cell) <> 'object' then
      return false;
    end if;

    if not public.commercial_item_json_object_has_only_keys(
      locked_cell,
      array[
        'cellKey',
        'rowId',
        'rowIndex',
        'columnId',
        'columnIndex',
        'formula',
        'value',
        'computedValue',
        'displayValue',
        'metadata'
      ]
    )
      or not public.commercial_item_json_object_has_required_keys(
        locked_cell,
        array[
          'cellKey',
          'rowId',
          'rowIndex',
          'columnId',
          'columnIndex',
          'formula',
          'value',
          'computedValue',
          'displayValue',
          'metadata'
        ]
      )
      or not public.commercial_item_json_value_is_type(locked_cell->'cellKey', array['string'])
      or not public.commercial_item_json_value_is_type(locked_cell->'rowId', array['string'])
      or not public.commercial_item_json_text_matches_regex(locked_cell->'rowIndex', '^\d+$')
      or not public.commercial_item_json_value_is_type(locked_cell->'columnId', array['string'])
      or not public.commercial_item_json_text_matches_regex(locked_cell->'columnIndex', '^\d+$')
      or not public.commercial_item_json_value_is_type(locked_cell->'formula', array['string', 'null'])
      or not public.commercial_item_json_value_is_type(locked_cell->'value', array['string', 'number', 'null'])
      or not public.commercial_item_json_value_is_type(locked_cell->'computedValue', array['string', 'number', 'null'])
      or not public.commercial_item_json_value_is_type(locked_cell->'displayValue', array['string'])
      or jsonb_typeof(coalesce(locked_cell->'metadata', '{}'::jsonb)) <> 'object' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.validate_commercial_item_record()
returns trigger
language plpgsql
as $$
declare
  opportunity_workspace_project_id uuid;
  linked_project_source_opportunity_id uuid;
begin
  select o.workspace_project_id
  into opportunity_workspace_project_id
  from public.organization_opportunities o
  where o.id = new.opportunity_id
    and o.organization_id = new.organization_id;

  if not found then
    raise exception 'Opportunity not found for organization';
  end if;

  if new.project_id is not null then
    select p.source_opportunity_id
    into linked_project_source_opportunity_id
    from public.organization_projects p
    where p.id = new.project_id
      and p.organization_id = new.organization_id;

    if not found then
      raise exception 'Project not found for organization';
    end if;

    if opportunity_workspace_project_id is null
      or new.project_id <> opportunity_workspace_project_id then
      raise exception 'Commercial item project_id must match the opportunity workspace project';
    end if;

    if linked_project_source_opportunity_id is distinct from new.opportunity_id then
      raise exception 'Commercial item project_id must belong to the same opportunity';
    end if;
  end if;

  if not public.validate_commercial_item_snapshot_json(new.snapshot_json) then
    raise exception 'snapshot_json failed commercial item validation';
  end if;

  if not public.validate_commercial_item_source_link_json(new.source_link_json) then
    raise exception 'source_link_json failed commercial item validation';
  end if;

  if not public.validate_commercial_item_locked_metadata_json(new.locked_metadata_json) then
    raise exception 'locked_metadata_json failed commercial item validation';
  end if;

  if coalesce(new.source_link_json->>'workbookId', '') <> new.source_workbook_id::text then
    raise exception 'source_link_json workbookId must match source_workbook_id';
  end if;

  if coalesce(new.source_link_json->>'worksheetId', '') <> new.source_worksheet_id::text then
    raise exception 'source_link_json worksheetId must match source_worksheet_id';
  end if;

  if coalesce(new.source_link_json->>'sheetId', '') <> new.source_sheet_id::text then
    raise exception 'source_link_json sheetId must match source_sheet_id';
  end if;

  if coalesce(new.source_link_json->>'range', '') <> new.source_range then
    raise exception 'source_link_json range must match source_range';
  end if;

  if coalesce(nullif(new.source_link_json->>'worksheetVersion', ''), '0')::integer <> new.source_version then
    raise exception 'source_link_json worksheetVersion must match source_version';
  end if;

  if coalesce(new.snapshot_json->>'rangeLabel', '') <> new.source_range then
    raise exception 'snapshot_json rangeLabel must match source_range';
  end if;

  if coalesce(new.locked_metadata_json->>'rangeLabel', '') <> new.source_range then
    raise exception 'locked_metadata_json rangeLabel must match source_range';
  end if;

  if coalesce(nullif(new.locked_metadata_json->>'worksheetVersion', ''), '0')::integer <> new.source_version then
    raise exception 'locked_metadata_json worksheetVersion must match source_version';
  end if;

  return new;
end;
$$;

create or replace function public.can_insert_commercial_item_document_link(
  p_organization_id uuid,
  p_commercial_item_id uuid,
  p_document_kind text,
  p_document_id uuid,
  p_document_line_id uuid,
  p_link_role text
)
returns boolean
language sql
stable
as $$
  select case
    when p_document_kind = 'quote_line' then exists (
      select 1
      from public.commercial_items item
      join public.organization_opportunities opportunity
        on opportunity.id = item.opportunity_id
       and opportunity.organization_id = item.organization_id
      join public.organization_projects project
        on project.id = item.project_id
       and project.organization_id = item.organization_id
      join public.project_quote_line_items line
        on line.id = p_document_line_id
       and line.quote_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_quotes quote
        on quote.id = line.quote_id
       and quote.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and item.project_id is not null
        and item.project_id = line.project_id
        and item.project_id = quote.project_id
        and opportunity.workspace_project_id = item.project_id
        and project.source_opportunity_id = item.opportunity_id
        and quote.source_opportunity_id = item.opportunity_id
        and (
          p_link_role <> 'source'
          or not exists (
            select 1
            from public.commercial_item_document_links existing_link
            where existing_link.organization_id = p_organization_id
              and existing_link.document_kind = 'quote_line'
              and existing_link.document_line_id = p_document_line_id
              and existing_link.link_role = 'source'
              and existing_link.commercial_item_id <> p_commercial_item_id
          )
        )
    )
    when p_document_kind = 'purchase_order_line' then exists (
      select 1
      from public.commercial_items item
      join public.organization_opportunities opportunity
        on opportunity.id = item.opportunity_id
       and opportunity.organization_id = item.organization_id
      join public.organization_projects project
        on project.id = item.project_id
       and project.organization_id = item.organization_id
      join public.project_purchase_order_line_items line
        on line.id = p_document_line_id
       and line.purchase_order_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_purchase_orders purchase_order
        on purchase_order.id = line.purchase_order_id
       and purchase_order.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and item.project_id is not null
        and item.project_id = line.project_id
        and item.project_id = purchase_order.project_id
        and opportunity.workspace_project_id = item.project_id
        and project.source_opportunity_id = item.opportunity_id
        and (
          p_link_role <> 'source'
          or not exists (
            select 1
            from public.commercial_item_document_links existing_link
            where existing_link.organization_id = p_organization_id
              and existing_link.document_kind = 'purchase_order_line'
              and existing_link.document_line_id = p_document_line_id
              and existing_link.link_role = 'source'
              and existing_link.commercial_item_id <> p_commercial_item_id
          )
        )
    )
    else false
  end;
$$;

drop policy if exists "Privileged members can create commercial items" on public.commercial_items;
create policy "Privileged members can create commercial items"
on public.commercial_items
for insert
to authenticated
with check (
  commercial_items.created_by = auth.uid()
  and commercial_items.updated_by = auth.uid()
  and public.has_org_permission(commercial_items.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.organization_opportunities o
    left join public.organization_projects p
      on p.id = commercial_items.project_id
     and p.organization_id = commercial_items.organization_id
    where o.id = commercial_items.opportunity_id
      and o.organization_id = commercial_items.organization_id
      and (
        commercial_items.project_id is null
        or (
          o.workspace_project_id is not null
          and o.workspace_project_id = commercial_items.project_id
          and p.source_opportunity_id = commercial_items.opportunity_id
        )
      )
  )
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = commercial_items.source_workbook_id
      and workbook.organization_id = commercial_items.organization_id
      and workbook.opportunity_id = commercial_items.opportunity_id
  )
  and exists (
    select 1
    from public.opportunity_pricing_worksheets worksheet
    where worksheet.id = commercial_items.source_worksheet_id
      and worksheet.organization_id = commercial_items.organization_id
      and worksheet.opportunity_id = commercial_items.opportunity_id
  )
  and exists (
    select 1
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.id = commercial_items.source_sheet_id
      and sheet.organization_id = commercial_items.organization_id
      and sheet.opportunity_id = commercial_items.opportunity_id
      and sheet.workbook_id = commercial_items.source_workbook_id
  )
);

drop policy if exists "Privileged members can update commercial items" on public.commercial_items;
create policy "Privileged members can update commercial items"
on public.commercial_items
for update
to authenticated
using (
  public.has_org_permission(commercial_items.organization_id, 'leads.opportunities.write')
)
with check (
  commercial_items.updated_by = auth.uid()
  and public.has_org_permission(commercial_items.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.organization_opportunities o
    left join public.organization_projects p
      on p.id = commercial_items.project_id
     and p.organization_id = commercial_items.organization_id
    where o.id = commercial_items.opportunity_id
      and o.organization_id = commercial_items.organization_id
      and (
        commercial_items.project_id is null
        or (
          o.workspace_project_id is not null
          and o.workspace_project_id = commercial_items.project_id
          and p.source_opportunity_id = commercial_items.opportunity_id
        )
      )
  )
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = commercial_items.source_workbook_id
      and workbook.organization_id = commercial_items.organization_id
      and workbook.opportunity_id = commercial_items.opportunity_id
  )
  and exists (
    select 1
    from public.opportunity_pricing_worksheets worksheet
    where worksheet.id = commercial_items.source_worksheet_id
      and worksheet.organization_id = commercial_items.organization_id
      and worksheet.opportunity_id = commercial_items.opportunity_id
  )
  and exists (
    select 1
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.id = commercial_items.source_sheet_id
      and sheet.organization_id = commercial_items.organization_id
      and sheet.opportunity_id = commercial_items.opportunity_id
      and sheet.workbook_id = commercial_items.source_workbook_id
  )
);

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
  resolved_opportunity_workspace_project_id uuid;
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

  select o.workspace_project_id
  into resolved_opportunity_workspace_project_id
  from public.organization_opportunities o
  where o.id = resolved_opportunity_id
    and o.organization_id = resolved_organization_id;

  if not found then
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

    if resolved_opportunity_workspace_project_id is null
      or resolved_project_id <> resolved_opportunity_workspace_project_id then
      raise exception 'Project must match the opportunity workspace project';
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
      and sheet.organization_id = resolved_organization_id
      and sheet.opportunity_id = resolved_opportunity_id
      and sheet.workbook_id = resolved_source_workbook_id
  ) then
    raise exception 'Sheet not found for workbook';
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

revoke select on public.commercial_items from authenticated;
grant select (
  id,
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
  ucl_classification,
  ucl_validation_status,
  created_by,
  updated_by,
  created_at,
  updated_at
) on public.commercial_items to authenticated;

revoke execute on function public.get_commercial_item_locked_metadata_internal(uuid) from public;
revoke execute on function public.get_commercial_item_locked_metadata_internal(uuid) from anon;
revoke execute on function public.get_commercial_item_locked_metadata_internal(uuid) from authenticated;
