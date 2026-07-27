create or replace function public.commercial_item_json_object_has_only_keys(
  p_object jsonb,
  p_allowed_keys text[]
)
returns boolean
language sql
immutable
as $$
  select coalesce(
    not exists (
      select 1
      from jsonb_object_keys(coalesce(p_object, '{}'::jsonb)) as key_name
      where not (key_name = any (p_allowed_keys))
    ),
    true
  );
$$;

create or replace function public.commercial_item_json_object_has_required_keys(
  p_object jsonb,
  p_required_keys text[]
)
returns boolean
language sql
immutable
as $$
  select coalesce(
    not exists (
      select 1
      from unnest(p_required_keys) as required_key
      where not (coalesce(p_object, '{}'::jsonb) ? required_key)
    ),
    true
  );
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

  if p_snapshot->>'version' <> '1' then
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

    if not public.commercial_item_json_object_has_only_keys(
      snapshot_column,
      array['id', 'index', 'label']
    ) then
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

    if not public.commercial_item_json_object_has_only_keys(
      snapshot_row,
      array['id', 'index']
    ) then
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
    ) then
      return false;
    end if;

    if snapshot_cell ? 'formula' or snapshot_cell ? 'metadata' then
      return false;
    end if;

    if jsonb_typeof(coalesce(snapshot_cell->'format', '{}'::jsonb)) <> 'object' then
      return false;
    end if;

    if not public.commercial_item_json_object_has_only_keys(
      coalesce(snapshot_cell->'format', '{}'::jsonb),
      array['numberKind', 'textAlign', 'textWrapMode']
    ) then
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
  ) then
    return false;
  end if;

  if not public.commercial_item_json_object_has_required_keys(
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

  if p_source_link->>'version' <> '1' then
    return false;
  end if;

  if p_source_link->>'sourceType' <> 'worksheet_selection' then
    return false;
  end if;

  if p_source_link ? 'formula'
    or p_source_link ? 'metadata'
    or p_source_link ? 'worksheetMetadata'
    or p_source_link ? 'cells' then
    return false;
  end if;

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
  ) then
    return false;
  end if;

  if not public.commercial_item_json_object_has_required_keys(
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

  if p_locked_metadata->>'version' <> '1' then
    return false;
  end if;

  if jsonb_typeof(p_locked_metadata->'worksheetMetadata') <> 'object'
    or jsonb_typeof(p_locked_metadata->'cells') <> 'array' then
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
    ) then
      return false;
    end if;

    if jsonb_typeof(coalesce(locked_cell->'metadata', '{}'::jsonb)) <> 'object' then
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
begin
  select o.workspace_project_id
  into opportunity_workspace_project_id
  from public.organization_opportunities o
  where o.id = new.opportunity_id
    and o.organization_id = new.organization_id;

  if not found then
    raise exception 'Opportunity not found for organization';
  end if;

  if new.project_id is not null
    and (
      opportunity_workspace_project_id is null
      or new.project_id <> opportunity_workspace_project_id
    ) then
    raise exception 'Commercial item project_id must match the opportunity workspace project';
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

drop trigger if exists validate_commercial_items_before_write on public.commercial_items;
create trigger validate_commercial_items_before_write
before insert or update on public.commercial_items
for each row execute function public.validate_commercial_item_record();

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

create or replace function public.validate_commercial_item_document_link_record()
returns trigger
language plpgsql
as $$
begin
  if not public.can_insert_commercial_item_document_link(
    new.organization_id,
    new.commercial_item_id,
    new.document_kind,
    new.document_id,
    new.document_line_id,
    new.link_role
  ) then
    raise exception 'Commercial item document link failed scope validation';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_commercial_item_document_links_before_write on public.commercial_item_document_links;
create trigger validate_commercial_item_document_links_before_write
before insert or update on public.commercial_item_document_links
for each row execute function public.validate_commercial_item_document_link_record();

create unique index if not exists commercial_item_document_links_unique_quote_line_source_idx
  on public.commercial_item_document_links (organization_id, document_kind, document_line_id)
  where document_kind = 'quote_line'
    and link_role = 'source';

create unique index if not exists commercial_item_document_links_unique_purchase_order_line_source_idx
  on public.commercial_item_document_links (organization_id, document_kind, document_line_id)
  where document_kind = 'purchase_order_line'
    and link_role = 'source';

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
    where o.id = commercial_items.opportunity_id
      and o.organization_id = commercial_items.organization_id
      and (
        commercial_items.project_id is null
        or (
          o.workspace_project_id is not null
          and o.workspace_project_id = commercial_items.project_id
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
    where o.id = commercial_items.opportunity_id
      and o.organization_id = commercial_items.organization_id
      and (
        commercial_items.project_id is null
        or (
          o.workspace_project_id is not null
          and o.workspace_project_id = commercial_items.project_id
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

drop policy if exists "Members can create commercial item document links" on public.commercial_item_document_links;
create policy "Members can create commercial item document links"
on public.commercial_item_document_links
for insert
to authenticated
with check (
  commercial_item_document_links.created_by = auth.uid()
  and public.is_member_of_organization(commercial_item_document_links.organization_id)
  and (
    (
      commercial_item_document_links.document_kind = 'quote_line'
      and public.has_org_permission(commercial_item_document_links.organization_id, 'quotes.write')
    )
    or (
      commercial_item_document_links.document_kind = 'purchase_order_line'
      and public.has_org_permission(commercial_item_document_links.organization_id, 'purchase_orders.write')
    )
  )
  and public.can_insert_commercial_item_document_link(
    commercial_item_document_links.organization_id,
    commercial_item_document_links.commercial_item_id,
    commercial_item_document_links.document_kind,
    commercial_item_document_links.document_id,
    commercial_item_document_links.document_line_id,
    commercial_item_document_links.link_role
  )
);

drop function if exists public.get_commercial_item(uuid);
create or replace function public.get_commercial_item(p_commercial_item_id uuid)
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
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  return query
  select
    item.id,
    item.organization_id,
    item.opportunity_id,
    item.project_id,
    item.source_type,
    item.source_workbook_id,
    item.source_worksheet_id,
    item.source_sheet_id,
    item.source_range,
    item.source_signature,
    item.source_version,
    item.source_status,
    item.stale_reason_code,
    item.last_source_checked_at,
    item.last_source_changed_at,
    item.description,
    item.quantity,
    item.unit,
    item.rate,
    item.total,
    item.snapshot_json,
    item.source_link_json,
    item.ucl_classification,
    item.ucl_validation_status,
    item.created_by,
    item.updated_by,
    item.created_at,
    item.updated_at
  from public.commercial_items item
  where item.id = p_commercial_item_id
    and public.is_member_of_organization(item.organization_id);
end;
$$;

drop function if exists public.list_commercial_items_for_opportunity(uuid, uuid);
create or replace function public.list_commercial_items_for_opportunity(
  p_organization_id uuid,
  p_opportunity_id uuid
)
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
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  return query
  select
    item.id,
    item.organization_id,
    item.opportunity_id,
    item.project_id,
    item.source_type,
    item.source_workbook_id,
    item.source_worksheet_id,
    item.source_sheet_id,
    item.source_range,
    item.source_signature,
    item.source_version,
    item.source_status,
    item.stale_reason_code,
    item.last_source_checked_at,
    item.last_source_changed_at,
    item.description,
    item.quantity,
    item.unit,
    item.rate,
    item.total,
    item.snapshot_json,
    item.source_link_json,
    item.ucl_classification,
    item.ucl_validation_status,
    item.created_by,
    item.updated_by,
    item.created_at,
    item.updated_at
  from public.commercial_items item
  where item.organization_id = p_organization_id
    and item.opportunity_id = p_opportunity_id
  order by item.created_at desc;
end;
$$;

create or replace function public.get_commercial_item_locked_metadata_internal(p_commercial_item_id uuid)
returns table (
  commercial_item_id uuid,
  locked_metadata_json jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  return query
  select
    item.id,
    item.locked_metadata_json
  from public.commercial_items item
  where item.id = p_commercial_item_id
    and public.has_org_permission(item.organization_id, 'leads.opportunities.write');
end;
$$;

drop function if exists public.create_commercial_item(jsonb);
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

  if resolved_project_id is not null
    and (
      resolved_opportunity_workspace_project_id is null
      or resolved_project_id <> resolved_opportunity_workspace_project_id
    ) then
    raise exception 'Project must match the opportunity workspace project';
  end if;

  if resolved_project_id is not null and not exists (
    select 1
    from public.organization_projects p
    where p.id = resolved_project_id
      and p.organization_id = resolved_organization_id
  ) then
    raise exception 'Project not found for organization';
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

create or replace function public.link_commercial_item_to_quote_line(p_input jsonb)
returns table (
  id uuid,
  organization_id uuid,
  commercial_item_id uuid,
  document_kind text,
  document_id uuid,
  document_line_id uuid,
  link_role text,
  snapshot_at_link_json jsonb,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  inserted_row public.commercial_item_document_links%rowtype;
  resolved_organization_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  resolved_commercial_item_id uuid := nullif(p_input->>'commercialItemId', '')::uuid;
  resolved_quote_id uuid := nullif(p_input->>'quoteId', '')::uuid;
  resolved_quote_line_id uuid := nullif(p_input->>'quoteLineId', '')::uuid;
  resolved_link_role text := coalesce(nullif(p_input->>'linkRole', ''), 'source');
  resolved_snapshot_json jsonb := coalesce(p_input->'snapshotAtLinkJson', '{}'::jsonb);
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if resolved_organization_id is null or resolved_commercial_item_id is null or resolved_quote_id is null or resolved_quote_line_id is null then
    raise exception 'organizationId, commercialItemId, quoteId, and quoteLineId are required';
  end if;

  if not public.has_org_permission(resolved_organization_id, 'quotes.write') then
    raise exception 'Not authorized to link commercial items to quote lines';
  end if;

  if not public.can_insert_commercial_item_document_link(
    resolved_organization_id,
    resolved_commercial_item_id,
    'quote_line',
    resolved_quote_id,
    resolved_quote_line_id,
    resolved_link_role
  ) then
    raise exception 'Quote line must match the commercial item organization, project, and opportunity scope';
  end if;

  if resolved_link_role = 'source' and exists (
    select 1
    from public.commercial_item_document_links existing_link
    where existing_link.organization_id = resolved_organization_id
      and existing_link.document_kind = 'quote_line'
      and existing_link.document_line_id = resolved_quote_line_id
      and existing_link.link_role = 'source'
      and existing_link.commercial_item_id <> resolved_commercial_item_id
  ) then
    raise exception 'Quote line already has a source commercial item';
  end if;

  insert into public.commercial_item_document_links (
    organization_id,
    commercial_item_id,
    document_kind,
    document_id,
    document_line_id,
    link_role,
    snapshot_at_link_json,
    created_by
  )
  values (
    resolved_organization_id,
    resolved_commercial_item_id,
    'quote_line',
    resolved_quote_id,
    resolved_quote_line_id,
    resolved_link_role,
    resolved_snapshot_json,
    actor_user_id
  )
  on conflict (commercial_item_id, document_kind, document_line_id)
  do update set
    snapshot_at_link_json = excluded.snapshot_at_link_json,
    link_role = excluded.link_role
  returning * into inserted_row;

  return query
  select
    inserted_row.id,
    inserted_row.organization_id,
    inserted_row.commercial_item_id,
    inserted_row.document_kind,
    inserted_row.document_id,
    inserted_row.document_line_id,
    inserted_row.link_role,
    inserted_row.snapshot_at_link_json,
    inserted_row.created_by,
    inserted_row.created_at;
end;
$$;

create or replace function public.link_commercial_item_to_purchase_order_line(p_input jsonb)
returns table (
  id uuid,
  organization_id uuid,
  commercial_item_id uuid,
  document_kind text,
  document_id uuid,
  document_line_id uuid,
  link_role text,
  snapshot_at_link_json jsonb,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  inserted_row public.commercial_item_document_links%rowtype;
  resolved_organization_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  resolved_commercial_item_id uuid := nullif(p_input->>'commercialItemId', '')::uuid;
  resolved_purchase_order_id uuid := nullif(p_input->>'purchaseOrderId', '')::uuid;
  resolved_purchase_order_line_id uuid := nullif(p_input->>'purchaseOrderLineId', '')::uuid;
  resolved_link_role text := coalesce(nullif(p_input->>'linkRole', ''), 'source');
  resolved_snapshot_json jsonb := coalesce(p_input->'snapshotAtLinkJson', '{}'::jsonb);
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if resolved_organization_id is null or resolved_commercial_item_id is null or resolved_purchase_order_id is null or resolved_purchase_order_line_id is null then
    raise exception 'organizationId, commercialItemId, purchaseOrderId, and purchaseOrderLineId are required';
  end if;

  if not public.has_org_permission(resolved_organization_id, 'purchase_orders.write') then
    raise exception 'Not authorized to link commercial items to purchase order lines';
  end if;

  if not public.can_insert_commercial_item_document_link(
    resolved_organization_id,
    resolved_commercial_item_id,
    'purchase_order_line',
    resolved_purchase_order_id,
    resolved_purchase_order_line_id,
    resolved_link_role
  ) then
    raise exception 'Purchase order line must match the commercial item organization and project scope';
  end if;

  if resolved_link_role = 'source' and exists (
    select 1
    from public.commercial_item_document_links existing_link
    where existing_link.organization_id = resolved_organization_id
      and existing_link.document_kind = 'purchase_order_line'
      and existing_link.document_line_id = resolved_purchase_order_line_id
      and existing_link.link_role = 'source'
      and existing_link.commercial_item_id <> resolved_commercial_item_id
  ) then
    raise exception 'Purchase order line already has a source commercial item';
  end if;

  insert into public.commercial_item_document_links (
    organization_id,
    commercial_item_id,
    document_kind,
    document_id,
    document_line_id,
    link_role,
    snapshot_at_link_json,
    created_by
  )
  values (
    resolved_organization_id,
    resolved_commercial_item_id,
    'purchase_order_line',
    resolved_purchase_order_id,
    resolved_purchase_order_line_id,
    resolved_link_role,
    resolved_snapshot_json,
    actor_user_id
  )
  on conflict (commercial_item_id, document_kind, document_line_id)
  do update set
    snapshot_at_link_json = excluded.snapshot_at_link_json,
    link_role = excluded.link_role
  returning * into inserted_row;

  return query
  select
    inserted_row.id,
    inserted_row.organization_id,
    inserted_row.commercial_item_id,
    inserted_row.document_kind,
    inserted_row.document_id,
    inserted_row.document_line_id,
    inserted_row.link_role,
    inserted_row.snapshot_at_link_json,
    inserted_row.created_by,
    inserted_row.created_at;
end;
$$;

grant execute on function public.get_commercial_item(uuid) to authenticated;
grant execute on function public.list_commercial_items_for_opportunity(uuid, uuid) to authenticated;
grant execute on function public.create_commercial_item(jsonb) to authenticated;
grant execute on function public.link_commercial_item_to_quote_line(jsonb) to authenticated;
grant execute on function public.link_commercial_item_to_purchase_order_line(jsonb) to authenticated;
