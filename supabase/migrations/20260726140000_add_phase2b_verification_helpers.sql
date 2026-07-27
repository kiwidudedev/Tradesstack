begin;

create or replace function public.create_phase2b_verification_fixture(p_stamp text)
returns jsonb language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_user uuid := gen_random_uuid();
  v_org uuid;
  v_project uuid;
  v_claim uuid;
  v_connection uuid;
  v_updated timestamptz;
begin
  if p_stamp !~ '^[a-z0-9-]{8,80}$' then
    raise exception 'Invalid synthetic Phase 2B verification stamp.';
  end if;
  insert into auth.users(
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user,
    'authenticated', 'authenticated',
    'phase2b-' || p_stamp || '@example.invalid',
    crypt('Phase2B-' || p_stamp || '-Synthetic!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Phase 2B verification',
      'organization_name', '__phase2b_verification__' || p_stamp),
    now(), now(), '', '', '', '', ''
  );
  select id into v_org from public.organizations where created_by = v_user;
  insert into public.organization_projects(
    organization_id, created_by, name, slug
  ) values (
    v_org, v_user, 'Phase 2B Verification Project', 'phase2b-' || p_stamp
  ) returning id into v_project;
  insert into public.project_claims(
    organization_id, project_id, created_by, claim_number, claim_title,
    status, claim_date, due_date, claim_amount
  ) values (
    v_org, v_project, v_user, 'PC-' || p_stamp,
    'Synthetic Phase 2B Claim', 'Submitted', current_date,
    current_date + 20, 100
  ) returning id, updated_at into v_claim, v_updated;
  insert into public.organization_xero_connections(
    organization_id, status, tenant_id, tenant_name, tenant_type,
    tenant_connection_id, connected_by_user_id
  ) values (
    v_org, 'connected', 'phase2b-tenant-' || p_stamp,
    'Synthetic Phase 2B Tenant', 'ORGANISATION',
    'phase2b-connection-' || p_stamp, v_user
  ) returning id into v_connection;
  insert into public.organization_accounting_phase2b_settings(
    organization_id, initial_payment_claim_push_enabled,
    enabled_by, enabled_at
  ) values (v_org, true, v_user, now());
  return jsonb_build_object(
    'userId', v_user, 'organizationId', v_org, 'projectId', v_project,
    'claimId', v_claim, 'connectionId', v_connection,
    'tenantId', 'phase2b-tenant-' || p_stamp,
    'sourceOptimisticRevision', v_updated::text
  );
end;
$$;

create or replace function public.inspect_phase2b_verification_fixture(
  p_organization_id uuid
)
returns jsonb language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'documents', (select count(*) from public.organization_accounting_documents where organization_id = p_organization_id),
    'reservations', (select count(*) from public.organization_accounting_number_reservations where organization_id = p_organization_id),
    'revisions', (select count(*) from public.organization_accounting_document_revisions where organization_id = p_organization_id),
    'lines', (select count(*) from public.organization_accounting_revision_lines where organization_id = p_organization_id),
    'attachments', (select count(*) from public.organization_accounting_revision_attachments where organization_id = p_organization_id),
    'blobs', (select count(*) from public.organization_accounting_revision_blobs where organization_id = p_organization_id),
    'attempts', (select count(*) from public.organization_accounting_revision_attempts where organization_id = p_organization_id),
    'events', (select count(*) from public.organization_accounting_events where organization_id = p_organization_id),
    'jobs', (select count(*) from public.organization_accounting_sync_jobs where organization_id = p_organization_id),
    'invoiceNumbers', (
      select coalesce(jsonb_agg(formatted_number order by sequence_number), '[]'::jsonb)
      from public.organization_accounting_number_reservations
      where organization_id = p_organization_id
    )
  );
$$;

create or replace function public.cleanup_phase2b_verification_fixture(
  p_organization_id uuid,
  p_user_id uuid
)
returns boolean language plpgsql security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and created_by = p_user_id
      and name like '__phase2b_verification__%'
  ) then
    raise exception 'Cleanup is restricted to synthetic Phase 2B fixtures.';
  end if;
  perform set_config('session_replication_role', 'replica', true);
  delete from public.organization_accounting_projections where organization_id = p_organization_id;
  delete from public.organization_accounting_remote_observations where organization_id = p_organization_id;
  delete from public.organization_accounting_events where organization_id = p_organization_id;
  delete from public.organization_accounting_sync_jobs where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_blobs where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_attempts where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_attachments where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_lines where organization_id = p_organization_id;
  delete from public.organization_accounting_document_revisions where organization_id = p_organization_id;
  delete from public.organization_accounting_number_reservations where organization_id = p_organization_id;
  delete from public.organization_accounting_number_counters where organization_id = p_organization_id;
  delete from public.organization_accounting_documents where organization_id = p_organization_id;
  perform set_config('session_replication_role', 'origin', true);
  delete from public.organization_accounting_phase2b_settings where organization_id = p_organization_id;
  delete from public.project_claims where organization_id = p_organization_id;
  delete from public.organization_xero_connections where organization_id = p_organization_id;
  delete from public.organization_projects where organization_id = p_organization_id;
  delete from public.organization_members where organization_id = p_organization_id;
  delete from public.organizations where id = p_organization_id;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke all on function
  public.create_phase2b_verification_fixture(text),
  public.inspect_phase2b_verification_fixture(uuid),
  public.cleanup_phase2b_verification_fixture(uuid,uuid)
from public, anon, authenticated;
grant execute on function
  public.create_phase2b_verification_fixture(text),
  public.inspect_phase2b_verification_fixture(uuid),
  public.cleanup_phase2b_verification_fixture(uuid,uuid)
to service_role;

commit;
