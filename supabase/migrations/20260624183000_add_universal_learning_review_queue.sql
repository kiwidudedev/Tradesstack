create table if not exists public.learning_review_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  container_type text not null,
  review_month date not null,
  scope_key text not null default 'organization',
  queue_state text not null default 'pending',
  priority integer not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  retry_after timestamptz null,
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_run_id uuid null references public.learning_review_runs (id) on delete set null,
  last_error_code text null,
  last_error_message text null,
  last_completed_at timestamptz null,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  budget_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_review_queue_container_type_check check (
    container_type in (
      'pricing_workbook_sheet',
      'takeoff_measurement',
      'project_quote',
      'project_variation',
      'project_purchase_order',
      'supplier_invoice',
      'supplier_invoice_allocation',
      'project_actual_cost_event',
      'organization_material',
      'material_import_batch',
      'project_claim',
      'project_time_sheet_entry',
      'project_quality_issue',
      'project_quality_inspection',
      'project_quality_sign_off',
      'task'
    )
  ),
  constraint learning_review_queue_scope_key_not_blank check (char_length(trim(scope_key)) > 0),
  constraint learning_review_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered', 'skipped')
  ),
  constraint learning_review_queue_attempts_check check (
    attempt_count >= 0 and max_attempts > 0 and priority >= 0
  ),
  constraint learning_review_queue_eligibility_snapshot_object_check check (jsonb_typeof(eligibility_snapshot) = 'object'),
  constraint learning_review_queue_budget_snapshot_object_check check (jsonb_typeof(budget_snapshot) = 'object')
);

create unique index if not exists learning_review_queue_org_container_scope_month_uidx
  on public.learning_review_queue (organization_id, container_type, scope_key, review_month);

create index if not exists learning_review_queue_claim_scan_idx
  on public.learning_review_queue (
    queue_state,
    available_at,
    priority desc,
    created_at
  )
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists learning_review_queue_org_month_state_idx
  on public.learning_review_queue (organization_id, review_month desc, queue_state);

create index if not exists learning_review_queue_dead_letter_idx
  on public.learning_review_queue (updated_at desc)
  where queue_state = 'dead_lettered';

drop trigger if exists set_learning_review_queue_updated_at on public.learning_review_queue;
create trigger set_learning_review_queue_updated_at
before update on public.learning_review_queue
for each row execute function public.set_updated_at();

alter table public.learning_review_queue enable row level security;
alter table public.learning_review_queue force row level security;

grant select, insert, update on public.learning_review_queue to service_role;

create or replace function public.enqueue_learning_review_queue(
  p_organization_id uuid,
  p_container_type text,
  p_review_month date,
  p_scope_key text default 'organization',
  p_priority integer default 0,
  p_max_attempts integer default 3,
  p_available_at timestamptz default now(),
  p_eligibility_snapshot jsonb default '{}'::jsonb,
  p_budget_snapshot jsonb default '{}'::jsonb
)
returns public.learning_review_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  queue_row public.learning_review_queue%rowtype;
begin
  insert into public.learning_review_queue (
    organization_id,
    container_type,
    review_month,
    scope_key,
    priority,
    max_attempts,
    available_at,
    eligibility_snapshot,
    budget_snapshot
  )
  values (
    p_organization_id,
    p_container_type,
    p_review_month,
    coalesce(nullif(btrim(coalesce(p_scope_key, '')), ''), 'organization'),
    greatest(coalesce(p_priority, 0), 0),
    greatest(coalesce(p_max_attempts, 3), 1),
    coalesce(p_available_at, now()),
    coalesce(p_eligibility_snapshot, '{}'::jsonb),
    coalesce(p_budget_snapshot, '{}'::jsonb)
  )
  on conflict (organization_id, container_type, scope_key, review_month)
  do update set
    priority = greatest(public.learning_review_queue.priority, excluded.priority),
    max_attempts = greatest(public.learning_review_queue.max_attempts, excluded.max_attempts),
    available_at = case
      when public.learning_review_queue.queue_state in ('completed', 'dead_lettered')
        then public.learning_review_queue.available_at
      else least(public.learning_review_queue.available_at, excluded.available_at)
    end,
    eligibility_snapshot = excluded.eligibility_snapshot,
    budget_snapshot = excluded.budget_snapshot
  returning * into queue_row;

  return queue_row;
end;
$$;

create or replace function public.claim_learning_review_batch(
  p_limit integer default 5,
  p_organization_id uuid default null,
  p_container_type text default null,
  p_worker_id text default null,
  p_lease_seconds integer default 900
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
  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'universal-construction-learning-worker');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 900), 30);

  with candidate_rows as (
    select q.id
    from public.learning_review_queue q
    where (p_organization_id is null or q.organization_id = p_organization_id)
      and (p_container_type is null or q.container_type = p_container_type)
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
    limit greatest(coalesce(p_limit, 5), 1)
    for update skip locked
  ),
  claimed as (
    update public.learning_review_queue q
    set
      queue_state = 'claimed',
      attempt_count = q.attempt_count + 1,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => resolved_lease_seconds),
      claimed_by = resolved_worker_id,
      claim_token = gen_random_uuid(),
      updated_at = now()
    from candidate_rows c
    where q.id = c.id
    returning q.*
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'organizationId', c.organization_id,
      'containerType', c.container_type,
      'reviewMonth', c.review_month,
      'scopeKey', c.scope_key,
      'queueState', c.queue_state,
      'priority', c.priority,
      'attemptCount', c.attempt_count,
      'maxAttempts', c.max_attempts,
      'availableAt', c.available_at,
      'retryAfter', c.retry_after,
      'claimedAt', c.claimed_at,
      'claimExpiresAt', c.claim_expires_at,
      'claimedBy', c.claimed_by,
      'claimToken', c.claim_token,
      'lastRunId', c.last_run_id,
      'lastErrorCode', c.last_error_code,
      'lastErrorMessage', c.last_error_message,
      'lastCompletedAt', c.last_completed_at,
      'eligibilitySnapshot', c.eligibility_snapshot,
      'budgetSnapshot', c.budget_snapshot,
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

create or replace function public.finalize_learning_review_batch(
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
  queue_row public.learning_review_queue%rowtype;
  resolved_status text;
  resolved_retry_after timestamptz;
  completed_count integer := 0;
  retried_count integer := 0;
  dead_lettered_count integer := 0;
  skipped_count integer := 0;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'finalize_learning_review_batch requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_status := coalesce(nullif(input_item->>'queueState', ''), 'retry_scheduled');
    resolved_retry_after := nullif(input_item->>'retryAfter', '')::timestamptz;

    select q.*
    into queue_row
    from public.learning_review_queue q
    where q.id = nullif(input_item->>'id', '')::uuid
      and q.queue_state = 'claimed'
      and q.claim_token = nullif(input_item->>'claimToken', '')::uuid
    for update;

    if not found then
      continue;
    end if;

    finalized_ids := finalized_ids || jsonb_build_array(queue_row.id);

    if resolved_status = 'completed' then
      update public.learning_review_queue
      set
        queue_state = 'completed',
        available_at = now(),
        retry_after = null,
        claim_token = null,
        claim_expires_at = null,
        claimed_at = null,
        claimed_by = null,
        last_run_id = nullif(input_item->>'lastRunId', '')::uuid,
        last_error_code = nullif(input_item->>'errorCode', ''),
        last_error_message = nullif(input_item->>'errorMessage', ''),
        last_completed_at = now(),
        updated_at = now()
      where id = queue_row.id;

      completed_count := completed_count + 1;
    elsif resolved_status = 'skipped' then
      update public.learning_review_queue
      set
        queue_state = 'skipped',
        available_at = now(),
        retry_after = null,
        claim_token = null,
        claim_expires_at = null,
        claimed_at = null,
        claimed_by = null,
        last_run_id = nullif(input_item->>'lastRunId', '')::uuid,
        last_error_code = nullif(input_item->>'errorCode', ''),
        last_error_message = nullif(input_item->>'errorMessage', ''),
        updated_at = now()
      where id = queue_row.id;

      skipped_count := skipped_count + 1;
    elsif queue_row.attempt_count >= queue_row.max_attempts or resolved_status = 'dead_lettered' then
      update public.learning_review_queue
      set
        queue_state = 'dead_lettered',
        available_at = coalesce(resolved_retry_after, available_at),
        retry_after = resolved_retry_after,
        claim_token = null,
        claim_expires_at = null,
        claimed_at = null,
        claimed_by = null,
        last_run_id = nullif(input_item->>'lastRunId', '')::uuid,
        last_error_code = nullif(input_item->>'errorCode', ''),
        last_error_message = nullif(input_item->>'errorMessage', ''),
        updated_at = now()
      where id = queue_row.id;

      dead_lettered_count := dead_lettered_count + 1;
    else
      update public.learning_review_queue
      set
        queue_state = 'retry_scheduled',
        available_at = coalesce(resolved_retry_after, now()),
        retry_after = coalesce(resolved_retry_after, now()),
        claim_token = null,
        claim_expires_at = null,
        claimed_at = null,
        claimed_by = null,
        last_run_id = nullif(input_item->>'lastRunId', '')::uuid,
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
    'deadLetteredCount', dead_lettered_count,
    'skippedCount', skipped_count
  );
end;
$$;

grant execute on function public.enqueue_learning_review_queue(uuid, text, date, text, integer, integer, timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.claim_learning_review_batch(integer, uuid, text, text, integer) to service_role;
grant execute on function public.finalize_learning_review_batch(jsonb) to service_role;
