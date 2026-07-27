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

grant execute on function public.list_classified_worksheet_memory_events(uuid, integer) to service_role;
