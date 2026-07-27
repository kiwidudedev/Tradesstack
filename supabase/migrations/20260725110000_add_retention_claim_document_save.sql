begin;

-- Whole-document Retention Claim Draft saving is additive. Existing per-line
-- RPCs remain available for backwards compatibility, but the new editor uses
-- one transaction and one revision for the complete document.

alter table public.retention_claim_events
  drop constraint retention_claim_events_type_check;
alter table public.retention_claim_events
  add constraint retention_claim_events_type_check check (
    event_type in (
      'claim_created', 'draft_updated', 'allocation_added',
      'allocation_updated', 'allocation_removed', 'claim_submitted',
      'submission_rejected', 'draft_cancelled',
      'invalid_transition_attempted', 'permission_denied',
      'draft_document_saved', 'draft_save_rejected',
      'successor_draft_created', 'successor_draft_skipped'
    )
  );

create or replace function private.retention_claim_draft_origin_set_hash(
  p_retention_claim_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(coalesce((
    select jsonb_agg(jsonb_build_object(
      'candidateId', source.candidate_id,
      'originatingPaymentClaimId', source.origin_id,
      'sequence', source.sequence,
      'originStateHash', source.origin_state_hash
    ) order by source.sequence, source.origin_id)
    from (
      select
        candidate.id candidate_id,
        candidate.originating_payment_claim_id origin_id,
        candidate.origin_sequence sequence,
        candidate.latest_origin_state_hash origin_state_hash
      from public.retention_rolling_draft_origins candidate
      join public.retention_claims claim on claim.id = candidate.retention_claim_id
      where candidate.retention_claim_id = p_retention_claim_id
        and claim.draft_kind = 'automatic_rolling'
      union all
      select
        null::uuid,
        allocation.originating_payment_claim_id,
        allocation.allocation_sequence,
        allocation.draft_origin_state_hash
      from public.retention_claim_allocations allocation
      join public.retention_claims claim on claim.id = allocation.retention_claim_id
      where allocation.retention_claim_id = p_retention_claim_id
        and claim.draft_kind = 'manual'
    ) source
  ), '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function private.reject_retention_document_save(
  p_claim public.retention_claims,
  p_error_code text,
  p_correlation_id text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.record_retention_claim_event(
    p_claim.organization_id, p_claim.project_id, p_claim.id,
    'draft_save_rejected', p_claim.status, p_claim.status, auth.uid(),
    p_error_code, p_correlation_id, coalesce(p_details, '{}'::jsonb)
  );
  return jsonb_build_object(
    'succeeded', false,
    'errorCode', p_error_code,
    'changed', false,
    'requiresReload', p_error_code in (
      'concurrent_update', 'origin_set_changed', 'position_changed',
      'eligibility_changed', 'stale_draft', 'claim_not_draft'
    ),
    'currentDraftRevision', p_claim.draft_revision,
    'details', coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

create or replace function public.save_retention_claim_draft_document(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_title text,
  p_reference text,
  p_issue_date date,
  p_due_date date,
  p_expected_position_state_hash text,
  p_expected_eligibility_state_hash text,
  p_expected_origin_set_hash text,
  p_lines jsonb,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
  v_position jsonb;
  v_eligibility jsonb;
  v_position_hash text;
  v_eligibility_hash text;
  v_origin_set_hash text;
  v_changed boolean := false;
  v_old_total bigint := 0;
  v_new_total bigint := 0;
  v_added uuid[] := '{}'::uuid[];
  v_updated uuid[] := '{}'::uuid[];
  v_removed uuid[] := '{}'::uuid[];
  v_line_count integer;
  v_invalid jsonb;
  v_lines_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('succeeded', false, 'errorCode', 'permission_denied');
  end if;

  select * into v_claim
  from public.retention_claims
  where id = p_retention_claim_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id, 'retention.claims.create', true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    return v_context;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_claim.project_id::text || ':automatic_retention_draft', 7)
  );
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id
    and claim.organization_id = (v_context ->> 'organizationId')::uuid
  for update;

  if v_claim.status <> 'draft' then
    return private.reject_retention_document_save(
      v_claim, 'claim_not_draft', p_correlation_id
    );
  end if;
  if v_claim.draft_revision <> p_expected_draft_revision then
    return private.reject_retention_document_save(
      v_claim, 'concurrent_update', p_correlation_id,
      jsonb_build_object('currentDraftRevision', v_claim.draft_revision)
    );
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null
    or length(p_title) > 250
    or length(coalesce(p_reference, '')) > 250
    or length(coalesce(p_correlation_id, '')) > 250
    or (p_issue_date is not null and p_due_date is not null and p_due_date < p_issue_date)
    or p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) > 500
    or octet_length(p_lines::text) > 524288 then
    return private.reject_retention_document_save(
      v_claim, 'invalid_line_set', p_correlation_id
    );
  end if;

  create temporary table if not exists _retention_document_lines (
    origin_id uuid primary key,
    candidate_id uuid null,
    existing_allocation_id uuid null,
    expected_origin_state_hash text not null,
    requested_sequence integer not null,
    proposed_amount_cents bigint not null
  ) on commit drop;
  truncate _retention_document_lines;

  begin
    insert into _retention_document_lines
    select
      (item ->> 'originatingPaymentClaimId')::uuid,
      nullif(item ->> 'candidateId', '')::uuid,
      nullif(item ->> 'existingAllocationId', '')::uuid,
      item ->> 'expectedOriginStateHash',
      (item ->> 'sequence')::integer,
      (item ->> 'proposedAmountCents')::bigint
    from jsonb_array_elements(p_lines) item
    where jsonb_typeof(item) = 'object'
      and (item - array[
        'originatingPaymentClaimId', 'candidateId', 'existingAllocationId',
        'expectedOriginStateHash', 'sequence', 'proposedAmountCents'
      ]) = '{}'::jsonb
      and coalesce(item ->> 'originatingPaymentClaimId', '') ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      and coalesce(item ->> 'expectedOriginStateHash', '') ~ '^[a-f0-9]{64}$'
      and coalesce(item ->> 'sequence', '') ~ '^[1-9][0-9]*$'
      and coalesce(item ->> 'proposedAmountCents', '') ~ '^[0-9]+$';
  exception when others then
    return private.reject_retention_document_save(
      v_claim, 'invalid_line_set', p_correlation_id
    );
  end;

  select count(*) into v_line_count from _retention_document_lines;
  if v_line_count <> jsonb_array_length(p_lines) then
    return private.reject_retention_document_save(
      v_claim, 'invalid_line_set', p_correlation_id
    );
  end if;
  if exists (
    select 1 from _retention_document_lines
    where proposed_amount_cents > 99999999999999
      or requested_sequence > 500
  ) then
    return private.reject_retention_document_save(
      v_claim, 'invalid_line_set', p_correlation_id
    );
  end if;

  perform 1 from public.retention_rolling_draft_origins candidate
  where candidate.retention_claim_id = v_claim.id
  order by candidate.origin_sequence, candidate.originating_payment_claim_id
  for update;
  perform 1 from public.project_claims origin
  where origin.id in (
    select line.origin_id from _retention_document_lines line
    union
    select candidate.originating_payment_claim_id
    from public.retention_rolling_draft_origins candidate
    where candidate.retention_claim_id = v_claim.id
  )
  order by origin.id
  for update;
  perform 1 from public.retention_claim_allocations allocation
  where allocation.retention_claim_id = v_claim.id
  order by allocation.originating_payment_claim_id, allocation.id
  for update;

  v_origin_set_hash := private.retention_claim_draft_origin_set_hash(v_claim.id);
  if p_expected_origin_set_hash is null
    or p_expected_origin_set_hash <> v_origin_set_hash then
    return private.reject_retention_document_save(
      v_claim, 'origin_set_changed', p_correlation_id,
      jsonb_build_object('currentOriginSetHash', v_origin_set_hash)
    );
  end if;

  if v_claim.draft_kind = 'automatic_rolling' and (
    exists (
      select 1 from public.retention_rolling_draft_origins candidate
      left join _retention_document_lines line
        on line.origin_id = candidate.originating_payment_claim_id
       and line.candidate_id = candidate.id
       and line.requested_sequence = candidate.origin_sequence
      where candidate.retention_claim_id = v_claim.id and line.origin_id is null
    )
    or exists (
      select 1 from _retention_document_lines line
      left join public.retention_rolling_draft_origins candidate
        on candidate.retention_claim_id = v_claim.id
       and candidate.id = line.candidate_id
       and candidate.originating_payment_claim_id = line.origin_id
      where candidate.id is null
    )
  ) then
    return private.reject_retention_document_save(
      v_claim, 'origin_set_changed', p_correlation_id,
      jsonb_build_object('currentOriginSetHash', v_origin_set_hash)
    );
  end if;
  if v_claim.draft_kind = 'automatic_rolling' and exists (
    select 1
    from _retention_document_lines line
    left join public.retention_claim_allocations allocation
      on allocation.retention_claim_id = v_claim.id
     and allocation.originating_payment_claim_id = line.origin_id
    where line.existing_allocation_id is distinct from allocation.id
  ) then
    return private.reject_retention_document_save(
      v_claim, 'invalid_line_set', p_correlation_id
    );
  end if;

  if v_claim.draft_kind = 'manual' and exists (
    select 1 from public.retention_claim_allocations allocation
    left join _retention_document_lines line
      on line.origin_id = allocation.originating_payment_claim_id
    where allocation.retention_claim_id = v_claim.id and line.origin_id is null
  ) then
    return private.reject_retention_document_save(
      v_claim, 'invalid_line_set', p_correlation_id
    );
  end if;
  if v_claim.draft_kind = 'manual' and exists (
    select 1
    from _retention_document_lines line
    join public.retention_claim_allocations allocation
      on allocation.retention_claim_id = v_claim.id
     and allocation.originating_payment_claim_id = line.origin_id
    where line.requested_sequence <> allocation.allocation_sequence
      or line.existing_allocation_id is distinct from allocation.id
      or line.candidate_id is not null
  ) then
    return private.reject_retention_document_save(
      v_claim, 'invalid_line_set', p_correlation_id
    );
  end if;

  v_position := public.get_project_retention_position_summary(v_claim.project_id);
  v_eligibility := public.get_project_retention_eligibility(v_claim.project_id);
  v_position_hash := v_position ->> 'stateHash';
  v_eligibility_hash := v_eligibility ->> 'eligibilityStateHash';

  if p_expected_position_state_hash is null
    or p_expected_position_state_hash <> v_position_hash then
    return private.reject_retention_document_save(
      v_claim, 'position_changed', p_correlation_id,
      jsonb_build_object('currentPositionStateHash', v_position_hash)
    );
  end if;
  if p_expected_eligibility_state_hash is null
    or p_expected_eligibility_state_hash <> v_eligibility_hash then
    return private.reject_retention_document_save(
      v_claim, 'eligibility_changed', p_correlation_id,
      jsonb_build_object('currentEligibilityStateHash', v_eligibility_hash)
    );
  end if;

  create temporary table if not exists _retention_document_authority (
    origin_id uuid primary key,
    current_origin_state_hash text not null,
    retention_owned_cents bigint not null,
    available_cents bigint not null,
    origin_updated_at timestamptz not null
  ) on commit drop;
  truncate _retention_document_authority;
  insert into _retention_document_authority
  select
    origin.id,
    private.retention_claim_origin_state_hash(origin.id),
    round(greatest(coalesce((eligible.value ->> 'currentRetentionOwned')::numeric,
      origin.retention_withheld_amount, 0), 0) * 100)::bigint,
    round(greatest(
      coalesce((eligible.value ->> 'availableRetention')::numeric, 0)
      + coalesce(existing.allocation_amount, 0),
      0
    ) * 100)::bigint,
    origin.updated_at
  from _retention_document_lines line
  join public.project_claims origin
    on origin.id = line.origin_id
   and origin.organization_id = v_claim.organization_id
   and origin.project_id = v_claim.project_id
   and origin.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
  left join lateral (
    select value from jsonb_array_elements(coalesce(v_eligibility -> 'origins', '[]'::jsonb))
    where value ->> 'originatingPaymentClaimId' = origin.id::text
  ) eligible on true
  left join public.retention_claim_allocations existing
    on existing.retention_claim_id = v_claim.id
   and existing.originating_payment_claim_id = origin.id;

  if (select count(*) from _retention_document_authority) <> v_line_count then
    return private.reject_retention_document_save(
      v_claim, 'invalid_line_set', p_correlation_id
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'originatingPaymentClaimId', line.origin_id,
    'errorCode', case
      when line.expected_origin_state_hash <> authority.current_origin_state_hash
        then 'stale_draft'
      when line.proposed_amount_cents > authority.retention_owned_cents
        then 'allocation_exceeds_ownership'
      when line.proposed_amount_cents > authority.available_cents
        then 'allocation_exceeds_eligibility'
    end,
    'currentLimitCents', least(authority.retention_owned_cents, authority.available_cents)
  ) order by line.origin_id)
  into v_invalid
  from _retention_document_lines line
  join _retention_document_authority authority on authority.origin_id = line.origin_id
  where line.expected_origin_state_hash <> authority.current_origin_state_hash
     or line.proposed_amount_cents > authority.retention_owned_cents
     or line.proposed_amount_cents > authority.available_cents;

  if v_invalid is not null then
    return private.reject_retention_document_save(
      v_claim,
      case
        when exists(select 1 from jsonb_array_elements(v_invalid) x
          where x ->> 'errorCode' = 'stale_draft') then 'stale_draft'
        when exists(select 1 from jsonb_array_elements(v_invalid) x
          where x ->> 'errorCode' = 'allocation_exceeds_ownership')
          then 'allocation_exceeds_ownership'
        else 'allocation_exceeds_eligibility'
      end,
      p_correlation_id,
      jsonb_build_object('rowErrors', v_invalid)
    );
  end if;

  select coalesce(sum(round(allocation_amount * 100)::bigint), 0)
  into v_old_total
  from public.retention_claim_allocations
  where retention_claim_id = v_claim.id;
  select coalesce(sum(proposed_amount_cents), 0)
  into v_new_total
  from _retention_document_lines;

  select coalesce(array_agg(line.origin_id order by line.origin_id), '{}'::uuid[])
  into v_added
  from _retention_document_lines line
  left join public.retention_claim_allocations allocation
    on allocation.retention_claim_id = v_claim.id
   and allocation.originating_payment_claim_id = line.origin_id
  where line.proposed_amount_cents > 0 and allocation.id is null;
  select coalesce(array_agg(line.origin_id order by line.origin_id), '{}'::uuid[])
  into v_updated
  from _retention_document_lines line
  join public.retention_claim_allocations allocation
    on allocation.retention_claim_id = v_claim.id
   and allocation.originating_payment_claim_id = line.origin_id
  where line.proposed_amount_cents > 0
    and (
      round(allocation.allocation_amount * 100)::bigint <> line.proposed_amount_cents
      or allocation.allocation_sequence <> line.requested_sequence
      or allocation.draft_origin_state_hash <>
        (select current_origin_state_hash from _retention_document_authority
         where origin_id = line.origin_id)
    );
  select coalesce(array_agg(line.origin_id order by line.origin_id), '{}'::uuid[])
  into v_removed
  from _retention_document_lines line
  join public.retention_claim_allocations allocation
    on allocation.retention_claim_id = v_claim.id
   and allocation.originating_payment_claim_id = line.origin_id
  where line.proposed_amount_cents = 0;

  v_changed :=
    trim(p_title) is distinct from v_claim.title
    or nullif(trim(coalesce(p_reference, '')), '') is distinct from v_claim.reference
    or p_issue_date is distinct from v_claim.issue_date
    or p_due_date is distinct from v_claim.due_date
    or v_claim.last_position_state_hash is distinct from v_position_hash
    or v_claim.last_eligibility_state_hash is distinct from v_eligibility_hash
    or cardinality(v_added) > 0 or cardinality(v_updated) > 0 or cardinality(v_removed) > 0;

  if v_changed then
    set constraints retention_claim_allocations_sequence_unique deferred;
    delete from public.retention_claim_allocations allocation
    using _retention_document_lines line
    where allocation.retention_claim_id = v_claim.id
      and allocation.originating_payment_claim_id = line.origin_id
      and line.proposed_amount_cents = 0;

    update public.retention_claim_allocations allocation
    set
      allocation_amount = line.proposed_amount_cents::numeric / 100,
      allocation_sequence = line.requested_sequence,
      draft_origin_state_hash = authority.current_origin_state_hash,
      draft_origin_updated_at = authority.origin_updated_at,
      draft_origin_retention_owned = authority.retention_owned_cents::numeric / 100
    from _retention_document_lines line
    join _retention_document_authority authority on authority.origin_id = line.origin_id
    where allocation.retention_claim_id = v_claim.id
      and allocation.originating_payment_claim_id = line.origin_id
      and line.proposed_amount_cents > 0;

    insert into public.retention_claim_allocations (
      organization_id, project_id, retention_claim_id,
      originating_payment_claim_id, allocation_sequence, allocation_amount,
      draft_origin_state_hash, draft_origin_updated_at,
      draft_origin_retention_owned, created_by
    )
    select
      v_claim.organization_id, v_claim.project_id, v_claim.id,
      line.origin_id, line.requested_sequence,
      line.proposed_amount_cents::numeric / 100,
      authority.current_origin_state_hash, authority.origin_updated_at,
      authority.retention_owned_cents::numeric / 100, auth.uid()
    from _retention_document_lines line
    join _retention_document_authority authority on authority.origin_id = line.origin_id
    left join public.retention_claim_allocations allocation
      on allocation.retention_claim_id = v_claim.id
     and allocation.originating_payment_claim_id = line.origin_id
    where line.proposed_amount_cents > 0 and allocation.id is null;

    update public.retention_claims claim
    set
      title = trim(p_title),
      reference = nullif(trim(coalesce(p_reference, '')), ''),
      issue_date = p_issue_date,
      due_date = p_due_date,
      last_position_state_hash = v_position_hash,
      last_eligibility_state_hash = v_eligibility_hash,
      draft_revision = claim.draft_revision + 1
    where claim.id = v_claim.id
    returning * into v_claim;

    v_origin_set_hash := private.retention_claim_draft_origin_set_hash(v_claim.id);
    perform private.record_retention_claim_event(
      v_claim.organization_id, v_claim.project_id, v_claim.id,
      'draft_document_saved', 'draft', 'draft', auth.uid(),
      'Retention Claim Draft document saved.', p_correlation_id,
      jsonb_build_object(
        'newRevision', v_claim.draft_revision,
        'positionStateHash', v_position_hash,
        'eligibilityStateHash', v_eligibility_hash,
        'originSetHash', v_origin_set_hash,
        'addedOriginIds', to_jsonb(v_added),
        'updatedOriginIds', to_jsonb(v_updated),
        'removedAllocationOriginIds', to_jsonb(v_removed),
        'previousTotalCents', v_old_total,
        'newTotalCents', v_new_total,
        'lineCount', v_line_count
      )
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'originatingPaymentClaimId', line.origin_id,
    'candidateId', line.candidate_id,
    'existingAllocationId', allocation.id,
    'expectedOriginStateHash', authority.current_origin_state_hash,
    'sequence', line.requested_sequence,
    'proposedAmountCents', line.proposed_amount_cents,
    'retentionOwnedCents', authority.retention_owned_cents,
    'availableCents', authority.available_cents
  ) order by line.requested_sequence, line.origin_id), '[]'::jsonb)
  into v_lines_result
  from _retention_document_lines line
  join _retention_document_authority authority on authority.origin_id = line.origin_id
  left join public.retention_claim_allocations allocation
    on allocation.retention_claim_id = v_claim.id
   and allocation.originating_payment_claim_id = line.origin_id;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'changed', v_changed,
    'requiresReload', false,
    'claim', private.retention_claim_header_json(v_claim.id),
    'draftRevision', v_claim.draft_revision,
    'positionStateHash', v_position_hash,
    'eligibilityStateHash', v_eligibility_hash,
    'originSetHash', v_origin_set_hash,
    'lines', v_lines_result,
    'totals', jsonb_build_object('thisClaimCents', v_new_total),
    'affectedOriginIds', to_jsonb(v_added || v_updated || v_removed),
    'rowErrors', '[]'::jsonb
  );
end;
$$;

-- Expose the exact database-computed origin membership fingerprint through the
-- existing permission boundary so clients never attempt to reproduce jsonb
-- canonicalisation.
create or replace function public.get_retention_claim_draft_origin_set_hash(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
begin
  select *
  into v_claim
  from public.retention_claims
  where id = p_retention_claim_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'retention_claim_not_found';
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.view',
    false
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false)
    or (v_context ->> 'organizationId')::uuid <> v_claim.organization_id then
    return v_context;
  end if;

  return jsonb_build_object(
    'retentionClaimId', v_claim.id,
    'originSetHash', private.retention_claim_draft_origin_set_hash(v_claim.id),
    'originStateHashes', coalesce((
      select jsonb_object_agg(
        origin_id::text,
        private.retention_claim_origin_state_hash(origin_id)
      )
      from (
        select candidate.originating_payment_claim_id as origin_id
        from public.retention_rolling_draft_origins candidate
        where candidate.retention_claim_id = v_claim.id
        union
        select allocation.originating_payment_claim_id
        from public.retention_claim_allocations allocation
        where allocation.retention_claim_id = v_claim.id
      ) origins
    ), '{}'::jsonb)
  );
end;
$$;

-- Wrap the existing worker implementation so the project advisory lock is
-- always taken before its row locks. The proven maintenance body remains intact.
alter function private.maintain_retention_rolling_draft(uuid, text, text, integer)
  rename to maintain_retention_rolling_draft_pre_document_lock;
create or replace function private.maintain_retention_rolling_draft(
  p_originating_payment_claim_id uuid,
  p_operation text,
  p_correlation_id text,
  p_retry_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id
  from public.project_claims where id = p_originating_payment_claim_id;
  if v_project_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_project_id::text || ':automatic_retention_draft', 7)
    );
  end if;
  return private.maintain_retention_rolling_draft_pre_document_lock(
    p_originating_payment_claim_id, p_operation, p_correlation_id, p_retry_count
  );
end;
$$;

create or replace function private.create_retention_successor_draft(
  p_submitted_claim_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.retention_claims%rowtype;
  v_successor public.retention_claims%rowtype;
  v_position jsonb;
  v_eligibility jsonb;
  v_count integer;
begin
  select * into v_source from public.retention_claims where id = p_submitted_claim_id;
  if not found or v_source.status <> 'submitted'
    or v_source.draft_kind <> 'automatic_rolling' then
    return jsonb_build_object('succeeded', true, 'created', false);
  end if;

  select * into v_successor from public.retention_claims
  where organization_id = v_source.organization_id
    and project_id = v_source.project_id
    and status = 'draft' and draft_kind = 'automatic_rolling'
  for update;
  if found then
    return jsonb_build_object('succeeded', true, 'created', false,
      'retentionClaimId', v_successor.id);
  end if;

  v_position := public.get_project_retention_position_summary(v_source.project_id);
  v_eligibility := public.get_project_retention_eligibility(v_source.project_id);
  select count(*) into v_count
  from jsonb_array_elements(coalesce(v_eligibility -> 'origins', '[]'::jsonb)) origin
  where round(greatest(
    coalesce((origin ->> 'currentRetentionOwned')::numeric, 0)
    - coalesce((origin ->> 'committedRetention')::numeric, 0), 0
  ), 2) > 0;

  if v_count = 0 then
    perform private.record_retention_claim_event(
      v_source.organization_id, v_source.project_id, v_source.id,
      'successor_draft_skipped', 'submitted', 'submitted', auth.uid(),
      'No remaining retention required a successor Draft.', p_correlation_id,
      jsonb_build_object('remainingOriginCount', 0)
    );
    return jsonb_build_object('succeeded', true, 'created', false);
  end if;

  insert into public.retention_claims (
    organization_id, project_id, claim_number, title, status,
    last_position_state_hash, last_eligibility_state_hash,
    created_by, draft_kind
  ) values (
    v_source.organization_id, v_source.project_id,
    private.generate_retention_claim_number(v_source.organization_id, v_source.project_id),
    'Retention Claim', 'draft', v_position ->> 'stateHash',
    v_eligibility ->> 'eligibilityStateHash', auth.uid(), 'automatic_rolling'
  ) returning * into v_successor;

  insert into public.retention_rolling_draft_origins (
    organization_id, project_id, retention_claim_id,
    originating_payment_claim_id, origin_sequence,
    latest_origin_state_hash, latest_origin_updated_at,
    latest_retention_owned
  )
  select
    v_source.organization_id, v_source.project_id, v_successor.id,
    claim.id,
    row_number() over (
      order by claim.claim_date asc nulls last, claim.created_at, claim.id
    )::integer,
    private.retention_claim_origin_state_hash(claim.id),
    claim.updated_at,
    greatest(coalesce((origin ->> 'currentRetentionOwned')::numeric, 0), 0)
  from jsonb_array_elements(coalesce(v_eligibility -> 'origins', '[]'::jsonb)) origin
  join public.project_claims claim
    on claim.id = (origin ->> 'originatingPaymentClaimId')::uuid
  where round(greatest(
    coalesce((origin ->> 'currentRetentionOwned')::numeric, 0)
    - coalesce((origin ->> 'committedRetention')::numeric, 0), 0
  ), 2) > 0;

  perform private.record_retention_claim_event(
    v_successor.organization_id, v_successor.project_id, v_successor.id,
    'successor_draft_created', null, 'draft', auth.uid(),
    'Automatic successor Retention Claim Draft created.', p_correlation_id,
    jsonb_build_object(
      'predecessorRetentionClaimId', v_source.id,
      'originCount', v_count
    )
  );
  return jsonb_build_object(
    'succeeded', true, 'created', true,
    'retentionClaimId', v_successor.id, 'originCount', v_count
  );
end;
$$;

-- Preserve the public submission contract while serializing it with document
-- Save and creating the next release-cycle Draft only after successful submit.
alter function public.submit_retention_claim(uuid, bigint, text, text, text)
  rename to submit_retention_claim_pre_document_successor;
revoke all on function public.submit_retention_claim_pre_document_successor(
  uuid, bigint, text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.submit_retention_claim(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_expected_position_state_hash text,
  p_correlation_id text default null,
  p_expected_eligibility_state_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_result jsonb;
  v_successor jsonb;
begin
  select project_id into v_project_id
  from public.retention_claims where id = p_retention_claim_id;
  if v_project_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_project_id::text || ':automatic_retention_draft', 7)
    );
    perform 1 from public.retention_claims
    where id = p_retention_claim_id for update;
  end if;
  v_result := public.submit_retention_claim_pre_document_successor(
    p_retention_claim_id, p_expected_draft_revision,
    p_expected_position_state_hash, p_correlation_id,
    p_expected_eligibility_state_hash
  );
  if coalesce((v_result ->> 'succeeded')::boolean, false) then
    v_successor := private.create_retention_successor_draft(
      p_retention_claim_id, p_correlation_id
    );
    v_result := v_result || jsonb_build_object('successorDraft', v_successor);
  end if;
  return v_result;
end;
$$;

revoke all on function public.save_retention_claim_draft_document(
  uuid, bigint, text, text, date, date, text, text, text, jsonb, text
) from public, anon;
grant execute on function public.save_retention_claim_draft_document(
  uuid, bigint, text, text, date, date, text, text, text, jsonb, text
) to authenticated;
revoke all on function public.get_retention_claim_draft_origin_set_hash(uuid)
  from public, anon;
grant execute on function public.get_retention_claim_draft_origin_set_hash(uuid)
  to authenticated;
revoke all on function public.submit_retention_claim(
  uuid, bigint, text, text, text
) from public, anon;
grant execute on function public.submit_retention_claim(
  uuid, bigint, text, text, text
) to authenticated;

revoke all on function private.retention_claim_draft_origin_set_hash(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.reject_retention_document_save(
  public.retention_claims, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.maintain_retention_rolling_draft_pre_document_lock(
  uuid, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function private.create_retention_successor_draft(uuid, text)
  from public, anon, authenticated, service_role;

commit;
