create or replace function public.commercial_item_json_is_non_negative_integer_like(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when p_value is null then false
    when jsonb_typeof(p_value) = 'number' then p_value::text ~ '^\d+$'
    when jsonb_typeof(p_value) = 'string' then btrim(trim(both '"' from p_value::text)) ~ '^\d+$'
    else false
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
  )
    or not public.commercial_item_json_object_has_required_keys(
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
    or not public.commercial_item_json_is_non_negative_integer_like(p_snapshot->'rowCount')
    or not public.commercial_item_json_is_non_negative_integer_like(p_snapshot->'columnCount')
    or not public.commercial_item_json_is_non_negative_integer_like(p_snapshot->'cellCount')
    or not public.commercial_item_json_is_non_negative_integer_like(p_snapshot->'nonEmptyCellCount') then
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
      or not public.commercial_item_json_is_non_negative_integer_like(snapshot_column->'index') then
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
      or not public.commercial_item_json_is_non_negative_integer_like(snapshot_row->'index') then
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
      or not public.commercial_item_json_is_non_negative_integer_like(snapshot_cell->'rowIndex')
      or not public.commercial_item_json_value_is_type(snapshot_cell->'columnId', array['string'])
      or not public.commercial_item_json_is_non_negative_integer_like(snapshot_cell->'columnIndex')
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
    or not public.commercial_item_json_is_non_negative_integer_like(p_source_link->'rowCount')
    or not public.commercial_item_json_is_non_negative_integer_like(p_source_link->'columnCount')
    or not public.commercial_item_json_is_non_negative_integer_like(p_source_link->'cellCount')
    or not public.commercial_item_json_is_non_negative_integer_like(p_source_link->'worksheetVersion') then
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
    or not public.commercial_item_json_is_non_negative_integer_like(p_locked_metadata->'worksheetVersion')
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
      or not public.commercial_item_json_is_non_negative_integer_like(locked_cell->'rowIndex')
      or not public.commercial_item_json_value_is_type(locked_cell->'columnId', array['string'])
      or not public.commercial_item_json_is_non_negative_integer_like(locked_cell->'columnIndex')
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

  update public.commercial_item_document_links as existing_link
  set
    snapshot_at_link_json = resolved_snapshot_json,
    link_role = resolved_link_role
  where existing_link.organization_id = resolved_organization_id
    and existing_link.commercial_item_id = resolved_commercial_item_id
    and existing_link.document_kind = 'quote_line'
    and existing_link.document_id = resolved_quote_id
    and existing_link.document_line_id = resolved_quote_line_id
  returning existing_link.* into inserted_row;

  if not found then
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
    returning * into inserted_row;
  end if;

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

  update public.commercial_item_document_links as existing_link
  set
    snapshot_at_link_json = resolved_snapshot_json,
    link_role = resolved_link_role
  where existing_link.organization_id = resolved_organization_id
    and existing_link.commercial_item_id = resolved_commercial_item_id
    and existing_link.document_kind = 'purchase_order_line'
    and existing_link.document_id = resolved_purchase_order_id
    and existing_link.document_line_id = resolved_purchase_order_line_id
  returning existing_link.* into inserted_row;

  if not found then
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
    returning * into inserted_row;
  end if;

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
