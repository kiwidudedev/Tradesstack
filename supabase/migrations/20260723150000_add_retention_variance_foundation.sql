begin;

-- Phase 5 is an additive Retention-domain module. It reads persisted
-- project_claims through the approved position/eligibility functions and never
-- writes Payment Claims or submitted Retention Claim allocations.

create table public.retention_variances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  originating_payment_claim_id uuid not null,
  primary_type text not null,
  contributing_conditions text[] not null default '{}'::text[],
  state text not null,
  severity text not null,
  is_blocking boolean not null,
  current_ownership numeric(14,2) not null,
  current_eligibility numeric(14,2) not null,
  committed_retention numeric(14,2) not null,
  ownership_variance numeric(14,2) not null,
  eligibility_variance numeric(14,2) not null,
  diagnostic_remaining numeric(14,2) not null,
  latest_phase2_state_hash text not null,
  latest_phase4_eligibility_hash text not null,
  committed_allocation_hash text not null,
  prior_phase2_state_hash text null,
  prior_phase4_eligibility_hash text null,
  prior_committed_allocation_hash text null,
  affected_retention_claim_ids uuid[] not null default '{}'::uuid[],
  affected_allocation_ids uuid[] not null default '{}'::uuid[],
  relied_schedule_ids uuid[] not null default '{}'::uuid[],
  current_schedule_ids uuid[] not null default '{}'::uuid[],
  assigned_user_id uuid null references auth.users(id) on delete restrict,
  assigned_role text null,
  due_date date null,
  escalation_level integer not null default 0,
  last_notification_at timestamptz null,
  resolution_type text null,
  resolution_reason text null,
  resolution_evidence jsonb null,
  corrective_reference_id text null,
  corrective_amount_proposed numeric(14,2) null,
  evidence_recorded_at timestamptz null,
  resolution_proposed_by uuid null references auth.users(id) on delete restrict,
  resolution_approved_by uuid null references auth.users(id) on delete restrict,
  resolved_at timestamptz null,
  override_approved_amount numeric(14,2) null,
  override_basis_hash text null,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  last_correlation_id text null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_variances_org_project_origin_fkey
    foreign key (organization_id,project_id,originating_payment_claim_id)
    references public.project_claims(organization_id,project_id,id) on delete restrict,
  constraint retention_variances_origin_unique
    unique (organization_id,project_id,originating_payment_claim_id),
  constraint retention_variances_type_check check (primary_type in (
    'ownership_reduced','eligibility_reduced','origin_payment_claim_cancelled',
    'schedule_changed','schedule_cancelled','legacy_reconciliation_conflict',
    'xero_local_financial_divergence','corrective_transaction_pending'
  )),
  constraint retention_variances_condition_check check (
    contributing_conditions <@ array[
      'ownership_reduced','eligibility_reduced','origin_payment_claim_cancelled',
      'schedule_changed','schedule_cancelled','legacy_reconciliation_conflict',
      'xero_local_financial_divergence','corrective_transaction_pending'
    ]::text[]
  ),
  constraint retention_variances_state_check check (state in (
    'warning','reconciliation_required','over_allocated','resolution_pending',
    'resolved','accepted_contractual_override'
  )),
  constraint retention_variances_severity_check
    check (severity in ('low','medium','high','critical')),
  constraint retention_variances_blocking_consistency check (
    is_blocking = (state in ('reconciliation_required','over_allocated','resolution_pending'))
  ),
  constraint retention_variances_amounts_nonnegative check (
    current_ownership >= 0 and current_eligibility >= 0 and committed_retention >= 0
  ),
  constraint retention_variances_corrective_amount check (
    corrective_amount_proposed is null or corrective_amount_proposed > 0
  ),
  constraint retention_variances_override_amount check (
    override_approved_amount is null or override_approved_amount >= 0
  ),
  constraint retention_variances_hashes_shape check (
    latest_phase2_state_hash ~ '^[a-f0-9]{64}$'
    and latest_phase4_eligibility_hash ~ '^[a-f0-9]{64}$'
    and committed_allocation_hash ~ '^[a-f0-9]{64}$'
    and (prior_phase2_state_hash is null or prior_phase2_state_hash ~ '^[a-f0-9]{64}$')
    and (prior_phase4_eligibility_hash is null or prior_phase4_eligibility_hash ~ '^[a-f0-9]{64}$')
    and (prior_committed_allocation_hash is null or prior_committed_allocation_hash ~ '^[a-f0-9]{64}$')
    and (override_basis_hash is null or override_basis_hash ~ '^[a-f0-9]{64}$')
  ),
  constraint retention_variances_revision_positive check (revision > 0),
  constraint retention_variances_escalation_nonnegative check (escalation_level >= 0),
  constraint retention_variances_evidence_object check (
    resolution_evidence is null or jsonb_typeof(resolution_evidence)='object'
  )
);

create index retention_variances_project_state_idx
  on public.retention_variances(project_id,is_blocking,state,last_detected_at desc,id);
create index retention_variances_org_stale_idx
  on public.retention_variances(organization_id,last_evaluated_at,id);
create index retention_variances_assignment_idx
  on public.retention_variances(organization_id,assigned_user_id,due_date)
  where state not in ('resolved','accepted_contractual_override');

create table public.retention_variance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  variance_id uuid null,
  originating_payment_claim_id uuid null,
  event_type text not null,
  previous_state text null,
  new_state text null,
  previous_severity text null,
  new_severity text null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  reason text not null,
  correlation_id text null,
  phase2_state_hash text null,
  phase4_eligibility_hash text null,
  committed_allocation_hash text null,
  financial_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_variance_events_variance_fkey
    foreign key (variance_id) references public.retention_variances(id) on delete restrict,
  constraint retention_variance_events_org_project_origin_fkey
    foreign key (organization_id,project_id,originating_payment_claim_id)
    references public.project_claims(organization_id,project_id,id) on delete restrict,
  constraint retention_variance_events_type_check check (event_type in (
    'variance_detected','variance_updated','severity_changed','variance_assigned',
    'resolution_proposed','resolution_rejected','resolution_pending',
    'variance_resolved','contractual_override_accepted','variance_reopened',
    'variance_auto_cleared','scan_failed','permission_denied'
  )),
  constraint retention_variance_events_reason_not_blank
    check (char_length(trim(reason)) between 1 and 1000),
  constraint retention_variance_events_payloads_object
    check (jsonb_typeof(financial_snapshot)='object' and jsonb_typeof(metadata)='object')
);

create index retention_variance_events_variance_idx
  on public.retention_variance_events(variance_id,occurred_at desc,id desc);
create index retention_variance_events_project_idx
  on public.retention_variance_events(project_id,occurred_at desc,id desc);

create table public.retention_variance_scan_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete restrict,
  scope text not null default 'enabled_projects',
  state text not null default 'running',
  worker_id text not null,
  correlation_id text not null,
  after_project_id uuid null,
  next_project_id uuid null,
  project_limit integer not null,
  project_count integer not null default 0,
  origin_count integer not null default 0,
  detected_count integer not null default 0,
  updated_count integer not null default 0,
  cleared_count integer not null default 0,
  error_count integer not null default 0,
  error_code text null,
  error_message text null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint retention_variance_scan_runs_state_check
    check (state in ('running','completed','failed')),
  constraint retention_variance_scan_runs_limit_check
    check (project_limit between 1 and 500),
  constraint retention_variance_scan_runs_counts_check check (
    project_count>=0 and origin_count>=0 and detected_count>=0
    and updated_count>=0 and cleared_count>=0 and error_count>=0
  ),
  constraint retention_variance_scan_runs_correlation_unique unique(correlation_id)
);

create table public.retention_variance_scan_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  queue_state text not null default 'pending',
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_error_code text null,
  last_error_message text null,
  last_attempt_at timestamptz null,
  last_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_variance_scan_queue_project_fkey
    foreign key(organization_id,project_id)
    references public.organization_projects(organization_id,id) on delete cascade,
  constraint retention_variance_scan_queue_project_unique
    unique(organization_id,project_id),
  constraint retention_variance_scan_queue_state_check
    check(queue_state in ('pending','claimed','retry_scheduled','completed','dead_lettered')),
  constraint retention_variance_scan_queue_counts_check
    check(priority>=0 and attempt_count>=0 and max_attempts>0)
);

create index retention_variance_scan_queue_claimable_idx
  on public.retention_variance_scan_queue(
    queue_state,available_at,priority desc,project_id
  ) where queue_state in ('pending','claimed','retry_scheduled');

create or replace function private.retention_phase5_gate_enabled()
returns boolean language sql stable security invoker set search_path=public
as $$
  select
    coalesce(current_setting('request.jwt.claim.retention_phase5_internal',true),'')='true'
    or coalesce(
      coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
        ->>'retention_phase5_internal','false'
    )='true';
$$;

create or replace function private.retention_phase5_context(
  p_project_id uuid,p_permission_key text,p_require_internal_gate boolean default true
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v_actor uuid:=auth.uid(); v_org uuid; v_mode text; v_enabled boolean;
begin
  if v_actor is null then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select p.organization_id into v_org
  from public.organization_projects p
  join public.organization_members m
    on m.organization_id=p.organization_id and m.user_id=v_actor
  where p.id=p_project_id;
  if v_org is null then
    return jsonb_build_object('succeeded',false,'errorCode','project_not_found');
  end if;
  if not public.has_org_permission(v_org,p_permission_key) then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select c.enabled into v_enabled from public.organization_capabilities c
  where c.organization_id=v_org and c.capability_key='retention_management';
  if not coalesce(v_enabled,false) then
    return jsonb_build_object('succeeded',false,'errorCode','capability_disabled');
  end if;
  select s.mode into v_mode from public.project_retention_workflow_states s
  where s.organization_id=v_org and s.project_id=p_project_id;
  if coalesce(v_mode,'legacy') not in ('observe','ready','cutover','blocked')
    or (p_require_internal_gate and not private.retention_phase5_gate_enabled()) then
    return jsonb_build_object('succeeded',false,'errorCode','project_mode_not_supported',
      'workflowMode',coalesce(v_mode,'legacy'));
  end if;
  return jsonb_build_object('succeeded',true,'organizationId',v_org,
    'projectId',p_project_id,'actorUserId',v_actor,'workflowMode',v_mode);
end;
$$;

create or replace function public.prevent_retention_variance_event_mutation()
returns trigger language plpgsql set search_path=public
as $$ begin raise exception 'Retention variance events are append-only.' using errcode='55000'; end; $$;
create trigger retention_variance_events_append_only
before update or delete on public.retention_variance_events
for each row execute function public.prevent_retention_variance_event_mutation();

create or replace function public.protect_retention_variance_mutation()
returns trigger language plpgsql set search_path=public
as $$
begin
  if coalesce(current_setting('app.retention_phase5_internal_write',true),'')<>'true' then
    raise exception 'Retention variances may only be changed by controlled services.'
      using errcode='55000';
  end if;
  if tg_op='DELETE' then
    raise exception 'Retention variances cannot be hard-deleted.' using errcode='55000';
  end if;
  return new;
end;
$$;
create trigger retention_variance_mutation_guard
before insert or update or delete on public.retention_variances
for each row execute function public.protect_retention_variance_mutation();

create or replace function public.validate_retention_variance_assignment()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.assigned_user_id is not null and not exists(
    select 1 from public.organization_members m
    where m.organization_id=new.organization_id and m.user_id=new.assigned_user_id
  ) then
    raise exception 'Retention variance assignee must belong to the organization.'
      using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger retention_variance_assignment_guard
before insert or update of organization_id,assigned_user_id on public.retention_variances
for each row execute function public.validate_retention_variance_assignment();

create or replace function private.record_retention_variance_event(
  p_variance_id uuid,p_event_type text,p_previous_state text,p_new_state text,
  p_previous_severity text,p_new_severity text,p_reason text,
  p_correlation_id text default null,p_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v public.retention_variances%rowtype; v_id uuid;
begin
  select * into v from public.retention_variances where id=p_variance_id;
  if not found then return null; end if;
  insert into public.retention_variance_events(
    organization_id,project_id,variance_id,originating_payment_claim_id,event_type,
    previous_state,new_state,previous_severity,new_severity,actor_user_id,reason,
    correlation_id,phase2_state_hash,phase4_eligibility_hash,
    committed_allocation_hash,financial_snapshot,metadata
  ) values (
    v.organization_id,v.project_id,v.id,v.originating_payment_claim_id,p_event_type,
    p_previous_state,p_new_state,p_previous_severity,p_new_severity,auth.uid(),
    coalesce(nullif(trim(p_reason),''),p_event_type),
    nullif(trim(coalesce(p_correlation_id,'')),''),
    v.latest_phase2_state_hash,v.latest_phase4_eligibility_hash,
    v.committed_allocation_hash,
    jsonb_build_object(
      'currentOwnership',v.current_ownership,
      'currentEligibility',v.current_eligibility,
      'committedRetention',v.committed_retention,
      'ownershipVariance',v.ownership_variance,
      'eligibilityVariance',v.eligibility_variance,
      'diagnosticRemaining',v.diagnostic_remaining
    ),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.retention_variance_snapshot(
  p_project_id uuid,p_originating_payment_claim_id uuid
)
returns jsonb language plpgsql stable security definer set search_path=public,extensions
as $$
declare
  v_origin public.project_claims%rowtype; v_position jsonb; v_eligibility jsonb;
  v_e jsonb; v_committed numeric(14,2); v_claims uuid[]; v_allocations uuid[];
  v_relied uuid[]; v_current_schedules uuid[]; v_committed_payload jsonb;
  v_committed_hash text; v_snapshot_owned numeric(14,2); v_schedule_cancelled boolean;
  v_type text; v_state text; v_severity text; v_blocking boolean:=false;
  v_conditions text[]:='{}'::text[]; v_owned numeric(14,2); v_eligible numeric(14,2);
begin
  select * into v_origin from public.project_claims
  where id=p_originating_payment_claim_id and project_id=p_project_id;
  if not found then
    return jsonb_build_object('succeeded',false,'errorCode','origin_not_found');
  end if;
  v_position:=public.get_project_retention_position_summary(p_project_id);
  v_eligibility:=private.retention_eligibility_state(p_project_id);
  select x into v_e from jsonb_array_elements(coalesce(v_eligibility->'origins','[]'::jsonb)) x
  where (x->>'originatingPaymentClaimId')::uuid=v_origin.id;

  select
    round(coalesce(sum(a.allocation_amount),0),2),
    coalesce(array_agg(distinct c.id order by c.id),'{}'::uuid[]),
    coalesce(array_agg(a.id order by a.id),'{}'::uuid[]),
    coalesce(array(
      select distinct unnest(coalesce(a2.eligibility_schedule_ids_snapshot,'{}'::uuid[]))
      from public.retention_claim_allocations a2
      join public.retention_claims c2 on c2.id=a2.retention_claim_id
      where c2.status='submitted'
        and a2.originating_payment_claim_id=v_origin.id order by 1
    ),'{}'::uuid[]),
    round(coalesce(max(a.retention_withheld_snapshot),v_origin.retention_withheld_amount,0),2),
    coalesce(jsonb_agg(jsonb_build_object(
      'retentionClaimId',c.id,'retentionClaimStatus',c.status,
      'retentionClaimSubmittedAt',c.submitted_at,'allocationId',a.id,
      'originatingPaymentClaimId',a.originating_payment_claim_id,
      'allocationAmount',a.allocation_amount,'allocationSubmittedAt',a.submitted_at,
      'originStateHashSnapshot',a.origin_state_hash_snapshot,
      'eligibilityStateHashSnapshot',a.eligibility_state_hash_snapshot,
      'scheduleIds',coalesce(to_jsonb(a.eligibility_schedule_ids_snapshot),'[]'::jsonb)
    ) order by c.id,a.id),'[]'::jsonb)
  into v_committed,v_claims,v_allocations,v_relied,v_snapshot_owned,v_committed_payload
  from public.retention_claim_allocations a
  join public.retention_claims c on c.id=a.retention_claim_id
  where c.status='submitted' and a.originating_payment_claim_id=v_origin.id;

  v_owned:=greatest(round(coalesce(v_origin.retention_withheld_amount,0),2),0);
  v_eligible:=least(v_owned,greatest(round(coalesce((v_e->>'currentEligibleRetention')::numeric,0),2),0));
  v_current_schedules:=coalesce(array(
    select jsonb_array_elements_text(coalesce(v_e->'scheduleIds','[]'::jsonb))::uuid order by 1
  ),'{}'::uuid[]);
  v_committed_hash:=encode(extensions.digest(convert_to(
    jsonb_build_object('originatingPaymentClaimId',v_origin.id,'allocations',v_committed_payload)::text,
    'UTF8'),'sha256'),'hex');
  select exists(
    select 1 from public.project_retention_release_schedules s
    where s.id=any(v_relied) and s.status='cancelled'
  ) into v_schedule_cancelled;

  if v_committed>0 and v_origin.status='Cancelled' then
    v_conditions:=array_append(v_conditions,'origin_payment_claim_cancelled');
  end if;
  if v_committed>v_owned then v_conditions:=array_append(v_conditions,'ownership_reduced'); end if;
  if v_committed>v_eligible then v_conditions:=array_append(v_conditions,'eligibility_reduced'); end if;
  if v_schedule_cancelled then v_conditions:=array_append(v_conditions,'schedule_cancelled'); end if;
  if v_committed>0 and v_relied is distinct from v_current_schedules then
    v_conditions:=array_append(v_conditions,'schedule_changed');
  end if;
  if v_committed>0 and v_owned<>v_snapshot_owned
    and not ('ownership_reduced'=any(v_conditions)) then
    v_conditions:=array_append(v_conditions,'ownership_reduced');
  end if;

  if 'origin_payment_claim_cancelled'=any(v_conditions) then
    v_type:='origin_payment_claim_cancelled';
    v_state:=case when v_committed>v_owned then 'over_allocated'
      else 'reconciliation_required' end;
    v_severity:=case when v_committed>v_owned then 'critical' else 'high' end;
    v_blocking:=true;
  elsif v_committed>v_owned then
    v_type:='ownership_reduced'; v_state:='over_allocated';
    v_severity:='critical'; v_blocking:=true;
  elsif v_committed>v_eligible then
    v_type:=case when v_schedule_cancelled then 'schedule_cancelled'
      else 'eligibility_reduced' end;
    v_state:='reconciliation_required'; v_severity:='high'; v_blocking:=true;
  elsif 'ownership_reduced'=any(v_conditions) then
    v_type:='ownership_reduced'; v_state:='warning'; v_severity:='medium';
  elsif 'schedule_cancelled'=any(v_conditions) then
    v_type:='schedule_cancelled'; v_state:='warning'; v_severity:='medium';
  elsif 'schedule_changed'=any(v_conditions) then
    v_type:='schedule_changed'; v_state:='warning'; v_severity:='low';
  end if;

  return jsonb_build_object(
    'succeeded',true,'errorCode',null,'organizationId',v_origin.organization_id,
    'projectId',v_origin.project_id,'originatingPaymentClaimId',v_origin.id,
    'originClaimNumber',v_origin.claim_number,'originStatus',v_origin.status,
    'hasVariance',v_type is not null,'primaryType',v_type,
    'contributingConditions',to_jsonb(v_conditions),'state',v_state,
    'severity',v_severity,'isBlocking',v_blocking,
    'currentOwnership',v_owned,'currentEligibility',v_eligible,
    'committedRetention',v_committed,
    'ownershipVariance',round(v_owned-v_committed,2),
    'eligibilityVariance',round(v_eligible-v_committed,2),
    'diagnosticRemaining',round(least(v_owned,v_eligible)-v_committed,2),
    'allocatableAvailability',greatest(round(least(v_owned,v_eligible)-v_committed,2),0),
    'phase2StateHash',v_position->>'stateHash',
    'phase4EligibilityHash',v_eligibility->>'eligibilityStateHash',
    'committedAllocationHash',v_committed_hash,
    'affectedRetentionClaimIds',to_jsonb(v_claims),
    'affectedAllocationIds',to_jsonb(v_allocations),
    'reliedScheduleIds',to_jsonb(v_relied),
    'currentScheduleIds',to_jsonb(v_current_schedules),
    'committedAllocations',v_committed_payload,
    'currentSchedules',coalesce(v_e->'schedules','[]'::jsonb)
  );
end;
$$;

create or replace function private.evaluate_retention_variance_origin(
  p_project_id uuid,p_originating_payment_claim_id uuid,p_correlation_id text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  s jsonb; v public.retention_variances%rowtype; old_state text; old_severity text;
  basis_hash text; event_name text; changed boolean:=false;
begin
  s:=private.retention_variance_snapshot(p_project_id,p_originating_payment_claim_id);
  if not coalesce((s->>'succeeded')::boolean,false) then return s; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_originating_payment_claim_id::text||':retention_variance',5));
  select * into v from public.retention_variances
  where organization_id=(s->>'organizationId')::uuid
    and project_id=p_project_id
    and originating_payment_claim_id=p_originating_payment_claim_id
  for update;

  if not coalesce((s->>'hasVariance')::boolean,false) then
    if not found then return s||jsonb_build_object('action','none'); end if;
    old_state:=v.state;
    old_severity:=v.severity;
    perform set_config('app.retention_phase5_internal_write','true',true);
    update public.retention_variances set
      prior_phase2_state_hash=latest_phase2_state_hash,
      prior_phase4_eligibility_hash=latest_phase4_eligibility_hash,
      prior_committed_allocation_hash=committed_allocation_hash,
      current_ownership=(s->>'currentOwnership')::numeric,
      current_eligibility=(s->>'currentEligibility')::numeric,
      committed_retention=(s->>'committedRetention')::numeric,
      ownership_variance=(s->>'ownershipVariance')::numeric,
      eligibility_variance=(s->>'eligibilityVariance')::numeric,
      diagnostic_remaining=(s->>'diagnosticRemaining')::numeric,
      latest_phase2_state_hash=s->>'phase2StateHash',
      latest_phase4_eligibility_hash=s->>'phase4EligibilityHash',
      committed_allocation_hash=s->>'committedAllocationHash',
      affected_retention_claim_ids=array(
        select jsonb_array_elements_text(s->'affectedRetentionClaimIds')::uuid),
      affected_allocation_ids=array(
        select jsonb_array_elements_text(s->'affectedAllocationIds')::uuid),
      relied_schedule_ids=array(
        select jsonb_array_elements_text(s->'reliedScheduleIds')::uuid),
      current_schedule_ids=array(
        select jsonb_array_elements_text(s->'currentScheduleIds')::uuid),
      state=case when state='warning' then 'resolved' else state end,
      severity=case when state='warning' then 'low' else severity end,
      is_blocking=false,last_detected_at=now(),last_evaluated_at=now(),
      resolved_at=case when state='warning' then now() else resolved_at end,
      resolution_type=case when state='warning' then 'live_position_reconciled'
        else resolution_type end,
      last_correlation_id=p_correlation_id,revision=revision+1,updated_at=now()
    where id=v.id returning * into v;
    perform set_config('app.retention_phase5_internal_write','',true);
    if v.state='resolved' then
      perform private.record_retention_variance_event(
        v.id,'variance_auto_cleared',old_state,'resolved',old_severity,'low',
        'Warning auto-cleared because the live financial position reconciles.',
        p_correlation_id,'{}'::jsonb);
      return s||jsonb_build_object('action','auto_cleared','varianceId',v.id);
    end if;
    return s||jsonb_build_object('action','awaiting_explicit_resolution',
      'varianceId',v.id,'state',v.state);
  end if;

  basis_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'phase2',s->>'phase2StateHash','phase4',s->>'phase4EligibilityHash',
    'committed',s->>'committedAllocationHash','type',s->>'primaryType',
    'ownershipVariance',s->>'ownershipVariance',
    'eligibilityVariance',s->>'eligibilityVariance')::text,'UTF8'),'sha256'),'hex');

  if found then
    old_state:=v.state; old_severity:=v.severity;
    changed:=v.latest_phase2_state_hash<>(s->>'phase2StateHash')
      or v.latest_phase4_eligibility_hash<>(s->>'phase4EligibilityHash')
      or v.committed_allocation_hash<>(s->>'committedAllocationHash')
      or v.primary_type<>(s->>'primaryType')
      or v.current_ownership<>(s->>'currentOwnership')::numeric
      or v.current_eligibility<>(s->>'currentEligibility')::numeric
      or v.committed_retention<>(s->>'committedRetention')::numeric;
    -- An accepted override suppresses only the exact approved discrepancy.
    if v.state='accepted_contractual_override' and v.override_basis_hash=basis_hash then
      perform set_config('app.retention_phase5_internal_write','true',true);
      update public.retention_variances set last_evaluated_at=now(),
        last_detected_at=now(),last_correlation_id=p_correlation_id,
        revision=revision+1,updated_at=now() where id=v.id returning * into v;
      perform set_config('app.retention_phase5_internal_write','',true);
      return s||jsonb_build_object('action','override_unchanged','varianceId',v.id);
    end if;
    perform set_config('app.retention_phase5_internal_write','true',true);
    update public.retention_variances set
      prior_phase2_state_hash=latest_phase2_state_hash,
      prior_phase4_eligibility_hash=latest_phase4_eligibility_hash,
      prior_committed_allocation_hash=committed_allocation_hash,
      primary_type=s->>'primaryType',
      contributing_conditions=array(
        select jsonb_array_elements_text(s->'contributingConditions')),
      state=s->>'state',severity=s->>'severity',
      is_blocking=(s->>'isBlocking')::boolean,
      current_ownership=(s->>'currentOwnership')::numeric,
      current_eligibility=(s->>'currentEligibility')::numeric,
      committed_retention=(s->>'committedRetention')::numeric,
      ownership_variance=(s->>'ownershipVariance')::numeric,
      eligibility_variance=(s->>'eligibilityVariance')::numeric,
      diagnostic_remaining=(s->>'diagnosticRemaining')::numeric,
      latest_phase2_state_hash=s->>'phase2StateHash',
      latest_phase4_eligibility_hash=s->>'phase4EligibilityHash',
      committed_allocation_hash=s->>'committedAllocationHash',
      affected_retention_claim_ids=array(
        select jsonb_array_elements_text(s->'affectedRetentionClaimIds')::uuid),
      affected_allocation_ids=array(
        select jsonb_array_elements_text(s->'affectedAllocationIds')::uuid),
      relied_schedule_ids=array(
        select jsonb_array_elements_text(s->'reliedScheduleIds')::uuid),
      current_schedule_ids=array(
        select jsonb_array_elements_text(s->'currentScheduleIds')::uuid),
      resolution_type=null,resolution_reason=null,resolved_at=null,
      resolution_approved_by=null,override_approved_amount=null,override_basis_hash=null,
      last_detected_at=now(),last_evaluated_at=now(),
      last_correlation_id=p_correlation_id,revision=revision+1,updated_at=now()
    where id=v.id returning * into v;
    perform set_config('app.retention_phase5_internal_write','',true);
    event_name:=case when old_state in ('resolved','accepted_contractual_override')
      then 'variance_reopened'
      when old_severity<>v.severity then 'severity_changed'
      else 'variance_updated' end;
    if changed or event_name in ('variance_reopened','severity_changed') then
      perform private.record_retention_variance_event(v.id,event_name,old_state,v.state,
        old_severity,v.severity,'Retention variance reevaluated.',p_correlation_id,
        jsonb_build_object('basisHash',basis_hash));
    end if;
    return s||jsonb_build_object('action',case when event_name='variance_reopened'
      then 'reopened' else 'updated' end,'varianceId',v.id);
  end if;

  perform set_config('app.retention_phase5_internal_write','true',true);
  insert into public.retention_variances(
    organization_id,project_id,originating_payment_claim_id,primary_type,
    contributing_conditions,state,severity,is_blocking,current_ownership,
    current_eligibility,committed_retention,ownership_variance,eligibility_variance,
    diagnostic_remaining,latest_phase2_state_hash,latest_phase4_eligibility_hash,
    committed_allocation_hash,affected_retention_claim_ids,affected_allocation_ids,
    relied_schedule_ids,current_schedule_ids,last_correlation_id
  ) values (
    (s->>'organizationId')::uuid,p_project_id,p_originating_payment_claim_id,
    s->>'primaryType',array(select jsonb_array_elements_text(s->'contributingConditions')),
    s->>'state',s->>'severity',(s->>'isBlocking')::boolean,
    (s->>'currentOwnership')::numeric,(s->>'currentEligibility')::numeric,
    (s->>'committedRetention')::numeric,(s->>'ownershipVariance')::numeric,
    (s->>'eligibilityVariance')::numeric,(s->>'diagnosticRemaining')::numeric,
    s->>'phase2StateHash',s->>'phase4EligibilityHash',
    s->>'committedAllocationHash',
    array(select jsonb_array_elements_text(s->'affectedRetentionClaimIds')::uuid),
    array(select jsonb_array_elements_text(s->'affectedAllocationIds')::uuid),
    array(select jsonb_array_elements_text(s->'reliedScheduleIds')::uuid),
    array(select jsonb_array_elements_text(s->'currentScheduleIds')::uuid),
    p_correlation_id
  ) returning * into v;
  perform set_config('app.retention_phase5_internal_write','',true);
  perform private.record_retention_variance_event(v.id,'variance_detected',null,v.state,
    null,v.severity,'Retention variance detected.',p_correlation_id,
    jsonb_build_object('basisHash',basis_hash));
  return s||jsonb_build_object('action','detected','varianceId',v.id);
end;
$$;

create or replace function private.evaluate_retention_variance_project(
  p_project_id uuid,p_correlation_id text default null,p_origin_ids uuid[] default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare r record; item jsonb; results jsonb:='[]'::jsonb; count_origins integer:=0;
begin
  for r in
    select p.id from public.project_claims p
    where p.project_id=p_project_id and (
      (p_origin_ids is not null and p.id=any(p_origin_ids))
      or (p_origin_ids is null and (
        exists(
          select 1 from public.retention_claim_allocations a
          join public.retention_claims c on c.id=a.retention_claim_id
          where c.status='submitted' and a.originating_payment_claim_id=p.id
        )
        or exists(
        select 1 from public.retention_variances v
        where v.project_id=p_project_id and v.originating_payment_claim_id=p.id
        )
      ))
    )
    order by p.id
  loop
    item:=private.evaluate_retention_variance_origin(p_project_id,r.id,p_correlation_id);
    results:=results||jsonb_build_array(item);
    count_origins:=count_origins+1;
  end loop;
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'projectId',p_project_id,'originCount',count_origins,'results',results);
exception when others then
  return jsonb_build_object('succeeded',false,'errorCode','scan_failed',
    'projectId',p_project_id,'message',sqlerrm);
end;
$$;

create or replace function private.retention_variance_blocking_details(
  p_project_id uuid,p_origin_ids uuid[] default null
)
returns jsonb language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'blocking',exists(select 1 from public.retention_variances v
      where v.project_id=p_project_id and v.is_blocking
        and (p_origin_ids is null or v.originating_payment_claim_id=any(p_origin_ids))),
    'variances',coalesce(jsonb_agg(jsonb_build_object(
      'varianceId',v.id,'originatingPaymentClaimId',v.originating_payment_claim_id,
      'primaryType',v.primary_type,'state',v.state,'severity',v.severity,
      'currentOwnership',v.current_ownership,'currentEligibility',v.current_eligibility,
      'committedRetention',v.committed_retention,
      'ownershipVariance',v.ownership_variance,
      'eligibilityVariance',v.eligibility_variance,
      'phase2StateHash',v.latest_phase2_state_hash,
      'phase4EligibilityHash',v.latest_phase4_eligibility_hash,
      'committedAllocationHash',v.committed_allocation_hash
    ) order by v.originating_payment_claim_id) filter(where v.id is not null),'[]'::jsonb)
  )
  from public.retention_variances v
  where v.project_id=p_project_id and v.is_blocking
    and (p_origin_ids is null or v.originating_payment_claim_id=any(p_origin_ids));
$$;

create or replace function public.evaluate_retention_variances(
  p_project_id uuid,p_origin_ids uuid[] default null,p_correlation_id text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare ctx jsonb; result jsonb;
begin
  ctx:=private.retention_phase5_context(
    p_project_id,'retention.variances.resolve',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  result:=private.evaluate_retention_variance_project(
    p_project_id,p_correlation_id,p_origin_ids);
  return result||private.retention_variance_blocking_details(p_project_id,p_origin_ids);
end;
$$;

create or replace function public.check_retention_variance_blocks(
  p_project_id uuid,p_origin_ids uuid[] default null
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare ctx jsonb;
begin
  ctx:=private.retention_phase5_context(
    p_project_id,'retention.variances.view',false);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null)
    ||private.retention_variance_blocking_details(p_project_id,p_origin_ids);
end;
$$;

create or replace function private.retention_variance_read_json(p_variance_id uuid)
returns jsonb language sql stable security definer set search_path=public
as $$
  select to_jsonb(v)||jsonb_build_object(
    'origin',jsonb_build_object(
      'claimNumber',p.claim_number,'claimStatus',p.status,'claimDate',p.claim_date,
      'retentionWithheldAmount',p.retention_withheld_amount,'updatedAt',p.updated_at
    ),
    'allocations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'retentionClaimId',c.id,'retentionClaimNumber',c.claim_number,
        'retentionClaimStatus',c.status,'retentionClaimSubmittedAt',c.submitted_at,
        'allocationId',a.id,'allocationAmount',a.allocation_amount,
        'originClaimNumberSnapshot',a.origin_claim_number_snapshot,
        'retentionWithheldSnapshot',a.retention_withheld_snapshot,
        'originStateHashSnapshot',a.origin_state_hash_snapshot,
        'eligibilityStateHashSnapshot',a.eligibility_state_hash_snapshot,
        'scheduleIds',coalesce(to_jsonb(a.eligibility_schedule_ids_snapshot),'[]'::jsonb)
      ) order by c.submitted_at,c.id,a.id)
      from public.retention_claim_allocations a
      join public.retention_claims c on c.id=a.retention_claim_id
      where c.status='submitted'
        and a.originating_payment_claim_id=v.originating_payment_claim_id
    ),'[]'::jsonb),
    'schedules',coalesce((
      select jsonb_agg(jsonb_build_object(
        'scheduleId',s.id,'name',s.name,'status',s.status,
        'eligibilityDate',s.eligibility_date,
        'activatedEntitlementAmount',o.activated_entitlement_amount,
        'reliedUpon',s.id=any(v.relied_schedule_ids)
      ) order by s.schedule_sequence,s.id)
      from public.project_retention_schedule_origins o
      join public.project_retention_release_schedules s on s.id=o.schedule_id
      where o.originating_payment_claim_id=v.originating_payment_claim_id
    ),'[]'::jsonb)
  )
  from public.retention_variances v
  join public.project_claims p on p.id=v.originating_payment_claim_id
  where v.id=p_variance_id;
$$;

create or replace function public.get_retention_variance(p_variance_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v public.retention_variances%rowtype; ctx jsonb;
begin
  select * into v from public.retention_variances where id=p_variance_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','variance_not_found'); end if;
  ctx:=private.retention_phase5_context(v.project_id,'retention.variances.view',false);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'variance',private.retention_variance_read_json(v.id));
end;
$$;

create or replace function public.list_project_retention_variances(
  p_project_id uuid,p_limit integer default 100,p_after_detected_at timestamptz default null,
  p_after_id uuid default null,p_states text[] default null,p_blocking boolean default null
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare ctx jsonb;
begin
  ctx:=private.retention_phase5_context(p_project_id,'retention.variances.view',false);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'variances',coalesce((
    select jsonb_agg(private.retention_variance_read_json(q.id)
      order by q.last_detected_at desc,q.id desc)
    from (
      select v.id,v.last_detected_at from public.retention_variances v
      where v.project_id=p_project_id
        and (p_states is null or v.state=any(p_states))
        and (p_blocking is null or v.is_blocking=p_blocking)
        and (p_after_detected_at is null or
          (v.last_detected_at,v.id)<(p_after_detected_at,p_after_id))
      order by v.last_detected_at desc,v.id desc
      limit least(greatest(coalesce(p_limit,100),1),500)
    ) q
  ),'[]'::jsonb),'nextCursor',(
    select jsonb_build_object('lastDetectedAt',q.last_detected_at,'id',q.id)
    from (
      select v.id,v.last_detected_at from public.retention_variances v
      where v.project_id=p_project_id
        and (p_states is null or v.state=any(p_states))
        and (p_blocking is null or v.is_blocking=p_blocking)
        and (p_after_detected_at is null or
          (v.last_detected_at,v.id)<(p_after_detected_at,p_after_id))
      order by v.last_detected_at desc,v.id desc
      limit least(greatest(coalesce(p_limit,100),1),500)
    ) q order by q.last_detected_at,q.id limit 1
  ));
end;
$$;

create or replace function public.get_retention_variance_events(
  p_variance_id uuid,p_limit integer default 200
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v public.retention_variances%rowtype; ctx jsonb;
begin
  select * into v from public.retention_variances where id=p_variance_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','variance_not_found'); end if;
  ctx:=private.retention_phase5_context(v.project_id,'retention.variances.view',false);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'events',coalesce((
    select jsonb_agg(to_jsonb(e) order by e.occurred_at desc,e.id desc)
    from (
      select * from public.retention_variance_events
      where variance_id=p_variance_id order by occurred_at desc,id desc
      limit least(greatest(coalesce(p_limit,200),1),1000)
    ) e
  ),'[]'::jsonb));
end;
$$;

create or replace function public.assign_retention_variance(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v public.retention_variances%rowtype; ctx jsonb;
begin
  select * into v from public.retention_variances where id=(p_input->>'varianceId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','variance_not_found'); end if;
  ctx:=private.retention_phase5_context(v.project_id,'retention.variances.resolve',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select * into v from public.retention_variances where id=v.id for update;
  if v.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',v.revision);
  end if;
  begin
    perform set_config('app.retention_phase5_internal_write','true',true);
    update public.retention_variances set
      assigned_user_id=(p_input->>'assignedUserId')::uuid,
      assigned_role=nullif(trim(p_input->>'assignedRole'),''),
      due_date=(p_input->>'dueDate')::date,
      escalation_level=coalesce((p_input->>'escalationLevel')::integer,escalation_level),
      last_correlation_id=p_input->>'correlationId',revision=revision+1,updated_at=now()
    where id=v.id returning * into v;
    perform set_config('app.retention_phase5_internal_write','',true);
  exception when check_violation or foreign_key_violation or invalid_text_representation then
    return jsonb_build_object('succeeded',false,'errorCode','assignment_invalid');
  end;
  perform private.record_retention_variance_event(v.id,'variance_assigned',v.state,v.state,
    v.severity,v.severity,'Retention variance assignment updated.',
    p_input->>'correlationId',jsonb_build_object(
      'assignedUserId',v.assigned_user_id,'assignedRole',v.assigned_role,'dueDate',v.due_date));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'variance',private.retention_variance_read_json(v.id));
end;
$$;

create or replace function public.record_retention_variance_corrective_evidence(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v public.retention_variances%rowtype; ctx jsonb; old_state text;
  amount numeric; evidence jsonb;
begin
  select * into v from public.retention_variances where id=(p_input->>'varianceId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','variance_not_found'); end if;
  ctx:=private.retention_phase5_context(v.project_id,'retention.variances.resolve',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  if nullif(trim(coalesce(p_input->>'externalReferenceId','')),'') is null
    or nullif(trim(coalesce(p_input->>'evidenceNote','')),'') is null then
    return jsonb_build_object('succeeded',false,'errorCode','corrective_evidence_required');
  end if;
  begin amount:=(p_input->>'correctiveAmountProposed')::numeric;
  exception when others then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_corrective_amount');
  end;
  if amount is null or amount<=0 then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_corrective_amount');
  end if;
  evidence:=jsonb_build_object(
    'externalReferenceId',trim(p_input->>'externalReferenceId'),
    'evidenceNote',trim(p_input->>'evidenceNote'),
    'evidenceTimestamp',coalesce((p_input->>'evidenceTimestamp')::timestamptz,now()),
    'approverUserId',p_input->>'approverUserId');
  select * into v from public.retention_variances where id=v.id for update;
  if v.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',v.revision);
  end if;
  if v.state in ('resolved','accepted_contractual_override') then
    return jsonb_build_object('succeeded',false,'errorCode','variance_already_resolved');
  end if;
  old_state:=v.state;
  perform set_config('app.retention_phase5_internal_write','true',true);
  update public.retention_variances set state='resolution_pending',is_blocking=true,
    resolution_type='manual_external_corrective_evidence',
    resolution_reason=trim(p_input->>'evidenceNote'),resolution_evidence=evidence,
    corrective_reference_id=trim(p_input->>'externalReferenceId'),
    corrective_amount_proposed=amount,evidence_recorded_at=now(),
    resolution_proposed_by=auth.uid(),last_correlation_id=p_input->>'correlationId',
    revision=revision+1,updated_at=now() where id=v.id returning * into v;
  perform set_config('app.retention_phase5_internal_write','',true);
  perform private.record_retention_variance_event(v.id,'resolution_pending',
    old_state,v.state,v.severity,v.severity,
    'External corrective evidence recorded; no financial availability restored.',
    p_input->>'correlationId',jsonb_build_object(
      'externalReferenceId',v.corrective_reference_id,
      'correctiveAmountProposed',v.corrective_amount_proposed));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'availabilityRestored',false,'variance',private.retention_variance_read_json(v.id));
end;
$$;

create or replace function public.resolve_retention_variance(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v public.retention_variances%rowtype; ctx jsonb; s jsonb; old_state text;
begin
  select * into v from public.retention_variances where id=(p_input->>'varianceId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','variance_not_found'); end if;
  ctx:=private.retention_phase5_context(v.project_id,'retention.variances.resolve',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select * into v from public.retention_variances where id=v.id for update;
  if v.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',v.revision);
  end if;
  if v.state='resolved' then
    return jsonb_build_object('succeeded',false,'errorCode','variance_already_resolved');
  end if;
  if nullif(trim(coalesce(p_input->>'reason','')),'') is null then
    return jsonb_build_object('succeeded',false,'errorCode','variance_not_resolvable');
  end if;
  s:=private.retention_variance_snapshot(v.project_id,v.originating_payment_claim_id);
  if (s->>'committedRetention')::numeric>(s->>'currentOwnership')::numeric
    or (s->>'committedRetention')::numeric>(s->>'currentEligibility')::numeric
    or s->>'originStatus'='Cancelled' then
    perform private.record_retention_variance_event(v.id,'resolution_rejected',
      v.state,v.state,v.severity,v.severity,
      'Live financial position still does not support committed allocations.',
      p_input->>'correlationId',s);
    return jsonb_build_object('succeeded',false,'errorCode','live_position_still_invalid',
      'details',s);
  end if;
  old_state:=v.state;
  perform set_config('app.retention_phase5_internal_write','true',true);
  update public.retention_variances set
    prior_phase2_state_hash=latest_phase2_state_hash,
    prior_phase4_eligibility_hash=latest_phase4_eligibility_hash,
    prior_committed_allocation_hash=committed_allocation_hash,
    current_ownership=(s->>'currentOwnership')::numeric,
    current_eligibility=(s->>'currentEligibility')::numeric,
    committed_retention=(s->>'committedRetention')::numeric,
    ownership_variance=(s->>'ownershipVariance')::numeric,
    eligibility_variance=(s->>'eligibilityVariance')::numeric,
    diagnostic_remaining=(s->>'diagnosticRemaining')::numeric,
    latest_phase2_state_hash=s->>'phase2StateHash',
    latest_phase4_eligibility_hash=s->>'phase4EligibilityHash',
    committed_allocation_hash=s->>'committedAllocationHash',
    state='resolved',severity='low',is_blocking=false,
    resolution_type='live_position_reconciled',
    resolution_reason=trim(p_input->>'reason'),
    resolution_approved_by=auth.uid(),resolved_at=now(),
    last_evaluated_at=now(),last_correlation_id=p_input->>'correlationId',
    revision=revision+1,updated_at=now()
  where id=v.id returning * into v;
  perform set_config('app.retention_phase5_internal_write','',true);
  perform private.record_retention_variance_event(v.id,'variance_resolved',
    old_state,'resolved',v.severity,'low',v.resolution_reason,
    p_input->>'correlationId',jsonb_build_object('liveSnapshot',s));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'availabilityRestored',false,'variance',private.retention_variance_read_json(v.id));
end;
$$;

create or replace function public.accept_retention_variance_contractual_override(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare v public.retention_variances%rowtype; ctx jsonb; reason text; evidence jsonb;
  approved numeric; basis text; old_state text;
begin
  select * into v from public.retention_variances where id=(p_input->>'varianceId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','variance_not_found'); end if;
  ctx:=private.retention_phase5_context(v.project_id,'retention.variances.override',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then
    return case when ctx->>'errorCode'='permission_denied'
      then jsonb_build_object('succeeded',false,'errorCode','override_permission_required')
      else ctx end;
  end if;
  reason:=nullif(trim(coalesce(p_input->>'reason','')),'');
  evidence:=p_input->'evidence';
  if reason is null then
    return jsonb_build_object('succeeded',false,'errorCode','override_reason_required');
  end if;
  if evidence is null or jsonb_typeof(evidence)<>'object' or evidence='{}'::jsonb then
    return jsonb_build_object('succeeded',false,'errorCode','corrective_evidence_required');
  end if;
  begin approved:=(p_input->>'approvedDiscrepancyAmount')::numeric;
  exception when others then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_corrective_amount');
  end;
  if approved is null or approved<0 then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_corrective_amount');
  end if;
  select * into v from public.retention_variances where id=v.id for update;
  if v.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',v.revision);
  end if;
  if v.state in ('resolved','accepted_contractual_override') then
    return jsonb_build_object('succeeded',false,'errorCode','variance_already_resolved');
  end if;
  basis:=encode(extensions.digest(convert_to(jsonb_build_object(
    'phase2',v.latest_phase2_state_hash,'phase4',v.latest_phase4_eligibility_hash,
    'committed',v.committed_allocation_hash,'type',v.primary_type,
    'ownershipVariance',v.ownership_variance,
    'eligibilityVariance',v.eligibility_variance)::text,'UTF8'),'sha256'),'hex');
  old_state:=v.state;
  perform set_config('app.retention_phase5_internal_write','true',true);
  update public.retention_variances set
    state='accepted_contractual_override',is_blocking=false,
    resolution_type='accepted_contractual_override',resolution_reason=reason,
    resolution_evidence=evidence,override_approved_amount=approved,
    override_basis_hash=basis,resolution_approved_by=auth.uid(),resolved_at=now(),
    last_correlation_id=p_input->>'correlationId',revision=revision+1,updated_at=now()
  where id=v.id returning * into v;
  perform set_config('app.retention_phase5_internal_write','',true);
  perform private.record_retention_variance_event(v.id,'contractual_override_accepted',
    old_state,v.state,v.severity,v.severity,reason,p_input->>'correlationId',
    jsonb_build_object('approvedDiscrepancyAmount',approved,'evidence',evidence,
      'basisHash',basis,'availabilityRestored',false));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'availabilityRestored',false,'variance',private.retention_variance_read_json(v.id));
end;
$$;

create or replace function public.reopen_retention_variance(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v public.retention_variances%rowtype; ctx jsonb; s jsonb; result jsonb;
begin
  select * into v from public.retention_variances where id=(p_input->>'varianceId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','variance_not_found'); end if;
  ctx:=private.retention_phase5_context(v.project_id,'retention.variances.override',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then
    return jsonb_build_object('succeeded',false,'errorCode','override_permission_required');
  end if;
  if nullif(trim(coalesce(p_input->>'reason','')),'') is null then
    return jsonb_build_object('succeeded',false,'errorCode','override_reason_required');
  end if;
  if v.state not in ('resolved','accepted_contractual_override') then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_variance_transition');
  end if;
  s:=private.retention_variance_snapshot(v.project_id,v.originating_payment_claim_id);
  if not coalesce((s->>'hasVariance')::boolean,false) then
    return jsonb_build_object('succeeded',false,'errorCode','variance_not_resolvable');
  end if;
  perform set_config('app.retention_phase5_internal_write','true',true);
  update public.retention_variances set override_basis_hash=null where id=v.id;
  perform set_config('app.retention_phase5_internal_write','',true);
  result:=private.evaluate_retention_variance_origin(
    v.project_id,v.originating_payment_claim_id,p_input->>'correlationId');
  perform private.record_retention_variance_event(v.id,'variance_reopened',
    v.state,result->>'state',v.severity,result->>'severity',
    trim(p_input->>'reason'),p_input->>'correlationId','{}'::jsonb);
  return result;
end;
$$;

create or replace function public.enqueue_retention_variance_scan_projects(
  p_limit integer default 100,p_after_project_id uuid default null,
  p_organization_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare ids jsonb; next_id uuid;
begin
  if auth.role()<>'service_role' then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  with eligible as (
    select p.organization_id,p.id as project_id
    from public.organization_projects p
    join public.organization_capabilities c
      on c.organization_id=p.organization_id
      and c.capability_key='retention_management' and c.enabled
    join public.project_retention_workflow_states w
      on w.organization_id=p.organization_id and w.project_id=p.id
      and w.mode in ('observe','ready','cutover','blocked')
    where (p_organization_id is null or p.organization_id=p_organization_id)
      and (p_after_project_id is null or p.id>p_after_project_id)
    order by p.id
    limit least(greatest(coalesce(p_limit,100),1),500)
  ), upserted as (
    insert into public.retention_variance_scan_queue(
      organization_id,project_id,queue_state,available_at,updated_at
    )
    select organization_id,project_id,'pending',now(),now() from eligible
    on conflict(organization_id,project_id) do update set
      queue_state=case
        when retention_variance_scan_queue.queue_state='claimed'
          and retention_variance_scan_queue.claim_expires_at>now()
        then retention_variance_scan_queue.queue_state else 'pending' end,
      available_at=case
        when retention_variance_scan_queue.queue_state='claimed'
          and retention_variance_scan_queue.claim_expires_at>now()
        then retention_variance_scan_queue.available_at else now() end,
      claim_token=case
        when retention_variance_scan_queue.queue_state='claimed'
          and retention_variance_scan_queue.claim_expires_at>now()
        then retention_variance_scan_queue.claim_token else null end,
      claim_expires_at=case
        when retention_variance_scan_queue.queue_state='claimed'
          and retention_variance_scan_queue.claim_expires_at>now()
        then retention_variance_scan_queue.claim_expires_at else null end,
      claimed_at=case
        when retention_variance_scan_queue.queue_state='claimed'
          and retention_variance_scan_queue.claim_expires_at>now()
        then retention_variance_scan_queue.claimed_at else null end,
      claimed_by=case
        when retention_variance_scan_queue.queue_state='claimed'
          and retention_variance_scan_queue.claim_expires_at>now()
        then retention_variance_scan_queue.claimed_by else null end,
      updated_at=now()
    returning project_id
  )
  select coalesce(jsonb_agg(project_id order by project_id),'[]'::jsonb),
    max(project_id::text)::uuid into ids,next_id from upserted;
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'count',jsonb_array_length(ids),'projectIds',ids,'nextProjectId',next_id);
end;
$$;

create or replace function public.claim_retention_variance_scan_batch(
  p_limit integer default 25,p_worker_id text default 'retention-variance-scanner',
  p_lease_seconds integer default 600,p_organization_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare token uuid:=gen_random_uuid(); rows jsonb;
begin
  if auth.role()<>'service_role' then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  with candidates as (
    select q.id from public.retention_variance_scan_queue q
    where (p_organization_id is null or q.organization_id=p_organization_id)
      and q.attempt_count<q.max_attempts and q.available_at<=now()
      and q.queue_state in ('pending','claimed','retry_scheduled')
      and (q.queue_state<>'claimed' or q.claim_expires_at is null or q.claim_expires_at<=now())
    order by q.priority desc,q.available_at,q.project_id
    limit least(greatest(coalesce(p_limit,25),1),100)
    for update skip locked
  ), claimed as (
    update public.retention_variance_scan_queue q set
      queue_state='claimed',attempt_count=attempt_count+1,claimed_at=now(),
      claim_expires_at=now()+make_interval(secs=>greatest(coalesce(p_lease_seconds,600),30)),
      claimed_by=coalesce(nullif(trim(p_worker_id),''),'retention-variance-scanner'),
      claim_token=token,last_attempt_at=now(),updated_at=now()
    from candidates c where q.id=c.id returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'organizationId',organization_id,'projectId',project_id,
    'attemptCount',attempt_count,'maxAttempts',max_attempts,
    'claimToken',claim_token,'claimExpiresAt',claim_expires_at
  ) order by project_id),'[]'::jsonb) into rows from claimed;
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'claimToken',token,'projects',rows);
end;
$$;

create or replace function public.process_retention_variance_scan_item(
  p_queue_id uuid,p_claim_token uuid,p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare q public.retention_variance_scan_queue%rowtype; result jsonb;
begin
  if auth.role()<>'service_role' then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select * into q from public.retention_variance_scan_queue
  where id=p_queue_id and queue_state='claimed' and claim_token=p_claim_token
    and claim_expires_at>now() for update;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','scan_already_claimed'); end if;
  result:=private.evaluate_retention_variance_project(q.project_id,p_correlation_id,null);
  if not coalesce((result->>'succeeded')::boolean,false) then
    insert into public.retention_variance_events(
      organization_id,project_id,event_type,reason,correlation_id,metadata
    ) values(q.organization_id,q.project_id,'scan_failed',
      coalesce(result->>'message','Retention variance project scan failed.'),
      p_correlation_id,result);
  end if;
  return result||jsonb_build_object('queueId',q.id,'claimToken',q.claim_token);
end;
$$;

create or replace function public.finalize_retention_variance_scan_item(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare q public.retention_variance_scan_queue%rowtype; ok boolean;
begin
  if auth.role()<>'service_role' then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select * into q from public.retention_variance_scan_queue
  where id=(p_input->>'queueId')::uuid and queue_state='claimed'
    and claim_token=(p_input->>'claimToken')::uuid for update;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','scan_already_claimed'); end if;
  ok:=coalesce((p_input->>'completed')::boolean,false);
  update public.retention_variance_scan_queue set
    queue_state=case when ok then 'completed'
      when attempt_count>=max_attempts then 'dead_lettered' else 'retry_scheduled' end,
    available_at=case when ok then now()
      else now()+make_interval(mins=>least(attempt_count*5,60)) end,
    last_completed_at=case when ok then now() else last_completed_at end,
    last_error_code=case when ok then null else coalesce(p_input->>'errorCode','scan_failed') end,
    last_error_message=case when ok then null else left(coalesce(p_input->>'errorMessage','scan_failed'),1000) end,
    claimed_at=null,claim_expires_at=null,claimed_by=null,claim_token=null,updated_at=now()
  where id=q.id;
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'queueId',q.id,'completed',ok);
end;
$$;

create or replace function public.run_retention_variance_scan_batch(
  p_limit integer default 25,p_worker_id text default 'retention-variance-scanner',
  p_after_project_id uuid default null,p_organization_id uuid default null,
  p_correlation_id text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare enqueued jsonb; claimed jsonb; item jsonb; result jsonb; results jsonb:='[]'::jsonb;
  run_id uuid; correlation text:=coalesce(nullif(trim(p_correlation_id),''),gen_random_uuid()::text);
  total_origins integer:=0; errors integer:=0;
begin
  if auth.role()<>'service_role' then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  insert into public.retention_variance_scan_runs(
    organization_id,worker_id,correlation_id,after_project_id,project_limit
  ) values(p_organization_id,coalesce(nullif(trim(p_worker_id),''),'retention-variance-scanner'),
    correlation,p_after_project_id,least(greatest(coalesce(p_limit,25),1),100))
  on conflict(correlation_id) do nothing returning id into run_id;
  if run_id is null then
    return jsonb_build_object('succeeded',false,'errorCode','scan_already_claimed');
  end if;
  enqueued:=public.enqueue_retention_variance_scan_projects(
    least(greatest(coalesce(p_limit,25),1),100),p_after_project_id,p_organization_id);
  claimed:=public.claim_retention_variance_scan_batch(
    least(greatest(coalesce(p_limit,25),1),100),p_worker_id,600,p_organization_id);
  for item in select value from jsonb_array_elements(claimed->'projects')
  loop
    result:=public.process_retention_variance_scan_item(
      (item->>'id')::uuid,(item->>'claimToken')::uuid,correlation);
    results:=results||jsonb_build_array(result);
    total_origins:=total_origins+coalesce((result->>'originCount')::integer,0);
    if not coalesce((result->>'succeeded')::boolean,false) then errors:=errors+1; end if;
    perform public.finalize_retention_variance_scan_item(jsonb_build_object(
      'queueId',item->>'id','claimToken',item->>'claimToken',
      'completed',coalesce((result->>'succeeded')::boolean,false),
      'errorCode',result->>'errorCode','errorMessage',result->>'message'));
  end loop;
  update public.retention_variance_scan_runs set
    state=case when errors=0 then 'completed' else 'failed' end,
    next_project_id=(enqueued->>'nextProjectId')::uuid,
    project_count=jsonb_array_length(claimed->'projects'),origin_count=total_origins,
    error_count=errors,error_code=case when errors>0 then 'scan_failed' end,
    error_message=case when errors>0 then 'One or more project scans failed.' end,
    completed_at=now() where id=run_id;
  return jsonb_build_object('succeeded',errors=0,
    'errorCode',case when errors=0 then null else 'scan_failed' end,
    'runId',run_id,'correlationId',correlation,
    'projectCount',jsonb_array_length(claimed->'projects'),
    'originCount',total_origins,'errorCount',errors,
    'nextProjectId',enqueued->'nextProjectId','results',results);
end;
$$;

-- Narrow Phase 3 integration. The approved Phase 4 implementation remains
-- intact behind renamed functions; Phase 5 adds only synchronous evaluation
-- and blocking when the signed internal Phase 5 gate is enabled.
alter function public.refresh_retention_claim_eligibility_state(uuid,bigint,text)
  rename to refresh_retention_claim_eligibility_state_phase4_pre_variance;
revoke all on function
  public.refresh_retention_claim_eligibility_state_phase4_pre_variance(uuid,bigint,text)
  from public,anon,authenticated,service_role;

create or replace function public.refresh_retention_claim_eligibility_state(
  p_retention_claim_id uuid,p_expected_draft_revision bigint,
  p_correlation_id text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare c public.retention_claims%rowtype; ctx jsonb; origins uuid[];
begin
  if not private.retention_phase5_gate_enabled() then
    return public.refresh_retention_claim_eligibility_state_phase4_pre_variance(
      p_retention_claim_id,p_expected_draft_revision,p_correlation_id);
  end if;
  select * into c from public.retention_claims where id=p_retention_claim_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','claim_not_found'); end if;
  ctx:=private.retention_phase5_context(c.project_id,'retention.claims.create',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select coalesce(array_agg(a.originating_payment_claim_id order by a.originating_payment_claim_id),
    '{}'::uuid[]) into origins
  from public.retention_claim_allocations a where a.retention_claim_id=c.id;
  perform private.evaluate_retention_variance_project(c.project_id,p_correlation_id,origins);
  return public.refresh_retention_claim_eligibility_state_phase4_pre_variance(
    p_retention_claim_id,p_expected_draft_revision,p_correlation_id);
end;
$$;

alter function public.submit_retention_claim(uuid,bigint,text,text,text)
  rename to submit_retention_claim_phase4_pre_variance;
revoke all on function
  public.submit_retention_claim_phase4_pre_variance(uuid,bigint,text,text,text)
  from public,anon,authenticated,service_role;

create or replace function public.submit_retention_claim(
  p_retention_claim_id uuid,p_expected_draft_revision bigint,
  p_expected_position_state_hash text,p_correlation_id text default null,
  p_expected_eligibility_state_hash text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare c public.retention_claims%rowtype; ctx jsonb; origins uuid[]; blocks jsonb;
begin
  if not private.retention_phase5_gate_enabled() then
    return public.submit_retention_claim_phase4_pre_variance(
      p_retention_claim_id,p_expected_draft_revision,p_expected_position_state_hash,
      p_correlation_id,p_expected_eligibility_state_hash);
  end if;
  select * into c from public.retention_claims where id=p_retention_claim_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','claim_not_found'); end if;
  ctx:=private.retention_phase5_context(c.project_id,'retention.claims.submit',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select coalesce(array_agg(a.originating_payment_claim_id order by a.originating_payment_claim_id),
    '{}'::uuid[]) into origins
  from public.retention_claim_allocations a where a.retention_claim_id=c.id;
  perform private.evaluate_retention_variance_project(c.project_id,p_correlation_id,origins);
  blocks:=private.retention_variance_blocking_details(c.project_id,origins);
  if coalesce((blocks->>'blocking')::boolean,false) then
    return private.reject_retention_claim_submission(c.id,'variance_blocking',blocks,p_correlation_id);
  end if;
  return public.submit_retention_claim_phase4_pre_variance(
    p_retention_claim_id,p_expected_draft_revision,p_expected_position_state_hash,
    p_correlation_id,p_expected_eligibility_state_hash);
end;
$$;

-- Narrow Phase 4 integration. Existing schedule calculations and transitions
-- are unchanged; wrappers only evaluate or block affected origins.
alter function public.activate_retention_release_schedule(jsonb)
  rename to activate_retention_release_schedule_phase4_pre_variance;
alter function public.cancel_retention_release_schedule(jsonb)
  rename to cancel_retention_release_schedule_phase4_pre_variance;
alter function public.complete_retention_release_schedule(jsonb)
  rename to complete_retention_release_schedule_phase4_pre_variance;
revoke all on function public.activate_retention_release_schedule_phase4_pre_variance(jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.cancel_retention_release_schedule_phase4_pre_variance(jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.complete_retention_release_schedule_phase4_pre_variance(jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.activate_retention_release_schedule(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare s public.project_retention_release_schedules%rowtype; result jsonb;
  origins uuid[]; ctx jsonb;
begin
  if not private.retention_phase5_gate_enabled() then
    return public.activate_retention_release_schedule_phase4_pre_variance(p_input);
  end if;
  select * into s from public.project_retention_release_schedules
  where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  ctx:=private.retention_phase5_context(
    s.project_id,'retention.schedules.confirm',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select coalesce(array_agg(o.originating_payment_claim_id order by o.originating_payment_claim_id),
    '{}'::uuid[]) into origins
  from public.project_retention_schedule_origins o where o.schedule_id=s.id;
  perform private.evaluate_retention_variance_project(
    s.project_id,p_input->>'correlationId',origins);
  result:=public.activate_retention_release_schedule_phase4_pre_variance(p_input);
  if coalesce((result->>'succeeded')::boolean,false) then
    perform private.evaluate_retention_variance_project(
      s.project_id,p_input->>'correlationId',origins);
  end if;
  return result;
end;
$$;

create or replace function public.cancel_retention_release_schedule(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare s public.project_retention_release_schedules%rowtype; origins uuid[];
  blocks jsonb; result jsonb; ctx jsonb;
begin
  if not private.retention_phase5_gate_enabled() then
    return public.cancel_retention_release_schedule_phase4_pre_variance(p_input);
  end if;
  select * into s from public.project_retention_release_schedules
  where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  ctx:=private.retention_phase5_context(s.project_id,
    case when s.status='activated' then 'retention.schedules.confirm'
      else 'retention.schedules.manage' end,true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select coalesce(array_agg(o.originating_payment_claim_id order by o.originating_payment_claim_id),
    '{}'::uuid[]) into origins
  from public.project_retention_schedule_origins o where o.schedule_id=s.id;
  perform private.evaluate_retention_variance_project(
    s.project_id,p_input->>'correlationId',origins);
  blocks:=private.retention_variance_blocking_details(s.project_id,origins);
  if coalesce((blocks->>'blocking')::boolean,false)
    or (s.status='activated' and exists(
      select 1 from public.retention_claim_allocations a
      join public.retention_claims c on c.id=a.retention_claim_id
      where c.status='submitted' and s.id=any(coalesce(a.eligibility_schedule_ids_snapshot,'{}'))
    )) then
    return jsonb_build_object('succeeded',false,'errorCode','variance_blocking',
      'details',blocks||jsonb_build_object('scheduleId',s.id));
  end if;
  result:=public.cancel_retention_release_schedule_phase4_pre_variance(p_input);
  if coalesce((result->>'succeeded')::boolean,false) then
    perform private.evaluate_retention_variance_project(
      s.project_id,p_input->>'correlationId',origins);
  end if;
  return result;
end;
$$;

create or replace function public.complete_retention_release_schedule(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare s public.project_retention_release_schedules%rowtype; origins uuid[];
  blocks jsonb; result jsonb; ctx jsonb;
begin
  if not private.retention_phase5_gate_enabled() then
    return public.complete_retention_release_schedule_phase4_pre_variance(p_input);
  end if;
  select * into s from public.project_retention_release_schedules
  where id=(p_input->>'scheduleId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','schedule_not_found'); end if;
  ctx:=private.retention_phase5_context(s.project_id,'retention.schedules.confirm',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select coalesce(array_agg(o.originating_payment_claim_id order by o.originating_payment_claim_id),
    '{}'::uuid[]) into origins
  from public.project_retention_schedule_origins o where o.schedule_id=s.id;
  perform private.evaluate_retention_variance_project(
    s.project_id,p_input->>'correlationId',origins);
  blocks:=private.retention_variance_blocking_details(s.project_id,origins);
  if coalesce((blocks->>'blocking')::boolean,false) then
    return jsonb_build_object('succeeded',false,'errorCode','variance_blocking','details',blocks);
  end if;
  result:=public.complete_retention_release_schedule_phase4_pre_variance(p_input);
  if coalesce((result->>'succeeded')::boolean,false) then
    perform private.evaluate_retention_variance_project(
      s.project_id,p_input->>'correlationId',origins);
  end if;
  return result;
end;
$$;

alter table public.retention_variances enable row level security;
alter table public.retention_variances force row level security;
alter table public.retention_variance_events enable row level security;
alter table public.retention_variance_events force row level security;
alter table public.retention_variance_scan_runs enable row level security;
alter table public.retention_variance_scan_runs force row level security;
alter table public.retention_variance_scan_queue enable row level security;
alter table public.retention_variance_scan_queue force row level security;

create policy "Variance viewers can read retention variances"
on public.retention_variances for select to authenticated
using (public.has_org_permission(organization_id,'retention.variances.view'));
create policy "Variance viewers can read retention variance events"
on public.retention_variance_events for select to authenticated
using (public.has_org_permission(organization_id,'retention.variances.view'));

revoke all on public.retention_variances from public,anon,authenticated;
revoke all on public.retention_variance_events from public,anon,authenticated;
revoke all on public.retention_variance_scan_runs from public,anon,authenticated;
revoke all on public.retention_variance_scan_queue from public,anon,authenticated;
grant select on public.retention_variances to service_role;
grant select,insert,update on public.retention_variance_scan_runs to service_role;
grant select,insert,update on public.retention_variance_scan_queue to service_role;
grant select,insert on public.retention_variance_events to service_role;

revoke all on function private.retention_phase5_gate_enabled()
  from public,anon,authenticated;
revoke all on function private.retention_phase5_context(uuid,text,boolean)
  from public,anon,authenticated;
revoke all on function private.record_retention_variance_event(
  uuid,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function private.retention_variance_snapshot(uuid,uuid)
  from public,anon,authenticated;
revoke all on function private.evaluate_retention_variance_origin(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function private.evaluate_retention_variance_project(uuid,text,uuid[])
  from public,anon,authenticated;
revoke all on function private.retention_variance_blocking_details(uuid,uuid[])
  from public,anon,authenticated;
revoke all on function private.retention_variance_read_json(uuid)
  from public,anon,authenticated;
revoke all on function public.prevent_retention_variance_event_mutation()
  from public,anon,authenticated;
revoke all on function public.protect_retention_variance_mutation()
  from public,anon,authenticated;
revoke all on function public.validate_retention_variance_assignment()
  from public,anon,authenticated;

revoke all on function public.evaluate_retention_variances(uuid,uuid[],text)
  from public,anon;
grant execute on function public.evaluate_retention_variances(uuid,uuid[],text)
  to authenticated;
revoke all on function public.check_retention_variance_blocks(uuid,uuid[])
  from public,anon;
grant execute on function public.check_retention_variance_blocks(uuid,uuid[])
  to authenticated;
revoke all on function public.get_retention_variance(uuid) from public,anon;
grant execute on function public.get_retention_variance(uuid) to authenticated;
revoke all on function public.list_project_retention_variances(
  uuid,integer,timestamptz,uuid,text[],boolean) from public,anon;
grant execute on function public.list_project_retention_variances(
  uuid,integer,timestamptz,uuid,text[],boolean) to authenticated;
revoke all on function public.get_retention_variance_events(uuid,integer)
  from public,anon;
grant execute on function public.get_retention_variance_events(uuid,integer)
  to authenticated;
revoke all on function public.assign_retention_variance(jsonb) from public,anon;
grant execute on function public.assign_retention_variance(jsonb) to authenticated;
revoke all on function public.record_retention_variance_corrective_evidence(jsonb)
  from public,anon;
grant execute on function public.record_retention_variance_corrective_evidence(jsonb)
  to authenticated;
revoke all on function public.resolve_retention_variance(jsonb) from public,anon;
grant execute on function public.resolve_retention_variance(jsonb) to authenticated;
revoke all on function public.accept_retention_variance_contractual_override(jsonb)
  from public,anon;
grant execute on function public.accept_retention_variance_contractual_override(jsonb)
  to authenticated;
revoke all on function public.reopen_retention_variance(jsonb) from public,anon;
grant execute on function public.reopen_retention_variance(jsonb) to authenticated;

revoke all on function public.enqueue_retention_variance_scan_projects(integer,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.enqueue_retention_variance_scan_projects(integer,uuid,uuid)
  to service_role;
revoke all on function public.claim_retention_variance_scan_batch(integer,text,integer,uuid)
  from public,anon,authenticated;
grant execute on function public.claim_retention_variance_scan_batch(integer,text,integer,uuid)
  to service_role;
revoke all on function public.process_retention_variance_scan_item(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.process_retention_variance_scan_item(uuid,uuid,text)
  to service_role;
revoke all on function public.finalize_retention_variance_scan_item(jsonb)
  from public,anon,authenticated;
grant execute on function public.finalize_retention_variance_scan_item(jsonb)
  to service_role;
revoke all on function public.run_retention_variance_scan_batch(
  integer,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.run_retention_variance_scan_batch(
  integer,text,uuid,uuid,text) to service_role;

revoke all on function public.refresh_retention_claim_eligibility_state(uuid,bigint,text)
  from public,anon;
grant execute on function public.refresh_retention_claim_eligibility_state(uuid,bigint,text)
  to authenticated;
revoke all on function public.submit_retention_claim(uuid,bigint,text,text,text)
  from public,anon;
grant execute on function public.submit_retention_claim(uuid,bigint,text,text,text)
  to authenticated;
revoke all on function public.activate_retention_release_schedule(jsonb)
  from public,anon;
grant execute on function public.activate_retention_release_schedule(jsonb)
  to authenticated;
revoke all on function public.cancel_retention_release_schedule(jsonb)
  from public,anon;
grant execute on function public.cancel_retention_release_schedule(jsonb)
  to authenticated;
revoke all on function public.complete_retention_release_schedule(jsonb)
  from public,anon;
grant execute on function public.complete_retention_release_schedule(jsonb)
  to authenticated;

commit;
