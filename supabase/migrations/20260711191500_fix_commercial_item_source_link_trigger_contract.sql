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
