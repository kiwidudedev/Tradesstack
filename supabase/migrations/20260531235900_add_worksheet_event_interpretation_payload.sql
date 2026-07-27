alter table public.worksheet_event_classifications
  add column if not exists interpretation_schema_version integer not null default 1,
  add column if not exists interpretation_payload jsonb not null default '{}'::jsonb;

alter table public.worksheet_event_classifications
  drop constraint if exists worksheet_event_classifications_interpretation_version_positive;

alter table public.worksheet_event_classifications
  add constraint worksheet_event_classifications_interpretation_version_positive check (
    interpretation_schema_version > 0
  );

alter table public.worksheet_event_classifications
  drop constraint if exists worksheet_event_classifications_interpretation_payload_object_check;

alter table public.worksheet_event_classifications
  add constraint worksheet_event_classifications_interpretation_payload_object_check check (
    jsonb_typeof(interpretation_payload) = 'object'
  );

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
      interpretation_schema_version,
      interpretation_payload,
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

create or replace function public.list_classified_worksheet_memory_events(
  p_organization_id uuid default null,
  p_limit integer default 1000
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with latest_classification as (
    select distinct on (c.source_event_id)
      c.source_event_id,
      c.organization_id,
      c.classification_version,
      c.attempt_number,
      c.classification_status,
      c.classification_source,
      c.classification_provider,
      c.classification_model,
      c.classification_model_version,
      c.overall_confidence,
      c.reasoning_summary,
      c.semantic_fields,
      c.interpretation_schema_version,
      c.interpretation_payload,
      c.request_context,
      c.classified_at
    from public.worksheet_event_classifications c
    where c.classification_status = 'classified'
      and (p_organization_id is null or c.organization_id = p_organization_id)
    order by c.source_event_id, c.classification_version desc, c.attempt_number desc, c.classified_at desc
  ),
  joined as (
    select
      e.id as event_id,
      e.organization_id,
      e.project_id,
      e.opportunity_id,
      e.event_type,
      e.occurred_at,
      e.metadata,
      e.diff_data,
      lc.classification_version,
      lc.classification_source,
      lc.classification_provider,
      lc.classification_model,
      lc.classification_model_version,
      lc.overall_confidence,
      lc.reasoning_summary,
      lc.semantic_fields,
      lc.interpretation_schema_version,
      lc.interpretation_payload,
      lc.request_context,
      lc.classified_at
    from latest_classification lc
    join public.intelligence_events e
      on e.id = lc.source_event_id
     and e.organization_id = lc.organization_id
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
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'eventId', j.event_id,
      'organizationId', j.organization_id,
      'projectId', j.project_id,
      'opportunityId', j.opportunity_id,
      'eventType', j.event_type,
      'occurredAt', j.occurred_at,
      'metadata', j.metadata,
      'diffData', j.diff_data,
      'classificationVersion', j.classification_version,
      'classificationSource', j.classification_source,
      'classificationProvider', j.classification_provider,
      'classificationModel', j.classification_model,
      'classificationModelVersion', j.classification_model_version,
      'overallConfidence', j.overall_confidence,
      'reasoningSummary', j.reasoning_summary,
      'semanticFields', j.semantic_fields,
      'interpretationSchemaVersion', j.interpretation_schema_version,
      'interpretationPayload', j.interpretation_payload,
      'requestContext', j.request_context,
      'classifiedAt', j.classified_at
    )
    order by j.classified_at desc, j.occurred_at desc
  ), '[]'::jsonb)
  from (
    select *
    from joined
    order by classified_at desc, occurred_at desc
    limit greatest(coalesce(p_limit, 1000), 1)
  ) j;
$$;
