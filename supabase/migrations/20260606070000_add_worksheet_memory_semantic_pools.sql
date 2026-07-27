create table if not exists public.worksheet_memory_semantic_pool_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  seed_pool_id uuid not null references public.worksheet_memory_evidence_pools (id) on delete cascade,
  seed_pool_signature text not null,
  seed_pool_revision_hash text not null,
  seed_maturity_status text not null,
  queue_state text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  retry_after timestamptz null,
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_error_code text null,
  last_error_message text null,
  last_attempt_at timestamptz null,
  last_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_memory_semantic_pool_queue_seed_signature_not_blank check (char_length(trim(seed_pool_signature)) > 0),
  constraint worksheet_memory_semantic_pool_queue_seed_revision_hash_not_blank check (char_length(trim(seed_pool_revision_hash)) > 0),
  constraint worksheet_memory_semantic_pool_queue_seed_maturity_status_check check (
    seed_maturity_status in ('emerging', 'ready_for_synthesis', 'reinforced', 'durable')
  ),
  constraint worksheet_memory_semantic_pool_queue_attempt_count_non_negative check (attempt_count >= 0),
  constraint worksheet_memory_semantic_pool_queue_max_attempts_positive check (max_attempts > 0),
  constraint worksheet_memory_semantic_pool_queue_priority_non_negative check (priority >= 0),
  constraint worksheet_memory_semantic_pool_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  )
);

create unique index if not exists worksheet_memory_semantic_pool_queue_seed_revision_uidx
  on public.worksheet_memory_semantic_pool_queue (organization_id, seed_pool_id, seed_pool_revision_hash);

create index if not exists worksheet_memory_semantic_pool_queue_claimable_idx
  on public.worksheet_memory_semantic_pool_queue (organization_id, queue_state, available_at, claim_expires_at, priority desc)
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists worksheet_memory_semantic_pool_queue_claimed_by_idx
  on public.worksheet_memory_semantic_pool_queue (claimed_by, claim_expires_at)
  where queue_state = 'claimed';

create table if not exists public.worksheet_memory_semantic_pool_runs (
  id uuid primary key default gen_random_uuid(),
  requested_organization_id uuid null references public.organizations (id) on delete set null,
  claimed_job_count integer not null default 0,
  completed_job_count integer not null default 0,
  retried_job_count integer not null default 0,
  dead_lettered_job_count integer not null default 0,
  semantic_pool_count integer not null default 0,
  no_pool_count integer not null default 0,
  candidate_event_count integer not null default 0,
  provider text null,
  model text null,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_memory_semantic_pool_runs_claimed_job_count_non_negative check (claimed_job_count >= 0),
  constraint worksheet_memory_semantic_pool_runs_completed_job_count_non_negative check (completed_job_count >= 0),
  constraint worksheet_memory_semantic_pool_runs_retried_job_count_non_negative check (retried_job_count >= 0),
  constraint worksheet_memory_semantic_pool_runs_dead_lettered_job_count_non_negative check (dead_lettered_job_count >= 0),
  constraint worksheet_memory_semantic_pool_runs_semantic_pool_count_non_negative check (semantic_pool_count >= 0),
  constraint worksheet_memory_semantic_pool_runs_no_pool_count_non_negative check (no_pool_count >= 0),
  constraint worksheet_memory_semantic_pool_runs_candidate_event_count_non_negative check (candidate_event_count >= 0),
  constraint worksheet_memory_semantic_pool_runs_duration_ms_non_negative check (duration_ms >= 0)
);

create table if not exists public.worksheet_memory_semantic_pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  semantic_signature text not null,
  semantic_family text null,
  semantic_type text null,
  pool_status text not null default 'active',
  maturity_status text not null default 'emerging',
  title text null,
  summary text null,
  retrieval_guidance text null,
  scope_payload jsonb not null default '{}'::jsonb,
  pool_value_payload jsonb not null default '{}'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  contradiction_summary jsonb not null default '{}'::jsonb,
  support_count integer not null default 0,
  contradiction_count integer not null default 0,
  ignored_count integer not null default 0,
  worksheet_count integer not null default 0,
  workbook_count integer not null default 0,
  project_count integer not null default 0,
  average_confidence numeric null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_grouped_at timestamptz not null default now(),
  source_revision_hash text not null,
  created_by_run_id uuid null references public.worksheet_memory_semantic_pool_runs (id) on delete set null,
  last_updated_by_run_id uuid null references public.worksheet_memory_semantic_pool_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_memory_semantic_pools_signature_not_blank check (char_length(trim(semantic_signature)) > 0),
  constraint worksheet_memory_semantic_pools_scope_payload_object_check check (jsonb_typeof(scope_payload) = 'object'),
  constraint worksheet_memory_semantic_pools_pool_value_payload_object_check check (jsonb_typeof(pool_value_payload) = 'object'),
  constraint worksheet_memory_semantic_pools_evidence_summary_object_check check (jsonb_typeof(evidence_summary) = 'object'),
  constraint worksheet_memory_semantic_pools_contradiction_summary_object_check check (jsonb_typeof(contradiction_summary) = 'object'),
  constraint worksheet_memory_semantic_pools_counts_non_negative_check check (
    support_count >= 0
    and contradiction_count >= 0
    and ignored_count >= 0
    and worksheet_count >= 0
    and workbook_count >= 0
    and project_count >= 0
  ),
  constraint worksheet_memory_semantic_pools_average_confidence_range_check check (
    average_confidence is null or (average_confidence >= 0 and average_confidence <= 1)
  ),
  constraint worksheet_memory_semantic_pools_pool_status_check check (
    pool_status in ('active', 'contested', 'stale', 'superseded', 'rejected')
  ),
  constraint worksheet_memory_semantic_pools_maturity_status_check check (
    maturity_status in ('emerging', 'ready_for_synthesis', 'reinforced', 'durable', 'contested')
  )
);

create unique index if not exists worksheet_memory_semantic_pools_org_signature_uidx
  on public.worksheet_memory_semantic_pools (organization_id, semantic_signature);

create index if not exists worksheet_memory_semantic_pools_org_status_idx
  on public.worksheet_memory_semantic_pools (organization_id, pool_status, maturity_status, last_seen_at desc);

create index if not exists worksheet_memory_semantic_pools_org_revision_idx
  on public.worksheet_memory_semantic_pools (organization_id, source_revision_hash, updated_at desc);

create table if not exists public.worksheet_memory_semantic_pool_events (
  id uuid primary key default gen_random_uuid(),
  semantic_pool_id uuid not null references public.worksheet_memory_semantic_pools (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_event_id uuid not null references public.intelligence_events (id) on delete cascade,
  classification_record_id uuid null references public.worksheet_event_classifications (id) on delete set null,
  evidence_role text not null,
  linked_by_run_id uuid null references public.worksheet_memory_semantic_pool_runs (id) on delete set null,
  linked_at timestamptz not null default now(),
  constraint worksheet_memory_semantic_pool_events_evidence_role_check check (
    evidence_role in ('supporting', 'contradictory', 'ignored')
  )
);

create unique index if not exists worksheet_memory_semantic_pool_events_pool_event_uidx
  on public.worksheet_memory_semantic_pool_events (semantic_pool_id, source_event_id);

create index if not exists worksheet_memory_semantic_pool_events_org_pool_idx
  on public.worksheet_memory_semantic_pool_events (organization_id, semantic_pool_id, linked_at desc);

create index if not exists worksheet_memory_semantic_pool_events_source_idx
  on public.worksheet_memory_semantic_pool_events (source_event_id, linked_at desc);

create trigger set_worksheet_memory_semantic_pool_queue_updated_at
before update on public.worksheet_memory_semantic_pool_queue
for each row execute function public.set_updated_at();

create trigger set_worksheet_memory_semantic_pool_runs_updated_at
before update on public.worksheet_memory_semantic_pool_runs
for each row execute function public.set_updated_at();

create trigger set_worksheet_memory_semantic_pools_updated_at
before update on public.worksheet_memory_semantic_pools
for each row execute function public.set_updated_at();

alter table public.worksheet_memory_semantic_pool_queue enable row level security;
alter table public.worksheet_memory_semantic_pool_queue force row level security;
alter table public.worksheet_memory_semantic_pool_runs enable row level security;
alter table public.worksheet_memory_semantic_pool_runs force row level security;
alter table public.worksheet_memory_semantic_pools enable row level security;
alter table public.worksheet_memory_semantic_pools force row level security;
alter table public.worksheet_memory_semantic_pool_events enable row level security;
alter table public.worksheet_memory_semantic_pool_events force row level security;

revoke all on public.worksheet_memory_semantic_pool_queue from public, anon, authenticated;
revoke all on public.worksheet_memory_semantic_pool_runs from public, anon, authenticated;
revoke all on public.worksheet_memory_semantic_pools from public, anon, authenticated;
revoke all on public.worksheet_memory_semantic_pool_events from public, anon, authenticated;

create or replace function public.enqueue_worksheet_memory_semantic_pool_queue(
  p_limit integer default 200,
  p_organization_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_ids jsonb := '[]'::jsonb;
begin
  with eligible_pools as (
    select
      p.id,
      p.organization_id,
      p.pool_signature,
      p.pool_revision_hash,
      p.maturity_status,
      case
        when p.maturity_status = 'durable' then 300
        when p.maturity_status = 'reinforced' then 200
        when p.maturity_status = 'ready_for_synthesis' then 100
        else 0
      end as priority
    from public.worksheet_memory_evidence_pools p
    where p.maturity_status in ('ready_for_synthesis', 'reinforced', 'durable')
      and (p_organization_id is null or p.organization_id = p_organization_id)
    order by
      case p.maturity_status
        when 'durable' then 3
        when 'reinforced' then 2
        when 'ready_for_synthesis' then 1
        else 0
      end desc,
      p.last_seen_at desc,
      p.updated_at desc
    limit greatest(coalesce(p_limit, 200), 1)
  ),
  inserted as (
    insert into public.worksheet_memory_semantic_pool_queue (
      organization_id,
      seed_pool_id,
      seed_pool_signature,
      seed_pool_revision_hash,
      seed_maturity_status,
      queue_state,
      attempt_count,
      max_attempts,
      priority,
      available_at,
      retry_after,
      claimed_at,
      claim_expires_at,
      claimed_by,
      claim_token,
      last_error_code,
      last_error_message,
      last_attempt_at,
      last_completed_at,
      updated_at
    )
    select
      e.organization_id,
      e.id,
      e.pool_signature,
      e.pool_revision_hash,
      e.maturity_status,
      'pending',
      0,
      5,
      e.priority,
      now(),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      now()
    from eligible_pools e
    on conflict (organization_id, seed_pool_id, seed_pool_revision_hash) do nothing
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb)
  into inserted_ids
  from inserted;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
  );
end;
$$;

create or replace function public.claim_worksheet_memory_semantic_pool_batch(
  p_limit integer default 25,
  p_organization_id uuid default null,
  p_worker_id text default null,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_rows jsonb := '[]'::jsonb;
  resolved_worker_id text;
  resolved_lease_seconds integer;
begin
  perform public.enqueue_worksheet_memory_semantic_pool_queue(
    p_limit := greatest(coalesce(p_limit, 25), 1) * 4,
    p_organization_id := p_organization_id
  );

  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'worksheet-memory-semantic-pool-runner');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 600), 30);

  with candidate_rows as (
    select q.id
    from public.worksheet_memory_semantic_pool_queue q
    where (p_organization_id is null or q.organization_id = p_organization_id)
      and q.attempt_count < q.max_attempts
      and q.available_at <= now()
      and q.queue_state in ('pending', 'claimed', 'retry_scheduled')
      and (
        q.queue_state <> 'claimed'
        or q.claim_expires_at is null
        or q.claim_expires_at <= now()
      )
    order by
      q.priority desc,
      (q.attempt_count = 0) desc,
      case when q.attempt_count = 0 then q.created_at end desc,
      case when q.attempt_count > 0 then q.available_at end asc,
      q.created_at asc
    limit greatest(coalesce(p_limit, 25), 1)
    for update skip locked
  ),
  claimed as (
    update public.worksheet_memory_semantic_pool_queue q
    set
      queue_state = 'claimed',
      attempt_count = q.attempt_count + 1,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => resolved_lease_seconds),
      claimed_by = resolved_worker_id,
      claim_token = gen_random_uuid(),
      last_attempt_at = now(),
      updated_at = now()
    from candidate_rows c
    where q.id = c.id
    returning q.*
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'organizationId', c.organization_id,
      'seedPoolId', c.seed_pool_id,
      'seedPoolSignature', c.seed_pool_signature,
      'seedPoolRevisionHash', c.seed_pool_revision_hash,
      'seedMaturityStatus', c.seed_maturity_status,
      'queueState', c.queue_state,
      'attemptCount', c.attempt_count,
      'maxAttempts', c.max_attempts,
      'priority', c.priority,
      'availableAt', c.available_at,
      'retryAfter', c.retry_after,
      'claimedAt', c.claimed_at,
      'claimExpiresAt', c.claim_expires_at,
      'claimedBy', c.claimed_by,
      'claimToken', c.claim_token,
      'lastErrorCode', c.last_error_code,
      'lastErrorMessage', c.last_error_message,
      'createdAt', c.created_at,
      'updatedAt', c.updated_at
    )
    order by c.priority desc, c.created_at asc
  ), '[]'::jsonb)
  into claimed_rows
  from claimed c;

  return claimed_rows;
end;
$$;

create or replace function public.finalize_worksheet_memory_semantic_pool_batch(
  p_inputs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  input_item jsonb;
  finalized_ids jsonb := '[]'::jsonb;
  queue_row public.worksheet_memory_semantic_pool_queue%rowtype;
  resolved_status text;
  resolved_retry_after timestamptz;
  completed_count integer := 0;
  retried_count integer := 0;
  dead_lettered_count integer := 0;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'finalize_worksheet_memory_semantic_pool_batch requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_status := coalesce(nullif(input_item->>'queueState', ''), 'retry_scheduled');
    resolved_retry_after := nullif(input_item->>'retryAfter', '')::timestamptz;

    select q.*
    into queue_row
    from public.worksheet_memory_semantic_pool_queue q
    where q.id = nullif(input_item->>'id', '')::uuid
      and q.queue_state = 'claimed'
      and q.claim_token = nullif(input_item->>'claimToken', '')::uuid
    for update;

    if not found then
      continue;
    end if;

    finalized_ids := finalized_ids || jsonb_build_array(queue_row.id);

    if resolved_status = 'completed' then
      update public.worksheet_memory_semantic_pool_queue
      set
        queue_state = 'completed',
        available_at = now(),
        retry_after = null,
        claim_token = null,
        claim_expires_at = null,
        claimed_at = null,
        claimed_by = null,
        last_error_code = null,
        last_error_message = null,
        last_completed_at = now(),
        updated_at = now()
      where id = queue_row.id;

      completed_count := completed_count + 1;
    elsif queue_row.attempt_count >= queue_row.max_attempts or resolved_status = 'dead_lettered' then
      update public.worksheet_memory_semantic_pool_queue
      set
        queue_state = 'dead_lettered',
        available_at = coalesce(resolved_retry_after, available_at),
        retry_after = resolved_retry_after,
        claim_token = null,
        claim_expires_at = null,
        claimed_at = null,
        claimed_by = null,
        last_error_code = nullif(input_item->>'errorCode', ''),
        last_error_message = nullif(input_item->>'errorMessage', ''),
        updated_at = now()
      where id = queue_row.id;

      dead_lettered_count := dead_lettered_count + 1;
    else
      update public.worksheet_memory_semantic_pool_queue
      set
        queue_state = 'retry_scheduled',
        available_at = coalesce(resolved_retry_after, now()),
        retry_after = coalesce(resolved_retry_after, now()),
        claim_token = null,
        claim_expires_at = null,
        claimed_at = null,
        claimed_by = null,
        last_error_code = nullif(input_item->>'errorCode', ''),
        last_error_message = nullif(input_item->>'errorMessage', ''),
        updated_at = now()
      where id = queue_row.id;

      retried_count := retried_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(finalized_ids),
    'ids', finalized_ids,
    'completedCount', completed_count,
    'retriedCount', retried_count,
    'deadLetteredCount', dead_lettered_count
  );
end;
$$;

grant select, insert, update on public.worksheet_memory_semantic_pool_queue to service_role;
grant select, insert, update on public.worksheet_memory_semantic_pool_runs to service_role;
grant select, insert, update on public.worksheet_memory_semantic_pools to service_role;
grant select, insert, update on public.worksheet_memory_semantic_pool_events to service_role;

grant usage, select on all sequences in schema public to service_role;

grant execute on function public.enqueue_worksheet_memory_semantic_pool_queue(integer, uuid) to service_role;
grant execute on function public.claim_worksheet_memory_semantic_pool_batch(integer, uuid, text, integer) to service_role;
grant execute on function public.finalize_worksheet_memory_semantic_pool_batch(jsonb) to service_role;
