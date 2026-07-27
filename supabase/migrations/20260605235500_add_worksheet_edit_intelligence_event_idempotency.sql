create unique index if not exists intelligence_events_pricing_worksheet_edit_source_request_idx
on public.intelligence_events (organization_id, source_request_id)
where module = 'pricing_worksheets'
  and event_type in (
    'worksheet_cell_edited',
    'worksheet_formula_edited',
    'worksheet_rate_changed',
    'worksheet_assumption_changed'
  )
  and source_request_id is not null;

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
  resolved_module text;
  resolved_event_type text;
  resolved_source_request_id text;
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
  resolved_module := nullif(btrim(coalesce(p_input->>'module', '')), '');
  resolved_event_type := nullif(btrim(coalesce(p_input->>'eventType', '')), '');
  resolved_source_request_id := nullif(btrim(coalesce(p_input->>'sourceRequestId', '')), '');

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
    resolved_module,
    nullif(btrim(coalesce(p_input->>'submodule', '')), ''),
    nullif(btrim(coalesce(p_input->>'eventFamily', '')), ''),
    resolved_event_type,
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
    resolved_source_request_id,
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
  on conflict do nothing
  returning id into inserted_id;

  if inserted_id is null and resolved_source_request_id is not null then
    select e.id
    into inserted_id
    from public.intelligence_events e
    where e.organization_id = resolved_organization_id
      and e.module = resolved_module
      and e.event_type = resolved_event_type
      and e.source_request_id = resolved_source_request_id
    order by e.created_at asc
    limit 1;
  end if;

  if inserted_id is null then
    raise exception 'Unable to persist intelligence event.';
  end if;

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
