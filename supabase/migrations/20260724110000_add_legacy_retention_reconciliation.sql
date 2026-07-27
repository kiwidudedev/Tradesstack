begin;

-- Phase 6 reconciles persisted legacy retention release movements without
-- changing project_claims, historical Xero documents, or submitted Retention
-- Claim evidence.

create table public.retention_legacy_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  case_sequence integer not null,
  status text not null default 'draft',
  revision bigint not null default 1,
  position_state_hash text not null,
  source_fingerprint text not null,
  total_legacy_released numeric(14,2) not null,
  total_allocated numeric(14,2) not null default 0,
  source_count integer not null,
  allocation_count integer not null default 0,
  reconciliation_note text null,
  evidence_reference text null,
  evidence jsonb null,
  submitted_by uuid null references auth.users(id) on delete restrict,
  submitted_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete restrict,
  approved_at timestamptz null,
  rejected_by uuid null references auth.users(id) on delete restrict,
  rejected_at timestamptz null,
  rejection_reason text null,
  supersedes_case_id uuid null,
  superseded_by_case_id uuid null,
  superseded_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_legacy_cases_identity_unique
    unique(organization_id,project_id,id),
  constraint retention_legacy_cases_project_fkey
    foreign key(organization_id,project_id)
    references public.organization_projects(organization_id,id) on delete restrict,
  constraint retention_legacy_cases_sequence_unique
    unique(project_id,case_sequence),
  constraint retention_legacy_cases_supersedes_fkey
    foreign key(organization_id,project_id,supersedes_case_id)
    references public.retention_legacy_reconciliation_cases(
      organization_id,project_id,id
    ) on delete restrict,
  constraint retention_legacy_cases_superseded_by_fkey
    foreign key(organization_id,project_id,superseded_by_case_id)
    references public.retention_legacy_reconciliation_cases(
      organization_id,project_id,id
    ) on delete restrict,
  constraint retention_legacy_cases_status_check check(status in (
    'draft','in_review','approved','rejected','superseded','cancelled'
  )),
  constraint retention_legacy_cases_hashes_shape check(
    position_state_hash ~ '^[a-f0-9]{64}$'
    and source_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint retention_legacy_cases_amounts_check check(
    total_legacy_released>0 and total_allocated>=0
  ),
  constraint retention_legacy_cases_counts_check check(
    source_count>0 and allocation_count>=0 and case_sequence>0 and revision>0
  ),
  constraint retention_legacy_cases_evidence_shape check(
    evidence is null or jsonb_typeof(evidence)='object'
  ),
  constraint retention_legacy_cases_submission_pair check(
    (submitted_by is null)=(submitted_at is null)
  ),
  constraint retention_legacy_cases_approval_pair check(
    (approved_by is null)=(approved_at is null)
  ),
  constraint retention_legacy_cases_rejection_pair check(
    (rejected_by is null)=(rejected_at is null)
  ),
  constraint retention_legacy_cases_supersession_pair check(
    (superseded_by_case_id is null)=(superseded_at is null)
  ),
  constraint retention_legacy_cases_lifecycle_check check(
    (status='draft' and submitted_at is null and approved_at is null and rejected_at is null)
    or (status='in_review' and submitted_at is not null and approved_at is null and rejected_at is null)
    or (status='approved' and submitted_at is not null and approved_at is not null and rejected_at is null)
    or (status='rejected' and submitted_at is not null and rejected_at is not null and approved_at is null)
    or status in ('superseded','cancelled')
  )
);

create unique index retention_legacy_cases_one_current_idx
  on public.retention_legacy_reconciliation_cases(project_id)
  where status in ('draft','in_review','approved');
create index retention_legacy_cases_project_history_idx
  on public.retention_legacy_reconciliation_cases(
    project_id,case_sequence desc,id
  );

create table public.retention_legacy_release_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  reconciliation_case_id uuid not null,
  source_payment_claim_id uuid not null,
  source_sequence integer not null,
  claim_number_snapshot text not null,
  claim_date_snapshot date null,
  claim_status_snapshot text not null,
  claim_created_at_snapshot timestamptz not null,
  claim_updated_at_snapshot timestamptz not null,
  retention_released_amount_snapshot numeric(14,2) not null,
  source_origin_state_hash text not null,
  created_at timestamptz not null default now(),
  constraint retention_legacy_sources_case_fkey
    foreign key(organization_id,project_id,reconciliation_case_id)
    references public.retention_legacy_reconciliation_cases(
      organization_id,project_id,id
    ) on delete cascade,
  constraint retention_legacy_sources_identity_unique
    unique(organization_id,project_id,id),
  constraint retention_legacy_sources_claim_fkey
    foreign key(organization_id,project_id,source_payment_claim_id)
    references public.project_claims(organization_id,project_id,id) on delete restrict,
  constraint retention_legacy_sources_claim_unique
    unique(reconciliation_case_id,source_payment_claim_id),
  constraint retention_legacy_sources_sequence_unique
    unique(reconciliation_case_id,source_sequence),
  constraint retention_legacy_sources_amount_positive
    check(retention_released_amount_snapshot>0),
  constraint retention_legacy_sources_sequence_positive check(source_sequence>0),
  constraint retention_legacy_sources_hash_shape
    check(source_origin_state_hash ~ '^[a-f0-9]{64}$')
);

create table public.retention_legacy_release_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  reconciliation_case_id uuid not null,
  legacy_release_source_id uuid not null,
  originating_payment_claim_id uuid not null,
  allocation_sequence integer not null,
  allocation_amount numeric(14,2) not null,
  origin_claim_number_snapshot text null,
  origin_claim_date_snapshot date null,
  origin_claim_status_snapshot text null,
  origin_claim_created_at_snapshot timestamptz null,
  origin_claim_updated_at_snapshot timestamptz null,
  origin_retention_owned_snapshot numeric(14,2) null,
  origin_state_hash_snapshot text null,
  position_state_hash_snapshot text null,
  approved_by uuid null references auth.users(id) on delete restrict,
  approved_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_legacy_allocations_case_fkey
    foreign key(organization_id,project_id,reconciliation_case_id)
    references public.retention_legacy_reconciliation_cases(
      organization_id,project_id,id
    ) on delete cascade,
  constraint retention_legacy_allocations_source_fkey
    foreign key(organization_id,project_id,legacy_release_source_id)
    references public.retention_legacy_release_sources(
      organization_id,project_id,id
    ) on delete restrict,
  constraint retention_legacy_allocations_origin_fkey
    foreign key(organization_id,project_id,originating_payment_claim_id)
    references public.project_claims(organization_id,project_id,id) on delete restrict,
  constraint retention_legacy_allocations_origin_unique
    unique(legacy_release_source_id,originating_payment_claim_id),
  constraint retention_legacy_allocations_sequence_unique
    unique(legacy_release_source_id,allocation_sequence)
    deferrable initially immediate,
  constraint retention_legacy_allocations_amount_positive check(allocation_amount>0),
  constraint retention_legacy_allocations_sequence_positive check(allocation_sequence>0),
  constraint retention_legacy_allocations_approval_pair
    check((approved_by is null)=(approved_at is null)),
  constraint retention_legacy_allocations_hash_shapes check(
    (origin_state_hash_snapshot is null or origin_state_hash_snapshot ~ '^[a-f0-9]{64}$')
    and (position_state_hash_snapshot is null or position_state_hash_snapshot ~ '^[a-f0-9]{64}$')
  )
);

create index retention_legacy_allocations_origin_idx
  on public.retention_legacy_release_allocations(
    project_id,originating_payment_claim_id,reconciliation_case_id
  );

create table public.retention_legacy_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  reconciliation_case_id uuid null,
  event_type text not null,
  previous_status text null,
  new_status text null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  reason text not null,
  correlation_id text null,
  position_state_hash text null,
  source_fingerprint text null,
  financial_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_legacy_events_case_fkey
    foreign key(organization_id,project_id,reconciliation_case_id)
    references public.retention_legacy_reconciliation_cases(
      organization_id,project_id,id
    ) on delete restrict,
  constraint retention_legacy_events_type_check check(event_type in (
    'case_created','case_refreshed','allocation_added','allocation_updated',
    'allocation_removed','submitted_for_approval','submission_rejected',
    'reconciliation_approved','reconciliation_rejected','case_superseded',
    'case_cancelled','permission_denied','stale_state_rejected'
  )),
  constraint retention_legacy_events_reason_not_blank
    check(char_length(trim(reason)) between 1 and 1000),
  constraint retention_legacy_events_payloads_object check(
    jsonb_typeof(financial_snapshot)='object' and jsonb_typeof(metadata)='object'
  )
);

create index retention_legacy_events_case_idx
  on public.retention_legacy_reconciliation_events(
    reconciliation_case_id,occurred_at desc,id desc
  );

create or replace function private.retention_phase6_gate_enabled()
returns boolean language sql stable security invoker set search_path=public
as $$
  select
    coalesce(current_setting('request.jwt.claim.retention_phase6_internal',true),'')='true'
    or coalesce(
      coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
        ->>'retention_phase6_internal','false'
    )='true';
$$;

create or replace function private.retention_phase6_context(
  p_project_id uuid,p_permission_key text,p_require_internal_gate boolean default true
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare actor_id uuid:=auth.uid(); org_id uuid; workflow_mode text; enabled boolean;
begin
  if actor_id is null then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select p.organization_id into org_id
  from public.organization_projects p
  join public.organization_members m
    on m.organization_id=p.organization_id and m.user_id=actor_id
  where p.id=p_project_id;
  if org_id is null then
    return jsonb_build_object('succeeded',false,'errorCode','project_not_found');
  end if;
  if not public.has_org_permission(org_id,p_permission_key) then
    return jsonb_build_object('succeeded',false,'errorCode','permission_denied');
  end if;
  select c.enabled into enabled from public.organization_capabilities c
  where c.organization_id=org_id and c.capability_key='retention_management';
  if not coalesce(enabled,false) then
    return jsonb_build_object('succeeded',false,'errorCode','capability_disabled');
  end if;
  select s.mode into workflow_mode
  from public.project_retention_workflow_states s
  where s.organization_id=org_id and s.project_id=p_project_id;
  if coalesce(workflow_mode,'legacy') not in ('observe','ready','cutover','blocked')
    or (p_require_internal_gate and not private.retention_phase6_gate_enabled()) then
    return jsonb_build_object('succeeded',false,'errorCode','project_mode_not_supported',
      'workflowMode',coalesce(workflow_mode,'legacy'));
  end if;
  return jsonb_build_object('succeeded',true,'organizationId',org_id,
    'projectId',p_project_id,'actorUserId',actor_id,'workflowMode',workflow_mode);
end;
$$;

create or replace function public.prevent_retention_legacy_event_mutation()
returns trigger language plpgsql set search_path=public
as $$ begin
  raise exception 'Retention legacy reconciliation events are append-only.'
    using errcode='55000';
end; $$;
create trigger retention_legacy_events_append_only
before update or delete on public.retention_legacy_reconciliation_events
for each row execute function public.prevent_retention_legacy_event_mutation();

create or replace function public.protect_retention_legacy_case_mutation()
returns trigger language plpgsql set search_path=public
as $$
begin
  if coalesce(current_setting('app.retention_phase6_internal_write',true),'')<>'true' then
    raise exception 'Legacy reconciliation cases may only be changed by controlled services.'
      using errcode='55000';
  end if;
  if tg_op='DELETE' then
    raise exception 'Legacy reconciliation cases cannot be hard-deleted.'
      using errcode='55000';
  end if;
  if old.status in ('approved','superseded') and (
    new.organization_id,new.project_id,new.id,new.case_sequence,
    new.position_state_hash,new.source_fingerprint,new.total_legacy_released,
    new.total_allocated,new.source_count,new.allocation_count,
    new.reconciliation_note,new.evidence_reference,new.evidence,
    new.submitted_by,new.submitted_at,new.approved_by,new.approved_at,
    new.created_by,new.created_at
  ) is distinct from (
    old.organization_id,old.project_id,old.id,old.case_sequence,
    old.position_state_hash,old.source_fingerprint,old.total_legacy_released,
    old.total_allocated,old.source_count,old.allocation_count,
    old.reconciliation_note,old.evidence_reference,old.evidence,
    old.submitted_by,old.submitted_at,old.approved_by,old.approved_at,
    old.created_by,old.created_at
  ) then
    raise exception 'Approved legacy reconciliation evidence is immutable.'
      using errcode='55000';
  end if;
  return new;
end;
$$;
create trigger retention_legacy_case_guard
before insert or update or delete on public.retention_legacy_reconciliation_cases
for each row execute function public.protect_retention_legacy_case_mutation();

create or replace function public.protect_retention_legacy_source_mutation()
returns trigger language plpgsql set search_path=public
as $$
declare case_status text;
begin
  if coalesce(current_setting('app.retention_phase6_internal_write',true),'')<>'true' then
    raise exception 'Legacy release sources may only be changed by controlled services.'
      using errcode='55000';
  end if;
  select c.status into case_status
  from public.retention_legacy_reconciliation_cases c
  where c.id=case when tg_op='DELETE' then old.reconciliation_case_id
    else new.reconciliation_case_id end;
  if case_status not in ('draft','rejected','in_review') then
    raise exception 'Legacy release source evidence is immutable outside Draft.'
      using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger retention_legacy_source_guard
before insert or update or delete on public.retention_legacy_release_sources
for each row execute function public.protect_retention_legacy_source_mutation();

create or replace function public.protect_retention_legacy_allocation_mutation()
returns trigger language plpgsql set search_path=public
as $$
declare case_status text;
begin
  if coalesce(current_setting('app.retention_phase6_internal_write',true),'')<>'true' then
    raise exception 'Legacy release allocations may only be changed by controlled services.'
      using errcode='55000';
  end if;
  select c.status into case_status
  from public.retention_legacy_reconciliation_cases c
  where c.id=case when tg_op='DELETE' then old.reconciliation_case_id
    else new.reconciliation_case_id end;
  if case_status not in ('draft','rejected','in_review') then
    raise exception 'Approved legacy release allocations are immutable.'
      using errcode='55000';
  end if;
  if tg_op='UPDATE' and (
    new.organization_id,new.project_id,new.reconciliation_case_id,
    new.legacy_release_source_id,new.originating_payment_claim_id,new.created_by,new.created_at
  ) is distinct from (
    old.organization_id,old.project_id,old.reconciliation_case_id,
    old.legacy_release_source_id,old.originating_payment_claim_id,old.created_by,old.created_at
  ) then
    raise exception 'Legacy release allocation identity is immutable.'
      using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger retention_legacy_allocation_guard
before insert or update or delete on public.retention_legacy_release_allocations
for each row execute function public.protect_retention_legacy_allocation_mutation();

create or replace function private.record_retention_legacy_event(
  p_case_id uuid,p_event_type text,p_previous_status text,p_new_status text,
  p_reason text,p_correlation_id text default null,p_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; event_id uuid;
begin
  select * into c from public.retention_legacy_reconciliation_cases where id=p_case_id;
  if not found then return null; end if;
  insert into public.retention_legacy_reconciliation_events(
    organization_id,project_id,reconciliation_case_id,event_type,
    previous_status,new_status,actor_user_id,reason,correlation_id,
    position_state_hash,source_fingerprint,financial_snapshot,metadata
  ) values(
    c.organization_id,c.project_id,c.id,p_event_type,p_previous_status,p_new_status,
    auth.uid(),coalesce(nullif(trim(p_reason),''),p_event_type),
    nullif(trim(coalesce(p_correlation_id,'')),''),
    c.position_state_hash,c.source_fingerprint,
    jsonb_build_object(
      'totalLegacyReleased',c.total_legacy_released,
      'totalAllocated',c.total_allocated,
      'sourceCount',c.source_count,'allocationCount',c.allocation_count
    ),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into event_id;
  return event_id;
end;
$$;

-- Preserve the raw Phase 2 persisted Payment Claim read model. The public
-- wrapper below adds reconciliation state without changing any raw totals.
alter function public.get_project_retention_position_summary(uuid)
  rename to get_project_retention_position_summary_phase2_pre_legacy_reconciliation;
revoke all on function
  public.get_project_retention_position_summary_phase2_pre_legacy_reconciliation(uuid)
  from public,anon,authenticated,service_role;

create or replace function private.retention_legacy_source_state(p_project_id uuid)
returns jsonb language sql stable security definer set search_path=public,extensions
as $$
  with raw as (
    select public.get_project_retention_position_summary_phase2_pre_legacy_reconciliation(
      p_project_id
    ) as value
  )
  select value||jsonb_build_object(
    'sourceFingerprint',encode(extensions.digest(convert_to(jsonb_build_object(
      'projectId',p_project_id,
      'positionStateHash',value->>'stateHash',
      'totalLegacyRetentionReleased',value->'totalLegacyRetentionReleased',
      'legacyReleaseOrigins',value->'legacyReleaseOrigins'
    )::text,'UTF8'),'sha256'),'hex')
  ) from raw;
$$;

create or replace function public.get_project_retention_position_summary(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare raw jsonb; current_case public.retention_legacy_reconciliation_cases%rowtype;
  reconciled boolean:=false; reconciliation_state text:='not_required';
begin
  raw:=private.retention_legacy_source_state(p_project_id);
  if not coalesce((raw->>'legacyReconciliationRequired')::boolean,false) then
    return raw||jsonb_build_object(
      'legacyReconciliationRequired',false,
      'legacyReconciliationState','not_required',
      'legacyReconciliationCaseId',null,
      'legacyReconciledAmount',0
    );
  end if;
  select * into current_case
  from public.retention_legacy_reconciliation_cases c
  where c.project_id=p_project_id
    and c.status in ('draft','in_review','approved')
  order by c.case_sequence desc limit 1;
  if current_case.id is not null then
    reconciled:=current_case.status='approved'
      and current_case.position_state_hash=raw->>'stateHash'
      and current_case.source_fingerprint=raw->>'sourceFingerprint'
      and current_case.total_legacy_released=
        round((raw->>'totalLegacyRetentionReleased')::numeric,2)
      and current_case.total_allocated=current_case.total_legacy_released;
    reconciliation_state:=case
      when reconciled then 'approved'
      when current_case.status='approved' then 'stale'
      else current_case.status end;
  else
    reconciliation_state:='required';
  end if;
  return raw||jsonb_build_object(
    'legacyReconciliationRequired',not reconciled,
    'legacyReconciliationState',reconciliation_state,
    'legacyReconciliationCaseId',current_case.id,
    'legacyReconciledAmount',case when reconciled
      then current_case.total_allocated else 0 end,
    'legacySourceFingerprint',raw->>'sourceFingerprint'
  );
end;
$$;

create or replace function private.retention_claim_chronological_sequence(
  p_project_id uuid,p_claim_id uuid
)
returns integer language sql stable security definer set search_path=public
as $$
  select sequence_number::integer from (
    select p.id,row_number() over(order by p.claim_date nulls last,p.created_at,p.id)
      as sequence_number
    from public.project_claims p where p.project_id=p_project_id
  ) ordered where id=p_claim_id;
$$;

create or replace function private.retention_legacy_case_json(p_case_id uuid)
returns jsonb language sql stable security definer set search_path=public
as $$
  select to_jsonb(c)||jsonb_build_object(
    'sources',coalesce((
      select jsonb_agg(to_jsonb(s)||jsonb_build_object(
        'allocatedAmount',coalesce((
          select round(sum(a.allocation_amount),2)
          from public.retention_legacy_release_allocations a
          where a.legacy_release_source_id=s.id
        ),0),
        'allocations',coalesce((
          select jsonb_agg(to_jsonb(a)||jsonb_build_object(
            'currentOriginClaimNumber',p.claim_number,
            'currentOriginStatus',p.status,
            'currentRetentionOwned',greatest(p.retention_withheld_amount,0)
          ) order by a.allocation_sequence,a.id)
          from public.retention_legacy_release_allocations a
          join public.project_claims p on p.id=a.originating_payment_claim_id
          where a.legacy_release_source_id=s.id
        ),'[]'::jsonb)
      ) order by s.source_sequence,s.id)
      from public.retention_legacy_release_sources s
      where s.reconciliation_case_id=c.id
    ),'[]'::jsonb)
  )
  from public.retention_legacy_reconciliation_cases c where c.id=p_case_id;
$$;

create or replace function public.add_retention_legacy_release_allocation(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype;
  s public.retention_legacy_release_sources%rowtype; origin public.project_claims%rowtype;
  ctx jsonb; amount numeric; sequence_number integer; source_total numeric;
  origin_total numeric; origin_sequence integer; allocation_id uuid;
begin
  select * into c from public.retention_legacy_reconciliation_cases
  where id=(p_input->>'caseId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_found'); end if;
  ctx:=private.retention_phase6_context(c.project_id,'retention.legacy.reconcile',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select * into c from public.retention_legacy_reconciliation_cases where id=c.id for update;
  if c.status not in ('draft','rejected') then
    return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_editable');
  end if;
  if c.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',c.revision);
  end if;
  begin amount:=round((p_input->>'allocationAmount')::numeric,2);
  exception when others then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_allocation_amount');
  end;
  if amount is null or amount<=0 then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_allocation_amount');
  end if;
  select * into s from public.retention_legacy_release_sources
  where id=(p_input->>'sourceId')::uuid and reconciliation_case_id=c.id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_source_not_found'); end if;
  select * into origin from public.project_claims
  where id=(p_input->>'originatingPaymentClaimId')::uuid
    and organization_id=c.organization_id and project_id=c.project_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','origin_not_found'); end if;
  if origin.status='Cancelled' or greatest(origin.retention_withheld_amount,0)<=0 then
    return jsonb_build_object('succeeded',false,'errorCode',
      case when origin.status='Cancelled' then 'origin_cancelled'
        else 'origin_has_no_retention' end);
  end if;
  origin_sequence:=private.retention_claim_chronological_sequence(c.project_id,origin.id);
  if origin_sequence>s.source_sequence then
    return jsonb_build_object('succeeded',false,'errorCode','origin_after_legacy_release');
  end if;
  if exists(select 1 from public.retention_legacy_release_allocations a
    where a.legacy_release_source_id=s.id
      and a.originating_payment_claim_id=origin.id) then
    return jsonb_build_object('succeeded',false,'errorCode','duplicate_origin');
  end if;
  select round(coalesce(sum(a.allocation_amount),0),2) into source_total
  from public.retention_legacy_release_allocations a
  where a.legacy_release_source_id=s.id;
  if source_total+amount>s.retention_released_amount_snapshot then
    return jsonb_build_object('succeeded',false,'errorCode','source_overallocated',
      'sourceAmount',s.retention_released_amount_snapshot,
      'currentlyAllocated',source_total,'proposedAllocation',amount);
  end if;
  select round(coalesce(sum(a.allocation_amount),0),2) into origin_total
  from public.retention_legacy_release_allocations a
  where a.reconciliation_case_id=c.id and a.originating_payment_claim_id=origin.id;
  if origin_total+amount>greatest(origin.retention_withheld_amount,0) then
    return jsonb_build_object('succeeded',false,'errorCode','origin_overallocated',
      'currentRetentionOwned',greatest(origin.retention_withheld_amount,0),
      'currentlyAllocated',origin_total,'proposedAllocation',amount);
  end if;
  sequence_number:=coalesce((p_input->>'allocationSequence')::integer,(
    select coalesce(max(a.allocation_sequence),0)+1
    from public.retention_legacy_release_allocations a
    where a.legacy_release_source_id=s.id
  ));
  perform set_config('app.retention_phase6_internal_write','true',true);
  insert into public.retention_legacy_release_allocations(
    organization_id,project_id,reconciliation_case_id,legacy_release_source_id,
    originating_payment_claim_id,allocation_sequence,allocation_amount,created_by
  ) values(
    c.organization_id,c.project_id,c.id,s.id,origin.id,sequence_number,amount,auth.uid()
  ) returning id into allocation_id;
  update public.retention_legacy_reconciliation_cases set
    revision=revision+1,updated_at=now() where id=c.id returning * into c;
  perform set_config('app.retention_phase6_internal_write','',true);
  perform private.refresh_retention_legacy_case_totals(c.id);
  perform private.record_retention_legacy_event(
    c.id,'allocation_added',c.status,c.status,
    'Legacy release allocation added.',p_input->>'correlationId',
    jsonb_build_object('allocationId',allocation_id,'sourceId',s.id,
      'originatingPaymentClaimId',origin.id,'allocationAmount',amount));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'allocationId',allocation_id,'case',private.retention_legacy_case_json(c.id));
exception when unique_violation then
  return jsonb_build_object('succeeded',false,'errorCode','duplicate_origin');
end;
$$;

create or replace function public.update_retention_legacy_release_allocation(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a public.retention_legacy_release_allocations%rowtype;
  c public.retention_legacy_reconciliation_cases%rowtype;
  s public.retention_legacy_release_sources%rowtype; origin public.project_claims%rowtype;
  ctx jsonb; amount numeric; source_other numeric; origin_other numeric;
begin
  select * into a from public.retention_legacy_release_allocations
  where id=(p_input->>'allocationId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_allocation_not_found'); end if;
  select * into c from public.retention_legacy_reconciliation_cases
  where id=a.reconciliation_case_id;
  ctx:=private.retention_phase6_context(c.project_id,'retention.legacy.reconcile',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select * into c from public.retention_legacy_reconciliation_cases where id=c.id for update;
  if c.status not in ('draft','rejected') then
    return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_editable');
  end if;
  if c.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',c.revision);
  end if;
  begin amount:=round((p_input->>'allocationAmount')::numeric,2);
  exception when others then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_allocation_amount');
  end;
  if amount is null or amount<=0 then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_allocation_amount');
  end if;
  select * into s from public.retention_legacy_release_sources where id=a.legacy_release_source_id;
  select * into origin from public.project_claims where id=a.originating_payment_claim_id;
  select round(coalesce(sum(x.allocation_amount),0),2) into source_other
  from public.retention_legacy_release_allocations x
  where x.legacy_release_source_id=s.id and x.id<>a.id;
  if source_other+amount>s.retention_released_amount_snapshot then
    return jsonb_build_object('succeeded',false,'errorCode','source_overallocated');
  end if;
  select round(coalesce(sum(x.allocation_amount),0),2) into origin_other
  from public.retention_legacy_release_allocations x
  where x.reconciliation_case_id=c.id
    and x.originating_payment_claim_id=origin.id and x.id<>a.id;
  if origin_other+amount>greatest(origin.retention_withheld_amount,0) then
    return jsonb_build_object('succeeded',false,'errorCode','origin_overallocated');
  end if;
  perform set_config('app.retention_phase6_internal_write','true',true);
  update public.retention_legacy_release_allocations set
    allocation_amount=amount,
    allocation_sequence=coalesce((p_input->>'allocationSequence')::integer,allocation_sequence),
    updated_at=now() where id=a.id;
  update public.retention_legacy_reconciliation_cases set
    revision=revision+1,updated_at=now() where id=c.id returning * into c;
  perform set_config('app.retention_phase6_internal_write','',true);
  perform private.refresh_retention_legacy_case_totals(c.id);
  perform private.record_retention_legacy_event(
    c.id,'allocation_updated',c.status,c.status,
    'Legacy release allocation updated.',p_input->>'correlationId',
    jsonb_build_object('allocationId',a.id,'allocationAmount',amount));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'case',private.retention_legacy_case_json(c.id));
exception when unique_violation then
  return jsonb_build_object('succeeded',false,'errorCode','invalid_allocation_order');
end;
$$;

create or replace function public.remove_retention_legacy_release_allocation(
  p_allocation_id uuid,p_expected_revision bigint,p_correlation_id text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a public.retention_legacy_release_allocations%rowtype;
  c public.retention_legacy_reconciliation_cases%rowtype; ctx jsonb;
begin
  select * into a from public.retention_legacy_release_allocations where id=p_allocation_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_allocation_not_found'); end if;
  select * into c from public.retention_legacy_reconciliation_cases where id=a.reconciliation_case_id;
  ctx:=private.retention_phase6_context(c.project_id,'retention.legacy.reconcile',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select * into c from public.retention_legacy_reconciliation_cases where id=c.id for update;
  if c.status not in ('draft','rejected') then
    return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_editable');
  end if;
  if c.revision<>p_expected_revision then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',c.revision);
  end if;
  perform set_config('app.retention_phase6_internal_write','true',true);
  delete from public.retention_legacy_release_allocations where id=a.id;
  update public.retention_legacy_reconciliation_cases set
    revision=revision+1,updated_at=now() where id=c.id returning * into c;
  perform set_config('app.retention_phase6_internal_write','',true);
  perform private.refresh_retention_legacy_case_totals(c.id);
  perform private.record_retention_legacy_event(
    c.id,'allocation_removed',c.status,c.status,
    'Legacy release allocation removed.',p_correlation_id,
    jsonb_build_object('allocationId',a.id));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'case',private.retention_legacy_case_json(c.id));
end;
$$;

create or replace function private.validate_retention_legacy_case(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; source_state jsonb;
  source_errors jsonb; origin_errors jsonb; allocated numeric; allocation_count integer;
begin
  select * into c from public.retention_legacy_reconciliation_cases where id=p_case_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_found'); end if;
  source_state:=private.retention_legacy_source_state(c.project_id);
  if c.position_state_hash<>source_state->>'stateHash'
    or c.source_fingerprint<>source_state->>'sourceFingerprint' then
    return jsonb_build_object('succeeded',false,'errorCode','stale_reconciliation_case',
      'casePositionStateHash',c.position_state_hash,
      'currentPositionStateHash',source_state->>'stateHash',
      'caseSourceFingerprint',c.source_fingerprint,
      'currentSourceFingerprint',source_state->>'sourceFingerprint');
  end if;
  select jsonb_agg(jsonb_build_object(
    'sourceId',s.id,'sourcePaymentClaimId',s.source_payment_claim_id,
    'sourceAmount',s.retention_released_amount_snapshot,
    'allocatedAmount',coalesce(x.amount,0),
    'difference',round(s.retention_released_amount_snapshot-coalesce(x.amount,0),2)
  ) order by s.source_sequence,s.id)
  into source_errors
  from public.retention_legacy_release_sources s
  left join (
    select a.legacy_release_source_id,round(sum(a.allocation_amount),2) amount
    from public.retention_legacy_release_allocations a
    where a.reconciliation_case_id=c.id group by a.legacy_release_source_id
  ) x on x.legacy_release_source_id=s.id
  where s.reconciliation_case_id=c.id
    and coalesce(x.amount,0)<>s.retention_released_amount_snapshot;
  if source_errors is not null then
    return jsonb_build_object('succeeded',false,
      'errorCode','legacy_sources_not_fully_allocated','sources',source_errors);
  end if;
  select jsonb_agg(jsonb_build_object(
    'originatingPaymentClaimId',p.id,'claimNumber',p.claim_number,'status',p.status,
    'currentRetentionOwned',greatest(p.retention_withheld_amount,0),
    'migratedAllocation',x.amount
  ) order by p.id)
  into origin_errors
  from (
    select a.originating_payment_claim_id,round(sum(a.allocation_amount),2) amount
    from public.retention_legacy_release_allocations a
    where a.reconciliation_case_id=c.id group by a.originating_payment_claim_id
  ) x
  join public.project_claims p on p.id=x.originating_payment_claim_id
  where p.status='Cancelled' or x.amount>greatest(p.retention_withheld_amount,0);
  if origin_errors is not null then
    return jsonb_build_object('succeeded',false,
      'errorCode','legacy_origin_overallocated','origins',origin_errors);
  end if;
  select round(coalesce(sum(a.allocation_amount),0),2),count(*)
  into allocated,allocation_count
  from public.retention_legacy_release_allocations a
  where a.reconciliation_case_id=c.id;
  if allocated<>c.total_legacy_released then
    return jsonb_build_object('succeeded',false,
      'errorCode','legacy_total_mismatch','expectedTotal',c.total_legacy_released,
      'allocatedTotal',allocated);
  end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'positionStateHash',source_state->>'stateHash',
    'sourceFingerprint',source_state->>'sourceFingerprint',
    'totalLegacyReleased',c.total_legacy_released,
    'totalAllocated',allocated,'allocationCount',allocation_count);
end;
$$;

create or replace function public.submit_retention_legacy_reconciliation_case(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; ctx jsonb;
  validation jsonb; note text; evidence_ref text; evidence_value jsonb;
begin
  select * into c from public.retention_legacy_reconciliation_cases
  where id=(p_input->>'caseId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_found'); end if;
  ctx:=private.retention_phase6_context(c.project_id,'retention.legacy.reconcile',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select * into c from public.retention_legacy_reconciliation_cases where id=c.id for update;
  if c.status not in ('draft','rejected') then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_legacy_transition');
  end if;
  if c.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',c.revision);
  end if;
  note:=nullif(trim(coalesce(p_input->>'reconciliationNote','')),'');
  evidence_ref:=nullif(trim(coalesce(p_input->>'evidenceReference','')),'');
  evidence_value:=p_input->'evidence';
  if note is null or evidence_ref is null or evidence_value is null
    or jsonb_typeof(evidence_value)<>'object' or evidence_value='{}'::jsonb then
    return jsonb_build_object('succeeded',false,'errorCode','reconciliation_evidence_required');
  end if;
  validation:=private.validate_retention_legacy_case(c.id);
  if not coalesce((validation->>'succeeded')::boolean,false) then
    perform private.record_retention_legacy_event(
      c.id,'submission_rejected',c.status,c.status,
      validation->>'errorCode',p_input->>'correlationId',validation);
    return validation;
  end if;
  perform set_config('app.retention_phase6_internal_write','true',true);
  update public.retention_legacy_release_allocations a set
    origin_claim_number_snapshot=p.claim_number,
    origin_claim_date_snapshot=p.claim_date,
    origin_claim_status_snapshot=p.status,
    origin_claim_created_at_snapshot=p.created_at,
    origin_claim_updated_at_snapshot=p.updated_at,
    origin_retention_owned_snapshot=greatest(p.retention_withheld_amount,0),
    origin_state_hash_snapshot=private.retention_claim_origin_state_hash(p.id),
    position_state_hash_snapshot=c.position_state_hash,
    updated_at=now()
  from public.project_claims p
  where a.reconciliation_case_id=c.id and p.id=a.originating_payment_claim_id;
  update public.retention_legacy_reconciliation_cases set
    status='in_review',reconciliation_note=note,evidence_reference=evidence_ref,
    evidence=evidence_value,submitted_by=auth.uid(),submitted_at=now(),
    rejected_by=null,rejected_at=null,rejection_reason=null,
    total_allocated=(validation->>'totalAllocated')::numeric,
    allocation_count=(validation->>'allocationCount')::integer,
    revision=revision+1,updated_at=now()
  where id=c.id returning * into c;
  perform set_config('app.retention_phase6_internal_write','',true);
  perform private.record_retention_legacy_event(
    c.id,'submitted_for_approval','draft','in_review',
    'Legacy retention reconciliation submitted for approval.',
    p_input->>'correlationId',jsonb_build_object(
      'evidenceReference',evidence_ref,'validation',validation));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'case',private.retention_legacy_case_json(c.id));
end;
$$;

create or replace function public.approve_retention_legacy_reconciliation_case(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; ctx jsonb;
  validation jsonb; approval_reason text; affected_origins uuid[];
begin
  select * into c from public.retention_legacy_reconciliation_cases
  where id=(p_input->>'caseId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_found'); end if;
  ctx:=private.retention_phase6_context(c.project_id,'retention.legacy.approve',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then
    return case when ctx->>'errorCode'='permission_denied'
      then jsonb_build_object('succeeded',false,'errorCode','legacy_approval_permission_required')
      else ctx end;
  end if;
  select * into c from public.retention_legacy_reconciliation_cases where id=c.id for update;
  if c.status<>'in_review' then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_legacy_transition');
  end if;
  if c.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',c.revision);
  end if;
  approval_reason:=nullif(trim(coalesce(p_input->>'approvalReason','')),'');
  if approval_reason is null then
    return jsonb_build_object('succeeded',false,'errorCode','approval_reason_required');
  end if;
  validation:=private.validate_retention_legacy_case(c.id);
  if not coalesce((validation->>'succeeded')::boolean,false) then
    perform private.record_retention_legacy_event(
      c.id,'stale_state_rejected',c.status,c.status,
      validation->>'errorCode',p_input->>'correlationId',validation);
    return validation;
  end if;
  perform set_config('app.retention_phase6_internal_write','true',true);
  update public.retention_legacy_release_allocations set
    approved_by=auth.uid(),approved_at=now(),updated_at=now()
  where reconciliation_case_id=c.id;
  update public.retention_legacy_reconciliation_cases set
    status='approved',approved_by=auth.uid(),approved_at=now(),
    revision=revision+1,updated_at=now()
  where id=c.id returning * into c;
  perform set_config('app.retention_phase6_internal_write','',true);
  perform private.record_retention_legacy_event(
    c.id,'reconciliation_approved','in_review','approved',approval_reason,
    p_input->>'correlationId',jsonb_build_object(
      'validation',validation,'createsXeroInvoice',false,
      'modifiesPaymentClaims',false));
  select array_agg(distinct a.originating_payment_claim_id
    order by a.originating_payment_claim_id) into affected_origins
  from public.retention_legacy_release_allocations a
  where a.reconciliation_case_id=c.id;
  perform private.evaluate_retention_variance_project(
    c.project_id,p_input->>'correlationId',affected_origins);
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'availabilityRestored',false,'xeroDocumentCreated',false,
    'case',private.retention_legacy_case_json(c.id),
    'retentionPosition',public.get_project_retention_position_summary(c.project_id));
end;
$$;

create or replace function public.reject_retention_legacy_reconciliation_case(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; ctx jsonb; reason text;
begin
  select * into c from public.retention_legacy_reconciliation_cases
  where id=(p_input->>'caseId')::uuid;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_found'); end if;
  ctx:=private.retention_phase6_context(c.project_id,'retention.legacy.approve',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  reason:=nullif(trim(coalesce(p_input->>'reason','')),'');
  if reason is null then
    return jsonb_build_object('succeeded',false,'errorCode','rejection_reason_required');
  end if;
  select * into c from public.retention_legacy_reconciliation_cases where id=c.id for update;
  if c.status<>'in_review' then
    return jsonb_build_object('succeeded',false,'errorCode','invalid_legacy_transition');
  end if;
  if c.revision<>(p_input->>'expectedRevision')::bigint then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',c.revision);
  end if;
  perform set_config('app.retention_phase6_internal_write','true',true);
  update public.retention_legacy_reconciliation_cases set
    status='rejected',rejected_by=auth.uid(),rejected_at=now(),
    rejection_reason=reason,revision=revision+1,updated_at=now()
  where id=c.id returning * into c;
  perform set_config('app.retention_phase6_internal_write','',true);
  perform private.record_retention_legacy_event(
    c.id,'reconciliation_rejected','in_review','rejected',reason,
    p_input->>'correlationId','{}'::jsonb);
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'case',private.retention_legacy_case_json(c.id));
end;
$$;

create or replace function private.current_effective_retention_legacy_case(
  p_project_id uuid
)
returns uuid language sql stable security definer set search_path=public
as $$
  select c.id
  from public.retention_legacy_reconciliation_cases c
  where c.project_id=p_project_id
    and c.status in ('approved','superseded')
    and c.approved_at is not null
  order by c.case_sequence desc limit 1;
$$;

create or replace function private.current_legacy_committed_by_origin(
  p_project_id uuid
)
returns table(originating_payment_claim_id uuid,amount numeric)
language sql stable security definer set search_path=public
as $$
  select a.originating_payment_claim_id,round(sum(a.allocation_amount),2)
  from public.retention_legacy_release_allocations a
  where a.reconciliation_case_id=
    private.current_effective_retention_legacy_case(p_project_id)
  group by a.originating_payment_claim_id;
$$;

alter function private.retention_eligibility_state(uuid)
  rename to retention_eligibility_state_phase4_pre_legacy_reconciliation;
revoke all on function
  private.retention_eligibility_state_phase4_pre_legacy_reconciliation(uuid)
  from public,anon,authenticated;

create or replace function private.retention_eligibility_state(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,extensions
as $$
declare base jsonb; updated_origins jsonb; organization_id uuid;
begin
  base:=private.retention_eligibility_state_phase4_pre_legacy_reconciliation(
    p_project_id);
  select p.organization_id into organization_id
  from public.organization_projects p where p.id=p_project_id;
  select coalesce(jsonb_agg(
    x||jsonb_build_object(
      'submittedRetentionClaimCommitted',
        coalesce((x->>'committedRetention')::numeric,0),
      'legacyCommittedRetention',coalesce(l.amount,0),
      'currentEligibleRetention',least(
        coalesce((x->>'currentRetentionOwned')::numeric,0),
        greatest(
          coalesce((x->>'currentEligibleRetention')::numeric,0),
          coalesce(l.amount,0)
        )
      ),
      'committedRetention',
        round(coalesce((x->>'committedRetention')::numeric,0)+coalesce(l.amount,0),2),
      'availableRetention',greatest(round(
        least(
          coalesce((x->>'currentRetentionOwned')::numeric,0),
          greatest(
            coalesce((x->>'currentEligibleRetention')::numeric,0),
            coalesce(l.amount,0)
          )
        )
        -coalesce((x->>'committedRetention')::numeric,0)-coalesce(l.amount,0),2
      ),0)
    ) order by x->>'originatingPaymentClaimId'
  ),'[]'::jsonb) into updated_origins
  from jsonb_array_elements(coalesce(base->'origins','[]'::jsonb)) x
  left join private.current_legacy_committed_by_origin(p_project_id) l
    on l.originating_payment_claim_id=(x->>'originatingPaymentClaimId')::uuid;
  return jsonb_build_object(
    'organizationId',organization_id,'projectId',p_project_id,
    'positionStateHash',base->>'positionStateHash',
    'eligibilityStateHash',encode(extensions.digest(convert_to(jsonb_build_object(
      'organizationId',organization_id,'projectId',p_project_id,
      'positionStateHash',base->>'positionStateHash','origins',updated_origins
    )::text,'UTF8'),'sha256'),'hex'),
    'origins',updated_origins,
    'effectiveLegacyReconciliationCaseId',
      private.current_effective_retention_legacy_case(p_project_id)
  );
end;
$$;

alter function private.retention_variance_snapshot(uuid,uuid)
  rename to retention_variance_snapshot_phase5_pre_legacy_reconciliation;
revoke all on function
  private.retention_variance_snapshot_phase5_pre_legacy_reconciliation(uuid,uuid)
  from public,anon,authenticated;

create or replace function private.retention_variance_snapshot(
  p_project_id uuid,p_originating_payment_claim_id uuid
)
returns jsonb language plpgsql stable security definer set search_path=public,extensions
as $$
declare base jsonb; legacy_amount numeric:=0; total_committed numeric;
  owned numeric; eligible numeric; ownership_variance numeric; eligibility_variance numeric;
  conditions text[]; primary_type text; variance_state text; variance_severity text;
  blocking boolean:=false; legacy_payload jsonb; combined_hash text;
begin
  base:=private.retention_variance_snapshot_phase5_pre_legacy_reconciliation(
    p_project_id,p_originating_payment_claim_id);
  if not coalesce((base->>'succeeded')::boolean,false) then return base; end if;
  select coalesce(l.amount,0) into legacy_amount
  from private.current_legacy_committed_by_origin(p_project_id) l
  where l.originating_payment_claim_id=p_originating_payment_claim_id;
  legacy_amount:=coalesce(legacy_amount,0);
  if legacy_amount=0 then return base; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'legacyAllocationId',a.id,'reconciliationCaseId',a.reconciliation_case_id,
    'legacyReleaseSourceId',a.legacy_release_source_id,
    'originatingPaymentClaimId',a.originating_payment_claim_id,
    'allocationAmount',a.allocation_amount,'approvedAt',a.approved_at
  ) order by a.id),'[]'::jsonb) into legacy_payload
  from public.retention_legacy_release_allocations a
  where a.reconciliation_case_id=
      private.current_effective_retention_legacy_case(p_project_id)
    and a.originating_payment_claim_id=p_originating_payment_claim_id;
  owned:=(base->>'currentOwnership')::numeric;
  eligible:=(base->>'currentEligibility')::numeric;
  total_committed:=round((base->>'committedRetention')::numeric+legacy_amount,2);
  ownership_variance:=round(owned-total_committed,2);
  eligibility_variance:=round(eligible-total_committed,2);
  conditions:=array(
    select distinct value from (
      select jsonb_array_elements_text(
        coalesce(base->'contributingConditions','[]'::jsonb)) value
      union all
      select 'legacy_reconciliation_conflict'
      where total_committed>owned or total_committed>eligible
    ) values_set order by value
  );
  if base->>'originStatus'='Cancelled' and total_committed>0 then
    primary_type:='origin_payment_claim_cancelled';
    variance_state:=case when total_committed>owned then 'over_allocated'
      else 'reconciliation_required' end;
    variance_severity:=case when total_committed>owned then 'critical' else 'high' end;
    blocking:=true;
  elsif total_committed>owned then
    primary_type:='legacy_reconciliation_conflict';
    variance_state:='over_allocated';variance_severity:='critical';blocking:=true;
  elsif total_committed>eligible then
    primary_type:='legacy_reconciliation_conflict';
    variance_state:='reconciliation_required';variance_severity:='high';blocking:=true;
  else
    primary_type:=base->>'primaryType';
    variance_state:=base->>'state';
    variance_severity:=base->>'severity';
    blocking:=coalesce((base->>'isBlocking')::boolean,false);
  end if;
  combined_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'submittedAllocationHash',base->>'committedAllocationHash',
    'legacyAllocations',legacy_payload
  )::text,'UTF8'),'sha256'),'hex');
  return base||jsonb_build_object(
    'hasVariance',primary_type is not null,
    'primaryType',primary_type,'contributingConditions',to_jsonb(conditions),
    'state',variance_state,'severity',variance_severity,'isBlocking',blocking,
    'submittedRetentionClaimCommitted',base->'committedRetention',
    'legacyCommittedRetention',legacy_amount,'committedRetention',total_committed,
    'ownershipVariance',ownership_variance,'eligibilityVariance',eligibility_variance,
    'diagnosticRemaining',round(least(owned,eligible)-total_committed,2),
    'allocatableAvailability',greatest(round(least(owned,eligible)-total_committed,2),0),
    'committedAllocationHash',combined_hash,
    'legacyAllocations',legacy_payload,
    'effectiveLegacyReconciliationCaseId',
      private.current_effective_retention_legacy_case(p_project_id)
  );
end;
$$;

create or replace function public.get_retention_legacy_reconciliation_case(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; ctx jsonb;
begin
  select * into c from public.retention_legacy_reconciliation_cases where id=p_case_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_found'); end if;
  ctx:=private.retention_phase6_context(c.project_id,'retention.view',false);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'case',private.retention_legacy_case_json(c.id),
    'retentionPosition',public.get_project_retention_position_summary(c.project_id));
end;
$$;

create or replace function public.list_project_retention_legacy_reconciliation_cases(
  p_project_id uuid,p_limit integer default 100,p_before_sequence integer default null
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare ctx jsonb;
begin
  ctx:=private.retention_phase6_context(p_project_id,'retention.view',false);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'cases',coalesce((
    select jsonb_agg(private.retention_legacy_case_json(x.id)
      order by x.case_sequence desc,x.id desc)
    from (
      select c.id,c.case_sequence
      from public.retention_legacy_reconciliation_cases c
      where c.project_id=p_project_id
        and (p_before_sequence is null or c.case_sequence<p_before_sequence)
      order by c.case_sequence desc,c.id desc
      limit least(greatest(coalesce(p_limit,100),1),500)
    ) x
  ),'[]'::jsonb));
end;
$$;

create or replace function public.get_retention_legacy_reconciliation_events(
  p_case_id uuid,p_limit integer default 200
)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; ctx jsonb;
begin
  select * into c from public.retention_legacy_reconciliation_cases where id=p_case_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_found'); end if;
  ctx:=private.retention_phase6_context(c.project_id,'retention.view',false);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  return jsonb_build_object('succeeded',true,'errorCode',null,'events',coalesce((
    select jsonb_agg(to_jsonb(e) order by e.occurred_at desc,e.id desc)
    from (
      select * from public.retention_legacy_reconciliation_events
      where reconciliation_case_id=p_case_id
      order by occurred_at desc,id desc
      limit least(greatest(coalesce(p_limit,200),1),1000)
    ) e
  ),'[]'::jsonb));
end;
$$;

-- Phase 6 submission integration: all existing Phase 3–5 ownership,
-- eligibility, stale-state, and variance checks remain authoritative. The
-- wrapper only freezes approved migrated commitment in new submission evidence.
alter function public.submit_retention_claim(uuid,bigint,text,text,text)
  rename to submit_retention_claim_phase5_pre_legacy_reconciliation;
revoke all on function
  public.submit_retention_claim_phase5_pre_legacy_reconciliation(
    uuid,bigint,text,text,text
  ) from public,anon,authenticated,service_role;

create or replace function public.submit_retention_claim(
  p_retention_claim_id uuid,p_expected_draft_revision bigint,
  p_expected_position_state_hash text,p_correlation_id text default null,
  p_expected_eligibility_state_hash text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare result jsonb; claim_row public.retention_claims%rowtype;
begin
  if not private.retention_phase6_gate_enabled() then
    return public.submit_retention_claim_phase5_pre_legacy_reconciliation(
      p_retention_claim_id,p_expected_draft_revision,p_expected_position_state_hash,
      p_correlation_id,p_expected_eligibility_state_hash);
  end if;
  result:=public.submit_retention_claim_phase5_pre_legacy_reconciliation(
    p_retention_claim_id,p_expected_draft_revision,p_expected_position_state_hash,
    p_correlation_id,p_expected_eligibility_state_hash);
  if not coalesce((result->>'succeeded')::boolean,false) then return result; end if;
  select * into claim_row from public.retention_claims where id=p_retention_claim_id;
  perform set_config('app.retention_phase4_submission_write','true',true);
  update public.retention_claim_allocations a set
    existing_submitted_allocation_before=round(
      a.existing_submitted_allocation_before+coalesce(l.amount,0),2),
    remaining_after_allocation=round(
      a.retention_withheld_snapshot
      -a.existing_submitted_allocation_before-coalesce(l.amount,0)
      -a.allocation_amount,2)
  from private.current_legacy_committed_by_origin(claim_row.project_id) l
  where a.retention_claim_id=p_retention_claim_id
    and l.originating_payment_claim_id=a.originating_payment_claim_id;
  perform set_config('app.retention_phase4_submission_write','',true);
  return result||jsonb_build_object(
    'allocations',private.retention_claim_current_origin_details(p_retention_claim_id),
    'effectiveLegacyReconciliationCaseId',
      private.current_effective_retention_legacy_case(claim_row.project_id)
  );
end;
$$;

alter table public.retention_legacy_reconciliation_cases enable row level security;
alter table public.retention_legacy_reconciliation_cases force row level security;
alter table public.retention_legacy_release_sources enable row level security;
alter table public.retention_legacy_release_sources force row level security;
alter table public.retention_legacy_release_allocations enable row level security;
alter table public.retention_legacy_release_allocations force row level security;
alter table public.retention_legacy_reconciliation_events enable row level security;
alter table public.retention_legacy_reconciliation_events force row level security;

create policy "Retention viewers can read legacy reconciliation cases"
on public.retention_legacy_reconciliation_cases for select to authenticated
using(public.has_org_permission(organization_id,'retention.view'));
create policy "Retention viewers can read legacy release sources"
on public.retention_legacy_release_sources for select to authenticated
using(public.has_org_permission(organization_id,'retention.view'));
create policy "Retention viewers can read legacy release allocations"
on public.retention_legacy_release_allocations for select to authenticated
using(public.has_org_permission(organization_id,'retention.view'));
create policy "Retention viewers can read legacy reconciliation events"
on public.retention_legacy_reconciliation_events for select to authenticated
using(public.has_org_permission(organization_id,'retention.view'));

revoke all on public.retention_legacy_reconciliation_cases
  from public,anon,authenticated;
revoke all on public.retention_legacy_release_sources
  from public,anon,authenticated;
revoke all on public.retention_legacy_release_allocations
  from public,anon,authenticated;
revoke all on public.retention_legacy_reconciliation_events
  from public,anon,authenticated;
grant select on public.retention_legacy_reconciliation_cases to service_role;
grant select on public.retention_legacy_release_sources to service_role;
grant select on public.retention_legacy_release_allocations to service_role;
grant select on public.retention_legacy_reconciliation_events to service_role;

revoke all on function private.retention_phase6_gate_enabled()
  from public,anon,authenticated;
revoke all on function private.retention_phase6_context(uuid,text,boolean)
  from public,anon,authenticated;
revoke all on function public.prevent_retention_legacy_event_mutation()
  from public,anon,authenticated;
revoke all on function public.protect_retention_legacy_case_mutation()
  from public,anon,authenticated;
revoke all on function public.protect_retention_legacy_source_mutation()
  from public,anon,authenticated;
revoke all on function public.protect_retention_legacy_allocation_mutation()
  from public,anon,authenticated;
revoke all on function private.record_retention_legacy_event(
  uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function private.retention_legacy_source_state(uuid)
  from public,anon,authenticated;
revoke all on function private.retention_claim_chronological_sequence(uuid,uuid)
  from public,anon,authenticated;
revoke all on function private.validate_retention_legacy_case(uuid)
  from public,anon,authenticated;
revoke all on function private.current_effective_retention_legacy_case(uuid)
  from public,anon,authenticated;
revoke all on function private.current_legacy_committed_by_origin(uuid)
  from public,anon,authenticated;

revoke all on function public.get_project_retention_position_summary(uuid)
  from public,anon;
grant execute on function public.get_project_retention_position_summary(uuid)
  to authenticated;
revoke all on function public.add_retention_legacy_release_allocation(jsonb)
  from public,anon;
grant execute on function public.add_retention_legacy_release_allocation(jsonb)
  to authenticated;
revoke all on function public.update_retention_legacy_release_allocation(jsonb)
  from public,anon;
grant execute on function public.update_retention_legacy_release_allocation(jsonb)
  to authenticated;
revoke all on function public.remove_retention_legacy_release_allocation(
  uuid,bigint,text) from public,anon;
grant execute on function public.remove_retention_legacy_release_allocation(
  uuid,bigint,text) to authenticated;
revoke all on function public.submit_retention_legacy_reconciliation_case(jsonb)
  from public,anon;
grant execute on function public.submit_retention_legacy_reconciliation_case(jsonb)
  to authenticated;
revoke all on function public.approve_retention_legacy_reconciliation_case(jsonb)
  from public,anon;
grant execute on function public.approve_retention_legacy_reconciliation_case(jsonb)
  to authenticated;
revoke all on function public.reject_retention_legacy_reconciliation_case(jsonb)
  from public,anon;
grant execute on function public.reject_retention_legacy_reconciliation_case(jsonb)
  to authenticated;
revoke all on function public.get_retention_legacy_reconciliation_case(uuid)
  from public,anon;
grant execute on function public.get_retention_legacy_reconciliation_case(uuid)
  to authenticated;
revoke all on function public.list_project_retention_legacy_reconciliation_cases(
  uuid,integer,integer) from public,anon;
grant execute on function public.list_project_retention_legacy_reconciliation_cases(
  uuid,integer,integer) to authenticated;
revoke all on function public.get_retention_legacy_reconciliation_events(uuid,integer)
  from public,anon;
grant execute on function public.get_retention_legacy_reconciliation_events(uuid,integer)
  to authenticated;
revoke all on function public.submit_retention_claim(uuid,bigint,text,text,text)
  from public,anon;
grant execute on function public.submit_retention_claim(uuid,bigint,text,text,text)
  to authenticated;

create or replace function private.refresh_retention_legacy_case_totals(p_case_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  perform set_config('app.retention_phase6_internal_write','true',true);
  update public.retention_legacy_reconciliation_cases c set
    total_allocated=coalesce((
      select round(sum(a.allocation_amount),2)
      from public.retention_legacy_release_allocations a
      where a.reconciliation_case_id=c.id
    ),0),
    allocation_count=(
      select count(*) from public.retention_legacy_release_allocations a
      where a.reconciliation_case_id=c.id
    ),
    updated_at=now()
  where c.id=p_case_id;
  perform set_config('app.retention_phase6_internal_write','',true);
end;
$$;

create or replace function private.populate_retention_legacy_sources(
  p_case_id uuid,p_source_state jsonb
)
returns integer language plpgsql security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; inserted_count integer;
begin
  select * into c from public.retention_legacy_reconciliation_cases where id=p_case_id;
  perform set_config('app.retention_phase6_internal_write','true',true);
  insert into public.retention_legacy_release_sources(
    organization_id,project_id,reconciliation_case_id,source_payment_claim_id,
    source_sequence,claim_number_snapshot,claim_date_snapshot,claim_status_snapshot,
    claim_created_at_snapshot,claim_updated_at_snapshot,
    retention_released_amount_snapshot,source_origin_state_hash
  )
  select c.organization_id,c.project_id,c.id,p.id,
    (x->>'chronologicalSequence')::integer,p.claim_number,p.claim_date,p.status,
    p.created_at,p.updated_at,round((x->>'retentionReleasedAmount')::numeric,2),
    private.retention_claim_origin_state_hash(p.id)
  from jsonb_array_elements(p_source_state->'legacyReleaseOrigins') x
  join public.project_claims p on p.id=(x->>'paymentClaimId')::uuid
    and p.organization_id=c.organization_id and p.project_id=c.project_id
  order by (x->>'chronologicalSequence')::integer,p.id;
  get diagnostics inserted_count=row_count;
  perform set_config('app.retention_phase6_internal_write','',true);
  return inserted_count;
end;
$$;

create or replace function public.create_retention_legacy_reconciliation_case(
  p_project_id uuid,p_correlation_id text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare ctx jsonb; source_state jsonb; current_case public.retention_legacy_reconciliation_cases%rowtype;
  new_case public.retention_legacy_reconciliation_cases%rowtype; next_sequence integer;
  source_count integer; new_case_id uuid:=gen_random_uuid();
begin
  ctx:=private.retention_phase6_context(
    p_project_id,'retention.legacy.reconcile',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  source_state:=private.retention_legacy_source_state(p_project_id);
  if not coalesce((source_state->>'legacyReconciliationRequired')::boolean,false) then
    return jsonb_build_object('succeeded',false,'errorCode','legacy_reconciliation_not_required');
  end if;
  if round(coalesce((source_state->>'totalLegacyRetentionReleased')::numeric,0),2)<=0 then
    return jsonb_build_object('succeeded',false,'errorCode','legacy_release_not_found');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_project_id::text||':legacy_retention_reconciliation',6));
  select * into current_case from public.retention_legacy_reconciliation_cases c
  where c.project_id=p_project_id and c.status in ('draft','in_review','approved')
  for update;
  if found and current_case.position_state_hash=source_state->>'stateHash'
    and current_case.source_fingerprint=source_state->>'sourceFingerprint' then
    return jsonb_build_object('succeeded',true,'errorCode',null,
      'created',false,'case',private.retention_legacy_case_json(current_case.id));
  end if;
  if found and current_case.status in ('draft','in_review') then
    return jsonb_build_object('succeeded',false,'errorCode','stale_reconciliation_case',
      'case',private.retention_legacy_case_json(current_case.id),
      'currentPositionStateHash',source_state->>'stateHash',
      'currentSourceFingerprint',source_state->>'sourceFingerprint');
  end if;
  select coalesce(max(c.case_sequence),0)+1 into next_sequence
  from public.retention_legacy_reconciliation_cases c where c.project_id=p_project_id;
  perform set_config('app.retention_phase6_internal_write','true',true);
  if current_case.id is not null then
    update public.retention_legacy_reconciliation_cases set
      status='superseded',superseded_by_case_id=new_case_id,
      superseded_at=now(),revision=revision+1,updated_at=now()
    where id=current_case.id;
  end if;
  insert into public.retention_legacy_reconciliation_cases(
    id,organization_id,project_id,case_sequence,position_state_hash,source_fingerprint,
    total_legacy_released,source_count,supersedes_case_id,created_by
  ) values(
    new_case_id,(ctx->>'organizationId')::uuid,p_project_id,next_sequence,
    source_state->>'stateHash',source_state->>'sourceFingerprint',
    round((source_state->>'totalLegacyRetentionReleased')::numeric,2),
    jsonb_array_length(source_state->'legacyReleaseOrigins'),
    current_case.id,auth.uid()
  ) returning * into new_case;
  perform set_config('app.retention_phase6_internal_write','',true);
  source_count:=private.populate_retention_legacy_sources(new_case.id,source_state);
  if source_count<>new_case.source_count then
    raise exception 'Legacy release source snapshot count changed during case creation.';
  end if;
  if current_case.id is not null then
    perform private.record_retention_legacy_event(
      current_case.id,'case_superseded','approved','superseded',
      'Approved reconciliation superseded by a changed persisted Payment Claim state.',
      p_correlation_id,jsonb_build_object('supersededByCaseId',new_case.id));
  end if;
  perform private.record_retention_legacy_event(
    new_case.id,'case_created',null,'draft',
    'Legacy retention reconciliation case created without inferred allocations.',
    p_correlation_id,jsonb_build_object('sourceCount',source_count));
  return jsonb_build_object('succeeded',true,'errorCode',null,'created',true,
    'case',private.retention_legacy_case_json(new_case.id));
end;
$$;

create or replace function public.refresh_retention_legacy_reconciliation_case(
  p_case_id uuid,p_expected_revision bigint,p_correlation_id text default null
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare c public.retention_legacy_reconciliation_cases%rowtype; ctx jsonb;
  source_state jsonb; source_count integer;
begin
  select * into c from public.retention_legacy_reconciliation_cases where id=p_case_id;
  if not found then return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_found'); end if;
  ctx:=private.retention_phase6_context(
    c.project_id,'retention.legacy.reconcile',true);
  if not coalesce((ctx->>'succeeded')::boolean,false) then return ctx; end if;
  select * into c from public.retention_legacy_reconciliation_cases
  where id=c.id for update;
  if c.status not in ('draft','rejected') then
    return jsonb_build_object('succeeded',false,'errorCode','legacy_case_not_editable');
  end if;
  if c.revision<>p_expected_revision then
    return jsonb_build_object('succeeded',false,'errorCode','concurrent_update',
      'currentRevision',c.revision);
  end if;
  source_state:=private.retention_legacy_source_state(c.project_id);
  if not coalesce((source_state->>'legacyReconciliationRequired')::boolean,false) then
    return jsonb_build_object('succeeded',false,'errorCode','legacy_reconciliation_not_required');
  end if;
  perform set_config('app.retention_phase6_internal_write','true',true);
  delete from public.retention_legacy_release_allocations where reconciliation_case_id=c.id;
  delete from public.retention_legacy_release_sources where reconciliation_case_id=c.id;
  update public.retention_legacy_reconciliation_cases set
    status='draft',position_state_hash=source_state->>'stateHash',
    source_fingerprint=source_state->>'sourceFingerprint',
    total_legacy_released=round((source_state->>'totalLegacyRetentionReleased')::numeric,2),
    total_allocated=0,
    source_count=jsonb_array_length(source_state->'legacyReleaseOrigins'),
    allocation_count=0,submitted_by=null,submitted_at=null,
    rejected_by=null,rejected_at=null,rejection_reason=null,
    revision=revision+1,updated_at=now()
  where id=c.id returning * into c;
  perform set_config('app.retention_phase6_internal_write','',true);
  source_count:=private.populate_retention_legacy_sources(c.id,source_state);
  perform private.record_retention_legacy_event(
    c.id,'case_refreshed',null,'draft',
    'Legacy reconciliation case refreshed; draft allocations were removed.',
    p_correlation_id,jsonb_build_object('sourceCount',source_count));
  return jsonb_build_object('succeeded',true,'errorCode',null,
    'case',private.retention_legacy_case_json(c.id));
end;
$$;

revoke all on function private.retention_legacy_case_json(uuid)
  from public,anon,authenticated;
revoke all on function private.refresh_retention_legacy_case_totals(uuid)
  from public,anon,authenticated;
revoke all on function private.populate_retention_legacy_sources(uuid,jsonb)
  from public,anon,authenticated;
revoke all on function public.create_retention_legacy_reconciliation_case(uuid,text)
  from public,anon;
grant execute on function public.create_retention_legacy_reconciliation_case(uuid,text)
  to authenticated;
revoke all on function public.refresh_retention_legacy_reconciliation_case(
  uuid,bigint,text) from public,anon;
grant execute on function public.refresh_retention_legacy_reconciliation_case(
  uuid,bigint,text) to authenticated;

commit;
