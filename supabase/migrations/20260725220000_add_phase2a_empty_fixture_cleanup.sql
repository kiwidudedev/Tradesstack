begin;

create or replace function public.cleanup_empty_phase2a_verification_organization(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_name text;
begin
  select o.name into organization_name
  from public.organizations o where o.id = p_organization_id for update;
  if organization_name is null then
    return jsonb_build_object('cleaned', true, 'alreadyAbsent', true);
  end if;
  if organization_name not like '__phase2a_verification__%' then
    raise exception 'Cleanup is restricted to synthetic Phase 2A verification organizations.';
  end if;
  if exists (
    select 1 from public.organization_accounting_documents
    where organization_id = p_organization_id
  ) or exists (
    select 1 from public.organization_accounting_sync_jobs
    where organization_id = p_organization_id
  ) or exists (
    select 1 from public.project_claims
    where organization_id = p_organization_id
  ) or exists (
    select 1 from public.retention_claims
    where organization_id = p_organization_id
  ) then
    return jsonb_build_object('cleaned', false, 'notEmpty', true);
  end if;
  delete from public.organization_members
  where organization_id = p_organization_id;
  delete from public.organization_projects
  where organization_id = p_organization_id;
  delete from public.organization_xero_connections
  where organization_id = p_organization_id;
  delete from public.organizations where id = p_organization_id;
  return jsonb_build_object(
    'cleaned', true,
    'organizationId', p_organization_id,
    'organizationName', organization_name,
    'emptyFixture', true
  );
end;
$$;

revoke all on function
  public.cleanup_empty_phase2a_verification_organization(uuid)
from public, anon, authenticated;
grant execute on function
  public.cleanup_empty_phase2a_verification_organization(uuid)
to service_role;

commit;
