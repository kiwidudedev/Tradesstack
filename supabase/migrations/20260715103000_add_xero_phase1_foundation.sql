begin;

create table if not exists public.organization_xero_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'disconnected',
  tenant_id text null,
  tenant_name text null,
  tenant_type text null,
  tenant_connection_id text null,
  xero_user_id text null,
  scope text[] not null default '{}'::text[],
  available_tenants_json jsonb not null default '[]'::jsonb,
  token_expires_at timestamptz null,
  refresh_token_expires_at timestamptz null,
  last_health_status text null,
  last_health_checked_at timestamptz null,
  last_sync_started_at timestamptz null,
  last_sync_completed_at timestamptz null,
  last_accounts_sync_at timestamptz null,
  last_tax_rates_sync_at timestamptz null,
  last_error text null,
  connected_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_xero_connections_status_check check (
    status in ('disconnected', 'pending_authorization', 'awaiting_tenant_selection', 'connected', 'error')
  ),
  constraint organization_xero_connections_last_health_status_check check (
    last_health_status is null
    or last_health_status in ('healthy', 'degraded', 'disconnected', 'error')
  ),
  constraint organization_xero_connections_available_tenants_json_check check (
    jsonb_typeof(available_tenants_json) = 'array'
  ),
  constraint organization_xero_connections_org_unique unique (organization_id)
);

create index if not exists organization_xero_connections_org_status_idx
  on public.organization_xero_connections (organization_id, status, updated_at desc);

drop trigger if exists set_organization_xero_connections_updated_at on public.organization_xero_connections;
create trigger set_organization_xero_connections_updated_at
before update on public.organization_xero_connections
for each row execute function public.set_updated_at();

create table if not exists public.organization_xero_connection_secrets (
  connection_id uuid primary key references public.organization_xero_connections (id) on delete cascade,
  encrypted_token_set text not null,
  encryption_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_xero_connection_secrets_ciphertext_not_blank check (char_length(trim(encrypted_token_set)) > 0),
  constraint organization_xero_connection_secrets_encryption_version_positive check (encryption_version > 0)
);

drop trigger if exists set_organization_xero_connection_secrets_updated_at on public.organization_xero_connection_secrets;
create trigger set_organization_xero_connection_secrets_updated_at
before update on public.organization_xero_connection_secrets
for each row execute function public.set_updated_at();

create table if not exists public.organization_xero_oauth_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  state_hash text not null,
  redirect_path text not null default '/app/settings/integrations',
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint organization_xero_oauth_states_state_hash_not_blank check (char_length(trim(state_hash)) > 0),
  constraint organization_xero_oauth_states_redirect_path_not_blank check (char_length(trim(redirect_path)) > 0),
  constraint organization_xero_oauth_states_redirect_path_check check (left(redirect_path, 1) = '/'),
  constraint organization_xero_oauth_states_state_hash_unique unique (state_hash)
);

create index if not exists organization_xero_oauth_states_lookup_idx
  on public.organization_xero_oauth_states (organization_id, user_id, expires_at desc)
  where used_at is null;

create table if not exists public.organization_accounting_tax_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  external_id text not null,
  name text not null,
  display_name text null,
  effective_rate numeric(9,4) null,
  tax_type text null,
  status text null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_accounting_tax_rates_provider_check check (provider in ('xero')),
  constraint organization_accounting_tax_rates_external_id_not_blank check (char_length(trim(external_id)) > 0),
  constraint organization_accounting_tax_rates_name_not_blank check (char_length(trim(name)) > 0),
  constraint organization_accounting_tax_rates_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint organization_accounting_tax_rates_unique_external unique (organization_id, provider, external_id)
);

create index if not exists organization_accounting_tax_rates_org_provider_active_idx
  on public.organization_accounting_tax_rates (organization_id, provider, is_active, updated_at desc);

drop trigger if exists set_organization_accounting_tax_rates_updated_at on public.organization_accounting_tax_rates;
create trigger set_organization_accounting_tax_rates_updated_at
before update on public.organization_accounting_tax_rates
for each row execute function public.set_updated_at();

create table if not exists public.organization_accounting_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  connection_id uuid null references public.organization_xero_connections (id) on delete cascade,
  job_kind text not null,
  trigger_source text not null,
  queue_state text not null default 'pending',
  request_payload jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  idempotency_key text null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  retry_after timestamptz null,
  claimed_at timestamptz null,
  claimed_by text null,
  claim_expires_at timestamptz null,
  last_completed_at timestamptz null,
  last_error text null,
  created_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_accounting_sync_jobs_provider_check check (provider in ('xero')),
  constraint organization_accounting_sync_jobs_job_kind_check check (
    job_kind in ('import_accounts', 'import_tax_rates', 'health_check')
  ),
  constraint organization_accounting_sync_jobs_trigger_source_check check (
    trigger_source in ('oauth_callback', 'tenant_selection', 'manual_refresh', 'scheduled', 'health_poll')
  ),
  constraint organization_accounting_sync_jobs_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  ),
  constraint organization_accounting_sync_jobs_request_payload_object_check check (jsonb_typeof(request_payload) = 'object'),
  constraint organization_accounting_sync_jobs_result_summary_object_check check (jsonb_typeof(result_summary) = 'object'),
  constraint organization_accounting_sync_jobs_attempt_count_non_negative check (attempt_count >= 0),
  constraint organization_accounting_sync_jobs_max_attempts_positive check (max_attempts > 0)
);

create unique index if not exists organization_accounting_sync_jobs_idempotency_uidx
  on public.organization_accounting_sync_jobs (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists organization_accounting_sync_jobs_active_scope_uidx
  on public.organization_accounting_sync_jobs (organization_id, provider, job_kind)
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists organization_accounting_sync_jobs_claim_idx
  on public.organization_accounting_sync_jobs (provider, queue_state, available_at asc, retry_after asc, created_at asc)
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists organization_accounting_sync_jobs_org_recent_idx
  on public.organization_accounting_sync_jobs (organization_id, created_at desc);

drop trigger if exists set_organization_accounting_sync_jobs_updated_at on public.organization_accounting_sync_jobs;
create trigger set_organization_accounting_sync_jobs_updated_at
before update on public.organization_accounting_sync_jobs
for each row execute function public.set_updated_at();

alter table public.organization_xero_connections enable row level security;
alter table public.organization_xero_connections force row level security;
alter table public.organization_accounting_tax_rates enable row level security;
alter table public.organization_accounting_tax_rates force row level security;
alter table public.organization_accounting_sync_jobs enable row level security;
alter table public.organization_accounting_sync_jobs force row level security;

drop policy if exists "Members can view organization xero connections" on public.organization_xero_connections;
create policy "Members can view organization xero connections"
on public.organization_xero_connections
for select
to authenticated
using (public.is_member_of_organization(organization_xero_connections.organization_id));

drop policy if exists "Admins can manage organization xero connections" on public.organization_xero_connections;
create policy "Admins can manage organization xero connections"
on public.organization_xero_connections
for all
to authenticated
using (public.has_org_permission(organization_xero_connections.organization_id, 'settings.organization.update'))
with check (public.has_org_permission(organization_xero_connections.organization_id, 'settings.organization.update'));

drop policy if exists "Members can view organization accounting tax rates" on public.organization_accounting_tax_rates;
create policy "Members can view organization accounting tax rates"
on public.organization_accounting_tax_rates
for select
to authenticated
using (public.is_member_of_organization(organization_accounting_tax_rates.organization_id));

drop policy if exists "Admins can manage organization accounting tax rates" on public.organization_accounting_tax_rates;
create policy "Admins can manage organization accounting tax rates"
on public.organization_accounting_tax_rates
for all
to authenticated
using (public.has_org_permission(organization_accounting_tax_rates.organization_id, 'settings.organization.update'))
with check (public.has_org_permission(organization_accounting_tax_rates.organization_id, 'settings.organization.update'));

drop policy if exists "Admins can view organization accounting sync jobs" on public.organization_accounting_sync_jobs;
create policy "Admins can view organization accounting sync jobs"
on public.organization_accounting_sync_jobs
for select
to authenticated
using (public.has_org_permission(organization_accounting_sync_jobs.organization_id, 'settings.organization.update'));

grant select, insert, update, delete on public.organization_xero_connections to authenticated;
grant select, insert, update, delete on public.organization_xero_connections to service_role;
grant select, insert, update, delete on public.organization_xero_connection_secrets to service_role;
grant select, insert, update, delete on public.organization_xero_oauth_states to service_role;
grant select, insert, update, delete on public.organization_accounting_tax_rates to authenticated;
grant select, insert, update, delete on public.organization_accounting_tax_rates to service_role;
grant select, insert, update, delete on public.organization_accounting_sync_jobs to authenticated;
grant select, insert, update, delete on public.organization_accounting_sync_jobs to service_role;

commit;
