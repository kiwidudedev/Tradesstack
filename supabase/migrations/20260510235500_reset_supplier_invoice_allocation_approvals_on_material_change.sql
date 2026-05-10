begin;

create or replace function public.prepare_supplier_invoice_re_review()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  material_change_detected boolean := false;
  reviewed_allocation_count integer := 0;
begin
  material_change_detected :=
    new.supplier_id is distinct from old.supplier_id
    or new.invoice_date is distinct from old.invoice_date
    or new.due_date is distinct from old.due_date
    or new.subtotal is distinct from old.subtotal
    or new.tax_total is distinct from old.tax_total
    or new.total is distinct from old.total;

  if material_change_detected then
    select count(*)
    into reviewed_allocation_count
    from public.supplier_invoice_purchase_order_matches
    where organization_id = old.organization_id
      and supplier_invoice_id = old.id
      and match_status in ('accepted', 'adjusted')
      and approval_status in ('approved', 'disputed');

    if old.status in ('Approved', 'Disputed') or reviewed_allocation_count > 0 then
      new.status := 'Needs Review';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.reset_supplier_invoice_match_approvals_on_material_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  material_fields text[] := array[]::text[];
  reset_count integer := 0;
begin
  if new.supplier_id is distinct from old.supplier_id then
    material_fields := array_append(material_fields, 'supplier');
  end if;
  if new.invoice_date is distinct from old.invoice_date then
    material_fields := array_append(material_fields, 'invoice_date');
  end if;
  if new.due_date is distinct from old.due_date then
    material_fields := array_append(material_fields, 'due_date');
  end if;
  if new.subtotal is distinct from old.subtotal then
    material_fields := array_append(material_fields, 'subtotal');
  end if;
  if new.tax_total is distinct from old.tax_total then
    material_fields := array_append(material_fields, 'tax_total');
  end if;
  if new.total is distinct from old.total then
    material_fields := array_append(material_fields, 'total');
  end if;

  if array_length(material_fields, 1) is null then
    return new;
  end if;

  update public.supplier_invoice_purchase_order_matches
  set
    approval_status = 'pending',
    approved_by_user_id = null,
    approved_at = null,
    approval_notes = '',
    approval_checks_json = '{}'::jsonb
  where organization_id = new.organization_id
    and supplier_invoice_id = new.id
    and match_status in ('accepted', 'adjusted')
    and approval_status in ('approved', 'disputed');

  get diagnostics reset_count = row_count;

  if reset_count > 0 then
    perform public.record_supplier_invoice_activity_event(
      new.organization_id,
      new.id,
      'allocation_approval_changed',
      'Allocation approvals reset because invoice commercial details changed.',
      jsonb_build_object(
        'changed_fields', material_fields,
        'reset_count', reset_count
      ),
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reset_supplier_invoice_match_approvals_on_material_change
  on public.supplier_invoices;
create trigger reset_supplier_invoice_match_approvals_on_material_change
after update on public.supplier_invoices
for each row execute function public.reset_supplier_invoice_match_approvals_on_material_change();

commit;
