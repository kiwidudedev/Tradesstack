begin;

create or replace function public.invalidate_commercial_approval_from_accounting_mapping_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mapping_id uuid := coalesce(new.id, old.id);
  v_invoice_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.is_active is not distinct from old.is_active
    and new.organization_cost_code_id is not distinct from old.organization_cost_code_id
    and new.project_id is not distinct from old.project_id
    and new.provider is not distinct from old.provider
    and new.tradesstack_cost_code is not distinct from old.tradesstack_cost_code then
    return new;
  end if;

  for v_invoice_id in
    select distinct allocation.supplier_invoice_id
    from public.supplier_invoice_line_allocations allocation
    where allocation.accounting_mapping_id = v_mapping_id
  loop
    perform public.invalidate_supplier_invoice_commercial_approval(
      v_invoice_id,
      'Accounting mapping changed.',
      'accounting_mapping',
      auth.uid()
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_commercial_approval_from_accounting_mapping_change
  on public.organization_tradesstack_accounting_mappings;
create trigger invalidate_commercial_approval_from_accounting_mapping_change
after update or delete on public.organization_tradesstack_accounting_mappings
for each row execute function public.invalidate_commercial_approval_from_accounting_mapping_change();

create or replace function public.invalidate_commercial_approval_from_tax_mapping_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tax_rate_id uuid := coalesce(new.id, old.id);
  v_invoice_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.is_active is not distinct from old.is_active
    and new.tax_type is not distinct from old.tax_type
    and new.effective_rate is not distinct from old.effective_rate then
    return new;
  end if;

  for v_invoice_id in
    select distinct allocation.supplier_invoice_id
    from public.supplier_invoice_line_allocations allocation
    where allocation.accounting_tax_rate_id = v_tax_rate_id
  loop
    perform public.invalidate_supplier_invoice_commercial_approval(
      v_invoice_id,
      'Tax treatment changed.',
      'accounting_tax_rate',
      auth.uid()
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_commercial_approval_from_tax_mapping_change
  on public.organization_accounting_tax_rates;
create trigger invalidate_commercial_approval_from_tax_mapping_change
after update or delete on public.organization_accounting_tax_rates
for each row execute function public.invalidate_commercial_approval_from_tax_mapping_change();

commit;
