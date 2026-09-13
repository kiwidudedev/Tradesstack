begin;

create or replace function public.commercial_item_json_is_uuid_string(p_value jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(p_value) <> 'string'
    or btrim(coalesce(p_value #>> '{}', '')) = '' then
    return false;
  end if;

  perform (p_value #>> '{}')::uuid;
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.commercial_item_json_is_timestamp_string(p_value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  parsed_timestamp timestamptz;
begin
  if jsonb_typeof(p_value) <> 'string'
    or btrim(coalesce(p_value #>> '{}', '')) = '' then
    return false;
  end if;

  parsed_timestamp := (p_value #>> '{}')::timestamptz;
  return isfinite(parsed_timestamp);
exception
  when others then
    return false;
end;
$$;

create or replace function public.commercial_item_json_is_non_negative_number(p_value jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(p_value) <> 'number' then
    return false;
  end if;

  return (p_value #>> '{}')::numeric >= 0;
exception
  when others then
    return false;
end;
$$;

create or replace function public.commercial_item_json_is_positive_integer(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'number'
      and (p_value #>> '{}') ~ '^[1-9][0-9]*$',
    false
  );
$$;

create or replace function public.validate_takeoff_commercial_item_snapshot_json(p_snapshot jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  commercial_quantity numeric;
  commercial_rate numeric;
  commercial_total numeric;
begin
  if jsonb_typeof(p_snapshot) <> 'object' then
    return false;
  end if;

  if not public.commercial_item_json_object_has_only_keys(
    p_snapshot,
    array[
      'version',
      'sourceType',
      'measurementId',
      'measurementVersion',
      'measurementUpdatedAt',
      'measurementKind',
      'drawingSetId',
      'pageId',
      'measurementName',
      'measurementDescription',
      'displayQuantity',
      'displayUnit',
      'commercialDescription',
      'commercialQuantity',
      'commercialRate',
      'commercialTotal'
    ]
  )
    or not public.commercial_item_json_object_has_required_keys(
      p_snapshot,
      array[
        'version',
        'sourceType',
        'measurementId',
        'measurementVersion',
        'measurementUpdatedAt',
        'measurementKind',
        'drawingSetId',
        'pageId',
        'measurementName',
        'measurementDescription',
        'displayQuantity',
        'displayUnit',
        'commercialDescription',
        'commercialQuantity',
        'commercialRate',
        'commercialTotal'
      ]
    ) then
    return false;
  end if;

  if jsonb_typeof(p_snapshot->'version') <> 'number'
    or p_snapshot->>'version' <> '1'
    or p_snapshot->>'sourceType' <> 'takeoff_measurement'
    or not public.commercial_item_json_is_uuid_string(p_snapshot->'measurementId')
    or not public.commercial_item_json_is_positive_integer(p_snapshot->'measurementVersion')
    or not public.commercial_item_json_is_timestamp_string(p_snapshot->'measurementUpdatedAt')
    or coalesce(p_snapshot->>'measurementKind', '') not in ('line', 'area', 'count')
    or not public.commercial_item_json_is_uuid_string(p_snapshot->'drawingSetId')
    or not public.commercial_item_json_is_uuid_string(p_snapshot->'pageId')
    or not public.commercial_item_json_value_is_type(p_snapshot->'measurementName', array['string'])
    or not public.commercial_item_json_value_is_type(p_snapshot->'measurementDescription', array['string'])
    or not public.commercial_item_json_is_non_negative_number(p_snapshot->'displayQuantity')
    or not public.commercial_item_json_value_is_type(p_snapshot->'displayUnit', array['string'])
    or not public.commercial_item_json_value_is_type(p_snapshot->'commercialDescription', array['string'])
    or not public.commercial_item_json_is_non_negative_number(p_snapshot->'commercialQuantity')
    or not public.commercial_item_json_is_non_negative_number(p_snapshot->'commercialRate')
    or not public.commercial_item_json_is_non_negative_number(p_snapshot->'commercialTotal') then
    return false;
  end if;

  if btrim(coalesce(p_snapshot->>'measurementName', '')) = ''
    or btrim(coalesce(p_snapshot->>'displayUnit', '')) = ''
    or btrim(coalesce(p_snapshot->>'commercialDescription', '')) = '' then
    return false;
  end if;

  commercial_quantity := (p_snapshot->>'commercialQuantity')::numeric;
  commercial_rate := (p_snapshot->>'commercialRate')::numeric;
  commercial_total := (p_snapshot->>'commercialTotal')::numeric;

  if (p_snapshot->>'displayQuantity')::numeric <> commercial_quantity
    or round(commercial_quantity * commercial_rate, 2) <> commercial_total then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
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
  if p_snapshot->>'sourceType' = 'takeoff_measurement' then
    return public.validate_takeoff_commercial_item_snapshot_json(p_snapshot);
  end if;

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

create or replace function public.validate_takeoff_commercial_item_source_link_json(p_source_link jsonb)
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
      'sourceType',
      'measurementId',
      'measurementVersion',
      'drawingSetId',
      'measurementUpdatedAt',
      'pageId',
      'ownerType',
      'ownerSlug',
      'opportunityId',
      'projectId',
      'dataProjectId',
      'capturedAt'
    ]
  )
    or not public.commercial_item_json_object_has_required_keys(
      p_source_link,
      array[
        'sourceType',
        'measurementId',
        'measurementVersion',
        'drawingSetId',
        'measurementUpdatedAt',
        'pageId',
        'ownerType',
        'ownerSlug',
        'opportunityId',
        'projectId',
        'dataProjectId',
        'capturedAt'
      ]
    ) then
    return false;
  end if;

  if p_source_link->>'sourceType' <> 'takeoff_measurement'
    or not public.commercial_item_json_is_uuid_string(p_source_link->'measurementId')
    or not public.commercial_item_json_is_positive_integer(p_source_link->'measurementVersion')
    or not public.commercial_item_json_is_uuid_string(p_source_link->'drawingSetId')
    or not public.commercial_item_json_is_timestamp_string(p_source_link->'measurementUpdatedAt')
    or not public.commercial_item_json_is_uuid_string(p_source_link->'pageId')
    or coalesce(p_source_link->>'ownerType', '') not in ('opportunity', 'project')
    or not public.commercial_item_json_value_is_type(p_source_link->'ownerSlug', array['string'])
    or not public.commercial_item_json_is_uuid_string(p_source_link->'opportunityId')
    or not public.commercial_item_json_value_is_type(p_source_link->'projectId', array['string', 'null'])
    or not public.commercial_item_json_is_uuid_string(p_source_link->'dataProjectId')
    or not public.commercial_item_json_is_timestamp_string(p_source_link->'capturedAt') then
    return false;
  end if;

  if btrim(coalesce(p_source_link->>'ownerSlug', '')) = '' then
    return false;
  end if;

  if p_source_link->>'ownerType' = 'opportunity'
    and jsonb_typeof(p_source_link->'projectId') <> 'null' then
    return false;
  end if;

  if p_source_link->>'ownerType' = 'project'
    and not public.commercial_item_json_is_uuid_string(p_source_link->'projectId') then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.validate_commercial_item_source_link_json(p_source_link jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_source_link->>'sourceType' = 'takeoff_measurement' then
    return public.validate_takeoff_commercial_item_source_link_json(p_source_link);
  end if;

  if jsonb_typeof(p_source_link) <> 'object' then
    return false;
  end if;

  if not public.commercial_item_json_object_has_only_keys(
    p_source_link,
    array[
      'version',
      'sourceType',
      'ownerType',
      'opportunityId',
      'opportunitySlug',
      'projectId',
      'projectSlug',
      'quoteId',
      'variationId',
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
    or not public.commercial_item_json_value_is_type(p_source_link->'ownerType', array['string', 'null'])
    or not public.commercial_item_json_value_is_type(p_source_link->'opportunityId', array['string', 'null'])
    or not public.commercial_item_json_value_is_type(p_source_link->'opportunitySlug', array['string', 'null'])
    or not public.commercial_item_json_value_is_type(p_source_link->'projectId', array['string', 'null'])
    or not public.commercial_item_json_value_is_type(p_source_link->'projectSlug', array['string', 'null'])
    or not public.commercial_item_json_value_is_type(p_source_link->'quoteId', array['string', 'null'])
    or not public.commercial_item_json_value_is_type(p_source_link->'variationId', array['string', 'null'])
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

  if coalesce(p_source_link->>'ownerType', '') not in ('', 'opportunity', 'variation') then
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

create or replace function public.validate_takeoff_commercial_item_locked_metadata_json(p_locked_metadata jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(p_locked_metadata = '{}'::jsonb, false);
$$;

create or replace function public.validate_commercial_item_record()
returns trigger
language plpgsql
as $$
declare
  linked_project_source_opportunity_id uuid;
begin
  if new.project_id is not null then
    select p.source_opportunity_id
    into linked_project_source_opportunity_id
    from public.organization_projects p
    where p.id = new.project_id
      and p.organization_id = new.organization_id;

    if not found then
      raise exception 'Project not found for organization';
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

  if new.source_type = 'worksheet_selection' then
    if not public.validate_commercial_item_locked_metadata_json(new.locked_metadata_json) then
      raise exception 'locked_metadata_json failed commercial item validation';
    end if;

    if new.source_takeoff_measurement_id is not null then
      raise exception 'Worksheet commercial items cannot contain Takeoff source identity';
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
  elsif new.source_type = 'takeoff_measurement' then
    if not public.validate_takeoff_commercial_item_locked_metadata_json(new.locked_metadata_json) then
      raise exception 'locked_metadata_json failed Takeoff commercial item validation';
    end if;

    if new.source_takeoff_measurement_id is null
      or new.source_workbook_id is not null
      or new.source_worksheet_id is not null
      or new.source_sheet_id is not null
      or new.source_range is not null then
      raise exception 'Takeoff commercial items must contain only Takeoff source identity';
    end if;

    if new.snapshot_json->>'sourceType' <> new.source_type
      or new.source_link_json->>'sourceType' <> new.source_type then
      raise exception 'Takeoff JSON sourceType must match source_type';
    end if;

    if (new.snapshot_json->>'measurementId')::uuid <> new.source_takeoff_measurement_id
      or (new.source_link_json->>'measurementId')::uuid <> new.source_takeoff_measurement_id then
      raise exception 'Takeoff measurementId must match source_takeoff_measurement_id';
    end if;

    if (new.snapshot_json->>'measurementVersion')::integer <> new.source_version
      or (new.source_link_json->>'measurementVersion')::integer <> new.source_version then
      raise exception 'Takeoff measurementVersion must match source_version';
    end if;

    if (new.snapshot_json->>'drawingSetId')::uuid <> (new.source_link_json->>'drawingSetId')::uuid
      or (new.snapshot_json->>'pageId')::uuid <> (new.source_link_json->>'pageId')::uuid
      or (new.snapshot_json->>'measurementUpdatedAt')::timestamptz
        <> (new.source_link_json->>'measurementUpdatedAt')::timestamptz then
      raise exception 'Takeoff snapshot and source link provenance must match';
    end if;

    if (new.source_link_json->>'opportunityId')::uuid <> new.opportunity_id then
      raise exception 'Takeoff source link opportunityId must match opportunity_id';
    end if;

    if new.project_id is null then
      if new.source_link_json->>'ownerType' <> 'opportunity'
        or jsonb_typeof(new.source_link_json->'projectId') <> 'null' then
        raise exception 'Opportunity Takeoff source link must not contain project identity';
      end if;
    elsif new.source_link_json->>'ownerType' <> 'project'
      or (new.source_link_json->>'projectId')::uuid <> new.project_id then
      raise exception 'Project Takeoff source link must match project_id';
    end if;
  else
    raise exception 'Unsupported commercial item source_type';
  end if;

  return new;
end;
$$;

commit;
