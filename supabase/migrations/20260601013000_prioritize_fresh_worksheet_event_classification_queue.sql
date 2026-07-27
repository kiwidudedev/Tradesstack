create or replace function public.list_pending_worksheet_event_classification_batch(
  p_limit integer default 25,
  p_classification_version integer default 1,
  p_organization_id uuid default null
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
      e.created_at,
      e.metadata,
      e.diff_data,
      greatest(coalesce(p_classification_version, 1), 1) as classification_version,
      coalesce(la.attempt_number, 0) + 1 as next_attempt_number,
      (la.source_event_id is null) as has_no_prior_attempt,
      coalesce(la.classification_status, 'pending') as latest_classification_status,
      la.retry_after
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
      and (
        la.source_event_id is null
        or la.classification_status = 'failed'
      )
      and (
        la.retry_after is null
        or la.retry_after <= now()
      )
    order by
      (la.source_event_id is null) desc,
      case when la.source_event_id is null then e.occurred_at end desc,
      case when la.source_event_id is null then e.created_at end desc,
      case when la.source_event_id is not null then la.retry_after end asc nulls last,
      case when la.source_event_id is not null then e.occurred_at end asc,
      case when la.source_event_id is not null then e.created_at end asc
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
    order by
      pe.has_no_prior_attempt desc,
      case when pe.has_no_prior_attempt then pe.occurred_at end desc,
      case when pe.has_no_prior_attempt then pe.created_at end desc,
      case when not pe.has_no_prior_attempt then pe.retry_after end asc nulls last,
      case when not pe.has_no_prior_attempt then pe.occurred_at end asc,
      case when not pe.has_no_prior_attempt then pe.created_at end asc
  ), '[]'::jsonb)
  from pending_events pe;
$$;

grant execute on function public.list_pending_worksheet_event_classification_batch(integer, integer, uuid) to service_role;
