begin;

create or replace function public.enforce_commercial_approval_allocation_shape()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'approved' then
    return new;
  end if;

  if exists (
    select 1
    from public.supplier_invoice_lines line
    left join public.supplier_invoice_line_allocations allocation
      on allocation.supplier_invoice_id = line.supplier_invoice_id
      and allocation.supplier_invoice_line_id = line.id
    where line.supplier_invoice_id = new.supplier_invoice_id
    group by line.id
    having count(allocation.id) <> 1
  ) then
    raise exception 'Every invoice line must have exactly one active allocation.';
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations allocation
    join public.supplier_invoice_lines invoice_line
      on invoice_line.id = allocation.supplier_invoice_line_id
    join public.project_purchase_order_line_items po_line
      on po_line.id = allocation.purchase_order_line_item_id
    where allocation.supplier_invoice_id = new.supplier_invoice_id
      and lower(regexp_replace(
        regexp_replace(trim(invoice_line.description), '\s*\(\s*remaining\s+balance\s*\)\s*$', '', 'i'),
        '\s+', ' ', 'g'
      )) <> lower(regexp_replace(
        regexp_replace(trim(po_line.description), '\s*\(\s*remaining\s+balance\s*\)\s*$', '', 'i'),
        '\s+', ' ', 'g'
      ))
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(new.accepted_variances, '[]'::jsonb)) accepted
        where accepted ->> 'type' = 'unexpected_line'
          and accepted ->> 'purchaseOrderLineItemId' = po_line.id::text
          and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
      )
  ) then
    raise exception 'Accept and explain every invoice and purchase order line description variance.';
  end if;

  return new;
end;
$$;

commit;
