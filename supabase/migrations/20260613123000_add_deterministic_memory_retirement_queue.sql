create table if not exists public.organization_memory_retirement_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  memory_id uuid not null,
  queue_state text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  retry_after timestamptz null,
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_error_code text null,
  last_error_message text null,
  last_no_action_reason text null,
  last_attempt_at timestamptz null,
  last_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memory_retirement_queue_memory_fkey
    foreign key (memory_id, organization_id)
    references public.organization_memory_items (id, organization_id)
    on delete cascade,
  constraint organization_memory_retirement_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  ),
  constraint organization_memory_retirement_queue_attempts_non_negative check (
    attempt_count >= 0 and max_attempts > 0 and priority >= 0
  )
);

create unique index if not exists organization_memory_retirement_queue_org_memory_uidx
  on public.organization_memory_retirement_queue (organization_id, memory_id);

create index if not exists organization_memory_retirement_queue_claimable_idx
  on public.organization_memory_retirement_queue (
    organization_id,
    queue_state,
    available_at,
    priority desc,
    created_at asc
  )
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists organization_memory_retirement_queue_org_completed_idx
  on public.organization_memory_retirement_queue (organization_id, last_completed_at desc)
  where last_completed_at is not null;

alter table public.organization_memory_retirement_queue enable row level security;
alter table public.organization_memory_retirement_queue force row level security;

revoke all on public.organization_memory_retirement_queue from public, anon, authenticated;
grant select, insert, update on public.organization_memory_retirement_queue to service_role;

create or replace function public.enqueue_organization_memory_retirement_queue(
  p_limit integer default 200,
  p_organization_id uuid default null,
  p_memory_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  touched_ids jsonb := '[]'::jsonb;
begin
  with eligible_memories as (
    select
      m.id as memory_id,
      m.organization_id,
      m.confidence_score,
      m.contradiction_count,
      coalesce(m.contradiction_strength_score, 0) as contradiction_strength_score,
      case
        when coalesce(m.contradiction_strength_score, 0) >= 0.9 then 300
        when m.confidence_score <= 0.15 then 250
        when m.contradiction_count >= 3 then 220
        else 180
      end as priority
    from public.organization_memory_items m
    where (p_organization_id is null or m.organization_id = p_organization_id)
      and (p_memory_id is null or m.id = p_memory_id)
      and m.is_active = true
      and m.retired_at is null
      and m.superseded_at is null
      and m.superseded_by_memory_id is null
      and m.is_user_confirmed = false
      and m.memory_domain_signature is not null
      and m.confidence_score <= 0.25
      and (
        m.contradiction_count >= 2
        or coalesce(m.contradiction_strength_score, 0) >= 0.8
      )
    order by
      coalesce(m.last_contradicted_at, m.updated_at) asc,
      m.confidence_score asc,
      m.updated_at asc
    limit greatest(coalesce(p_limit, 200), 1)
  ),
  upserted as (
    insert into public.organization_memory_retirement_queue (
      organization_id,
      memory_id,
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
      last_no_action_reason,
      last_attempt_at,
      last_completed_at,
      updated_at
    )
    select
      e.organization_id,
      e.memory_id,
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
      null,
      now()
    from eligible_memories e
    on conflict (organization_id, memory_id) do update
    set
      priority = greatest(public.organization_memory_retirement_queue.priority, excluded.priority),
      available_at = case
        when public.organization_memory_retirement_queue.queue_state = 'claimed'
          and public.organization_memory_retirement_queue.claim_expires_at is not null
          and public.organization_memory_retirement_queue.claim_expires_at > now()
          then public.organization_memory_retirement_queue.available_at
        else least(public.organization_memory_retirement_queue.available_at, now())
      end,
      retry_after = case
        when public.organization_memory_retirement_queue.queue_state in ('completed', 'dead_lettered')
          then null
        else public.organization_memory_retirement_queue.retry_after
      end,
      queue_state = case
        when public.organization_memory_retirement_queue.queue_state = 'claimed'
          and public.organization_memory_retirement_queue.claim_expires_at is not null
          and public.organization_memory_retirement_queue.claim_expires_at > now()
          then public.organization_memory_retirement_queue.queue_state
        when public.organization_memory_retirement_queue.queue_state = 'completed'
          then 'pending'
        when public.organization_memory_retirement_queue.queue_state = 'dead_lettered'
          then 'pending'
        else public.organization_memory_retirement_queue.queue_state
      end,
      claim_token = case
        when public.organization_memory_retirement_queue.queue_state = 'claimed'
          and public.organization_memory_retirement_queue.claim_expires_at is not null
          and public.organization_memory_retirement_queue.claim_expires_at > now()
          then public.organization_memory_retirement_queue.claim_token
        else null
      end,
      claim_expires_at = case
        when public.organization_memory_retirement_queue.queue_state = 'claimed'
          and public.organization_memory_retirement_queue.claim_expires_at is not null
          and public.organization_memory_retirement_queue.claim_expires_at > now()
          then public.organization_memory_retirement_queue.claim_expires_at
        else null
      end,
      claimed_at = case
        when public.organization_memory_retirement_queue.queue_state = 'claimed'
          and public.organization_memory_retirement_queue.claim_expires_at is not null
          and public.organization_memory_retirement_queue.claim_expires_at > now()
          then public.organization_memory_retirement_queue.claimed_at
        else null
      end,
      claimed_by = case
        when public.organization_memory_retirement_queue.queue_state = 'claimed'
          and public.organization_memory_retirement_queue.claim_expires_at is not null
          and public.organization_memory_retirement_queue.claim_expires_at > now()
          then public.organization_memory_retirement_queue.claimed_by
        else null
      end,
      last_error_code = null,
      last_error_message = null,
      last_no_action_reason = null,
      updated_at = now()
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb)
  into touched_ids
  from upserted;

  return jsonb_build_object(
    'count', jsonb_array_length(touched_ids),
    'ids', touched_ids
  );
end;
$$;

create or replace function public.claim_organization_memory_retirement_batch(
  p_limit integer default 25,
  p_organization_id uuid default null,
  p_memory_id uuid default null,
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
  perform public.enqueue_organization_memory_retirement_queue(
    p_limit := greatest(coalesce(p_limit, 25), 1) * 4,
    p_organization_id := p_organization_id,
    p_memory_id := p_memory_id
  );

  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'organization-memory-retirement-runner');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 600), 30);

  with candidate_rows as (
    select q.id
    from public.organization_memory_retirement_queue q
    where (p_organization_id is null or q.organization_id = p_organization_id)
      and (p_memory_id is null or q.memory_id = p_memory_id)
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
    update public.organization_memory_retirement_queue q
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
      'memoryId', c.memory_id,
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
      'lastNoActionReason', c.last_no_action_reason,
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

create or replace function public.finalize_organization_memory_retirement_batch(
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
  queue_row public.organization_memory_retirement_queue%rowtype;
  resolved_status text;
  resolved_retry_after timestamptz;
  completed_count integer := 0;
  retried_count integer := 0;
  dead_lettered_count integer := 0;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'finalize_organization_memory_retirement_batch requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_status := coalesce(nullif(input_item->>'queueState', ''), 'retry_scheduled');
    resolved_retry_after := nullif(input_item->>'retryAfter', '')::timestamptz;

    select q.*
    into queue_row
    from public.organization_memory_retirement_queue q
    where q.id = nullif(input_item->>'id', '')::uuid
      and q.queue_state = 'claimed'
      and q.claim_token = nullif(input_item->>'claimToken', '')::uuid
    for update;

    if not found then
      continue;
    end if;

    finalized_ids := finalized_ids || jsonb_build_array(queue_row.id);

    if resolved_status = 'completed' then
      update public.organization_memory_retirement_queue
      set
        queue_state = 'completed',
        available_at = now(),
        retry_after = null,
        claim_token = null,
        claim_expires_at = null,
        claimed_at = null,
        claimed_by = null,
        last_error_code = nullif(input_item->>'errorCode', ''),
        last_error_message = nullif(input_item->>'errorMessage', ''),
        last_no_action_reason = nullif(input_item->>'noActionReason', ''),
        last_completed_at = now(),
        updated_at = now()
      where id = queue_row.id;

      completed_count := completed_count + 1;
    elsif queue_row.attempt_count >= queue_row.max_attempts or resolved_status = 'dead_lettered' then
      update public.organization_memory_retirement_queue
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
        last_no_action_reason = nullif(input_item->>'noActionReason', ''),
        updated_at = now()
      where id = queue_row.id;

      dead_lettered_count := dead_lettered_count + 1;
    else
      update public.organization_memory_retirement_queue
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
        last_no_action_reason = nullif(input_item->>'noActionReason', ''),
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

create unique index if not exists omlh_org_memory_retirement_basis_uidx
  on public.organization_memory_lifecycle_history (
    organization_id,
    memory_id,
    lifecycle_event_type,
    ((lifecycle_metadata ->> 'retirementBasisHash'))
  )
  where lifecycle_event_type = 'memory_retired'
    and lifecycle_metadata ? 'retirementBasisHash';

grant usage, select on all sequences in schema public to service_role;
grant execute on function public.enqueue_organization_memory_retirement_queue(integer, uuid, uuid) to service_role;
grant execute on function public.claim_organization_memory_retirement_batch(integer, uuid, uuid, text, integer) to service_role;
grant execute on function public.finalize_organization_memory_retirement_batch(jsonb) to service_role;
