begin;

-- Phase 3 adds an isolated Retention Claim financial foundation. It does not
-- alter Payment Claim calculations, workflows, statuses, PDFs, Xero behavior,
-- or persisted financial values.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_claims_org_project_id_unique'
      and conrelid = 'public.project_claims'::regclass
  ) then
    alter table public.project_claims
      add constraint project_claims_org_project_id_unique
      unique (organization_id, project_id, id);
  end if;
end;
$$;

create table public.project_retention_claim_counters (
  organization_id uuid not null,
  project_id uuid not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (project_id),
  constraint project_retention_claim_counters_org_project_unique
    unique (organization_id, project_id),
  constraint project_retention_claim_counters_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id)
    on delete cascade,
  constraint project_retention_claim_counters_last_number_nonnegative
    check (last_number >= 0)
);

create table public.retention_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  claim_number text not null,
  title text not null,
  reference text null,
  issue_date date null,
  due_date date null,
  status text not null default 'draft',
  subtotal_excl_tax numeric(14,2) not null default 0,
  draft_revision bigint not null default 1,
  last_position_state_hash text null,
  submission_state_hash text null,
  submitted_by uuid null references auth.users (id) on delete restrict,
  submitted_at timestamptz null,
  cancelled_by uuid null references auth.users (id) on delete restrict,
  cancelled_at timestamptz null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_claims_org_project_id_unique
    unique (organization_id, project_id, id),
  constraint retention_claims_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id)
    on delete restrict,
  constraint retention_claims_number_not_blank
    check (char_length(trim(claim_number)) between 1 and 100),
  constraint retention_claims_title_not_blank
    check (char_length(trim(title)) between 1 and 250),
  constraint retention_claims_reference_length
    check (reference is null or char_length(reference) <= 250),
  constraint retention_claims_status_check
    check (status in ('draft', 'submitted', 'cancelled_draft')),
  constraint retention_claims_unique_number_per_project
    unique (project_id, claim_number),
  constraint retention_claims_subtotal_nonnegative
    check (subtotal_excl_tax >= 0),
  constraint retention_claims_revision_positive
    check (draft_revision > 0),
  constraint retention_claims_date_order
    check (issue_date is null or due_date is null or due_date >= issue_date),
  constraint retention_claims_last_hash_shape
    check (
      last_position_state_hash is null
      or last_position_state_hash ~ '^[a-f0-9]{64}$'
    ),
  constraint retention_claims_submission_hash_shape
    check (
      submission_state_hash is null
      or submission_state_hash ~ '^[a-f0-9]{64}$'
    ),
  constraint retention_claims_lifecycle_fields_check
    check (
      (
        status = 'draft'
        and subtotal_excl_tax = 0
        and submission_state_hash is null
        and submitted_by is null
        and submitted_at is null
        and cancelled_by is null
        and cancelled_at is null
      )
      or (
        status = 'submitted'
        and submission_state_hash is not null
        and submitted_by is not null
        and submitted_at is not null
        and cancelled_by is null
        and cancelled_at is null
      )
      or (
        status = 'cancelled_draft'
        and subtotal_excl_tax = 0
        and submission_state_hash is null
        and submitted_by is null
        and submitted_at is null
        and cancelled_by is not null
        and cancelled_at is not null
      )
    )
);

create table public.retention_claim_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  originating_payment_claim_id uuid not null,
  allocation_sequence integer not null,
  allocation_amount numeric(14,2) not null,
  draft_origin_state_hash text not null,
  draft_origin_updated_at timestamptz not null,
  draft_origin_retention_owned numeric(14,2) not null,
  origin_claim_number_snapshot text null,
  origin_claim_date_snapshot date null,
  origin_claim_status_snapshot text null,
  origin_claim_created_at_snapshot timestamptz null,
  origin_claim_updated_at_snapshot timestamptz null,
  retention_method_snapshot text null,
  retention_rate_snapshot numeric(7,3) null,
  retention_scale_bands_snapshot jsonb null,
  retention_withheld_snapshot numeric(14,2) null,
  retention_released_snapshot numeric(14,2) null,
  retention_held_to_date_snapshot numeric(14,2) null,
  retention_released_to_date_snapshot numeric(14,2) null,
  retention_balance_snapshot numeric(14,2) null,
  existing_submitted_allocation_before numeric(14,2) null,
  remaining_after_allocation numeric(14,2) null,
  gross_claim_amount_snapshot numeric(14,2) null,
  net_claim_excl_gst_snapshot numeric(14,2) null,
  gst_amount_snapshot numeric(14,2) null,
  total_payable_snapshot numeric(14,2) null,
  project_state_hash_snapshot text null,
  origin_state_hash_snapshot text null,
  submitted_by uuid null references auth.users (id) on delete restrict,
  submitted_at timestamptz null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_claim_allocations_parent_fkey
    foreign key (organization_id, project_id, retention_claim_id)
    references public.retention_claims (organization_id, project_id, id)
    on delete cascade,
  constraint retention_claim_allocations_origin_fkey
    foreign key (organization_id, project_id, originating_payment_claim_id)
    references public.project_claims (organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_allocations_origin_unique
    unique (retention_claim_id, originating_payment_claim_id),
  constraint retention_claim_allocations_sequence_unique
    unique (retention_claim_id, allocation_sequence)
    deferrable initially immediate,
  constraint retention_claim_allocations_sequence_positive
    check (allocation_sequence > 0),
  constraint retention_claim_allocations_amount_positive
    check (allocation_amount > 0),
  constraint retention_claim_allocations_draft_owned_nonnegative
    check (draft_origin_retention_owned >= 0),
  constraint retention_claim_allocations_draft_hash_shape
    check (draft_origin_state_hash ~ '^[a-f0-9]{64}$'),
  constraint retention_claim_allocations_project_hash_shape
    check (
      project_state_hash_snapshot is null
      or project_state_hash_snapshot ~ '^[a-f0-9]{64}$'
    ),
  constraint retention_claim_allocations_origin_hash_shape
    check (
      origin_state_hash_snapshot is null
      or origin_state_hash_snapshot ~ '^[a-f0-9]{64}$'
    ),
  constraint retention_claim_allocations_submission_actor_pair
    check ((submitted_by is null) = (submitted_at is null))
);

create table public.retention_claim_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  project_id uuid not null references public.organization_projects (id) on delete restrict,
  retention_claim_id uuid null references public.retention_claims (id) on delete restrict,
  event_type text not null,
  previous_status text null,
  new_status text null,
  actor_user_id uuid null references auth.users (id) on delete restrict,
  reason text not null,
  correlation_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_claim_events_type_check
    check (
      event_type in (
        'claim_created',
        'draft_updated',
        'allocation_added',
        'allocation_updated',
        'allocation_removed',
        'claim_submitted',
        'submission_rejected',
        'draft_cancelled',
        'invalid_transition_attempted',
        'permission_denied'
      )
    ),
  constraint retention_claim_events_status_values
    check (
      (previous_status is null or previous_status in ('draft', 'submitted', 'cancelled_draft'))
      and (new_status is null or new_status in ('draft', 'submitted', 'cancelled_draft'))
    ),
  constraint retention_claim_events_reason_not_blank
    check (char_length(trim(reason)) between 1 and 1000),
  constraint retention_claim_events_correlation_length
    check (correlation_id is null or char_length(correlation_id) between 1 and 200),
  constraint retention_claim_events_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint retention_claim_events_org_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id)
    on delete restrict,
  constraint retention_claim_events_claim_identity_fkey
    foreign key (organization_id, project_id, retention_claim_id)
    references public.retention_claims (organization_id, project_id, id)
    on delete restrict
);

create index retention_claims_project_created_idx
  on public.retention_claims (project_id, created_at desc, id desc);

create index retention_claims_org_status_idx
  on public.retention_claims (organization_id, status, updated_at desc, id);

create index retention_claim_allocations_origin_submitted_lookup_idx
  on public.retention_claim_allocations (
    originating_payment_claim_id,
    retention_claim_id
  );

create index retention_claim_allocations_claim_sequence_idx
  on public.retention_claim_allocations (retention_claim_id, allocation_sequence, id);

create index retention_claim_events_claim_occurred_idx
  on public.retention_claim_events (retention_claim_id, occurred_at, id)
  where retention_claim_id is not null;

create index retention_claim_events_project_occurred_idx
  on public.retention_claim_events (project_id, occurred_at desc, id desc);

drop trigger if exists set_project_retention_claim_counters_updated_at
  on public.project_retention_claim_counters;
create trigger set_project_retention_claim_counters_updated_at
before update on public.project_retention_claim_counters
for each row execute function public.set_updated_at();

drop trigger if exists set_retention_claims_updated_at on public.retention_claims;
create trigger set_retention_claims_updated_at
before update on public.retention_claims
for each row execute function public.set_updated_at();

drop trigger if exists set_retention_claim_allocations_updated_at
  on public.retention_claim_allocations;
create trigger set_retention_claim_allocations_updated_at
before update on public.retention_claim_allocations
for each row execute function public.set_updated_at();

create or replace function private.retention_claim_phase3_gate_enabled()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(
      current_setting('request.jwt.claim.retention_phase3_internal', true),
      ''
    ) = 'true'
    or coalesce(
      (
        coalesce(
          nullif(current_setting('request.jwt.claims', true), ''),
          '{}'
        )::jsonb ->> 'retention_phase3_internal'
      ),
      'false'
    ) = 'true';
$$;

create or replace function private.retention_claim_origin_state_hash(
  p_originating_payment_claim_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      concat_ws(
        ':',
        claim.id::text,
        claim.status,
        coalesce(claim.claim_date::text, ''),
        to_char(claim.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        to_char(claim.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        claim.retention_method,
        to_char(round(claim.retention_percent, 3), 'FM999999999999999999990.000'),
        coalesce(claim.retention_scale_bands::text, ''),
        to_char(round(claim.retention_withheld_amount, 2), 'FM999999999999999999990.00'),
        to_char(round(claim.retention_released_amount, 2), 'FM999999999999999999990.00'),
        to_char(round(claim.retention_held_to_date, 2), 'FM999999999999999999990.00'),
        to_char(round(claim.retention_released_to_date, 2), 'FM999999999999999999990.00'),
        to_char(round(claim.retention_balance, 2), 'FM999999999999999999990.00')
      ),
      'sha256'
    ),
    'hex'
  )
  from public.project_claims claim
  where claim.id = p_originating_payment_claim_id;
$$;

create or replace function private.generate_retention_claim_number(
  p_organization_id uuid,
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_code text;
  v_next_number integer;
begin
  select coalesce(
    nullif(trim(project.project_code), ''),
    nullif(regexp_replace(upper(coalesce(project.slug, '')), '[^A-Z0-9]+', '-', 'g'), ''),
    'JOB'
  )
  into v_project_code
  from public.organization_projects project
  where project.organization_id = p_organization_id
    and project.id = p_project_id;

  if v_project_code is null then
    raise exception 'Retention Claim project identity could not be resolved.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_project_id::text || ':retention_claim', 3)
  );

  insert into public.project_retention_claim_counters (
    organization_id,
    project_id,
    last_number
  )
  values (p_organization_id, p_project_id, 1)
  on conflict (project_id)
  do update
  set
    last_number = public.project_retention_claim_counters.last_number + 1,
    updated_at = now()
  returning last_number into v_next_number;

  return format('%s-RC-%s', v_project_code, lpad(v_next_number::text, 2, '0'));
end;
$$;

create or replace function private.record_retention_claim_event(
  p_organization_id uuid,
  p_project_id uuid,
  p_retention_claim_id uuid,
  p_event_type text,
  p_previous_status text,
  p_new_status text,
  p_actor_user_id uuid,
  p_reason text,
  p_correlation_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.retention_claim_events (
    organization_id,
    project_id,
    retention_claim_id,
    event_type,
    previous_status,
    new_status,
    actor_user_id,
    reason,
    correlation_id,
    metadata
  )
  values (
    p_organization_id,
    p_project_id,
    p_retention_claim_id,
    p_event_type,
    p_previous_status,
    p_new_status,
    p_actor_user_id,
    coalesce(nullif(trim(p_reason), ''), p_event_type),
    nullif(trim(coalesce(p_correlation_id, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.prevent_retention_claim_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Retention Claim events are append-only.'
    using errcode = '55000';
end;
$$;

create trigger retention_claim_events_append_only
before update or delete on public.retention_claim_events
for each row execute function public.prevent_retention_claim_event_mutation();

create or replace function public.protect_retention_claim_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Retention Claims cannot be hard-deleted.'
      using errcode = '55000';
  end if;

  if old.status <> 'draft' then
    raise exception 'Retention Claim is immutable after leaving Draft.'
      using errcode = '55000';
  end if;

  if new.organization_id <> old.organization_id
    or new.project_id <> old.project_id
    or new.id <> old.id
    or new.claim_number <> old.claim_number
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at then
    raise exception 'Retention Claim identity is immutable.'
      using errcode = '55000';
  end if;

  if new.status not in ('draft', 'submitted', 'cancelled_draft') then
    raise exception 'Invalid Retention Claim transition.'
      using errcode = '55000';
  end if;

  if new.status = 'submitted' and (
    not exists (
      select 1
      from public.retention_claim_allocations allocation
      where allocation.retention_claim_id = old.id
    )
    or new.subtotal_excl_tax <> (
      select round(coalesce(sum(allocation.allocation_amount), 0), 2)
      from public.retention_claim_allocations allocation
      where allocation.retention_claim_id = old.id
    )
    or exists (
      select 1
      from public.retention_claim_allocations allocation
      where allocation.retention_claim_id = old.id
        and (
          allocation.origin_claim_number_snapshot is null
          or allocation.origin_claim_status_snapshot is null
          or allocation.origin_claim_created_at_snapshot is null
          or allocation.origin_claim_updated_at_snapshot is null
          or allocation.retention_method_snapshot is null
          or allocation.retention_rate_snapshot is null
          or allocation.retention_withheld_snapshot is null
          or allocation.retention_released_snapshot is null
          or allocation.retention_held_to_date_snapshot is null
          or allocation.retention_released_to_date_snapshot is null
          or allocation.retention_balance_snapshot is null
          or allocation.existing_submitted_allocation_before is null
          or allocation.remaining_after_allocation is null
          or allocation.gross_claim_amount_snapshot is null
          or allocation.net_claim_excl_gst_snapshot is null
          or allocation.gst_amount_snapshot is null
          or allocation.total_payable_snapshot is null
          or allocation.project_state_hash_snapshot is null
          or allocation.origin_state_hash_snapshot is null
          or allocation.submitted_by is null
          or allocation.submitted_at is null
        )
    )
  ) then
    raise exception 'Submitted Retention Claim snapshot evidence is incomplete.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger retention_claims_immutable_guard
before update or delete on public.retention_claims
for each row execute function public.protect_retention_claim_mutation();

create or replace function public.protect_retention_claim_allocation_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_retention_claim_id uuid :=
    case when tg_op = 'DELETE' then old.retention_claim_id else new.retention_claim_id end;
  v_status text;
begin
  select claim.status
  into v_status
  from public.retention_claims claim
  where claim.id = v_retention_claim_id;

  if v_status is distinct from 'draft' then
    raise exception 'Retention Claim allocations are immutable outside Draft.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.project_id <> old.project_id
    or new.retention_claim_id <> old.retention_claim_id
    or new.originating_payment_claim_id <> old.originating_payment_claim_id
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Retention Claim allocation identity is immutable.'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger retention_claim_allocations_immutable_guard
before insert or update or delete on public.retention_claim_allocations
for each row execute function public.protect_retention_claim_allocation_mutation();

create or replace function private.retention_claim_operation_context(
  p_project_id uuid,
  p_permission_key text,
  p_require_internal_gate boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_capability_enabled boolean := false;
  v_mode text := 'legacy';
begin
  if v_actor_user_id is null then
    return jsonb_build_object('succeeded', false, 'errorCode', 'permission_denied');
  end if;

  select project.organization_id
  into v_organization_id
  from public.organization_projects project
  join public.organization_members member
    on member.organization_id = project.organization_id
   and member.user_id = v_actor_user_id
  where project.id = p_project_id;

  if v_organization_id is null then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  if not public.has_org_permission(v_organization_id, p_permission_key) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'permission_denied',
      'organizationId', v_organization_id,
      'actorUserId', v_actor_user_id
    );
  end if;

  select coalesce(capability.enabled, false)
  into v_capability_enabled
  from public.organization_capabilities capability
  where capability.organization_id = v_organization_id
    and capability.capability_key = 'retention_management';

  if not coalesce(v_capability_enabled, false) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'capability_disabled',
      'organizationId', v_organization_id,
      'actorUserId', v_actor_user_id
    );
  end if;

  select coalesce(state.mode, 'legacy')
  into v_mode
  from public.project_retention_workflow_states state
  where state.organization_id = v_organization_id
    and state.project_id = p_project_id;

  if coalesce(v_mode, 'legacy') <> 'observe' then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'project_mode_not_supported',
      'organizationId', v_organization_id,
      'actorUserId', v_actor_user_id,
      'workflowMode', coalesce(v_mode, 'legacy')
    );
  end if;

  if p_require_internal_gate
    and not private.retention_claim_phase3_gate_enabled() then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'project_mode_not_supported',
      'organizationId', v_organization_id,
      'actorUserId', v_actor_user_id,
      'workflowMode', v_mode,
      'phase3InternalGate', false
    );
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'organizationId', v_organization_id,
    'projectId', p_project_id,
    'actorUserId', v_actor_user_id,
    'workflowMode', v_mode,
    'capabilityEnabled', true,
    'phase3InternalGate',
      case
        when p_require_internal_gate
          then private.retention_claim_phase3_gate_enabled()
        else null
      end
  );
end;
$$;

create or replace function private.retention_claim_header_json(
  p_retention_claim_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', claim.id,
    'organizationId', claim.organization_id,
    'projectId', claim.project_id,
    'claimNumber', claim.claim_number,
    'title', claim.title,
    'reference', claim.reference,
    'issueDate', claim.issue_date,
    'dueDate', claim.due_date,
    'status', claim.status,
    'subtotalExclTax', claim.subtotal_excl_tax,
    'draftRevision', claim.draft_revision,
    'lastPositionStateHash', claim.last_position_state_hash,
    'submissionStateHash', claim.submission_state_hash,
    'submittedBy', claim.submitted_by,
    'submittedAt', claim.submitted_at,
    'cancelledBy', claim.cancelled_by,
    'cancelledAt', claim.cancelled_at,
    'createdBy', claim.created_by,
    'createdAt', claim.created_at,
    'updatedAt', claim.updated_at
  )
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;
$$;

create or replace function private.retention_claim_current_origin_details(
  p_retention_claim_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with target_claim as (
    select claim.id
    from public.retention_claims claim
    where claim.id = p_retention_claim_id
  ),
  committed as (
    select
      allocation.originating_payment_claim_id,
      round(coalesce(sum(allocation.allocation_amount) filter (
        where submitted_claim.id <> p_retention_claim_id
      ), 0), 2) as submitted_allocation_from_other_claims,
      round(coalesce(sum(allocation.allocation_amount), 0), 2)
        as committed_retention_total
    from public.retention_claim_allocations allocation
    join public.retention_claims submitted_claim
      on submitted_claim.id = allocation.retention_claim_id
    where submitted_claim.status = 'submitted'
    group by allocation.originating_payment_claim_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', allocation.id,
        'organizationId', allocation.organization_id,
        'projectId', allocation.project_id,
        'retentionClaimId', allocation.retention_claim_id,
        'originatingPaymentClaimId', allocation.originating_payment_claim_id,
        'allocationSequence', allocation.allocation_sequence,
        'allocationAmount', allocation.allocation_amount,
        'draftOriginStateHash', allocation.draft_origin_state_hash,
        'draftOriginUpdatedAt', allocation.draft_origin_updated_at,
        'draftOriginRetentionOwned', allocation.draft_origin_retention_owned,
        'currentOriginStateHash',
          private.retention_claim_origin_state_hash(allocation.originating_payment_claim_id),
        'currentOriginStatus', origin.status,
        'currentOriginClaimNumber', origin.claim_number,
        'currentOriginClaimDate', origin.claim_date,
        'currentRetentionOwned', greatest(origin.retention_withheld_amount, 0),
        'currentSubmittedAllocationTotalFromOtherClaims',
          coalesce(committed.submitted_allocation_from_other_claims, 0),
        'currentCommittedRetentionTotal',
          coalesce(committed.committed_retention_total, 0),
        'currentAvailableBeforeSchedules',
          greatest(
            greatest(origin.retention_withheld_amount, 0)
            - coalesce(committed.committed_retention_total, 0),
            0
          ),
        'originStateStale',
          allocation.draft_origin_state_hash
          <> private.retention_claim_origin_state_hash(
            allocation.originating_payment_claim_id
          ),
        'originClaimNumberSnapshot', allocation.origin_claim_number_snapshot,
        'originClaimDateSnapshot', allocation.origin_claim_date_snapshot,
        'originClaimStatusSnapshot', allocation.origin_claim_status_snapshot,
        'originClaimCreatedAtSnapshot', allocation.origin_claim_created_at_snapshot,
        'originClaimUpdatedAtSnapshot', allocation.origin_claim_updated_at_snapshot,
        'retentionMethodSnapshot', allocation.retention_method_snapshot,
        'retentionRateSnapshot', allocation.retention_rate_snapshot,
        'retentionScaleBandsSnapshot', allocation.retention_scale_bands_snapshot,
        'retentionWithheldSnapshot', allocation.retention_withheld_snapshot,
        'retentionReleasedSnapshot', allocation.retention_released_snapshot,
        'retentionHeldToDateSnapshot', allocation.retention_held_to_date_snapshot,
        'retentionReleasedToDateSnapshot',
          allocation.retention_released_to_date_snapshot,
        'retentionBalanceSnapshot', allocation.retention_balance_snapshot,
        'existingSubmittedAllocationBefore',
          allocation.existing_submitted_allocation_before,
        'remainingAfterAllocation', allocation.remaining_after_allocation,
        'grossClaimAmountSnapshot', allocation.gross_claim_amount_snapshot,
        'netClaimExclGstSnapshot', allocation.net_claim_excl_gst_snapshot,
        'gstAmountSnapshot', allocation.gst_amount_snapshot,
        'totalPayableSnapshot', allocation.total_payable_snapshot,
        'projectStateHashSnapshot', allocation.project_state_hash_snapshot,
        'originStateHashSnapshot', allocation.origin_state_hash_snapshot,
        'submittedBy', allocation.submitted_by,
        'submittedAt', allocation.submitted_at,
        'createdBy', allocation.created_by,
        'createdAt', allocation.created_at,
        'updatedAt', allocation.updated_at
      )
      order by allocation.allocation_sequence, allocation.id
    ),
    '[]'::jsonb
  )
  from target_claim
  join public.retention_claim_allocations allocation
    on allocation.retention_claim_id = target_claim.id
  join public.project_claims origin
    on origin.id = allocation.originating_payment_claim_id
  left join committed
    on committed.originating_payment_claim_id = allocation.originating_payment_claim_id;
$$;

create or replace function public.create_retention_claim_draft(
  p_project_id uuid,
  p_title text default 'New Retention Claim',
  p_reference text default null,
  p_issue_date date default null,
  p_due_date date default null,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context jsonb;
  v_organization_id uuid;
  v_actor_user_id uuid;
  v_position jsonb;
  v_claim public.retention_claims%rowtype;
begin
  v_context := private.retention_claim_operation_context(
    p_project_id,
    'retention.claims.create',
    true
  );

  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    if v_context ->> 'organizationId' is not null then
      perform private.record_retention_claim_event(
        (v_context ->> 'organizationId')::uuid,
        p_project_id,
        null,
        'permission_denied',
        null,
        null,
        auth.uid(),
        v_context ->> 'errorCode',
        p_correlation_id,
        jsonb_build_object('operation', 'create_retention_claim_draft')
      );
    end if;
    return v_context;
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    return jsonb_build_object('succeeded', false, 'errorCode', 'invalid_transition');
  end if;

  if p_issue_date is not null
    and p_due_date is not null
    and p_due_date < p_issue_date then
    return jsonb_build_object('succeeded', false, 'errorCode', 'invalid_transition');
  end if;

  v_organization_id := (v_context ->> 'organizationId')::uuid;
  v_actor_user_id := (v_context ->> 'actorUserId')::uuid;
  v_position := public.get_project_retention_position_summary(p_project_id);

  insert into public.retention_claims (
    organization_id,
    project_id,
    claim_number,
    title,
    reference,
    issue_date,
    due_date,
    last_position_state_hash,
    created_by
  )
  values (
    v_organization_id,
    p_project_id,
    private.generate_retention_claim_number(v_organization_id, p_project_id),
    trim(p_title),
    nullif(trim(coalesce(p_reference, '')), ''),
    p_issue_date,
    p_due_date,
    v_position ->> 'stateHash',
    v_actor_user_id
  )
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id,
    v_claim.project_id,
    v_claim.id,
    'claim_created',
    null,
    'draft',
    v_actor_user_id,
    'Retention Claim Draft created.',
    p_correlation_id,
    jsonb_build_object(
      'claimNumber', v_claim.claim_number,
      'draftRevision', v_claim.draft_revision
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id)
  );
end;
$$;

create or replace function public.update_retention_claim_draft(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_title text,
  p_reference text,
  p_issue_date date,
  p_due_date date,
  p_refresh_position boolean default false,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
  v_position jsonb;
begin
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;

  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.claims.create',
    true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    return v_context;
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id
    and claim.organization_id = (v_context ->> 'organizationId')::uuid
  for update;

  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;
  if v_claim.status <> 'draft' then
    perform private.record_retention_claim_event(
      v_claim.organization_id, v_claim.project_id, v_claim.id,
      'invalid_transition_attempted', v_claim.status, v_claim.status, auth.uid(),
      'claim_not_draft', p_correlation_id,
      jsonb_build_object('operation', 'update_retention_claim_draft')
    );
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_draft');
  end if;
  if v_claim.draft_revision <> p_expected_draft_revision then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'concurrent_update',
      'currentDraftRevision', v_claim.draft_revision
    );
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null
    or (
      p_issue_date is not null
      and p_due_date is not null
      and p_due_date < p_issue_date
    ) then
    return jsonb_build_object('succeeded', false, 'errorCode', 'invalid_transition');
  end if;

  if p_refresh_position then
    v_position := public.get_project_retention_position_summary(v_claim.project_id);
  end if;

  update public.retention_claims claim
  set
    title = trim(p_title),
    reference = nullif(trim(coalesce(p_reference, '')), ''),
    issue_date = p_issue_date,
    due_date = p_due_date,
    last_position_state_hash = case
      when p_refresh_position then v_position ->> 'stateHash'
      else claim.last_position_state_hash
    end,
    draft_revision = claim.draft_revision + 1
  where claim.id = v_claim.id
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id, v_claim.project_id, v_claim.id,
    'draft_updated', 'draft', 'draft', auth.uid(),
    'Retention Claim Draft updated.', p_correlation_id,
    jsonb_build_object(
      'draftRevision', v_claim.draft_revision,
      'positionRefreshed', p_refresh_position
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id)
  );
end;
$$;

create or replace function public.add_retention_claim_allocation(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_originating_payment_claim_id uuid,
  p_allocation_amount numeric,
  p_allocation_sequence integer default null,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_origin public.project_claims%rowtype;
  v_context jsonb;
  v_allocation public.retention_claim_allocations%rowtype;
  v_sequence integer;
begin
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.claims.create',
    true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    return v_context;
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id
    and claim.organization_id = (v_context ->> 'organizationId')::uuid
  for update;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;
  if v_claim.status <> 'draft' then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_draft');
  end if;
  if v_claim.draft_revision <> p_expected_draft_revision then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'concurrent_update',
      'currentDraftRevision', v_claim.draft_revision
    );
  end if;
  if p_allocation_amount is null or round(p_allocation_amount, 2) <= 0 then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'invalid_allocation_amount'
    );
  end if;

  select * into v_origin
  from public.project_claims origin
  where origin.id = p_originating_payment_claim_id
    and origin.organization_id = v_claim.organization_id;

  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'origin_not_found');
  end if;
  if v_origin.project_id <> v_claim.project_id then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'cross_project_origin'
    );
  end if;
  if v_origin.status = 'Cancelled' then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'origin_cancelled'
    );
  end if;
  if round(p_allocation_amount, 2) > greatest(v_origin.retention_withheld_amount, 0) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'invalid_allocation_amount',
      'currentRetentionOwned', greatest(v_origin.retention_withheld_amount, 0)
    );
  end if;
  if exists (
    select 1
    from public.retention_claim_allocations allocation
    where allocation.retention_claim_id = v_claim.id
      and allocation.originating_payment_claim_id = v_origin.id
  ) then
    return jsonb_build_object('succeeded', false, 'errorCode', 'duplicate_origin');
  end if;

  if p_allocation_sequence is null then
    select coalesce(max(allocation.allocation_sequence), 0) + 1
    into v_sequence
    from public.retention_claim_allocations allocation
    where allocation.retention_claim_id = v_claim.id;
  else
    v_sequence := p_allocation_sequence;
  end if;

  if v_sequence <= 0 or exists (
    select 1
    from public.retention_claim_allocations allocation
    where allocation.retention_claim_id = v_claim.id
      and allocation.allocation_sequence = v_sequence
  ) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'invalid_allocation_order'
    );
  end if;

  insert into public.retention_claim_allocations (
    organization_id,
    project_id,
    retention_claim_id,
    originating_payment_claim_id,
    allocation_sequence,
    allocation_amount,
    draft_origin_state_hash,
    draft_origin_updated_at,
    draft_origin_retention_owned,
    created_by
  )
  values (
    v_claim.organization_id,
    v_claim.project_id,
    v_claim.id,
    v_origin.id,
    v_sequence,
    round(p_allocation_amount, 2),
    private.retention_claim_origin_state_hash(v_origin.id),
    v_origin.updated_at,
    greatest(v_origin.retention_withheld_amount, 0),
    auth.uid()
  )
  returning * into v_allocation;

  update public.retention_claims claim
  set draft_revision = claim.draft_revision + 1
  where claim.id = v_claim.id
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id, v_claim.project_id, v_claim.id,
    'allocation_added', 'draft', 'draft', auth.uid(),
    'Retention Claim allocation added.', p_correlation_id,
    jsonb_build_object(
      'allocationId', v_allocation.id,
      'originatingPaymentClaimId', v_origin.id,
      'allocationAmount', v_allocation.allocation_amount,
      'allocationSequence', v_allocation.allocation_sequence,
      'draftRevision', v_claim.draft_revision
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id),
    'allocationId', v_allocation.id
  );
end;
$$;

create or replace function public.update_retention_claim_allocation(
  p_allocation_id uuid,
  p_expected_draft_revision bigint,
  p_allocation_amount numeric,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.retention_claim_allocations%rowtype;
  v_claim public.retention_claims%rowtype;
  v_origin public.project_claims%rowtype;
  v_context jsonb;
begin
  select * into v_allocation
  from public.retention_claim_allocations allocation
  where allocation.id = p_allocation_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = v_allocation.retention_claim_id;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.claims.create',
    true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    return v_context;
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = v_allocation.retention_claim_id
    and claim.organization_id = (v_context ->> 'organizationId')::uuid
  for update;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;
  if v_claim.status <> 'draft' then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_draft');
  end if;
  if v_claim.draft_revision <> p_expected_draft_revision then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'concurrent_update',
      'currentDraftRevision', v_claim.draft_revision
    );
  end if;
  if p_allocation_amount is null or round(p_allocation_amount, 2) <= 0 then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'invalid_allocation_amount'
    );
  end if;

  select * into v_origin
  from public.project_claims origin
  where origin.id = v_allocation.originating_payment_claim_id
    and origin.organization_id = v_claim.organization_id
    and origin.project_id = v_claim.project_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'origin_not_found');
  end if;
  if v_origin.status = 'Cancelled' then
    return jsonb_build_object('succeeded', false, 'errorCode', 'origin_cancelled');
  end if;
  if round(p_allocation_amount, 2) > greatest(v_origin.retention_withheld_amount, 0) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'invalid_allocation_amount',
      'currentRetentionOwned', greatest(v_origin.retention_withheld_amount, 0)
    );
  end if;

  update public.retention_claim_allocations allocation
  set
    allocation_amount = round(p_allocation_amount, 2),
    draft_origin_state_hash =
      private.retention_claim_origin_state_hash(v_origin.id),
    draft_origin_updated_at = v_origin.updated_at,
    draft_origin_retention_owned =
      greatest(v_origin.retention_withheld_amount, 0)
  where allocation.id = v_allocation.id
  returning * into v_allocation;

  update public.retention_claims claim
  set draft_revision = claim.draft_revision + 1
  where claim.id = v_claim.id
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id, v_claim.project_id, v_claim.id,
    'allocation_updated', 'draft', 'draft', auth.uid(),
    'Retention Claim allocation updated.', p_correlation_id,
    jsonb_build_object(
      'allocationId', v_allocation.id,
      'allocationAmount', v_allocation.allocation_amount,
      'draftRevision', v_claim.draft_revision
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id),
    'allocationId', v_allocation.id
  );
end;
$$;

create or replace function public.remove_retention_claim_allocation(
  p_allocation_id uuid,
  p_expected_draft_revision bigint,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.retention_claim_allocations%rowtype;
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
begin
  select * into v_allocation
  from public.retention_claim_allocations allocation
  where allocation.id = p_allocation_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = v_allocation.retention_claim_id;
  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.claims.create',
    true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    return v_context;
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = v_allocation.retention_claim_id
    and claim.organization_id = (v_context ->> 'organizationId')::uuid
  for update;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;
  if v_claim.status <> 'draft' then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_draft');
  end if;
  if v_claim.draft_revision <> p_expected_draft_revision then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'concurrent_update',
      'currentDraftRevision', v_claim.draft_revision
    );
  end if;

  delete from public.retention_claim_allocations allocation
  where allocation.id = v_allocation.id;

  update public.retention_claims claim
  set draft_revision = claim.draft_revision + 1
  where claim.id = v_claim.id
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id, v_claim.project_id, v_claim.id,
    'allocation_removed', 'draft', 'draft', auth.uid(),
    'Retention Claim allocation removed.', p_correlation_id,
    jsonb_build_object(
      'allocationId', v_allocation.id,
      'originatingPaymentClaimId', v_allocation.originating_payment_claim_id,
      'allocationAmount', v_allocation.allocation_amount,
      'draftRevision', v_claim.draft_revision
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id)
  );
end;
$$;

create or replace function public.reorder_retention_claim_allocations(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_allocation_ids uuid[],
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
  v_existing_count integer;
begin
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.claims.create',
    true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    return v_context;
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id
    and claim.organization_id = (v_context ->> 'organizationId')::uuid
  for update;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;
  if v_claim.status <> 'draft' then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_draft');
  end if;
  if v_claim.draft_revision <> p_expected_draft_revision then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'concurrent_update',
      'currentDraftRevision', v_claim.draft_revision
    );
  end if;

  select count(*)::integer into v_existing_count
  from public.retention_claim_allocations allocation
  where allocation.retention_claim_id = v_claim.id;

  if coalesce(cardinality(p_allocation_ids), 0) <> v_existing_count
    or (
      select count(distinct allocation_id)
      from unnest(coalesce(p_allocation_ids, '{}'::uuid[])) allocation_id
    ) <> v_existing_count
    or exists (
      select 1
      from unnest(coalesce(p_allocation_ids, '{}'::uuid[])) allocation_id
      where not exists (
        select 1
        from public.retention_claim_allocations allocation
        where allocation.id = allocation_id
          and allocation.retention_claim_id = v_claim.id
      )
    ) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'invalid_allocation_order'
    );
  end if;

  set constraints retention_claim_allocations_sequence_unique deferred;

  update public.retention_claim_allocations allocation
  set allocation_sequence = array_position(p_allocation_ids, allocation.id)
  where allocation.retention_claim_id = v_claim.id;

  update public.retention_claims claim
  set draft_revision = claim.draft_revision + 1
  where claim.id = v_claim.id
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id, v_claim.project_id, v_claim.id,
    'draft_updated', 'draft', 'draft', auth.uid(),
    'Retention Claim allocations reordered.', p_correlation_id,
    jsonb_build_object(
      'operation', 'reorder_allocations',
      'draftRevision', v_claim.draft_revision,
      'allocationCount', v_existing_count
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id),
    'allocations', private.retention_claim_current_origin_details(v_claim.id)
  );
end;
$$;

create or replace function private.reject_retention_claim_submission(
  p_retention_claim_id uuid,
  p_error_code text,
  p_details jsonb,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.retention_claims%rowtype;
begin
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;

  if found then
    perform private.record_retention_claim_event(
      v_claim.organization_id,
      v_claim.project_id,
      v_claim.id,
      case
        when p_error_code in ('claim_not_draft', 'invalid_transition')
          then 'invalid_transition_attempted'
        else 'submission_rejected'
      end,
      v_claim.status,
      v_claim.status,
      auth.uid(),
      p_error_code,
      p_correlation_id,
      coalesce(p_details, '{}'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'succeeded', false,
    'errorCode', p_error_code,
    'details', coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

create or replace function public.cancel_retention_claim_draft(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_reason text,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
  v_allocation_count integer;
  v_allocation_total numeric;
begin
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.claims.create',
    true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    return v_context;
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id
    and claim.organization_id = (v_context ->> 'organizationId')::uuid
  for update;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;
  if v_claim.status <> 'draft' then
    return private.reject_retention_claim_submission(
      v_claim.id,
      'claim_not_draft',
      jsonb_build_object('operation', 'cancel_retention_claim_draft'),
      p_correlation_id
    );
  end if;
  if v_claim.draft_revision <> p_expected_draft_revision then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'concurrent_update',
      'currentDraftRevision', v_claim.draft_revision
    );
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('succeeded', false, 'errorCode', 'invalid_transition');
  end if;

  select count(*)::integer, round(coalesce(sum(allocation_amount), 0), 2)
  into v_allocation_count, v_allocation_total
  from public.retention_claim_allocations allocation
  where allocation.retention_claim_id = v_claim.id;

  delete from public.retention_claim_allocations allocation
  where allocation.retention_claim_id = v_claim.id;

  update public.retention_claims claim
  set
    status = 'cancelled_draft',
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    draft_revision = claim.draft_revision + 1
  where claim.id = v_claim.id
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id, v_claim.project_id, v_claim.id,
    'draft_cancelled', 'draft', 'cancelled_draft', auth.uid(),
    trim(p_reason), p_correlation_id,
    jsonb_build_object(
      'removedDraftAllocationCount', v_allocation_count,
      'removedDraftAllocationTotal', v_allocation_total,
      'draftRevision', v_claim.draft_revision
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id)
  );
end;
$$;

create or replace function public.submit_retention_claim(
  p_retention_claim_id uuid,
  p_expected_draft_revision bigint,
  p_expected_position_state_hash text,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
  v_position jsonb;
  v_current_state_hash text;
  v_allocation_count integer;
  v_subtotal numeric(14,2);
  v_invalid_details jsonb;
  v_overallocated_details jsonb;
begin
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.claims.submit',
    true
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    if (v_context ->> 'organizationId')::uuid is not distinct from v_claim.organization_id then
      perform private.record_retention_claim_event(
        v_claim.organization_id, v_claim.project_id, v_claim.id,
        'permission_denied', v_claim.status, v_claim.status, auth.uid(),
        v_context ->> 'errorCode', p_correlation_id,
        jsonb_build_object('operation', 'submit_retention_claim')
      );
    end if;
    return v_context;
  end if;

  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id
    and claim.organization_id = (v_context ->> 'organizationId')::uuid
  for update;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;
  if v_claim.status <> 'draft' then
    return private.reject_retention_claim_submission(
      v_claim.id,
      case
        when v_claim.status = 'submitted' then 'submitted_claim_immutable'
        else 'claim_not_draft'
      end,
      jsonb_build_object('status', v_claim.status),
      p_correlation_id
    );
  end if;
  if v_claim.draft_revision <> p_expected_draft_revision then
    return private.reject_retention_claim_submission(
      v_claim.id,
      'concurrent_update',
      jsonb_build_object('currentDraftRevision', v_claim.draft_revision),
      p_correlation_id
    );
  end if;

  select count(*)::integer, round(coalesce(sum(allocation_amount), 0), 2)
  into v_allocation_count, v_subtotal
  from public.retention_claim_allocations allocation
  where allocation.retention_claim_id = v_claim.id;

  if v_allocation_count = 0 then
    return private.reject_retention_claim_submission(
      v_claim.id,
      'invalid_allocation_amount',
      jsonb_build_object('reason', 'allocation_required'),
      p_correlation_id
    );
  end if;

  -- Origin Payment Claim locks are acquired deterministically. They serialize
  -- competing submissions without invoking any Payment Claim workflow.
  perform origin.id
  from public.project_claims origin
  join public.retention_claim_allocations allocation
    on allocation.originating_payment_claim_id = origin.id
  where allocation.retention_claim_id = v_claim.id
    and origin.organization_id = v_claim.organization_id
    and origin.project_id = v_claim.project_id
  order by origin.id
  for update of origin;

  select jsonb_agg(
    jsonb_build_object(
      'allocationId', allocation.id,
      'originatingPaymentClaimId', allocation.originating_payment_claim_id,
      'errorCode',
        case
          when origin.id is null then 'origin_not_found'
          when origin.organization_id <> v_claim.organization_id
            or origin.project_id <> v_claim.project_id then 'cross_project_origin'
          when origin.status = 'Cancelled' then 'origin_cancelled'
          when allocation.allocation_amount <= 0 then 'invalid_allocation_amount'
          else null
        end
    )
    order by allocation.originating_payment_claim_id
  ) filter (
    where origin.id is null
      or origin.organization_id <> v_claim.organization_id
      or origin.project_id <> v_claim.project_id
      or origin.status = 'Cancelled'
      or allocation.allocation_amount <= 0
  )
  into v_invalid_details
  from public.retention_claim_allocations allocation
  left join public.project_claims origin
    on origin.id = allocation.originating_payment_claim_id
  where allocation.retention_claim_id = v_claim.id;

  if v_invalid_details is not null then
    return private.reject_retention_claim_submission(
      v_claim.id,
      coalesce(v_invalid_details -> 0 ->> 'errorCode', 'origin_not_found'),
      jsonb_build_object('origins', v_invalid_details),
      p_correlation_id
    );
  end if;

  v_position := public.get_project_retention_position_summary(v_claim.project_id);
  v_current_state_hash := v_position ->> 'stateHash';

  if coalesce(v_position ->> 'accessState', '') <> 'available' then
    return private.reject_retention_claim_submission(
      v_claim.id,
      case
        when coalesce((v_position ->> 'capabilityEnabled')::boolean, false)
          then 'project_mode_not_supported'
        else 'capability_disabled'
      end,
      jsonb_build_object(
        'accessState', v_position ->> 'accessState',
        'workflowMode', v_position ->> 'workflowMode'
      ),
      p_correlation_id
    );
  end if;

  if p_expected_position_state_hash is null
    or p_expected_position_state_hash <> v_current_state_hash
    or v_claim.last_position_state_hash <> v_current_state_hash then
    return private.reject_retention_claim_submission(
      v_claim.id,
      'stale_draft',
      jsonb_build_object(
        'draftPositionStateHash', v_claim.last_position_state_hash,
        'expectedPositionStateHash', p_expected_position_state_hash,
        'currentPositionStateHash', v_current_state_hash,
        'origins', private.retention_claim_current_origin_details(v_claim.id)
      ),
      p_correlation_id
    );
  end if;

  if coalesce(
    (v_position ->> 'legacyReconciliationRequired')::boolean,
    false
  ) then
    return private.reject_retention_claim_submission(
      v_claim.id,
      'unresolved_legacy_release',
      jsonb_build_object(
        'totalLegacyRetentionReleased',
          v_position -> 'totalLegacyRetentionReleased',
        'legacyReleaseOrigins', v_position -> 'legacyReleaseOrigins'
      ),
      p_correlation_id
    );
  end if;

  with committed as (
    select
      existing.originating_payment_claim_id,
      round(coalesce(sum(existing.allocation_amount), 0), 2)
        as submitted_total
    from public.retention_claim_allocations existing
    join public.retention_claims submitted_claim
      on submitted_claim.id = existing.retention_claim_id
    where submitted_claim.status = 'submitted'
      and submitted_claim.id <> v_claim.id
    group by existing.originating_payment_claim_id
  )
  select jsonb_agg(
    jsonb_build_object(
      'originatingPaymentClaimId', origin.id,
      'currentRetentionOwned', greatest(origin.retention_withheld_amount, 0),
      'existingSubmittedAllocation',
        coalesce(committed.submitted_total, 0),
      'proposedAllocation', allocation.allocation_amount,
      'currentAvailableBeforeSchedules',
        greatest(
          greatest(origin.retention_withheld_amount, 0)
          - coalesce(committed.submitted_total, 0),
          0
        )
    )
    order by origin.id
  )
  into v_overallocated_details
  from public.retention_claim_allocations allocation
  join public.project_claims origin
    on origin.id = allocation.originating_payment_claim_id
  left join committed
    on committed.originating_payment_claim_id = origin.id
  where allocation.retention_claim_id = v_claim.id
    and coalesce(committed.submitted_total, 0) + allocation.allocation_amount
      > greatest(origin.retention_withheld_amount, 0);

  if v_overallocated_details is not null then
    return private.reject_retention_claim_submission(
      v_claim.id,
      'retention_overallocated',
      jsonb_build_object('origins', v_overallocated_details),
      p_correlation_id
    );
  end if;

  with committed as (
    select
      existing.originating_payment_claim_id,
      round(coalesce(sum(existing.allocation_amount), 0), 2)
        as submitted_total
    from public.retention_claim_allocations existing
    join public.retention_claims submitted_claim
      on submitted_claim.id = existing.retention_claim_id
    where submitted_claim.status = 'submitted'
      and submitted_claim.id <> v_claim.id
    group by existing.originating_payment_claim_id
  )
  update public.retention_claim_allocations allocation
  set
    origin_claim_number_snapshot = origin.claim_number,
    origin_claim_date_snapshot = origin.claim_date,
    origin_claim_status_snapshot = origin.status,
    origin_claim_created_at_snapshot = origin.created_at,
    origin_claim_updated_at_snapshot = origin.updated_at,
    retention_method_snapshot = origin.retention_method,
    retention_rate_snapshot = origin.retention_percent,
    retention_scale_bands_snapshot = origin.retention_scale_bands,
    retention_withheld_snapshot = origin.retention_withheld_amount,
    retention_released_snapshot = origin.retention_released_amount,
    retention_held_to_date_snapshot = origin.retention_held_to_date,
    retention_released_to_date_snapshot = origin.retention_released_to_date,
    retention_balance_snapshot = origin.retention_balance,
    existing_submitted_allocation_before =
      coalesce(committed.submitted_total, 0),
    remaining_after_allocation = round(
      greatest(origin.retention_withheld_amount, 0)
      - coalesce(committed.submitted_total, 0)
      - allocation.allocation_amount,
      2
    ),
    gross_claim_amount_snapshot = origin.claim_amount,
    net_claim_excl_gst_snapshot = origin.net_claim_excl_gst,
    gst_amount_snapshot = origin.gst_amount,
    total_payable_snapshot = origin.total_payable,
    project_state_hash_snapshot = v_current_state_hash,
    origin_state_hash_snapshot =
      private.retention_claim_origin_state_hash(origin.id),
    submitted_by = auth.uid(),
    submitted_at = now()
  from public.project_claims origin
  left join committed
    on committed.originating_payment_claim_id = origin.id
  where allocation.retention_claim_id = v_claim.id
    and origin.id = allocation.originating_payment_claim_id;

  update public.retention_claims claim
  set
    status = 'submitted',
    subtotal_excl_tax = v_subtotal,
    submission_state_hash = v_current_state_hash,
    submitted_by = auth.uid(),
    submitted_at = now()
  where claim.id = v_claim.id
  returning * into v_claim;

  perform private.record_retention_claim_event(
    v_claim.organization_id, v_claim.project_id, v_claim.id,
    'claim_submitted', 'draft', 'submitted', auth.uid(),
    'Retention Claim submitted.', p_correlation_id,
    jsonb_build_object(
      'allocationCount', v_allocation_count,
      'subtotalExclTax', v_subtotal,
      'submissionStateHash', v_current_state_hash,
      'draftRevision', v_claim.draft_revision
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id),
    'allocations', private.retention_claim_current_origin_details(v_claim.id)
  );
end;
$$;

create or replace function public.get_retention_claim(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
  v_position jsonb;
begin
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.view',
    false
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false)
    or (v_context ->> 'organizationId')::uuid is distinct from v_claim.organization_id then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode',
        case
          when v_context ->> 'errorCode' in (
            'capability_disabled',
            'project_mode_not_supported',
            'permission_denied'
          ) then v_context ->> 'errorCode'
          else 'claim_not_found'
        end
    );
  end if;

  v_position := public.get_project_retention_position_summary(v_claim.project_id);

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', private.retention_claim_header_json(v_claim.id),
    'allocations', private.retention_claim_current_origin_details(v_claim.id),
    'currentPosition', v_position,
    'positionStateStale',
      v_claim.last_position_state_hash is distinct from (v_position ->> 'stateHash')
  );
end;
$$;

create or replace function public.list_project_retention_claims(
  p_project_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_context jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_rows jsonb;
  v_has_more boolean;
  v_cursor jsonb;
begin
  v_context := private.retention_claim_operation_context(
    p_project_id,
    'retention.view',
    false
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false) then
    return v_context || jsonb_build_object('claims', '[]'::jsonb, 'hasMore', false);
  end if;

  with filtered as (
    select claim.*
    from public.retention_claims claim
    where claim.organization_id = (v_context ->> 'organizationId')::uuid
      and claim.project_id = p_project_id
      and (
        p_before_id is null
        or claim.created_at < p_before_created_at
        or (
          claim.created_at = p_before_created_at
          and claim.id < p_before_id
        )
      )
    order by claim.created_at desc, claim.id desc
    limit v_limit + 1
  ),
  page as (
    select *
    from filtered
    order by created_at desc, id desc
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        private.retention_claim_header_json(page.id)
        order by page.created_at desc, page.id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from filtered),
    (
      select jsonb_build_object(
        'createdAt', last_claim.created_at,
        'id', last_claim.id
      )
      from (
        select *
        from page
        order by created_at asc, id asc
        limit 1
      ) last_claim
    )
  into v_rows, v_has_more, v_cursor
  from page;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claims', v_rows,
    'hasMore', v_has_more,
    'nextCursor', case when v_has_more then v_cursor else null end
  );
end;
$$;

create or replace function public.get_retention_claim_events(
  p_retention_claim_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_claim public.retention_claims%rowtype;
  v_context jsonb;
  v_events jsonb;
begin
  select * into v_claim
  from public.retention_claims claim
  where claim.id = p_retention_claim_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  v_context := private.retention_claim_operation_context(
    v_claim.project_id,
    'retention.view',
    false
  );
  if not coalesce((v_context ->> 'succeeded')::boolean, false)
    or (v_context ->> 'organizationId')::uuid is distinct from v_claim.organization_id then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'organizationId', event.organization_id,
        'projectId', event.project_id,
        'retentionClaimId', event.retention_claim_id,
        'eventType', event.event_type,
        'previousStatus', event.previous_status,
        'newStatus', event.new_status,
        'actorUserId', event.actor_user_id,
        'reason', event.reason,
        'correlationId', event.correlation_id,
        'metadata', event.metadata,
        'occurredAt', event.occurred_at
      )
      order by event.occurred_at, event.id
    ),
    '[]'::jsonb
  )
  into v_events
  from (
    select *
    from public.retention_claim_events event
    where event.retention_claim_id = v_claim.id
    order by event.occurred_at desc, event.id desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) event;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'events', v_events
  );
end;
$$;

alter table public.project_retention_claim_counters enable row level security;
alter table public.project_retention_claim_counters force row level security;
alter table public.retention_claims enable row level security;
alter table public.retention_claims force row level security;
alter table public.retention_claim_allocations enable row level security;
alter table public.retention_claim_allocations force row level security;
alter table public.retention_claim_events enable row level security;
alter table public.retention_claim_events force row level security;

create policy "Retention viewers can read Retention Claims"
on public.retention_claims
for select
to authenticated
using (public.has_org_permission(organization_id, 'retention.view'));

create policy "Retention viewers can read Retention Claim allocations"
on public.retention_claim_allocations
for select
to authenticated
using (public.has_org_permission(organization_id, 'retention.view'));

create policy "Retention viewers can read Retention Claim events"
on public.retention_claim_events
for select
to authenticated
using (public.has_org_permission(organization_id, 'retention.view'));

revoke all on public.project_retention_claim_counters
  from public, anon, authenticated;
revoke all on public.retention_claims from public, anon, authenticated;
revoke all on public.retention_claim_allocations from public, anon, authenticated;
revoke all on public.retention_claim_events from public, anon, authenticated;

revoke all on public.project_retention_claim_counters from service_role;
grant select on public.retention_claims to service_role;
grant select on public.retention_claim_allocations to service_role;
grant select on public.retention_claim_events to service_role;

revoke all on function private.retention_claim_phase3_gate_enabled()
  from public, anon, authenticated;
revoke all on function private.retention_claim_origin_state_hash(uuid)
  from public, anon, authenticated;
revoke all on function private.generate_retention_claim_number(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.record_retention_claim_event(
  uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb
) from public, anon, authenticated;
revoke all on function private.retention_claim_operation_context(uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function private.retention_claim_header_json(uuid)
  from public, anon, authenticated;
revoke all on function private.retention_claim_current_origin_details(uuid)
  from public, anon, authenticated;
revoke all on function private.reject_retention_claim_submission(uuid, text, jsonb, text)
  from public, anon, authenticated;

revoke all on function public.prevent_retention_claim_event_mutation()
  from public, anon, authenticated;
revoke all on function public.protect_retention_claim_mutation()
  from public, anon, authenticated;
revoke all on function public.protect_retention_claim_allocation_mutation()
  from public, anon, authenticated;

revoke all on function public.create_retention_claim_draft(
  uuid, text, text, date, date, text
) from public, anon;
grant execute on function public.create_retention_claim_draft(
  uuid, text, text, date, date, text
) to authenticated;

revoke all on function public.update_retention_claim_draft(
  uuid, bigint, text, text, date, date, boolean, text
) from public, anon;
grant execute on function public.update_retention_claim_draft(
  uuid, bigint, text, text, date, date, boolean, text
) to authenticated;

revoke all on function public.add_retention_claim_allocation(
  uuid, bigint, uuid, numeric, integer, text
) from public, anon;
grant execute on function public.add_retention_claim_allocation(
  uuid, bigint, uuid, numeric, integer, text
) to authenticated;

revoke all on function public.update_retention_claim_allocation(
  uuid, bigint, numeric, text
) from public, anon;
grant execute on function public.update_retention_claim_allocation(
  uuid, bigint, numeric, text
) to authenticated;

revoke all on function public.remove_retention_claim_allocation(
  uuid, bigint, text
) from public, anon;
grant execute on function public.remove_retention_claim_allocation(
  uuid, bigint, text
) to authenticated;

revoke all on function public.reorder_retention_claim_allocations(
  uuid, bigint, uuid[], text
) from public, anon;
grant execute on function public.reorder_retention_claim_allocations(
  uuid, bigint, uuid[], text
) to authenticated;

revoke all on function public.cancel_retention_claim_draft(
  uuid, bigint, text, text
) from public, anon;
grant execute on function public.cancel_retention_claim_draft(
  uuid, bigint, text, text
) to authenticated;

revoke all on function public.submit_retention_claim(
  uuid, bigint, text, text
) from public, anon;
grant execute on function public.submit_retention_claim(
  uuid, bigint, text, text
) to authenticated;

revoke all on function public.get_retention_claim(uuid)
  from public, anon;
grant execute on function public.get_retention_claim(uuid)
  to authenticated;

revoke all on function public.list_project_retention_claims(
  uuid, integer, timestamptz, uuid
) from public, anon;
grant execute on function public.list_project_retention_claims(
  uuid, integer, timestamptz, uuid
) to authenticated;

revoke all on function public.get_retention_claim_events(uuid, integer)
  from public, anon;
grant execute on function public.get_retention_claim_events(uuid, integer)
  to authenticated;

commit;
