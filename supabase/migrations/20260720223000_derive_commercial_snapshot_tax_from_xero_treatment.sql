create or replace function public.derive_supplier_invoice_commercial_snapshot_tax()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tax_resolution_status text;
  v_effective_rate numeric;
begin
  select
    allocation.tax_resolution_status,
    tax_rate.effective_rate
  into
    v_tax_resolution_status,
    v_effective_rate
  from public.supplier_invoice_line_allocations allocation
  left join public.organization_accounting_tax_rates tax_rate
    on tax_rate.id = allocation.accounting_tax_rate_id
    and tax_rate.organization_id = allocation.organization_id
    and tax_rate.is_active = true
  where allocation.id = new.allocation_id
    and allocation.organization_id = new.organization_id
    and allocation.supplier_invoice_id = new.supplier_invoice_id;

  if not found then
    raise exception 'The commercial snapshot allocation could not be resolved.';
  end if;

  if v_tax_resolution_status = 'not_applicable' then
    new.tax_amount := 0;
  elsif v_tax_resolution_status = 'resolved' and v_effective_rate is not null then
    new.tax_amount := round(new.amount * v_effective_rate / 100, 2);
  else
    raise exception 'The commercial snapshot requires a resolved Xero tax treatment.';
  end if;

  return new;
end;
$$;

revoke all on function public.derive_supplier_invoice_commercial_snapshot_tax() from public;
revoke all on function public.derive_supplier_invoice_commercial_snapshot_tax() from anon;
revoke all on function public.derive_supplier_invoice_commercial_snapshot_tax() from authenticated;
grant execute on function public.derive_supplier_invoice_commercial_snapshot_tax() to service_role;

drop trigger if exists derive_supplier_invoice_commercial_snapshot_tax_before_insert
  on public.supplier_invoice_commercial_line_snapshots;
create trigger derive_supplier_invoice_commercial_snapshot_tax_before_insert
before insert on public.supplier_invoice_commercial_line_snapshots
for each row
execute function public.derive_supplier_invoice_commercial_snapshot_tax();
