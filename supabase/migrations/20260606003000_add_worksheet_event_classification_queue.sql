create table if not exists public.worksheet_event_classification_queue (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null references public.intelligence_events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  classification_version integer not null default 1,
  queue_state text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_error_code text null,
  last_error_message text null,
  last_attempt_at timestamptz null,
  last_completed_at timestamptz null,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_event_classification_queue_version_positive check (classification_version > 0),
  constraint worksheet_event_classification_queue_attempt_count_non_negative check (attempt_count >= 0),
  constraint worksheet_event_classification_queue_max_attempts_positive check (max_attempts > 0),
  constraint worksheet_event_classification_queue_priority_non_negative check (priority >= 0),
  constraint worksheet_event_classification_queue_state_check check (
    queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')
  )
);

alter table public.worksheet_event_classification_queue enable row level security;
alter table public.worksheet_event_classification_queue force row level security;

revoke all on public.worksheet_event_classification_queue from public, anon, authenticated;

create unique index if not exists worksheet_event_classification_queue_source_version_idx
  on public.worksheet_event_classification_queue (source_event_id, classification_version);

create index if not exists worksheet_event_classification_queue_state_available_idx
  on public.worksheet_event_classification_queue (queue_state, available_at, claim_expires_at, priority desc)
  where queue_state in ('pending', 'claimed', 'retry_scheduled');

create index if not exists worksheet_event_classification_queue_org_state_available_idx
  on public.worksheet_event_classification_queue (organization_id, queue_state, available_at, claim_expires_at, priority desc);

create index if not exists worksheet_event_classification_queue_claimed_by_idx
  on public.worksheet_event_classification_queue (claimed_by, claim_expires_at)
  where queue_state = 'claimed';

create or replace function public.enqueue_worksheet_event_classification_queue(
  p_limit integer default 1000,
  p_classification_version integer default 1,
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
  with latest_attempt as (
    select distinct on (c.source_event_id, c.classification_version)
      c.source_event_id,
      c.organization_id,
      c.classification_version,
      c.attempt_number,
      c.classification_status,
      c.retry_after,
      c.error_code,
      c.error_message,
      c.classified_at
    from public.worksheet_event_classifications c
    where c.classification_version = greatest(coalesce(p_classification_version, 1), 1)
    order by c.source_event_id, c.classification_version, c.attempt_number desc, c.classified_at desc
  ),
  eligible_events as (
    select
      e.id as source_event_id,
      e.organization_id,
      greatest(coalesce(p_classification_version, 1), 1) as classification_version,
      la.attempt_number,
      la.classification_status,
      la.retry_after,
      la.error_code,
      la.error_message,
      la.classified_at
    from public.intelligence_events e
    left join latest_attempt la
      on la.source_event_id = e.id
     and la.classification_version = greatest(coalesce(p_classification_version, 1), 1)
    where e.module = 'pricing_worksheets'
      and e.event_type in (
        'worksheet_cell_edited',
        'worksheet_formula_edited',
        'worksheet_rate_changed',
        'worksheet_assumption_changed',
        'worksheet_ai_rate_corrected',
        'worksheet_ai_assumption_corrected',
        'worksheet_ai_formula_corrected',
        'worksheet_ai_output_corrected'
      )
      and coalesce(e.diff_data->>'classificationStatus', '') = 'pending'
      and coalesce(nullif(e.diff_data->>'rawContextVersion', '')::integer, 1) = 1
      and (p_organization_id is null or e.organization_id = p_organization_id)
    order by e.occurred_at desc, e.created_at desc
    limit greatest(coalesce(p_limit, 1000), 1)
  ),
  inserted as (
    insert into public.worksheet_event_classification_queue (
      source_event_id,
      organization_id,
      classification_version,
      queue_state,
      attempt_count,
      max_attempts,
      available_at,
      claimed_at,
      claim_expires_at,
      claimed_by,
      claim_token,
      last_error_code,
      last_error_message,
      last_attempt_at,
      last_completed_at,
      priority,
      updated_at
    )
    select
      ee.source_event_id,
      ee.organization_id,
      ee.classification_version,
      case
        when ee.classification_status in ('classified', 'low_confidence') then 'completed'
        when ee.classification_status = 'failed' and coalesce(ee.attempt_number, 0) >= 5 then 'dead_lettered'
        when ee.classification_status = 'failed' then 'retry_scheduled'
        else 'pending'
      end,
      greatest(coalesce(ee.attempt_number, 0), 0),
      5,
      case
        when ee.classification_status = 'failed' then coalesce(ee.retry_after, now())
        else now()
      end,
      null,
      null,
      null,
      null,
      ee.error_code,
      ee.error_message,
      ee.classified_at,
      case
        when ee.classification_status in ('classified', 'low_confidence') then ee.classified_at
        else null
      end,
      0,
      now()
    from eligible_events ee
    on conflict (source_event_id, classification_version) do nothing
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

create or replace function public.claim_worksheet_event_classification_batch(
  p_limit integer default 25,
  p_classification_version integer default 1,
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
  claimed_events jsonb := '[]'::jsonb;
  resolved_worker_id text;
  resolved_lease_seconds integer;
begin
  perform public.enqueue_worksheet_event_classification_queue(
    p_limit := greatest(coalesce(p_limit, 25), 1) * 4,
    p_classification_version := greatest(coalesce(p_classification_version, 1), 1),
    p_organization_id := p_organization_id
  );

  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'worksheet-event-classification-runner');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 600), 30);

  with candidate_rows as (
    select q.id
    from public.worksheet_event_classification_queue q
    join public.intelligence_events e
      on e.id = q.source_event_id
     and e.organization_id = q.organization_id
    where q.classification_version = greatest(coalesce(p_classification_version, 1), 1)
      and (p_organization_id is null or q.organization_id = p_organization_id)
      and q.attempt_count < q.max_attempts
      and q.available_at <= now()
      and q.queue_state in ('pending', 'claimed', 'retry_scheduled')
      and (
        q.queue_state <> 'claimed'
        or q.claim_expires_at is null
        or q.claim_expires_at <= now()
      )
      and e.module = 'pricing_worksheets'
      and e.event_type in (
        'worksheet_cell_edited',
        'worksheet_formula_edited',
        'worksheet_rate_changed',
        'worksheet_assumption_changed',
        'worksheet_ai_rate_corrected',
        'worksheet_ai_assumption_corrected',
        'worksheet_ai_formula_corrected',
        'worksheet_ai_output_corrected'
      )
      and coalesce(e.diff_data->>'classificationStatus', '') = 'pending'
      and coalesce(nullif(e.diff_data->>'rawContextVersion', '')::integer, 1) = 1
    order by
      (q.attempt_count = 0) desc,
      case when q.attempt_count = 0 then e.occurred_at end desc,
      case when q.attempt_count = 0 then e.created_at end desc,
      case when q.attempt_count > 0 then q.available_at end asc,
      case when q.attempt_count > 0 then e.occurred_at end asc,
      case when q.attempt_count > 0 then e.created_at end asc
    limit greatest(coalesce(p_limit, 25), 1)
    for update of q skip locked
  ),
  claimed as (
    update public.worksheet_event_classification_queue q
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
    returning
      q.id,
      q.source_event_id,
      q.organization_id,
      q.classification_version,
      q.attempt_count as attempt_number,
      q.claim_token,
      q.claim_expires_at
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'queueId', c.id,
      'eventId', e.id,
      'organizationId', e.organization_id,
      'projectId', e.project_id,
      'opportunityId', e.opportunity_id,
      'eventType', e.event_type,
      'occurredAt', e.occurred_at,
      'metadata', e.metadata,
      'diffData', e.diff_data,
      'classificationVersion', c.classification_version,
      'attemptNumber', c.attempt_number,
      'claimToken', c.claim_token,
      'claimExpiresAt', c.claim_expires_at
    )
    order by e.occurred_at asc
  ), '[]'::jsonb)
  into claimed_events
  from claimed c
  join public.intelligence_events e
    on e.id = c.source_event_id
   and e.organization_id = c.organization_id;

  return claimed_events;
end;
$$;

create or replace function public.record_worksheet_event_classifications(
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
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'record_worksheet_event_classifications requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_source_event_id := nullif(input_item->>'sourceEventId', '')::uuid;
    resolved_organization_id := nullif(input_item->>'organizationId', '')::uuid;
    resolved_classification_version := greatest(coalesce(nullif(input_item->>'classificationVersion', '')::integer, 1), 1);
    resolved_attempt_number := greatest(coalesce(nullif(input_item->>'attemptNumber', '')::integer, 1), 1);

    insert into public.worksheet_event_classifications (
      source_event_id,
      organization_id,
      classification_version,
      attempt_number,
      classification_status,
      classification_source,
      classification_provider,
      classification_model,
      classification_model_version,
      overall_confidence,
      reasoning_summary,
      semantic_fields,
      interpretation_schema_version,
      interpretation_payload,
      interpretation_prompt_version,
      context_sources,
      construction_intelligence_inputs,
      future_use_summary,
      confidence_detail,
      request_context,
      error_code,
      error_message,
      retry_after,
      batch_key,
      classified_at
    )
    values (
      resolved_source_event_id,
      resolved_organization_id,
      resolved_classification_version,
      resolved_attempt_number,
      coalesce(nullif(btrim(coalesce(input_item->>'classificationStatus', '')), ''), 'failed'),
      coalesce(nullif(btrim(coalesce(input_item->>'classificationSource', '')), ''), 'llm'),
      nullif(btrim(coalesce(input_item->>'classificationProvider', '')), ''),
      nullif(btrim(coalesce(input_item->>'classificationModel', '')), ''),
      nullif(btrim(coalesce(input_item->>'classificationModelVersion', '')), ''),
      nullif(input_item->>'overallConfidence', '')::numeric,
      nullif(btrim(coalesce(input_item->>'reasoningSummary', '')), ''),
      coalesce(input_item->'semanticFields', '{}'::jsonb),
      greatest(coalesce(nullif(input_item->>'interpretationSchemaVersion', '')::integer, 1), 1),
      coalesce(input_item->'interpretationPayload', '{}'::jsonb),
      greatest(coalesce(nullif(input_item->>'interpretationPromptVersion', '')::integer, 1), 1),
      coalesce(input_item->'contextSources', '{}'::jsonb),
      coalesce(input_item->'constructionIntelligenceInputs', '{}'::jsonb),
      coalesce(input_item->'futureUseSummary', '{}'::jsonb),
      coalesce(input_item->'confidenceDetail', '{}'::jsonb),
      coalesce(input_item->'requestContext', '{}'::jsonb),
      nullif(btrim(coalesce(input_item->>'errorCode', '')), ''),
      nullif(btrim(coalesce(input_item->>'errorMessage', '')), ''),
      nullif(input_item->>'retryAfter', '')::timestamptz,
      nullif(btrim(coalesce(input_item->>'batchKey', '')), ''),
      coalesce(nullif(input_item->>'classifiedAt', '')::timestamptz, now())
    )
    on conflict (source_event_id, classification_version, attempt_number) do nothing
    returning id into inserted_id;

    if inserted_id is null then
      select c.id
      into inserted_id
      from public.worksheet_event_classifications c
      where c.source_event_id = resolved_source_event_id
        and c.classification_version = resolved_classification_version
        and c.attempt_number = resolved_attempt_number
      limit 1;
    end if;

    inserted_ids := inserted_ids || jsonb_build_array(inserted_id);
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
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

grant execute on function public.enqueue_worksheet_event_classification_queue(integer, integer, uuid) to service_role;
grant execute on function public.claim_worksheet_event_classification_batch(integer, integer, uuid, text, integer) to service_role;
grant execute on function public.finalize_worksheet_event_classification_claims(jsonb) to service_role;
grant select, insert, update on public.worksheet_event_classification_queue to service_role;
