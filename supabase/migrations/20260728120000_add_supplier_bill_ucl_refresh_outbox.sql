-- Supplier Bill UCL v2 post-commit freshness.
--
-- The outbox stores only source identity, safe lifecycle metadata, hashes and
-- validation diagnostics. It never stores a canonical or prompt payload.

begin;

create table if not exists public.supplier_bill_ucl_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  container_type text not null default 'supplier_invoice',
  source_id uuid not null,
  reason_code text not null,
  priority smallint not null default 50,
  queue_state text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  lease_owner text null,
  lease_token uuid null,
  leased_at timestamptz null,
  lease_expires_at timestamptz null,
  first_requested_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  deletion_evidence_at timestamptz null,
  completed_at timestamptz null,
  first_failed_at timestamptz null,
  last_failed_at timestamptz null,
  last_error_code text null,
  last_error_summary text null,
  schema_version text null,
  builder_version text null,
  content_hash text null,
  canonical_updated_at timestamptz null,
  latest_dependency_updated_at timestamptz null,
  validated_at timestamptz null,
  payload_bytes integer null,
  refresh_result text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_bill_ucl_refresh_queue_container_check
    check (container_type = 'supplier_invoice'),
  constraint supplier_bill_ucl_refresh_queue_state_check
    check (queue_state in ('pending', 'leased', 'retry_wait', 'completed', 'dead_letter', 'deleted')),
  constraint supplier_bill_ucl_refresh_queue_reason_check
    check (reason_code in (
      'supplier_bill_created',
      'supplier_bill_header_changed',
      'supplier_bill_lines_changed',
      'supplier_bill_supplier_changed',
      'supplier_bill_project_scope_changed',
      'supplier_bill_document_changed',
      'supplier_bill_extraction_changed',
      'supplier_bill_po_match_changed',
      'supplier_bill_allocation_changed',
      'supplier_bill_routing_changed',
      'supplier_bill_site_review_changed',
      'supplier_bill_accounts_approval_changed',
      'supplier_bill_commercial_approval_changed',
      'supplier_bill_commercial_snapshot_changed',
      'supplier_bill_variance_changed',
      'supplier_bill_actual_cost_changed',
      'supplier_bill_xero_export_changed',
      'supplier_bill_xero_attachment_changed',
      'supplier_bill_payment_changed',
      'supplier_bill_voided',
      'supplier_bill_deleted',
      'supplier_bill_manual_refresh'
    )),
  constraint supplier_bill_ucl_refresh_queue_priority_check check (priority between 0 and 100),
  constraint supplier_bill_ucl_refresh_queue_attempt_check
    check (attempt_count >= 0 and max_attempts between 1 and 20),
  constraint supplier_bill_ucl_refresh_queue_payload_bytes_check
    check (payload_bytes is null or payload_bytes >= 0),
  constraint supplier_bill_ucl_refresh_queue_error_code_check
    check (last_error_code is null or char_length(last_error_code) <= 120),
  constraint supplier_bill_ucl_refresh_queue_error_summary_check
    check (last_error_summary is null or char_length(last_error_summary) <= 500),
  constraint supplier_bill_ucl_refresh_queue_result_check
    check (refresh_result is null or refresh_result in ('changed', 'no_change', 'voided', 'deleted'))
);

create unique index if not exists supplier_bill_ucl_refresh_queue_identity_uidx
  on public.supplier_bill_ucl_refresh_queue (organization_id, container_type, source_id);

create index if not exists supplier_bill_ucl_refresh_queue_claim_idx
  on public.supplier_bill_ucl_refresh_queue (
    queue_state,
    available_at,
    priority desc,
    first_requested_at,
    source_id
  )
  where queue_state in ('pending', 'leased', 'retry_wait');

create index if not exists supplier_bill_ucl_refresh_queue_dead_letter_idx
  on public.supplier_bill_ucl_refresh_queue (last_failed_at desc, organization_id, source_id)
  where queue_state = 'dead_letter';

create table if not exists public.supplier_bill_ucl_current_state (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  container_type text not null default 'supplier_invoice',
  source_id uuid not null,
  schema_version text null,
  builder_version text null,
  content_hash text null,
  canonical_updated_at timestamptz null,
  latest_dependency_updated_at timestamptz null,
  validated_at timestamptz not null default now(),
  payload_bytes integer null,
  context_status text not null,
  last_refresh_reason text not null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, container_type, source_id),
  constraint supplier_bill_ucl_current_state_container_check
    check (container_type = 'supplier_invoice'),
  constraint supplier_bill_ucl_current_state_status_check
    check (context_status in ('current', 'voided', 'deleted')),
  constraint supplier_bill_ucl_current_state_payload_bytes_check
    check (payload_bytes is null or payload_bytes >= 0),
  constraint supplier_bill_ucl_current_state_deleted_shape_check
    check (
      context_status <> 'deleted'
      or (
        deleted_at is not null
        and schema_version is null
        and builder_version is null
        and content_hash is null
        and canonical_updated_at is null
        and latest_dependency_updated_at is null
        and payload_bytes is null
      )
    )
);

create index if not exists supplier_bill_ucl_current_state_hash_idx
  on public.supplier_bill_ucl_current_state (organization_id, content_hash)
  where context_status in ('current', 'voided');

drop trigger if exists set_supplier_bill_ucl_refresh_queue_updated_at
  on public.supplier_bill_ucl_refresh_queue;
create trigger set_supplier_bill_ucl_refresh_queue_updated_at
before update on public.supplier_bill_ucl_refresh_queue
for each row execute function public.set_updated_at();

drop trigger if exists set_supplier_bill_ucl_current_state_updated_at
  on public.supplier_bill_ucl_current_state;
create trigger set_supplier_bill_ucl_current_state_updated_at
before update on public.supplier_bill_ucl_current_state
for each row execute function public.set_updated_at();

alter table public.supplier_bill_ucl_refresh_queue enable row level security;
alter table public.supplier_bill_ucl_refresh_queue force row level security;
alter table public.supplier_bill_ucl_current_state enable row level security;
alter table public.supplier_bill_ucl_current_state force row level security;

revoke all on public.supplier_bill_ucl_refresh_queue from public, anon, authenticated;
revoke all on public.supplier_bill_ucl_current_state from public, anon, authenticated;
grant select, insert, update, delete on public.supplier_bill_ucl_refresh_queue to service_role;
grant select, insert, update, delete on public.supplier_bill_ucl_current_state to service_role;

create or replace function public._enqueue_supplier_bill_ucl_refresh(
  p_organization_id uuid,
  p_source_id uuid,
  p_reason_code text,
  p_priority integer,
  p_confirmed_deletion boolean default false
)
returns public.supplier_bill_ucl_refresh_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  queued public.supplier_bill_ucl_refresh_queue%rowtype;
  source_exists boolean;
begin
  if p_organization_id is null or p_source_id is null then
    return null;
  end if;

  select exists (
    select 1
    from public.supplier_invoices i
    where i.organization_id = p_organization_id
      and i.id = p_source_id
  ) into source_exists;

  -- Cascade child triggers can run after the parent row has disappeared. The
  -- parent DELETE trigger is the only trigger permitted to assert deletion.
  if not source_exists and not coalesce(p_confirmed_deletion, false) then
    return null;
  end if;

  insert into public.supplier_bill_ucl_refresh_queue (
    organization_id,
    container_type,
    source_id,
    reason_code,
    priority,
    queue_state,
    attempt_count,
    available_at,
    first_requested_at,
    last_requested_at,
    deletion_evidence_at,
    completed_at,
    lease_owner,
    lease_token,
    leased_at,
    lease_expires_at,
    last_error_code,
    last_error_summary,
    refresh_result
  ) values (
    p_organization_id,
    'supplier_invoice',
    p_source_id,
    p_reason_code,
    least(greatest(coalesce(p_priority, 50), 0), 100),
    'pending',
    0,
    now(),
    now(),
    now(),
    case when p_confirmed_deletion then now() else null end,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  )
  on conflict (organization_id, container_type, source_id)
  do update set
    reason_code = case
      when public.supplier_bill_ucl_refresh_queue.queue_state in ('completed', 'deleted')
        or excluded.priority >= public.supplier_bill_ucl_refresh_queue.priority
        then excluded.reason_code
      else public.supplier_bill_ucl_refresh_queue.reason_code
    end,
    priority = case
      when public.supplier_bill_ucl_refresh_queue.queue_state in ('completed', 'deleted')
        then excluded.priority
      else greatest(public.supplier_bill_ucl_refresh_queue.priority, excluded.priority)
    end,
    queue_state = case
      when public.supplier_bill_ucl_refresh_queue.queue_state = 'dead_letter' then 'dead_letter'
      else 'pending'
    end,
    attempt_count = case
      when public.supplier_bill_ucl_refresh_queue.queue_state in ('completed', 'deleted', 'leased', 'retry_wait')
        then 0
      else public.supplier_bill_ucl_refresh_queue.attempt_count
    end,
    available_at = now(),
    first_requested_at = case
      when public.supplier_bill_ucl_refresh_queue.queue_state in ('completed', 'deleted')
        then now()
      else public.supplier_bill_ucl_refresh_queue.first_requested_at
    end,
    last_requested_at = now(),
    deletion_evidence_at = case
      when p_confirmed_deletion then now()
      when source_exists then null
      else public.supplier_bill_ucl_refresh_queue.deletion_evidence_at
    end,
    completed_at = null,
    lease_owner = null,
    lease_token = null,
    leased_at = null,
    lease_expires_at = null,
    last_error_code = case
      when public.supplier_bill_ucl_refresh_queue.queue_state = 'dead_letter'
        then public.supplier_bill_ucl_refresh_queue.last_error_code
      else null
    end,
    last_error_summary = case
      when public.supplier_bill_ucl_refresh_queue.queue_state = 'dead_letter'
        then public.supplier_bill_ucl_refresh_queue.last_error_summary
      else null
    end,
    refresh_result = null,
    updated_at = now()
  returning * into queued;

  return queued;
end;
$$;

create or replace function public.enqueue_supplier_bill_ucl_refresh(
  p_source_id uuid,
  p_reason_code text default 'supplier_bill_manual_refresh',
  p_priority integer default 10
)
returns public.supplier_bill_ucl_refresh_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid;
begin
  select i.organization_id
  into resolved_organization_id
  from public.supplier_invoices i
  where i.id = p_source_id;

  if resolved_organization_id is null then
    raise exception 'Canonical Supplier Bill not found.'
      using errcode = 'P0002';
  end if;

  return public._enqueue_supplier_bill_ucl_refresh(
    resolved_organization_id,
    p_source_id,
    p_reason_code,
    p_priority,
    false
  );
end;
$$;

create or replace function public.claim_supplier_bill_ucl_refresh_batch(
  p_limit integer default 10,
  p_organization_id uuid default null,
  p_worker_id text default null,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  resolved_worker text :=
    coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'supplier-bill-ucl-refresh-worker');
  resolved_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 900), 30), 3600);
begin
  with candidates as (
    select q.id
    from public.supplier_bill_ucl_refresh_queue q
    where (p_organization_id is null or q.organization_id = p_organization_id)
      and q.attempt_count < q.max_attempts
      and q.available_at <= now()
      and (
        q.queue_state in ('pending', 'retry_wait')
        or (
          q.queue_state = 'leased'
          and (q.lease_expires_at is null or q.lease_expires_at <= now())
        )
      )
    order by q.priority desc, q.first_requested_at asc, q.source_id asc
    limit least(greatest(coalesce(p_limit, 10), 1), 100)
    for update skip locked
  ),
  claimed as (
    update public.supplier_bill_ucl_refresh_queue q
    set
      queue_state = 'leased',
      attempt_count = q.attempt_count + 1,
      lease_owner = resolved_worker,
      lease_token = gen_random_uuid(),
      leased_at = now(),
      lease_expires_at = now() + make_interval(secs => resolved_lease_seconds),
      updated_at = now()
    from candidates c
    where q.id = c.id
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'organizationId', c.organization_id,
    'containerType', c.container_type,
    'sourceId', c.source_id,
    'reasonCode', c.reason_code,
    'priority', c.priority,
    'queueState', c.queue_state,
    'attemptCount', c.attempt_count,
    'maxAttempts', c.max_attempts,
    'availableAt', c.available_at,
    'leaseOwner', c.lease_owner,
    'leaseToken', c.lease_token,
    'leaseExpiresAt', c.lease_expires_at,
    'firstRequestedAt', c.first_requested_at,
    'lastRequestedAt', c.last_requested_at,
    'deletionEvidenceAt', c.deletion_evidence_at,
    'contentHash', c.content_hash,
    'schemaVersion', c.schema_version,
    'builderVersion', c.builder_version
  ) order by c.priority desc, c.first_requested_at asc, c.source_id asc), '[]'::jsonb)
  into result
  from claimed c;

  return result;
end;
$$;

create or replace function public.finalize_supplier_bill_ucl_refresh(
  p_queue_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_retry_at timestamptz default null,
  p_error_code text default null,
  p_error_summary text default null,
  p_schema_version text default null,
  p_builder_version text default null,
  p_content_hash text default null,
  p_canonical_updated_at timestamptz default null,
  p_latest_dependency_updated_at timestamptz default null,
  p_payload_bytes integer default null
)
returns public.supplier_bill_ucl_refresh_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  queued public.supplier_bill_ucl_refresh_queue%rowtype;
  next_state text;
  result_code text;
begin
  select *
  into queued
  from public.supplier_bill_ucl_refresh_queue q
  where q.id = p_queue_id
    and q.queue_state = 'leased'
    and q.lease_token = p_lease_token
  for update;

  if not found then
    raise exception 'Supplier Bill refresh lease is not owned by this worker.'
      using errcode = 'P0001';
  end if;

  if p_outcome in ('changed', 'no_change', 'voided') then
    if p_schema_version <> 'supplier_bill.v2'
      or p_builder_version is null
      or p_content_hash is null
      or p_canonical_updated_at is null
      or p_latest_dependency_updated_at is null
      or p_payload_bytes is null
      or p_payload_bytes < 0 then
      raise exception 'Successful Supplier Bill refresh metadata is incomplete.';
    end if;

    insert into public.supplier_bill_ucl_current_state (
      organization_id,
      container_type,
      source_id,
      schema_version,
      builder_version,
      content_hash,
      canonical_updated_at,
      latest_dependency_updated_at,
      validated_at,
      payload_bytes,
      context_status,
      last_refresh_reason,
      deleted_at
    ) values (
      queued.organization_id,
      'supplier_invoice',
      queued.source_id,
      p_schema_version,
      p_builder_version,
      p_content_hash,
      p_canonical_updated_at,
      p_latest_dependency_updated_at,
      now(),
      p_payload_bytes,
      case when p_outcome = 'voided' then 'voided' else 'current' end,
      queued.reason_code,
      null
    )
    on conflict (organization_id, container_type, source_id)
    do update set
      schema_version = excluded.schema_version,
      builder_version = excluded.builder_version,
      content_hash = excluded.content_hash,
      canonical_updated_at = excluded.canonical_updated_at,
      latest_dependency_updated_at = excluded.latest_dependency_updated_at,
      validated_at = excluded.validated_at,
      payload_bytes = excluded.payload_bytes,
      context_status = excluded.context_status,
      last_refresh_reason = excluded.last_refresh_reason,
      deleted_at = null,
      updated_at = now();

    next_state := 'completed';
    result_code := p_outcome;
  elsif p_outcome = 'deleted' then
    if queued.deletion_evidence_at is null then
      raise exception 'Supplier Bill deletion cannot be finalized without atomic deletion evidence.';
    end if;
    if exists (
      select 1
      from public.supplier_invoices i
      where i.id = queued.source_id
    ) then
      raise exception 'Supplier Bill deletion cannot be finalized while a canonical source exists.';
    end if;

    insert into public.supplier_bill_ucl_current_state (
      organization_id,
      container_type,
      source_id,
      schema_version,
      builder_version,
      content_hash,
      canonical_updated_at,
      latest_dependency_updated_at,
      validated_at,
      payload_bytes,
      context_status,
      last_refresh_reason,
      deleted_at
    ) values (
      queued.organization_id,
      'supplier_invoice',
      queued.source_id,
      null,
      null,
      null,
      null,
      null,
      now(),
      null,
      'deleted',
      queued.reason_code,
      now()
    )
    on conflict (organization_id, container_type, source_id)
    do update set
      schema_version = null,
      builder_version = null,
      content_hash = null,
      canonical_updated_at = null,
      latest_dependency_updated_at = null,
      validated_at = now(),
      payload_bytes = null,
      context_status = 'deleted',
      last_refresh_reason = excluded.last_refresh_reason,
      deleted_at = now(),
      updated_at = now();

    next_state := 'deleted';
    result_code := 'deleted';
  elsif p_outcome = 'retry' then
    next_state := case when queued.attempt_count >= queued.max_attempts then 'dead_letter' else 'retry_wait' end;
    result_code := null;
  elsif p_outcome = 'dead_letter' then
    next_state := 'dead_letter';
    result_code := null;
  else
    raise exception 'Unsupported Supplier Bill refresh outcome.';
  end if;

  update public.supplier_bill_ucl_refresh_queue q
  set
    queue_state = next_state,
    available_at = case
      when next_state = 'retry_wait' then greatest(coalesce(p_retry_at, now()), now())
      else q.available_at
    end,
    lease_owner = null,
    lease_token = null,
    leased_at = null,
    lease_expires_at = null,
    completed_at = case when next_state in ('completed', 'deleted') then now() else null end,
    first_failed_at = case
      when next_state in ('retry_wait', 'dead_letter') then coalesce(q.first_failed_at, now())
      else q.first_failed_at
    end,
    last_failed_at = case when next_state in ('retry_wait', 'dead_letter') then now() else q.last_failed_at end,
    last_error_code = case
      when next_state in ('retry_wait', 'dead_letter') then left(nullif(p_error_code, ''), 120)
      else null
    end,
    last_error_summary = case
      when next_state in ('retry_wait', 'dead_letter') then left(nullif(p_error_summary, ''), 500)
      else null
    end,
    schema_version = case when next_state = 'completed' then p_schema_version when next_state = 'deleted' then null else q.schema_version end,
    builder_version = case when next_state = 'completed' then p_builder_version when next_state = 'deleted' then null else q.builder_version end,
    content_hash = case when next_state = 'completed' then p_content_hash when next_state = 'deleted' then null else q.content_hash end,
    canonical_updated_at = case when next_state = 'completed' then p_canonical_updated_at when next_state = 'deleted' then null else q.canonical_updated_at end,
    latest_dependency_updated_at = case when next_state = 'completed' then p_latest_dependency_updated_at when next_state = 'deleted' then null else q.latest_dependency_updated_at end,
    validated_at = case when next_state = 'completed' then now() when next_state = 'deleted' then now() else q.validated_at end,
    payload_bytes = case when next_state = 'completed' then p_payload_bytes when next_state = 'deleted' then null else q.payload_bytes end,
    refresh_result = result_code,
    updated_at = now()
  where q.id = queued.id
  returning * into queued;

  return queued;
end;
$$;

create or replace function public.requeue_supplier_bill_ucl_refresh_dead_letter(
  p_queue_id uuid
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
    queue_state = 'pending',
    attempt_count = 0,
    available_at = now(),
    lease_owner = null,
    lease_token = null,
    leased_at = null,
    lease_expires_at = null,
    last_error_code = null,
    last_error_summary = null,
    updated_at = now()
  where q.id = p_queue_id
    and q.queue_state = 'dead_letter'
  returning * into queued;

  if queued.id is null then
    raise exception 'Dead-lettered Supplier Bill refresh row not found.';
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
    'oldestPendingAt', min(q.first_requested_at) filter (
      where q.queue_state in ('pending', 'retry_wait')
    ),
    'averageSuccessfulLatencySeconds', coalesce(avg(
      extract(epoch from (q.completed_at - q.first_requested_at))
    ) filter (where q.queue_state in ('completed', 'deleted')), 0),
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

revoke all on function public._enqueue_supplier_bill_ucl_refresh(uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.enqueue_supplier_bill_ucl_refresh(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.claim_supplier_bill_ucl_refresh_batch(integer, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.finalize_supplier_bill_ucl_refresh(
  uuid, uuid, text, timestamptz, text, text, text, text, text, timestamptz, timestamptz, integer
) from public, anon, authenticated;
revoke all on function public.requeue_supplier_bill_ucl_refresh_dead_letter(uuid)
  from public, anon, authenticated;
revoke all on function public.get_supplier_bill_ucl_refresh_metrics(uuid)
  from public, anon, authenticated;

grant execute on function public.enqueue_supplier_bill_ucl_refresh(uuid, text, integer) to service_role;
grant execute on function public.claim_supplier_bill_ucl_refresh_batch(integer, uuid, text, integer) to service_role;
grant execute on function public.finalize_supplier_bill_ucl_refresh(
  uuid, uuid, text, timestamptz, text, text, text, text, text, timestamptz, timestamptz, integer
) to service_role;
grant execute on function public.requeue_supplier_bill_ucl_refresh_dead_letter(uuid) to service_role;
grant execute on function public.get_supplier_bill_ucl_refresh_metrics(uuid) to service_role;

-- Direct Supplier Bill dependency rows.
create or replace function public._supplier_bill_ucl_direct_dependency_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  organization_id uuid := nullif(row_data->>'organization_id', '')::uuid;
  source_id uuid;
  reason_code text := tg_argv[0];
  priority integer := coalesce(nullif(tg_argv[1], '')::integer, 50);
begin
  if tg_table_name = 'supplier_invoices' then
    source_id := nullif(row_data->>'id', '')::uuid;
    if tg_op = 'INSERT' then
      reason_code := 'supplier_bill_created';
      priority := 50;
    elsif tg_op = 'DELETE' then
      reason_code := 'supplier_bill_deleted';
      priority := 100;
    elsif coalesce(new.status, '') is distinct from coalesce(old.status, '')
      and lower(coalesce(new.status, '')) in ('void', 'voided', 'cancelled', 'canceled') then
      reason_code := 'supplier_bill_voided';
      priority := 100;
    elsif new.supplier_id is distinct from old.supplier_id then
      reason_code := 'supplier_bill_supplier_changed';
      priority := 100;
    else
      reason_code := 'supplier_bill_header_changed';
      priority := 50;
    end if;
  else
    source_id := nullif(row_data->>'supplier_invoice_id', '')::uuid;
  end if;

  -- Removal of document, match, allocation or snapshot references is critical:
  -- a stale current context could otherwise continue to advertise removed data.
  if tg_op = 'DELETE' and tg_table_name in (
    'supplier_invoice_documents',
    'supplier_invoice_purchase_order_matches',
    'supplier_invoice_line_allocations',
    'supplier_invoice_commercial_line_snapshots'
  ) then
    priority := 100;
  end if;

  if tg_table_name = 'supplier_invoice_line_allocations' and tg_op = 'UPDATE' then
    if (to_jsonb(new) -> 'organization_cost_code_id') is distinct from (to_jsonb(old) -> 'organization_cost_code_id')
      or (to_jsonb(new) -> 'accounting_mapping_id') is distinct from (to_jsonb(old) -> 'accounting_mapping_id')
      or (to_jsonb(new) -> 'accounting_tax_rate_id') is distinct from (to_jsonb(old) -> 'accounting_tax_rate_id')
      or (to_jsonb(new) -> 'tradesstack_cost_code') is distinct from (to_jsonb(old) -> 'tradesstack_cost_code')
      or (to_jsonb(new) -> 'xero_account_code') is distinct from (to_jsonb(old) -> 'xero_account_code')
      or (to_jsonb(new) -> 'xero_tax_type') is distinct from (to_jsonb(old) -> 'xero_tax_type') then
      reason_code := 'supplier_bill_routing_changed';
      priority := 80;
    end if;
  end if;

  perform public._enqueue_supplier_bill_ucl_refresh(
    organization_id,
    source_id,
    reason_code,
    priority,
    tg_table_name = 'supplier_invoices' and tg_op = 'DELETE'
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Accounting documents need reason selection for Xero, attachment and payment state.
create or replace function public._supplier_bill_ucl_accounting_document_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  reason_code text := 'supplier_bill_xero_export_changed';
begin
  if row_data->>'local_document_type' <> 'supplier_invoice' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    (to_jsonb(new) -> 'amount_paid') is distinct from (to_jsonb(old) -> 'amount_paid')
    or (to_jsonb(new) -> 'amount_due') is distinct from (to_jsonb(old) -> 'amount_due')
    or (to_jsonb(new) -> 'fully_paid_at') is distinct from (to_jsonb(old) -> 'fully_paid_at')
    or (to_jsonb(new) -> 'normalized_external_status') is distinct from (to_jsonb(old) -> 'normalized_external_status')
    or (to_jsonb(new) -> 'last_status_sync_error') is distinct from (to_jsonb(old) -> 'last_status_sync_error')
  ) then
    reason_code := 'supplier_bill_payment_changed';
  elsif tg_op = 'UPDATE' and (
    (to_jsonb(new) -> 'attachment_status') is distinct from (to_jsonb(old) -> 'attachment_status')
  ) then
    reason_code := 'supplier_bill_xero_attachment_changed';
  end if;

  perform public._enqueue_supplier_bill_ucl_refresh(
    nullif(row_data->>'organization_id', '')::uuid,
    nullif(row_data->>'local_document_id', '')::uuid,
    reason_code,
    80,
    false
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public._supplier_bill_ucl_accounting_line_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  accounting_document record;
begin
  select d.organization_id, d.local_document_id
  into accounting_document
  from public.organization_accounting_documents d
  where d.local_document_type = 'supplier_invoice'
    and d.current_version_id = nullif(row_data->>'version_id', '')::uuid
  limit 1;

  if found then
    perform public._enqueue_supplier_bill_ucl_refresh(
      accounting_document.organization_id,
      accounting_document.local_document_id,
      'supplier_bill_routing_changed',
      80,
      false
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- PO changes can alter progressive matching evidence for several bills.
create or replace function public._supplier_bill_ucl_purchase_order_dependency_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  organization_id uuid := nullif(row_data->>'organization_id', '')::uuid;
  purchase_order_id uuid;
  purchase_order_line_id uuid;
  dependency record;
begin
  if tg_table_name = 'project_purchase_orders' then
    purchase_order_id := nullif(row_data->>'id', '')::uuid;
  else
    purchase_order_line_id := nullif(row_data->>'id', '')::uuid;
    purchase_order_id := nullif(row_data->>'purchase_order_id', '')::uuid;
  end if;

  for dependency in
    select distinct candidate.supplier_invoice_id
    from (
      select m.supplier_invoice_id
      from public.supplier_invoice_purchase_order_matches m
      where m.organization_id = organization_id
        and m.purchase_order_id = purchase_order_id
      union
      select a.supplier_invoice_id
      from public.supplier_invoice_line_allocations a
      where a.organization_id = organization_id
        and (
          a.purchase_order_id = purchase_order_id
          or (purchase_order_line_id is not null and a.purchase_order_line_item_id = purchase_order_line_id)
        )
      union
      select s.supplier_invoice_id
      from public.supplier_invoice_commercial_line_snapshots s
      where s.organization_id = organization_id
        and (
          s.purchase_order_id = purchase_order_id
          or (purchase_order_line_id is not null and s.purchase_order_line_item_id = purchase_order_line_id)
        )
      union
      select e.supplier_invoice_id
      from public.project_actual_cost_events e
      where e.organization_id = organization_id
        and (
          e.purchase_order_id = purchase_order_id
          or (purchase_order_line_id is not null and e.purchase_order_line_item_id = purchase_order_line_id)
        )
    ) candidate
    where candidate.supplier_invoice_id is not null
  loop
    perform public._enqueue_supplier_bill_ucl_refresh(
      organization_id,
      dependency.supplier_invoice_id,
      'supplier_bill_po_match_changed',
      80,
      false
    );
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public._supplier_bill_ucl_supplier_dependency_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  invoice record;
begin
  for invoice in
    select i.organization_id, i.id
    from public.supplier_invoices i
    where i.organization_id = nullif(row_data->>'organization_id', '')::uuid
      and i.supplier_id = nullif(row_data->>'id', '')::uuid
  loop
    perform public._enqueue_supplier_bill_ucl_refresh(
      invoice.organization_id,
      invoice.id,
      'supplier_bill_supplier_changed',
      100,
      false
    );
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public._supplier_bill_ucl_project_dependency_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  organization_id uuid := nullif(row_data->>'organization_id', '')::uuid;
  project_id uuid := nullif(row_data->>'id', '')::uuid;
  invoice record;
begin
  for invoice in
    select distinct candidate.supplier_invoice_id
    from (
      select l.supplier_invoice_id
      from public.supplier_invoice_lines l
      where l.organization_id = organization_id and l.project_id = project_id
      union
      select a.supplier_invoice_id
      from public.supplier_invoice_line_allocations a
      where a.organization_id = organization_id and a.project_id = project_id
      union
      select m.supplier_invoice_id
      from public.supplier_invoice_purchase_order_matches m
      join public.project_purchase_orders po on po.id = m.purchase_order_id
      where m.organization_id = organization_id and po.project_id = project_id
    ) candidate
  loop
    perform public._enqueue_supplier_bill_ucl_refresh(
      organization_id,
      invoice.supplier_invoice_id,
      'supplier_bill_project_scope_changed',
      100,
      false
    );
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Centralized direct dependency triggers. These capture RPC, service-role and
-- authenticated writes without coupling freshness to any UI action.
do $$
declare
  trigger_spec text[];
  table_name text;
  reason_code text;
  priority text;
begin
  foreach trigger_spec slice 1 in array array[
    array['supplier_invoices', 'supplier_bill_header_changed', '50'],
    array['supplier_invoice_lines', 'supplier_bill_lines_changed', '50'],
    array['supplier_invoice_documents', 'supplier_bill_document_changed', '50'],
    array['supplier_invoice_document_extractions', 'supplier_bill_extraction_changed', '50'],
    array['supplier_invoice_purchase_order_matches', 'supplier_bill_po_match_changed', '80'],
    array['supplier_invoice_line_allocations', 'supplier_bill_allocation_changed', '50'],
    array['supplier_invoice_site_review_submissions', 'supplier_bill_site_review_changed', '80'],
    array['supplier_invoice_site_review_decisions', 'supplier_bill_site_review_changed', '80'],
    array['supplier_invoice_accounts_approvals', 'supplier_bill_accounts_approval_changed', '80'],
    array['supplier_invoice_commercial_approvals', 'supplier_bill_commercial_approval_changed', '80'],
    array['supplier_invoice_commercial_line_snapshots', 'supplier_bill_commercial_snapshot_changed', '80'],
    array['supplier_invoice_commercial_variances', 'supplier_bill_variance_changed', '80'],
    array['supplier_invoice_activity_events', 'supplier_bill_header_changed', '50'],
    array['project_actual_cost_events', 'supplier_bill_actual_cost_changed', '80']
  ]
  loop
    table_name := trigger_spec[1];
    reason_code := trigger_spec[2];
    priority := trigger_spec[3];
    execute format(
      'drop trigger if exists enqueue_supplier_bill_ucl_refresh on public.%I',
      table_name
    );
    execute format(
      'create trigger enqueue_supplier_bill_ucl_refresh after insert or update or delete on public.%I
       for each row execute function public._supplier_bill_ucl_direct_dependency_trigger(%L, %L)',
      table_name,
      reason_code,
      priority
    );
  end loop;
end;
$$;

drop trigger if exists enqueue_supplier_bill_ucl_refresh
  on public.organization_accounting_documents;
create trigger enqueue_supplier_bill_ucl_refresh
after insert or update or delete on public.organization_accounting_documents
for each row execute function public._supplier_bill_ucl_accounting_document_trigger();

drop trigger if exists enqueue_supplier_bill_ucl_refresh
  on public.organization_accounting_document_lines;
create trigger enqueue_supplier_bill_ucl_refresh
after insert or update or delete on public.organization_accounting_document_lines
for each row execute function public._supplier_bill_ucl_accounting_line_trigger();

drop trigger if exists enqueue_supplier_bill_ucl_refresh
  on public.project_purchase_orders;
create trigger enqueue_supplier_bill_ucl_refresh
after update or delete on public.project_purchase_orders
for each row execute function public._supplier_bill_ucl_purchase_order_dependency_trigger();

drop trigger if exists enqueue_supplier_bill_ucl_refresh
  on public.project_purchase_order_line_items;
create trigger enqueue_supplier_bill_ucl_refresh
after update or delete on public.project_purchase_order_line_items
for each row execute function public._supplier_bill_ucl_purchase_order_dependency_trigger();

drop trigger if exists enqueue_supplier_bill_ucl_refresh
  on public.organization_suppliers;
create trigger enqueue_supplier_bill_ucl_refresh
after update on public.organization_suppliers
for each row execute function public._supplier_bill_ucl_supplier_dependency_trigger();

drop trigger if exists enqueue_supplier_bill_ucl_refresh
  on public.organization_projects;
create trigger enqueue_supplier_bill_ucl_refresh
after update on public.organization_projects
for each row execute function public._supplier_bill_ucl_project_dependency_trigger();

revoke all on function public._supplier_bill_ucl_direct_dependency_trigger()
  from public, anon, authenticated;
revoke all on function public._supplier_bill_ucl_accounting_document_trigger()
  from public, anon, authenticated;
revoke all on function public._supplier_bill_ucl_accounting_line_trigger()
  from public, anon, authenticated;
revoke all on function public._supplier_bill_ucl_purchase_order_dependency_trigger()
  from public, anon, authenticated;
revoke all on function public._supplier_bill_ucl_supplier_dependency_trigger()
  from public, anon, authenticated;
revoke all on function public._supplier_bill_ucl_project_dependency_trigger()
  from public, anon, authenticated;

commit;
