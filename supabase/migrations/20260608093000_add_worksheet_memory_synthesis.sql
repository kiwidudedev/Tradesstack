create table if not exists public.worksheet_memory_synthesis_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  semantic_pool_id uuid not null references public.worksheet_memory_semantic_pools (id) on delete cascade,
  semantic_pool_signature text not null,
  source_revision_hash text not null,
  maturity_status text not null,
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
  constraint worksheet_memory_synthesis_queue_pool_signature_not_blank check (char_length(trim(semantic_pool_signature)) > 0),
  constraint worksheet_memory_synthesis_queue_source_revision_hash_not_blank check (char_length(trim(source_revision_hash)) > 0),
  constraint worksheet_memory_synthesis_queue_maturity_status_check check (
    maturity_status in ('ready_for_synthesis', 'reinforced', 'durable')
  ),
  constraint worksheet_memory_synthesis_queue_attempt_count_non_negative check (attempt_count >= 0),
  constraint worksheet_memory_synthesis_queue_max_attempts_positive check (max_attempts > 0),
  constraint worksheet_memory_synthesis_queue_priority_non_negative check (priority >= 0),
  constraint worksheet_memory_synthesis_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  )
);

create unique index if not exists worksheet_memory_synthesis_queue_pool_revision_uidx
  on public.worksheet_memory_synthesis_queue (organization_id, semantic_pool_id, source_revision_hash);

create index if not exists worksheet_memory_synthesis_queue_claimable_idx
  on public.worksheet_memory_synthesis_queue (organization_id, queue_state, available_at, claim_expires_at, priority desc)
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists worksheet_memory_synthesis_queue_claimed_by_idx
  on public.worksheet_memory_synthesis_queue (claimed_by, claim_expires_at)
  where queue_state = 'claimed';

create table if not exists public.worksheet_memory_synthesis_runs (
  id uuid primary key default gen_random_uuid(),
  requested_organization_id uuid null references public.organizations (id) on delete set null,
  claimed_job_count integer not null default 0,
  completed_job_count integer not null default 0,
  retried_job_count integer not null default 0,
  dead_lettered_job_count integer not null default 0,
  no_memory_count integer not null default 0,
  created_memory_count integer not null default 0,
  reinforced_memory_count integer not null default 0,
  superseded_memory_count integer not null default 0,
  organization_memory_write_count integer not null default 0,
  provenance_link_count integer not null default 0,
  provider text null,
  model text null,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_memory_synthesis_runs_claimed_job_count_non_negative check (claimed_job_count >= 0),
  constraint worksheet_memory_synthesis_runs_completed_job_count_non_negative check (completed_job_count >= 0),
  constraint worksheet_memory_synthesis_runs_retried_job_count_non_negative check (retried_job_count >= 0),
  constraint worksheet_memory_synthesis_runs_dead_lettered_job_count_non_negative check (dead_lettered_job_count >= 0),
  constraint worksheet_memory_synthesis_runs_no_memory_count_non_negative check (no_memory_count >= 0),
  constraint worksheet_memory_synthesis_runs_created_memory_count_non_negative check (created_memory_count >= 0),
  constraint worksheet_memory_synthesis_runs_reinforced_memory_count_non_negative check (reinforced_memory_count >= 0),
  constraint worksheet_memory_synthesis_runs_superseded_memory_count_non_negative check (superseded_memory_count >= 0),
  constraint worksheet_memory_synthesis_runs_organization_memory_write_count_non_negative check (organization_memory_write_count >= 0),
  constraint worksheet_memory_synthesis_runs_provenance_link_count_non_negative check (provenance_link_count >= 0),
  constraint worksheet_memory_synthesis_runs_duration_ms_non_negative check (duration_ms >= 0)
);

alter table public.organization_memory_items
  add column if not exists memory_signature text null,
  add column if not exists source_revision_hash text null,
  add column if not exists superseded_by_memory_id uuid null references public.organization_memory_items (id) on delete set null;

create unique index if not exists organization_memory_items_org_active_signature_uidx
  on public.organization_memory_items (organization_id, memory_signature)
  where memory_signature is not null and is_active;

create index if not exists organization_memory_items_org_signature_idx
  on public.organization_memory_items (organization_id, memory_signature, updated_at desc)
  where memory_signature is not null;

create index if not exists organization_memory_items_superseded_by_idx
  on public.organization_memory_items (superseded_by_memory_id)
  where superseded_by_memory_id is not null;

create unique index if not exists organization_memory_links_item_source_entity_role_uidx
  on public.organization_memory_links (organization_memory_item_id, source_entity_type, source_entity_id, link_type)
  where source_entity_type is not null and source_entity_id is not null;

create trigger set_worksheet_memory_synthesis_queue_updated_at
before update on public.worksheet_memory_synthesis_queue
for each row execute function public.set_updated_at();

create trigger set_worksheet_memory_synthesis_runs_updated_at
before update on public.worksheet_memory_synthesis_runs
for each row execute function public.set_updated_at();

alter table public.worksheet_memory_synthesis_queue enable row level security;
alter table public.worksheet_memory_synthesis_queue force row level security;
alter table public.worksheet_memory_synthesis_runs enable row level security;
alter table public.worksheet_memory_synthesis_runs force row level security;

revoke all on public.worksheet_memory_synthesis_queue from public, anon, authenticated;
revoke all on public.worksheet_memory_synthesis_runs from public, anon, authenticated;

create or replace function public.enqueue_worksheet_memory_synthesis_queue(
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
      p.semantic_signature,
      p.source_revision_hash,
      p.maturity_status,
      case
        when p.maturity_status = 'durable' then 300
        when p.maturity_status = 'reinforced' then 200
        when p.maturity_status = 'ready_for_synthesis' then 100
        else 0
      end as priority
    from public.worksheet_memory_semantic_pools p
    where p.pool_status = 'active'
      and p.maturity_status in ('ready_for_synthesis', 'reinforced', 'durable')
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
    insert into public.worksheet_memory_synthesis_queue (
      organization_id,
      semantic_pool_id,
      semantic_pool_signature,
      source_revision_hash,
      maturity_status,
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
      e.semantic_signature,
      e.source_revision_hash,
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
    on conflict (organization_id, semantic_pool_id, source_revision_hash) do nothing
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

create or replace function public.claim_worksheet_memory_synthesis_batch(
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
  perform public.enqueue_worksheet_memory_synthesis_queue(
    p_limit := greatest(coalesce(p_limit, 25), 1) * 4,
    p_organization_id := p_organization_id
  );

  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'worksheet-memory-synthesis-runner');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 600), 30);

  with candidate_rows as (
    select q.id
    from public.worksheet_memory_synthesis_queue q
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
    update public.worksheet_memory_synthesis_queue q
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
      'semanticPoolId', c.semantic_pool_id,
      'semanticPoolSignature', c.semantic_pool_signature,
      'sourceRevisionHash', c.source_revision_hash,
      'maturityStatus', c.maturity_status,
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

create or replace function public.finalize_worksheet_memory_synthesis_batch(
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
  queue_row public.worksheet_memory_synthesis_queue%rowtype;
  resolved_status text;
  resolved_retry_after timestamptz;
  completed_count integer := 0;
  retried_count integer := 0;
  dead_lettered_count integer := 0;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'finalize_worksheet_memory_synthesis_batch requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_status := coalesce(nullif(input_item->>'queueState', ''), 'retry_scheduled');
    resolved_retry_after := nullif(input_item->>'retryAfter', '')::timestamptz;

    select q.*
    into queue_row
    from public.worksheet_memory_synthesis_queue q
    where q.id = nullif(input_item->>'id', '')::uuid
      and q.queue_state = 'claimed'
      and q.claim_token = nullif(input_item->>'claimToken', '')::uuid
    for update;

    if not found then
      continue;
    end if;

    finalized_ids := finalized_ids || jsonb_build_array(queue_row.id);

    if resolved_status = 'completed' then
      update public.worksheet_memory_synthesis_queue
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
      update public.worksheet_memory_synthesis_queue
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
      update public.worksheet_memory_synthesis_queue
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

grant select, insert, update on public.worksheet_memory_synthesis_queue to service_role;
grant select, insert, update on public.worksheet_memory_synthesis_runs to service_role;
grant select, insert, update on public.organization_memory_items to service_role;
grant select, insert, update on public.organization_memory_links to service_role;

grant usage, select on all sequences in schema public to service_role;

grant execute on function public.enqueue_worksheet_memory_synthesis_queue(integer, uuid) to service_role;
grant execute on function public.claim_worksheet_memory_synthesis_batch(integer, uuid, text, integer) to service_role;
grant execute on function public.finalize_worksheet_memory_synthesis_batch(jsonb) to service_role;
