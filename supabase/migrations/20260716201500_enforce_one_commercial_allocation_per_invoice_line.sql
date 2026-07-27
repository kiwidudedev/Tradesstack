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

  return new;
end;
$$;

drop trigger if exists enforce_commercial_approval_allocation_shape
on public.supplier_invoice_commercial_approvals;

create trigger enforce_commercial_approval_allocation_shape
before insert on public.supplier_invoice_commercial_approvals
for each row execute function public.enforce_commercial_approval_allocation_shape();

commit;
