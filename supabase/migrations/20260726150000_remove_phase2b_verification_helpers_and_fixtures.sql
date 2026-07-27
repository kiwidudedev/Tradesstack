begin;

alter table public.organization_accounting_revision_blobs disable trigger user;
alter table public.organization_accounting_revision_attempts disable trigger user;
alter table public.organization_accounting_revision_attachments disable trigger user;
alter table public.organization_accounting_revision_lines disable trigger user;
alter table public.organization_accounting_document_revisions disable trigger user;
alter table public.organization_accounting_events disable trigger user;
alter table public.organization_accounting_remote_observations disable trigger user;
alter table public.organization_accounting_number_reservations disable trigger user;
alter table public.organization_accounting_documents disable trigger user;

do $$
declare
  v_org uuid;
  v_user uuid;
begin
  for v_org, v_user in
    select id, created_by from public.organizations
    where name like '__phase2b_verification__%'
  loop
    delete from public.organization_accounting_projections where organization_id = v_org;
    delete from public.organization_accounting_remote_observations where organization_id = v_org;
    delete from public.organization_accounting_events where organization_id = v_org;
    delete from public.organization_accounting_sync_jobs where organization_id = v_org;
    delete from public.organization_accounting_revision_blobs where organization_id = v_org;
    delete from public.organization_accounting_revision_attempts where organization_id = v_org;
    delete from public.organization_accounting_revision_attachments where organization_id = v_org;
    delete from public.organization_accounting_revision_lines where organization_id = v_org;
    delete from public.organization_accounting_document_revisions where organization_id = v_org;
    delete from public.organization_accounting_number_reservations where organization_id = v_org;
    delete from public.organization_accounting_number_counters where organization_id = v_org;
    delete from public.organization_accounting_documents where organization_id = v_org;
    delete from public.organization_accounting_phase2b_settings where organization_id = v_org;
    delete from public.project_claims where organization_id = v_org;
    delete from public.organization_xero_connections where organization_id = v_org;
    delete from public.organization_projects where organization_id = v_org;
    delete from public.organization_members where organization_id = v_org;
    delete from public.organizations where id = v_org;
    delete from auth.identities where user_id = v_user;
    delete from auth.users where id = v_user;
  end loop;
end;
$$;

alter table public.organization_accounting_revision_blobs enable trigger user;
alter table public.organization_accounting_revision_attempts enable trigger user;
alter table public.organization_accounting_revision_attachments enable trigger user;
alter table public.organization_accounting_revision_lines enable trigger user;
alter table public.organization_accounting_document_revisions enable trigger user;
alter table public.organization_accounting_events enable trigger user;
alter table public.organization_accounting_remote_observations enable trigger user;
alter table public.organization_accounting_number_reservations enable trigger user;
alter table public.organization_accounting_documents enable trigger user;

drop function if exists public.create_phase2b_verification_fixture(text);
drop function if exists public.inspect_phase2b_verification_fixture(uuid);
drop function if exists public.cleanup_phase2b_verification_fixture(uuid,uuid);

commit;
