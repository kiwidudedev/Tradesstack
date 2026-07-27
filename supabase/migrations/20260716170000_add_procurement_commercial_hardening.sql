begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.supplier_invoice_line_allocations
  add column if not exists accounting_tax_rate_id uuid null
    references public.organization_accounting_tax_rates (id) on delete set null,
  add column if not exists tax_resolution_status text not null default 'unresolved';

update public.supplier_invoice_line_allocations a
set tax_resolution_status = case
  when coalesce(l.tax_amount, 0) = 0 then 'not_applicable'
  else 'unresolved'
end
from public.supplier_invoice_lines l
where l.id = a.supplier_invoice_line_id
  and a.tax_resolution_status = 'unresolved';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_invoice_allocations_tax_resolution_check'
  ) then
    alter table public.supplier_invoice_line_allocations
      add constraint supplier_invoice_allocations_tax_resolution_check
      check (tax_resolution_status in ('unresolved', 'resolved', 'not_applicable'));
  end if;
end $$;

create index if not exists supplier_invoice_allocations_tax_rate_idx
  on public.supplier_invoice_line_allocations (accounting_tax_rate_id)
  where accounting_tax_rate_id is not null;

create table if not exists public.supplier_invoice_commercial_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  status text not null,
  finance_version_hash text not null,
  supplier_id uuid null references public.organization_suppliers (id) on delete restrict,
  normalized_invoice_number text not null,
  invoice_total numeric(14,2) not null,
  invoice_tax_total numeric(14,2) not null,
  currency text not null,
  accepted_variances jsonb not null default '[]'::jsonb,
  no_po_reason text null,
  no_po_explanation text null,
  approval_note text not null default '',
  reviewed_by uuid not null references auth.users (id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  invalidated_at timestamptz null,
  invalidated_by uuid null references auth.users (id) on delete set null,
  invalidation_reason text null,
  invalidation_source text null,
  created_at timestamptz not null default now(),
  constraint supplier_invoice_commercial_approvals_status_check
    check (status in ('approved', 'rejected', 'invalidated')),
  constraint supplier_invoice_commercial_approvals_hash_not_blank
    check (char_length(trim(finance_version_hash)) > 0),
  constraint supplier_invoice_commercial_approvals_number_not_blank
    check (char_length(trim(normalized_invoice_number)) > 0),
  constraint supplier_invoice_commercial_approvals_currency_not_blank
    check (char_length(trim(currency)) > 0),
  constraint supplier_invoice_commercial_approvals_variances_array
    check (jsonb_typeof(accepted_variances) = 'array'),
  constraint supplier_invoice_commercial_approvals_invalidation_check
    check (
      (status = 'invalidated' and invalidated_at is not null and invalidation_reason is not null)
      or (status <> 'invalidated')
    )
);

create unique index if not exists supplier_invoice_commercial_approvals_active_uidx
  on public.supplier_invoice_commercial_approvals (supplier_invoice_id)
  where status = 'approved';

create index if not exists supplier_invoice_commercial_approvals_org_invoice_idx
  on public.supplier_invoice_commercial_approvals
  (organization_id, supplier_invoice_id, reviewed_at desc);

create table if not exists public.supplier_invoice_commercial_line_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  commercial_approval_id uuid not null
    references public.supplier_invoice_commercial_approvals (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  supplier_invoice_line_id uuid null references public.supplier_invoice_lines (id) on delete set null,
  allocation_id uuid null references public.supplier_invoice_line_allocations (id) on delete set null,
  purchase_order_id uuid null references public.project_purchase_orders (id) on delete restrict,
  purchase_order_line_item_id uuid null
    references public.project_purchase_order_line_items (id) on delete restrict,
  project_id uuid null references public.organization_projects (id) on delete restrict,
  accounting_mapping_id uuid not null
    references public.organization_tradesstack_accounting_mappings (id) on delete restrict,
  accounting_tax_rate_id uuid null
    references public.organization_accounting_tax_rates (id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null,
  unit_rate numeric(14,4) not null,
  amount numeric(14,2) not null,
  tax_amount numeric(14,2) not null,
  tax_resolution_status text not null,
  created_at timestamptz not null default now(),
  constraint supplier_invoice_commercial_line_snapshot_quantity_check check (quantity >= 0),
  constraint supplier_invoice_commercial_line_snapshot_amount_check check (amount >= 0),
  constraint supplier_invoice_commercial_line_snapshot_tax_check check (tax_amount >= 0),
  constraint supplier_invoice_commercial_line_snapshot_tax_status_check
    check (tax_resolution_status in ('resolved', 'not_applicable')),
  constraint supplier_invoice_commercial_line_snapshot_unique_allocation
    unique (commercial_approval_id, allocation_id)
);

create index if not exists supplier_invoice_commercial_snapshots_po_line_idx
  on public.supplier_invoice_commercial_line_snapshots
  (organization_id, purchase_order_line_item_id, created_at)
  where purchase_order_line_item_id is not null;

create table if not exists public.supplier_invoice_commercial_variances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  commercial_approval_id uuid not null
    references public.supplier_invoice_commercial_approvals (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  variance_key text not null,
  variance_type text not null,
  severity text not null,
  purchase_order_line_item_id uuid null
    references public.project_purchase_order_line_items (id) on delete set null,
  expected_value jsonb null,
  actual_value jsonb null,
  variance_amount numeric null,
  accepted_by uuid not null references auth.users (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  explanation text not null,
  created_at timestamptz not null default now(),
  constraint supplier_invoice_commercial_variances_key_not_blank
    check (char_length(trim(variance_key)) > 0),
  constraint supplier_invoice_commercial_variances_type_not_blank
    check (char_length(trim(variance_type)) > 0),
  constraint supplier_invoice_commercial_variances_severity_check
    check (severity in ('warning', 'information')),
  constraint supplier_invoice_commercial_variances_explanation_not_blank
    check (char_length(trim(explanation)) > 0),
  constraint supplier_invoice_commercial_variances_unique_key
    unique (commercial_approval_id, variance_key)
);

create index if not exists supplier_invoice_commercial_variances_invoice_idx
  on public.supplier_invoice_commercial_variances
  (organization_id, supplier_invoice_id, created_at desc);

create table if not exists public.purchase_order_commitment_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  purchase_order_id uuid not null references public.project_purchase_orders (id) on delete restrict,
  released_amount numeric(14,2) not null,
  reason text not null,
  note text not null default '',
  released_by uuid not null references auth.users (id) on delete restrict,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint purchase_order_commitment_releases_amount_check check (released_amount > 0),
  constraint purchase_order_commitment_releases_reason_not_blank
    check (char_length(trim(reason)) > 0)
);

create index if not exists purchase_order_commitment_releases_po_idx
  on public.purchase_order_commitment_releases
  (organization_id, purchase_order_id, released_at desc);

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

create or replace function public.normalize_supplier_invoice_number(p_value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select upper(regexp_replace(trim(p_value), '[[:space:]]+', '', 'g'));
$$;

create or replace function public.supplier_invoice_finance_version_hash(p_invoice_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      concat_ws(
        '|',
        i.id::text,
        coalesce(i.supplier_id::text, ''),
        public.normalize_supplier_invoice_number(coalesce(i.invoice_number, '')),
        coalesce(i.invoice_date::text, ''),
        coalesce(i.due_date::text, ''),
        coalesce(i.currency, ''),
        coalesce(i.subtotal::text, ''),
        coalesce(i.tax_total::text, ''),
        coalesce(i.total::text, ''),
        coalesce((
          select string_agg(
            concat_ws(
              ':',
              l.id::text,
              l.description,
              l.quantity::text,
              l.unit_price::text,
              l.line_total::text,
              l.tax_amount::text,
              l.sort_order::text
            ),
            ',' order by l.sort_order, l.id
          )
          from public.supplier_invoice_lines l
          where l.supplier_invoice_id = i.id
        ), ''),
        coalesce((
          select string_agg(
            concat_ws(
              ':',
              a.id::text,
              coalesce(a.purchase_order_id::text, ''),
              coalesce(a.purchase_order_line_item_id::text, ''),
              coalesce(a.project_id::text, ''),
              coalesce(a.allocated_quantity::text, ''),
              a.allocated_amount::text,
              a.approval_status,
              coalesce(a.accounting_mapping_id::text, ''),
              coalesce(a.accounting_tax_rate_id::text, ''),
              a.tax_resolution_status
            ),
            ',' order by a.supplier_invoice_line_id, a.allocation_sequence, a.id
          )
          from public.supplier_invoice_line_allocations a
          where a.supplier_invoice_id = i.id
        ), ''),
        coalesce((
          select string_agg(
            concat_ws(
              ':',
              po.id::text,
              coalesce(po.supplier_id::text, ''),
              po.status,
              po.total_purchase_order_price::text,
              po_line.id::text,
              po_line.description,
              po_line.quantity::text,
              po_line.rate::text,
              po_line.total::text
            ),
            ',' order by po.id, po_line.id
          )
          from public.supplier_invoice_line_allocations a
          join public.project_purchase_orders po on po.id = a.purchase_order_id
          join public.project_purchase_order_line_items po_line
            on po_line.id = a.purchase_order_line_item_id
          where a.supplier_invoice_id = i.id
        ), '')
      ),
      'sha256'
    ),
    'hex'
  )
  from public.supplier_invoices i
  where i.id = p_invoice_id;
$$;

create or replace function public.invalidate_supplier_invoice_commercial_approval(
  p_supplier_invoice_id uuid,
  p_reason text,
  p_source text,
  p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.supplier_invoice_commercial_approvals
  set
    status = 'invalidated',
    invalidated_at = now(),
    invalidated_by = p_actor,
    invalidation_reason = left(coalesce(nullif(trim(p_reason), ''), 'Commercial data changed.'), 500),
    invalidation_source = left(coalesce(nullif(trim(p_source), ''), 'system'), 100)
  where supplier_invoice_id = p_supplier_invoice_id
    and status = 'approved';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.invalidate_commercial_approval_from_invoice_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supplier_id is distinct from old.supplier_id
    or new.invoice_number is distinct from old.invoice_number
    or new.invoice_date is distinct from old.invoice_date
    or new.due_date is distinct from old.due_date
    or new.currency is distinct from old.currency
    or new.subtotal is distinct from old.subtotal
    or new.tax_total is distinct from old.tax_total
    or new.total is distinct from old.total then
    perform public.invalidate_supplier_invoice_commercial_approval(
      new.id,
      'Supplier invoice financial details changed.',
      'supplier_invoice',
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_commercial_approval_from_invoice_change
  on public.supplier_invoices;
create trigger invalidate_commercial_approval_from_invoice_change
after update on public.supplier_invoices
for each row execute function public.invalidate_commercial_approval_from_invoice_change();

create or replace function public.invalidate_commercial_approval_from_invoice_line_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid := coalesce(new.supplier_invoice_id, old.supplier_invoice_id);
begin
  perform public.invalidate_supplier_invoice_commercial_approval(
    v_invoice_id,
    'Supplier invoice lines changed.',
    'supplier_invoice_line',
    auth.uid()
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_commercial_approval_from_invoice_line_change
  on public.supplier_invoice_lines;
create trigger invalidate_commercial_approval_from_invoice_line_change
after insert or update or delete on public.supplier_invoice_lines
for each row execute function public.invalidate_commercial_approval_from_invoice_line_change();

create or replace function public.invalidate_commercial_approval_from_allocation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid := coalesce(new.supplier_invoice_id, old.supplier_invoice_id);
begin
  perform public.invalidate_supplier_invoice_commercial_approval(
    v_invoice_id,
    'Supplier invoice allocation, accounting mapping, or tax treatment changed.',
    'supplier_invoice_allocation',
    auth.uid()
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_commercial_approval_from_allocation_change
  on public.supplier_invoice_line_allocations;
create trigger invalidate_commercial_approval_from_allocation_change
after insert or update or delete on public.supplier_invoice_line_allocations
for each row execute function public.invalidate_commercial_approval_from_allocation_change();

create or replace function public.invalidate_commercial_approval_from_purchase_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_order_id uuid := coalesce(new.id, old.id);
  v_invoice_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.supplier_id is not distinct from old.supplier_id
    and new.total_purchase_order_price is not distinct from old.total_purchase_order_price
    and new.status is not distinct from old.status then
    return new;
  end if;

  for v_invoice_id in
    select distinct a.supplier_invoice_id
    from public.supplier_invoice_line_allocations a
    where a.purchase_order_id = v_purchase_order_id
  loop
    perform public.invalidate_supplier_invoice_commercial_approval(
      v_invoice_id,
      'Matched purchase order financial details changed.',
      'purchase_order',
      auth.uid()
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_commercial_approval_from_purchase_order_change
  on public.project_purchase_orders;
create trigger invalidate_commercial_approval_from_purchase_order_change
after update or delete on public.project_purchase_orders
for each row execute function public.invalidate_commercial_approval_from_purchase_order_change();

create or replace function public.invalidate_commercial_approval_from_purchase_order_line_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line_id uuid := coalesce(new.id, old.id);
  v_invoice_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.description is not distinct from old.description
    and new.quantity is not distinct from old.quantity
    and new.rate is not distinct from old.rate
    and new.total is not distinct from old.total then
    return new;
  end if;

  for v_invoice_id in
    select distinct a.supplier_invoice_id
    from public.supplier_invoice_line_allocations a
    where a.purchase_order_line_item_id = v_line_id
  loop
    perform public.invalidate_supplier_invoice_commercial_approval(
      v_invoice_id,
      'Matched purchase order line changed.',
      'purchase_order_line',
      auth.uid()
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_commercial_approval_from_purchase_order_line_change
  on public.project_purchase_order_line_items;
create trigger invalidate_commercial_approval_from_purchase_order_line_change
after update or delete on public.project_purchase_order_line_items
for each row execute function public.invalidate_commercial_approval_from_purchase_order_line_change();

create or replace function public.approve_supplier_invoice_commercially(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_expected_finance_hash text,
  p_accepted_variances jsonb default '[]'::jsonb,
  p_no_po_reason text default null,
  p_no_po_explanation text default null,
  p_approval_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_hash text;
  v_approval_id uuid;
  v_line_count integer;
  v_allocation_count integer;
  v_allocated_total numeric;
  v_has_po boolean;
  v_invalid_count integer;
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to commercially approve supplier invoices.';
  end if;

  select * into v_invoice
  from public.supplier_invoices
  where id = p_supplier_invoice_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Supplier invoice not found.';
  end if;

  if v_invoice.supplier_id is null then
    raise exception 'Select a supplier before commercial approval.';
  end if;
  if char_length(public.normalize_supplier_invoice_number(coalesce(v_invoice.invoice_number, ''))) = 0 then
    raise exception 'Enter an invoice number before commercial approval.';
  end if;
  if v_invoice.invoice_date is null then
    raise exception 'Enter an invoice date before commercial approval.';
  end if;

  if exists (
    select 1
    from public.supplier_invoices other
    where other.organization_id = p_organization_id
      and other.supplier_id = v_invoice.supplier_id
      and other.id <> v_invoice.id
      and public.normalize_supplier_invoice_number(other.invoice_number)
        = public.normalize_supplier_invoice_number(v_invoice.invoice_number)
  ) then
    raise exception 'Another invoice for this supplier uses the same invoice number.';
  end if;

  select count(*) into v_line_count
  from public.supplier_invoice_lines
  where supplier_invoice_id = v_invoice.id;

  if v_line_count = 0 then
    raise exception 'Add at least one invoice line before commercial approval.';
  end if;

  select count(*), coalesce(sum(a.allocated_amount), 0), bool_or(a.purchase_order_id is not null)
  into v_allocation_count, v_allocated_total, v_has_po
  from public.supplier_invoice_line_allocations a
  where a.supplier_invoice_id = v_invoice.id;

  if v_allocation_count <> v_line_count then
    raise exception 'Every invoice line must have exactly one active allocation.';
  end if;
  if abs(v_allocated_total - v_invoice.subtotal) > 0.01
    and abs(v_allocated_total - v_invoice.total) > 0.01 then
    raise exception 'Allocated amounts do not reconcile to the invoice.';
  end if;

  select count(*) into v_invalid_count
  from public.supplier_invoice_line_allocations a
  left join public.organization_tradesstack_accounting_mappings m
    on m.id = a.accounting_mapping_id
    and m.organization_id = p_organization_id
    and m.is_active = true
  left join public.organization_accounting_tax_rates t
    on t.id = a.accounting_tax_rate_id
    and t.organization_id = p_organization_id
    and t.is_active = true
  where a.supplier_invoice_id = v_invoice.id
    and (
      a.approval_status <> 'approved'
      or a.accounting_mapping_id is null
      or m.id is null
      or a.tax_resolution_status = 'unresolved'
      or (
        a.tax_resolution_status = 'not_applicable'
        and exists (
          select 1
          from public.supplier_invoice_lines tax_line
          where tax_line.id = a.supplier_invoice_line_id
            and tax_line.tax_amount > 0.01
        )
      )
      or (a.tax_resolution_status = 'resolved' and t.id is null)
      or (a.purchase_order_id is null and char_length(trim(coalesce(a.approval_notes, ''))) = 0)
    );

  if v_invalid_count > 0 then
    raise exception 'Every allocation must be approved with active accounting and tax mappings.';
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations a
    join public.project_purchase_orders po on po.id = a.purchase_order_id
    where a.supplier_invoice_id = v_invoice.id
      and po.supplier_id is distinct from v_invoice.supplier_id
  ) then
    raise exception 'The invoice supplier does not match one or more purchase orders.';
  end if;

  if coalesce(v_has_po, false) = false then
    if p_no_po_reason not in (
      'utilities', 'insurance', 'emergency_purchase',
      'professional_service', 'approved_overhead', 'other'
    ) then
      raise exception 'Select a valid no-PO reason.';
    end if;
    if p_no_po_reason = 'other'
      and char_length(trim(coalesce(p_no_po_explanation, ''))) = 0 then
      raise exception 'Explain the no-PO reason.';
    end if;
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations current_a
    join public.project_purchase_order_line_items po_line
      on po_line.id = current_a.purchase_order_line_item_id
    left join lateral (
      select
        coalesce(sum(snapshot.quantity), 0) as approved_quantity,
        coalesce(sum(snapshot.amount), 0) as approved_amount
      from public.supplier_invoice_commercial_line_snapshots snapshot
      join public.supplier_invoice_commercial_approvals approval
        on approval.id = snapshot.commercial_approval_id
      where snapshot.purchase_order_line_item_id = current_a.purchase_order_line_item_id
        and snapshot.supplier_invoice_id <> v_invoice.id
        and approval.status = 'approved'
    ) history on true
    left join lateral (
      select coalesce(sum(release_line.released_amount), 0) as released_amount
      from public.purchase_order_commitment_release_lines release_line
      where release_line.purchase_order_line_item_id = current_a.purchase_order_line_item_id
    ) released on true
    where current_a.supplier_invoice_id = v_invoice.id
      and (
        history.approved_quantity + coalesce(current_a.allocated_quantity, 0) > po_line.quantity + 0.001
        or history.approved_amount + released.released_amount + current_a.allocated_amount
          > po_line.total + 0.01
      )
  ) then
    raise exception 'Commercial approval is blocked because the invoice would over-invoice a purchase order line.';
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations current_a
    join public.supplier_invoice_lines invoice_line
      on invoice_line.id = current_a.supplier_invoice_line_id
    join public.project_purchase_order_line_items po_line
      on po_line.id = current_a.purchase_order_line_item_id
    where current_a.supplier_invoice_id = v_invoice.id
      and abs(invoice_line.unit_price - po_line.rate) > 0.0001
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
        where accepted ->> 'type' = 'rate_variance'
          and accepted ->> 'purchaseOrderLineItemId' = po_line.id::text
          and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
      )
  ) then
    raise exception 'Accept and explain every rate variance before commercial approval.';
  end if;

  if exists (
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

  if exists (
    select 1
    from public.supplier_invoice_line_allocations current_a
    join public.supplier_invoice_lines invoice_line
      on invoice_line.id = current_a.supplier_invoice_line_id
    join public.project_purchase_order_line_items po_line
      on po_line.id = current_a.purchase_order_line_item_id
    where current_a.supplier_invoice_id = v_invoice.id
      and abs(
        current_a.allocated_amount
        - round(coalesce(current_a.allocated_quantity, invoice_line.quantity, 0) * po_line.rate, 2)
      ) > 0.01
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
        where accepted ->> 'type' = 'value_variance'
          and accepted ->> 'purchaseOrderLineItemId' = po_line.id::text
          and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
      )
  ) then
    raise exception 'Accept and explain every purchase order line value variance before commercial approval.';
  end if;

  if exists (
    select 1
    from public.supplier_invoices other
    where other.organization_id = p_organization_id
      and other.supplier_id = v_invoice.supplier_id
      and other.id <> v_invoice.id
      and other.invoice_date is not distinct from v_invoice.invoice_date
      and abs(other.total - v_invoice.total) <= 0.01
      and public.normalize_supplier_invoice_number(other.invoice_number)
        <> public.normalize_supplier_invoice_number(v_invoice.invoice_number)
  )
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
    where accepted ->> 'type' = 'duplicate_invoice'
      and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
  ) then
    raise exception 'Review and explain the likely duplicate invoice warning before commercial approval.';
  end if;

  v_hash := public.supplier_invoice_finance_version_hash(v_invoice.id);
  if v_hash is null or v_hash <> p_expected_finance_hash then
    raise exception 'The invoice changed while it was being reviewed. Refresh and review it again.';
  end if;

  perform public.invalidate_supplier_invoice_commercial_approval(
    v_invoice.id,
    'Superseded by a newer commercial approval.',
    'commercial_approval',
    auth.uid()
  );

  insert into public.supplier_invoice_commercial_approvals (
    organization_id,
    supplier_invoice_id,
    status,
    finance_version_hash,
    supplier_id,
    normalized_invoice_number,
    invoice_total,
    invoice_tax_total,
    currency,
    accepted_variances,
    no_po_reason,
    no_po_explanation,
    approval_note,
    reviewed_by
  )
  values (
    p_organization_id,
    v_invoice.id,
    'approved',
    v_hash,
    v_invoice.supplier_id,
    public.normalize_supplier_invoice_number(v_invoice.invoice_number),
    v_invoice.total,
    v_invoice.tax_total,
    v_invoice.currency,
    coalesce(p_accepted_variances, '[]'::jsonb),
    case when coalesce(v_has_po, false) then null else p_no_po_reason end,
    case when coalesce(v_has_po, false) then null else nullif(trim(p_no_po_explanation), '') end,
    coalesce(p_approval_note, ''),
    auth.uid()
  )
  returning id into v_approval_id;

  insert into public.supplier_invoice_commercial_line_snapshots (
    organization_id,
    commercial_approval_id,
    supplier_invoice_id,
    supplier_invoice_line_id,
    allocation_id,
    purchase_order_id,
    purchase_order_line_item_id,
    project_id,
    accounting_mapping_id,
    accounting_tax_rate_id,
    description,
    quantity,
    unit_rate,
    amount,
    tax_amount,
    tax_resolution_status
  )
  select
    p_organization_id,
    v_approval_id,
    v_invoice.id,
    l.id,
    a.id,
    a.purchase_order_id,
    a.purchase_order_line_item_id,
    a.project_id,
    a.accounting_mapping_id,
    a.accounting_tax_rate_id,
    l.description,
    coalesce(a.allocated_quantity, l.quantity, 0),
    l.unit_price,
    a.allocated_amount,
    l.tax_amount,
    a.tax_resolution_status
  from public.supplier_invoice_lines l
  join public.supplier_invoice_line_allocations a
    on a.supplier_invoice_line_id = l.id
    and a.supplier_invoice_id = v_invoice.id
  where l.supplier_invoice_id = v_invoice.id;

  insert into public.supplier_invoice_commercial_variances (
    organization_id,
    commercial_approval_id,
    supplier_invoice_id,
    variance_key,
    variance_type,
    severity,
    purchase_order_line_item_id,
    expected_value,
    actual_value,
    variance_amount,
    accepted_by,
    explanation
  )
  select
    p_organization_id,
    v_approval_id,
    v_invoice.id,
    accepted ->> 'key',
    accepted ->> 'type',
    'warning',
    nullif(accepted ->> 'purchaseOrderLineItemId', '')::uuid,
    accepted -> 'expectedValue',
    accepted -> 'actualValue',
    case
      when jsonb_typeof(accepted -> 'varianceAmount') = 'number'
        then (accepted ->> 'varianceAmount')::numeric
      else null
    end,
    auth.uid(),
    trim(accepted ->> 'note')
  from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
  where char_length(trim(coalesce(accepted ->> 'key', ''))) > 0
    and char_length(trim(coalesce(accepted ->> 'type', ''))) > 0
    and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0;

  insert into public.supplier_invoice_activity_events (
    organization_id,
    supplier_invoice_id,
    event_type,
    message,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    v_invoice.id,
    'approved',
    'Supplier invoice commercially approved.',
    jsonb_build_object(
      'commercial_approval_id', v_approval_id,
      'finance_version_hash', v_hash,
      'accepted_variances', coalesce(p_accepted_variances, '[]'::jsonb)
    ),
    auth.uid()
  );

  return v_approval_id;
end;
$$;

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

create or replace function public.reject_supplier_invoice_commercially(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_rejection_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to commercially reject supplier invoices.';
  end if;
  if char_length(v_reason) = 0 then
    raise exception 'Add a commercial rejection reason.';
  end if;

  select * into v_invoice
  from public.supplier_invoices
  where id = p_supplier_invoice_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Supplier invoice not found.';
  end if;

  perform public.invalidate_supplier_invoice_commercial_approval(
    v_invoice.id,
    'Commercial approval replaced by rejection.',
    'commercial_rejection',
    auth.uid()
  );

  insert into public.supplier_invoice_commercial_approvals (
    organization_id,
    supplier_invoice_id,
    status,
    finance_version_hash,
    supplier_id,
    normalized_invoice_number,
    invoice_total,
    invoice_tax_total,
    currency,
    approval_note,
    reviewed_by
  )
  values (
    p_organization_id,
    v_invoice.id,
    'rejected',
    coalesce(public.supplier_invoice_finance_version_hash(v_invoice.id), 'unavailable'),
    v_invoice.supplier_id,
    coalesce(nullif(public.normalize_supplier_invoice_number(v_invoice.invoice_number), ''), 'MISSING'),
    v_invoice.total,
    v_invoice.tax_total,
    v_invoice.currency,
    v_reason,
    auth.uid()
  )
  returning id into v_rejection_id;

  insert into public.supplier_invoice_activity_events (
    organization_id,
    supplier_invoice_id,
    event_type,
    message,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    v_invoice.id,
    'disputed',
    'Supplier invoice commercially rejected.',
    jsonb_build_object('commercial_rejection_id', v_rejection_id, 'reason', v_reason),
    auth.uid()
  );

  return v_rejection_id;
end;
$$;

alter table public.supplier_invoice_commercial_approvals enable row level security;
alter table public.supplier_invoice_commercial_approvals force row level security;
alter table public.supplier_invoice_commercial_line_snapshots enable row level security;
alter table public.supplier_invoice_commercial_line_snapshots force row level security;
alter table public.supplier_invoice_commercial_variances enable row level security;
alter table public.supplier_invoice_commercial_variances force row level security;
alter table public.purchase_order_commitment_releases enable row level security;
alter table public.purchase_order_commitment_releases force row level security;
alter table public.purchase_order_commitment_release_lines enable row level security;
alter table public.purchase_order_commitment_release_lines force row level security;

create policy "Members can view supplier invoice commercial approvals"
on public.supplier_invoice_commercial_approvals
for select to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.view'));

create policy "Members can view supplier invoice commercial snapshots"
on public.supplier_invoice_commercial_line_snapshots
for select to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.view'));

create policy "Members can view supplier invoice commercial variances"
on public.supplier_invoice_commercial_variances
for select to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.view'));

create policy "Members can view purchase order commitment releases"
on public.purchase_order_commitment_releases
for select to authenticated
using (public.is_member_of_organization(organization_id));

create policy "Members can view purchase order commitment release lines"
on public.purchase_order_commitment_release_lines
for select to authenticated
using (public.is_member_of_organization(organization_id));

grant select on public.supplier_invoice_commercial_approvals to authenticated;
grant select on public.supplier_invoice_commercial_line_snapshots to authenticated;
grant select on public.supplier_invoice_commercial_variances to authenticated;
grant select on public.purchase_order_commitment_releases to authenticated;
grant select on public.purchase_order_commitment_release_lines to authenticated;
revoke insert, update, delete on public.supplier_invoice_commercial_approvals from authenticated;
revoke insert, update, delete on public.supplier_invoice_commercial_line_snapshots from authenticated;
revoke insert, update, delete on public.supplier_invoice_commercial_variances from authenticated;
revoke insert, update, delete on public.purchase_order_commitment_releases from authenticated;
revoke insert, update, delete on public.purchase_order_commitment_release_lines from authenticated;

revoke all on function public.invalidate_supplier_invoice_commercial_approval(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_supplier_invoice_commercially(uuid, uuid, text, jsonb, text, text, text)
  to authenticated;
grant execute on function public.release_purchase_order_commitment(uuid, uuid, numeric, text, text)
  to authenticated;
grant execute on function public.reject_supplier_invoice_commercially(uuid, uuid, text)
  to authenticated;
grant execute on function public.supplier_invoice_finance_version_hash(uuid)
  to authenticated;

commit;
