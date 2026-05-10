begin;

create table if not exists public.supplier_invoice_purchase_order_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  purchase_order_id uuid not null references public.project_purchase_orders (id) on delete cascade,
  matched_amount numeric(14,2) not null default 0,
  match_status text not null default 'suggested',
  confidence_score numeric(5,4) null,
  match_basis text not null default 'manual',
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_purchase_order_matches_status_check
    check (match_status in ('suggested', 'accepted', 'rejected', 'adjusted')),
  constraint supplier_invoice_purchase_order_matches_basis_check
    check (match_basis in ('manual')),
  constraint supplier_invoice_purchase_order_matches_amount_check
    check (matched_amount >= 0),
  constraint supplier_invoice_purchase_order_matches_invoice_po_key
    unique (supplier_invoice_id, purchase_order_id)
);

create index if not exists supplier_invoice_po_matches_invoice_idx
  on public.supplier_invoice_purchase_order_matches (organization_id, supplier_invoice_id, created_at desc);

create index if not exists supplier_invoice_po_matches_purchase_order_idx
  on public.supplier_invoice_purchase_order_matches (organization_id, purchase_order_id, created_at desc);

create index if not exists supplier_invoice_po_matches_invoice_po_idx
  on public.supplier_invoice_purchase_order_matches (supplier_invoice_id, purchase_order_id);

drop trigger if exists set_supplier_invoice_purchase_order_matches_updated_at
  on public.supplier_invoice_purchase_order_matches;
create trigger set_supplier_invoice_purchase_order_matches_updated_at
before update on public.supplier_invoice_purchase_order_matches
for each row execute function public.set_updated_at();

alter table public.supplier_invoice_purchase_order_matches enable row level security;
alter table public.supplier_invoice_purchase_order_matches force row level security;

drop policy if exists "Privileged members can view supplier invoice purchase order matches"
  on public.supplier_invoice_purchase_order_matches;
create policy "Privileged members can view supplier invoice purchase order matches"
on public.supplier_invoice_purchase_order_matches
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_purchase_order_matches.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged members can create supplier invoice purchase order matches"
  on public.supplier_invoice_purchase_order_matches;
create policy "Privileged members can create supplier invoice purchase order matches"
on public.supplier_invoice_purchase_order_matches
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_purchase_order_matches.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can update supplier invoice purchase order matches"
  on public.supplier_invoice_purchase_order_matches;
create policy "Privileged members can update supplier invoice purchase order matches"
on public.supplier_invoice_purchase_order_matches
for update
to authenticated
using (
  public.has_org_permission(supplier_invoice_purchase_order_matches.organization_id, 'supplier_invoices.write')
)
with check (
  public.has_org_permission(supplier_invoice_purchase_order_matches.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can delete supplier invoice purchase order matches"
  on public.supplier_invoice_purchase_order_matches;
create policy "Privileged members can delete supplier invoice purchase order matches"
on public.supplier_invoice_purchase_order_matches
for delete
to authenticated
using (
  public.has_org_permission(supplier_invoice_purchase_order_matches.organization_id, 'supplier_invoices.write')
);

grant select, insert, update, delete on public.supplier_invoice_purchase_order_matches to authenticated;

commit;
