begin;

-- Phase 5 completes the document lifecycle without changing the immutable
-- version, opaque-key, TUS, or workspace ownership architecture.

insert into public.app_permissions (permission_key, description)
values ('files.monitor', 'View organization document storage operations and diagnostics')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'files.monitor', true),
  ('admin', 'files.monitor', true),
  ('qs', 'files.monitor', false),
  ('project_manager', 'files.monitor', false),
  ('worker', 'files.monitor', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

create table public.organization_document_storage_usage (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  quota_bytes bigint not null default 107374182400,
  active_bytes bigint not null default 0,
  deleted_bytes bigint not null default 0,
  pending_bytes bigint not null default 0,
  file_count bigint not null default 0,
  folder_count bigint not null default 0,
  current_version_count bigint not null default 0,
  historical_version_count bigint not null default 0,
  version_count bigint not null default 0,
  reconciled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_document_storage_usage_quota_check
    check (quota_bytes >= 0),
  constraint organization_document_storage_usage_counters_check
    check (
      active_bytes >= 0
      and deleted_bytes >= 0
      and pending_bytes >= 0
      and file_count >= 0
      and folder_count >= 0
      and current_version_count >= 0
      and historical_version_count >= 0
      and version_count >= 0
      and historical_version_count = version_count - current_version_count
    )
);

create trigger set_organization_document_storage_usage_updated_at
before update on public.organization_document_storage_usage
for each row execute function public.set_updated_at();

create table public.document_storage_cleanup_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workspace_id uuid not null,
  deletion_batch_id uuid not null,
  root_node_id uuid not null,
  root_display_name text not null,
  requested_by uuid not null references auth.users (id) on delete restrict,
  processing_status text not null default 'pending',
  object_count bigint not null default 0,
  byte_count bigint not null default 0,
  requested_at timestamptz not null default now(),
  completed_at timestamptz null,
  dead_lettered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_storage_cleanup_batches_workspace_fkey
    foreign key (organization_id, workspace_id)
    references public.document_workspaces (organization_id, id)
    on delete cascade,
  constraint document_storage_cleanup_batches_deletion_batch_unique
    unique (workspace_id, deletion_batch_id),
  constraint document_storage_cleanup_batches_root_unique
    unique (workspace_id, root_node_id),
  constraint document_storage_cleanup_batches_status_check
    check (processing_status in ('pending', 'completed', 'dead_lettered')),
  constraint document_storage_cleanup_batches_counts_check
    check (object_count >= 0 and byte_count >= 0),
  constraint document_storage_cleanup_batches_timestamps_check
    check (
      (processing_status <> 'completed' or completed_at is not null)
      and
      (processing_status <> 'dead_lettered' or dead_lettered_at is not null)
    )
);

create index document_storage_cleanup_batches_status_idx
  on public.document_storage_cleanup_batches (
    processing_status,
    requested_at,
    id
  );

create trigger set_document_storage_cleanup_batches_updated_at
before update on public.document_storage_cleanup_batches
for each row execute function public.set_updated_at();

create table public.document_storage_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations (id) on delete cascade,
  workspace_id uuid null references public.document_workspaces (id) on delete cascade,
  finding_fingerprint text not null unique,
  discrepancy_type text not null,
  storage_bucket text null,
  storage_key text null,
  version_id uuid null,
  expected_byte_size bigint null,
  actual_byte_size bigint null,
  finding_status text not null default 'open',
  occurrence_count integer not null default 1,
  details jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_storage_reconciliation_findings_type_check
    check (
      discrepancy_type in (
        'database_without_object',
        'object_without_record',
        'wrong_bucket',
        'wrong_key',
        'wrong_size',
        'wrong_state'
      )
    ),
  constraint document_storage_reconciliation_findings_status_check
    check (finding_status in ('open', 'acknowledged', 'resolved')),
  constraint document_storage_reconciliation_findings_occurrence_check
    check (occurrence_count >= 1),
  constraint document_storage_reconciliation_findings_size_check
    check (
      (expected_byte_size is null or expected_byte_size >= 0)
      and
      (actual_byte_size is null or actual_byte_size >= 0)
    ),
  constraint document_storage_reconciliation_findings_details_check
    check (jsonb_typeof(details) = 'object')
);

create index document_storage_reconciliation_findings_open_idx
  on public.document_storage_reconciliation_findings (
    finding_status,
    discrepancy_type,
    last_detected_at desc,
    id
  )
  where finding_status <> 'resolved';

create index document_storage_reconciliation_findings_org_idx
  on public.document_storage_reconciliation_findings (
    organization_id,
    finding_status,
    last_detected_at desc
  )
  where organization_id is not null;

create index document_storage_reconciliation_findings_version_idx
  on public.document_storage_reconciliation_findings (
    version_id,
    discrepancy_type,
    finding_status
  )
  where version_id is not null;

create trigger set_document_storage_reconciliation_findings_updated_at
before update on public.document_storage_reconciliation_findings
for each row execute function public.set_updated_at();

alter table public.document_storage_cleanup_jobs
  add column cleanup_batch_id uuid null,
  add column storage_bucket text not null default 'organization-documents',
  add column byte_size bigint not null default 0;

alter table public.document_storage_cleanup_jobs
  add constraint document_storage_cleanup_jobs_batch_fkey
    foreign key (cleanup_batch_id)
    references public.document_storage_cleanup_batches (id)
    on delete restrict,
  add constraint document_storage_cleanup_jobs_bucket_check
    check (char_length(btrim(storage_bucket)) between 1 and 100),
  add constraint document_storage_cleanup_jobs_byte_size_check
    check (byte_size >= 0);

alter table public.document_storage_cleanup_jobs
  drop constraint document_storage_cleanup_jobs_version_fkey;

alter table public.document_storage_cleanup_jobs
  add constraint document_storage_cleanup_jobs_version_fkey
    foreign key (version_id)
    references public.document_versions (id)
    on delete set null;

create unique index document_storage_cleanup_jobs_active_object_uidx
  on public.document_storage_cleanup_jobs (storage_bucket, storage_key)
  where processing_status <> 'completed';

create index document_storage_cleanup_jobs_batch_idx
  on public.document_storage_cleanup_jobs (
    cleanup_batch_id,
    processing_status,
    created_at,
    id
  )
  where cleanup_batch_id is not null;

create index document_versions_storage_reconciliation_idx
  on public.document_versions (upload_state, created_at, id)
  include (
    organization_id,
    workspace_id,
    node_id,
    storage_key,
    storage_object_id,
    byte_size
  )
  where upload_state in (
    'active',
    'failed',
    'abandoned',
    'purge_pending',
    'purged'
  );

create index document_nodes_deleted_batch_root_idx
  on public.document_nodes (
    workspace_id,
    deletion_batch_id,
    parent_node_id,
    id
  )
  where deleted_at is not null and deletion_batch_id is not null;

-- Audit rows retain immutable opaque node/version identifiers after metadata
-- purge. Insert-time scope validation replaces the restrictive foreign keys so
-- purge never mutates the append-only event history.
alter table public.document_activity_events
  drop constraint document_activity_events_node_fkey,
  drop constraint document_activity_events_version_fkey;

create or replace function public.validate_document_activity_event_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entity_link_id is not null and not exists (
    select 1
    from public.document_workspace_entities entity_link
    where entity_link.id = new.entity_link_id
      and entity_link.organization_id = new.organization_id
      and entity_link.workspace_id = new.workspace_id
  ) then
    raise exception 'Document activity entity link is outside the event workspace.'
      using errcode = '23503';
  end if;

  if new.node_id is not null and not exists (
    select 1
    from public.document_nodes node
    where node.id = new.node_id
      and node.organization_id = new.organization_id
      and node.workspace_id = new.workspace_id
  ) then
    raise exception 'Document activity node is outside the event workspace.'
      using errcode = '23503';
  end if;

  if new.version_id is not null and not exists (
    select 1
    from public.document_versions version
    where version.id = new.version_id
      and version.organization_id = new.organization_id
      and version.workspace_id = new.workspace_id
  ) then
    raise exception 'Document activity version is outside the event workspace.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

alter table public.organization_document_storage_usage enable row level security;
alter table public.organization_document_storage_usage force row level security;
alter table public.document_storage_cleanup_batches enable row level security;
alter table public.document_storage_cleanup_batches force row level security;
alter table public.document_storage_reconciliation_findings enable row level security;
alter table public.document_storage_reconciliation_findings force row level security;

revoke all on public.organization_document_storage_usage
from public, anon, authenticated;
revoke all on public.document_storage_cleanup_batches
from public, anon, authenticated;
revoke all on public.document_storage_reconciliation_findings
from public, anon, authenticated;

grant select on public.organization_document_storage_usage to authenticated;
grant select, insert, update, delete
on public.organization_document_storage_usage to service_role;
grant select, insert, update, delete
on public.document_storage_cleanup_batches to service_role;
grant select, insert, update, delete
on public.document_storage_reconciliation_findings to service_role;

create policy "Authorized members can view document storage usage"
on public.organization_document_storage_usage
for select
to authenticated
using (public.has_org_permission(organization_id, 'files.view'));

create or replace function public.ensure_document_storage_usage_row(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_document_storage_usage (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;
end;
$$;

revoke all on function public.ensure_document_storage_usage_row(uuid)
from public, anon, authenticated;

create or replace function public.adjust_document_storage_usage(
  p_organization_id uuid,
  p_active_bytes bigint default 0,
  p_deleted_bytes bigint default 0,
  p_pending_bytes bigint default 0,
  p_file_count bigint default 0,
  p_folder_count bigint default 0,
  p_current_version_count bigint default 0,
  p_version_count bigint default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_document_storage_usage_row(p_organization_id);

  update public.organization_document_storage_usage usage
  set
    active_bytes = greatest(0, usage.active_bytes + p_active_bytes),
    deleted_bytes = greatest(0, usage.deleted_bytes + p_deleted_bytes),
    pending_bytes = greatest(0, usage.pending_bytes + p_pending_bytes),
    file_count = greatest(0, usage.file_count + p_file_count),
    folder_count = greatest(0, usage.folder_count + p_folder_count),
    current_version_count = greatest(
      0,
      usage.current_version_count + p_current_version_count
    ),
    version_count = greatest(0, usage.version_count + p_version_count),
    historical_version_count = greatest(
      0,
      (usage.version_count + p_version_count)
      - (usage.current_version_count + p_current_version_count)
    )
  where usage.organization_id = p_organization_id;
end;
$$;

revoke all on function public.adjust_document_storage_usage(
  uuid, bigint, bigint, bigint, bigint, bigint, bigint, bigint
) from public, anon, authenticated;

create or replace function public.document_version_usage_bucket(
  p_upload_state text,
  p_byte_size bigint,
  p_node_deleted_at timestamptz
)
returns table (
  active_bytes bigint,
  deleted_bytes bigint,
  pending_bytes bigint
)
language sql
immutable
set search_path = public
as $$
  select
    case
      when p_upload_state in ('active', 'purge_pending')
        and p_node_deleted_at is null
      then coalesce(p_byte_size, 0)
      else 0
    end,
    case
      when p_upload_state in ('active', 'purge_pending')
        and p_node_deleted_at is not null
      then coalesce(p_byte_size, 0)
      else 0
    end,
    case
      when p_upload_state in ('pending', 'uploaded')
      then coalesce(p_byte_size, 0)
      else 0
    end;
$$;

revoke all on function public.document_version_usage_bucket(text, bigint, timestamptz)
from public, anon, authenticated;

create or replace function public.track_document_version_storage_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_deleted_at timestamptz;
  new_deleted_at timestamptz;
  old_usage record;
  new_usage record;
  organization_id uuid := coalesce(new.organization_id, old.organization_id);
begin
  if tg_op <> 'INSERT' then
    select node.deleted_at
    into old_deleted_at
    from public.document_nodes node
    where node.id = old.node_id;

    select *
    into old_usage
    from public.document_version_usage_bucket(
      old.upload_state,
      old.byte_size,
      old_deleted_at
    );
  else
    select 0::bigint as active_bytes, 0::bigint as deleted_bytes,
      0::bigint as pending_bytes
    into old_usage;
  end if;

  if tg_op <> 'DELETE' then
    select node.deleted_at
    into new_deleted_at
    from public.document_nodes node
    where node.id = new.node_id;

    select *
    into new_usage
    from public.document_version_usage_bucket(
      new.upload_state,
      new.byte_size,
      new_deleted_at
    );
  else
    select 0::bigint as active_bytes, 0::bigint as deleted_bytes,
      0::bigint as pending_bytes
    into new_usage;
  end if;

  perform public.adjust_document_storage_usage(
    organization_id,
    new_usage.active_bytes - old_usage.active_bytes,
    new_usage.deleted_bytes - old_usage.deleted_bytes,
    new_usage.pending_bytes - old_usage.pending_bytes,
    0,
    0,
    0,
    case when tg_op = 'INSERT' then 1 when tg_op = 'DELETE' then -1 else 0 end
  );

  return coalesce(new, old);
end;
$$;

create trigger track_document_version_storage_usage
after insert or update or delete on public.document_versions
for each row execute function public.track_document_version_storage_usage();

create or replace function public.track_document_node_storage_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_visible boolean := false;
  new_visible boolean := false;
  old_current boolean := false;
  new_current boolean := false;
  retained_bytes bigint := 0;
  active_delta bigint := 0;
  deleted_delta bigint := 0;
  organization_id uuid := coalesce(new.organization_id, old.organization_id);
begin
  if tg_op <> 'INSERT' then
    old_visible := old.deleted_at is null
      and old.lifecycle_state = 'active';
    old_current := old_visible
      and old.kind = 'file'
      and old.current_version_id is not null;
  end if;

  if tg_op <> 'DELETE' then
    new_visible := new.deleted_at is null
      and new.lifecycle_state = 'active';
    new_current := new_visible
      and new.kind = 'file'
      and new.current_version_id is not null;
  end if;

  if tg_op = 'UPDATE'
    and old.kind = 'file'
    and old.deleted_at is distinct from new.deleted_at
  then
    select coalesce(sum(version.byte_size), 0)
    into retained_bytes
    from public.document_versions version
    where version.node_id = new.id
      and version.upload_state in ('active', 'purge_pending');

    if old.deleted_at is null and new.deleted_at is not null then
      active_delta := -retained_bytes;
      deleted_delta := retained_bytes;
    elsif old.deleted_at is not null and new.deleted_at is null then
      active_delta := retained_bytes;
      deleted_delta := -retained_bytes;
    end if;
  end if;

  perform public.adjust_document_storage_usage(
    organization_id,
    active_delta,
    deleted_delta,
    0,
    (case when new_visible and coalesce(new.kind, '') = 'file' then 1 else 0 end)
      - (case when old_visible and coalesce(old.kind, '') = 'file' then 1 else 0 end),
    (case when new_visible and coalesce(new.kind, '') = 'folder' then 1 else 0 end)
      - (case when old_visible and coalesce(old.kind, '') = 'folder' then 1 else 0 end),
    (case when new_current then 1 else 0 end)
      - (case when old_current then 1 else 0 end),
    0
  );

  return coalesce(new, old);
end;
$$;

create trigger track_document_node_storage_usage
after insert or update or delete on public.document_nodes
for each row execute function public.track_document_node_storage_usage();

create or replace function public.track_document_purge_job_storage_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_bytes bigint := 0;
  new_bytes bigint := 0;
  organization_id uuid := coalesce(new.organization_id, old.organization_id);
begin
  if tg_op <> 'INSERT'
    and old.job_type = 'version_purge'
    and old.processing_status <> 'completed'
  then
    old_bytes := old.byte_size;
  end if;

  if tg_op <> 'DELETE'
    and new.job_type = 'version_purge'
    and new.processing_status <> 'completed'
  then
    new_bytes := new.byte_size;
  end if;

  if new_bytes <> old_bytes then
    perform public.adjust_document_storage_usage(
      organization_id,
      0,
      new_bytes - old_bytes
    );
  end if;

  return coalesce(new, old);
end;
$$;

create trigger track_document_purge_job_storage_usage
after insert or update or delete on public.document_storage_cleanup_jobs
for each row execute function public.track_document_purge_job_storage_usage();

create or replace function public.enforce_document_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  usage_row public.organization_document_storage_usage%rowtype;
begin
  if new.upload_state not in ('pending', 'uploaded') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'document-storage-quota:' || new.organization_id::text,
      0
    )
  );
  perform public.ensure_document_storage_usage_row(new.organization_id);

  select *
  into usage_row
  from public.organization_document_storage_usage usage
  where usage.organization_id = new.organization_id
  for update;

  if usage_row.active_bytes
      + usage_row.deleted_bytes
      + usage_row.pending_bytes
      + coalesce(new.byte_size, 0)
    > usage_row.quota_bytes
  then
    raise exception 'Document storage quota exceeded.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger enforce_document_storage_quota
before insert on public.document_versions
for each row execute function public.enforce_document_storage_quota();

create or replace function public.reconcile_document_storage_usage(
  p_organization_id uuid
)
returns public.organization_document_storage_usage
language plpgsql
security definer
set search_path = public
as $$
declare
  usage_row public.organization_document_storage_usage%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'document-storage-quota:' || p_organization_id::text,
      0
    )
  );
  perform public.ensure_document_storage_usage_row(p_organization_id);

  update public.organization_document_storage_usage usage
  set
    active_bytes = (
      select coalesce(sum(version.byte_size), 0)
      from public.document_versions version
      join public.document_nodes node on node.id = version.node_id
      where version.organization_id = p_organization_id
        and version.upload_state in ('active', 'purge_pending')
        and node.deleted_at is null
    ),
    deleted_bytes = (
      select coalesce(sum(version.byte_size), 0)
      from public.document_versions version
      join public.document_nodes node on node.id = version.node_id
      where version.organization_id = p_organization_id
        and version.upload_state in ('active', 'purge_pending')
        and node.deleted_at is not null
    ) + (
      select coalesce(sum(job.byte_size), 0)
      from public.document_storage_cleanup_jobs job
      where job.organization_id = p_organization_id
        and job.job_type = 'version_purge'
        and job.processing_status <> 'completed'
    ),
    pending_bytes = (
      select coalesce(sum(version.byte_size), 0)
      from public.document_versions version
      where version.organization_id = p_organization_id
        and version.upload_state in ('pending', 'uploaded')
    ),
    file_count = (
      select count(*)
      from public.document_nodes node
      where node.organization_id = p_organization_id
        and node.kind = 'file'
        and node.lifecycle_state = 'active'
        and node.deleted_at is null
    ),
    folder_count = (
      select count(*)
      from public.document_nodes node
      where node.organization_id = p_organization_id
        and node.kind = 'folder'
        and node.lifecycle_state = 'active'
        and node.deleted_at is null
    ),
    current_version_count = (
      select count(*)
      from public.document_nodes node
      where node.organization_id = p_organization_id
        and node.kind = 'file'
        and node.lifecycle_state = 'active'
        and node.deleted_at is null
        and node.current_version_id is not null
    ),
    version_count = (
      select count(*)
      from public.document_versions version
      where version.organization_id = p_organization_id
    ),
    historical_version_count = greatest(
      0,
      (
        select count(*)
        from public.document_versions version
        where version.organization_id = p_organization_id
      ) - (
        select count(*)
        from public.document_nodes node
        where node.organization_id = p_organization_id
          and node.kind = 'file'
          and node.lifecycle_state = 'active'
          and node.deleted_at is null
          and node.current_version_id is not null
      )
    ),
    reconciled_at = now()
  where usage.organization_id = p_organization_id
  returning * into usage_row;

  return usage_row;
end;
$$;

revoke all on function public.reconcile_document_storage_usage(uuid)
from public, anon, authenticated;
grant execute on function public.reconcile_document_storage_usage(uuid)
to service_role;

create or replace function public.get_document_storage_usage(
  p_workspace_id uuid
)
returns table (
  quota_bytes bigint,
  active_bytes bigint,
  deleted_bytes bigint,
  pending_bytes bigint,
  total_bytes bigint,
  remaining_bytes bigint,
  file_count bigint,
  folder_count bigint,
  current_version_count bigint,
  historical_version_count bigint,
  can_delete boolean,
  can_purge boolean,
  can_monitor boolean,
  cleanup_attention_required boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.document_workspaces%rowtype;
  usage_row public.organization_document_storage_usage%rowtype;
  monitor_allowed boolean;
begin
  workspace_row := public.assert_document_workspace_permission(
    p_workspace_id,
    'files.view'
  );
  perform public.ensure_document_storage_usage_row(workspace_row.organization_id);

  select *
  into usage_row
  from public.organization_document_storage_usage usage
  where usage.organization_id = workspace_row.organization_id;

  monitor_allowed := public.has_org_permission(
    workspace_row.organization_id,
    'files.monitor'
  );

  return query
  select
    usage_row.quota_bytes,
    usage_row.active_bytes,
    usage_row.deleted_bytes,
    usage_row.pending_bytes,
    usage_row.active_bytes + usage_row.deleted_bytes + usage_row.pending_bytes,
    greatest(
      0,
      usage_row.quota_bytes
        - usage_row.active_bytes
        - usage_row.deleted_bytes
        - usage_row.pending_bytes
    ),
    usage_row.file_count,
    usage_row.folder_count,
    usage_row.current_version_count,
    usage_row.historical_version_count,
    public.has_org_permission(workspace_row.organization_id, 'files.delete'),
    public.has_org_permission(workspace_row.organization_id, 'files.purge'),
    monitor_allowed,
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

revoke all on function public.get_document_storage_usage(uuid)
from public, anon;
grant execute on function public.get_document_storage_usage(uuid)
to authenticated;

create or replace function public.list_deleted_document_batches(
  p_workspace_id uuid,
  p_search text default null,
  p_file_type text default 'all',
  p_sort text default 'modified',
  p_direction text default 'desc',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  deletion_batch_id uuid,
  root_node_id uuid,
  kind text,
  display_name text,
  deleted_by_user_id uuid,
  deleted_by_name text,
  deleted_at timestamptz,
  original_parent_node_id uuid,
  original_parent_name text,
  item_count bigint,
  byte_size bigint,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  normalized_type text := lower(btrim(coalesce(p_file_type, 'all')));
  normalized_sort text := lower(btrim(coalesce(p_sort, 'modified')));
  normalized_direction text := lower(btrim(coalesce(p_direction, 'desc')));
begin
  perform public.assert_document_workspace_permission(
    p_workspace_id,
    'files.delete'
  );

  if p_limit < 1 or p_limit > 200 or p_offset < 0 then
    raise exception 'Invalid deleted document page.';
  end if;
  if normalized_type not in (
    'all', 'folders', 'pdf', 'images', 'documents', 'spreadsheets',
    'presentations', 'text', 'other'
  ) then
    raise exception 'Invalid deleted document filter.';
  end if;
  if normalized_sort not in ('name', 'modified', 'owner', 'size')
    or normalized_direction not in ('asc', 'desc')
  then
    raise exception 'Invalid deleted document sort.';
  end if;

  return query
  with roots as (
    select root.*
    from public.document_nodes root
    left join public.document_nodes parent
      on parent.id = root.parent_node_id
      and parent.workspace_id = root.workspace_id
    where root.workspace_id = p_workspace_id
      and root.deleted_at is not null
      and root.deletion_batch_id is not null
      and parent.deletion_batch_id is distinct from root.deletion_batch_id
  ),
  batch_counts as (
    select
      member_node.deletion_batch_id,
      count(*) as item_count
    from public.document_nodes member_node
    where member_node.workspace_id = p_workspace_id
      and member_node.deleted_at is not null
      and member_node.deletion_batch_id is not null
    group by member_node.deletion_batch_id
  ),
  batch_sizes as (
    select
      member_node.deletion_batch_id,
      coalesce(sum(version.byte_size), 0)::bigint as byte_size
    from public.document_nodes member_node
    join public.document_versions version
      on version.node_id = member_node.id
    where member_node.workspace_id = p_workspace_id
      and member_node.deleted_at is not null
      and member_node.deletion_batch_id is not null
      and version.upload_state in ('active', 'purge_pending')
    group by member_node.deletion_batch_id
  ),
  summarized as (
    select
      root.deletion_batch_id,
      root.id as root_node_id,
      root.kind,
      root.display_name,
      root.deleted_by,
      coalesce(nullif(member.display_name, ''), 'Unknown user') as deleted_by_name,
      root.deleted_at,
      root.parent_node_id,
      parent.display_name as original_parent_name,
      batch_counts.item_count,
      coalesce(batch_sizes.byte_size, 0)::bigint as byte_size
    from roots root
    left join public.document_nodes parent
      on parent.id = root.parent_node_id
      and parent.workspace_id = root.workspace_id
    left join public.organization_members member
      on member.organization_id = root.organization_id
      and member.user_id = root.deleted_by
    join batch_counts
      on batch_counts.deletion_batch_id = root.deletion_batch_id
    left join batch_sizes
      on batch_sizes.deletion_batch_id = root.deletion_batch_id
    where (
      normalized_search is null
      or exists (
        select 1
        from public.document_nodes member_node
        where member_node.workspace_id = root.workspace_id
          and member_node.deletion_batch_id = root.deletion_batch_id
          and member_node.normalized_name like '%' || normalized_search || '%'
      )
    )
    and (
      normalized_type = 'all'
      or (normalized_type = 'folders' and root.kind = 'folder')
      or exists (
        select 1
        from public.document_nodes member_node
        join public.document_versions version
          on version.node_id = member_node.id
        where member_node.workspace_id = root.workspace_id
          and member_node.deletion_batch_id = root.deletion_batch_id
          and member_node.kind = 'file'
          and case normalized_type
            when 'pdf' then version.file_extension = 'pdf'
            when 'images' then version.file_extension in ('jpg', 'jpeg', 'png', 'webp')
            when 'documents' then version.file_extension in ('doc', 'docx')
            when 'spreadsheets' then version.file_extension in ('xls', 'xlsx', 'csv')
            when 'presentations' then version.file_extension in ('ppt', 'pptx')
            when 'text' then version.file_extension = 'txt'
            when 'other' then version.file_extension not in (
              'pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx',
              'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt'
            )
            else false
          end
      )
    )
  )
  select
    summarized.deletion_batch_id,
    summarized.root_node_id,
    summarized.kind,
    summarized.display_name,
    summarized.deleted_by,
    summarized.deleted_by_name,
    summarized.deleted_at,
    summarized.parent_node_id,
    summarized.original_parent_name,
    summarized.item_count,
    summarized.byte_size,
    count(*) over()
  from summarized
  order by
    case when normalized_sort = 'name' and normalized_direction = 'asc'
      then lower(summarized.display_name) end asc,
    case when normalized_sort = 'name' and normalized_direction = 'desc'
      then lower(summarized.display_name) end desc,
    case when normalized_sort = 'modified' and normalized_direction = 'asc'
      then summarized.deleted_at end asc,
    case when normalized_sort = 'modified' and normalized_direction = 'desc'
      then summarized.deleted_at end desc,
    case when normalized_sort = 'owner' and normalized_direction = 'asc'
      then lower(summarized.deleted_by_name) end asc,
    case when normalized_sort = 'owner' and normalized_direction = 'desc'
      then lower(summarized.deleted_by_name) end desc,
    case when normalized_sort = 'size' and normalized_direction = 'asc'
      then summarized.byte_size end asc,
    case when normalized_sort = 'size' and normalized_direction = 'desc'
      then summarized.byte_size end desc,
    summarized.root_node_id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_deleted_document_batches(
  uuid, text, text, text, text, integer, integer
) from public, anon;
grant execute on function public.list_deleted_document_batches(
  uuid, text, text, text, text, integer, integer
) to authenticated;

create or replace function public.purge_document_node(
  p_node_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  node_row public.document_nodes%rowtype;
  root_row public.document_nodes%rowtype;
  existing_batch public.document_storage_cleanup_batches%rowtype;
  cleanup_batch public.document_storage_cleanup_batches%rowtype;
  object_count bigint := 0;
  byte_count bigint := 0;
begin
  if actor_user_id is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id;

  if not found then
    select *
    into existing_batch
    from public.document_storage_cleanup_batches batch
    where batch.root_node_id = p_node_id;

    if not found then
      raise exception 'Deleted document not found.'
        using errcode = 'P0002';
    end if;

    perform public.assert_document_workspace_permission(
      existing_batch.workspace_id,
      'files.purge'
    );
    return existing_batch.id;
  end if;

  perform public.assert_document_workspace_permission(
    node_row.workspace_id,
    'files.purge'
  );
  perform pg_advisory_xact_lock(
    hashtextextended('document-workspace:' || node_row.workspace_id::text, 0)
  );

  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id
  for update;

  if node_row.deleted_at is null or node_row.deletion_batch_id is null then
    raise exception 'Only deleted documents can be permanently purged.'
      using errcode = '23514';
  end if;

  select root.*
  into root_row
  from public.document_nodes root
  left join public.document_nodes parent
    on parent.id = root.parent_node_id
    and parent.workspace_id = root.workspace_id
  where root.workspace_id = node_row.workspace_id
    and root.deletion_batch_id = node_row.deletion_batch_id
    and parent.deletion_batch_id is distinct from root.deletion_batch_id
  order by root.id
  limit 1
  for update of root;

  select count(*), coalesce(sum(version.byte_size), 0)
  into object_count, byte_count
  from public.document_versions version
  join public.document_nodes member_node on member_node.id = version.node_id
  where member_node.workspace_id = root_row.workspace_id
    and member_node.deletion_batch_id = root_row.deletion_batch_id
    and version.upload_state <> 'purged';

  insert into public.document_storage_cleanup_batches (
    organization_id,
    workspace_id,
    deletion_batch_id,
    root_node_id,
    root_display_name,
    requested_by,
    object_count,
    byte_count,
    processing_status,
    completed_at
  )
  values (
    root_row.organization_id,
    root_row.workspace_id,
    root_row.deletion_batch_id,
    root_row.id,
    root_row.display_name,
    actor_user_id,
    object_count,
    byte_count,
    case when object_count = 0 then 'completed' else 'pending' end,
    case when object_count = 0 then now() else null end
  )
  on conflict (workspace_id, deletion_batch_id)
  do update set deletion_batch_id = excluded.deletion_batch_id
  returning * into cleanup_batch;

  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    node_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    root_row.organization_id,
    root_row.workspace_id,
    root_row.id,
    actor_user_id,
    'purge_requested',
    jsonb_build_object(
      'cleanupBatchId', cleanup_batch.id,
      'deletionBatchId', root_row.deletion_batch_id,
      'rootNodeId', root_row.id,
      'objectCount', object_count,
      'byteCount', byte_count
    )
  )
  on conflict do nothing;

  -- Reuse any active abandoned-upload job for the same immutable object so
  -- there is never more than one active delete identity per Storage key.
  update public.document_storage_cleanup_jobs job
  set
    cleanup_batch_id = cleanup_batch.id,
    byte_size = greatest(job.byte_size, version.byte_size)
  from public.document_versions version
  join public.document_nodes member_node on member_node.id = version.node_id
  where member_node.workspace_id = root_row.workspace_id
    and member_node.deletion_batch_id = root_row.deletion_batch_id
    and job.storage_bucket = 'organization-documents'
    and job.storage_key = version.storage_key
    and job.processing_status <> 'completed';

  insert into public.document_storage_cleanup_jobs (
    organization_id,
    workspace_id,
    version_id,
    cleanup_batch_id,
    job_type,
    job_identity,
    storage_bucket,
    storage_key,
    byte_size
  )
  select
    version.organization_id,
    version.workspace_id,
    version.id,
    cleanup_batch.id,
    'version_purge',
    'document-version:' || version.id::text || ':version-purge',
    'organization-documents',
    version.storage_key,
    coalesce(version.byte_size, 0)
  from public.document_versions version
  join public.document_nodes member_node on member_node.id = version.node_id
  where member_node.workspace_id = root_row.workspace_id
    and member_node.deletion_batch_id = root_row.deletion_batch_id
    and not exists (
      select 1
      from public.document_storage_cleanup_jobs existing
      where existing.storage_bucket = 'organization-documents'
        and existing.storage_key = version.storage_key
        and existing.processing_status <> 'completed'
    )
  on conflict (job_identity) do nothing;

  update public.document_nodes node
  set current_version_id = null
  where node.workspace_id = root_row.workspace_id
    and node.deletion_batch_id = root_row.deletion_batch_id
    and node.current_version_id is not null;

  -- Delete versions while their deleted node rows still exist so the usage
  -- trigger can classify retained bytes as deleted rather than active.
  delete from public.document_versions version
  using public.document_nodes member_node
  where version.node_id = member_node.id
    and member_node.workspace_id = root_row.workspace_id
    and member_node.deletion_batch_id = root_row.deletion_batch_id;

  delete from public.document_nodes node
  where node.workspace_id = root_row.workspace_id
    and node.deletion_batch_id = root_row.deletion_batch_id;

  if object_count = 0 then
    insert into public.document_activity_events (
      organization_id,
      workspace_id,
      actor_user_id,
      event_type,
      metadata
    )
    values (
      root_row.organization_id,
      root_row.workspace_id,
      actor_user_id,
      'purged',
      jsonb_build_object(
        'cleanupBatchId', cleanup_batch.id,
        'deletionBatchId', root_row.deletion_batch_id,
        'rootNodeId', root_row.id,
        'objectCount', 0
      )
    );
  end if;

  return cleanup_batch.id;
end;
$$;

revoke all on function public.purge_document_node(uuid)
from public, anon;
grant execute on function public.purge_document_node(uuid)
to authenticated;

create or replace function public.claim_document_storage_cleanup_jobs(
  p_limit integer,
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table (
  job_id uuid,
  claim_token uuid,
  organization_id uuid,
  workspace_id uuid,
  cleanup_batch_id uuid,
  job_type text,
  storage_bucket text,
  storage_key text,
  byte_size bigint,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.'
      using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 500
    or p_lease_seconds < 30 or p_lease_seconds > 3600
    or char_length(btrim(coalesce(p_worker_id, ''))) not between 1 and 120
  then
    raise exception 'Invalid cleanup claim request.';
  end if;

  return query
  with candidates as (
    select job.id
    from public.document_storage_cleanup_jobs job
    where (
      job.processing_status in ('pending', 'retry_scheduled')
      and job.available_at <= now()
    ) or (
      job.processing_status = 'claimed'
      and job.claim_expires_at <= now()
    )
    order by job.available_at, job.created_at, job.id
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.document_storage_cleanup_jobs job
    set
      processing_status = 'claimed',
      attempt_count = job.attempt_count + 1,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => p_lease_seconds),
      claimed_by = btrim(p_worker_id),
      claim_token = gen_random_uuid(),
      last_error_code = null,
      last_error_message = null
    where job.id in (select candidate.id from candidates candidate)
    returning job.*
  )
  select
    claimed.id,
    claimed.claim_token,
    claimed.organization_id,
    claimed.workspace_id,
    claimed.cleanup_batch_id,
    claimed.job_type,
    claimed.storage_bucket,
    claimed.storage_key,
    claimed.byte_size,
    claimed.attempt_count,
    claimed.max_attempts
  from claimed
  order by claimed.available_at, claimed.created_at, claimed.id;
end;
$$;

revoke all on function public.claim_document_storage_cleanup_jobs(integer, text, integer)
from public, anon, authenticated;
grant execute on function public.claim_document_storage_cleanup_jobs(integer, text, integer)
to service_role;

create or replace function public.document_cleanup_storage_object_exists(
  p_job_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  job_row public.document_storage_cleanup_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.'
      using errcode = '42501';
  end if;

  select *
  into job_row
  from public.document_storage_cleanup_jobs job
  where job.id = p_job_id
    and job.processing_status = 'claimed'
    and job.claim_token = p_claim_token
    and job.claim_expires_at > now();

  if not found then
    raise exception 'Cleanup lease is not owned.'
      using errcode = '42501';
  end if;

  return exists (
    select 1
    from storage.objects object
    where object.bucket_id = job_row.storage_bucket
      and object.name = job_row.storage_key
  );
end;
$$;

revoke all on function public.document_cleanup_storage_object_exists(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.document_cleanup_storage_object_exists(uuid, uuid)
to service_role;

create or replace function public.complete_document_storage_cleanup_job(
  p_job_id uuid,
  p_claim_token uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.document_storage_cleanup_jobs%rowtype;
  completed_batch public.document_storage_cleanup_batches%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.'
      using errcode = '42501';
  end if;

  select *
  into job_row
  from public.document_storage_cleanup_jobs job
  where job.id = p_job_id
  for update;

  if not found
    or job_row.processing_status <> 'claimed'
    or job_row.claim_token <> p_claim_token
  then
    raise exception 'Cleanup lease is not owned.'
      using errcode = '42501';
  end if;

  if job_row.job_type = 'abandoned_upload'
    and job_row.version_id is not null
  then
    update public.document_versions version
    set upload_state = 'purge_pending'
    where version.id = job_row.version_id
      and version.upload_state in ('failed', 'abandoned');

    update public.document_versions version
    set
      upload_state = 'purged',
      purged_at = now(),
      storage_object_id = null,
      storage_etag = null
    where version.id = job_row.version_id
      and version.upload_state = 'purge_pending';
  end if;

  update public.document_storage_cleanup_jobs job
  set
    processing_status = 'completed',
    completed_at = now(),
    claimed_at = null,
    claim_expires_at = null,
    claimed_by = null,
    claim_token = null,
    last_error_code = null,
    last_error_message = null
  where job.id = job_row.id;

  update public.document_storage_reconciliation_findings finding
  set
    finding_status = 'resolved',
    resolved_at = now()
  where finding.storage_bucket = job_row.storage_bucket
    and finding.storage_key = job_row.storage_key
    and finding.finding_status <> 'resolved'
    and job_row.job_type <> 'orphan_reconciliation';

  if job_row.cleanup_batch_id is not null
    and not exists (
      select 1
      from public.document_storage_cleanup_jobs remaining
      where remaining.cleanup_batch_id = job_row.cleanup_batch_id
        and remaining.processing_status <> 'completed'
    )
  then
    update public.document_storage_cleanup_batches batch
    set
      processing_status = 'completed',
      completed_at = now(),
      dead_lettered_at = null
    where batch.id = job_row.cleanup_batch_id
      and batch.processing_status <> 'completed'
    returning * into completed_batch;

    if completed_batch.id is not null then
      insert into public.document_activity_events (
        organization_id,
        workspace_id,
        actor_user_id,
        event_type,
        metadata
      )
      values (
        completed_batch.organization_id,
        completed_batch.workspace_id,
        completed_batch.requested_by,
        'purged',
        jsonb_build_object(
          'cleanupBatchId', completed_batch.id,
          'deletionBatchId', completed_batch.deletion_batch_id,
          'rootNodeId', completed_batch.root_node_id,
          'objectCount', completed_batch.object_count,
          'byteCount', completed_batch.byte_count
        )
      );
    end if;
  end if;

  return 'completed';
end;
$$;

revoke all on function public.complete_document_storage_cleanup_job(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.complete_document_storage_cleanup_job(uuid, uuid)
to service_role;

create or replace function public.fail_document_storage_cleanup_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.document_storage_cleanup_jobs%rowtype;
  next_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.'
      using errcode = '42501';
  end if;

  select *
  into job_row
  from public.document_storage_cleanup_jobs job
  where job.id = p_job_id
  for update;

  if not found
    or job_row.processing_status <> 'claimed'
    or job_row.claim_token <> p_claim_token
  then
    raise exception 'Cleanup lease is not owned.'
      using errcode = '42501';
  end if;

  next_status := case
    when job_row.attempt_count >= job_row.max_attempts
      then 'dead_lettered'
    else 'retry_scheduled'
  end;

  update public.document_storage_cleanup_jobs job
  set
    processing_status = next_status,
    available_at = case
      when next_status = 'retry_scheduled'
      then now() + least(
        interval '24 hours',
        make_interval(mins => (power(2, least(job_row.attempt_count, 10)))::integer)
      )
      else job.available_at
    end,
    claimed_at = null,
    claim_expires_at = null,
    claimed_by = null,
    claim_token = null,
    last_error_code = left(nullif(btrim(p_error_code), ''), 100),
    last_error_message = left(nullif(btrim(p_error_message), ''), 1000),
    dead_lettered_at = case
      when next_status = 'dead_lettered' then now()
      else null
    end
  where job.id = job_row.id;

  if next_status = 'dead_lettered'
    and job_row.cleanup_batch_id is not null
  then
    update public.document_storage_cleanup_batches batch
    set
      processing_status = 'dead_lettered',
      dead_lettered_at = now()
    where batch.id = job_row.cleanup_batch_id
      and batch.processing_status <> 'completed';
  end if;

  return next_status;
end;
$$;

revoke all on function public.fail_document_storage_cleanup_job(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.fail_document_storage_cleanup_job(
  uuid, uuid, text, text
) to service_role;

create or replace function public.reconcile_document_storage_catalog(
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, extensions
as $$
declare
  record_row record;
  missing_count integer := 0;
  mismatch_count integer := 0;
  orphan_count integer := 0;
  finding_key text;
  parsed_organization_id uuid;
  parsed_workspace_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.'
      using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 5000 then
    raise exception 'Reconciliation limit must be between 1 and 5000.';
  end if;

  for record_row in
    select
      version.organization_id,
      version.workspace_id,
      version.id as version_id,
      version.storage_key,
      version.byte_size,
      object.id as object_id,
      nullif(object.metadata ->> 'size', '')::bigint as actual_size
    from public.document_versions version
    left join storage.objects object
      on object.bucket_id = 'organization-documents'
      and object.name = version.storage_key
    where version.upload_state in ('active', 'purge_pending')
      and object.id is null
    order by exists (
      select 1
      from public.document_storage_reconciliation_findings finding
      where finding.version_id = version.id
        and finding.discrepancy_type = 'database_without_object'
        and finding.finding_status = 'open'
    ), version.created_at, version.id
    limit p_limit
  loop
    finding_key := md5('database_without_object:' || record_row.version_id::text);
    insert into public.document_storage_reconciliation_findings (
      organization_id,
      workspace_id,
      finding_fingerprint,
      discrepancy_type,
      storage_bucket,
      storage_key,
      version_id,
      expected_byte_size,
      details
    )
    values (
      record_row.organization_id,
      record_row.workspace_id,
      finding_key,
      'database_without_object',
      'organization-documents',
      record_row.storage_key,
      record_row.version_id,
      record_row.byte_size,
      jsonb_build_object('action', 'manual_review_required')
    )
    on conflict (finding_fingerprint) do update
    set
      finding_status = 'open',
      occurrence_count =
        public.document_storage_reconciliation_findings.occurrence_count + 1,
      last_detected_at = now(),
      resolved_at = null;
    missing_count := missing_count + 1;
  end loop;

  for record_row in
    select
      version.organization_id,
      version.workspace_id,
      version.id as version_id,
      version.storage_key,
      version.byte_size,
      object.bucket_id,
      object.name,
      nullif(object.metadata ->> 'size', '')::bigint as actual_size
    from public.document_versions version
    join storage.objects object on object.id = version.storage_object_id
    where version.upload_state in ('active', 'purge_pending')
      and (
        object.bucket_id <> 'organization-documents'
        or object.name <> version.storage_key
        or nullif(object.metadata ->> 'size', '')::bigint
          is distinct from version.byte_size
      )
    order by exists (
      select 1
      from public.document_storage_reconciliation_findings finding
      where finding.version_id = version.id
        and finding.discrepancy_type in (
          'wrong_bucket', 'wrong_key', 'wrong_size'
        )
        and finding.finding_status = 'open'
    ), version.created_at, version.id
    limit p_limit
  loop
    if record_row.bucket_id <> 'organization-documents' then
      finding_key := md5('wrong_bucket:' || record_row.version_id::text);
      insert into public.document_storage_reconciliation_findings (
        organization_id, workspace_id, finding_fingerprint,
        discrepancy_type, storage_bucket, storage_key, version_id,
        expected_byte_size, actual_byte_size, details
      ) values (
        record_row.organization_id, record_row.workspace_id, finding_key,
        'wrong_bucket', record_row.bucket_id, record_row.name,
        record_row.version_id, record_row.byte_size, record_row.actual_size,
        jsonb_build_object('action', 'manual_review_required')
      )
      on conflict (finding_fingerprint) do update
      set
        finding_status = 'open',
        occurrence_count =
          public.document_storage_reconciliation_findings.occurrence_count + 1,
        last_detected_at = now(),
        resolved_at = null;
    end if;

    if record_row.name <> record_row.storage_key then
      finding_key := md5('wrong_key:' || record_row.version_id::text);
      insert into public.document_storage_reconciliation_findings (
        organization_id, workspace_id, finding_fingerprint,
        discrepancy_type, storage_bucket, storage_key, version_id,
        expected_byte_size, actual_byte_size, details
      ) values (
        record_row.organization_id, record_row.workspace_id, finding_key,
        'wrong_key', record_row.bucket_id, record_row.name,
        record_row.version_id, record_row.byte_size, record_row.actual_size,
        jsonb_build_object('expectedKey', record_row.storage_key)
      )
      on conflict (finding_fingerprint) do update
      set
        finding_status = 'open',
        occurrence_count =
          public.document_storage_reconciliation_findings.occurrence_count + 1,
        last_detected_at = now(),
        resolved_at = null;
    end if;

    if record_row.actual_size is distinct from record_row.byte_size then
      finding_key := md5('wrong_size:' || record_row.version_id::text);
      insert into public.document_storage_reconciliation_findings (
        organization_id, workspace_id, finding_fingerprint,
        discrepancy_type, storage_bucket, storage_key, version_id,
        expected_byte_size, actual_byte_size, details
      ) values (
        record_row.organization_id, record_row.workspace_id, finding_key,
        'wrong_size', record_row.bucket_id, record_row.name,
        record_row.version_id, record_row.byte_size, record_row.actual_size,
        jsonb_build_object('action', 'manual_review_required')
      )
      on conflict (finding_fingerprint) do update
      set
        finding_status = 'open',
        occurrence_count =
          public.document_storage_reconciliation_findings.occurrence_count + 1,
        last_detected_at = now(),
        resolved_at = null;
    end if;
    mismatch_count := mismatch_count + 1;
  end loop;

  for record_row in
    select
      version.organization_id,
      version.workspace_id,
      version.id as version_id,
      version.storage_key,
      version.byte_size,
      version.upload_state,
      object.id as object_id,
      nullif(object.metadata ->> 'size', '')::bigint as actual_size
    from public.document_versions version
    join storage.objects object
      on object.bucket_id = 'organization-documents'
      and object.name = version.storage_key
    where version.upload_state in ('failed', 'abandoned', 'purged')
    order by exists (
      select 1
      from public.document_storage_reconciliation_findings finding
      where finding.version_id = version.id
        and finding.discrepancy_type = 'wrong_state'
        and finding.finding_status = 'open'
    ), version.created_at, version.id
    limit p_limit
  loop
    finding_key := md5('wrong_state:' || record_row.version_id::text);
    insert into public.document_storage_reconciliation_findings (
      organization_id, workspace_id, finding_fingerprint,
      discrepancy_type, storage_bucket, storage_key, version_id,
      expected_byte_size, actual_byte_size, details
    ) values (
      record_row.organization_id, record_row.workspace_id, finding_key,
      'wrong_state', 'organization-documents', record_row.storage_key,
      record_row.version_id, record_row.byte_size, record_row.actual_size,
      jsonb_build_object(
        'uploadState',
        record_row.upload_state,
        'action',
        'expected_object_cleanup'
      )
    )
    on conflict (finding_fingerprint) do update
    set
      finding_status = 'open',
      occurrence_count =
        public.document_storage_reconciliation_findings.occurrence_count + 1,
      last_detected_at = now(),
      resolved_at = null;

    insert into public.document_storage_cleanup_jobs (
      organization_id,
      workspace_id,
      version_id,
      job_type,
      job_identity,
      storage_bucket,
      storage_key,
      byte_size
    )
    values (
      record_row.organization_id,
      record_row.workspace_id,
      record_row.version_id,
      'abandoned_upload',
      'document-version:' || record_row.version_id::text
        || ':state-reconciliation:' || record_row.object_id::text,
      'organization-documents',
      record_row.storage_key,
      coalesce(record_row.actual_size, record_row.byte_size, 0)
    )
    on conflict do nothing;
    mismatch_count := mismatch_count + 1;
  end loop;

  for record_row in
    select
      object.id as object_id,
      object.bucket_id,
      object.name,
      nullif(object.metadata ->> 'size', '')::bigint as actual_size
    from storage.objects object
    where object.bucket_id = 'organization-documents'
      and not exists (
        select 1
        from public.document_versions version
        where version.storage_key = object.name
      )
    order by exists (
      select 1
      from public.document_storage_reconciliation_findings finding
      where finding.finding_fingerprint =
        md5('object_without_record:' || object.id::text)
        and finding.finding_status = 'open'
    ), object.created_at, object.id
    limit p_limit
  loop
    parsed_organization_id := null;
    parsed_workspace_id := null;
    if record_row.name ~
      '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
    then
      begin
        parsed_organization_id := split_part(record_row.name, '/', 1)::uuid;
        parsed_workspace_id := split_part(record_row.name, '/', 2)::uuid;
      exception when invalid_text_representation then
        parsed_organization_id := null;
        parsed_workspace_id := null;
      end;
    end if;

    if not exists (
      select 1
      from public.document_workspaces workspace
      where workspace.id = parsed_workspace_id
        and workspace.organization_id = parsed_organization_id
    ) then
      parsed_organization_id := null;
      parsed_workspace_id := null;
    end if;

    finding_key := md5('object_without_record:' || record_row.object_id::text);
    insert into public.document_storage_reconciliation_findings (
      organization_id,
      workspace_id,
      finding_fingerprint,
      discrepancy_type,
      storage_bucket,
      storage_key,
      actual_byte_size,
      details
    )
    values (
      parsed_organization_id,
      parsed_workspace_id,
      finding_key,
      'object_without_record',
      record_row.bucket_id,
      record_row.name,
      record_row.actual_size,
      jsonb_build_object(
        'action',
        'manual_review_required',
        'destructiveRepairAllowed',
        false
      )
    )
    on conflict (finding_fingerprint) do update
    set
      finding_status = 'open',
      occurrence_count =
        public.document_storage_reconciliation_findings.occurrence_count + 1,
      last_detected_at = now(),
      resolved_at = null;

    if parsed_workspace_id is not null then
      insert into public.document_storage_cleanup_jobs (
        organization_id,
        workspace_id,
        job_type,
        job_identity,
        storage_bucket,
        storage_key,
        byte_size
      )
      values (
        parsed_organization_id,
        parsed_workspace_id,
        'orphan_reconciliation',
        'document-orphan-review:' || record_row.object_id::text,
        record_row.bucket_id,
        record_row.name,
        coalesce(record_row.actual_size, 0)
      )
      on conflict do nothing;
    end if;
    orphan_count := orphan_count + 1;
  end loop;

  return jsonb_build_object(
    'databaseWithoutObjectCount', missing_count,
    'metadataMismatchCount', mismatch_count,
    'orphanObjectCount', orphan_count
  );
end;
$$;

revoke all on function public.reconcile_document_storage_catalog(integer)
from public, anon, authenticated;
grant execute on function public.reconcile_document_storage_catalog(integer)
to service_role;

create or replace function public.get_document_storage_diagnostics(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.document_workspaces%rowtype;
  usage_row public.organization_document_storage_usage%rowtype;
begin
  workspace_row := public.assert_document_workspace_permission(
    p_workspace_id,
    'files.monitor'
  );
  perform public.ensure_document_storage_usage_row(workspace_row.organization_id);

  select *
  into usage_row
  from public.organization_document_storage_usage usage
  where usage.organization_id = workspace_row.organization_id;

  return jsonb_build_object(
    'pendingUploads', (
      select count(*)
      from public.document_versions version
      where version.organization_id = workspace_row.organization_id
        and version.upload_state in ('pending', 'uploaded')
    ),
    'abandonedUploads', (
      select count(*)
      from public.document_versions version
      where version.organization_id = workspace_row.organization_id
        and version.upload_state in ('failed', 'abandoned')
    ),
    'cleanupPending', (
      select count(*)
      from public.document_storage_cleanup_jobs job
      where job.organization_id = workspace_row.organization_id
        and job.processing_status in ('pending', 'claimed', 'retry_scheduled')
    ),
    'cleanupFailures', (
      select count(*)
      from public.document_storage_cleanup_jobs job
      where job.organization_id = workspace_row.organization_id
        and job.last_error_code is not null
    ),
    'deadLetterJobs', (
      select count(*)
      from public.document_storage_cleanup_jobs job
      where job.organization_id = workspace_row.organization_id
        and job.processing_status = 'dead_lettered'
    ),
    'orphanCount', (
      select count(*)
      from public.document_storage_reconciliation_findings finding
      where finding.organization_id = workspace_row.organization_id
        and finding.discrepancy_type = 'object_without_record'
        and finding.finding_status <> 'resolved'
    ),
    'reconciliationFailures', (
      select count(*)
      from public.document_storage_reconciliation_findings finding
      where finding.organization_id = workspace_row.organization_id
        and finding.finding_status <> 'resolved'
    ),
    'quotaBytes', usage_row.quota_bytes,
    'usedBytes',
      usage_row.active_bytes + usage_row.deleted_bytes + usage_row.pending_bytes,
    'activeBytes', usage_row.active_bytes,
    'deletedBytes', usage_row.deleted_bytes,
    'pendingBytes', usage_row.pending_bytes,
    'fileCount', usage_row.file_count,
    'folderCount', usage_row.folder_count,
    'currentVersionCount', usage_row.current_version_count,
    'historicalVersionCount', usage_row.historical_version_count,
    'reconciledAt', usage_row.reconciled_at
  );
end;
$$;

revoke all on function public.get_document_storage_diagnostics(uuid)
from public, anon;
grant execute on function public.get_document_storage_diagnostics(uuid)
to authenticated;

-- Initialize counters for existing document organizations after all triggers
-- are installed. This one-time migration rebuild does not alter documents.
do $$
declare
  organization_row record;
begin
  for organization_row in
    select distinct workspace.organization_id
    from public.document_workspaces workspace
  loop
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform public.reconcile_document_storage_usage(
      organization_row.organization_id
    );
  end loop;
end;
$$;

commit;
