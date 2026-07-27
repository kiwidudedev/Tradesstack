begin;

-- Phase 4 adds contractual eligibility and operational reminders. Payment Claims
-- remain the retention authority and are read-only to every function in this file.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- The application/settings contract and generated types already expose this
-- field, but the clean migration chain does not currently create it.
alter table public.organizations
  add column if not exists timezone text not null default 'Pacific/Auckland';

alter table public.retention_claims
  add column last_eligibility_state_hash text null,
  add column submission_eligibility_state_hash text null;

alter table public.retention_claims
  add constraint retention_claims_last_eligibility_hash_shape
    check (
      last_eligibility_state_hash is null
      or last_eligibility_state_hash ~ '^[a-f0-9]{64}$'
    ),
  add constraint retention_claims_submission_eligibility_hash_shape
    check (
      submission_eligibility_state_hash is null
      or submission_eligibility_state_hash ~ '^[a-f0-9]{64}$'
    );

alter table public.retention_claim_allocations
  add column eligibility_state_hash_snapshot text null,
  add column eligibility_schedule_ids_snapshot uuid[] null;

alter table public.retention_claim_allocations
  add constraint retention_claim_allocations_eligibility_hash_shape
    check (
      eligibility_state_hash_snapshot is null
      or eligibility_state_hash_snapshot ~ '^[a-f0-9]{64}$'
    );

create table public.project_retention_release_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null,
  schedule_sequence integer not null,
  status text not null default 'draft',
  revision bigint not null default 1,
  trigger_type text not null,
  entitlement_method text not null,
  percentage_bps integer null,
  fixed_amount numeric(14,2) null,
  cap_amount numeric(14,2) null,
  scope_policy text not null default 'explicit',
  scheduled_trigger_date date null,
  actual_trigger_date date null,
  delay_days integer not null default 0,
  eligibility_date date null,
  confirmation_required boolean not null default true,
  trigger_confirmed_at timestamptz null,
  trigger_confirmed_by uuid null references auth.users(id) on delete restrict,
  trigger_confirmation_reason text null,
  trigger_confirmation_evidence jsonb null,
  activated_at timestamptz null,
  activated_by uuid null references auth.users(id) on delete restrict,
  activation_position_state_hash text null,
  activation_eligibility_state_hash text null,
  activation_evidence jsonb null,
  reminder_rules jsonb not null default
    '[{"type":"eligibility_due","offsetDays":0,"recurrence":"none"},{"type":"overdue_unclaimed","offsetDays":7,"recurrence":"weekly"}]'::jsonb,
  replaces_schedule_id uuid null,
  cancelled_at timestamptz null,
  cancelled_by uuid null references auth.users(id) on delete restrict,
  cancellation_reason text null,
  completed_at timestamptz null,
  completed_by uuid null references auth.users(id) on delete restrict,
  completion_reason text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_retention_release_schedules_identity_unique
    unique (organization_id, project_id, id),
  constraint project_retention_release_schedules_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects(organization_id, id)
    on delete restrict,
  constraint project_retention_release_schedules_replacement_fkey
    foreign key (organization_id, project_id, replaces_schedule_id)
    references public.project_retention_release_schedules(organization_id, project_id, id)
    on delete restrict,
  constraint project_retention_release_schedules_name_check
    check (char_length(trim(name)) between 1 and 250),
  constraint project_retention_release_schedules_sequence_unique
    unique (project_id, schedule_sequence),
  constraint project_retention_release_schedules_sequence_positive
    check (schedule_sequence > 0),
  constraint project_retention_release_schedules_status_check
    check (status in ('draft','scheduled','awaiting_confirmation','activated','completed','cancelled')),
  constraint project_retention_release_schedules_revision_positive
    check (revision > 0),
  constraint project_retention_release_schedules_trigger_check
    check (trigger_type in (
      'practical_completion','defects_liability_expiry','fixed_date','manual_milestone','custom'
    )),
  constraint project_retention_release_schedules_method_check
    check (entitlement_method in ('percentage','fixed_amount')),
  constraint project_retention_release_schedules_method_values_check
    check (
      (
        entitlement_method = 'percentage'
        and percentage_bps between 1 and 10000
        and fixed_amount is null
      )
      or (
        entitlement_method = 'fixed_amount'
        and percentage_bps is null
        and fixed_amount > 0
      )
    ),
  constraint project_retention_release_schedules_cap_check
    check (cap_amount is null or cap_amount > 0),
  constraint project_retention_release_schedules_scope_check
    check (scope_policy in ('explicit','all_current_origins')),
  constraint project_retention_release_schedules_delay_check
    check (delay_days between 0 and 36500),
  constraint project_retention_release_schedules_hash_shapes
    check (
      (activation_position_state_hash is null or activation_position_state_hash ~ '^[a-f0-9]{64}$')
      and (activation_eligibility_state_hash is null or activation_eligibility_state_hash ~ '^[a-f0-9]{64}$')
    ),
  constraint project_retention_release_schedules_evidence_shapes
    check (
      (trigger_confirmation_evidence is null or jsonb_typeof(trigger_confirmation_evidence) = 'object')
      and (activation_evidence is null or jsonb_typeof(activation_evidence) = 'object')
      and jsonb_typeof(reminder_rules) = 'array'
    ),
  constraint project_retention_release_schedules_actor_pairs
    check (
      (trigger_confirmed_at is null) = (trigger_confirmed_by is null)
      and (activated_at is null) = (activated_by is null)
      and (cancelled_at is null) = (cancelled_by is null)
      and (completed_at is null) = (completed_by is null)
    )
);

create table public.project_retention_schedule_origins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  schedule_id uuid not null,
  originating_payment_claim_id uuid not null,
  origin_sequence integer not null,
  percentage_bps_override integer null,
  fixed_amount_override numeric(14,2) null,
  cap_amount numeric(14,2) null,
  activated_entitlement_amount numeric(14,2) null,
  activation_claim_number_snapshot text null,
  activation_claim_date_snapshot date null,
  activation_claim_status_snapshot text null,
  activation_claim_created_at_snapshot timestamptz null,
  activation_claim_updated_at_snapshot timestamptz null,
  activation_retention_owned_snapshot numeric(14,2) null,
  activation_origin_state_hash text null,
  activation_position_state_hash text null,
  activation_evidence jsonb null,
  activated_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_retention_schedule_origins_parent_fkey
    foreign key (organization_id, project_id, schedule_id)
    references public.project_retention_release_schedules(organization_id, project_id, id)
    on delete cascade,
  constraint project_retention_schedule_origins_origin_fkey
    foreign key (organization_id, project_id, originating_payment_claim_id)
    references public.project_claims(organization_id, project_id, id)
    on delete restrict,
  constraint project_retention_schedule_origins_origin_unique
    unique (schedule_id, originating_payment_claim_id),
  constraint project_retention_schedule_origins_sequence_unique
    unique (schedule_id, origin_sequence) deferrable initially immediate,
  constraint project_retention_schedule_origins_sequence_positive
    check (origin_sequence > 0),
  constraint project_retention_schedule_origins_percentage_check
    check (percentage_bps_override is null or percentage_bps_override between 1 and 10000),
  constraint project_retention_schedule_origins_fixed_check
    check (fixed_amount_override is null or fixed_amount_override > 0),
  constraint project_retention_schedule_origins_cap_check
    check (cap_amount is null or cap_amount > 0),
  constraint project_retention_schedule_origins_entitlement_check
    check (activated_entitlement_amount is null or activated_entitlement_amount >= 0),
  constraint project_retention_schedule_origins_hash_shapes
    check (
      (activation_origin_state_hash is null or activation_origin_state_hash ~ '^[a-f0-9]{64}$')
      and (activation_position_state_hash is null or activation_position_state_hash ~ '^[a-f0-9]{64}$')
    ),
  constraint project_retention_schedule_origins_evidence_shape
    check (activation_evidence is null or jsonb_typeof(activation_evidence) = 'object')
);

create table public.retention_schedule_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  schedule_id uuid null,
  event_type text not null,
  previous_status text null,
  new_status text null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  reason text not null,
  correlation_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_schedule_events_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects(organization_id, id) on delete restrict,
  constraint retention_schedule_events_schedule_fkey
    foreign key (organization_id, project_id, schedule_id)
    references public.project_retention_release_schedules(organization_id, project_id, id)
    on delete restrict,
  constraint retention_schedule_events_type_check
    check (event_type in (
      'schedule_created','schedule_updated','origin_added','origin_removed',
      'origins_reordered','trigger_confirmed','trigger_confirmation_amended',
      'schedule_activated','activation_rejected','schedule_cancelled',
      'schedule_completed','invalid_transition_attempted','permission_denied'
    )),
  constraint retention_schedule_events_reason_check
    check (char_length(trim(reason)) between 1 and 1000),
  constraint retention_schedule_events_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create table public.retention_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  schedule_id uuid not null,
  retention_claim_id uuid null,
  reminder_type text not null,
  contractual_due_date date not null,
  organization_timezone text not null,
  due_at timestamptz not null,
  assigned_user_id uuid null references auth.users(id) on delete restrict,
  assigned_permission_key text null references public.app_permissions(permission_key) on delete restrict,
  use_project_owner_fallback boolean not null default false,
  recurrence_type text not null default 'none',
  recurrence_interval integer null,
  escalation_after_days integer null,
  escalation_level integer not null default 0,
  state text not null default 'scheduled',
  snoozed_until timestamptz null,
  next_delivery_at timestamptz null,
  last_delivery_at timestamptz null,
  attempt_count integer not null default 0,
  maximum_attempts integer not null default 5,
  delivery_claimed_at timestamptz null,
  delivery_claim_token uuid null,
  failure_reason text null,
  completed_at timestamptz null,
  completed_by uuid null references auth.users(id) on delete restrict,
  cancelled_at timestamptz null,
  cancelled_by uuid null references auth.users(id) on delete restrict,
  cancellation_reason text null,
  revision bigint not null default 1,
  occurrence_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_reminders_identity_unique
    unique (organization_id, project_id, id),
  constraint retention_reminders_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects(organization_id, id) on delete restrict,
  constraint retention_reminders_schedule_fkey
    foreign key (organization_id, project_id, schedule_id)
    references public.project_retention_release_schedules(organization_id, project_id, id)
    on delete restrict,
  constraint retention_reminders_claim_fkey
    foreign key (organization_id, project_id, retention_claim_id)
    references public.retention_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_reminders_occurrence_unique
    unique (schedule_id, occurrence_key),
  constraint retention_reminders_type_check
    check (reminder_type in ('pre_eligibility','eligibility_due','overdue_unclaimed','escalation','custom')),
  constraint retention_reminders_assignment_check
    check (
      num_nonnulls(assigned_user_id, assigned_permission_key)
      + case when use_project_owner_fallback then 1 else 0 end = 1
    ),
  constraint retention_reminders_recurrence_check
    check (
      recurrence_type in ('none','daily','weekly','monthly','custom')
      and (
        (recurrence_type = 'custom' and recurrence_interval between 1 and 365)
        or (recurrence_type <> 'custom' and recurrence_interval is null)
      )
    ),
  constraint retention_reminders_state_check
    check (state in ('scheduled','due','queued','sent','snoozed','completed','cancelled','failed')),
  constraint retention_reminders_attempts_check
    check (attempt_count >= 0 and maximum_attempts between 1 and 100),
  constraint retention_reminders_escalation_check
    check (
      escalation_level >= 0
      and (escalation_after_days is null or escalation_after_days >= 0)
    ),
  constraint retention_reminders_actor_pairs
    check (
      (completed_at is null) = (completed_by is null)
      and (cancelled_at is null) = (cancelled_by is null)
      and (delivery_claimed_at is null) = (delivery_claim_token is null)
    ),
  constraint retention_reminders_revision_positive check (revision > 0),
  constraint retention_reminders_timezone_check check (char_length(trim(organization_timezone)) > 0),
  constraint retention_reminders_occurrence_check check (char_length(trim(occurrence_key)) > 0)
);

create table public.retention_reminder_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  reminder_id uuid null,
  schedule_id uuid not null,
  event_type text not null,
  previous_state text null,
  new_state text null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  reason text not null,
  correlation_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_reminder_events_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects(organization_id, id) on delete restrict,
  constraint retention_reminder_events_schedule_fkey
    foreign key (organization_id, project_id, schedule_id)
    references public.project_retention_release_schedules(organization_id, project_id, id)
    on delete restrict,
  constraint retention_reminder_events_reminder_fkey
    foreign key (organization_id, project_id, reminder_id)
    references public.retention_reminders(organization_id, project_id, id)
    on delete restrict,
  constraint retention_reminder_events_type_check
    check (event_type in (
      'reminder_created','reminder_due','delivery_queued','delivery_succeeded',
      'delivery_failed','reminder_snoozed','reminder_escalated',
      'reminder_completed','reminder_cancelled','recurrence_generated','permission_denied'
    )),
  constraint retention_reminder_events_reason_check
    check (char_length(trim(reason)) between 1 and 1000),
  constraint retention_reminder_events_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index retention_schedules_project_sequence_idx
  on public.project_retention_release_schedules(project_id, schedule_sequence, id);
create index retention_schedules_project_status_idx
  on public.project_retention_release_schedules(project_id, status, eligibility_date, id);
create index retention_schedule_origins_origin_idx
  on public.project_retention_schedule_origins(originating_payment_claim_id, schedule_id);
create index retention_schedule_events_schedule_idx
  on public.retention_schedule_events(schedule_id, occurred_at, id)
  where schedule_id is not null;
create index retention_reminders_due_selection_idx
  on public.retention_reminders(next_delivery_at, due_at, id)
  where state in ('scheduled','due','failed','snoozed');
create index retention_reminder_events_reminder_idx
  on public.retention_reminder_events(reminder_id, occurred_at, id)
  where reminder_id is not null;

create trigger set_retention_release_schedules_updated_at
before update on public.project_retention_release_schedules
for each row execute function public.set_updated_at();
create trigger set_retention_schedule_origins_updated_at
before update on public.project_retention_schedule_origins
for each row execute function public.set_updated_at();
create trigger set_retention_reminders_updated_at
before update on public.retention_reminders
for each row execute function public.set_updated_at();

create or replace function public.validate_retention_reminder_assignment()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.assigned_user_id is not null and not exists(
    select 1 from public.organization_members m
    where m.organization_id=new.organization_id and m.user_id=new.assigned_user_id
  ) then
    raise exception 'Retention reminder assigned user must belong to its organization.'
      using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger retention_reminder_assignment_guard
before insert or update of organization_id,assigned_user_id on public.retention_reminders
for each row execute function public.validate_retention_reminder_assignment();

create or replace function private.retention_phase4_gate_enabled()
returns boolean
language sql stable security invoker set search_path = public
as $$
  select
    coalesce(current_setting('request.jwt.claim.retention_phase4_internal', true), '') = 'true'
    or coalesce(
      coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
        ->> 'retention_phase4_internal',
      'false'
    ) = 'true';
$$;

create or replace function private.retention_phase4_context(
  p_project_id uuid,
  p_permission_key text,
  p_require_internal_gate boolean default true
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_mode text;
  v_capability boolean;
begin
  if v_actor is null then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select p.organization_id into v_org
  from public.organization_projects p
  join public.organization_members m
    on m.organization_id = p.organization_id and m.user_id = v_actor
  where p.id = p_project_id;
  if v_org is null then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found');
  end if;
  if not public.has_org_permission(v_org, p_permission_key) then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select coalesce(c.enabled,false) into v_capability
  from public.organization_capabilities c
  where c.organization_id=v_org and c.capability_key='retention_management';
  if not coalesce(v_capability,false) then
    return jsonb_build_object('succeeded',false,'errorCode','capability_disabled');
  end if;
  select coalesce(s.mode,'legacy') into v_mode
  from public.project_retention_workflow_states s
  where s.organization_id=v_org and s.project_id=p_project_id;
  if coalesce(v_mode,'legacy') <> 'observe'
     or (p_require_internal_gate and not private.retention_phase4_gate_enabled()) then
    return jsonb_build_object(
      'succeeded',false,'errorCode','project_mode_not_supported',
      'workflowMode',coalesce(v_mode,'legacy'),'phase4InternalGate',
      private.retention_phase4_gate_enabled()
    );
  end if;
  return jsonb_build_object(
    'succeeded',true,'organizationId',v_org,'projectId',p_project_id,'actorUserId',v_actor
  );
end;
$$;

create or replace function private.record_retention_schedule_event(
  p_schedule_id uuid, p_event_type text, p_previous_status text, p_new_status text,
  p_reason text, p_correlation_id text default null, p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_id uuid;
begin
  select * into v_s from public.project_retention_release_schedules where id=p_schedule_id;
  if not found then return null; end if;
  insert into public.retention_schedule_events(
    organization_id,project_id,schedule_id,event_type,previous_status,new_status,
    actor_user_id,reason,correlation_id,metadata
  ) values (
    v_s.organization_id,v_s.project_id,v_s.id,p_event_type,p_previous_status,p_new_status,
    auth.uid(),coalesce(nullif(trim(p_reason),''),p_event_type),
    nullif(trim(coalesce(p_correlation_id,'')),''),
    coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.record_retention_reminder_event(
  p_reminder_id uuid, p_event_type text, p_previous_state text, p_new_state text,
  p_reason text, p_correlation_id text default null, p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_r public.retention_reminders%rowtype; v_id uuid;
begin
  select * into v_r from public.retention_reminders where id=p_reminder_id;
  if not found then return null; end if;
  insert into public.retention_reminder_events(
    organization_id,project_id,reminder_id,schedule_id,event_type,previous_state,new_state,
    actor_user_id,reason,correlation_id,metadata
  ) values (
    v_r.organization_id,v_r.project_id,v_r.id,v_r.schedule_id,p_event_type,
    p_previous_state,p_new_state,auth.uid(),coalesce(nullif(trim(p_reason),''),p_event_type),
    nullif(trim(coalesce(p_correlation_id,'')),''),
    coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.prevent_retention_schedule_event_mutation()
returns trigger language plpgsql set search_path=public
as $$ begin raise exception 'Retention schedule events are append-only.' using errcode='55000'; end; $$;
create trigger retention_schedule_events_append_only
before update or delete on public.retention_schedule_events
for each row execute function public.prevent_retention_schedule_event_mutation();

create or replace function public.prevent_retention_reminder_event_mutation()
returns trigger language plpgsql set search_path=public
as $$ begin raise exception 'Retention reminder events are append-only.' using errcode='55000'; end; $$;
create trigger retention_reminder_events_append_only
before update or delete on public.retention_reminder_events
for each row execute function public.prevent_retention_reminder_event_mutation();

create or replace function public.protect_retention_schedule_mutation()
returns trigger language plpgsql set search_path=public
as $$
begin
  if coalesce(current_setting('app.retention_phase4_internal_write',true),'')='true' then
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'Retention release schedules cannot be hard-deleted.' using errcode='55000';
  end if;
  if old.status in ('activated','completed','cancelled') and
    (
      new.organization_id,new.project_id,new.id,new.schedule_sequence,new.trigger_type,
      new.entitlement_method,new.percentage_bps,new.fixed_amount,new.cap_amount,
      new.scope_policy,new.scheduled_trigger_date,new.actual_trigger_date,new.delay_days,
      new.eligibility_date,new.activated_at,new.activation_position_state_hash,
      new.activation_eligibility_state_hash,new.activation_evidence
    ) is distinct from
    (
      old.organization_id,old.project_id,old.id,old.schedule_sequence,old.trigger_type,
      old.entitlement_method,old.percentage_bps,old.fixed_amount,old.cap_amount,
      old.scope_policy,old.scheduled_trigger_date,old.actual_trigger_date,old.delay_days,
      old.eligibility_date,old.activated_at,old.activation_position_state_hash,
      old.activation_eligibility_state_hash,old.activation_evidence
    ) then
    raise exception 'Activated Retention schedule evidence is immutable.' using errcode='55000';
  end if;
  return new;
end;
$$;
create trigger retention_schedule_immutable_guard
before update or delete on public.project_retention_release_schedules
for each row execute function public.protect_retention_schedule_mutation();

create or replace function public.protect_retention_schedule_origin_mutation()
returns trigger language plpgsql set search_path=public
as $$
declare v_status text;
begin
  select status into v_status from public.project_retention_release_schedules
  where id=case when tg_op='DELETE' then old.schedule_id else new.schedule_id end;
  if v_status not in ('draft','scheduled','awaiting_confirmation') then
    raise exception 'Activated Retention schedule origins are immutable.' using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger retention_schedule_origins_immutable_guard
before insert or update or delete on public.project_retention_schedule_origins
for each row execute function public.protect_retention_schedule_origin_mutation();

create or replace function private.retention_schedule_header_json(p_schedule_id uuid)
returns jsonb
language sql stable security definer set search_path=public
as $$
  select to_jsonb(s) from public.project_retention_release_schedules s where s.id=p_schedule_id;
$$;

create or replace function private.retention_schedule_origins_json(p_schedule_id uuid)
returns jsonb
language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_agg(
    to_jsonb(o) || jsonb_build_object(
      'current_claim_number',p.claim_number,
      'current_claim_status',p.status,
      'current_retention_owned',greatest(p.retention_withheld_amount,0),
      'current_origin_state_hash',private.retention_claim_origin_state_hash(p.id)
    ) order by o.origin_sequence,o.id
  ),'[]'::jsonb)
  from public.project_retention_schedule_origins o
  join public.project_claims p on p.id=o.originating_payment_claim_id
  where o.schedule_id=p_schedule_id;
$$;

create or replace function private.retention_eligibility_state(p_project_id uuid)
returns jsonb
language sql stable security definer set search_path=public,extensions
as $$
  with project_context as (
    select p.id,p.organization_id,
      public.get_project_retention_position_summary(p.id) as position
    from public.organization_projects p where p.id=p_project_id
  ),
  committed as (
    select a.originating_payment_claim_id,
      round(coalesce(sum(a.allocation_amount),0),2) as amount
    from public.retention_claim_allocations a
    join public.retention_claims c on c.id=a.retention_claim_id
    where c.project_id=p_project_id and c.status='submitted'
    group by a.originating_payment_claim_id
  ),
  entitlements as (
    select o.originating_payment_claim_id,
      round(coalesce(sum(o.activated_entitlement_amount) filter(
        where s.eligibility_date <= ((now() at time zone org.timezone)::date)
      ),0),2) as raw_eligible,
      jsonb_agg(jsonb_build_object(
        'scheduleId',s.id,'revision',s.revision,'status',s.status,
        'activatedAt',s.activated_at,'triggerType',s.trigger_type,
        'eligibilityDate',s.eligibility_date,
        'currentlyEligible',
          s.eligibility_date <= ((now() at time zone org.timezone)::date),
        'entitlementMethod',s.entitlement_method,
        'percentageBps',
          case when s.entitlement_method='percentage'
            then (o.activation_evidence->>'originPercentageBps')::integer
            else null end,
        'entitlementAmount',o.activated_entitlement_amount,
        'scheduleCap',s.cap_amount,'originCap',o.cap_amount
      ) order by s.id) as schedules,
      coalesce(array_agg(s.id order by s.id) filter(
        where s.eligibility_date <= ((now() at time zone org.timezone)::date)
      ),'{}'::uuid[]) as schedule_ids
    from public.project_retention_schedule_origins o
    join public.project_retention_release_schedules s on s.id=o.schedule_id
    join public.organizations org on org.id=s.organization_id
    where s.project_id=p_project_id
      and s.status in ('activated','completed')
    group by o.originating_payment_claim_id
  ),
  origins as (
    select p.id,p.claim_number,p.status,p.claim_date,
      greatest(p.retention_withheld_amount,0)::numeric(14,2) as owned,
      least(
        greatest(p.retention_withheld_amount,0),
        coalesce(e.raw_eligible,0)
      )::numeric(14,2) as eligible,
      coalesce(c.amount,0)::numeric(14,2) as committed,
      greatest(
        least(greatest(p.retention_withheld_amount,0),coalesce(e.raw_eligible,0))
        - coalesce(c.amount,0),0
      )::numeric(14,2) as available,
      coalesce(e.schedules,'[]'::jsonb) as schedules,
      coalesce(e.schedule_ids,'{}'::uuid[]) as schedule_ids
    from public.project_claims p
    left join committed c on c.originating_payment_claim_id=p.id
    left join entitlements e on e.originating_payment_claim_id=p.id
    where p.project_id=p_project_id and p.status <> 'Cancelled'
  ),
  payload as (
    select pc.organization_id,pc.id as project_id,pc.position,
      coalesce(jsonb_agg(jsonb_build_object(
        'originatingPaymentClaimId',o.id,'claimNumber',o.claim_number,
        'claimStatus',o.status,'claimDate',o.claim_date,
        'currentRetentionOwned',o.owned,'rawScheduleEligibility',
        coalesce((select sum((x->>'entitlementAmount')::numeric)
          from jsonb_array_elements(o.schedules) x
          where coalesce((x->>'currentlyEligible')::boolean,false)),0),
        'cumulativeConfiguredPercentageBps',
          coalesce((select sum((x->>'percentageBps')::integer)
            from jsonb_array_elements(o.schedules) x
            where x->>'entitlementMethod'='percentage'),0),
        'overlapWarning',
          coalesce((select sum((x->>'percentageBps')::integer)
            from jsonb_array_elements(o.schedules) x
            where x->>'entitlementMethod'='percentage'),0)>10000,
        'currentEligibleRetention',o.eligible,
        'committedRetention',o.committed,'availableRetention',o.available,
        'scheduleIds',to_jsonb(o.schedule_ids),'schedules',o.schedules
      ) order by o.id),'[]'::jsonb) as origins
    from project_context pc left join origins o on true
    group by pc.organization_id,pc.id,pc.position
  )
  select jsonb_build_object(
    'organizationId',organization_id,'projectId',project_id,
    'positionStateHash',position->>'stateHash',
    'eligibilityStateHash',encode(extensions.digest(
      convert_to(jsonb_build_object(
        'organizationId',organization_id,'projectId',project_id,
        'positionStateHash',position->>'stateHash','origins',origins
      )::text,'UTF8'),'sha256'),'hex'),
    'origins',origins
  ) from payload;
$$;

create or replace function public.get_project_retention_eligibility(p_project_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v_context jsonb; v_state jsonb;
begin
  v_context:=private.retention_phase4_context(p_project_id,'retention.view',false);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  v_state:=private.retention_eligibility_state(p_project_id);
  return jsonb_build_object('succeeded',true,'errorCode',null)
    || coalesce(v_state,'{}'::jsonb);
end;
$$;

create or replace function public.create_retention_release_schedule(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_project uuid; v_context jsonb; v_s public.project_retention_release_schedules%rowtype;
  v_sequence integer; v_method text; v_trigger text;
begin
  v_project:=(p_input->>'projectId')::uuid;
  v_context:=private.retention_phase4_context(v_project,'retention.schedules.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  v_method:=p_input->>'entitlementMethod'; v_trigger:=p_input->>'triggerType';
  if v_method not in ('percentage','fixed_amount') then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_entitlement_method');
  end if;
  if v_trigger not in ('practical_completion','defects_liability_expiry','fixed_date','manual_milestone','custom') then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_trigger');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_project::text||':retention_schedule',4));
  select coalesce(max(schedule_sequence),0)+1 into v_sequence
  from public.project_retention_release_schedules where project_id=v_project;
  begin
    insert into public.project_retention_release_schedules(
      organization_id,project_id,name,schedule_sequence,trigger_type,entitlement_method,
      percentage_bps,fixed_amount,cap_amount,scope_policy,scheduled_trigger_date,
      delay_days,confirmation_required,reminder_rules,replaces_schedule_id,created_by
    ) values (
      (v_context->>'organizationId')::uuid,v_project,trim(p_input->>'name'),v_sequence,
      v_trigger,v_method,(p_input->>'percentageBps')::integer,
      (p_input->>'fixedAmount')::numeric,(p_input->>'capAmount')::numeric,
      coalesce(p_input->>'scopePolicy','explicit'),
      (p_input->>'scheduledTriggerDate')::date,
      coalesce((p_input->>'delayDays')::integer,0),
      coalesce((p_input->>'confirmationRequired')::boolean,v_trigger<>'fixed_date'),
      coalesce(p_input->'reminderRules',
        '[{"type":"eligibility_due","offsetDays":0,"recurrence":"none"},{"type":"overdue_unclaimed","offsetDays":7,"recurrence":"weekly"}]'::jsonb),
      (p_input->>'replacesScheduleId')::uuid,auth.uid()
    ) returning * into v_s;
  exception when check_violation or not_null_violation or invalid_text_representation then
    return jsonb_build_object('succeeded',false,'errorCode',
      case when v_method='percentage' then 'invalid_percentage' else 'invalid_fixed_amount' end);
  end;
  perform private.record_retention_schedule_event(
    v_s.id,'schedule_created',null,'draft','Retention release schedule created.',
    p_input->>'correlationId',jsonb_build_object('scheduleSequence',v_sequence)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s));
end;
$$;

create or replace function public.update_retention_release_schedule_draft(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb; v_target text;
begin
  select * into v_s from public.project_retention_release_schedules
  where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.schedules.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_s from public.project_retention_release_schedules
  where id=v_s.id and organization_id=(v_context->>'organizationId')::uuid for update;
  if v_s.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_s.revision);
  end if;
  if v_s.status not in ('draft','scheduled','awaiting_confirmation') then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_immutable');
  end if;
  v_target:=coalesce(p_input->>'status',v_s.status);
  if not (
    v_target=v_s.status or (v_s.status='draft' and v_target='scheduled')
    or (v_s.status='awaiting_confirmation' and v_target='scheduled')
  ) then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_draft'); end if;
  begin
    update public.project_retention_release_schedules s set
      name=coalesce(nullif(trim(p_input->>'name'),''),s.name),
      status=v_target,
      trigger_type=coalesce(p_input->>'triggerType',s.trigger_type),
      entitlement_method=coalesce(p_input->>'entitlementMethod',s.entitlement_method),
      percentage_bps=case when p_input ? 'percentageBps' then (p_input->>'percentageBps')::integer else s.percentage_bps end,
      fixed_amount=case when p_input ? 'fixedAmount' then (p_input->>'fixedAmount')::numeric else s.fixed_amount end,
      cap_amount=case when p_input ? 'capAmount' then (p_input->>'capAmount')::numeric else s.cap_amount end,
      scope_policy=coalesce(p_input->>'scopePolicy',s.scope_policy),
      scheduled_trigger_date=case when p_input ? 'scheduledTriggerDate' then (p_input->>'scheduledTriggerDate')::date else s.scheduled_trigger_date end,
      delay_days=coalesce((p_input->>'delayDays')::integer,s.delay_days),
      confirmation_required=coalesce((p_input->>'confirmationRequired')::boolean,s.confirmation_required),
      reminder_rules=coalesce(p_input->'reminderRules',s.reminder_rules),
      revision=s.revision+1
    where s.id=v_s.id returning * into v_s;
  exception when check_violation or invalid_text_representation then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_entitlement_method');
  end;
  perform private.record_retention_schedule_event(
    v_s.id,'schedule_updated',v_s.status,v_target,'Retention release schedule updated.',
    p_input->>'correlationId',jsonb_build_object('revision',v_s.revision)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s));
end;
$$;

create or replace function public.add_retention_schedule_origin(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_p public.project_claims%rowtype;
  v_context jsonb; v_o public.project_retention_schedule_origins%rowtype; v_seq integer;
begin
  select * into v_s from public.project_retention_release_schedules where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.schedules.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_s from public.project_retention_release_schedules where id=v_s.id for update;
  if v_s.status not in ('draft','scheduled','awaiting_confirmation') then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_immutable');
  end if;
  if v_s.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_s.revision);
  end if;
  select * into v_p from public.project_claims where id=(p_input->>'originatingPaymentClaimId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','origin_not_found'); end if;
  if v_p.organization_id<>v_s.organization_id or v_p.project_id<>v_s.project_id then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_schedule_scope');
  end if;
  if v_p.status='Cancelled' then return jsonb_build_object('succeeded',false,'errorCode','origin_cancelled'); end if;
  if exists(select 1 from public.project_retention_schedule_origins where schedule_id=v_s.id and originating_payment_claim_id=v_p.id) then
    return jsonb_build_object('succeeded',false,'errorCode','duplicate_schedule_origin');
  end if;
  select coalesce(max(origin_sequence),0)+1 into v_seq
  from public.project_retention_schedule_origins where schedule_id=v_s.id;
  begin
    insert into public.project_retention_schedule_origins(
      organization_id,project_id,schedule_id,originating_payment_claim_id,origin_sequence,
      percentage_bps_override,fixed_amount_override,cap_amount,created_by
    ) values (
      v_s.organization_id,v_s.project_id,v_s.id,v_p.id,coalesce((p_input->>'originSequence')::integer,v_seq),
      (p_input->>'percentageBpsOverride')::integer,(p_input->>'fixedAmountOverride')::numeric,
      (p_input->>'capAmount')::numeric,auth.uid()
    ) returning * into v_o;
  exception when unique_violation then
    return jsonb_build_object('succeeded',false,'errorCode','duplicate_schedule_origin');
  when check_violation then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_schedule_scope');
  end;
  update public.project_retention_release_schedules set revision=revision+1 where id=v_s.id returning * into v_s;
  perform private.record_retention_schedule_event(
    v_s.id,'origin_added',v_s.status,v_s.status,'Schedule origin added.',
    p_input->>'correlationId',jsonb_build_object('originId',v_p.id,'originSequence',v_o.origin_sequence)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s),'origin',to_jsonb(v_o));
end;
$$;

create or replace function public.remove_retention_schedule_origin(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_o public.project_retention_schedule_origins%rowtype; v_s public.project_retention_release_schedules%rowtype; v_context jsonb;
begin
  select * into v_o from public.project_retention_schedule_origins where id=(p_input->>'originId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','origin_not_found'); end if;
  select * into v_s from public.project_retention_release_schedules where id=v_o.schedule_id;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.schedules.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_s from public.project_retention_release_schedules where id=v_s.id for update;
  if v_s.status not in ('draft','scheduled','awaiting_confirmation') then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_immutable');
  end if;
  if v_s.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_s.revision);
  end if;
  delete from public.project_retention_schedule_origins where id=v_o.id;
  update public.project_retention_release_schedules set revision=revision+1 where id=v_s.id returning * into v_s;
  perform private.record_retention_schedule_event(
    v_s.id,'origin_removed',v_s.status,v_s.status,'Schedule origin removed.',
    p_input->>'correlationId',jsonb_build_object('originId',v_o.originating_payment_claim_id)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s));
end;
$$;

create or replace function public.reorder_retention_schedule_origins(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb; v_ids uuid[]; v_count integer;
begin
  select * into v_s from public.project_retention_release_schedules where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.schedules.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_s from public.project_retention_release_schedules where id=v_s.id for update;
  if v_s.status not in ('draft','scheduled','awaiting_confirmation') then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_immutable');
  end if;
  if v_s.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_s.revision);
  end if;
  select array_agg(value::uuid order by ordinality) into v_ids
  from jsonb_array_elements_text(coalesce(p_input->'originIds','[]'::jsonb)) with ordinality;
  select count(*) into v_count from public.project_retention_schedule_origins where schedule_id=v_s.id;
  if cardinality(coalesce(v_ids,'{}'::uuid[]))<>v_count
    or (select count(distinct x) from unnest(coalesce(v_ids,'{}'::uuid[])) x)<>v_count
    or exists(select 1 from unnest(coalesce(v_ids,'{}'::uuid[])) x
      where not exists(select 1 from public.project_retention_schedule_origins o where o.id=x and o.schedule_id=v_s.id))
  then return jsonb_build_object('succeeded',false,'errorCode','invalid_schedule_scope'); end if;
  set constraints project_retention_schedule_origins_sequence_unique deferred;
  update public.project_retention_schedule_origins set origin_sequence=array_position(v_ids,id) where schedule_id=v_s.id;
  update public.project_retention_release_schedules set revision=revision+1 where id=v_s.id returning * into v_s;
  perform private.record_retention_schedule_event(
    v_s.id,'origins_reordered',v_s.status,v_s.status,'Schedule origins reordered.',
    p_input->>'correlationId',jsonb_build_object('originCount',v_count)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s),
    'origins',private.retention_schedule_origins_json(v_s.id));
end;
$$;

create or replace function public.confirm_retention_schedule_trigger(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb;
  v_date date; v_reason text; v_evidence jsonb; v_event text;
begin
  select * into v_s from public.project_retention_release_schedules where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.schedules.confirm',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_s from public.project_retention_release_schedules where id=v_s.id for update;
  if v_s.status not in ('scheduled','awaiting_confirmation') then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_not_activatable');
  end if;
  if v_s.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_s.revision);
  end if;
  v_date:=(p_input->>'actualTriggerDate')::date;
  v_reason:=nullif(trim(coalesce(p_input->>'reason','')),'');
  v_evidence:=p_input->'evidence';
  if v_date is null then return jsonb_build_object('succeeded',false,'errorCode','invalid_trigger'); end if;
  if v_s.trigger_type in ('manual_milestone','custom')
    and (v_reason is null or v_evidence is null or jsonb_typeof(v_evidence)<>'object') then
    return jsonb_build_object('succeeded',false,'errorCode','trigger_confirmation_required');
  end if;
  v_event:=case when v_s.trigger_confirmed_at is null then 'trigger_confirmed'
                else 'trigger_confirmation_amended' end;
  update public.project_retention_release_schedules set
    status='awaiting_confirmation',actual_trigger_date=v_date,
    trigger_confirmed_at=now(),trigger_confirmed_by=auth.uid(),
    trigger_confirmation_reason=v_reason,
    trigger_confirmation_evidence=coalesce(v_evidence,'{}'::jsonb),
    revision=revision+1
  where id=v_s.id returning * into v_s;
  perform private.record_retention_schedule_event(
    v_s.id,v_event,'scheduled','awaiting_confirmation','Contractual trigger confirmed.',
    p_input->>'correlationId',jsonb_build_object('actualTriggerDate',v_date,'reason',v_reason)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s));
end;
$$;

create or replace function private.generate_activation_reminders(p_schedule_id uuid)
returns integer
language plpgsql security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_tz text; v_count integer;
begin
  select * into v_s from public.project_retention_release_schedules where id=p_schedule_id;
  select o.timezone into v_tz from public.organizations o where o.id=v_s.organization_id;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='UTC'; end if;
  with rules as (
    select value as rule,ordinality
    from jsonb_array_elements(v_s.reminder_rules) with ordinality
  ), normalized as (
    select
      coalesce(rule->>'type','custom') as reminder_type,
      coalesce((rule->>'offsetDays')::integer,0) as offset_days,
      coalesce(rule->>'recurrence','none') as recurrence_type,
      (rule->>'customIntervalDays')::integer as recurrence_interval,
      (rule->>'escalationAfterDays')::integer as escalation_after_days,
      coalesce(rule->>'assignedPermissionKey','retention.reminders.manage') as assigned_permission_key,
      ordinality
    from rules
    where coalesce(rule->>'type','') in
      ('pre_eligibility','eligibility_due','overdue_unclaimed','escalation','custom')
  ), inserted as (
    insert into public.retention_reminders(
      organization_id,project_id,schedule_id,reminder_type,contractual_due_date,
      organization_timezone,due_at,assigned_permission_key,recurrence_type,
      recurrence_interval,escalation_after_days,state,next_delivery_at,
      occurrence_key,created_by
    )
    select
      v_s.organization_id,v_s.project_id,v_s.id,n.reminder_type,
      v_s.eligibility_date+n.offset_days,v_tz,
      ((v_s.eligibility_date+n.offset_days)::timestamp at time zone v_tz),
      n.assigned_permission_key,n.recurrence_type,n.recurrence_interval,
      n.escalation_after_days,'scheduled',
      ((v_s.eligibility_date+n.offset_days)::timestamp at time zone v_tz),
      format('activation:%s:%s:%s',n.ordinality,n.reminder_type,v_s.eligibility_date+n.offset_days),
      auth.uid()
    from normalized n
    on conflict(schedule_id,occurrence_key) do nothing
    returning id
  )
  select count(*) into v_count from inserted;
  perform private.record_retention_reminder_event(
    r.id,'reminder_created',null,'scheduled','Activation reminder created.',null,
    jsonb_build_object('contractualDueDate',r.contractual_due_date)
  )
  from public.retention_reminders r
  where r.schedule_id=v_s.id and r.created_at>=v_s.activated_at;
  return coalesce(v_count,0);
end;
$$;

create or replace function public.activate_retention_release_schedule(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public,extensions
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb;
  v_position jsonb; v_position_hash text; v_tz text; v_local_today date;
  v_base_date date; v_origin_count integer; v_explicit_fixed numeric; v_auto_count integer;
  v_state jsonb; v_hash text; v_reminders integer;
begin
  select * into v_s from public.project_retention_release_schedules where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.schedules.confirm',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_s from public.project_retention_release_schedules where id=v_s.id for update;
  if v_s.status not in ('scheduled','awaiting_confirmation') then
    perform private.record_retention_schedule_event(v_s.id,'activation_rejected',v_s.status,v_s.status,
      'schedule_not_activatable',p_input->>'correlationId','{}'::jsonb);
    return jsonb_build_object('succeeded',false,'errorCode','schedule_not_activatable');
  end if;
  if v_s.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_s.revision);
  end if;
  select o.timezone into v_tz from public.organizations o where o.id=v_s.organization_id;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='UTC'; end if;
  v_local_today:=(now() at time zone v_tz)::date;
  if v_s.trigger_type='fixed_date' then
    if v_s.scheduled_trigger_date is null then
      return jsonb_build_object('succeeded',false,'errorCode','invalid_trigger');
    end if;
    if v_s.scheduled_trigger_date>v_local_today then
      return jsonb_build_object('succeeded',false,'errorCode','schedule_not_activatable',
        'currentBusinessDate',v_local_today);
    end if;
    if v_s.confirmation_required and v_s.trigger_confirmed_at is null then
      return jsonb_build_object('succeeded',false,'errorCode','trigger_confirmation_required');
    end if;
    v_base_date:=coalesce(v_s.actual_trigger_date,v_s.scheduled_trigger_date);
  else
    if v_s.trigger_confirmed_at is null or v_s.actual_trigger_date is null then
      return jsonb_build_object('succeeded',false,'errorCode','trigger_confirmation_required');
    end if;
    if v_s.trigger_type in ('manual_milestone','custom') and
      (nullif(trim(coalesce(v_s.trigger_confirmation_reason,'')),'') is null
       or v_s.trigger_confirmation_evidence is null) then
      return jsonb_build_object('succeeded',false,'errorCode','trigger_confirmation_required');
    end if;
    v_base_date:=v_s.actual_trigger_date;
  end if;

  v_position:=public.get_project_retention_position_summary(v_s.project_id);
  v_position_hash:=v_position->>'stateHash';
  if coalesce(v_position->>'accessState','')<>'available' then
    return jsonb_build_object('succeeded',false,'errorCode','stale_retention_position');
  end if;

  if v_s.scope_policy='all_current_origins' then
    insert into public.project_retention_schedule_origins(
      organization_id,project_id,schedule_id,originating_payment_claim_id,
      origin_sequence,created_by
    )
    select v_s.organization_id,v_s.project_id,v_s.id,p.id,
      coalesce((select max(o.origin_sequence) from public.project_retention_schedule_origins o
                where o.schedule_id=v_s.id),0)
        + row_number() over(order by p.created_at,p.id),auth.uid()
    from public.project_claims p
    where p.organization_id=v_s.organization_id and p.project_id=v_s.project_id
      and p.status<>'Cancelled' and greatest(p.retention_withheld_amount,0)>0
      and not exists(select 1 from public.project_retention_schedule_origins o
        where o.schedule_id=v_s.id and o.originating_payment_claim_id=p.id)
    order by p.created_at,p.id;
  end if;

  perform p.id from public.project_claims p
  join public.project_retention_schedule_origins o on o.originating_payment_claim_id=p.id
  where o.schedule_id=v_s.id order by p.id for update of p;

  if exists(
    select 1 from public.project_retention_schedule_origins o
    left join public.project_claims p on p.id=o.originating_payment_claim_id
    where o.schedule_id=v_s.id and (
      p.id is null or p.organization_id<>v_s.organization_id or p.project_id<>v_s.project_id
      or p.status='Cancelled'
    )
  ) then return jsonb_build_object('succeeded',false,'errorCode','invalid_schedule_scope'); end if;

  select count(*),coalesce(sum(o.fixed_amount_override),0),
    count(*) filter(where o.fixed_amount_override is null)
  into v_origin_count,v_explicit_fixed,v_auto_count
  from public.project_retention_schedule_origins o where o.schedule_id=v_s.id;
  if v_origin_count=0 then return jsonb_build_object('succeeded',false,'errorCode','invalid_schedule_scope'); end if;
  if v_s.entitlement_method='fixed_amount' and (
    v_explicit_fixed>v_s.fixed_amount
    or (v_auto_count=0 and round(v_explicit_fixed,2)<>round(v_s.fixed_amount,2))
  ) then return jsonb_build_object('succeeded',false,'errorCode','schedule_overlap_invalid'); end if;

  -- All arithmetic is performed in integer cents. Fixed unassigned pools and
  -- schedule caps use largest-remainder distribution, ties broken by origin ID.
  with source as (
    select o.id,o.originating_payment_claim_id,o.fixed_amount_override,o.cap_amount,
      greatest(p.retention_withheld_amount,0) as owned,
      coalesce(o.percentage_bps_override,v_s.percentage_bps) as bps
    from public.project_retention_schedule_origins o
    join public.project_claims p on p.id=o.originating_payment_claim_id
    where o.schedule_id=v_s.id
  ), fixed_context as (
    select greatest(round(v_s.fixed_amount*100)::bigint
      -coalesce(sum(round(fixed_amount_override*100)::bigint),0),0) as remaining_cents,
      coalesce(sum(round(owned*100)::bigint) filter(where fixed_amount_override is null),0) as weight_total
    from source
  ), raw as (
    select s.*,
      case when v_s.entitlement_method='percentage'
        then round(s.owned*s.bps/10000.0*100)::bigint
        when s.fixed_amount_override is not null
        then round(s.fixed_amount_override*100)::bigint
        when f.weight_total=0 then 0
        else floor(f.remaining_cents*round(s.owned*100)::numeric/f.weight_total)::bigint end as base_cents,
      case when v_s.entitlement_method='fixed_amount' and s.fixed_amount_override is null
                and f.weight_total>0
        then (f.remaining_cents*round(s.owned*100)::numeric/f.weight_total)
          -floor(f.remaining_cents*round(s.owned*100)::numeric/f.weight_total)
        else 0 end as fraction,
      f.remaining_cents
    from source s cross join fixed_context f
  ), fixed_ranked as (
    select r.*,
      row_number() over(order by r.fraction desc,r.originating_payment_claim_id) as fraction_rank,
      case when v_s.entitlement_method='fixed_amount'
        then greatest(round(v_s.fixed_amount*100)::bigint-sum(r.base_cents) over(),0)
        else 0 end as leftover
    from raw r
  ), origin_capped as (
    select *,
      least(base_cents+case when fraction_rank<=leftover then 1 else 0 end,
        round(owned*100)::bigint,
        coalesce(round(cap_amount*100)::bigint,9223372036854775807)) as preliminary_cents
    from fixed_ranked
  ), schedule_context as (
    select *,
      least(coalesce(round(v_s.cap_amount*100)::bigint,sum(preliminary_cents) over()),
            sum(preliminary_cents) over()) as target_cents,
      sum(preliminary_cents) over() as preliminary_total
    from origin_capped
  ), schedule_base as (
    select *,
      case when preliminary_total=0 then 0
        else floor(target_cents*preliminary_cents::numeric/preliminary_total)::bigint end as cap_base,
      case when preliminary_total=0 then 0
        else (target_cents*preliminary_cents::numeric/preliminary_total)
          -floor(target_cents*preliminary_cents::numeric/preliminary_total) end as cap_fraction
    from schedule_context
  ), final_ranked as (
    select *,
      row_number() over(order by cap_fraction desc,originating_payment_claim_id) as cap_rank,
      greatest(target_cents-sum(cap_base) over(),0) as cap_leftover
    from schedule_base
  )
  update public.project_retention_schedule_origins o set
    activated_entitlement_amount=(f.cap_base+case when f.cap_rank<=f.cap_leftover then 1 else 0 end)/100.0,
    activation_claim_number_snapshot=p.claim_number,
    activation_claim_date_snapshot=p.claim_date,
    activation_claim_status_snapshot=p.status,
    activation_claim_created_at_snapshot=p.created_at,
    activation_claim_updated_at_snapshot=p.updated_at,
    activation_retention_owned_snapshot=greatest(p.retention_withheld_amount,0),
    activation_origin_state_hash=private.retention_claim_origin_state_hash(p.id),
    activation_position_state_hash=v_position_hash,
    activation_evidence=jsonb_build_object(
      'entitlementMethod',v_s.entitlement_method,'schedulePercentageBps',v_s.percentage_bps,
      'originPercentageBps',f.bps,'scheduleFixedAmount',v_s.fixed_amount,
      'originFixedAmount',f.fixed_amount_override,'scheduleCap',v_s.cap_amount,
      'originCap',f.cap_amount,'preliminaryCents',f.preliminary_cents,
      'activatedEntitlementCents',f.cap_base+case when f.cap_rank<=f.cap_leftover then 1 else 0 end,
      'distribution','largest_remainder'
    ),
    activated_at=now()
  from final_ranked f join public.project_claims p on p.id=f.originating_payment_claim_id
  where o.id=f.id;

  update public.project_retention_release_schedules set
    status='activated',eligibility_date=v_base_date+delay_days,
    activated_at=now(),activated_by=auth.uid(),
    activation_position_state_hash=v_position_hash,
    activation_evidence=jsonb_build_object(
      'originCount',v_origin_count,'scopePolicy',v_s.scope_policy,
      'businessTimezone',v_tz,'contractualBaseDate',v_base_date,
      'entitlementMethod',v_s.entitlement_method,'positionStateHash',v_position_hash
    ),
    revision=revision+1
  where id=v_s.id returning * into v_s;

  v_state:=private.retention_eligibility_state(v_s.project_id);
  v_hash:=v_state->>'eligibilityStateHash';
  perform set_config('app.retention_phase4_internal_write','true',true);
  update public.project_retention_release_schedules set activation_eligibility_state_hash=v_hash
  where id=v_s.id returning * into v_s;
  perform set_config('app.retention_phase4_internal_write','',true);
  v_reminders:=private.generate_activation_reminders(v_s.id);
  perform private.record_retention_schedule_event(
    v_s.id,'schedule_activated','scheduled','activated','Retention release schedule activated.',
    p_input->>'correlationId',jsonb_build_object(
      'eligibilityDate',v_s.eligibility_date,'positionStateHash',v_position_hash,
      'eligibilityStateHash',v_hash,'originCount',v_origin_count,'reminderCount',v_reminders
    )
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s),
    'origins',private.retention_schedule_origins_json(v_s.id),'eligibility',v_state);
end;
$$;

create or replace function public.cancel_retention_release_schedule(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb; v_permission text;
begin
  select * into v_s from public.project_retention_release_schedules where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_permission:=case when v_s.status='activated' then 'retention.schedules.confirm'
                     else 'retention.schedules.manage' end;
  v_context:=private.retention_phase4_context(v_s.project_id,v_permission,true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_s from public.project_retention_release_schedules where id=v_s.id for update;
  if v_s.status in ('completed','cancelled') then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_immutable');
  end if;
  if v_s.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_s.revision);
  end if;
  if nullif(trim(coalesce(p_input->>'reason','')),'') is null then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_transition');
  end if;
  if v_s.status='activated' and exists(
    select 1 from public.retention_claim_allocations a
    join public.retention_claims c on c.id=a.retention_claim_id
    where c.status='submitted'
      and v_s.id=any(coalesce(a.eligibility_schedule_ids_snapshot,'{}'::uuid[]))
  ) then return jsonb_build_object('succeeded',false,'errorCode','schedule_immutable'); end if;
  perform set_config('app.retention_phase4_internal_write','true',true);
  update public.project_retention_release_schedules set
    status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
    cancellation_reason=trim(p_input->>'reason'),revision=revision+1
  where id=v_s.id returning * into v_s;
  perform set_config('app.retention_phase4_internal_write','',true);
  update public.retention_reminders set
    state='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
    cancellation_reason='schedule_cancelled',revision=revision+1,
    next_delivery_at=null,delivery_claimed_at=null,delivery_claim_token=null
  where schedule_id=v_s.id and state not in ('completed','cancelled');
  perform private.record_retention_schedule_event(
    v_s.id,'schedule_cancelled',null,'cancelled',trim(p_input->>'reason'),
    p_input->>'correlationId','{}'::jsonb
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s));
end;
$$;

create or replace function public.complete_retention_release_schedule(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb; v_remaining numeric;
begin
  select * into v_s from public.project_retention_release_schedules where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.schedules.confirm',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_s from public.project_retention_release_schedules where id=v_s.id for update;
  if v_s.status<>'activated' then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_not_activatable');
  end if;
  if v_s.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_s.revision);
  end if;
  select coalesce(sum(greatest((x->>'availableRetention')::numeric,0)),0) into v_remaining
  from jsonb_array_elements(private.retention_eligibility_state(v_s.project_id)->'origins') x
  where (x->'scheduleIds') ? v_s.id::text;
  if v_remaining>0 and not coalesce((p_input->>'acknowledgeRemaining')::boolean,false) then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_not_activatable',
      'remainingEligibleAmount',v_remaining);
  end if;
  perform set_config('app.retention_phase4_internal_write','true',true);
  update public.project_retention_release_schedules set
    status='completed',completed_at=now(),completed_by=auth.uid(),
    completion_reason=coalesce(nullif(trim(p_input->>'reason'),''),'Completed'),
    revision=revision+1
  where id=v_s.id returning * into v_s;
  perform set_config('app.retention_phase4_internal_write','',true);
  perform private.record_retention_schedule_event(
    v_s.id,'schedule_completed','activated','completed',v_s.completion_reason,
    p_input->>'correlationId',jsonb_build_object('remainingEligibleAmount',v_remaining)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedule',to_jsonb(v_s));
end;
$$;

create or replace function public.get_retention_release_schedule(p_schedule_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb;
begin
  select * into v_s from public.project_retention_release_schedules where id=p_schedule_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.view',false);
  if not coalesce((v_context->>'succeeded')::boolean,false)
    or v_s.organization_id<>(v_context->>'organizationId')::uuid then
    return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found');
  end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'schedule',to_jsonb(v_s),'origins',private.retention_schedule_origins_json(v_s.id),
    'eligibility',private.retention_eligibility_state(v_s.project_id),
    'reminderSummary',(select jsonb_build_object('total',count(*),'due',
      count(*) filter(where state in ('due','failed'))) from public.retention_reminders where schedule_id=v_s.id)
  );
end;
$$;

create or replace function public.list_retention_release_schedules(
  p_project_id uuid,p_limit integer default 100,p_before_sequence integer default null
)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v_context jsonb;
begin
  v_context:=private.retention_phase4_context(p_project_id,'retention.view',false);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'schedules',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.schedule_sequence)
    from (select * from public.project_retention_release_schedules
      where project_id=p_project_id and (p_before_sequence is null or schedule_sequence>p_before_sequence)
      order by schedule_sequence limit least(greatest(coalesce(p_limit,100),1),500)) x
  ),'[]'::jsonb));
end;
$$;

create or replace function public.get_retention_schedule_events(p_schedule_id uuid,p_limit integer default 200)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb;
begin
  select * into v_s from public.project_retention_release_schedules where id=p_schedule_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.view',false);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'events',coalesce((
    select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id)
    from (select * from public.retention_schedule_events where schedule_id=p_schedule_id
      order by occurred_at desc,id desc limit least(greatest(coalesce(p_limit,200),1),1000)) e
  ),'[]'::jsonb));
end;
$$;

create or replace function public.create_retention_reminder(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_s public.project_retention_release_schedules%rowtype; v_context jsonb;
  v_r public.retention_reminders%rowtype; v_tz text; v_due date;
begin
  select * into v_s from public.project_retention_release_schedules where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  v_context:=private.retention_phase4_context(v_s.project_id,'retention.reminders.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select timezone into v_tz from public.organizations where id=v_s.organization_id;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_reminder_time');
  end if;
  v_due:=(p_input->>'contractualDueDate')::date;
  if v_due is null then return jsonb_build_object('succeeded',false,'errorCode','invalid_reminder_time'); end if;
  begin
    insert into public.retention_reminders(
      organization_id,project_id,schedule_id,retention_claim_id,reminder_type,
      contractual_due_date,organization_timezone,due_at,assigned_user_id,
      assigned_permission_key,use_project_owner_fallback,recurrence_type,
      recurrence_interval,escalation_after_days,next_delivery_at,
      maximum_attempts,occurrence_key,created_by
    ) values (
      v_s.organization_id,v_s.project_id,v_s.id,(p_input->>'retentionClaimId')::uuid,
      p_input->>'reminderType',v_due,v_tz,(v_due::timestamp at time zone v_tz),
      (p_input->>'assignedUserId')::uuid,p_input->>'assignedPermissionKey',
      coalesce((p_input->>'useProjectOwnerFallback')::boolean,false),
      coalesce(p_input->>'recurrenceType','none'),(p_input->>'recurrenceInterval')::integer,
      (p_input->>'escalationAfterDays')::integer,(v_due::timestamp at time zone v_tz),
      coalesce((p_input->>'maximumAttempts')::integer,5),
      coalesce(nullif(p_input->>'occurrenceKey',''),gen_random_uuid()::text),auth.uid()
    ) returning * into v_r;
  exception when check_violation or not_null_violation or invalid_text_representation then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_assignment');
  end;
  perform private.record_retention_reminder_event(
    v_r.id,'reminder_created',null,'scheduled','Retention reminder created.',
    p_input->>'correlationId',jsonb_build_object('contractualDueDate',v_due)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'reminder',to_jsonb(v_r));
end;
$$;

create or replace function public.update_retention_reminder(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_r public.retention_reminders%rowtype; v_context jsonb; v_due date;
begin
  select * into v_r from public.retention_reminders where id=(p_input->>'reminderId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','reminder_not_found'); end if;
  v_context:=private.retention_phase4_context(v_r.project_id,'retention.reminders.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_r from public.retention_reminders where id=v_r.id for update;
  if v_r.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_r.revision);
  end if;
  if v_r.state in ('completed','cancelled') then
    return jsonb_build_object('succeeded',false,'errorCode','reminder_immutable');
  end if;
  v_due:=coalesce((p_input->>'contractualDueDate')::date,v_r.contractual_due_date);
  begin
    update public.retention_reminders set
      reminder_type=coalesce(p_input->>'reminderType',reminder_type),
      contractual_due_date=v_due,due_at=(v_due::timestamp at time zone organization_timezone),
      assigned_user_id=case when p_input ? 'assignedUserId' then (p_input->>'assignedUserId')::uuid else assigned_user_id end,
      assigned_permission_key=case when p_input ? 'assignedPermissionKey' then p_input->>'assignedPermissionKey' else assigned_permission_key end,
      use_project_owner_fallback=coalesce((p_input->>'useProjectOwnerFallback')::boolean,use_project_owner_fallback),
      recurrence_type=coalesce(p_input->>'recurrenceType',recurrence_type),
      recurrence_interval=case when p_input ? 'recurrenceInterval' then (p_input->>'recurrenceInterval')::integer else recurrence_interval end,
      escalation_after_days=case when p_input ? 'escalationAfterDays' then (p_input->>'escalationAfterDays')::integer else escalation_after_days end,
      next_delivery_at=(v_due::timestamp at time zone organization_timezone),
      revision=revision+1
    where id=v_r.id returning * into v_r;
  exception when check_violation then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_assignment');
  end;
  return jsonb_build_object('succeeded',true,'errorCode',null,'reminder',to_jsonb(v_r));
end;
$$;

create or replace function public.snooze_retention_reminder(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_r public.retention_reminders%rowtype; v_context jsonb; v_until timestamptz;
begin
  select * into v_r from public.retention_reminders where id=(p_input->>'reminderId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','reminder_not_found'); end if;
  v_context:=private.retention_phase4_context(v_r.project_id,'retention.reminders.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_r from public.retention_reminders where id=v_r.id for update;
  if v_r.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_r.revision);
  end if;
  if v_r.state in ('completed','cancelled','sent') then
    return jsonb_build_object('succeeded',false,'errorCode','reminder_immutable');
  end if;
  v_until:=(p_input->>'snoozedUntil')::timestamptz;
  if v_until is null or v_until<=now() then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_reminder_time');
  end if;
  update public.retention_reminders set state='snoozed',snoozed_until=v_until,
    next_delivery_at=v_until,delivery_claimed_at=null,delivery_claim_token=null,
    revision=revision+1 where id=v_r.id returning * into v_r;
  perform private.record_retention_reminder_event(
    v_r.id,'reminder_snoozed',null,'snoozed','Retention reminder snoozed.',
    p_input->>'correlationId',jsonb_build_object('snoozedUntil',v_until)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'reminder',to_jsonb(v_r));
end;
$$;

create or replace function public.complete_retention_reminder(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_r public.retention_reminders%rowtype; v_context jsonb;
begin
  select * into v_r from public.retention_reminders where id=(p_input->>'reminderId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','reminder_not_found'); end if;
  v_context:=private.retention_phase4_context(v_r.project_id,'retention.reminders.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_r from public.retention_reminders where id=v_r.id for update;
  if v_r.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_r.revision);
  end if;
  if v_r.state in ('completed','cancelled') then
    return jsonb_build_object('succeeded',false,'errorCode','reminder_immutable');
  end if;
  update public.retention_reminders set state='completed',completed_at=now(),
    completed_by=auth.uid(),next_delivery_at=null,delivery_claimed_at=null,
    delivery_claim_token=null,revision=revision+1 where id=v_r.id returning * into v_r;
  perform private.record_retention_reminder_event(
    v_r.id,'reminder_completed',null,'completed',
    coalesce(nullif(trim(p_input->>'reason'),''),'Retention reminder completed.'),
    p_input->>'correlationId','{}'::jsonb
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'reminder',to_jsonb(v_r));
end;
$$;

create or replace function public.cancel_retention_reminder(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_r public.retention_reminders%rowtype; v_context jsonb;
begin
  select * into v_r from public.retention_reminders where id=(p_input->>'reminderId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','reminder_not_found'); end if;
  v_context:=private.retention_phase4_context(v_r.project_id,'retention.reminders.manage',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_r from public.retention_reminders where id=v_r.id for update;
  if v_r.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update','currentRevision',v_r.revision);
  end if;
  if v_r.state in ('completed','cancelled') then
    return jsonb_build_object('succeeded',false,'errorCode','reminder_immutable');
  end if;
  if nullif(trim(coalesce(p_input->>'reason','')),'') is null then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_reminder_state');
  end if;
  update public.retention_reminders set state='cancelled',cancelled_at=now(),
    cancelled_by=auth.uid(),cancellation_reason=trim(p_input->>'reason'),
    next_delivery_at=null,delivery_claimed_at=null,delivery_claim_token=null,
    revision=revision+1 where id=v_r.id returning * into v_r;
  perform private.record_retention_reminder_event(
    v_r.id,'reminder_cancelled',null,'cancelled',v_r.cancellation_reason,
    p_input->>'correlationId','{}'::jsonb
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'reminder',to_jsonb(v_r));
end;
$$;

create or replace function public.list_retention_reminders(
  p_project_id uuid,p_limit integer default 200,p_state text default null
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v_context jsonb;
begin
  v_context:=private.retention_phase4_context(p_project_id,'retention.view',false);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'reminders',coalesce((
    select jsonb_agg(to_jsonb(r) order by r.due_at,r.id)
    from (select * from public.retention_reminders where project_id=p_project_id
      and (p_state is null or state=p_state)
      order by due_at,id limit least(greatest(coalesce(p_limit,200),1),1000)) r
  ),'[]'::jsonb));
end;
$$;

create or replace function public.get_retention_reminder_events(
  p_reminder_id uuid,p_limit integer default 200
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v_r public.retention_reminders%rowtype; v_context jsonb;
begin
  select * into v_r from public.retention_reminders where id=p_reminder_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','reminder_not_found'); end if;
  v_context:=private.retention_phase4_context(v_r.project_id,'retention.view',false);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'events',coalesce((
    select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id)
    from (select * from public.retention_reminder_events where reminder_id=p_reminder_id
      order by occurred_at desc,id desc limit least(greatest(coalesce(p_limit,200),1),1000)) e
  ),'[]'::jsonb));
end;
$$;

create or replace function public.select_due_retention_reminders(
  p_limit integer default 100,p_worker_id text default 'retention-reminder-dispatcher'
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_ids uuid[]; v_token uuid:=gen_random_uuid();
begin
  if auth.role()<>'service_role' then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  with candidates as (
    select r.id from public.retention_reminders r
    where r.state in ('scheduled','due','failed','snoozed')
      and coalesce(r.next_delivery_at,r.due_at)<=now()
      and r.attempt_count<r.maximum_attempts
      and (r.delivery_claimed_at is null or r.delivery_claimed_at<now()-interval '15 minutes')
    order by coalesce(r.next_delivery_at,r.due_at),r.id
    limit least(greatest(coalesce(p_limit,100),1),500)
    for update skip locked
  ), claimed as (
    update public.retention_reminders r set
      state='queued',delivery_claimed_at=now(),delivery_claim_token=v_token,
      escalation_level=case
        when r.escalation_after_days is not null and r.escalation_level=0
          and r.due_at+make_interval(days=>r.escalation_after_days)<=now()
        then 1 else r.escalation_level end,
      revision=revision+1
    from candidates c where r.id=c.id
    returning r.id
  ) select array_agg(id) into v_ids from claimed;
  perform private.record_retention_reminder_event(
    r.id,'reminder_due',null,'due','Retention reminder became due.',
    v_token::text,jsonb_build_object('contractualDueDate',r.contractual_due_date)
  ) from public.retention_reminders r where r.id=any(coalesce(v_ids,'{}'::uuid[]));
  perform private.record_retention_reminder_event(
    r.id,'reminder_escalated','due','due','Retention reminder escalated.',
    v_token::text,jsonb_build_object('escalationLevel',r.escalation_level)
  ) from public.retention_reminders r
  where r.id=any(coalesce(v_ids,'{}'::uuid[])) and r.escalation_level>0;
  perform private.record_retention_reminder_event(
    r.id,'delivery_queued',null,'queued','Retention reminder queued for delivery.',
    v_token::text,jsonb_build_object('workerId',p_worker_id,'claimToken',v_token)
  ) from public.retention_reminders r where r.id=any(coalesce(v_ids,'{}'::uuid[]));
  return jsonb_build_object('succeeded',true,'errorCode',null,'claimToken',v_token,
    'reminders',coalesce((select jsonb_agg(to_jsonb(r) order by r.due_at,r.id)
      from public.retention_reminders r where r.id=any(coalesce(v_ids,'{}'::uuid[]))),'[]'::jsonb));
end;
$$;

create or replace function public.record_retention_reminder_delivery_result(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_r public.retention_reminders%rowtype; v_success boolean; v_next_date date;
  v_new public.retention_reminders%rowtype;
begin
  if auth.role()<>'service_role' then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select * into v_r from public.retention_reminders
  where id=(p_input->>'reminderId')::uuid for update;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','reminder_not_found'); end if;
  if v_r.state<>'queued' or v_r.delivery_claim_token is distinct from (p_input->>'claimToken')::uuid then
    return jsonb_build_object('succeeded',false,'errorCode','delivery_not_confirmed');
  end if;
  v_success:=coalesce((p_input->>'delivered')::boolean,false);
  if v_success then
    update public.retention_reminders set state='sent',last_delivery_at=now(),
      attempt_count=attempt_count+1,next_delivery_at=null,failure_reason=null,
      delivery_claimed_at=null,delivery_claim_token=null,revision=revision+1
    where id=v_r.id returning * into v_r;
    perform private.record_retention_reminder_event(
      v_r.id,'delivery_succeeded','queued','sent','Reminder delivery confirmed.',
      p_input->>'claimToken',jsonb_build_object('adapter',p_input->>'adapter')
    );
    if v_r.recurrence_type<>'none' then
      v_next_date:=case v_r.recurrence_type
        when 'daily' then v_r.contractual_due_date+1
        when 'weekly' then v_r.contractual_due_date+7
        when 'monthly' then (v_r.contractual_due_date+interval '1 month')::date
        else v_r.contractual_due_date+v_r.recurrence_interval end;
      insert into public.retention_reminders(
        organization_id,project_id,schedule_id,retention_claim_id,reminder_type,
        contractual_due_date,organization_timezone,due_at,assigned_user_id,
        assigned_permission_key,use_project_owner_fallback,recurrence_type,
        recurrence_interval,escalation_after_days,escalation_level,state,
        next_delivery_at,maximum_attempts,occurrence_key,created_by
      ) values (
        v_r.organization_id,v_r.project_id,v_r.schedule_id,v_r.retention_claim_id,
        v_r.reminder_type,v_next_date,v_r.organization_timezone,
        (v_next_date::timestamp at time zone v_r.organization_timezone),
        v_r.assigned_user_id,v_r.assigned_permission_key,v_r.use_project_owner_fallback,
        v_r.recurrence_type,v_r.recurrence_interval,v_r.escalation_after_days,
        v_r.escalation_level,'scheduled',
        (v_next_date::timestamp at time zone v_r.organization_timezone),
        v_r.maximum_attempts,format('recurrence:%s:%s',v_r.id,v_next_date),v_r.created_by
      ) on conflict(schedule_id,occurrence_key) do nothing returning * into v_new;
      if v_new.id is not null then
        perform private.record_retention_reminder_event(
          v_new.id,'recurrence_generated',null,'scheduled','Recurring reminder generated.',
          p_input->>'claimToken',jsonb_build_object('sourceReminderId',v_r.id)
        );
      end if;
    end if;
  else
    update public.retention_reminders set state='failed',attempt_count=attempt_count+1,
      failure_reason=left(coalesce(p_input->>'failureReason','delivery_failed'),1000),
      next_delivery_at=case when attempt_count+1<maximum_attempts
        then now()+make_interval(mins=>least((attempt_count+1)*5,60)) else null end,
      delivery_claimed_at=null,delivery_claim_token=null,revision=revision+1
    where id=v_r.id returning * into v_r;
    perform private.record_retention_reminder_event(
      v_r.id,'delivery_failed','queued','failed',v_r.failure_reason,
      p_input->>'claimToken',jsonb_build_object('attemptCount',v_r.attempt_count)
    );
  end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'reminder',to_jsonb(v_r),
    'recurrence',case when v_new.id is null then null else to_jsonb(v_new) end);
end;
$$;

-- Narrow Phase 3 integration: preserve the approved Phase 3 implementation
-- verbatim behind a private-to-Phase-4 public function name, then add an
-- eligibility gate only when the signed Phase 4 internal claim is present.
alter function public.submit_retention_claim(uuid,bigint,text,text)
  rename to submit_retention_claim_phase3_pre_schedule;
revoke all on function public.submit_retention_claim_phase3_pre_schedule(uuid,bigint,text,text)
  from public,anon,authenticated,service_role;

create or replace function public.protect_retention_claim_mutation()
returns trigger language plpgsql set search_path=public
as $$
begin
  if coalesce(current_setting('app.retention_phase4_submission_write',true),'')='true' then
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'Retention Claims cannot be hard-deleted.' using errcode='55000';
  end if;
  if old.status<>'draft' then
    raise exception 'Retention Claim is immutable after leaving Draft.' using errcode='55000';
  end if;
  if new.organization_id<>old.organization_id or new.project_id<>old.project_id
    or new.id<>old.id or new.claim_number<>old.claim_number
    or new.created_by<>old.created_by or new.created_at<>old.created_at then
    raise exception 'Retention Claim identity is immutable.' using errcode='55000';
  end if;
  if new.status not in ('draft','submitted','cancelled_draft') then
    raise exception 'Invalid Retention Claim transition.' using errcode='55000';
  end if;
  if new.status='submitted' and (
    not exists(select 1 from public.retention_claim_allocations a where a.retention_claim_id=old.id)
    or new.subtotal_excl_tax<>(select round(coalesce(sum(a.allocation_amount),0),2)
      from public.retention_claim_allocations a where a.retention_claim_id=old.id)
    or exists(select 1 from public.retention_claim_allocations a
      where a.retention_claim_id=old.id and (
        a.origin_claim_number_snapshot is null or a.origin_claim_status_snapshot is null
        or a.origin_claim_created_at_snapshot is null or a.origin_claim_updated_at_snapshot is null
        or a.retention_method_snapshot is null or a.retention_rate_snapshot is null
        or a.retention_withheld_snapshot is null or a.retention_released_snapshot is null
        or a.retention_held_to_date_snapshot is null or a.retention_released_to_date_snapshot is null
        or a.retention_balance_snapshot is null
        or a.existing_submitted_allocation_before is null or a.remaining_after_allocation is null
        or a.gross_claim_amount_snapshot is null or a.net_claim_excl_gst_snapshot is null
        or a.gst_amount_snapshot is null or a.total_payable_snapshot is null
        or a.project_state_hash_snapshot is null or a.origin_state_hash_snapshot is null
        or a.submitted_by is null or a.submitted_at is null
      ))
  ) then
    raise exception 'Submitted Retention Claim snapshot evidence is incomplete.' using errcode='55000';
  end if;
  return new;
end;
$$;

create or replace function public.protect_retention_claim_allocation_mutation()
returns trigger language plpgsql set search_path=public
as $$
declare v_claim_id uuid:=case when tg_op='DELETE' then old.retention_claim_id else new.retention_claim_id end;
  v_status text;
begin
  if coalesce(current_setting('app.retention_phase4_submission_write',true),'')='true' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  select status into v_status from public.retention_claims where id=v_claim_id;
  if v_status is distinct from 'draft' then
    raise exception 'Retention Claim allocations are immutable outside Draft.' using errcode='55000';
  end if;
  if tg_op='UPDATE' and (
    new.organization_id<>old.organization_id or new.project_id<>old.project_id
    or new.retention_claim_id<>old.retention_claim_id
    or new.originating_payment_claim_id<>old.originating_payment_claim_id
    or new.created_by<>old.created_by or new.created_at<>old.created_at
  ) then raise exception 'Retention Claim allocation identity is immutable.' using errcode='55000'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.refresh_retention_claim_eligibility_state(
  p_retention_claim_id uuid,p_expected_draft_revision bigint,p_correlation_id text default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_c public.retention_claims%rowtype; v_context jsonb; v_state jsonb;
begin
  select * into v_c from public.retention_claims where id=p_retention_claim_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','claim_not_found'); end if;
  v_context:=private.retention_phase4_context(v_c.project_id,'retention.claims.create',true);
  if not coalesce((v_context->>'succeeded')::boolean,false) then return v_context; end if;
  select * into v_c from public.retention_claims where id=v_c.id for update;
  if v_c.status<>'draft' then return jsonb_build_object('succeeded',false,'errorCode','claim_not_draft'); end if;
  if v_c.draft_revision<>p_expected_draft_revision then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentDraftRevision',v_c.draft_revision);
  end if;
  v_state:=private.retention_eligibility_state(v_c.project_id);
  update public.retention_claims set
    last_eligibility_state_hash=v_state->>'eligibilityStateHash',
    last_position_state_hash=v_state->>'positionStateHash',
    draft_revision=draft_revision+1
  where id=v_c.id returning * into v_c;
  perform private.record_retention_claim_event(
    v_c.organization_id,v_c.project_id,v_c.id,'draft_updated','draft','draft',auth.uid(),
    'Retention eligibility state refreshed.',p_correlation_id,
    jsonb_build_object('eligibilityStateHash',v_c.last_eligibility_state_hash,
      'positionStateHash',v_c.last_position_state_hash,'draftRevision',v_c.draft_revision)
  );
  return jsonb_build_object('succeeded',true,'errorCode',null,'claim',
    private.retention_claim_header_json(v_c.id),'eligibility',v_state,
    'eligibilityStateHash',v_c.last_eligibility_state_hash);
end;
$$;

create or replace function public.submit_retention_claim(
  p_retention_claim_id uuid,p_expected_draft_revision bigint,
  p_expected_position_state_hash text,p_correlation_id text default null,
  p_expected_eligibility_state_hash text default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_c public.retention_claims%rowtype; v_state jsonb; v_hash text;
  v_invalid jsonb; v_result jsonb;
begin
  if not private.retention_phase4_gate_enabled() then
    return public.submit_retention_claim_phase3_pre_schedule(
      p_retention_claim_id,p_expected_draft_revision,
      p_expected_position_state_hash,p_correlation_id
    );
  end if;
  select * into v_c from public.retention_claims where id=p_retention_claim_id for update;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','claim_not_found'); end if;
  v_state:=private.retention_eligibility_state(v_c.project_id);
  v_hash:=v_state->>'eligibilityStateHash';
  if p_expected_eligibility_state_hash is null
    or p_expected_eligibility_state_hash<>v_hash
    or v_c.last_eligibility_state_hash<>v_hash then
    return private.reject_retention_claim_submission(
      v_c.id,'stale_schedule',jsonb_build_object(
        'draftEligibilityStateHash',v_c.last_eligibility_state_hash,
        'expectedEligibilityStateHash',p_expected_eligibility_state_hash,
        'currentEligibilityStateHash',v_hash,'origins',v_state->'origins'
      ),p_correlation_id
    );
  end if;
  select jsonb_agg(jsonb_build_object(
    'originatingPaymentClaimId',a.originating_payment_claim_id,
    'proposedAllocation',a.allocation_amount,
    'committedRetention',coalesce((e->>'committedRetention')::numeric,0),
    'currentEligibleRetention',coalesce((e->>'currentEligibleRetention')::numeric,0),
    'availableRetention',coalesce((e->>'availableRetention')::numeric,0),
    'scheduleIds',coalesce(e->'scheduleIds','[]'::jsonb)
  ) order by a.originating_payment_claim_id)
  into v_invalid
  from public.retention_claim_allocations a
  left join lateral (
    select x as e from jsonb_array_elements(v_state->'origins') x
    where (x->>'originatingPaymentClaimId')::uuid=a.originating_payment_claim_id
  ) q on true
  where a.retention_claim_id=v_c.id
    and (
      coalesce((e->>'currentEligibleRetention')::numeric,0)=0
      or coalesce((e->>'committedRetention')::numeric,0)+a.allocation_amount
        >coalesce((e->>'currentEligibleRetention')::numeric,0)
    );
  if v_invalid is not null then
    return private.reject_retention_claim_submission(
      v_c.id,
      case when exists(select 1 from jsonb_array_elements(v_invalid) x
        where coalesce((x->>'currentEligibleRetention')::numeric,0)=0)
        then 'retention_not_eligible' else 'allocation_exceeds_eligibility' end,
      jsonb_build_object('origins',v_invalid,'eligibilityStateHash',v_hash),
      p_correlation_id
    );
  end if;
  v_result:=public.submit_retention_claim_phase3_pre_schedule(
    p_retention_claim_id,p_expected_draft_revision,
    p_expected_position_state_hash,p_correlation_id
  );
  if not coalesce((v_result->>'succeeded')::boolean,false) then return v_result; end if;
  perform set_config('app.retention_phase4_submission_write','true',true);
  update public.retention_claim_allocations a set
    eligibility_state_hash_snapshot=v_hash,
    eligibility_schedule_ids_snapshot=coalesce((
      select array_agg(sid.value::uuid order by sid.value::uuid)
      from jsonb_array_elements(v_state->'origins') x,
           jsonb_array_elements_text(x->'scheduleIds') as sid(value)
      where (x->>'originatingPaymentClaimId')::uuid=a.originating_payment_claim_id
    ),'{}'::uuid[])
  where a.retention_claim_id=v_c.id;
  update public.retention_claims set submission_eligibility_state_hash=v_hash
  where id=v_c.id;
  perform set_config('app.retention_phase4_submission_write','',true);
  return v_result || jsonb_build_object('eligibilityStateHash',v_hash,'eligibility',v_state);
end;
$$;

alter table public.project_retention_release_schedules enable row level security;
alter table public.project_retention_release_schedules force row level security;
alter table public.project_retention_schedule_origins enable row level security;
alter table public.project_retention_schedule_origins force row level security;
alter table public.retention_schedule_events enable row level security;
alter table public.retention_schedule_events force row level security;
alter table public.retention_reminders enable row level security;
alter table public.retention_reminders force row level security;
alter table public.retention_reminder_events enable row level security;
alter table public.retention_reminder_events force row level security;

create policy "Retention viewers can read release schedules"
on public.project_retention_release_schedules for select to authenticated
using (public.has_org_permission(organization_id,'retention.view'));
create policy "Retention viewers can read schedule origins"
on public.project_retention_schedule_origins for select to authenticated
using (public.has_org_permission(organization_id,'retention.view'));
create policy "Retention viewers can read schedule events"
on public.retention_schedule_events for select to authenticated
using (public.has_org_permission(organization_id,'retention.view'));
create policy "Retention viewers can read reminders"
on public.retention_reminders for select to authenticated
using (public.has_org_permission(organization_id,'retention.view'));
create policy "Retention viewers can read reminder events"
on public.retention_reminder_events for select to authenticated
using (public.has_org_permission(organization_id,'retention.view'));

revoke all on public.project_retention_release_schedules from public,anon,authenticated;
revoke all on public.project_retention_schedule_origins from public,anon,authenticated;
revoke all on public.retention_schedule_events from public,anon,authenticated;
revoke all on public.retention_reminders from public,anon,authenticated;
revoke all on public.retention_reminder_events from public,anon,authenticated;
grant select on public.project_retention_release_schedules to service_role;
grant select on public.project_retention_schedule_origins to service_role;
grant select on public.retention_schedule_events to service_role;
grant select on public.retention_reminders to service_role;
grant select on public.retention_reminder_events to service_role;

revoke all on function private.retention_phase4_gate_enabled() from public,anon,authenticated;
revoke all on function private.retention_phase4_context(uuid,text,boolean) from public,anon,authenticated;
revoke all on function private.record_retention_schedule_event(uuid,text,text,text,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function private.record_retention_reminder_event(uuid,text,text,text,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function private.retention_schedule_header_json(uuid) from public,anon,authenticated;
revoke all on function private.retention_schedule_origins_json(uuid) from public,anon,authenticated;
revoke all on function private.retention_eligibility_state(uuid) from public,anon,authenticated;
revoke all on function private.generate_activation_reminders(uuid) from public,anon,authenticated;

revoke all on function public.prevent_retention_schedule_event_mutation() from public,anon,authenticated;
revoke all on function public.prevent_retention_reminder_event_mutation() from public,anon,authenticated;
revoke all on function public.protect_retention_schedule_mutation() from public,anon,authenticated;
revoke all on function public.protect_retention_schedule_origin_mutation() from public,anon,authenticated;
revoke all on function public.validate_retention_reminder_assignment() from public,anon,authenticated;

revoke all on function public.get_project_retention_eligibility(uuid) from public,anon;
grant execute on function public.get_project_retention_eligibility(uuid) to authenticated;
revoke all on function public.create_retention_release_schedule(jsonb) from public,anon;
grant execute on function public.create_retention_release_schedule(jsonb) to authenticated;
revoke all on function public.update_retention_release_schedule_draft(jsonb) from public,anon;
grant execute on function public.update_retention_release_schedule_draft(jsonb) to authenticated;
revoke all on function public.add_retention_schedule_origin(jsonb) from public,anon;
grant execute on function public.add_retention_schedule_origin(jsonb) to authenticated;
revoke all on function public.remove_retention_schedule_origin(jsonb) from public,anon;
grant execute on function public.remove_retention_schedule_origin(jsonb) to authenticated;
revoke all on function public.reorder_retention_schedule_origins(jsonb) from public,anon;
grant execute on function public.reorder_retention_schedule_origins(jsonb) to authenticated;
revoke all on function public.confirm_retention_schedule_trigger(jsonb) from public,anon;
grant execute on function public.confirm_retention_schedule_trigger(jsonb) to authenticated;
revoke all on function public.activate_retention_release_schedule(jsonb) from public,anon;
grant execute on function public.activate_retention_release_schedule(jsonb) to authenticated;
revoke all on function public.cancel_retention_release_schedule(jsonb) from public,anon;
grant execute on function public.cancel_retention_release_schedule(jsonb) to authenticated;
revoke all on function public.complete_retention_release_schedule(jsonb) from public,anon;
grant execute on function public.complete_retention_release_schedule(jsonb) to authenticated;
revoke all on function public.get_retention_release_schedule(uuid) from public,anon;
grant execute on function public.get_retention_release_schedule(uuid) to authenticated;
revoke all on function public.list_retention_release_schedules(uuid,integer,integer) from public,anon;
grant execute on function public.list_retention_release_schedules(uuid,integer,integer) to authenticated;
revoke all on function public.get_retention_schedule_events(uuid,integer) from public,anon;
grant execute on function public.get_retention_schedule_events(uuid,integer) to authenticated;

revoke all on function public.create_retention_reminder(jsonb) from public,anon;
grant execute on function public.create_retention_reminder(jsonb) to authenticated;
revoke all on function public.update_retention_reminder(jsonb) from public,anon;
grant execute on function public.update_retention_reminder(jsonb) to authenticated;
revoke all on function public.snooze_retention_reminder(jsonb) from public,anon;
grant execute on function public.snooze_retention_reminder(jsonb) to authenticated;
revoke all on function public.complete_retention_reminder(jsonb) from public,anon;
grant execute on function public.complete_retention_reminder(jsonb) to authenticated;
revoke all on function public.cancel_retention_reminder(jsonb) from public,anon;
grant execute on function public.cancel_retention_reminder(jsonb) to authenticated;
revoke all on function public.list_retention_reminders(uuid,integer,text) from public,anon;
grant execute on function public.list_retention_reminders(uuid,integer,text) to authenticated;
revoke all on function public.get_retention_reminder_events(uuid,integer) from public,anon;
grant execute on function public.get_retention_reminder_events(uuid,integer) to authenticated;

revoke all on function public.select_due_retention_reminders(integer,text)
  from public,anon,authenticated;
grant execute on function public.select_due_retention_reminders(integer,text) to service_role;
revoke all on function public.record_retention_reminder_delivery_result(jsonb)
  from public,anon,authenticated;
grant execute on function public.record_retention_reminder_delivery_result(jsonb) to service_role;

revoke all on function public.refresh_retention_claim_eligibility_state(uuid,bigint,text)
  from public,anon;
grant execute on function public.refresh_retention_claim_eligibility_state(uuid,bigint,text)
  to authenticated;
revoke all on function public.submit_retention_claim(uuid,bigint,text,text,text)
  from public,anon;
grant execute on function public.submit_retention_claim(uuid,bigint,text,text,text)
  to authenticated;

commit;
