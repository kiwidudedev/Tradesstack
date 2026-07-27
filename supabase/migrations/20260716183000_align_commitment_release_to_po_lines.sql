begin;

create table if not exists public.purchase_order_commitment_release_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  commitment_release_id uuid not null
    references public.purchase_order_commitment_releases (id) on delete cascade,
  purchase_order_id uuid not null references public.project_purchase_orders (id) on delete restrict,
  purchase_order_line_item_id uuid not null
    references public.project_purchase_order_line_items (id) on delete restrict,
  released_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint purchase_order_commitment_release_lines_amount_check
    check (released_amount >= 0),
  constraint purchase_order_commitment_release_lines_unique_line
    unique (commitment_release_id, purchase_order_line_item_id)
);

create index if not exists purchase_order_commitment_release_lines_po_line_idx
  on public.purchase_order_commitment_release_lines
  (organization_id, purchase_order_line_item_id, created_at desc);

alter table public.purchase_order_commitment_release_lines enable row level security;
alter table public.purchase_order_commitment_release_lines force row level security;

drop policy if exists "Members can view purchase order commitment release lines"
  on public.purchase_order_commitment_release_lines;
create policy "Members can view purchase order commitment release lines"
on public.purchase_order_commitment_release_lines
for select to authenticated
using (public.is_member_of_organization(organization_id));

grant select on public.purchase_order_commitment_release_lines to authenticated;
revoke insert, update, delete on public.purchase_order_commitment_release_lines
  from authenticated;

create or replace function public.enforce_commercial_snapshot_po_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordered_quantity numeric;
  v_ordered_value numeric;
  v_approved_quantity numeric;
  v_approved_value numeric;
  v_released_value numeric;
begin
  if new.purchase_order_line_item_id is null then
    return new;
  end if;

  select quantity, total
  into v_ordered_quantity, v_ordered_value
  from public.project_purchase_order_line_items
  where id = new.purchase_order_line_item_id
  for share;

  if not found then
    raise exception 'Purchase order line not found.';
  end if;

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

drop trigger if exists enforce_commercial_snapshot_po_limits
  on public.supplier_invoice_commercial_line_snapshots;
create trigger enforce_commercial_snapshot_po_limits
before insert on public.supplier_invoice_commercial_line_snapshots
for each row execute function public.enforce_commercial_snapshot_po_limits();

create or replace function public.release_purchase_order_commitment(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_expected_remaining_amount numeric,
  p_reason text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.project_purchase_orders%rowtype;
  v_approved numeric;
  v_released numeric;
  v_po_value numeric;
  v_remaining numeric;
  v_release_id uuid;
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'purchase_orders.write') then
    raise exception 'You do not have permission to release purchase order commitments.';
  end if;

  select * into v_po
  from public.project_purchase_orders
  where id = p_purchase_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Purchase order not found.';
  end if;
  if v_po.status in ('Draft', 'Pending Approval', 'Cancelled') then
    raise exception 'Only active approved purchase orders can release remaining commitment.';
  end if;

  select coalesce(sum(s.amount), 0) into v_approved
  from public.supplier_invoice_commercial_line_snapshots s
  join public.supplier_invoice_commercial_approvals a on a.id = s.commercial_approval_id
  where s.purchase_order_id = v_po.id
    and a.status = 'approved';

  select coalesce(sum(released_amount), 0) into v_released
  from public.purchase_order_commitment_releases
  where purchase_order_id = v_po.id;

  select coalesce(sum(line.total), 0) into v_po_value
  from public.project_purchase_order_line_items line
  where line.purchase_order_id = v_po.id;

  v_remaining := round(v_po_value - v_approved - v_released, 2);
  if v_remaining <= 0 then
    raise exception 'This purchase order has no positive commitment remaining to release.';
  end if;
  if abs(v_remaining - p_expected_remaining_amount) > 0.01 then
    raise exception 'The remaining commitment changed. Refresh and confirm the release again.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Add a reason for releasing the remaining commitment.';
  end if;

  insert into public.purchase_order_commitment_releases (
    organization_id,
    purchase_order_id,
    released_amount,
    reason,
    note,
    released_by
  )
  values (
    p_organization_id,
    v_po.id,
    v_remaining,
    trim(p_reason),
    coalesce(p_note, ''),
    auth.uid()
  )
  returning id into v_release_id;

  insert into public.purchase_order_commitment_release_lines (
    organization_id,
    commitment_release_id,
    purchase_order_id,
    purchase_order_line_item_id,
    released_amount
  )
  select
    p_organization_id,
    v_release_id,
    v_po.id,
    po_line.id,
    greatest(
      0,
      round(
        po_line.total
        - coalesce(approved.approved_amount, 0)
        - coalesce(previous_release.released_amount, 0),
        2
      )
    )
  from public.project_purchase_order_line_items po_line
  left join lateral (
    select coalesce(sum(snapshot.amount), 0) as approved_amount
    from public.supplier_invoice_commercial_line_snapshots snapshot
    join public.supplier_invoice_commercial_approvals approval
      on approval.id = snapshot.commercial_approval_id
    where snapshot.purchase_order_line_item_id = po_line.id
      and approval.status = 'approved'
  ) approved on true
  left join lateral (
    select coalesce(sum(release_line.released_amount), 0) as released_amount
    from public.purchase_order_commitment_release_lines release_line
    where release_line.purchase_order_line_item_id = po_line.id
  ) previous_release on true
  where po_line.purchase_order_id = v_po.id;

  return v_release_id;
end;
$$;

grant execute on function public.release_purchase_order_commitment(
  uuid, uuid, numeric, text, text
) to authenticated;

commit;
