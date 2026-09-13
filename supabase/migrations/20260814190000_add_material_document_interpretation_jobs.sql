alter table public.organization_material_import_batches
  add column if not exists source_retention_until timestamptz not null default (now() + interval '365 days'),
  add column if not exists source_deleted_at timestamptz null;

create table if not exists public.organization_material_import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  import_batch_id uuid not null references public.organization_material_import_batches (id) on delete cascade,
  provider text not null default 'anthropic',
  model text null,
  contract_version text not null default 'material_supplier_pricing_v1',
  prompt_version text null,
  status text not null default 'queued',
  attempt integer not null default 0,
  request_ids jsonb not null default '[]'::jsonb,
  usage_json jsonb not null default '{}'::jsonb,
  chunk_manifest jsonb not null default '[]'::jsonb,
  partial boolean not null default false,
  raw_provider_response_retained boolean not null default false,
  error_code text null,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  duration_ms integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_material_import_runs_status_check check (
    status in ('queued', 'processing', 'completed', 'partial', 'failed', 'cancelled')
  ),
  constraint organization_material_import_runs_attempt_check check (attempt >= 0),
  constraint organization_material_import_runs_duration_check check (duration_ms is null or duration_ms >= 0)
);

create index if not exists organization_material_import_runs_batch_created_idx
  on public.organization_material_import_runs (organization_id, import_batch_id, created_at desc);

create table if not exists public.organization_material_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  import_batch_id uuid not null references public.organization_material_import_batches (id) on delete cascade,
  run_id uuid not null references public.organization_material_import_runs (id) on delete cascade,
  state text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  lease_owner text null,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  heartbeat_at timestamptz null,
  cancel_requested_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_material_import_jobs_state_check check (
    state in ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  constraint organization_material_import_jobs_attempts_check check (
    attempt_count >= 0 and max_attempts between 1 and 10
  )
);

create unique index if not exists organization_material_import_jobs_one_active_per_batch_idx
  on public.organization_material_import_jobs (organization_id, import_batch_id)
  where state in ('queued', 'processing');

create index if not exists organization_material_import_jobs_claim_idx
  on public.organization_material_import_jobs (state, run_after, lease_expires_at, created_at);

drop trigger if exists set_organization_material_import_runs_updated_at on public.organization_material_import_runs;
create trigger set_organization_material_import_runs_updated_at
before update on public.organization_material_import_runs
for each row execute function public.set_updated_at();

drop trigger if exists set_organization_material_import_jobs_updated_at on public.organization_material_import_jobs;
create trigger set_organization_material_import_jobs_updated_at
before update on public.organization_material_import_jobs
for each row execute function public.set_updated_at();

alter table public.organization_material_import_runs enable row level security;
alter table public.organization_material_import_jobs enable row level security;

create policy "Members can view material import runs"
  on public.organization_material_import_runs for select
  using (public.has_org_permission(organization_id, 'materials.view'));

create policy "Members can view material import jobs"
  on public.organization_material_import_jobs for select
  using (public.has_org_permission(organization_id, 'materials.view'));

create or replace function public.claim_material_import_job(
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.organization_material_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.organization_material_import_jobs%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  select * into v_job
  from public.organization_material_import_jobs
  where (
      state = 'queued'
      or (state = 'processing' and lease_expires_at < now())
    )
    and run_after <= now()
    and cancel_requested_at is null
    and attempt_count < max_attempts
  order by run_after asc, created_at asc
  for update skip locked
  limit 1;

  if not found then return; end if;

  update public.organization_material_import_jobs
  set state = 'processing',
      attempt_count = attempt_count + 1,
      lease_owner = p_worker_id,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))),
      heartbeat_at = now()
  where id = v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.claim_material_import_job(text, integer) from public;
grant execute on function public.claim_material_import_job(text, integer) to service_role;

create or replace function public.enqueue_material_import_job(
  p_organization_id uuid,
  p_import_batch_id uuid
)
returns table (run_id uuid, job_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
begin
  if not public.has_org_permission(p_organization_id, 'materials.write') then
    raise exception 'materials.write required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_material_import_batches
    where id = p_import_batch_id and organization_id = p_organization_id
  ) then
    raise exception 'Import batch not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.organization_material_import_jobs
    where organization_id = p_organization_id and import_batch_id = p_import_batch_id
      and state in ('queued', 'processing')
  ) then
    raise exception 'Import batch already has active work' using errcode = '23505';
  end if;

  insert into public.organization_material_import_runs (
    id, organization_id, import_batch_id, provider, contract_version, status
  ) values (
    v_run_id, p_organization_id, p_import_batch_id, 'anthropic', 'material_supplier_pricing_v1', 'queued'
  );
  insert into public.organization_material_import_jobs (
    id, organization_id, import_batch_id, run_id, state
  ) values (
    v_job_id, p_organization_id, p_import_batch_id, v_run_id, 'queued'
  );
  return query select v_run_id, v_job_id;
end;
$$;

revoke all on function public.enqueue_material_import_job(uuid, uuid) from public;
grant execute on function public.enqueue_material_import_job(uuid, uuid) to authenticated, service_role;

create or replace function public.cancel_material_import_job(
  p_organization_id uuid,
  p_import_batch_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled boolean := false;
begin
  if not public.has_org_permission(p_organization_id, 'materials.write') then
    raise exception 'materials.write required' using errcode = '42501';
  end if;

  update public.organization_material_import_jobs
  set cancel_requested_at = now(), state = 'cancelled', lease_expires_at = null
  where organization_id = p_organization_id and import_batch_id = p_import_batch_id
    and state in ('queued', 'processing');
  v_cancelled := found;

  update public.organization_material_import_runs run
  set status = 'cancelled', completed_at = now()
  where run.organization_id = p_organization_id and run.import_batch_id = p_import_batch_id
    and run.status in ('queued', 'processing');

  update public.organization_material_import_batches
  set status = 'cancelled'
  where organization_id = p_organization_id and id = p_import_batch_id and status = 'extracting';

  return v_cancelled;
end;
$$;

revoke all on function public.cancel_material_import_job(uuid, uuid) from public;
grant execute on function public.cancel_material_import_job(uuid, uuid) to authenticated, service_role;
