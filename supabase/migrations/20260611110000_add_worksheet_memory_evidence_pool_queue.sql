create table if not exists public.worksheet_memory_evidence_pool_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_event_id uuid not null references public.intelligence_events (id) on delete cascade,
  classification_record_id uuid null references public.worksheet_event_classifications (id) on delete cascade,
  classification_version integer not null default 1,
  classification_attempt_number integer not null default 1,
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
  last_attempt_at timestamptz null,
  last_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_memory_evidence_pool_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  ),
  constraint worksheet_memory_evidence_pool_queue_attempt_count_non_negative check (attempt_count >= 0),
  constraint worksheet_memory_evidence_pool_queue_max_attempts_positive check (max_attempts > 0),
  constraint worksheet_memory_evidence_pool_queue_priority_non_negative check (priority >= 0),
  constraint worksheet_memory_evidence_pool_queue_classification_version_positive check (classification_version > 0),
  constraint worksheet_memory_evidence_pool_queue_classification_attempt_number_positive check (classification_attempt_number > 0)
);

create unique index if not exists worksheet_memory_evidence_pool_queue_classification_uidx
  on public.worksheet_memory_evidence_pool_queue (organization_id, classification_record_id);

create index if not exists worksheet_memory_evidence_pool_queue_claimable_idx
  on public.worksheet_memory_evidence_pool_queue (organization_id, queue_state, available_at, claim_expires_at, priority desc)
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists worksheet_memory_evidence_pool_queue_source_event_idx
  on public.worksheet_memory_evidence_pool_queue (source_event_id, created_at desc);

create trigger set_worksheet_memory_evidence_pool_queue_updated_at
before update on public.worksheet_memory_evidence_pool_queue
for each row execute function public.set_updated_at();

alter table public.worksheet_memory_evidence_pool_queue enable row level security;
alter table public.worksheet_memory_evidence_pool_queue force row level security;

revoke all on public.worksheet_memory_evidence_pool_queue from public, anon, authenticated;
grant select, insert, update on public.worksheet_memory_evidence_pool_queue to service_role;
grant delete on public.worksheet_memory_evidence_pools to service_role;
grant delete on public.worksheet_memory_evidence_pool_events to service_role;

create or replace function public.enqueue_worksheet_memory_evidence_pool_queue(
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
  with eligible_classifications as (
    select
      c.id as classification_record_id,
      c.organization_id,
      c.source_event_id,
      c.classification_version,
      c.attempt_number,
      case
        when c.classification_status = 'classified' then 200
        when c.classification_status = 'low_confidence' then 100
        else 0
      end as priority
    from public.worksheet_event_classifications c
    left join public.worksheet_memory_evidence_pool_queue q
      on q.organization_id = c.organization_id
     and q.classification_record_id = c.id
    where c.classification_status in ('classified', 'low_confidence')
      and q.id is null
      and (p_organization_id is null or c.organization_id = p_organization_id)
    order by c.classified_at desc nulls last, c.created_at desc
    limit greatest(coalesce(p_limit, 200), 1)
  ),
  inserted as (
    insert into public.worksheet_memory_evidence_pool_queue (
      organization_id,
      source_event_id,
      classification_record_id,
      classification_version,
      classification_attempt_number,
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
      e.source_event_id,
      e.classification_record_id,
      e.classification_version,
      e.attempt_number,
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
    from eligible_classifications e
    on conflict (organization_id, classification_record_id) do nothing
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

create or replace function public.claim_worksheet_memory_evidence_pool_batch(
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
  perform public.enqueue_worksheet_memory_evidence_pool_queue(
    p_limit := greatest(coalesce(p_limit, 25), 1) * 4,
    p_organization_id := p_organization_id
  );

  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'worksheet-memory-evidence-pool-runner');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 600), 30);

  with candidate_rows as (
    select q.id
    from public.worksheet_memory_evidence_pool_queue q
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
    update public.worksheet_memory_evidence_pool_queue q
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
      'sourceEventId', c.source_event_id,
      'classificationRecordId', c.classification_record_id,
      'classificationVersion', c.classification_version,
      'classificationAttemptNumber', c.classification_attempt_number,
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

create or replace function public.finalize_worksheet_memory_evidence_pool_batch(
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
  queue_row public.worksheet_memory_evidence_pool_queue%rowtype;
  resolved_status text;
  resolved_retry_after timestamptz;
  completed_count integer := 0;
  retried_count integer := 0;
  dead_lettered_count integer := 0;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'finalize_worksheet_memory_evidence_pool_batch requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_status := coalesce(nullif(input_item->>'queueState', ''), 'retry_scheduled');
    resolved_retry_after := nullif(input_item->>'retryAfter', '')::timestamptz;

    select q.*
    into queue_row
    from public.worksheet_memory_evidence_pool_queue q
    where q.id = nullif(input_item->>'id', '')::uuid
      and q.queue_state = 'claimed'
      and q.claim_token = nullif(input_item->>'claimToken', '')::uuid
    for update;

    if not found then
      continue;
    end if;

    finalized_ids := finalized_ids || jsonb_build_array(queue_row.id);

    if resolved_status = 'completed' then
      update public.worksheet_memory_evidence_pool_queue
      set
        queue_state = 'completed',
        available_at = now(),
        retry_after = null,
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = null,
        last_error_message = null,
        last_completed_at = now(),
        updated_at = now()
      where id = queue_row.id;

      completed_count := completed_count + 1;
    elsif queue_row.attempt_count >= queue_row.max_attempts then
      update public.worksheet_memory_evidence_pool_queue
      set
        queue_state = 'dead_lettered',
        available_at = coalesce(resolved_retry_after, now()),
        retry_after = resolved_retry_after,
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = nullif(btrim(coalesce(input_item->>'errorCode', '')), ''),
        last_error_message = nullif(btrim(coalesce(input_item->>'errorMessage', '')), ''),
        updated_at = now()
      where id = queue_row.id;

      dead_lettered_count := dead_lettered_count + 1;
    else
      update public.worksheet_memory_evidence_pool_queue
      set
        queue_state = 'retry_scheduled',
        available_at = coalesce(resolved_retry_after, now()),
        retry_after = resolved_retry_after,
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = nullif(btrim(coalesce(input_item->>'errorCode', '')), ''),
        last_error_message = nullif(btrim(coalesce(input_item->>'errorMessage', '')), ''),
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

create or replace function public.finalize_worksheet_event_classification_claims(
  p_inputs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  input_item jsonb;
  inserted_ids jsonb := '[]'::jsonb;
  inserted_id uuid;
  resolved_source_event_id uuid;
  resolved_organization_id uuid;
  resolved_classification_version integer;
  resolved_attempt_number integer;
  resolved_claim_token uuid;
  resolved_status text;
  resolved_retry_after timestamptz;
  queue_row public.worksheet_event_classification_queue%rowtype;
  completed_count integer := 0;
  retried_count integer := 0;
  dead_lettered_count integer := 0;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'finalize_worksheet_event_classification_claims requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_source_event_id := nullif(input_item->>'sourceEventId', '')::uuid;
    resolved_organization_id := nullif(input_item->>'organizationId', '')::uuid;
    resolved_classification_version := greatest(coalesce(nullif(input_item->>'classificationVersion', '')::integer, 1), 1);
    resolved_attempt_number := greatest(coalesce(nullif(input_item->>'attemptNumber', '')::integer, 1), 1);
    resolved_claim_token := nullif(input_item->>'claimToken', '')::uuid;
    resolved_status := coalesce(nullif(btrim(coalesce(input_item->>'classificationStatus', '')), ''), 'failed');
    resolved_retry_after := nullif(input_item->>'retryAfter', '')::timestamptz;

    select *
    into queue_row
    from public.worksheet_event_classification_queue q
    where q.source_event_id = resolved_source_event_id
      and q.organization_id = resolved_organization_id
      and q.classification_version = resolved_classification_version
      and q.queue_state = 'claimed'
      and q.claim_token = resolved_claim_token
      and q.attempt_count = resolved_attempt_number
    for update;

    if not found then
      raise exception 'Worksheet event classification claim not found.';
    end if;

    select (result->'ids'->>0)::uuid
    into inserted_id
    from (
      select public.record_worksheet_event_classifications(jsonb_build_array(input_item)) as result
    ) recorded;

    inserted_ids := inserted_ids || jsonb_build_array(inserted_id);

    if resolved_status in ('classified', 'low_confidence') then
      update public.worksheet_event_classification_queue
      set
        queue_state = 'completed',
        available_at = now(),
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = null,
        last_error_message = null,
        last_completed_at = coalesce(nullif(input_item->>'classifiedAt', '')::timestamptz, now()),
        updated_at = now()
      where id = queue_row.id;

      insert into public.worksheet_memory_evidence_pool_queue (
        organization_id,
        source_event_id,
        classification_record_id,
        classification_version,
        classification_attempt_number,
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
      values (
        resolved_organization_id,
        resolved_source_event_id,
        inserted_id,
        resolved_classification_version,
        resolved_attempt_number,
        'pending',
        0,
        5,
        case
          when resolved_status = 'classified' then 200
          else 100
        end,
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
      )
      on conflict (organization_id, classification_record_id) do nothing;

      completed_count := completed_count + 1;
    elsif queue_row.attempt_count >= queue_row.max_attempts then
      update public.worksheet_event_classification_queue
      set
        queue_state = 'dead_lettered',
        available_at = coalesce(resolved_retry_after, now()),
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = nullif(btrim(coalesce(input_item->>'errorCode', '')), ''),
        last_error_message = nullif(btrim(coalesce(input_item->>'errorMessage', '')), ''),
        updated_at = now()
      where id = queue_row.id;

      dead_lettered_count := dead_lettered_count + 1;
    else
      update public.worksheet_event_classification_queue
      set
        queue_state = 'retry_scheduled',
        available_at = coalesce(resolved_retry_after, now()),
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = nullif(btrim(coalesce(input_item->>'errorCode', '')), ''),
        last_error_message = nullif(btrim(coalesce(input_item->>'errorMessage', '')), ''),
        updated_at = now()
      where id = queue_row.id;

      retried_count := retried_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids,
    'completedCount', completed_count,
    'retriedCount', retried_count,
    'deadLetteredCount', dead_lettered_count
  );
end;
$$;

grant execute on function public.enqueue_worksheet_memory_evidence_pool_queue(integer, uuid) to service_role;
grant execute on function public.claim_worksheet_memory_evidence_pool_batch(integer, uuid, text, integer) to service_role;
grant execute on function public.finalize_worksheet_memory_evidence_pool_batch(jsonb) to service_role;
