begin;

drop function if exists public.probe_retention_ownership_phase2a(uuid,uuid);
drop function if exists
  public.probe_retention_ownership_phase2a_pre_legacy_fixture_fix(uuid,uuid);
drop function if exists
  public.probe_accounting_phase2a_immutability(uuid,uuid,uuid,uuid,uuid,uuid,uuid);
drop function if exists
  public.prepare_phase2a_number_boundary_fixture(uuid,text,text);
drop function if exists public.cleanup_phase2a_verification_fixture(uuid);
drop function if exists
  public.cleanup_empty_phase2a_verification_organization(uuid);
drop function if exists
  public.create_phase2a_verification_user(text,text,text);
drop function if exists public.delete_phase2a_verification_user(uuid);

create or replace function public.reject_phase2a_append_only_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Immutable accounting evidence is append-only.'
    using errcode = '55000';
end;
$$;

create or replace function public.guard_phase2a_revision_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Confirmed accounting revisions cannot be deleted.'
      using errcode = '55000';
  end if;
  if coalesce(current_setting('app.accounting_phase2a_lifecycle_write', true), '') <> 'true' then
    raise exception 'Accounting revision lifecycle changes require a controlled function.'
      using errcode = '55000';
  end if;
  if (to_jsonb(new) - array[
      'lifecycle_state', 'external_document_id', 'succeeded_at', 'activated_at',
      'superseded_at', 'superseded_by_revision_id', 'failure_code',
      'failure_message', 'updated_at'
    ]) is distinct from
    (to_jsonb(old) - array[
      'lifecycle_state', 'external_document_id', 'succeeded_at', 'activated_at',
      'superseded_at', 'superseded_by_revision_id', 'failure_code',
      'failure_message', 'updated_at'
    ]) then
    raise exception 'Confirmed accounting revision evidence is immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.guard_phase2a_attachment_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Accounting attachment evidence cannot be deleted.'
      using errcode = '55000';
  end if;
  if coalesce(current_setting('app.accounting_phase2a_attachment_write', true), '') <> 'true' then
    raise exception 'Accounting attachment state requires a controlled function.'
      using errcode = '55000';
  end if;
  if (to_jsonb(new) - array[
      'upload_state', 'provider_attachment_id', 'uploaded_at',
      'failure_code', 'failure_message', 'updated_at'
    ]) is distinct from
    (to_jsonb(old) - array[
      'upload_state', 'provider_attachment_id', 'uploaded_at',
      'failure_code', 'failure_message', 'updated_at'
    ]) then
    raise exception 'Accounting attachment metadata is immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.guard_phase2a_attempt_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Accounting attempts cannot be deleted.' using errcode = '55000';
  end if;
  if coalesce(current_setting('app.accounting_phase2a_lease_write', true), '') <> 'true' then
    raise exception 'Accounting attempts require lease-token functions.'
      using errcode = '55000';
  end if;
  if old.queue_state in ('succeeded', 'failed', 'attention_required')
    and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'Completed accounting attempt evidence is immutable.'
      using errcode = '55000';
  end if;
  if (to_jsonb(new) - array[
      'queue_state', 'response_evidence', 'worker_id', 'lease_token',
      'lease_expires_at', 'heartbeat_at', 'started_at', 'completed_at',
      'outcome_code', 'outcome_message', 'updated_at'
    ]) is distinct from
    (to_jsonb(old) - array[
      'queue_state', 'response_evidence', 'worker_id', 'lease_token',
      'lease_expires_at', 'heartbeat_at', 'started_at', 'completed_at',
      'outcome_code', 'outcome_message', 'updated_at'
    ]) then
    raise exception 'Accounting attempt identity and request evidence are immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.guard_phase2a_document_pointer_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    new.active_accounting_revision_id is distinct from old.active_accounting_revision_id
    or new.current_accounting_projection_id
      is distinct from old.current_accounting_projection_id
    or new.current_legacy_classification_id
      is distinct from old.current_legacy_classification_id
  ) and coalesce(
    current_setting('app.accounting_phase2a_pointer_write', true), ''
  ) <> 'true' then
    raise exception 'Accounting evidence pointers require a controlled function.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.protect_retention_legacy_source_mutation()
returns trigger
language plpgsql
set search_path = public
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

create or replace function public.protect_retention_legacy_allocation_mutation()
returns trigger
language plpgsql
set search_path = public
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

commit;
