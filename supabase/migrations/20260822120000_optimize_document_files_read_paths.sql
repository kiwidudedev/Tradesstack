begin;

-- Return only metadata needed to render the Files page. Upload quota remains
-- enforced by the upload transaction RPC and full usage remains available to
-- dedicated quota/monitoring surfaces.
create or replace function public.get_document_files_page_metadata(
  p_workspace_id uuid
)
returns table (
  can_view boolean,
  can_write boolean,
  can_delete boolean,
  can_purge boolean,
  cleanup_attention_required boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.document_workspaces%rowtype;
  monitor_allowed boolean;
begin
  workspace_row := public.assert_document_workspace_permission(
    p_workspace_id,
    'files.view'
  );
  monitor_allowed := public.has_org_permission(
    workspace_row.organization_id,
    'files.monitor'
  );

  return query select
    true,
    public.has_org_permission(workspace_row.organization_id, 'files.write'),
    public.has_org_permission(workspace_row.organization_id, 'files.delete'),
    public.has_org_permission(workspace_row.organization_id, 'files.purge'),
    monitor_allowed and (
      exists (
        select 1
        from public.document_storage_cleanup_jobs job
        where job.organization_id = workspace_row.organization_id
          and job.processing_status = 'dead_lettered'
      )
      or exists (
        select 1
        from public.document_storage_reconciliation_findings finding
        where finding.organization_id = workspace_row.organization_id
          and finding.finding_status = 'open'
      )
    );
end;
$$;

revoke all on function public.get_document_files_page_metadata(uuid)
from public, anon;
grant execute on function public.get_document_files_page_metadata(uuid)
to authenticated;

-- Preserve the existing IP, user and concurrency rules while acquiring them
-- in one database round trip. The function intentionally retains existing
-- partial-consumption semantics when a later check rejects the request.
create or replace function public.acquire_document_download_guard(
  p_ip_subject_key text
)
returns table (
  allowed boolean,
  rejected_by text,
  ip_limit_ms double precision,
  user_limit_ms double precision,
  concurrency_ms double precision
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id uuid := auth.uid();
  stage_started timestamptz;
  ip_allowed boolean;
  user_allowed boolean;
  concurrency_allowed boolean;
  user_subject_key text;
  active_subject_key text;
begin
  if actor_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  user_subject_key := 'user:document-download:' || actor_user_id::text;
  active_subject_key := 'active:document-download:' || actor_user_id::text;

  stage_started := clock_timestamp();
  ip_allowed := public.enforce_shared_rate_limit(
    'document-download', p_ip_subject_key, 240, 60
  );
  ip_limit_ms := extract(epoch from clock_timestamp() - stage_started) * 1000;
  if ip_allowed is not true then
    return query select false, 'ip', ip_limit_ms, 0::double precision, 0::double precision;
    return;
  end if;

  stage_started := clock_timestamp();
  user_allowed := public.enforce_shared_rate_limit(
    'document-download', user_subject_key, 120, 60
  );
  user_limit_ms := extract(epoch from clock_timestamp() - stage_started) * 1000;
  if user_allowed is not true then
    return query select false, 'user', ip_limit_ms, user_limit_ms, 0::double precision;
    return;
  end if;

  stage_started := clock_timestamp();
  concurrency_allowed := public.acquire_shared_concurrency_slot(
    'document-download', active_subject_key, 8
  );
  concurrency_ms := extract(epoch from clock_timestamp() - stage_started) * 1000;
  return query select
    concurrency_allowed is true,
    case when concurrency_allowed is true then null::text else 'concurrency' end,
    ip_limit_ms,
    user_limit_ms,
    concurrency_ms;
end;
$$;

revoke all on function public.acquire_document_download_guard(text)
from public, anon;
grant execute on function public.acquire_document_download_guard(text)
to authenticated;

commit;
