create table if not exists public.opportunity_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  opportunity_id uuid not null references public.organization_opportunities (id) on delete cascade,
  created_by uuid not null,
  quote_title text not null default '',
  quote_number text not null,
  client_name text not null default '',
  company_name text not null default '',
  contact_person text not null default '',
  client_email text not null default '',
  client_phone text not null default '',
  site_address text not null default '',
  project_name text not null default '',
  quote_date date null,
  expiry_date date null,
  status text not null default 'Draft',
  optional_items_notes text not null default '',
  scope_exclusions text not null default '',
  assumptions text not null default '',
  scope_notes text not null default '',
  margin_percent numeric(6,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  contingency_amount numeric(12,2) not null default 0,
  gst_percent numeric(6,2) not null default 15,
  validity_period text not null default '30 days',
  payment_terms text not null default '',
  lead_time text not null default '',
  terms_inclusions text not null default '',
  terms_exclusions text not null default '',
  clarifications text not null default '',
  acceptance_notes text not null default '',
  subtotal numeric(12,2) not null default 0,
  optional_subtotal numeric(12,2) not null default 0,
  margin_amount numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total_quote_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_quotes_status_check check (status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired')),
  constraint opportunity_quotes_org_quote_number_unique unique (organization_id, quote_number)
);

create index if not exists opportunity_quotes_org_idx
on public.opportunity_quotes (organization_id);

create index if not exists opportunity_quotes_org_opportunity_idx
on public.opportunity_quotes (organization_id, opportunity_id);

create index if not exists opportunity_quotes_org_status_idx
on public.opportunity_quotes (organization_id, status);

drop trigger if exists set_opportunity_quotes_updated_at on public.opportunity_quotes;
create trigger set_opportunity_quotes_updated_at
before update on public.opportunity_quotes
for each row execute function public.set_updated_at();

create table if not exists public.opportunity_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null references public.opportunity_quotes (id) on delete cascade,
  section text not null,
  description text not null default '',
  quantity numeric(12,2) not null default 0,
  unit text not null default '',
  rate numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_quote_line_items_section_check check (section in ('Preliminaries', 'Labour', 'Materials', 'Plant', 'Subcontractors'))
);

create index if not exists opportunity_quote_line_items_org_idx
on public.opportunity_quote_line_items (organization_id);

create index if not exists opportunity_quote_line_items_quote_idx
on public.opportunity_quote_line_items (quote_id, sort_order);

drop trigger if exists set_opportunity_quote_line_items_updated_at on public.opportunity_quote_line_items;
create trigger set_opportunity_quote_line_items_updated_at
before update on public.opportunity_quote_line_items
for each row execute function public.set_updated_at();

alter table public.opportunity_quotes enable row level security;
alter table public.opportunity_quotes force row level security;

drop policy if exists "Members can view opportunity quotes" on public.opportunity_quotes;
create policy "Members can view opportunity quotes"
on public.opportunity_quotes
for select
to authenticated
using (public.is_member_of_organization(opportunity_quotes.organization_id));

drop policy if exists "Members can create opportunity quotes" on public.opportunity_quotes;
create policy "Members can create opportunity quotes"
on public.opportunity_quotes
for insert
to authenticated
with check (
  opportunity_quotes.created_by = auth.uid()
  and public.is_member_of_organization(opportunity_quotes.organization_id)
);

drop policy if exists "Members can update opportunity quotes" on public.opportunity_quotes;
create policy "Members can update opportunity quotes"
on public.opportunity_quotes
for update
to authenticated
using (public.is_member_of_organization(opportunity_quotes.organization_id))
with check (public.is_member_of_organization(opportunity_quotes.organization_id));

drop policy if exists "Admins can delete opportunity quotes" on public.opportunity_quotes;
create policy "Admins can delete opportunity quotes"
on public.opportunity_quotes
for delete
to authenticated
using (public.is_admin_of_organization(opportunity_quotes.organization_id));

grant select, insert, update, delete on public.opportunity_quotes to authenticated;

alter table public.opportunity_quote_line_items enable row level security;
alter table public.opportunity_quote_line_items force row level security;

drop policy if exists "Members can view opportunity quote line items" on public.opportunity_quote_line_items;
create policy "Members can view opportunity quote line items"
on public.opportunity_quote_line_items
for select
to authenticated
using (public.is_member_of_organization(opportunity_quote_line_items.organization_id));

drop policy if exists "Members can create opportunity quote line items" on public.opportunity_quote_line_items;
create policy "Members can create opportunity quote line items"
on public.opportunity_quote_line_items
for insert
to authenticated
with check (public.is_member_of_organization(opportunity_quote_line_items.organization_id));

drop policy if exists "Members can update opportunity quote line items" on public.opportunity_quote_line_items;
create policy "Members can update opportunity quote line items"
on public.opportunity_quote_line_items
for update
to authenticated
using (public.is_member_of_organization(opportunity_quote_line_items.organization_id))
with check (public.is_member_of_organization(opportunity_quote_line_items.organization_id));

drop policy if exists "Admins can delete opportunity quote line items" on public.opportunity_quote_line_items;
create policy "Admins can delete opportunity quote line items"
on public.opportunity_quote_line_items
for delete
to authenticated
using (public.is_admin_of_organization(opportunity_quote_line_items.organization_id));

grant select, insert, update, delete on public.opportunity_quote_line_items to authenticated;
