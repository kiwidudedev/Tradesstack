alter table public.worksheet_pricing_pattern_evidence_processing
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists claimed_at timestamptz null,
  add column if not exists claim_expires_at timestamptz null,
  add column if not exists claimed_by text null,
  add column if not exists claim_token uuid null,
  add column if not exists last_error_code text null,
  add column if not exists last_error_message text null;

update public.worksheet_pricing_pattern_evidence_processing
set
  processing_status = case
    when processing_status = 'processing' then 'claimed'
    when processing_status = 'failed' then 'retry_scheduled'
    else processing_status
  end,
  attempt_count = case
    when processing_status = 'pending' then coalesce(attempt_count, 0)
    else greatest(coalesce(attempt_count, 0), 1)
  end,
  last_error_code = coalesce(last_error_code, error_code),
  last_error_message = coalesce(last_error_message, error_message),
  updated_at = now()
where
  processing_status in ('processing', 'failed')
  or coalesce(attempt_count, 0) = 0
  or (last_error_code is null and error_code is not null)
  or (last_error_message is null and error_message is not null);

alter table public.worksheet_pricing_pattern_evidence_processing
  drop constraint if exists worksheet_pricing_pattern_evidence_processing_processing_status_check;

alter table public.worksheet_pricing_pattern_evidence_processing
  add constraint worksheet_pricing_pattern_evidence_processing_processing_status_check check (
    processing_status in ('pending', 'claimed', 'processed', 'retry_scheduled', 'dead_lettered')
  );

alter table public.worksheet_pricing_pattern_evidence_processing
  drop constraint if exists worksheet_pricing_pattern_evidence_processing_attempt_count_non_negative;

alter table public.worksheet_pricing_pattern_evidence_processing
  add constraint worksheet_pricing_pattern_evidence_processing_attempt_count_non_negative check (attempt_count >= 0);

alter table public.worksheet_pricing_pattern_evidence_processing
  drop constraint if exists worksheet_pricing_pattern_evidence_processing_max_attempts_positive;

alter table public.worksheet_pricing_pattern_evidence_processing
  add constraint worksheet_pricing_pattern_evidence_processing_max_attempts_positive check (max_attempts > 0);

create index if not exists worksheet_pricing_pattern_evidence_processing_claimable_idx
  on public.worksheet_pricing_pattern_evidence_processing (
    organization_id,
    processing_status,
    retry_after,
    claim_expires_at,
    created_at desc
  )
  where processing_status in ('pending', 'claimed', 'retry_scheduled');

create index if not exists worksheet_pricing_pattern_evidence_processing_claim_token_idx
  on public.worksheet_pricing_pattern_evidence_processing (claim_token)
  where claim_token is not null;

create or replace function public.enqueue_worksheet_pricing_pattern_evidence_processing(
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
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'enqueue_worksheet_pricing_pattern_evidence_processing requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    insert into public.worksheet_pricing_pattern_evidence_processing (
      organization_id,
      source_event_id,
      classification_record_id,
      classification_version,
      classification_attempt_number,
      processing_status,
      processing_run_id,
      processed_at,
      failed_at,
      retry_after,
      error_code,
      error_message,
      attempt_count,
      max_attempts,
      claimed_at,
      claim_expires_at,
      claimed_by,
      claim_token,
      last_error_code,
      last_error_message
    )
    values (
      nullif(input_item->>'organizationId', '')::uuid,
      nullif(input_item->>'sourceEventId', '')::uuid,
      nullif(input_item->>'classificationRecordId', '')::uuid,
      greatest(coalesce(nullif(input_item->>'classificationVersion', '')::integer, 1), 1),
      greatest(coalesce(nullif(input_item->>'classificationAttemptNumber', '')::integer, 1), 1),
      'pending',
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      5,
      null,
      null,
      null,
      null,
      null,
      null
    )
    on conflict (source_event_id, classification_version) do update
    set
      organization_id = excluded.organization_id,
      classification_record_id = coalesce(excluded.classification_record_id, public.worksheet_pricing_pattern_evidence_processing.classification_record_id),
      classification_attempt_number = greatest(
        public.worksheet_pricing_pattern_evidence_processing.classification_attempt_number,
        excluded.classification_attempt_number
      ),
      updated_at = now()
    returning id into inserted_id;

    inserted_ids := inserted_ids || jsonb_build_array(inserted_id);
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
  );
end;
$$;

create or replace function public.claim_worksheet_pricing_pattern_evidence_processing_batch(
  p_limit integer default 100,
  p_organization_id uuid default null,
  p_source_event_ids uuid[] default null,
  p_worker_id text default null,
  p_processing_run_id uuid default null,
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
  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'worksheet-pricing-pattern-shadow-runner');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 600), 30);

  with candidate_rows as (
    select q.id
    from public.worksheet_pricing_pattern_evidence_processing q
    where (p_organization_id is null or q.organization_id = p_organization_id)
      and (p_source_event_ids is null or q.source_event_id = any(p_source_event_ids))
      and q.attempt_count < q.max_attempts
      and (
        q.processing_status = 'pending'
        or (
          q.processing_status = 'retry_scheduled'
          and (q.retry_after is null or q.retry_after <= now())
        )
        or (
          q.processing_status = 'claimed'
          and (q.claim_expires_at is null or q.claim_expires_at <= now())
        )
      )
    order by
      (q.attempt_count = 0) desc,
      case when q.attempt_count = 0 then q.created_at end desc,
      case when q.attempt_count > 0 then q.retry_after end asc,
      q.created_at asc
    limit greatest(coalesce(p_limit, 100), 1)
    for update skip locked
  ),
  claimed as (
    update public.worksheet_pricing_pattern_evidence_processing q
    set
      processing_status = 'claimed',
      attempt_count = q.attempt_count + 1,
      processing_run_id = coalesce(p_processing_run_id, q.processing_run_id),
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => resolved_lease_seconds),
      claimed_by = resolved_worker_id,
      claim_token = gen_random_uuid(),
      failed_at = null,
      updated_at = now()
    from candidate_rows c
    where q.id = c.id
    returning q.*
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'rowId', c.id,
      'organizationId', c.organization_id,
      'sourceEventId', c.source_event_id,
      'classificationRecordId', c.classification_record_id,
      'classificationVersion', c.classification_version,
      'classificationAttemptNumber', c.classification_attempt_number,
      'attemptCount', c.attempt_count,
      'maxAttempts', c.max_attempts,
      'processingStatus', c.processing_status,
      'processingRunId', c.processing_run_id,
      'claimedAt', c.claimed_at,
      'claimExpiresAt', c.claim_expires_at,
      'claimedBy', c.claimed_by,
      'claimToken', c.claim_token,
      'retryAfter', c.retry_after,
      'lastErrorCode', c.last_error_code,
      'lastErrorMessage', c.last_error_message,
      'createdAt', c.created_at,
      'updatedAt', c.updated_at
    )
    order by c.created_at asc
  ), '[]'::jsonb)
  into claimed_rows
  from claimed c;

  return claimed_rows;
end;
$$;

create or replace function public.finalize_worksheet_pricing_pattern_evidence_processing_batch(
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
  queue_row public.worksheet_pricing_pattern_evidence_processing%rowtype;
  resolved_status text;
  resolved_retry_after timestamptz;
  processed_count integer := 0;
  retried_count integer := 0;
  dead_lettered_count integer := 0;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'finalize_worksheet_pricing_pattern_evidence_processing_batch requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_status := coalesce(nullif(btrim(coalesce(input_item->>'processingStatus', '')), ''), 'retry_scheduled');
    resolved_retry_after := nullif(input_item->>'retryAfter', '')::timestamptz;

    select *
    into queue_row
    from public.worksheet_pricing_pattern_evidence_processing q
    where q.source_event_id = nullif(input_item->>'sourceEventId', '')::uuid
      and q.organization_id = nullif(input_item->>'organizationId', '')::uuid
      and q.classification_version = greatest(coalesce(nullif(input_item->>'classificationVersion', '')::integer, 1), 1)
      and q.processing_status = 'claimed'
      and q.claim_token = nullif(input_item->>'claimToken', '')::uuid
      and q.attempt_count = greatest(coalesce(nullif(input_item->>'attemptCount', '')::integer, 1), 1)
    for update;

    if not found then
      raise exception 'Worksheet pricing pattern evidence processing claim not found.';
    end if;

    finalized_ids := finalized_ids || jsonb_build_array(queue_row.id);

    if resolved_status = 'processed' then
      update public.worksheet_pricing_pattern_evidence_processing
      set
        processing_status = 'processed',
        processed_at = coalesce(nullif(input_item->>'processedAt', '')::timestamptz, now()),
        failed_at = null,
        retry_after = null,
        error_code = null,
        error_message = null,
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = null,
        last_error_message = null,
        updated_at = now()
      where id = queue_row.id;

      processed_count := processed_count + 1;
    elsif queue_row.attempt_count >= queue_row.max_attempts or resolved_status = 'dead_lettered' then
      update public.worksheet_pricing_pattern_evidence_processing
      set
        processing_status = 'dead_lettered',
        failed_at = coalesce(nullif(input_item->>'failedAt', '')::timestamptz, now()),
        retry_after = coalesce(resolved_retry_after, retry_after),
        error_code = nullif(btrim(coalesce(input_item->>'errorCode', '')), ''),
        error_message = nullif(btrim(coalesce(input_item->>'errorMessage', '')), ''),
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
      update public.worksheet_pricing_pattern_evidence_processing
      set
        processing_status = 'retry_scheduled',
        failed_at = coalesce(nullif(input_item->>'failedAt', '')::timestamptz, now()),
        retry_after = coalesce(resolved_retry_after, now()),
        error_code = nullif(btrim(coalesce(input_item->>'errorCode', '')), ''),
        error_message = nullif(btrim(coalesce(input_item->>'errorMessage', '')), ''),
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
    'processedCount', processed_count,
    'retriedCount', retried_count,
    'deadLetteredCount', dead_lettered_count
  );
end;
$$;

grant execute on function public.enqueue_worksheet_pricing_pattern_evidence_processing(jsonb) to service_role;
grant execute on function public.claim_worksheet_pricing_pattern_evidence_processing_batch(integer, uuid, uuid[], text, uuid, integer) to service_role;
grant execute on function public.finalize_worksheet_pricing_pattern_evidence_processing_batch(jsonb) to service_role;
