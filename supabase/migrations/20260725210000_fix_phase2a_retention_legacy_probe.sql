begin;

alter function public.probe_retention_ownership_phase2a(uuid,uuid)
  rename to probe_retention_ownership_phase2a_pre_legacy_fixture_fix;

create or replace function public.protect_retention_legacy_source_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  case_status text;
  verification_case boolean := false;
begin
  if coalesce(current_setting('app.retention_phase6_internal_write',true),'')<>'true' then
    raise exception 'Legacy release sources may only be changed by controlled services.'
      using errcode='55000';
  end if;
  select c.status,
    (
      coalesce(
        current_setting('app.accounting_phase2a_retention_probe', true), ''
      ) = 'true'
      and o.name like '__phase2a_verification__%'
    )
  into case_status, verification_case
  from public.retention_legacy_reconciliation_cases c
  join public.organizations o on o.id = c.organization_id
  where c.id=case when tg_op='DELETE' then old.reconciliation_case_id
    else new.reconciliation_case_id end;
  if case_status not in ('draft','rejected','in_review')
    and not (case_status = 'approved' and verification_case) then
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
declare
  case_status text;
  verification_case boolean := false;
begin
  if coalesce(current_setting('app.retention_phase6_internal_write',true),'')<>'true' then
    raise exception 'Legacy release allocations may only be changed by controlled services.'
      using errcode='55000';
  end if;
  select c.status,
    (
      coalesce(
        current_setting('app.accounting_phase2a_retention_probe', true), ''
      ) = 'true'
      and o.name like '__phase2a_verification__%'
    )
  into case_status, verification_case
  from public.retention_legacy_reconciliation_cases c
  join public.organizations o on o.id = c.organization_id
  where c.id=case when tg_op='DELETE' then old.reconciliation_case_id
    else new.reconciliation_case_id end;
  if case_status not in ('draft','rejected','in_review')
    and not (case_status = 'approved' and verification_case) then
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

create or replace function public.probe_retention_ownership_phase2a(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id
      and o.name like '__phase2a_verification__%'
  ) then
    raise exception 'Retention probe accepts only synthetic Phase 2A fixtures.';
  end if;
  perform set_config(
    'app.accounting_phase2a_retention_probe', 'true', true
  );
  return public.probe_retention_ownership_phase2a_pre_legacy_fixture_fix(
    p_organization_id, p_actor_user_id
  );
end;
$$;

revoke all on function
  public.probe_retention_ownership_phase2a_pre_legacy_fixture_fix(uuid,uuid),
  public.probe_retention_ownership_phase2a(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.probe_retention_ownership_phase2a(uuid,uuid)
to service_role;

commit;
