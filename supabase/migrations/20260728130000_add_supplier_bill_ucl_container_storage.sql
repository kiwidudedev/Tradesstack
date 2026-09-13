-- Supplier Bill UCL v2 immutable container persistence.
--
-- Phase 4 remains the freshness/outbox boundary. This migration stores only a
-- validated canonical business record and extends the metadata-only current
-- state into an atomic pointer. It does not add browser or agent retrieval.

begin;

create table if not exists public.supplier_bill_ucl_container_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  container_type text not null default 'supplier_invoice',
  source_id uuid not null,
  schema_version text not null,
  builder_version text not null,
  content_hash text not null,
  payload_integrity_hash text not null,
  canonical_updated_at timestamptz not null,
  latest_dependency_updated_at timestamptz not null,
  assembled_at timestamptz not null,
  validated_at timestamptz not null,
  payload_bytes integer not null,
  payload_json jsonb not null,
  visibility_json jsonb not null,
  project_ids uuid[] not null default '{}',
  primary_project_id uuid null,
  supplier_id uuid null,
  visibility_scope_hash text not null,
  context_status text not null,
  milestone_codes text[] not null default '{}',
  retention_hold boolean not null default false,
  created_at timestamptz not null default now(),
  constraint supplier_bill_ucl_container_versions_type_check
    check (container_type = 'supplier_invoice'),
  constraint supplier_bill_ucl_container_versions_schema_check
    check (schema_version = 'supplier_bill.v2'),
  constraint supplier_bill_ucl_container_versions_builder_check
    check (char_length(btrim(builder_version)) between 1 and 120),
  constraint supplier_bill_ucl_container_versions_content_hash_check
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint supplier_bill_ucl_container_versions_integrity_hash_check
    check (payload_integrity_hash ~ '^[0-9a-f]{64}$'),
  constraint supplier_bill_ucl_container_versions_visibility_hash_check
    check (visibility_scope_hash ~ '^[0-9a-f]{64}$'),
  constraint supplier_bill_ucl_container_versions_payload_size_check
    check (payload_bytes between 1 and 65536),
  constraint supplier_bill_ucl_container_versions_payload_object_check
    check (jsonb_typeof(payload_json) = 'object'),
  constraint supplier_bill_ucl_container_versions_visibility_object_check
    check (jsonb_typeof(visibility_json) = 'object'),
  constraint supplier_bill_ucl_container_versions_status_check
    check (context_status in ('current', 'voided')),
  constraint supplier_bill_ucl_container_versions_timestamp_order_check
    check (latest_dependency_updated_at >= canonical_updated_at),
  constraint supplier_bill_ucl_container_versions_identity_uidx
    unique (organization_id, container_type, source_id, schema_version, content_hash),
  constraint supplier_bill_ucl_container_versions_id_org_uidx
    unique (id, organization_id),
  constraint supplier_bill_ucl_container_versions_id_scope_uidx
    unique (id, organization_id, container_type, source_id)
);

create index if not exists supplier_bill_ucl_versions_org_source_idx
  on public.supplier_bill_ucl_container_versions
  (organization_id, source_id, created_at desc);

create index if not exists supplier_bill_ucl_versions_org_supplier_idx
  on public.supplier_bill_ucl_container_versions
  (organization_id, supplier_id, canonical_updated_at desc)
  where supplier_id is not null;

create index if not exists supplier_bill_ucl_versions_content_hash_idx
  on public.supplier_bill_ucl_container_versions
  (organization_id, content_hash);

create index if not exists supplier_bill_ucl_versions_project_ids_gin_idx
  on public.supplier_bill_ucl_container_versions using gin (project_ids);

create index if not exists supplier_bill_ucl_versions_retention_idx
  on public.supplier_bill_ucl_container_versions
  (organization_id, source_id, created_at desc)
  where retention_hold = false;

create table if not exists public.supplier_bill_ucl_container_version_holds (
  version_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hold_reason_code text not null,
  created_at timestamptz not null default now(),
  constraint supplier_bill_ucl_container_version_holds_reason_check
    check (char_length(btrim(hold_reason_code)) between 1 and 120),
  constraint supplier_bill_ucl_container_version_holds_version_scope_fkey
    foreign key (version_id, organization_id)
    references public.supplier_bill_ucl_container_versions (id, organization_id)
    on delete restrict
);

create or replace function public.guard_supplier_bill_ucl_container_version_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Supplier Bill UCL container versions are immutable.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists guard_supplier_bill_ucl_container_version_immutable
  on public.supplier_bill_ucl_container_versions;
create trigger guard_supplier_bill_ucl_container_version_immutable
before update or delete on public.supplier_bill_ucl_container_versions
for each row execute function public.guard_supplier_bill_ucl_container_version_immutable();

alter table public.supplier_bill_ucl_current_state
  add column if not exists current_version_id uuid null,
  add column if not exists supplier_id uuid null,
  add column if not exists project_ids uuid[] not null default '{}',
  add column if not exists primary_project_id uuid null,
  add column if not exists visibility_scope_hash text null;

alter table public.supplier_bill_ucl_current_state
  drop constraint if exists supplier_bill_ucl_current_state_current_version_fkey;
alter table public.supplier_bill_ucl_current_state
  add constraint supplier_bill_ucl_current_state_current_version_fkey
  foreign key (current_version_id, organization_id, container_type, source_id)
  references public.supplier_bill_ucl_container_versions
    (id, organization_id, container_type, source_id)
  on delete restrict;

alter table public.supplier_bill_ucl_current_state
  drop constraint if exists supplier_bill_ucl_current_state_pointer_shape_check;
alter table public.supplier_bill_ucl_current_state
  add constraint supplier_bill_ucl_current_state_pointer_shape_check check (
    (
      context_status in ('current', 'voided')
      and current_version_id is not null
      and schema_version = 'supplier_bill.v2'
      and content_hash ~ '^[0-9a-f]{64}$'
      and visibility_scope_hash ~ '^[0-9a-f]{64}$'
      and deleted_at is null
    )
    or (
      context_status = 'deleted'
      and current_version_id is null
      and schema_version is null
      and builder_version is null
      and content_hash is null
      and canonical_updated_at is null
      and latest_dependency_updated_at is null
      and payload_bytes is null
      and supplier_id is null
      and cardinality(project_ids) = 0
      and primary_project_id is null
      and visibility_scope_hash is null
      and deleted_at is not null
    )
  ) not valid;

create index if not exists supplier_bill_ucl_current_org_source_idx
  on public.supplier_bill_ucl_current_state (organization_id, source_id);

create index if not exists supplier_bill_ucl_current_org_supplier_idx
  on public.supplier_bill_ucl_current_state
  (organization_id, supplier_id, canonical_updated_at desc)
  where supplier_id is not null;

create index if not exists supplier_bill_ucl_current_org_status_idx
  on public.supplier_bill_ucl_current_state
  (organization_id, context_status, updated_at desc);

create index if not exists supplier_bill_ucl_current_version_idx
  on public.supplier_bill_ucl_current_state (current_version_id)
  where current_version_id is not null;

create index if not exists supplier_bill_ucl_current_project_ids_gin_idx
  on public.supplier_bill_ucl_current_state using gin (project_ids);

alter table public.supplier_bill_ucl_container_versions enable row level security;
alter table public.supplier_bill_ucl_container_versions force row level security;
alter table public.supplier_bill_ucl_container_version_holds enable row level security;
alter table public.supplier_bill_ucl_container_version_holds force row level security;

revoke all on public.supplier_bill_ucl_container_versions from public, anon, authenticated;
revoke all on public.supplier_bill_ucl_container_version_holds from public, anon, authenticated;
revoke all on public.supplier_bill_ucl_current_state from public, anon, authenticated;
revoke delete on public.supplier_bill_ucl_current_state from service_role;
grant select, insert on public.supplier_bill_ucl_container_versions to service_role;
grant select, insert on public.supplier_bill_ucl_container_version_holds to service_role;
grant select, insert, update on public.supplier_bill_ucl_current_state to service_role;

create or replace function public.persist_supplier_bill_ucl_container(
  p_queue_id uuid,
  p_lease_token uuid,
  p_organization_id uuid,
  p_source_id uuid,
  p_container_type text,
  p_schema_version text,
  p_builder_version text,
  p_content_hash text,
  p_payload_integrity_hash text,
  p_canonical_updated_at timestamptz,
  p_latest_dependency_updated_at timestamptz,
  p_assembled_at timestamptz,
  p_validated_at timestamptz,
  p_payload_bytes integer,
  p_payload_json jsonb,
  p_visibility_json jsonb,
  p_project_ids uuid[],
  p_primary_project_id uuid,
  p_supplier_id uuid,
  p_visibility_scope_hash text,
  p_context_status text,
  p_refresh_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  queue_row public.supplier_bill_ucl_refresh_queue%rowtype;
  current_row public.supplier_bill_ucl_current_state%rowtype;
  version_id uuid;
  inserted_version_id uuid;
  normalized_project_ids uuid[];
  payload_project_ids uuid[];
  created_version boolean := false;
  content_changed boolean := true;
  stale_write boolean := false;
  milestone_codes text[] := '{}';
  version_count integer := 0;
begin
  select *
  into queue_row
  from public.supplier_bill_ucl_refresh_queue q
  where q.id = p_queue_id
    and q.queue_state = 'leased'
    and q.lease_token = p_lease_token
    and q.organization_id = p_organization_id
    and q.source_id = p_source_id
    and q.container_type = 'supplier_invoice'
  for update;

  if not found then
    raise exception 'Supplier Bill UCL persistence lease is not owned by this worker.'
      using errcode = 'P0001';
  end if;
  if p_refresh_reason is distinct from queue_row.reason_code then
    raise exception 'Supplier Bill UCL refresh reason does not match the leased request.'
      using errcode = '22023';
  end if;

  if p_container_type <> 'supplier_invoice' or p_schema_version <> 'supplier_bill.v2' then
    raise exception 'Unsupported Supplier Bill UCL container identity.'
      using errcode = '22023';
  end if;
  if p_context_status not in ('current', 'voided') then
    raise exception 'Unsupported Supplier Bill UCL context status.'
      using errcode = '22023';
  end if;
  if p_builder_version is null or char_length(btrim(p_builder_version)) not between 1 and 120
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or p_payload_integrity_hash !~ '^[0-9a-f]{64}$'
    or p_visibility_scope_hash !~ '^[0-9a-f]{64}$'
    or p_payload_bytes not between 1 and 65536
    or jsonb_typeof(p_payload_json) <> 'object'
    or jsonb_typeof(p_visibility_json) <> 'object'
    or p_canonical_updated_at is null
    or p_latest_dependency_updated_at is null
    or p_latest_dependency_updated_at < p_canonical_updated_at
    or p_assembled_at is null
    or p_validated_at is null then
    raise exception 'Supplier Bill UCL persistence metadata is invalid.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.supplier_invoices i
    where i.id = p_source_id
      and i.organization_id = p_organization_id
  ) then
    raise exception 'Canonical Supplier Bill identity does not match persistence scope.'
      using errcode = '23503';
  end if;

  if p_payload_json->>'containerType' <> 'supplier_invoice'
    or p_payload_json->>'organizationId' <> p_organization_id::text
    or p_payload_json #>> '{source,sourceId}' <> p_source_id::text
    or p_payload_json #>> '{payload,schemaVersion}' <> 'supplier_bill.v2'
    or p_payload_json #>> '{payload,lineage,supplierBillId}' <> p_source_id::text
    or p_payload_json #>> '{payload,provenance,builderVersion}' <> p_builder_version
    or p_payload_json #>> '{payload,provenance,contentHash}' <> p_content_hash
    or p_payload_json #>> '{payload,visibility,organizationId}' <> p_organization_id::text
    or p_payload_json #> '{payload,visibility}' <> p_visibility_json then
    raise exception 'Supplier Bill UCL payload identity does not match persistence metadata.'
      using errcode = '22023';
  end if;

  if nullif(p_payload_json->>'supplierId', '') is distinct from p_supplier_id::text
    or nullif(p_payload_json->>'projectId', '') is distinct from p_primary_project_id::text then
    raise exception 'Supplier Bill UCL relationship identity does not match persistence metadata.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(project_id order by project_id), '{}'::uuid[])
  into normalized_project_ids
  from (
    select distinct unnest(coalesce(p_project_ids, '{}'::uuid[])) as project_id
  ) normalized;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[])
  into payload_project_ids
  from jsonb_array_elements_text(p_payload_json #> '{payload,visibility,projectIds}') value;

  if normalized_project_ids is distinct from payload_project_ids then
    raise exception 'Supplier Bill UCL project visibility does not match persistence metadata.'
      using errcode = '22023';
  end if;

  -- Serialize every writer for this stable identity, including the first
  -- version where no current row exists yet. This makes equal-timestamp hash
  -- precedence deterministic under concurrent workers.
  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':supplier_invoice:' || p_source_id::text,
    0
  ));

  select *
  into current_row
  from public.supplier_bill_ucl_current_state c
  where c.organization_id = p_organization_id
    and c.container_type = 'supplier_invoice'
    and c.source_id = p_source_id
  for update;

  if found and current_row.current_version_id is not null then
    content_changed := current_row.content_hash is distinct from p_content_hash;
    stale_write :=
      p_latest_dependency_updated_at < current_row.latest_dependency_updated_at
      or (
        p_latest_dependency_updated_at = current_row.latest_dependency_updated_at
        and p_canonical_updated_at < current_row.canonical_updated_at
      )
      or (
        p_latest_dependency_updated_at = current_row.latest_dependency_updated_at
        and p_canonical_updated_at = current_row.canonical_updated_at
        and p_content_hash < current_row.content_hash
      );
  end if;

  if stale_write then
    return jsonb_build_object(
      'createdVersion', false,
      'reusedVersion', false,
      'currentUpdated', false,
      'contentChanged', false,
      'staleWriteRejected', true,
      'versionId', current_row.current_version_id,
      'currentHash', current_row.content_hash,
      'versionCount', null,
      'payloadBytes', current_row.payload_bytes,
      'contextStatus', current_row.context_status
    );
  end if;

  if p_refresh_reason in (
    'supplier_bill_accounts_approval_changed',
    'supplier_bill_commercial_approval_changed',
    'supplier_bill_commercial_snapshot_changed',
    'supplier_bill_actual_cost_changed',
    'supplier_bill_xero_export_changed',
    'supplier_bill_payment_changed',
    'supplier_bill_voided'
  ) then
    milestone_codes := array[p_refresh_reason];
  end if;

  insert into public.supplier_bill_ucl_container_versions (
    organization_id,
    container_type,
    source_id,
    schema_version,
    builder_version,
    content_hash,
    payload_integrity_hash,
    canonical_updated_at,
    latest_dependency_updated_at,
    assembled_at,
    validated_at,
    payload_bytes,
    payload_json,
    visibility_json,
    project_ids,
    primary_project_id,
    supplier_id,
    visibility_scope_hash,
    context_status,
    milestone_codes
  ) values (
    p_organization_id,
    'supplier_invoice',
    p_source_id,
    'supplier_bill.v2',
    p_builder_version,
    p_content_hash,
    p_payload_integrity_hash,
    p_canonical_updated_at,
    p_latest_dependency_updated_at,
    p_assembled_at,
    p_validated_at,
    p_payload_bytes,
    p_payload_json,
    p_visibility_json,
    normalized_project_ids,
    p_primary_project_id,
    p_supplier_id,
    p_visibility_scope_hash,
    p_context_status,
    milestone_codes
  )
  on conflict (organization_id, container_type, source_id, schema_version, content_hash)
  do nothing
  returning id into inserted_version_id;

  if inserted_version_id is not null then
    version_id := inserted_version_id;
    created_version := true;
  else
    select v.id
    into version_id
    from public.supplier_bill_ucl_container_versions v
    where v.organization_id = p_organization_id
      and v.container_type = 'supplier_invoice'
      and v.source_id = p_source_id
      and v.schema_version = 'supplier_bill.v2'
      and v.content_hash = p_content_hash;
  end if;

  if version_id is null then
    raise exception 'Supplier Bill UCL version could not be resolved.'
      using errcode = 'P0001';
  end if;

  insert into public.supplier_bill_ucl_current_state (
    organization_id,
    container_type,
    source_id,
    current_version_id,
    schema_version,
    builder_version,
    content_hash,
    canonical_updated_at,
    latest_dependency_updated_at,
    validated_at,
    payload_bytes,
    context_status,
    supplier_id,
    project_ids,
    primary_project_id,
    visibility_scope_hash,
    last_refresh_reason,
    deleted_at
  ) values (
    p_organization_id,
    'supplier_invoice',
    p_source_id,
    version_id,
    'supplier_bill.v2',
    p_builder_version,
    p_content_hash,
    p_canonical_updated_at,
    p_latest_dependency_updated_at,
    p_validated_at,
    p_payload_bytes,
    p_context_status,
    p_supplier_id,
    normalized_project_ids,
    p_primary_project_id,
    p_visibility_scope_hash,
    p_refresh_reason,
    null
  )
  on conflict (organization_id, container_type, source_id)
  do update set
    current_version_id = excluded.current_version_id,
    schema_version = excluded.schema_version,
    builder_version = excluded.builder_version,
    content_hash = excluded.content_hash,
    canonical_updated_at = excluded.canonical_updated_at,
    latest_dependency_updated_at = excluded.latest_dependency_updated_at,
    validated_at = excluded.validated_at,
    payload_bytes = excluded.payload_bytes,
    context_status = excluded.context_status,
    supplier_id = excluded.supplier_id,
    project_ids = excluded.project_ids,
    primary_project_id = excluded.primary_project_id,
    visibility_scope_hash = excluded.visibility_scope_hash,
    last_refresh_reason = excluded.last_refresh_reason,
    deleted_at = null,
    updated_at = now();

  select count(*)::integer
  into version_count
  from public.supplier_bill_ucl_container_versions v
  where v.organization_id = p_organization_id
    and v.container_type = 'supplier_invoice'
    and v.source_id = p_source_id;

  return jsonb_build_object(
    'createdVersion', created_version,
    'reusedVersion', not created_version,
    'currentUpdated', true,
    'contentChanged', content_changed,
    'staleWriteRejected', false,
    'versionId', version_id,
    'currentHash', p_content_hash,
    'versionCount', version_count,
    'payloadBytes', p_payload_bytes,
    'contextStatus', p_context_status
  );
end;
$$;

create or replace function public.delete_supplier_bill_ucl_current_container(
  p_queue_id uuid,
  p_lease_token uuid,
  p_organization_id uuid,
  p_source_id uuid,
  p_refresh_reason text,
  p_deletion_evidence_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  queue_row public.supplier_bill_ucl_refresh_queue%rowtype;
  historical_count integer := 0;
begin
  select *
  into queue_row
  from public.supplier_bill_ucl_refresh_queue q
  where q.id = p_queue_id
    and q.queue_state = 'leased'
    and q.lease_token = p_lease_token
    and q.organization_id = p_organization_id
    and q.source_id = p_source_id
  for update;

  if not found then
    raise exception 'Supplier Bill UCL deletion lease is not owned by this worker.'
      using errcode = 'P0001';
  end if;
  if p_refresh_reason <> 'supplier_bill_deleted'
    or p_refresh_reason is distinct from queue_row.reason_code then
    raise exception 'Supplier Bill UCL deletion reason does not match the leased request.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':supplier_invoice:' || p_source_id::text,
    0
  ));
  if p_deletion_evidence_at is null
    or queue_row.deletion_evidence_at is null
    or exists (select 1 from public.supplier_invoices i where i.id = p_source_id) then
    raise exception 'Supplier Bill UCL deletion is not canonically proven.'
      using errcode = '22023';
  end if;

  insert into public.supplier_bill_ucl_current_state (
    organization_id,
    container_type,
    source_id,
    current_version_id,
    schema_version,
    builder_version,
    content_hash,
    canonical_updated_at,
    latest_dependency_updated_at,
    validated_at,
    payload_bytes,
    context_status,
    supplier_id,
    project_ids,
    primary_project_id,
    visibility_scope_hash,
    last_refresh_reason,
    deleted_at
  ) values (
    p_organization_id,
    'supplier_invoice',
    p_source_id,
    null,
    null,
    null,
    null,
    null,
    null,
    now(),
    null,
    'deleted',
    null,
    '{}',
    null,
    null,
    p_refresh_reason,
    p_deletion_evidence_at
  )
  on conflict (organization_id, container_type, source_id)
  do update set
    current_version_id = null,
    schema_version = null,
    builder_version = null,
    content_hash = null,
    canonical_updated_at = null,
    latest_dependency_updated_at = null,
    validated_at = now(),
    payload_bytes = null,
    context_status = 'deleted',
    supplier_id = null,
    project_ids = '{}',
    primary_project_id = null,
    visibility_scope_hash = null,
    last_refresh_reason = excluded.last_refresh_reason,
    deleted_at = excluded.deleted_at,
    updated_at = now();

  select count(*)::integer
  into historical_count
  from public.supplier_bill_ucl_container_versions v
  where v.organization_id = p_organization_id
    and v.container_type = 'supplier_invoice'
    and v.source_id = p_source_id;

  return jsonb_build_object(
    'createdVersion', false,
    'reusedVersion', false,
    'currentUpdated', true,
    'contentChanged', true,
    'staleWriteRejected', false,
    'versionId', null,
    'currentHash', null,
    'versionCount', historical_count,
    'payloadBytes', null,
    'contextStatus', 'deleted'
  );
end;
$$;

alter table public.supplier_bill_ucl_refresh_queue
  drop constraint if exists supplier_bill_ucl_refresh_queue_result_check;
alter table public.supplier_bill_ucl_refresh_queue
  add constraint supplier_bill_ucl_refresh_queue_result_check
  check (refresh_result is null or refresh_result in ('changed', 'no_change', 'voided', 'deleted', 'stale'));

create or replace function public.finalize_supplier_bill_ucl_refresh_stale(
  p_queue_id uuid,
  p_lease_token uuid
)
returns public.supplier_bill_ucl_refresh_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  queued public.supplier_bill_ucl_refresh_queue%rowtype;
begin
  update public.supplier_bill_ucl_refresh_queue q
  set
    queue_state = 'completed',
    lease_owner = null,
    lease_token = null,
    leased_at = null,
    lease_expires_at = null,
    completed_at = now(),
    last_error_code = 'supplier_bill_ucl_stale_write_rejected',
    last_error_summary = 'An older validated rebuild was prevented from replacing newer current context.',
    refresh_result = 'stale',
    updated_at = now()
  where q.id = p_queue_id
    and q.queue_state = 'leased'
    and q.lease_token = p_lease_token
  returning * into queued;

  if queued.id is null then
    raise exception 'Supplier Bill refresh lease is not owned by this worker.'
      using errcode = 'P0001';
  end if;
  return queued;
end;
$$;

create or replace function public.get_supplier_bill_ucl_refresh_metrics(
  p_organization_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pendingCount', count(*) filter (where q.queue_state = 'pending'),
    'retryWaitCount', count(*) filter (where q.queue_state = 'retry_wait'),
    'leasedCount', count(*) filter (where q.queue_state = 'leased'),
    'deadLetterCount', count(*) filter (where q.queue_state = 'dead_letter'),
    'completedCount', count(*) filter (where q.queue_state = 'completed'),
    'noChangeCount', count(*) filter (where q.refresh_result = 'no_change'),
    'deletionCount', count(*) filter (where q.refresh_result = 'deleted'),
    'staleWriteRejectedCount', count(*) filter (where q.refresh_result = 'stale'),
    'oldestPendingAt', min(q.first_requested_at) filter (
      where q.queue_state in ('pending', 'retry_wait')
    ),
    'averageSuccessfulLatencySeconds', coalesce(avg(
      extract(epoch from (q.completed_at - q.first_requested_at))
    ) filter (where q.queue_state in ('completed', 'deleted')), 0),
    'versionCount', (
      select count(*)
      from public.supplier_bill_ucl_container_versions v
      where p_organization_id is null or v.organization_id = p_organization_id
    ),
    'currentPointerCount', (
      select count(*)
      from public.supplier_bill_ucl_current_state c
      where (p_organization_id is null or c.organization_id = p_organization_id)
        and c.current_version_id is not null
    ),
    'persistedPayloadBytes', coalesce((
      select sum(v.payload_bytes)
      from public.supplier_bill_ucl_container_versions v
      where p_organization_id is null or v.organization_id = p_organization_id
    ), 0),
    'currentStatusCounts', coalesce((
      select jsonb_object_agg(context_status, status_count)
      from (
        select c.context_status, count(*)::bigint as status_count
        from public.supplier_bill_ucl_current_state c
        where p_organization_id is null or c.organization_id = p_organization_id
        group by c.context_status
      ) grouped_statuses
    ), '{}'::jsonb),
    'attemptsByReason', coalesce((
      select jsonb_object_agg(reason_code, attempts)
      from (
        select reason_code, sum(attempt_count)::bigint as attempts
        from public.supplier_bill_ucl_refresh_queue r
        where p_organization_id is null or r.organization_id = p_organization_id
        group by reason_code
      ) grouped_reasons
    ), '{}'::jsonb),
    'failuresByCode', coalesce((
      select jsonb_object_agg(last_error_code, failures)
      from (
        select last_error_code, count(*)::bigint as failures
        from public.supplier_bill_ucl_refresh_queue r
        where (p_organization_id is null or r.organization_id = p_organization_id)
          and last_error_code is not null
        group by last_error_code
      ) grouped_failures
    ), '{}'::jsonb)
  )
  from public.supplier_bill_ucl_refresh_queue q
  where p_organization_id is null or q.organization_id = p_organization_id;
$$;

create or replace function public.preview_supplier_bill_ucl_container_retention(
  p_organization_id uuid default null,
  p_source_id uuid default null,
  p_as_of timestamptz default now()
)
returns table (
  version_id uuid,
  organization_id uuid,
  source_id uuid,
  content_hash text,
  created_at timestamptz,
  age_days integer,
  version_rank bigint
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      v.*,
      row_number() over (
        partition by v.organization_id, v.container_type, v.source_id
        order by v.created_at desc, v.id desc
      ) as version_rank
    from public.supplier_bill_ucl_container_versions v
    where (p_organization_id is null or v.organization_id = p_organization_id)
      and (p_source_id is null or v.source_id = p_source_id)
  )
  select
    r.id,
    r.organization_id,
    r.source_id,
    r.content_hash,
    r.created_at,
    floor(extract(epoch from (p_as_of - r.created_at)) / 86400)::integer,
    r.version_rank
  from ranked r
  left join public.supplier_bill_ucl_current_state c
    on c.organization_id = r.organization_id
    and c.container_type = r.container_type
    and c.source_id = r.source_id
  where r.created_at < p_as_of - interval '90 days'
    and r.version_rank > 25
    and r.retention_hold = false
    and cardinality(r.milestone_codes) = 0
    and r.id is distinct from c.current_version_id
    and not exists (
      select 1
      from public.supplier_bill_ucl_container_version_holds h
      where h.version_id = r.id
        and h.organization_id = r.organization_id
    )
  order by r.organization_id, r.source_id, r.created_at, r.id;
$$;

revoke all on function public.guard_supplier_bill_ucl_container_version_immutable()
  from public, anon, authenticated;
revoke all on function public.persist_supplier_bill_ucl_container(
  uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz, timestamptz,
  timestamptz, timestamptz, integer, jsonb, jsonb, uuid[], uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.delete_supplier_bill_ucl_current_container(
  uuid, uuid, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.finalize_supplier_bill_ucl_refresh_stale(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.preview_supplier_bill_ucl_container_retention(uuid, uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.persist_supplier_bill_ucl_container(
  uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz, timestamptz,
  timestamptz, timestamptz, integer, jsonb, jsonb, uuid[], uuid, uuid, text, text, text
) to service_role;
grant execute on function public.delete_supplier_bill_ucl_current_container(
  uuid, uuid, uuid, uuid, text, timestamptz
) to service_role;
grant execute on function public.finalize_supplier_bill_ucl_refresh_stale(uuid, uuid)
  to service_role;
grant execute on function public.preview_supplier_bill_ucl_container_retention(uuid, uuid, timestamptz)
  to service_role;

commit;
