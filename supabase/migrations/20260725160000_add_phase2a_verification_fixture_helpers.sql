begin;

-- Temporary service-only helpers for the approved remote concurrency proof.
-- Both functions reject any organization not carrying the exact synthetic
-- verification prefix and are removed after the verification run.

create or replace function public.prepare_phase2a_number_boundary_fixture(
  p_organization_id uuid,
  p_provider text,
  p_tenant_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id
      and o.name like '__phase2a_verification__%'
  ) or p_provider <> 'xero'
    or p_tenant_id not like 'phase2a-verify-%' then
    raise exception 'Number boundary fixture is restricted to synthetic Phase 2A verification data.';
  end if;
  insert into public.organization_accounting_number_counters(
    organization_id, provider, tenant_id, document_class, last_sequence
  ) values (
    p_organization_id, p_provider, p_tenant_id, 'sales_invoice', 99999999
  );
  return true;
end;
$$;

create or replace function public.cleanup_phase2a_verification_fixture(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_name text;
  deleted_documents bigint;
  deleted_revisions bigint;
begin
  select o.name into organization_name
  from public.organizations o
  where o.id = p_organization_id for update;
  if organization_name is null
    or organization_name not like '__phase2a_verification__%' then
    raise exception 'Cleanup is restricted to synthetic Phase 2A verification organizations.';
  end if;
  if exists (
    select 1 from public.organization_accounting_sync_jobs j
    where j.organization_id = p_organization_id
  ) then
    raise exception 'Verification cleanup refuses organizations with production accounting jobs.';
  end if;

  perform set_config('session_replication_role', 'replica', true);
  delete from public.organization_accounting_projections
    where organization_id = p_organization_id;
  delete from public.organization_accounting_remote_observations
    where organization_id = p_organization_id;
  delete from public.organization_accounting_events
    where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_attachments
    where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_lines
    where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_attempts
    where organization_id = p_organization_id;
  delete from public.organization_accounting_legacy_classifications
    where organization_id = p_organization_id;
  delete from public.organization_accounting_document_revisions
    where organization_id = p_organization_id;
  get diagnostics deleted_revisions = row_count;
  delete from public.organization_accounting_number_reservations
    where organization_id = p_organization_id;
  delete from public.organization_accounting_number_counters
    where organization_id = p_organization_id;
  delete from public.organization_accounting_documents
    where organization_id = p_organization_id;
  get diagnostics deleted_documents = row_count;
  perform set_config('session_replication_role', 'origin', true);
  delete from public.retention_claim_payment_events
    where organization_id = p_organization_id;
  delete from public.retention_claim_payment_attributions
    where organization_id = p_organization_id;
  delete from public.retention_claim_payment_reconciliations
    where organization_id = p_organization_id;
  delete from public.retention_claim_accounting_events
    where organization_id = p_organization_id;
  delete from public.retention_claim_accounting_lines
    where organization_id = p_organization_id;
  delete from public.retention_claim_accounting_snapshots
    where organization_id = p_organization_id;
  delete from public.retention_claim_allocations
    where organization_id = p_organization_id;
  delete from public.retention_claims
    where organization_id = p_organization_id;
  delete from public.project_claims
    where organization_id = p_organization_id;
  delete from public.organization_xero_connections
    where organization_id = p_organization_id;
  delete from public.organization_projects
    where organization_id = p_organization_id;
  delete from public.organization_members
    where organization_id = p_organization_id;
  delete from public.organizations where id = p_organization_id;

  return jsonb_build_object(
    'organizationId', p_organization_id,
    'organizationName', organization_name,
    'deletedDocuments', deleted_documents,
    'deletedRevisions', deleted_revisions,
    'cleaned', true
  );
end;
$$;

revoke all on function
  public.prepare_phase2a_number_boundary_fixture(uuid,text,text),
  public.cleanup_phase2a_verification_fixture(uuid)
from public, anon, authenticated;
grant execute on function
  public.prepare_phase2a_number_boundary_fixture(uuid,text,text),
  public.cleanup_phase2a_verification_fixture(uuid)
to service_role;

commit;
