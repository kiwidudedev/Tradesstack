-- Keep current Cost Item accounting snapshots aligned with the canonical
-- organization/provider Financial Routing mappings.

create or replace function public.resolve_default_tradesstack_accounting_mapping(
  p_organization_id uuid,
  p_tradesstack_cost_code integer,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_mapping_id uuid := null;
  provider_count integer := 0;
begin
  -- An exact project override wins before organization-level mappings are
  -- considered. A scope with multiple providers is intentionally ambiguous.
  if p_project_id is not null then
    select count(distinct mapping.provider)
    into provider_count
    from public.organization_tradesstack_accounting_mappings mapping
    join public.organization_cost_codes cost_code
      on cost_code.id = mapping.organization_cost_code_id
     and cost_code.organization_id = mapping.organization_id
     and cost_code.is_active
     and cost_code.external_provider = mapping.provider
    where mapping.organization_id = p_organization_id
      and mapping.tradesstack_cost_code = p_tradesstack_cost_code
      and mapping.project_id = p_project_id
      and mapping.is_active;

    if provider_count = 1 then
      select mapping.id
      into resolved_mapping_id
      from public.organization_tradesstack_accounting_mappings mapping
      join public.organization_cost_codes cost_code
        on cost_code.id = mapping.organization_cost_code_id
       and cost_code.organization_id = mapping.organization_id
       and cost_code.is_active
       and cost_code.external_provider = mapping.provider
      where mapping.organization_id = p_organization_id
        and mapping.tradesstack_cost_code = p_tradesstack_cost_code
        and mapping.project_id = p_project_id
        and mapping.is_active
      order by mapping.updated_at desc, mapping.id desc
      limit 1;

      return resolved_mapping_id;
    elsif provider_count > 1 then
      return null;
    end if;
  end if;

  select count(distinct mapping.provider)
  into provider_count
  from public.organization_tradesstack_accounting_mappings mapping
  join public.organization_cost_codes cost_code
    on cost_code.id = mapping.organization_cost_code_id
   and cost_code.organization_id = mapping.organization_id
   and cost_code.is_active
   and cost_code.external_provider = mapping.provider
  where mapping.organization_id = p_organization_id
    and mapping.tradesstack_cost_code = p_tradesstack_cost_code
    and mapping.project_id is null
    and mapping.is_active;

  if provider_count = 1 then
    select mapping.id
    into resolved_mapping_id
    from public.organization_tradesstack_accounting_mappings mapping
    join public.organization_cost_codes cost_code
      on cost_code.id = mapping.organization_cost_code_id
     and cost_code.organization_id = mapping.organization_id
     and cost_code.is_active
     and cost_code.external_provider = mapping.provider
    where mapping.organization_id = p_organization_id
      and mapping.tradesstack_cost_code = p_tradesstack_cost_code
      and mapping.project_id is null
      and mapping.is_active
    order by mapping.updated_at desc, mapping.id desc
    limit 1;
  end if;

  return resolved_mapping_id;
end;
$$;

create or replace function public.reconcile_current_cost_item_accounting_mappings(
  p_organization_id uuid,
  p_tradesstack_cost_code integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_reconciled integer := 0;
begin
  if p_organization_id is null then
    raise exception 'Organization is required for Cost Item accounting reconciliation.';
  end if;

  with resolved as (
    select
      cost_item.id,
      public.resolve_default_tradesstack_accounting_mapping(
        cost_item.organization_id,
        cost_item.tradesstack_cost_code,
        cost_item.project_id
      ) as accounting_mapping_id
    from public.cost_items cost_item
    where cost_item.organization_id = p_organization_id
      and cost_item.is_current
      and cost_item.status not in ('deleted', 'superseded')
      and cost_item.tradesstack_cost_code is not null
      and (
        p_tradesstack_cost_code is null
        or cost_item.tradesstack_cost_code = p_tradesstack_cost_code
      )
  )
  update public.cost_items cost_item
  set
    accounting_mapping_id = resolved.accounting_mapping_id,
    review_status = case
      when cost_item.review_status in ('needs_routing_review', 'high_value_review')
        then cost_item.review_status
      when resolved.accounting_mapping_id is null
        then 'needs_accounting_mapping'
      when cost_item.review_status = 'needs_accounting_mapping'
        then 'auto_approved'
      else coalesce(cost_item.review_status, 'auto_approved')
    end,
    review_reason = case
      when cost_item.review_status in ('needs_routing_review', 'high_value_review')
        then cost_item.review_reason
      when resolved.accounting_mapping_id is null
        then 'Missing accounting mapping for TradesStack routing code.'
      when cost_item.review_status = 'needs_accounting_mapping'
        then null
      else cost_item.review_reason
    end
  from resolved
  where cost_item.id = resolved.id
    and (
      cost_item.accounting_mapping_id is distinct from resolved.accounting_mapping_id
      or cost_item.review_status is distinct from case
        when cost_item.review_status in ('needs_routing_review', 'high_value_review')
          then cost_item.review_status
        when resolved.accounting_mapping_id is null
          then 'needs_accounting_mapping'
        when cost_item.review_status = 'needs_accounting_mapping'
          then 'auto_approved'
        else coalesce(cost_item.review_status, 'auto_approved')
      end
      or cost_item.review_reason is distinct from case
        when cost_item.review_status in ('needs_routing_review', 'high_value_review')
          then cost_item.review_reason
        when resolved.accounting_mapping_id is null
          then 'Missing accounting mapping for TradesStack routing code.'
        when cost_item.review_status = 'needs_accounting_mapping'
          then null
        else cost_item.review_reason
      end
    );

  get diagnostics rows_reconciled = row_count;
  return rows_reconciled;
end;
$$;

create or replace function public.reconcile_cost_items_after_accounting_mapping_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.reconcile_current_cost_item_accounting_mappings(
      old.organization_id,
      old.tradesstack_cost_code
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and (
      tg_op = 'INSERT'
      or new.organization_id is distinct from old.organization_id
      or new.tradesstack_cost_code is distinct from old.tradesstack_cost_code
      or new.provider is distinct from old.provider
      or new.project_id is distinct from old.project_id
      or new.organization_cost_code_id is distinct from old.organization_cost_code_id
      or new.is_active is distinct from old.is_active
    ) then
    perform public.reconcile_current_cost_item_accounting_mappings(
      new.organization_id,
      new.tradesstack_cost_code
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_cost_items_after_accounting_mapping_change
  on public.organization_tradesstack_accounting_mappings;
create trigger reconcile_cost_items_after_accounting_mapping_change
after insert or update or delete
on public.organization_tradesstack_accounting_mappings
for each row
execute function public.reconcile_cost_items_after_accounting_mapping_change();

-- Repair existing current Cost Items for every organization and all eight
-- canonical routing codes without changing routing, lineage, or amounts.
do $$
declare
  scope record;
begin
  for scope in
    select distinct cost_item.organization_id, cost_item.tradesstack_cost_code
    from public.cost_items cost_item
    where cost_item.is_current
      and cost_item.status not in ('deleted', 'superseded')
      and cost_item.tradesstack_cost_code is not null
  loop
    perform public.reconcile_current_cost_item_accounting_mappings(
      scope.organization_id,
      scope.tradesstack_cost_code
    );
  end loop;
end;
$$;

revoke all on function public.reconcile_current_cost_item_accounting_mappings(uuid, integer)
  from public, anon, authenticated;
