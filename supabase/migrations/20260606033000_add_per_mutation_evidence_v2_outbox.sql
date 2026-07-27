create table if not exists public.worksheet_mutation_evidence_v2_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  opportunity_id uuid not null references public.organization_opportunities (id) on delete cascade,
  workbook_id uuid not null,
  workbook_name text null,
  sheet_id uuid not null,
  sheet_name text not null,
  worksheet_id uuid not null,
  worksheet_name text not null,
  trade_package text null,
  user_id uuid null,
  source text not null default 'manual',
  client_mutation_id text not null,
  occurred_at timestamptz not null,
  previous_worksheet jsonb not null,
  next_worksheet jsonb not null,
  processing_status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  retry_after timestamptz null,
  last_error_code text null,
  last_error_message text null,
  processed_at timestamptz null,
  dead_lettered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheet_mutation_evidence_v2_outbox_sheet_name_not_blank check (char_length(trim(sheet_name)) > 0),
  constraint worksheet_mutation_evidence_v2_outbox_worksheet_name_not_blank check (char_length(trim(worksheet_name)) > 0),
  constraint worksheet_mutation_evidence_v2_outbox_client_mutation_id_not_blank check (char_length(trim(client_mutation_id)) > 0),
  constraint worksheet_mutation_evidence_v2_outbox_source_check check (source in ('manual', 'ai', 'system')),
  constraint worksheet_mutation_evidence_v2_outbox_processing_status_check check (
    processing_status in ('pending', 'claimed', 'completed', 'retry_scheduled', 'dead_lettered')
  ),
  constraint worksheet_mutation_evidence_v2_outbox_attempt_count_check check (attempt_count >= 0),
  constraint worksheet_mutation_evidence_v2_outbox_max_attempts_check check (max_attempts >= 1),
  constraint worksheet_mutation_evidence_v2_outbox_previous_worksheet_object_check check (
    jsonb_typeof(previous_worksheet) = 'object'
  ),
  constraint worksheet_mutation_evidence_v2_outbox_next_worksheet_object_check check (
    jsonb_typeof(next_worksheet) = 'object'
  )
);

create unique index if not exists worksheet_mutation_evidence_v2_outbox_org_client_mutation_idx
on public.worksheet_mutation_evidence_v2_outbox (organization_id, client_mutation_id);

create unique index if not exists intelligence_events_pricing_worksheet_correction_source_request_idx
on public.intelligence_events (organization_id, source_request_id)
where module = 'pricing_worksheets'
  and event_type in (
    'worksheet_ai_output_corrected',
    'worksheet_ai_formula_corrected',
    'worksheet_ai_rate_corrected',
    'worksheet_ai_assumption_corrected'
  )
  and source_request_id is not null;

create index if not exists worksheet_mutation_evidence_v2_outbox_claimable_idx
on public.worksheet_mutation_evidence_v2_outbox (processing_status, retry_after, claim_expires_at, occurred_at, created_at);

create index if not exists worksheet_mutation_evidence_v2_outbox_org_claimable_idx
on public.worksheet_mutation_evidence_v2_outbox (organization_id, processing_status, retry_after, claim_expires_at, occurred_at);

alter table public.worksheet_mutation_evidence_v2_outbox enable row level security;
alter table public.worksheet_mutation_evidence_v2_outbox force row level security;

revoke all on public.worksheet_mutation_evidence_v2_outbox from public, anon, authenticated;
grant select, insert, update on public.worksheet_mutation_evidence_v2_outbox to service_role;

create or replace function public.enqueue_worksheet_mutation_evidence_v2_outbox(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.organization_members%rowtype;
  resolved_id uuid;
  resolved_organization_id uuid;
  resolved_project_id uuid;
  resolved_opportunity_id uuid;
  resolved_workbook_id uuid;
  resolved_sheet_id uuid;
  resolved_worksheet_id uuid;
  resolved_user_id uuid;
  resolved_client_mutation_id text;
  resolved_sheet_name text;
  resolved_worksheet_name text;
  resolved_source text;
  resolved_occurred_at timestamptz;
  inserted boolean := false;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'enqueue_worksheet_mutation_evidence_v2_outbox requires a JSON object payload';
  end if;

  resolved_organization_id := nullif(p_input->>'organizationId', '')::uuid;
  resolved_project_id := nullif(p_input->>'projectId', '')::uuid;
  resolved_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;
  resolved_workbook_id := nullif(p_input->>'workbookId', '')::uuid;
  resolved_sheet_id := nullif(p_input->>'sheetId', '')::uuid;
  resolved_worksheet_id := coalesce(nullif(p_input->>'worksheetId', '')::uuid, resolved_workbook_id);
  resolved_user_id := nullif(p_input->>'userId', '')::uuid;
  resolved_client_mutation_id := nullif(btrim(coalesce(p_input->>'clientMutationId', '')), '');
  resolved_sheet_name := nullif(btrim(coalesce(p_input->>'sheetName', '')), '');
  resolved_worksheet_name := nullif(btrim(coalesce(p_input->>'worksheetName', '')), '');
  resolved_source := coalesce(nullif(btrim(coalesce(p_input->>'source', '')), ''), 'manual');
  resolved_occurred_at := coalesce(nullif(p_input->>'occurredAt', '')::timestamptz, now());

  if resolved_organization_id is null then
    raise exception 'organizationId is required';
  end if;
  if resolved_opportunity_id is null then
    raise exception 'opportunityId is required';
  end if;
  if resolved_workbook_id is null then
    raise exception 'workbookId is required';
  end if;
  if resolved_sheet_id is null then
    raise exception 'sheetId is required';
  end if;
  if resolved_worksheet_id is null then
    raise exception 'worksheetId is required';
  end if;
  if resolved_client_mutation_id is null then
    raise exception 'clientMutationId is required';
  end if;
  if resolved_sheet_name is null then
    raise exception 'sheetName is required';
  end if;
  if resolved_worksheet_name is null then
    raise exception 'worksheetName is required';
  end if;
  if resolved_source not in ('manual', 'ai', 'system') then
    raise exception 'source must be manual, ai, or system';
  end if;
  if coalesce(jsonb_typeof(p_input->'previousWorksheet'), '') <> 'object' then
    raise exception 'previousWorksheet must be an object';
  end if;
  if coalesce(jsonb_typeof(p_input->'nextWorksheet'), '') <> 'object' then
    raise exception 'nextWorksheet must be an object';
  end if;

  member_row := public._intelligence_assert_organization_member(resolved_organization_id);
  perform public._intelligence_assert_project_in_organization(resolved_organization_id, resolved_project_id);
  perform public._intelligence_assert_opportunity_in_organization(resolved_organization_id, resolved_opportunity_id);

  insert into public.worksheet_mutation_evidence_v2_outbox (
    organization_id,
    project_id,
    opportunity_id,
    workbook_id,
    workbook_name,
    sheet_id,
    sheet_name,
    worksheet_id,
    worksheet_name,
    trade_package,
    user_id,
    source,
    client_mutation_id,
    occurred_at,
    previous_worksheet,
    next_worksheet
  )
  values (
    resolved_organization_id,
    resolved_project_id,
    resolved_opportunity_id,
    resolved_workbook_id,
    nullif(btrim(coalesce(p_input->>'workbookName', '')), ''),
    resolved_sheet_id,
    resolved_sheet_name,
    resolved_worksheet_id,
    resolved_worksheet_name,
    nullif(btrim(coalesce(p_input->>'tradePackage', '')), ''),
    coalesce(resolved_user_id, auth.uid()),
    resolved_source,
    resolved_client_mutation_id,
    resolved_occurred_at,
    p_input->'previousWorksheet',
    p_input->'nextWorksheet'
  )
  on conflict (organization_id, client_mutation_id) do nothing
  returning id into resolved_id;

  if resolved_id is not null then
    inserted := true;
  else
    select outbox.id
    into resolved_id
    from public.worksheet_mutation_evidence_v2_outbox outbox
    where outbox.organization_id = resolved_organization_id
      and outbox.client_mutation_id = resolved_client_mutation_id
    limit 1;
  end if;

  if resolved_id is null then
    raise exception 'Unable to enqueue worksheet mutation Evidence V2 outbox row.';
  end if;

  return jsonb_build_object(
    'id', resolved_id,
    'inserted', inserted
  );
end;
$$;

create or replace function public.claim_worksheet_mutation_evidence_v2_outbox_batch(
  p_limit integer default 25,
  p_organization_id uuid default null,
  p_worker_id text default null,
  p_lease_seconds integer default 600
)
returns setof public.worksheet_mutation_evidence_v2_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_limit integer;
  resolved_worker_id text;
  resolved_lease_seconds integer;
begin
  resolved_limit := greatest(coalesce(p_limit, 25), 1);
  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'worksheet-mutation-evidence-v2-worker');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 600), 30);

  return query
  with claimable as (
    select outbox.id
    from public.worksheet_mutation_evidence_v2_outbox outbox
    where (p_organization_id is null or outbox.organization_id = p_organization_id)
      and (
        outbox.processing_status = 'pending'
        or (
          outbox.processing_status = 'retry_scheduled'
          and (outbox.retry_after is null or outbox.retry_after <= now())
        )
        or (
          outbox.processing_status = 'claimed'
          and outbox.claim_expires_at is not null
          and outbox.claim_expires_at <= now()
        )
      )
    order by outbox.occurred_at asc, outbox.created_at asc, outbox.id asc
    limit resolved_limit
    for update skip locked
  )
  update public.worksheet_mutation_evidence_v2_outbox outbox
  set
    processing_status = 'claimed',
    attempt_count = outbox.attempt_count + 1,
    claimed_at = now(),
    claim_expires_at = now() + make_interval(secs => resolved_lease_seconds),
    claimed_by = resolved_worker_id,
    claim_token = gen_random_uuid(),
    retry_after = null,
    updated_at = now()
  where outbox.id in (select id from claimable)
  returning outbox.*;
end;
$$;

create or replace function public.finalize_worksheet_mutation_evidence_v2_outbox_batch(
  p_inputs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  input_item jsonb;
  resolved_id uuid;
  resolved_claim_token uuid;
  requested_status text;
  resolved_retry_after timestamptz;
  resolved_error_code text;
  resolved_error_message text;
  updated_id uuid;
  reached_max_attempts boolean;
  completed_count integer := 0;
  retried_count integer := 0;
  dead_lettered_count integer := 0;
  updated_ids jsonb := '[]'::jsonb;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'finalize_worksheet_mutation_evidence_v2_outbox_batch requires a JSON array payload';
  end if;

  for input_item in
    select value
    from jsonb_array_elements(p_inputs)
  loop
    resolved_id := nullif(input_item->>'id', '')::uuid;
    resolved_claim_token := nullif(input_item->>'claimToken', '')::uuid;
    requested_status := nullif(btrim(coalesce(input_item->>'processingStatus', '')), '');
    resolved_retry_after := nullif(input_item->>'retryAfter', '')::timestamptz;
    resolved_error_code := nullif(btrim(coalesce(input_item->>'errorCode', '')), '');
    resolved_error_message := nullif(btrim(coalesce(input_item->>'errorMessage', '')), '');

    if resolved_id is null or resolved_claim_token is null or requested_status is null then
      continue;
    end if;

    if requested_status = 'completed' then
      update public.worksheet_mutation_evidence_v2_outbox outbox
      set
        processing_status = 'completed',
        processed_at = now(),
        retry_after = null,
        dead_lettered_at = null,
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = null,
        last_error_message = null,
        updated_at = now()
      where outbox.id = resolved_id
        and outbox.claim_token = resolved_claim_token
      returning outbox.id into updated_id;

      if updated_id is not null then
        completed_count := completed_count + 1;
        updated_ids := updated_ids || jsonb_build_array(updated_id);
      end if;
    elsif requested_status = 'retry_scheduled' then
      reached_max_attempts := false;
      update public.worksheet_mutation_evidence_v2_outbox outbox
      set
        processing_status = case
          when outbox.attempt_count >= outbox.max_attempts then 'dead_lettered'
          else 'retry_scheduled'
        end,
        retry_after = case
          when outbox.attempt_count >= outbox.max_attempts then null
          else coalesce(resolved_retry_after, now())
        end,
        dead_lettered_at = case
          when outbox.attempt_count >= outbox.max_attempts then now()
          else null
        end,
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = coalesce(resolved_error_code, 'worksheet_mutation_processing_failed'),
        last_error_message = coalesce(resolved_error_message, 'Worksheet mutation Evidence V2 processing failed.'),
        updated_at = now()
      where outbox.id = resolved_id
        and outbox.claim_token = resolved_claim_token
      returning outbox.id, outbox.attempt_count >= outbox.max_attempts into updated_id, reached_max_attempts;

      if updated_id is not null then
        if reached_max_attempts then
          dead_lettered_count := dead_lettered_count + 1;
        else
          retried_count := retried_count + 1;
        end if;
        updated_ids := updated_ids || jsonb_build_array(updated_id);
      end if;
    elsif requested_status = 'dead_lettered' then
      update public.worksheet_mutation_evidence_v2_outbox outbox
      set
        processing_status = 'dead_lettered',
        retry_after = null,
        dead_lettered_at = now(),
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null,
        claim_token = null,
        last_error_code = coalesce(resolved_error_code, 'worksheet_mutation_dead_lettered'),
        last_error_message = coalesce(resolved_error_message, 'Worksheet mutation Evidence V2 processing dead-lettered.'),
        updated_at = now()
      where outbox.id = resolved_id
        and outbox.claim_token = resolved_claim_token
      returning outbox.id into updated_id;

      if updated_id is not null then
        dead_lettered_count := dead_lettered_count + 1;
        updated_ids := updated_ids || jsonb_build_array(updated_id);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(updated_ids),
    'ids', updated_ids,
    'completedCount', completed_count,
    'retriedCount', retried_count,
    'deadLetteredCount', dead_lettered_count
  );
end;
$$;

create or replace function public.write_worksheet_mutation_outbox_intelligence_events(
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
  resolved_actor_user_id uuid;
  resolved_actor_member_id uuid;
  resolved_actor_role text;
  resolved_organization_id uuid;
  resolved_project_id uuid;
  resolved_opportunity_id uuid;
  resolved_module text;
  resolved_event_type text;
  resolved_source_request_id text;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'write_worksheet_mutation_outbox_intelligence_events requires a JSON array payload';
  end if;

  for event_item in
    select value
    from jsonb_array_elements(p_events)
  loop
    resolved_organization_id := nullif(event_item->>'organizationId', '')::uuid;
    resolved_project_id := nullif(event_item->>'projectId', '')::uuid;
    resolved_opportunity_id := nullif(event_item->>'opportunityId', '')::uuid;
    resolved_module := nullif(btrim(coalesce(event_item->>'module', '')), '');
    resolved_event_type := nullif(btrim(coalesce(event_item->>'eventType', '')), '');
    resolved_source_request_id := nullif(btrim(coalesce(event_item->>'sourceRequestId', '')), '');
    resolved_actor_user_id := coalesce(
      nullif(event_item->>'userId', '')::uuid,
      nullif(event_item->'metadata'->>'userId', '')::uuid
    );

    resolved_actor_member_id := null;
    resolved_actor_role := null;
    if resolved_actor_user_id is not null and resolved_organization_id is not null then
      select member.id, member.role
      into resolved_actor_member_id, resolved_actor_role
      from public.organization_members member
      where member.organization_id = resolved_organization_id
        and member.user_id = resolved_actor_user_id
      limit 1;
    end if;

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
      nullif(btrim(coalesce(event_item->>'submodule', '')), ''),
      nullif(btrim(coalesce(event_item->>'eventFamily', '')), ''),
      resolved_event_type,
      nullif(btrim(coalesce(event_item->>'action', '')), ''),
      nullif(btrim(coalesce(event_item->>'entityType', '')), ''),
      nullif(event_item->>'entityId', '')::uuid,
      nullif(event_item->>'entityVersion', '')::integer,
      nullif(btrim(coalesce(event_item->>'parentEntityType', '')), ''),
      nullif(event_item->>'parentEntityId', '')::uuid,
      coalesce(event_item->'relatedEntities', '[]'::jsonb),
      coalesce(event_item->'lineageRefs', '[]'::jsonb),
      resolved_actor_user_id,
      resolved_actor_member_id,
      resolved_actor_role,
      coalesce(nullif(btrim(coalesce(event_item->>'sourceChannel', '')), ''), 'web'),
      nullif(btrim(coalesce(event_item->>'sourceSurface', '')), ''),
      resolved_source_request_id,
      nullif(btrim(coalesce(event_item->>'sourceSessionId', '')), ''),
      nullif(btrim(coalesce(event_item->>'sourceDeviceId', '')), ''),
      nullif(btrim(coalesce(event_item->>'statusBefore', '')), ''),
      nullif(btrim(coalesce(event_item->>'statusAfter', '')), ''),
      nullif(btrim(coalesce(event_item->>'fieldName', '')), ''),
      event_item->'beforeData',
      event_item->'afterData',
      coalesce(event_item->'diffData', '{}'::jsonb),
      nullif(btrim(coalesce(event_item->>'reason', '')), ''),
      coalesce(event_item->'metadata', '{}'::jsonb),
      coalesce(nullif(btrim(coalesce(event_item->>'privacyClassification', '')), ''), 'internal_operational'),
      coalesce(nullif(btrim(coalesce(event_item->>'visibilityScope', '')), ''), 'organization'),
      coalesce(nullif(event_item->>'containsFinancialData', '')::boolean, false),
      coalesce(nullif(event_item->>'containsPersonalData', '')::boolean, false),
      coalesce(nullif(event_item->>'containsAttachmentContent', '')::boolean, false),
      nullif(btrim(coalesce(event_item->>'retentionPolicyKey', '')), ''),
      nullif(event_item->>'retentionExpiresAt', '')::timestamptz,
      coalesce(nullif(event_item->>'legalHold', '')::boolean, false),
      coalesce(nullif(event_item->>'occurredAt', '')::timestamptz, now())
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
      raise exception 'Unable to persist worksheet mutation outbox intelligence event.';
    end if;

    inserted_ids := inserted_ids || jsonb_build_array(inserted_id);
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
  );
end;
$$;

grant execute on function public.enqueue_worksheet_mutation_evidence_v2_outbox(jsonb) to authenticated;
grant execute on function public.claim_worksheet_mutation_evidence_v2_outbox_batch(integer, uuid, text, integer) to service_role;
grant execute on function public.finalize_worksheet_mutation_evidence_v2_outbox_batch(jsonb) to service_role;
grant execute on function public.write_worksheet_mutation_outbox_intelligence_events(jsonb) to service_role;
