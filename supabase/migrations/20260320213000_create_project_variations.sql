create table if not exists public.project_variations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  variation_title text not null,
  variation_number text not null,
  status text not null default 'Draft',
  origin text not null default 'Unknown',
  source_reference text not null default '',
  requested_by text not null default '',
  requested_date date null,
  due_date date null,
  sent_to_client_at timestamptz null,
  client_viewed_at timestamptz null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  invoice_ready boolean not null default false,
  invoice_reference text not null default '',
  notes text not null default '',
  labour_total numeric(14,2) not null default 0,
  materials_total numeric(14,2) not null default 0,
  subcontractors_total numeric(14,2) not null default 0,
  plant_total numeric(14,2) not null default 0,
  margin_total numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  gst_percent numeric(7,3) not null default 15,
  gst_total numeric(14,2) not null default 0,
  total_variation_price numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_variations_title_not_blank check (char_length(trim(variation_title)) > 0),
  constraint project_variations_number_not_blank check (char_length(trim(variation_number)) > 0),
  constraint project_variations_status_check
    check (status in ('Draft', 'Priced', 'Sent', 'Client Review', 'Approved', 'Rejected', 'Invoiced')),
  constraint project_variations_origin_check
    check (origin in ('Client Request', 'Drawing Revision', 'Site Instruction', 'RFI', 'Unknown')),
  constraint project_variations_unique_number_per_project unique (project_id, variation_number)
);

create index if not exists project_variations_org_idx
  on public.project_variations (organization_id);
create index if not exists project_variations_project_idx
  on public.project_variations (project_id, created_at desc);
create index if not exists project_variations_status_idx
  on public.project_variations (organization_id, status);
create index if not exists project_variations_invoice_ready_idx
  on public.project_variations (organization_id, project_id, invoice_ready);

drop trigger if exists set_project_variations_updated_at on public.project_variations;
create trigger set_project_variations_updated_at
before update on public.project_variations
for each row execute function public.set_updated_at();

create table if not exists public.project_variation_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  variation_id uuid not null references public.project_variations (id) on delete cascade,
  section text not null default 'Labour',
  description text not null default '',
  quantity numeric(14,3) not null default 0,
  unit text not null default '',
  rate numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_variation_line_items_section_check
    check (section in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin'))
);

create index if not exists project_variation_line_items_variation_idx
  on public.project_variation_line_items (variation_id, sort_order, created_at);
create index if not exists project_variation_line_items_project_idx
  on public.project_variation_line_items (project_id);

drop trigger if exists set_project_variation_line_items_updated_at on public.project_variation_line_items;
create trigger set_project_variation_line_items_updated_at
before update on public.project_variation_line_items
for each row execute function public.set_updated_at();

create table if not exists public.project_variation_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  variation_id uuid not null references public.project_variations (id) on delete cascade,
  file_kind text not null default 'Other',
  file_name text not null,
  storage_path text null,
  external_url text null,
  notes text not null default '',
  uploaded_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_variation_attachments_kind_check
    check (file_kind in ('Drawing', 'Email', 'Site Instruction', 'Other')),
  constraint project_variation_attachments_name_not_blank
    check (char_length(trim(file_name)) > 0),
  constraint project_variation_attachments_path_or_url_check
    check (
      storage_path is not null
      or external_url is not null
    )
);

create index if not exists project_variation_attachments_variation_idx
  on public.project_variation_attachments (variation_id, created_at desc);
create index if not exists project_variation_attachments_project_idx
  on public.project_variation_attachments (project_id);

drop trigger if exists set_project_variation_attachments_updated_at on public.project_variation_attachments;
create trigger set_project_variation_attachments_updated_at
before update on public.project_variation_attachments
for each row execute function public.set_updated_at();

create table if not exists public.project_variation_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  variation_id uuid not null references public.project_variations (id) on delete cascade,
  from_status text null,
  to_status text not null,
  changed_by uuid null references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  note text not null default '',
  constraint project_variation_status_events_from_check
    check (from_status is null or from_status in ('Draft', 'Priced', 'Sent', 'Client Review', 'Approved', 'Rejected', 'Invoiced')),
  constraint project_variation_status_events_to_check
    check (to_status in ('Draft', 'Priced', 'Sent', 'Client Review', 'Approved', 'Rejected', 'Invoiced'))
);

create index if not exists project_variation_status_events_variation_idx
  on public.project_variation_status_events (variation_id, changed_at desc);

create table if not exists public.project_variation_invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  variation_id uuid not null references public.project_variations (id) on delete cascade,
  ready_at timestamptz not null default now(),
  exported_at timestamptz null,
  invoice_reference text not null default '',
  amount numeric(14,2) not null default 0,
  status text not null default 'Ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_variation_invoice_items_status_check
    check (status in ('Ready', 'Exported', 'Cancelled')),
  constraint project_variation_invoice_items_unique_variation unique (variation_id)
);

create index if not exists project_variation_invoice_items_project_idx
  on public.project_variation_invoice_items (project_id, status, created_at desc);

drop trigger if exists set_project_variation_invoice_items_updated_at on public.project_variation_invoice_items;
create trigger set_project_variation_invoice_items_updated_at
before update on public.project_variation_invoice_items
for each row execute function public.set_updated_at();

alter table public.project_variations enable row level security;
alter table public.project_variations force row level security;
alter table public.project_variation_line_items enable row level security;
alter table public.project_variation_line_items force row level security;
alter table public.project_variation_attachments enable row level security;
alter table public.project_variation_attachments force row level security;
alter table public.project_variation_status_events enable row level security;
alter table public.project_variation_status_events force row level security;
alter table public.project_variation_invoice_items enable row level security;
alter table public.project_variation_invoice_items force row level security;

drop policy if exists "Members can view project variations" on public.project_variations;
create policy "Members can view project variations"
on public.project_variations
for select
using (public.is_member_of_organization(project_variations.organization_id));

drop policy if exists "Members can create project variations" on public.project_variations;
create policy "Members can create project variations"
on public.project_variations
for insert
with check (
  project_variations.created_by = auth.uid()
  and public.is_member_of_organization(project_variations.organization_id)
);

drop policy if exists "Members can update project variations" on public.project_variations;
create policy "Members can update project variations"
on public.project_variations
for update
using (public.is_member_of_organization(project_variations.organization_id))
with check (public.is_member_of_organization(project_variations.organization_id));

drop policy if exists "Admins can delete project variations" on public.project_variations;
create policy "Admins can delete project variations"
on public.project_variations
for delete
using (public.is_admin_of_organization(project_variations.organization_id));

drop policy if exists "Members can view variation line items" on public.project_variation_line_items;
create policy "Members can view variation line items"
on public.project_variation_line_items
for select
using (public.is_member_of_organization(project_variation_line_items.organization_id));

drop policy if exists "Members can create variation line items" on public.project_variation_line_items;
create policy "Members can create variation line items"
on public.project_variation_line_items
for insert
with check (public.is_member_of_organization(project_variation_line_items.organization_id));

drop policy if exists "Members can update variation line items" on public.project_variation_line_items;
create policy "Members can update variation line items"
on public.project_variation_line_items
for update
using (public.is_member_of_organization(project_variation_line_items.organization_id))
with check (public.is_member_of_organization(project_variation_line_items.organization_id));

drop policy if exists "Admins can delete variation line items" on public.project_variation_line_items;
create policy "Admins can delete variation line items"
on public.project_variation_line_items
for delete
using (public.is_admin_of_organization(project_variation_line_items.organization_id));

drop policy if exists "Members can view variation attachments" on public.project_variation_attachments;
create policy "Members can view variation attachments"
on public.project_variation_attachments
for select
using (public.is_member_of_organization(project_variation_attachments.organization_id));

drop policy if exists "Members can create variation attachments" on public.project_variation_attachments;
create policy "Members can create variation attachments"
on public.project_variation_attachments
for insert
with check (public.is_member_of_organization(project_variation_attachments.organization_id));

drop policy if exists "Members can update variation attachments" on public.project_variation_attachments;
create policy "Members can update variation attachments"
on public.project_variation_attachments
for update
using (public.is_member_of_organization(project_variation_attachments.organization_id))
with check (public.is_member_of_organization(project_variation_attachments.organization_id));

drop policy if exists "Admins can delete variation attachments" on public.project_variation_attachments;
create policy "Admins can delete variation attachments"
on public.project_variation_attachments
for delete
using (public.is_admin_of_organization(project_variation_attachments.organization_id));

drop policy if exists "Members can view variation status events" on public.project_variation_status_events;
create policy "Members can view variation status events"
on public.project_variation_status_events
for select
using (public.is_member_of_organization(project_variation_status_events.organization_id));

drop policy if exists "Members can create variation status events" on public.project_variation_status_events;
create policy "Members can create variation status events"
on public.project_variation_status_events
for insert
with check (public.is_member_of_organization(project_variation_status_events.organization_id));

drop policy if exists "Admins can delete variation status events" on public.project_variation_status_events;
create policy "Admins can delete variation status events"
on public.project_variation_status_events
for delete
using (public.is_admin_of_organization(project_variation_status_events.organization_id));

drop policy if exists "Members can view variation invoice items" on public.project_variation_invoice_items;
create policy "Members can view variation invoice items"
on public.project_variation_invoice_items
for select
using (public.is_member_of_organization(project_variation_invoice_items.organization_id));

drop policy if exists "Members can create variation invoice items" on public.project_variation_invoice_items;
create policy "Members can create variation invoice items"
on public.project_variation_invoice_items
for insert
with check (public.is_member_of_organization(project_variation_invoice_items.organization_id));

drop policy if exists "Members can update variation invoice items" on public.project_variation_invoice_items;
create policy "Members can update variation invoice items"
on public.project_variation_invoice_items
for update
using (public.is_member_of_organization(project_variation_invoice_items.organization_id))
with check (public.is_member_of_organization(project_variation_invoice_items.organization_id));

drop policy if exists "Admins can delete variation invoice items" on public.project_variation_invoice_items;
create policy "Admins can delete variation invoice items"
on public.project_variation_invoice_items
for delete
using (public.is_admin_of_organization(project_variation_invoice_items.organization_id));

grant select, insert, update, delete on public.project_variations to authenticated;
grant select, insert, update, delete on public.project_variation_line_items to authenticated;
grant select, insert, update, delete on public.project_variation_attachments to authenticated;
grant select, insert, update, delete on public.project_variation_status_events to authenticated;
grant select, insert, update, delete on public.project_variation_invoice_items to authenticated;
