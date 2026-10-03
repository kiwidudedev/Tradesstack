begin;

-- Project and quote-owned pricing worksheets are canonical worksheet sources too.
-- Keep the source-link payload strict, but accept every worksheet owner represented
-- by lib/pricing-worksheet-owner.ts.
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
      'version', 'sourceType', 'ownerType', 'opportunityId', 'opportunitySlug',
      'projectId', 'projectSlug', 'quoteId', 'variationId', 'worksheetId',
      'workbookId', 'sheetId', 'worksheetName', 'sheetName', 'range',
      'rowCount', 'columnCount', 'cellCount', 'worksheetVersion', 'capturedAt'
    ]
  )
    or not public.commercial_item_json_object_has_required_keys(
      p_source_link,
      array[
        'version', 'sourceType', 'worksheetId', 'workbookId', 'sheetId',
        'worksheetName', 'sheetName', 'range', 'rowCount', 'columnCount',
        'cellCount', 'worksheetVersion', 'capturedAt'
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

  if coalesce(p_source_link->>'ownerType', '') not in ('', 'opportunity', 'project', 'quote', 'variation') then
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

commit;
