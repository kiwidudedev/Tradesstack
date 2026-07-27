begin;

do $migration$
declare
  v_definition text;
  v_partial_quantity_gate text := $gate$  if exists (
    select 1
    from public.supplier_invoice_line_allocations current_a
    join public.project_purchase_order_line_items po_line
      on po_line.id = current_a.purchase_order_line_item_id
    left join lateral (
      select coalesce(sum(snapshot.quantity), 0) as approved_quantity
      from public.supplier_invoice_commercial_line_snapshots snapshot
      join public.supplier_invoice_commercial_approvals approval
        on approval.id = snapshot.commercial_approval_id
      where snapshot.purchase_order_line_item_id = current_a.purchase_order_line_item_id
        and snapshot.supplier_invoice_id <> v_invoice.id
        and approval.status = 'approved'
    ) history on true
    where current_a.supplier_invoice_id = v_invoice.id
      and coalesce(current_a.allocated_quantity, 0) > 0
      and coalesce(current_a.allocated_quantity, 0)
        < po_line.quantity - history.approved_quantity - 0.001
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
        where accepted ->> 'type' = 'quantity_variance'
          and accepted ->> 'purchaseOrderLineItemId' = po_line.id::text
          and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
      )
  ) then
    raise exception 'Accept and explain every partial quantity variance before commercial approval.';
  end if;

$gate$;
begin
  select pg_get_functiondef(
    'private.approve_supplier_invoice_commercially_phase_ab_legacy(uuid,uuid,text,jsonb,text,text,text)'::regprocedure
  ) into v_definition;

  if position(v_partial_quantity_gate in v_definition) = 0 then
    raise exception 'Unable to locate the obsolete partial-quantity approval gate.';
  end if;

  execute replace(v_definition, v_partial_quantity_gate, '');
end;
$migration$;

commit;
