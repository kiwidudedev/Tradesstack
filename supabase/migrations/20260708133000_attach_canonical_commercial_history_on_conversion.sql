create or replace function public.validate_commercial_item_record()
returns trigger
language plpgsql
as $$
declare
  linked_project_source_opportunity_id uuid;
begin
  if not exists (
    select 1
    from public.organization_opportunities o
    where o.id = new.opportunity_id
      and o.organization_id = new.organization_id
  ) then
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
        or p.source_opportunity_id = commercial_items.opportunity_id
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
        or p.source_opportunity_id = commercial_items.opportunity_id
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

create or replace function public.attach_opportunity_commercial_history_to_project(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid
)
returns table (
  attached_quote_count integer,
  attached_quote_line_count integer,
  attached_commercial_item_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_project_source_opportunity_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    or public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_opportunities opportunity
    where opportunity.id = p_opportunity_id
      and opportunity.organization_id = p_organization_id
  ) then
    raise exception 'Opportunity not found for organization';
  end if;

  select project.source_opportunity_id
  into resolved_project_source_opportunity_id
  from public.organization_projects project
  where project.id = p_project_id
    and project.organization_id = p_organization_id;

  if not found then
    raise exception 'Project not found for organization';
  end if;

  if resolved_project_source_opportunity_id is distinct from p_opportunity_id then
    raise exception 'Project must belong to the same originating opportunity';
  end if;

  if exists (
    select 1
    from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and quote.project_id is not null
      and quote.project_id <> p_project_id
  ) then
    raise exception 'Commercial quote history is already attached to a different project';
  end if;

  if exists (
    select 1
    from public.project_quote_line_items line
    join public.project_quotes quote
      on quote.id = line.quote_id
     and quote.organization_id = line.organization_id
    where line.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and line.project_id is not null
      and line.project_id <> p_project_id
  ) then
    raise exception 'Commercial quote line history is already attached to a different project';
  end if;

  if exists (
    select 1
    from public.commercial_items item
    where item.organization_id = p_organization_id
      and item.opportunity_id = p_opportunity_id
      and item.project_id is not null
      and item.project_id <> p_project_id
  ) then
    raise exception 'Commercial items are already attached to a different project';
  end if;

  with updated_quotes as (
    update public.project_quotes quote
    set project_id = p_project_id
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and quote.project_id is null
    returning quote.id
  )
  select count(*)::integer
  into attached_quote_count
  from updated_quotes;

  with updated_lines as (
    update public.project_quote_line_items line
    set project_id = p_project_id
    from public.project_quotes quote
    where line.organization_id = p_organization_id
      and line.quote_id = quote.id
      and quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and line.project_id is null
    returning line.id
  )
  select count(*)::integer
  into attached_quote_line_count
  from updated_lines;

  with updated_items as (
    update public.commercial_items item
    set project_id = p_project_id,
        updated_at = timezone('utc', now()),
        updated_by = auth.uid()
    where item.organization_id = p_organization_id
      and item.opportunity_id = p_opportunity_id
      and item.project_id is null
    returning item.id
  )
  select count(*)::integer
  into attached_commercial_item_count
  from updated_items;

  return query
  select
    coalesce(attached_quote_count, 0),
    coalesce(attached_quote_line_count, 0),
    coalesce(attached_commercial_item_count, 0);
end;
$$;

revoke execute on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid) from public;
revoke execute on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid) from anon;
grant execute on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid) to authenticated;
