begin;

create or replace function public.enforce_commercial_snapshot_po_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_order_id uuid;
  v_ordered_quantity numeric;
  v_ordered_value numeric;
  v_approved_quantity numeric;
  v_approved_value numeric;
  v_released_value numeric;
begin
  if not exists (
    select 1
    from public.supplier_invoice_line_allocations allocation
    join public.organization_tradesstack_accounting_mappings mapping
      on mapping.id = allocation.accounting_mapping_id
    where allocation.id = new.allocation_id
      and allocation.organization_id = new.organization_id
      and allocation.tradesstack_cost_code is not null
      and mapping.is_active = true
      and mapping.organization_id = new.organization_id
      and mapping.tradesstack_cost_code = allocation.tradesstack_cost_code
      and (mapping.project_id is null or mapping.project_id is not distinct from allocation.project_id)
  ) then
    raise exception 'The allocation routing code and accounting mapping are not consistent.';
  end if;

  if new.purchase_order_line_item_id is null then
    return new;
  end if;

  select purchase_order_id, quantity, total
  into v_purchase_order_id, v_ordered_quantity, v_ordered_value
  from public.project_purchase_order_line_items
  where id = new.purchase_order_line_item_id;

  if not found then
    raise exception 'Purchase order line not found.';
  end if;

  perform 1
  from public.project_purchase_orders
  where id = v_purchase_order_id
  for update;

  select
    coalesce(sum(snapshot.quantity), 0),
    coalesce(sum(snapshot.amount), 0)
  into v_approved_quantity, v_approved_value
  from public.supplier_invoice_commercial_line_snapshots snapshot
  join public.supplier_invoice_commercial_approvals approval
    on approval.id = snapshot.commercial_approval_id
  where snapshot.purchase_order_line_item_id = new.purchase_order_line_item_id
    and approval.status = 'approved';

  select coalesce(sum(released_amount), 0)
  into v_released_value
  from public.purchase_order_commitment_release_lines
  where purchase_order_line_item_id = new.purchase_order_line_item_id;

  if v_approved_quantity + new.quantity > v_ordered_quantity + 0.001 then
    raise exception 'Commercial approval would over-invoice the purchase order line quantity.';
  end if;

  if v_approved_value + v_released_value + new.amount > v_ordered_value + 0.01 then
    raise exception 'Commercial approval would exceed the remaining purchase order line commitment.';
  end if;

  return new;
end;
$$;

commit;
