begin;

create or replace function public.finalize_award_pricing_after_quote_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  final_mapping public.opportunity_final_projects%rowtype;
begin
  if current_setting('tradesstack.defer_award_pricing_finalize', true) = 'on' then
    return new;
  end if;

  select * into final_mapping
  from public.opportunity_final_projects mapping
  where mapping.organization_id = new.organization_id
    and mapping.accepted_quote_id = new.id
    and mapping.project_id = new.project_id;

  if found then
    perform * from public.finalize_opportunity_award_pricing_v1(
      new.organization_id,
      final_mapping.opportunity_id,
      final_mapping.project_id,
      final_mapping.accepted_quote_id
    );
  end if;
  return new;
end;
$$;

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
  opportunity_row public.organization_opportunities%rowtype;
  workspace_row public.organization_projects%rowtype;
  target_row public.organization_projects%rowtype;
  final_mapping public.opportunity_final_projects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  select * into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
    and opportunity.organization_id = p_organization_id
  for key share;
  if not found then
    raise exception 'Opportunity not found for organization' using errcode = 'TS422';
  end if;
  if opportunity_row.workspace_project_id is null then
    raise exception 'Opportunity has no recorded tender workspace' using errcode = 'TS422';
  end if;

  select * into workspace_row
  from public.organization_projects project
  where project.id = opportunity_row.workspace_project_id
    and project.organization_id = p_organization_id;
  if not found or workspace_row.source_opportunity_id is distinct from opportunity_row.id then
    raise exception 'Tender workspace does not belong to the Opportunity' using errcode = 'TS409';
  end if;

  select * into target_row
  from public.organization_projects project
  where project.id = p_project_id
    and project.organization_id = p_organization_id;
  if not found or target_row.source_opportunity_id is distinct from opportunity_row.id then
    raise exception 'Final Project must belong to the same Opportunity' using errcode = 'TS409';
  end if;

  select * into final_mapping
  from public.opportunity_final_projects mapping
  where mapping.organization_id = p_organization_id
    and mapping.opportunity_id = p_opportunity_id
    and mapping.project_id = p_project_id;
  if not found then
    raise exception 'Target Project is not the designated final Project' using errcode = 'TS409';
  end if;

  if exists (
    select 1 from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and quote.project_id is not null
      and quote.project_id not in (workspace_row.id, target_row.id)
  ) then
    raise exception 'Commercial quote history is attached to an unrelated Project' using errcode = 'TS409';
  end if;
  if exists (
    select 1
    from public.project_quote_line_items line
    join public.project_quotes quote
      on quote.id = line.quote_id and quote.organization_id = line.organization_id
    where line.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and line.project_id is not null
      and line.project_id not in (workspace_row.id, target_row.id)
  ) then
    raise exception 'Commercial quote line history is attached to an unrelated Project' using errcode = 'TS409';
  end if;
  if exists (
    select 1 from public.commercial_items item
    where item.organization_id = p_organization_id
      and item.opportunity_id = p_opportunity_id
      and item.project_id is not null
      and item.project_id not in (workspace_row.id, target_row.id)
  ) then
    raise exception 'Commercial items are attached to an unrelated Project' using errcode = 'TS409';
  end if;
  if exists (
    select 1
    from public.cost_items cost_item
    join public.project_quotes quote
      on quote.id = cost_item.source_document_id
     and cost_item.source_document_kind = 'project_quote'
     and quote.organization_id = cost_item.organization_id
    where cost_item.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and cost_item.project_id not in (workspace_row.id, target_row.id)
  ) then
    raise exception 'Commercial CostItems are attached to an unrelated Project' using errcode = 'TS409';
  end if;

  perform set_config('tradesstack.defer_award_pricing_finalize', 'on', true);

  with updated_quotes as (
    update public.project_quotes quote
    set project_id = target_row.id
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and (quote.project_id is null or quote.project_id = workspace_row.id)
    returning quote.id
  )
  select count(*)::integer into attached_quote_count from updated_quotes;

  with updated_lines as (
    update public.project_quote_line_items line
    set project_id = target_row.id
    from public.project_quotes quote
    where line.organization_id = p_organization_id
      and line.quote_id = quote.id
      and quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and (line.project_id is null or line.project_id = workspace_row.id)
    returning line.id
  )
  select count(*)::integer into attached_quote_line_count from updated_lines;

  update public.commercial_items item
  set project_id = target_row.id,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where item.organization_id = p_organization_id
    and item.opportunity_id = p_opportunity_id
    and (item.project_id is null or item.project_id = workspace_row.id);
  get diagnostics attached_commercial_item_count = row_count;

  update public.cost_items cost_item
  set project_id = target_row.id,
      updated_at = timezone('utc', now())
  from public.project_quotes quote
  where quote.id = cost_item.source_document_id
    and cost_item.source_document_kind = 'project_quote'
    and quote.organization_id = cost_item.organization_id
    and cost_item.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
    and cost_item.project_id = workspace_row.id;

  perform set_config('tradesstack.defer_award_pricing_finalize', 'off', true);
  perform * from public.finalize_opportunity_award_pricing_v1(
    p_organization_id,
    p_opportunity_id,
    p_project_id,
    final_mapping.accepted_quote_id
  );

  return query select
    coalesce(attached_quote_count, 0),
    coalesce(attached_quote_line_count, 0),
    coalesce(attached_commercial_item_count, 0);
end;
$$;

revoke all on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid)
from public, anon;
grant execute on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid)
to authenticated;

commit;
