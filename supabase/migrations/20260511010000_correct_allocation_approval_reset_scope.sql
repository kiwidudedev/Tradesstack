begin;

create or replace function public.reset_supplier_invoice_match_approvals_on_material_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  return new;
end;
$$;

drop trigger if exists reset_supplier_invoice_match_approvals_on_material_change
  on public.supplier_invoices;

create or replace function public.reset_supplier_invoice_match_approvals_for_purchase_order_change(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_changed_fields text[] default array[]::text[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  return;
end;
$$;

drop trigger if exists handle_material_purchase_order_change
  on public.project_purchase_orders;

create or replace function public.rollup_supplier_invoice_status_from_matches(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_match_count integer := 0;
  disputed_match_count integer := 0;
  approved_allocation_total numeric := 0;
  invoice_total numeric := 0;
  current_status text;
  next_status text;
  can_review boolean := false;
begin
  select
    si.status,
    coalesce(si.total, 0)
  into current_status, invoice_total
  from public.supplier_invoices si
  where si.id = p_supplier_invoice_id
    and si.organization_id = p_organization_id;

  if current_status is null then
    return;
  end if;

  select
    count(*) filter (where match_status in ('accepted', 'adjusted')),
    count(*) filter (
      where match_status in ('accepted', 'adjusted')
        and approval_status = 'disputed'
    ),
    coalesce(
      sum(
        case
          when match_status in ('accepted', 'adjusted')
            and approval_status = 'approved'
          then matched_amount
          else 0
        end
      ),
      0
    )
  into active_match_count, disputed_match_count, approved_allocation_total
  from public.supplier_invoice_purchase_order_matches
  where supplier_invoice_id = p_supplier_invoice_id
    and organization_id = p_organization_id;

  can_review := public.has_org_permission(p_organization_id, 'supplier_invoices.review');

  if active_match_count = 0 then
    if current_status in ('Approved', 'Disputed') then
      next_status := 'Needs Review';
    else
      next_status := current_status;
    end if;
  elsif disputed_match_count > 0 then
    next_status := 'Disputed';
  elsif approved_allocation_total >= invoice_total - 0.0001 then
    next_status := 'Approved';
  else
    next_status := 'Needs Review';
  end if;

  if next_status in ('Approved', 'Disputed') and not can_review then
    next_status := 'Needs Review';
  end if;

  if next_status is distinct from current_status then
    update public.supplier_invoices
    set status = next_status
    where id = p_supplier_invoice_id
      and organization_id = p_organization_id;
  end if;
end;
$$;

commit;
