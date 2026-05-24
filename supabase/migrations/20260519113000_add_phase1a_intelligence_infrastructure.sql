create table if not exists public.intelligence_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  module text not null,
  submodule text null,
  event_family text not null,
  event_type text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  entity_version integer null,
  parent_entity_type text null,
  parent_entity_id uuid null,
  related_entities jsonb not null default '[]'::jsonb,
  lineage_refs jsonb not null default '[]'::jsonb,
  actor_user_id uuid null references auth.users (id) on delete set null,
  actor_member_id uuid null references public.organization_members (id) on delete set null,
  actor_role text null,
  source_channel text not null default 'web',
  source_surface text null,
  source_request_id text null,
  source_session_id text null,
  source_device_id text null,
  status_before text null,
  status_after text null,
  field_name text null,
  before_data jsonb null,
  after_data jsonb null,
  diff_data jsonb not null default '{}'::jsonb,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  privacy_classification text not null default 'internal_operational',
  visibility_scope text not null default 'organization',
  contains_financial_data boolean not null default false,
  contains_personal_data boolean not null default false,
  contains_attachment_content boolean not null default false,
  retention_policy_key text null,
  retention_expires_at timestamptz null,
  legal_hold boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint intelligence_events_module_not_blank check (char_length(trim(module)) > 0),
  constraint intelligence_events_event_family_check check (
    event_family in (
      'entity_lifecycle',
      'field_change',
      'status_change',
      'commercial_action',
      'ai_interaction',
      'validation',
      'correction',
      'approval',
      'file_lifecycle',
      'lineage',
      'system_event'
    )
  ),
  constraint intelligence_events_event_type_not_blank check (char_length(trim(event_type)) > 0),
  constraint intelligence_events_action_not_blank check (char_length(trim(action)) > 0),
  constraint intelligence_events_entity_type_not_blank check (char_length(trim(entity_type)) > 0),
  constraint intelligence_events_related_entities_array_check check (jsonb_typeof(related_entities) = 'array'),
  constraint intelligence_events_lineage_refs_array_check check (jsonb_typeof(lineage_refs) = 'array'),
  constraint intelligence_events_before_data_valid_check check (
    before_data is null
    or jsonb_typeof(before_data) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint intelligence_events_after_data_valid_check check (
    after_data is null
    or jsonb_typeof(after_data) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint intelligence_events_diff_data_object_check check (jsonb_typeof(diff_data) = 'object'),
  constraint intelligence_events_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint intelligence_events_privacy_classification_check check (
    privacy_classification in (
      'public_safe',
      'internal_operational',
      'commercial_sensitive',
      'financial_sensitive',
      'personal_sensitive',
      'restricted'
    )
  ),
  constraint intelligence_events_visibility_scope_check check (
    visibility_scope in ('organization', 'restricted_role', 'system')
  ),
  constraint intelligence_events_source_channel_check check (
    source_channel in ('web', 'mobile', 'api', 'rpc', 'ai', 'system', 'cron', 'backfill')
  ),
  constraint intelligence_events_entity_version_positive check (
    entity_version is null or entity_version > 0
  )
);

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  module text not null,
  interaction_type text not null,
  subject_entity_type text not null,
  subject_entity_id uuid null,
  linked_event_id uuid null references public.intelligence_events (id) on delete set null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  actor_member_id uuid null references public.organization_members (id) on delete set null,
  actor_role text null,
  source_channel text not null default 'web',
  provider text not null,
  model text not null,
  model_version text null,
  prompt_template_key text null,
  prompt_text text null,
  input_context_summary jsonb not null default '{}'::jsonb,
  input_refs jsonb not null default '[]'::jsonb,
  output_text text null,
  output_structured jsonb null,
  output_refs jsonb not null default '[]'::jsonb,
  confidence numeric null,
  validation_status text null,
  usage_input_tokens integer null,
  usage_output_tokens integer null,
  usage_total_tokens integer null,
  latency_ms integer null,
  run_status text not null default 'completed',
  human_disposition text null,
  human_feedback_summary text null,
  edited_output jsonb null,
  finalized_by_user_id uuid null references auth.users (id) on delete set null,
  finalized_at timestamptz null,
  privacy_classification text not null default 'commercial_sensitive',
  visibility_scope text not null default 'organization',
  retention_policy_key text null,
  retention_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_interactions_module_not_blank check (char_length(trim(module)) > 0),
  constraint ai_interactions_interaction_type_check check (
    interaction_type in (
      'chat',
      'classification',
      'extraction',
      'generation',
      'matching',
      'recommendation',
      'change_detection',
      'reasoning',
      'autocomplete'
    )
  ),
  constraint ai_interactions_subject_entity_type_not_blank check (char_length(trim(subject_entity_type)) > 0),
  constraint ai_interactions_source_channel_check check (
    source_channel in ('web', 'mobile', 'api', 'rpc', 'ai', 'system', 'cron', 'backfill')
  ),
  constraint ai_interactions_provider_not_blank check (char_length(trim(provider)) > 0),
  constraint ai_interactions_model_not_blank check (char_length(trim(model)) > 0),
  constraint ai_interactions_input_context_summary_object_check check (jsonb_typeof(input_context_summary) = 'object'),
  constraint ai_interactions_input_refs_array_check check (jsonb_typeof(input_refs) = 'array'),
  constraint ai_interactions_output_structured_valid_check check (
    output_structured is null
    or jsonb_typeof(output_structured) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint ai_interactions_output_refs_array_check check (jsonb_typeof(output_refs) = 'array'),
  constraint ai_interactions_confidence_range_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint ai_interactions_validation_status_check check (
    validation_status is null or validation_status in ('pending', 'passed', 'warning', 'failed', 'overridden')
  ),
  constraint ai_interactions_usage_input_tokens_check check (usage_input_tokens is null or usage_input_tokens >= 0),
  constraint ai_interactions_usage_output_tokens_check check (usage_output_tokens is null or usage_output_tokens >= 0),
  constraint ai_interactions_usage_total_tokens_check check (usage_total_tokens is null or usage_total_tokens >= 0),
  constraint ai_interactions_latency_ms_check check (latency_ms is null or latency_ms >= 0),
  constraint ai_interactions_run_status_check check (
    run_status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  constraint ai_interactions_human_disposition_check check (
    human_disposition is null
    or human_disposition in ('accepted', 'partially_accepted', 'rejected', 'edited', 'ignored')
  ),
  constraint ai_interactions_edited_output_valid_check check (
    edited_output is null
    or jsonb_typeof(edited_output) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint ai_interactions_privacy_classification_check check (
    privacy_classification in (
      'public_safe',
      'internal_operational',
      'commercial_sensitive',
      'financial_sensitive',
      'personal_sensitive',
      'restricted'
    )
  ),
  constraint ai_interactions_visibility_scope_check check (
    visibility_scope in ('organization', 'restricted_role', 'system')
  )
);

create table if not exists public.validation_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  module text not null,
  scope_entity_type text not null,
  scope_entity_id uuid null,
  linked_event_id uuid null references public.intelligence_events (id) on delete set null,
  linked_ai_interaction_id uuid null references public.ai_interactions (id) on delete set null,
  rule_key text not null,
  rule_version text null,
  validation_type text not null,
  severity text not null,
  result text not null,
  expected_value jsonb null,
  observed_value jsonb null,
  details jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default false,
  approval_status text not null default 'not_required',
  approved_by_user_id uuid null references auth.users (id) on delete set null,
  approved_at timestamptz null,
  approval_note text null,
  privacy_classification text not null default 'internal_operational',
  visibility_scope text not null default 'organization',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint validation_cases_module_not_blank check (char_length(trim(module)) > 0),
  constraint validation_cases_scope_entity_type_not_blank check (char_length(trim(scope_entity_type)) > 0),
  constraint validation_cases_rule_key_not_blank check (char_length(trim(rule_key)) > 0),
  constraint validation_cases_validation_type_check check (
    validation_type in (
      'schema',
      'business_rule',
      'workflow_gate',
      'financial_check',
      'ai_confidence',
      'duplicate_detection',
      'permission_check',
      'consistency_check'
    )
  ),
  constraint validation_cases_severity_check check (
    severity in ('info', 'warning', 'error', 'critical')
  ),
  constraint validation_cases_result_check check (
    result in ('passed', 'failed', 'warning', 'overridden')
  ),
  constraint validation_cases_expected_value_valid_check check (
    expected_value is null
    or jsonb_typeof(expected_value) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint validation_cases_observed_value_valid_check check (
    observed_value is null
    or jsonb_typeof(observed_value) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint validation_cases_details_object_check check (jsonb_typeof(details) = 'object'),
  constraint validation_cases_approval_status_check check (
    approval_status in ('not_required', 'pending', 'approved', 'rejected')
  ),
  constraint validation_cases_privacy_classification_check check (
    privacy_classification in (
      'public_safe',
      'internal_operational',
      'commercial_sensitive',
      'financial_sensitive',
      'personal_sensitive',
      'restricted'
    )
  ),
  constraint validation_cases_visibility_scope_check check (
    visibility_scope in ('organization', 'restricted_role', 'system')
  )
);

create table if not exists public.correction_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  module text not null,
  correction_type text not null,
  target_entity_type text not null,
  target_entity_id uuid null,
  linked_event_id uuid null references public.intelligence_events (id) on delete set null,
  linked_ai_interaction_id uuid null references public.ai_interactions (id) on delete set null,
  linked_validation_case_id uuid null references public.validation_cases (id) on delete set null,
  corrected_field_name text null,
  incorrect_value jsonb null,
  corrected_value jsonb null,
  correction_reason text null,
  feedback_label text null,
  is_training_eligible boolean not null default true,
  corrected_by_user_id uuid null references auth.users (id) on delete set null,
  corrected_by_member_id uuid null references public.organization_members (id) on delete set null,
  privacy_classification text not null default 'commercial_sensitive',
  visibility_scope text not null default 'organization',
  created_at timestamptz not null default now(),
  constraint correction_events_module_not_blank check (char_length(trim(module)) > 0),
  constraint correction_events_correction_type_check check (
    correction_type in (
      'ai_output_edit',
      'manual_override',
      'status_reversal',
      'classification_fix',
      'allocation_fix',
      'measurement_fix',
      'mapping_fix',
      'approval_reversal',
      'data_cleanup'
    )
  ),
  constraint correction_events_target_entity_type_not_blank check (char_length(trim(target_entity_type)) > 0),
  constraint correction_events_incorrect_value_valid_check check (
    incorrect_value is null
    or jsonb_typeof(incorrect_value) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint correction_events_corrected_value_valid_check check (
    corrected_value is null
    or jsonb_typeof(corrected_value) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint correction_events_privacy_classification_check check (
    privacy_classification in (
      'public_safe',
      'internal_operational',
      'commercial_sensitive',
      'financial_sensitive',
      'personal_sensitive',
      'restricted'
    )
  ),
  constraint correction_events_visibility_scope_check check (
    visibility_scope in ('organization', 'restricted_role', 'system')
  )
);

create index if not exists intelligence_events_org_occurred_idx
  on public.intelligence_events (organization_id, occurred_at desc);

create index if not exists intelligence_events_org_module_occurred_idx
  on public.intelligence_events (organization_id, module, occurred_at desc);

create index if not exists intelligence_events_org_entity_occurred_idx
  on public.intelligence_events (organization_id, entity_type, entity_id, occurred_at desc)
  where entity_id is not null;

create index if not exists intelligence_events_org_project_occurred_idx
  on public.intelligence_events (organization_id, project_id, occurred_at desc)
  where project_id is not null;

create index if not exists intelligence_events_org_opportunity_occurred_idx
  on public.intelligence_events (organization_id, opportunity_id, occurred_at desc)
  where opportunity_id is not null;

create index if not exists intelligence_events_org_family_type_occurred_idx
  on public.intelligence_events (organization_id, event_family, event_type, occurred_at desc);

create index if not exists ai_interactions_org_module_created_idx
  on public.ai_interactions (organization_id, module, created_at desc);

create index if not exists ai_interactions_org_subject_created_idx
  on public.ai_interactions (organization_id, subject_entity_type, subject_entity_id, created_at desc)
  where subject_entity_id is not null;

create index if not exists ai_interactions_org_disposition_created_idx
  on public.ai_interactions (organization_id, human_disposition, created_at desc)
  where human_disposition is not null;

create index if not exists validation_cases_org_module_created_idx
  on public.validation_cases (organization_id, module, created_at desc);

create index if not exists validation_cases_org_scope_created_idx
  on public.validation_cases (organization_id, scope_entity_type, scope_entity_id, created_at desc)
  where scope_entity_id is not null;

create index if not exists validation_cases_org_result_created_idx
  on public.validation_cases (organization_id, result, created_at desc);

create index if not exists correction_events_org_module_created_idx
  on public.correction_events (organization_id, module, created_at desc);

create index if not exists correction_events_org_target_created_idx
  on public.correction_events (organization_id, target_entity_type, target_entity_id, created_at desc)
  where target_entity_id is not null;

create index if not exists correction_events_org_training_created_idx
  on public.correction_events (organization_id, is_training_eligible, created_at desc);

create trigger set_ai_interactions_updated_at
before update on public.ai_interactions
for each row execute function public.set_updated_at();

create trigger set_validation_cases_updated_at
before update on public.validation_cases
for each row execute function public.set_updated_at();

alter table public.intelligence_events enable row level security;
alter table public.intelligence_events force row level security;
alter table public.ai_interactions enable row level security;
alter table public.ai_interactions force row level security;
alter table public.validation_cases enable row level security;
alter table public.validation_cases force row level security;
alter table public.correction_events enable row level security;
alter table public.correction_events force row level security;

create or replace function public._intelligence_assert_organization_member(
  p_organization_id uuid
)
returns public.organization_members
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  member_row public.organization_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into member_row
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  limit 1;

  if member_row.id is null then
    raise exception 'Not authorized for this organization';
  end if;

  return member_row;
end;
$$;

create or replace function public._intelligence_can_read_visibility_scope(
  p_organization_id uuid,
  p_visibility_scope text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  member_row public.organization_members%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;

  select *
  into member_row
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  limit 1;

  if member_row.id is null then
    return false;
  end if;

  if p_visibility_scope = 'organization' then
    return true;
  end if;

  if p_visibility_scope = 'restricted_role' then
    return member_row.role in ('owner', 'admin')
      or public.has_org_permission(p_organization_id, 'intelligence.restricted.read');
  end if;

  return false;
end;
$$;

create or replace function public._intelligence_assert_project_in_organization(
  p_organization_id uuid,
  p_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_project_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project does not belong to organization';
  end if;
end;
$$;

create or replace function public._intelligence_assert_opportunity_in_organization(
  p_organization_id uuid,
  p_opportunity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_opportunity_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.organization_opportunities o
    where o.id = p_opportunity_id
      and o.organization_id = p_organization_id
  ) then
    raise exception 'Opportunity does not belong to organization';
  end if;
end;
$$;

create or replace function public._intelligence_assert_event_in_organization(
  p_organization_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_event_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.intelligence_events e
    where e.id = p_event_id
      and e.organization_id = p_organization_id
  ) then
    raise exception 'Linked intelligence event does not belong to organization';
  end if;
end;
$$;

create or replace function public._intelligence_assert_ai_interaction_in_organization(
  p_organization_id uuid,
  p_ai_interaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_ai_interaction_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.ai_interactions ai
    where ai.id = p_ai_interaction_id
      and ai.organization_id = p_organization_id
  ) then
    raise exception 'Linked AI interaction does not belong to organization';
  end if;
end;
$$;

create or replace function public._intelligence_assert_validation_case_in_organization(
  p_organization_id uuid,
  p_validation_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_validation_case_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.validation_cases vc
    where vc.id = p_validation_case_id
      and vc.organization_id = p_organization_id
  ) then
    raise exception 'Linked validation case does not belong to organization';
  end if;
end;
$$;

create policy "Members can view intelligence events"
on public.intelligence_events
for select
to authenticated
using (
  public._intelligence_can_read_visibility_scope(
    intelligence_events.organization_id,
    intelligence_events.visibility_scope
  )
);

create policy "Members can view ai interactions"
on public.ai_interactions
for select
to authenticated
using (
  public._intelligence_can_read_visibility_scope(
    ai_interactions.organization_id,
    ai_interactions.visibility_scope
  )
);

create policy "Members can view validation cases"
on public.validation_cases
for select
to authenticated
using (
  public._intelligence_can_read_visibility_scope(
    validation_cases.organization_id,
    validation_cases.visibility_scope
  )
);

create policy "Members can view correction events"
on public.correction_events
for select
to authenticated
using (
  public._intelligence_can_read_visibility_scope(
    correction_events.organization_id,
    correction_events.visibility_scope
  )
);

revoke all on public.intelligence_events from public, anon, authenticated;
revoke all on public.ai_interactions from public, anon, authenticated;
revoke all on public.validation_cases from public, anon, authenticated;
revoke all on public.correction_events from public, anon, authenticated;

grant select on public.intelligence_events to authenticated;
grant select on public.ai_interactions to authenticated;
grant select on public.validation_cases to authenticated;
grant select on public.correction_events to authenticated;

create or replace function public.write_intelligence_event(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.organization_members%rowtype;
  inserted_id uuid;
  resolved_organization_id uuid;
  resolved_project_id uuid;
  resolved_opportunity_id uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'write_intelligence_event requires a JSON object payload';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  member_row := public._intelligence_assert_organization_member(resolved_organization_id);
  resolved_project_id := nullif(p_input->>'projectId', '')::uuid;
  resolved_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;

  perform public._intelligence_assert_project_in_organization(resolved_organization_id, resolved_project_id);
  perform public._intelligence_assert_opportunity_in_organization(resolved_organization_id, resolved_opportunity_id);

  insert into public.intelligence_events (
    organization_id,
    project_id,
    opportunity_id,
    module,
    submodule,
    event_family,
    event_type,
    action,
    entity_type,
    entity_id,
    entity_version,
    parent_entity_type,
    parent_entity_id,
    related_entities,
    lineage_refs,
    actor_user_id,
    actor_member_id,
    actor_role,
    source_channel,
    source_surface,
    source_request_id,
    source_session_id,
    source_device_id,
    status_before,
    status_after,
    field_name,
    before_data,
    after_data,
    diff_data,
    reason,
    metadata,
    privacy_classification,
    visibility_scope,
    contains_financial_data,
    contains_personal_data,
    contains_attachment_content,
    retention_policy_key,
    retention_expires_at,
    legal_hold,
    occurred_at
  )
  values (
    resolved_organization_id,
    resolved_project_id,
    resolved_opportunity_id,
    nullif(btrim(coalesce(p_input->>'module', '')), ''),
    nullif(btrim(coalesce(p_input->>'submodule', '')), ''),
    nullif(btrim(coalesce(p_input->>'eventFamily', '')), ''),
    nullif(btrim(coalesce(p_input->>'eventType', '')), ''),
    nullif(btrim(coalesce(p_input->>'action', '')), ''),
    nullif(btrim(coalesce(p_input->>'entityType', '')), ''),
    nullif(p_input->>'entityId', '')::uuid,
    nullif(p_input->>'entityVersion', '')::integer,
    nullif(btrim(coalesce(p_input->>'parentEntityType', '')), ''),
    nullif(p_input->>'parentEntityId', '')::uuid,
    coalesce(p_input->'relatedEntities', '[]'::jsonb),
    coalesce(p_input->'lineageRefs', '[]'::jsonb),
    auth.uid(),
    member_row.id,
    member_row.role,
    coalesce(nullif(btrim(coalesce(p_input->>'sourceChannel', '')), ''), 'web'),
    nullif(btrim(coalesce(p_input->>'sourceSurface', '')), ''),
    nullif(btrim(coalesce(p_input->>'sourceRequestId', '')), ''),
    nullif(btrim(coalesce(p_input->>'sourceSessionId', '')), ''),
    nullif(btrim(coalesce(p_input->>'sourceDeviceId', '')), ''),
    nullif(btrim(coalesce(p_input->>'statusBefore', '')), ''),
    nullif(btrim(coalesce(p_input->>'statusAfter', '')), ''),
    nullif(btrim(coalesce(p_input->>'fieldName', '')), ''),
    p_input->'beforeData',
    p_input->'afterData',
    coalesce(p_input->'diffData', '{}'::jsonb),
    nullif(btrim(coalesce(p_input->>'reason', '')), ''),
    coalesce(p_input->'metadata', '{}'::jsonb),
    coalesce(nullif(btrim(coalesce(p_input->>'privacyClassification', '')), ''), 'internal_operational'),
    coalesce(nullif(btrim(coalesce(p_input->>'visibilityScope', '')), ''), 'organization'),
    coalesce(nullif(p_input->>'containsFinancialData', '')::boolean, false),
    coalesce(nullif(p_input->>'containsPersonalData', '')::boolean, false),
    coalesce(nullif(p_input->>'containsAttachmentContent', '')::boolean, false),
    nullif(btrim(coalesce(p_input->>'retentionPolicyKey', '')), ''),
    nullif(p_input->>'retentionExpiresAt', '')::timestamptz,
    coalesce(nullif(p_input->>'legalHold', '')::boolean, false),
    coalesce(nullif(p_input->>'occurredAt', '')::timestamptz, now())
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.write_intelligence_events(
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event_item jsonb;
  inserted_ids jsonb := '[]'::jsonb;
  inserted_id uuid;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'write_intelligence_events requires a JSON array payload';
  end if;

  for event_item in
    select value
    from jsonb_array_elements(p_events)
  loop
    inserted_id := public.write_intelligence_event(event_item);
    inserted_ids := inserted_ids || jsonb_build_array(inserted_id);
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
  );
end;
$$;

create or replace function public.create_ai_interaction(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.organization_members%rowtype;
  inserted_id uuid;
  resolved_organization_id uuid;
  resolved_project_id uuid;
  resolved_opportunity_id uuid;
  resolved_linked_event_id uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'create_ai_interaction requires a JSON object payload';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  member_row := public._intelligence_assert_organization_member(resolved_organization_id);
  resolved_project_id := nullif(p_input->>'projectId', '')::uuid;
  resolved_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;
  resolved_linked_event_id := nullif(p_input->>'linkedEventId', '')::uuid;

  perform public._intelligence_assert_project_in_organization(resolved_organization_id, resolved_project_id);
  perform public._intelligence_assert_opportunity_in_organization(resolved_organization_id, resolved_opportunity_id);
  perform public._intelligence_assert_event_in_organization(resolved_organization_id, resolved_linked_event_id);

  insert into public.ai_interactions (
    organization_id,
    project_id,
    opportunity_id,
    module,
    interaction_type,
    subject_entity_type,
    subject_entity_id,
    linked_event_id,
    actor_user_id,
    actor_member_id,
    actor_role,
    source_channel,
    provider,
    model,
    model_version,
    prompt_template_key,
    prompt_text,
    input_context_summary,
    input_refs,
    output_text,
    output_structured,
    output_refs,
    confidence,
    validation_status,
    usage_input_tokens,
    usage_output_tokens,
    usage_total_tokens,
    latency_ms,
    run_status,
    human_disposition,
    human_feedback_summary,
    edited_output,
    finalized_by_user_id,
    finalized_at,
    privacy_classification,
    visibility_scope,
    retention_policy_key,
    retention_expires_at
  )
  values (
    resolved_organization_id,
    resolved_project_id,
    resolved_opportunity_id,
    nullif(btrim(coalesce(p_input->>'module', '')), ''),
    nullif(btrim(coalesce(p_input->>'interactionType', '')), ''),
    nullif(btrim(coalesce(p_input->>'subjectEntityType', '')), ''),
    nullif(p_input->>'subjectEntityId', '')::uuid,
    resolved_linked_event_id,
    auth.uid(),
    member_row.id,
    member_row.role,
    coalesce(nullif(btrim(coalesce(p_input->>'sourceChannel', '')), ''), 'web'),
    nullif(btrim(coalesce(p_input->>'provider', '')), ''),
    nullif(btrim(coalesce(p_input->>'model', '')), ''),
    nullif(btrim(coalesce(p_input->>'modelVersion', '')), ''),
    nullif(btrim(coalesce(p_input->>'promptTemplateKey', '')), ''),
    nullif(p_input->>'promptText', ''),
    coalesce(p_input->'inputContextSummary', '{}'::jsonb),
    coalesce(p_input->'inputRefs', '[]'::jsonb),
    nullif(p_input->>'outputText', ''),
    p_input->'outputStructured',
    coalesce(p_input->'outputRefs', '[]'::jsonb),
    nullif(p_input->>'confidence', '')::numeric,
    nullif(btrim(coalesce(p_input->>'validationStatus', '')), ''),
    nullif(p_input->>'usageInputTokens', '')::integer,
    nullif(p_input->>'usageOutputTokens', '')::integer,
    nullif(p_input->>'usageTotalTokens', '')::integer,
    nullif(p_input->>'latencyMs', '')::integer,
    coalesce(nullif(btrim(coalesce(p_input->>'runStatus', '')), ''), 'completed'),
    nullif(btrim(coalesce(p_input->>'humanDisposition', '')), ''),
    nullif(p_input->>'humanFeedbackSummary', ''),
    p_input->'editedOutput',
    case
      when nullif(btrim(coalesce(p_input->>'humanDisposition', '')), '') is not null then auth.uid()
      else null
    end,
    case
      when nullif(btrim(coalesce(p_input->>'humanDisposition', '')), '') is not null then now()
      else null
    end,
    coalesce(nullif(btrim(coalesce(p_input->>'privacyClassification', '')), ''), 'commercial_sensitive'),
    coalesce(nullif(btrim(coalesce(p_input->>'visibilityScope', '')), ''), 'organization'),
    nullif(btrim(coalesce(p_input->>'retentionPolicyKey', '')), ''),
    nullif(p_input->>'retentionExpiresAt', '')::timestamptz
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.create_validation_case(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.organization_members%rowtype;
  inserted_id uuid;
  resolved_organization_id uuid;
  resolved_project_id uuid;
  resolved_opportunity_id uuid;
  resolved_linked_event_id uuid;
  resolved_linked_ai_interaction_id uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'create_validation_case requires a JSON object payload';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  member_row := public._intelligence_assert_organization_member(resolved_organization_id);
  resolved_project_id := nullif(p_input->>'projectId', '')::uuid;
  resolved_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;
  resolved_linked_event_id := nullif(p_input->>'linkedEventId', '')::uuid;
  resolved_linked_ai_interaction_id := nullif(p_input->>'linkedAiInteractionId', '')::uuid;

  perform public._intelligence_assert_project_in_organization(resolved_organization_id, resolved_project_id);
  perform public._intelligence_assert_opportunity_in_organization(resolved_organization_id, resolved_opportunity_id);
  perform public._intelligence_assert_event_in_organization(resolved_organization_id, resolved_linked_event_id);
  perform public._intelligence_assert_ai_interaction_in_organization(resolved_organization_id, resolved_linked_ai_interaction_id);

  insert into public.validation_cases (
    organization_id,
    project_id,
    opportunity_id,
    module,
    scope_entity_type,
    scope_entity_id,
    linked_event_id,
    linked_ai_interaction_id,
    rule_key,
    rule_version,
    validation_type,
    severity,
    result,
    expected_value,
    observed_value,
    details,
    requires_approval,
    approval_status,
    approved_by_user_id,
    approved_at,
    approval_note,
    privacy_classification,
    visibility_scope
  )
  values (
    resolved_organization_id,
    resolved_project_id,
    resolved_opportunity_id,
    nullif(btrim(coalesce(p_input->>'module', '')), ''),
    nullif(btrim(coalesce(p_input->>'scopeEntityType', '')), ''),
    nullif(p_input->>'scopeEntityId', '')::uuid,
    resolved_linked_event_id,
    resolved_linked_ai_interaction_id,
    nullif(btrim(coalesce(p_input->>'ruleKey', '')), ''),
    nullif(btrim(coalesce(p_input->>'ruleVersion', '')), ''),
    nullif(btrim(coalesce(p_input->>'validationType', '')), ''),
    nullif(btrim(coalesce(p_input->>'severity', '')), ''),
    nullif(btrim(coalesce(p_input->>'result', '')), ''),
    p_input->'expectedValue',
    p_input->'observedValue',
    coalesce(p_input->'details', '{}'::jsonb),
    coalesce(nullif(p_input->>'requiresApproval', '')::boolean, false),
    coalesce(nullif(btrim(coalesce(p_input->>'approvalStatus', '')), ''), 'not_required'),
    case
      when nullif(btrim(coalesce(p_input->>'approvalStatus', '')), '') = 'approved' then auth.uid()
      else null
    end,
    case
      when nullif(btrim(coalesce(p_input->>'approvalStatus', '')), '') = 'approved' then now()
      else null
    end,
    nullif(p_input->>'approvalNote', ''),
    coalesce(nullif(btrim(coalesce(p_input->>'privacyClassification', '')), ''), 'internal_operational'),
    coalesce(nullif(btrim(coalesce(p_input->>'visibilityScope', '')), ''), 'organization')
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.write_correction_event(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.organization_members%rowtype;
  inserted_id uuid;
  resolved_organization_id uuid;
  resolved_project_id uuid;
  resolved_opportunity_id uuid;
  resolved_linked_event_id uuid;
  resolved_linked_ai_interaction_id uuid;
  resolved_linked_validation_case_id uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'write_correction_event requires a JSON object payload';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  member_row := public._intelligence_assert_organization_member(resolved_organization_id);
  resolved_project_id := nullif(p_input->>'projectId', '')::uuid;
  resolved_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;
  resolved_linked_event_id := nullif(p_input->>'linkedEventId', '')::uuid;
  resolved_linked_ai_interaction_id := nullif(p_input->>'linkedAiInteractionId', '')::uuid;
  resolved_linked_validation_case_id := nullif(p_input->>'linkedValidationCaseId', '')::uuid;

  perform public._intelligence_assert_project_in_organization(resolved_organization_id, resolved_project_id);
  perform public._intelligence_assert_opportunity_in_organization(resolved_organization_id, resolved_opportunity_id);
  perform public._intelligence_assert_event_in_organization(resolved_organization_id, resolved_linked_event_id);
  perform public._intelligence_assert_ai_interaction_in_organization(resolved_organization_id, resolved_linked_ai_interaction_id);
  perform public._intelligence_assert_validation_case_in_organization(resolved_organization_id, resolved_linked_validation_case_id);

  insert into public.correction_events (
    organization_id,
    project_id,
    opportunity_id,
    module,
    correction_type,
    target_entity_type,
    target_entity_id,
    linked_event_id,
    linked_ai_interaction_id,
    linked_validation_case_id,
    corrected_field_name,
    incorrect_value,
    corrected_value,
    correction_reason,
    feedback_label,
    is_training_eligible,
    corrected_by_user_id,
    corrected_by_member_id,
    privacy_classification,
    visibility_scope
  )
  values (
    resolved_organization_id,
    resolved_project_id,
    resolved_opportunity_id,
    nullif(btrim(coalesce(p_input->>'module', '')), ''),
    nullif(btrim(coalesce(p_input->>'correctionType', '')), ''),
    nullif(btrim(coalesce(p_input->>'targetEntityType', '')), ''),
    nullif(p_input->>'targetEntityId', '')::uuid,
    resolved_linked_event_id,
    resolved_linked_ai_interaction_id,
    resolved_linked_validation_case_id,
    nullif(btrim(coalesce(p_input->>'correctedFieldName', '')), ''),
    p_input->'incorrectValue',
    p_input->'correctedValue',
    nullif(p_input->>'correctionReason', ''),
    nullif(btrim(coalesce(p_input->>'feedbackLabel', '')), ''),
    coalesce(nullif(p_input->>'isTrainingEligible', '')::boolean, true),
    auth.uid(),
    member_row.id,
    coalesce(nullif(btrim(coalesce(p_input->>'privacyClassification', '')), ''), 'commercial_sensitive'),
    coalesce(nullif(btrim(coalesce(p_input->>'visibilityScope', '')), ''), 'organization')
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

grant execute on function public.write_intelligence_event(jsonb) to authenticated;
grant execute on function public.write_intelligence_events(jsonb) to authenticated;
grant execute on function public.create_ai_interaction(jsonb) to authenticated;
grant execute on function public.create_validation_case(jsonb) to authenticated;
grant execute on function public.write_correction_event(jsonb) to authenticated;

insert into public.app_permissions (permission_key, description)
values
  ('intelligence.restricted.read', 'View restricted intelligence records across the organization')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'intelligence.restricted.read', true),
  ('admin', 'intelligence.restricted.read', true),
  ('qs', 'intelligence.restricted.read', false),
  ('project_manager', 'intelligence.restricted.read', false),
  ('worker', 'intelligence.restricted.read', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();
