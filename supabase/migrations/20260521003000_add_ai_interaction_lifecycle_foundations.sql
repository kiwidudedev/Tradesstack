alter table public.ai_interactions
  add column if not exists lifecycle_state text not null default 'generated',
  add column if not exists superseded_by_interaction_id uuid null references public.ai_interactions (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_interactions_lifecycle_state_check'
      and conrelid = 'public.ai_interactions'::regclass
  ) then
    alter table public.ai_interactions
      add constraint ai_interactions_lifecycle_state_check check (
        lifecycle_state in (
          'requested',
          'generated',
          'validated',
          'previewed',
          'accepted',
          'edited',
          'rejected',
          'superseded'
        )
      );
  end if;
end
$$;

create index if not exists ai_interactions_org_lifecycle_created_idx
  on public.ai_interactions (organization_id, lifecycle_state, created_at desc);

create index if not exists ai_interactions_superseded_by_idx
  on public.ai_interactions (superseded_by_interaction_id)
  where superseded_by_interaction_id is not null;

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
    lifecycle_state,
    human_disposition,
    human_feedback_summary,
    edited_output,
    finalized_by_user_id,
    finalized_at,
    superseded_by_interaction_id,
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
    coalesce(nullif(btrim(coalesce(p_input->>'lifecycleState', '')), ''), 'generated'),
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
    nullif(p_input->>'supersededByInteractionId', '')::uuid,
    coalesce(nullif(btrim(coalesce(p_input->>'privacyClassification', '')), ''), 'commercial_sensitive'),
    coalesce(nullif(btrim(coalesce(p_input->>'visibilityScope', '')), ''), 'organization'),
    nullif(btrim(coalesce(p_input->>'retentionPolicyKey', '')), ''),
    nullif(p_input->>'retentionExpiresAt', '')::timestamptz
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.transition_ai_interaction_lifecycle(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.organization_members%rowtype;
  resolved_organization_id uuid;
  resolved_interaction_id uuid;
  resolved_project_id uuid;
  resolved_opportunity_id uuid;
  resolved_lifecycle_state text;
  resolved_run_status text;
  resolved_human_disposition text;
  resolved_validation_status text;
  resolved_superseded_by_interaction_id uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'transition_ai_interaction_lifecycle requires a JSON object payload';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  resolved_interaction_id := nullif(p_input->>'aiInteractionId', '')::uuid;
  resolved_project_id := nullif(p_input->>'projectId', '')::uuid;
  resolved_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;
  resolved_lifecycle_state := nullif(btrim(coalesce(p_input->>'lifecycleState', '')), '');
  resolved_run_status := nullif(btrim(coalesce(p_input->>'runStatus', '')), '');
  resolved_human_disposition := nullif(btrim(coalesce(p_input->>'humanDisposition', '')), '');
  resolved_validation_status := nullif(btrim(coalesce(p_input->>'validationStatus', '')), '');
  resolved_superseded_by_interaction_id := nullif(p_input->>'supersededByInteractionId', '')::uuid;

  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  if resolved_interaction_id is null then
    raise exception 'aiInteractionId is required';
  end if;

  if resolved_lifecycle_state is null then
    raise exception 'lifecycleState is required';
  end if;

  member_row := public._intelligence_assert_organization_member(resolved_organization_id);

  perform public._intelligence_assert_project_in_organization(resolved_organization_id, resolved_project_id);
  perform public._intelligence_assert_opportunity_in_organization(resolved_organization_id, resolved_opportunity_id);
  perform public._intelligence_assert_ai_interaction_in_organization(resolved_organization_id, resolved_interaction_id);
  perform public._intelligence_assert_ai_interaction_in_organization(
    resolved_organization_id,
    resolved_superseded_by_interaction_id
  );

  update public.ai_interactions
  set
    project_id = coalesce(resolved_project_id, project_id),
    opportunity_id = coalesce(resolved_opportunity_id, opportunity_id),
    run_status = coalesce(resolved_run_status, run_status),
    lifecycle_state = resolved_lifecycle_state,
    validation_status = coalesce(resolved_validation_status, validation_status),
    output_text = coalesce(nullif(p_input->>'outputText', ''), output_text),
    output_structured = case
      when p_input ? 'outputStructured' then p_input->'outputStructured'
      else output_structured
    end,
    output_refs = case
      when p_input ? 'outputRefs' then coalesce(p_input->'outputRefs', '[]'::jsonb)
      else output_refs
    end,
    confidence = coalesce(nullif(p_input->>'confidence', '')::numeric, confidence),
    latency_ms = coalesce(nullif(p_input->>'latencyMs', '')::integer, latency_ms),
    usage_input_tokens = coalesce(nullif(p_input->>'usageInputTokens', '')::integer, usage_input_tokens),
    usage_output_tokens = coalesce(nullif(p_input->>'usageOutputTokens', '')::integer, usage_output_tokens),
    usage_total_tokens = coalesce(nullif(p_input->>'usageTotalTokens', '')::integer, usage_total_tokens),
    human_disposition = coalesce(resolved_human_disposition, human_disposition),
    human_feedback_summary = coalesce(nullif(p_input->>'humanFeedbackSummary', ''), human_feedback_summary),
    edited_output = case
      when p_input ? 'editedOutput' then p_input->'editedOutput'
      else edited_output
    end,
    finalized_by_user_id = case
      when resolved_lifecycle_state in ('accepted', 'edited', 'rejected', 'superseded') then auth.uid()
      else finalized_by_user_id
    end,
    finalized_at = case
      when resolved_lifecycle_state in ('accepted', 'edited', 'rejected', 'superseded') then now()
      else finalized_at
    end,
    superseded_by_interaction_id = coalesce(resolved_superseded_by_interaction_id, superseded_by_interaction_id),
    updated_at = now()
  where id = resolved_interaction_id
    and organization_id = resolved_organization_id;

  if not found then
    raise exception 'AI interaction not found';
  end if;

  return resolved_interaction_id;
end;
$$;

create or replace function public.record_ai_interaction_validation(
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid;
  resolved_ai_interaction_id uuid;
  validation_case_id uuid;
  resolved_validation_status text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'record_ai_interaction_validation requires a JSON object payload';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  resolved_ai_interaction_id := nullif(p_input->>'aiInteractionId', '')::uuid;
  resolved_validation_status := coalesce(nullif(btrim(coalesce(p_input->>'validationStatus', '')), ''), 'warning');

  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;

  if resolved_ai_interaction_id is null then
    raise exception 'aiInteractionId is required';
  end if;

  perform public._intelligence_assert_ai_interaction_in_organization(
    resolved_organization_id,
    resolved_ai_interaction_id
  );

  validation_case_id := public.create_validation_case(
    jsonb_build_object(
      'organizationId', resolved_organization_id,
      'projectId', p_input->>'projectId',
      'opportunityId', p_input->>'opportunityId',
      'module', p_input->>'module',
      'scopeEntityType', p_input->>'scopeEntityType',
      'scopeEntityId', p_input->>'scopeEntityId',
      'linkedAiInteractionId', resolved_ai_interaction_id,
      'ruleKey', p_input->>'ruleKey',
      'ruleVersion', coalesce(p_input->>'ruleVersion', 'v1'),
      'validationType', p_input->>'validationType',
      'severity', p_input->>'severity',
      'result', p_input->>'result',
      'expectedValue', coalesce(p_input->'expectedValue', 'null'::jsonb),
      'observedValue', coalesce(p_input->'observedValue', 'null'::jsonb),
      'details', coalesce(p_input->'details', '{}'::jsonb),
      'requiresApproval', coalesce(p_input->'requiresApproval', 'false'::jsonb),
      'approvalStatus', coalesce(p_input->>'approvalStatus', 'not_required'),
      'approvalNote', p_input->>'approvalNote',
      'privacyClassification', coalesce(p_input->>'privacyClassification', 'commercial_sensitive'),
      'visibilityScope', coalesce(p_input->>'visibilityScope', 'organization')
    )
  );

  update public.ai_interactions
  set
    validation_status = resolved_validation_status,
    lifecycle_state = case
      when lifecycle_state in ('requested', 'generated') then 'validated'
      else lifecycle_state
    end,
    updated_at = now()
  where id = resolved_ai_interaction_id
    and organization_id = resolved_organization_id;

  return validation_case_id;
end;
$$;

grant execute on function public.transition_ai_interaction_lifecycle(jsonb) to authenticated;
grant execute on function public.record_ai_interaction_validation(jsonb) to authenticated;
