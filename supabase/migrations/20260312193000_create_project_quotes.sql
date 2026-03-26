create table if not exists public.project_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  quote_title text not null,
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
  subtotal numeric(14,2) not null default 0,
  optional_subtotal numeric(14,2) not null default 0,
  margin_percent numeric(7,3) not null default 0,
  margin_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  contingency_amount numeric(14,2) not null default 0,
  gst_percent numeric(7,3) not null default 15,
  gst_amount numeric(14,2) not null default 0,
  total_quote_price numeric(14,2) not null default 0,
  validity_period text not null default '',
  payment_terms text not null default '',
  lead_time text not null default '',
  terms_inclusions text not null default '',
  terms_exclusions text not null default '',
  clarifications text not null default '',
  acceptance_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quotes_title_not_blank check (char_length(trim(quote_title)) > 0),
  constraint project_quotes_number_not_blank check (char_length(trim(quote_number)) > 0),
  constraint project_quotes_status_check
    check (status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired')),
  constraint project_quotes_unique_number_per_project unique (project_id, quote_number)
);

create index if not exists project_quotes_org_idx on public.project_quotes (organization_id);
create index if not exists project_quotes_project_idx on public.project_quotes (project_id, created_at desc);
create index if not exists project_quotes_status_idx on public.project_quotes (organization_id, status);

drop trigger if exists set_project_quotes_updated_at on public.project_quotes;
create trigger set_project_quotes_updated_at
before update on public.project_quotes
for each row execute function public.set_updated_at();

create table if not exists public.project_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  quote_id uuid not null references public.project_quotes (id) on delete cascade,
  section text not null default 'Labour',
  description text not null default '',
  quantity numeric(14,3) not null default 0,
  unit text not null default '',
  rate numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  is_optional boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quote_line_items_section_check
    check (section in ('Preliminaries', 'Labour', 'Materials', 'Plant', 'Subcontractors'))
);

create index if not exists project_quote_line_items_quote_idx
  on public.project_quote_line_items (quote_id, sort_order, created_at);
create index if not exists project_quote_line_items_project_idx
  on public.project_quote_line_items (project_id);

drop trigger if exists set_project_quote_line_items_updated_at on public.project_quote_line_items;
create trigger set_project_quote_line_items_updated_at
before update on public.project_quote_line_items
for each row execute function public.set_updated_at();

alter table public.project_quotes enable row level security;
alter table public.project_quotes force row level security;
alter table public.project_quote_line_items enable row level security;
alter table public.project_quote_line_items force row level security;

drop policy if exists "Members can view project quotes" on public.project_quotes;
create policy "Members can view project quotes"
on public.project_quotes
for select
using (public.is_member_of_organization(project_quotes.organization_id));

drop policy if exists "Members can create project quotes" on public.project_quotes;
create policy "Members can create project quotes"
on public.project_quotes
for insert
with check (
  project_quotes.created_by = auth.uid()
  and public.is_member_of_organization(project_quotes.organization_id)
);

drop policy if exists "Members can update project quotes" on public.project_quotes;
create policy "Members can update project quotes"
on public.project_quotes
for update
using (public.is_member_of_organization(project_quotes.organization_id))
with check (public.is_member_of_organization(project_quotes.organization_id));

drop policy if exists "Admins can delete project quotes" on public.project_quotes;
create policy "Admins can delete project quotes"
on public.project_quotes
for delete
using (public.is_admin_of_organization(project_quotes.organization_id));

drop policy if exists "Members can view quote line items" on public.project_quote_line_items;
create policy "Members can view quote line items"
on public.project_quote_line_items
for select
using (public.is_member_of_organization(project_quote_line_items.organization_id));

drop policy if exists "Members can create quote line items" on public.project_quote_line_items;
create policy "Members can create quote line items"
on public.project_quote_line_items
for insert
with check (public.is_member_of_organization(project_quote_line_items.organization_id));

drop policy if exists "Members can update quote line items" on public.project_quote_line_items;
create policy "Members can update quote line items"
on public.project_quote_line_items
for update
using (public.is_member_of_organization(project_quote_line_items.organization_id))
with check (public.is_member_of_organization(project_quote_line_items.organization_id));

drop policy if exists "Admins can delete quote line items" on public.project_quote_line_items;
create policy "Admins can delete quote line items"
on public.project_quote_line_items
for delete
using (public.is_admin_of_organization(project_quote_line_items.organization_id));

grant select, insert, update, delete on public.project_quotes to authenticated;
grant select, insert, update, delete on public.project_quote_line_items to authenticated;
