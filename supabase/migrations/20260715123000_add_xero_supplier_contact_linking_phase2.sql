begin;

alter table public.organization_xero_connections
  add column if not exists last_contacts_sync_at timestamptz null;

create table if not exists public.organization_xero_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.organization_xero_connections (id) on delete cascade,
  tenant_id text not null,
  contact_id text not null,
  name text not null,
  first_name text null,
  last_name text null,
  email text null,
  phone text null,
  mobile text null,
  account_number text null,
  tax_number text null,
  contact_status text null,
  is_supplier boolean null,
  is_customer boolean null,
  external_updated_at timestamptz null,
  imported_at timestamptz not null default now(),
  addresses_json jsonb not null default '[]'::jsonb,
  phones_json jsonb not null default '[]'::jsonb,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_xero_contacts_contact_id_not_blank check (char_length(trim(contact_id)) > 0),
  constraint organization_xero_contacts_name_not_blank check (char_length(trim(name)) > 0),
  constraint organization_xero_contacts_addresses_json_array check (jsonb_typeof(addresses_json) = 'array'),
  constraint organization_xero_contacts_phones_json_array check (jsonb_typeof(phones_json) = 'array'),
  constraint organization_xero_contacts_raw_metadata_object check (jsonb_typeof(raw_metadata) = 'object'),
  constraint organization_xero_contacts_status_check check (
    contact_status is null or contact_status in ('ACTIVE', 'ARCHIVED', 'GDPRREQUEST')
  ),
  constraint organization_xero_contacts_unique_external unique (organization_id, tenant_id, contact_id)
);

create index if not exists organization_xero_contacts_org_connection_status_idx
  on public.organization_xero_contacts (organization_id, connection_id, contact_status, updated_at desc);

create index if not exists organization_xero_contacts_org_name_idx
  on public.organization_xero_contacts (organization_id, lower(name), updated_at desc);

create index if not exists organization_xero_contacts_org_email_idx
  on public.organization_xero_contacts (organization_id, lower(email))
  where email is not null;

create index if not exists organization_xero_contacts_org_account_number_idx
  on public.organization_xero_contacts (organization_id, lower(account_number))
  where account_number is not null;

drop trigger if exists set_organization_xero_contacts_updated_at on public.organization_xero_contacts;
create trigger set_organization_xero_contacts_updated_at
before update on public.organization_xero_contacts
for each row execute function public.set_updated_at();

create table if not exists public.organization_external_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  accounting_connection_id uuid not null references public.organization_xero_connections (id),
  provider text not null,
  local_entity_type text not null,
  local_entity_id uuid not null,
  tenant_id text not null,
  external_contact_id text not null,
  external_contact_name text null,
  external_contact_status text null,
  link_status text not null,
  match_method text null,
  linked_by uuid null references auth.users (id) on delete set null,
  linked_at timestamptz null,
  unlinked_at timestamptz null,
  last_synced_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  superseded_by_id uuid null references public.organization_external_contacts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_external_contacts_provider_check check (provider in ('xero')),
  constraint organization_external_contacts_local_entity_type_check check (local_entity_type in ('supplier', 'client')),
  constraint organization_external_contacts_external_contact_id_not_blank check (char_length(trim(external_contact_id)) > 0),
  constraint organization_external_contacts_tenant_id_not_blank check (char_length(trim(tenant_id)) > 0),
  constraint organization_external_contacts_link_status_check check (
    link_status in ('linked', 'attention_required', 'external_archived', 'unlinked_history')
  )
);

create unique index if not exists organization_external_contacts_active_local_uidx
  on public.organization_external_contacts (organization_id, provider, local_entity_type, local_entity_id)
  where link_status in ('linked', 'attention_required', 'external_archived');

create unique index if not exists organization_external_contacts_active_external_uidx
  on public.organization_external_contacts (organization_id, provider, local_entity_type, external_contact_id)
  where link_status in ('linked', 'attention_required', 'external_archived');

create index if not exists organization_external_contacts_org_entity_created_idx
  on public.organization_external_contacts (organization_id, local_entity_type, local_entity_id, created_at desc);

create index if not exists organization_external_contacts_org_external_created_idx
  on public.organization_external_contacts (organization_id, provider, external_contact_id, created_at desc);

drop trigger if exists set_organization_external_contacts_updated_at on public.organization_external_contacts;
create trigger set_organization_external_contacts_updated_at
before update on public.organization_external_contacts
for each row execute function public.set_updated_at();

create table if not exists public.organization_external_contact_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  accounting_connection_id uuid not null references public.organization_xero_connections (id),
  provider text not null,
  local_entity_type text not null,
  local_entity_id uuid not null,
  tenant_id text not null,
  operation_type text not null,
  operation_key text not null,
  status text not null default 'pending',
  external_contact_id text null,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error_code text null,
  error_message text null,
  created_by uuid null references auth.users (id) on delete set null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_external_contact_operations_provider_check check (provider in ('xero')),
  constraint organization_external_contact_operations_local_entity_type_check check (local_entity_type in ('supplier', 'client')),
  constraint organization_external_contact_operations_operation_type_check check (operation_type in ('create_contact')),
  constraint organization_external_contact_operations_status_check check (status in ('pending', 'succeeded', 'uncertain', 'failed')),
  constraint organization_external_contact_operations_operation_key_not_blank check (char_length(trim(operation_key)) > 0),
  constraint organization_external_contact_operations_request_summary_object check (jsonb_typeof(request_summary) = 'object'),
  constraint organization_external_contact_operations_response_summary_object check (jsonb_typeof(response_summary) = 'object'),
  constraint organization_external_contact_operations_unique_key unique (operation_key)
);

create index if not exists organization_external_contact_operations_org_entity_created_idx
  on public.organization_external_contact_operations (organization_id, local_entity_type, local_entity_id, created_at desc);

drop trigger if exists set_organization_external_contact_operations_updated_at on public.organization_external_contact_operations;
create trigger set_organization_external_contact_operations_updated_at
before update on public.organization_external_contact_operations
for each row execute function public.set_updated_at();

create table if not exists public.supplier_contact_link_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.organization_suppliers (id) on delete cascade,
  external_contact_link_id uuid null references public.organization_external_contacts (id) on delete set null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  action text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint supplier_contact_link_activity_action_not_blank check (char_length(trim(action)) > 0),
  constraint supplier_contact_link_activity_message_not_blank check (char_length(trim(message)) > 0),
  constraint supplier_contact_link_activity_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists supplier_contact_link_activity_supplier_created_idx
  on public.supplier_contact_link_activity (supplier_id, created_at desc);

create index if not exists supplier_contact_link_activity_org_created_idx
  on public.supplier_contact_link_activity (organization_id, created_at desc);

alter table public.organization_xero_contacts enable row level security;
alter table public.organization_xero_contacts force row level security;
alter table public.organization_external_contacts enable row level security;
alter table public.organization_external_contacts force row level security;
alter table public.organization_external_contact_operations enable row level security;
alter table public.organization_external_contact_operations force row level security;
alter table public.supplier_contact_link_activity enable row level security;
alter table public.supplier_contact_link_activity force row level security;

drop policy if exists "Members can view organization xero contacts" on public.organization_xero_contacts;
create policy "Members can view organization xero contacts"
on public.organization_xero_contacts
for select
to authenticated
using (public.is_member_of_organization(organization_xero_contacts.organization_id));

drop policy if exists "Managers can manage organization xero contacts" on public.organization_xero_contacts;
create policy "Managers can manage organization xero contacts"
on public.organization_xero_contacts
for all
to authenticated
using (public.has_org_permission(organization_xero_contacts.organization_id, 'accounting.contacts.manage'))
with check (public.has_org_permission(organization_xero_contacts.organization_id, 'accounting.contacts.manage'));

drop policy if exists "Members can view organization external contacts" on public.organization_external_contacts;
create policy "Members can view organization external contacts"
on public.organization_external_contacts
for select
to authenticated
using (public.is_member_of_organization(organization_external_contacts.organization_id));

drop policy if exists "Managers can manage organization external contacts" on public.organization_external_contacts;
create policy "Managers can manage organization external contacts"
on public.organization_external_contacts
for all
to authenticated
using (public.has_org_permission(organization_external_contacts.organization_id, 'accounting.contacts.manage'))
with check (public.has_org_permission(organization_external_contacts.organization_id, 'accounting.contacts.manage'));

drop policy if exists "Managers can view organization external contact operations" on public.organization_external_contact_operations;
create policy "Managers can view organization external contact operations"
on public.organization_external_contact_operations
for select
to authenticated
using (public.has_org_permission(organization_external_contact_operations.organization_id, 'accounting.contacts.manage'));

drop policy if exists "Managers can manage organization external contact operations" on public.organization_external_contact_operations;
create policy "Managers can manage organization external contact operations"
on public.organization_external_contact_operations
for all
to authenticated
using (public.has_org_permission(organization_external_contact_operations.organization_id, 'accounting.contacts.manage'))
with check (public.has_org_permission(organization_external_contact_operations.organization_id, 'accounting.contacts.manage'));

drop policy if exists "Members can view supplier contact link activity" on public.supplier_contact_link_activity;
create policy "Members can view supplier contact link activity"
on public.supplier_contact_link_activity
for select
to authenticated
using (public.is_member_of_organization(supplier_contact_link_activity.organization_id));

drop policy if exists "Managers can manage supplier contact link activity" on public.supplier_contact_link_activity;
create policy "Managers can manage supplier contact link activity"
on public.supplier_contact_link_activity
for all
to authenticated
using (public.has_org_permission(supplier_contact_link_activity.organization_id, 'accounting.contacts.manage'))
with check (public.has_org_permission(supplier_contact_link_activity.organization_id, 'accounting.contacts.manage'));

grant select, insert, update, delete on public.organization_xero_contacts to authenticated;
grant select, insert, update, delete on public.organization_xero_contacts to service_role;
grant select, insert, update, delete on public.organization_external_contacts to authenticated;
grant select, insert, update, delete on public.organization_external_contacts to service_role;
grant select, insert, update, delete on public.organization_external_contact_operations to authenticated;
grant select, insert, update, delete on public.organization_external_contact_operations to service_role;
grant select, insert, update, delete on public.supplier_contact_link_activity to authenticated;
grant select, insert, update, delete on public.supplier_contact_link_activity to service_role;

alter table public.organization_accounting_sync_jobs
  drop constraint if exists organization_accounting_sync_jobs_job_kind_check;

alter table public.organization_accounting_sync_jobs
  add constraint organization_accounting_sync_jobs_job_kind_check check (
    job_kind in ('import_accounts', 'import_tax_rates', 'import_contacts', 'health_check')
  );

insert into public.app_permissions (permission_key, description)
values ('accounting.contacts.manage', 'Manage supplier links to external accounting contacts and create external accounting contacts')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'accounting.contacts.manage', true),
  ('admin', 'accounting.contacts.manage', true),
  ('qs', 'accounting.contacts.manage', true),
  ('project_manager', 'accounting.contacts.manage', true),
  ('worker', 'accounting.contacts.manage', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

commit;
