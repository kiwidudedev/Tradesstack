create table if not exists public.worksheet_pricing_pattern_evidence_processing (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_event_id uuid not null references public.intelligence_events (id) on delete cascade,
  classification_record_id uuid null references public.worksheet_event_classifications (id) on delete set null,
  classification_version integer not null check (classification_version > 0),
  classification_attempt_number integer not null default 1 check (classification_attempt_number > 0),
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'processed', 'failed')),
  processing_run_id uuid null references public.worksheet_pricing_pattern_shadow_runs (id) on delete set null,
  processed_at timestamptz null,
  failed_at timestamptz null,
  retry_after timestamptz null,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_pricing_pattern_evidence_processing_unique_source_version unique (source_event_id, classification_version)
);

create index if not exists worksheet_pricing_pattern_evidence_processing_org_status_idx
  on public.worksheet_pricing_pattern_evidence_processing (organization_id, processing_status, created_at desc);

create index if not exists worksheet_pricing_pattern_evidence_processing_run_idx
  on public.worksheet_pricing_pattern_evidence_processing (processing_run_id, created_at desc);

create table if not exists public.worksheet_pricing_pattern_shadow_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  candidate_status text not null default 'active' check (candidate_status in ('active', 'contested', 'stale', 'retired')),
  pattern_family text null,
  pattern_type text null,
  current_strength text null check (current_strength in ('weak', 'reinforced', 'durable')),
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  title text null,
  summary text null,
  retrieval_guidance text null,
  scope jsonb not null default '{}'::jsonb check (jsonb_typeof(scope) = 'object'),
  pattern_value jsonb not null default '{}'::jsonb check (jsonb_typeof(pattern_value) = 'object'),
  support_count integer not null default 0 check (support_count >= 0),
  contradiction_count integer not null default 0 check (contradiction_count >= 0),
  ignored_count integer not null default 0 check (ignored_count >= 0),
  support_diversity jsonb not null default '{}'::jsonb check (jsonb_typeof(support_diversity) = 'object'),
  contradiction_diversity jsonb null check (contradiction_diversity is null or jsonb_typeof(contradiction_diversity) = 'object'),
  last_reinforced_at timestamptz null,
  last_contradicted_at timestamptz null,
  stale_after timestamptz null,
  created_by_run_id uuid null references public.worksheet_pricing_pattern_shadow_runs (id) on delete set null,
  last_updated_by_run_id uuid null references public.worksheet_pricing_pattern_shadow_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worksheet_pricing_pattern_shadow_candidates_org_status_idx
  on public.worksheet_pricing_pattern_shadow_candidates (organization_id, candidate_status, updated_at desc);

create index if not exists worksheet_pricing_pattern_shadow_candidates_org_family_idx
  on public.worksheet_pricing_pattern_shadow_candidates (organization_id, pattern_family, updated_at desc);

create table if not exists public.worksheet_pricing_pattern_shadow_candidate_evidence (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.worksheet_pricing_pattern_shadow_candidates (id) on delete cascade,
  source_event_id uuid not null references public.intelligence_events (id) on delete cascade,
  evidence_role text not null check (evidence_role in ('supporting', 'contradictory', 'ignored')),
  linked_by_run_id uuid null references public.worksheet_pricing_pattern_shadow_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint worksheet_pricing_pattern_shadow_candidate_evidence_unique unique (candidate_id, source_event_id)
);

create index if not exists worksheet_pricing_pattern_shadow_candidate_evidence_candidate_idx
  on public.worksheet_pricing_pattern_shadow_candidate_evidence (candidate_id, created_at desc);

create index if not exists worksheet_pricing_pattern_shadow_candidate_evidence_source_idx
  on public.worksheet_pricing_pattern_shadow_candidate_evidence (source_event_id, created_at desc);

alter table public.worksheet_pricing_pattern_evidence_processing enable row level security;
alter table public.worksheet_pricing_pattern_evidence_processing force row level security;
alter table public.worksheet_pricing_pattern_shadow_candidates enable row level security;
alter table public.worksheet_pricing_pattern_shadow_candidates force row level security;
alter table public.worksheet_pricing_pattern_shadow_candidate_evidence enable row level security;
alter table public.worksheet_pricing_pattern_shadow_candidate_evidence force row level security;

revoke all on public.worksheet_pricing_pattern_evidence_processing from public, anon, authenticated;
revoke all on public.worksheet_pricing_pattern_shadow_candidates from public, anon, authenticated;
revoke all on public.worksheet_pricing_pattern_shadow_candidate_evidence from public, anon, authenticated;

grant select, insert, update on public.worksheet_pricing_pattern_evidence_processing to service_role;
grant select, insert, update on public.worksheet_pricing_pattern_shadow_candidates to service_role;
grant select, insert, update on public.worksheet_pricing_pattern_shadow_candidate_evidence to service_role;

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
      c.id as classification_record_id,
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
      lc.classification_record_id,
      lc.classification_version,
      lc.attempt_number,
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
      'classificationRecordId', j.classification_record_id,
      'classificationAttemptNumber', j.attempt_number,
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

grant execute on function public.list_classified_worksheet_memory_events(uuid, integer) to service_role;
