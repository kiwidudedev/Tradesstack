create table if not exists public.worksheet_event_classifications (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null references public.intelligence_events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  classification_version integer not null default 1,
  attempt_number integer not null default 1,
  classification_status text not null,
  classification_source text not null default 'llm',
  classification_provider text null,
  classification_model text null,
  classification_model_version text null,
  overall_confidence numeric null,
  reasoning_summary text null,
  semantic_fields jsonb not null default '{}'::jsonb,
  request_context jsonb not null default '{}'::jsonb,
  error_code text null,
  error_message text null,
  retry_after timestamptz null,
  batch_key text null,
  classified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_event_classifications_version_positive check (classification_version > 0),
  constraint worksheet_event_classifications_attempt_positive check (attempt_number > 0),
  constraint worksheet_event_classifications_status_check check (
    classification_status in ('classified', 'low_confidence', 'failed')
  ),
  constraint worksheet_event_classifications_source_check check (
    classification_source in ('llm', 'system', 'backfill')
  ),
  constraint worksheet_event_classifications_confidence_range_check check (
    overall_confidence is null or (overall_confidence >= 0 and overall_confidence <= 1)
  ),
  constraint worksheet_event_classifications_semantic_fields_object_check check (
    jsonb_typeof(semantic_fields) = 'object'
  ),
  constraint worksheet_event_classifications_request_context_object_check check (
    jsonb_typeof(request_context) = 'object'
  ),
  constraint worksheet_event_classifications_unique_attempt check (
    classification_version > 0 and attempt_number > 0
  )
);

create unique index if not exists worksheet_event_classifications_source_version_attempt_idx
  on public.worksheet_event_classifications (source_event_id, classification_version, attempt_number);

create index if not exists worksheet_event_classifications_source_event_idx
  on public.worksheet_event_classifications (source_event_id, classification_version, classified_at desc);

create index if not exists worksheet_event_classifications_org_status_idx
  on public.worksheet_event_classifications (organization_id, classification_status, classified_at desc);

create index if not exists worksheet_event_classifications_retry_idx
  on public.worksheet_event_classifications (classification_status, retry_after)
  where classification_status = 'failed';

create or replace function public._worksheet_event_classification_current_attempt(
  p_source_event_id uuid,
  p_classification_version integer
)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(max(c.attempt_number), 0)
  from public.worksheet_event_classifications c
  where c.source_event_id = p_source_event_id
    and c.classification_version = p_classification_version;
$$;

create or replace function public.list_pending_worksheet_event_classification_batch(
  p_limit integer default 25,
  p_classification_version integer default 1
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with latest_attempt as (
    select distinct on (c.source_event_id, c.classification_version)
      c.source_event_id,
      c.classification_version,
      c.attempt_number,
      c.classification_status,
      c.retry_after
    from public.worksheet_event_classifications c
    where c.classification_version = greatest(coalesce(p_classification_version, 1), 1)
    order by c.source_event_id, c.classification_version, c.attempt_number desc
  ),
  pending_events as (
    select
      e.id,
      e.organization_id,
      e.project_id,
      e.opportunity_id,
      e.event_type,
      e.occurred_at,
      e.metadata,
      e.diff_data,
      greatest(coalesce(p_classification_version, 1), 1) as classification_version,
      coalesce(la.attempt_number, 0) + 1 as next_attempt_number
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
      and (
        la.source_event_id is null
        or la.classification_status = 'failed'
      )
      and (
        la.retry_after is null
        or la.retry_after <= now()
      )
    order by e.occurred_at asc, e.created_at asc
    limit greatest(coalesce(p_limit, 25), 1)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'eventId', pe.id,
      'organizationId', pe.organization_id,
      'projectId', pe.project_id,
      'opportunityId', pe.opportunity_id,
      'eventType', pe.event_type,
      'occurredAt', pe.occurred_at,
      'metadata', pe.metadata,
      'diffData', pe.diff_data,
      'classificationVersion', pe.classification_version,
      'nextAttemptNumber', pe.next_attempt_number
    )
    order by pe.occurred_at asc
  ), '[]'::jsonb)
  from pending_events pe;
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
    resolved_attempt_number := greatest(
      coalesce(
        nullif(input_item->>'attemptNumber', '')::integer,
        public._worksheet_event_classification_current_attempt(resolved_source_event_id, resolved_classification_version) + 1
      ),
      1
    );

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
      coalesce(input_item->'requestContext', '{}'::jsonb),
      nullif(btrim(coalesce(input_item->>'errorCode', '')), ''),
      nullif(btrim(coalesce(input_item->>'errorMessage', '')), ''),
      nullif(input_item->>'retryAfter', '')::timestamptz,
      nullif(btrim(coalesce(input_item->>'batchKey', '')), ''),
      coalesce(nullif(input_item->>'classifiedAt', '')::timestamptz, now())
    )
    returning id into inserted_id;

    inserted_ids := inserted_ids || jsonb_build_array(inserted_id);
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
  );
end;
$$;

grant select on public.worksheet_event_classifications to authenticated;
grant insert on public.worksheet_event_classifications to service_role;
grant execute on function public.list_pending_worksheet_event_classification_batch(integer, integer) to service_role;
grant execute on function public.record_worksheet_event_classifications(jsonb) to service_role;
