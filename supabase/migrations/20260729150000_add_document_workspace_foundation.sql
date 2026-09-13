begin;

-- Shared Files workspace permissions. Purge is deliberately owner-only; no
-- Phase 1 RPC performs a purge and ordinary users cannot access cleanup jobs.
insert into public.app_permissions (permission_key, description)
values
  ('files.view', 'View shared Opportunity and Project file workspaces'),
  ('files.write', 'Create and manage folders and files in shared workspaces'),
  ('files.delete', 'Soft delete and restore shared workspace folders and files'),
  ('files.purge', 'Permanently purge shared workspace file content')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'files.view', true),
  ('admin', 'files.view', true),
  ('qs', 'files.view', true),
  ('project_manager', 'files.view', true),
  ('worker', 'files.view', false),
  ('owner', 'files.write', true),
  ('admin', 'files.write', true),
  ('qs', 'files.write', true),
  ('project_manager', 'files.write', true),
  ('worker', 'files.write', false),
  ('owner', 'files.delete', true),
  ('admin', 'files.delete', true),
  ('qs', 'files.delete', false),
  ('project_manager', 'files.delete', true),
  ('worker', 'files.delete', false),
  ('owner', 'files.purge', true),
  ('admin', 'files.purge', false),
  ('qs', 'files.purge', false),
  ('project_manager', 'files.purge', false),
  ('worker', 'files.purge', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

-- Composite identities let every tenant-scoped foreign key enforce the
-- organization boundary in addition to the globally unique entity ID.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_opportunities'::regclass
      and conname = 'organization_opportunities_organization_id_id_key'
  ) then
    alter table public.organization_opportunities
      add constraint organization_opportunities_organization_id_id_key
      unique (organization_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_projects'::regclass
      and conname = 'organization_projects_organization_id_id_key'
  ) then
    alter table public.organization_projects
      add constraint organization_projects_organization_id_id_key
      unique (organization_id, id);
  end if;
end;
$$;

create table public.document_workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_workspaces_organization_id_id_key
    unique (organization_id, id)
);

create trigger set_document_workspaces_updated_at
before update on public.document_workspaces
for each row execute function public.set_updated_at();

create table public.document_workspace_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workspace_id uuid not null,
  opportunity_id uuid null,
  project_id uuid null,
  linked_by uuid not null references auth.users (id) on delete restrict,
  linked_at timestamptz not null default now(),
  constraint document_workspace_entities_workspace_fkey
    foreign key (organization_id, workspace_id)
    references public.document_workspaces (organization_id, id)
    on delete cascade,
  constraint document_workspace_entities_opportunity_fkey
    foreign key (organization_id, opportunity_id)
    references public.organization_opportunities (organization_id, id)
    on delete cascade,
  constraint document_workspace_entities_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id)
    on delete cascade,
  constraint document_workspace_entities_exactly_one_entity_check
    check ((opportunity_id is not null)::integer + (project_id is not null)::integer = 1),
  constraint document_workspace_entities_organization_workspace_id_id_key
    unique (organization_id, workspace_id, id)
);

create unique index document_workspace_entities_opportunity_uidx
  on public.document_workspace_entities (opportunity_id)
  where opportunity_id is not null;

create unique index document_workspace_entities_project_uidx
  on public.document_workspace_entities (project_id)
  where project_id is not null;

create index document_workspace_entities_workspace_idx
  on public.document_workspace_entities (organization_id, workspace_id, linked_at, id);

create table public.document_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workspace_id uuid not null,
  parent_node_id uuid null,
  kind text not null,
  display_name text not null,
  normalized_name text generated always as (lower(btrim(display_name))) stored,
  current_version_id uuid null,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users (id) on delete set null,
  deletion_batch_id uuid null,
  constraint document_nodes_workspace_fkey
    foreign key (organization_id, workspace_id)
    references public.document_workspaces (organization_id, id)
    on delete cascade,
  constraint document_nodes_organization_workspace_id_id_key
    unique (organization_id, workspace_id, id),
  constraint document_nodes_parent_fkey
    foreign key (organization_id, workspace_id, parent_node_id)
    references public.document_nodes (organization_id, workspace_id, id)
    on delete cascade,
  constraint document_nodes_kind_check
    check (kind in ('folder', 'file')),
  constraint document_nodes_name_length_check
    check (char_length(display_name) between 1 and 250),
  constraint document_nodes_name_trimmed_check
    check (display_name = btrim(display_name)),
  constraint document_nodes_name_reserved_check
    check (display_name not in ('.', '..')),
  constraint document_nodes_name_control_character_check
    check (display_name !~ '[[:cntrl:]]'),
  constraint document_nodes_name_path_separator_check
    check (display_name !~ E'[/\\\\]'),
  constraint document_nodes_not_own_parent_check
    check (parent_node_id is null or parent_node_id <> id),
  constraint document_nodes_folder_version_check
    check (kind = 'file' or current_version_id is null),
  constraint document_nodes_deletion_fields_check
    check (
      (deleted_at is null and deleted_by is null and deletion_batch_id is null)
      or
      (deleted_at is not null and deleted_by is not null and deletion_batch_id is not null)
    )
);

create unique index document_nodes_active_root_name_uidx
  on public.document_nodes (workspace_id, normalized_name)
  where parent_node_id is null and deleted_at is null;

create unique index document_nodes_active_child_name_uidx
  on public.document_nodes (workspace_id, parent_node_id, normalized_name)
  where parent_node_id is not null and deleted_at is null;

create index document_nodes_active_children_idx
  on public.document_nodes (
    workspace_id,
    parent_node_id,
    kind,
    normalized_name,
    id
  )
  where deleted_at is null;

create index document_nodes_workspace_deleted_idx
  on public.document_nodes (workspace_id, deleted_at, updated_at desc, id);

create index document_nodes_deletion_batch_idx
  on public.document_nodes (workspace_id, deletion_batch_id, id)
  where deletion_batch_id is not null;

create trigger set_document_nodes_updated_at
before update on public.document_nodes
for each row execute function public.set_updated_at();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workspace_id uuid not null,
  node_id uuid not null,
  version_number integer not null,
  storage_key text not null,
  upload_state text not null default 'pending',
  byte_size bigint null,
  claimed_mime_type text null,
  verified_mime_type text null,
  file_extension text null,
  sha256_checksum text null,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  initiated_at timestamptz not null default now(),
  uploaded_at timestamptz null,
  verified_at timestamptz null,
  failed_at timestamptz null,
  abandoned_at timestamptz null,
  purged_at timestamptz null,
  failure_code text null,
  failure_message text null,
  created_at timestamptz not null default now(),
  constraint document_versions_node_fkey
    foreign key (organization_id, workspace_id, node_id)
    references public.document_nodes (organization_id, workspace_id, id)
    on delete cascade,
  constraint document_versions_organization_workspace_id_id_key
    unique (organization_id, workspace_id, id),
  constraint document_versions_organization_workspace_node_id_id_key
    unique (organization_id, workspace_id, node_id, id),
  constraint document_versions_node_version_unique
    unique (node_id, version_number),
  constraint document_versions_storage_key_unique
    unique (storage_key),
  constraint document_versions_version_number_check
    check (version_number >= 1),
  constraint document_versions_storage_key_check
    check (char_length(btrim(storage_key)) between 1 and 1000 and storage_key = btrim(storage_key)),
  constraint document_versions_upload_state_check
    check (
      upload_state in (
        'pending',
        'uploaded',
        'active',
        'failed',
        'abandoned',
        'purge_pending',
        'purged'
      )
    ),
  constraint document_versions_byte_size_check
    check (byte_size is null or byte_size >= 0),
  constraint document_versions_claimed_mime_type_check
    check (
      claimed_mime_type is null
      or char_length(btrim(claimed_mime_type)) between 1 and 255
    ),
  constraint document_versions_verified_mime_type_check
    check (
      verified_mime_type is null
      or char_length(btrim(verified_mime_type)) between 1 and 255
    ),
  constraint document_versions_extension_check
    check (
      file_extension is null
      or (
        file_extension = lower(btrim(file_extension))
        and file_extension ~ '^[a-z0-9][a-z0-9._+-]{0,31}$'
      )
    ),
  constraint document_versions_sha256_check
    check (sha256_checksum is null or sha256_checksum ~ '^[a-f0-9]{64}$'),
  constraint document_versions_failure_code_check
    check (
      failure_code is null
      or char_length(btrim(failure_code)) between 1 and 100
    ),
  constraint document_versions_state_timestamp_check
    check (
      (upload_state <> 'uploaded' or uploaded_at is not null)
      and
      (upload_state <> 'active' or (uploaded_at is not null and verified_at is not null))
      and
      (upload_state <> 'failed' or failed_at is not null)
      and
      (upload_state <> 'abandoned' or abandoned_at is not null)
      and
      (upload_state <> 'purged' or purged_at is not null)
    )
);

create index document_versions_node_created_idx
  on public.document_versions (node_id, version_number desc, created_at desc, id);

create index document_versions_pending_idx
  on public.document_versions (upload_state, initiated_at, id)
  where upload_state in ('pending', 'uploaded', 'purge_pending');

alter table public.document_nodes
  add constraint document_nodes_current_version_fkey
  foreign key (organization_id, workspace_id, id, current_version_id)
  references public.document_versions (organization_id, workspace_id, node_id, id)
  on delete restrict;

create table public.document_activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workspace_id uuid not null,
  entity_link_id uuid null references public.document_workspace_entities (id) on delete set null,
  node_id uuid null,
  version_id uuid null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint document_activity_events_workspace_fkey
    foreign key (organization_id, workspace_id)
    references public.document_workspaces (organization_id, id)
    on delete cascade,
  constraint document_activity_events_node_fkey
    foreign key (organization_id, workspace_id, node_id)
    references public.document_nodes (organization_id, workspace_id, id)
    on delete restrict,
  constraint document_activity_events_version_fkey
    foreign key (organization_id, workspace_id, version_id)
    references public.document_versions (organization_id, workspace_id, id)
    on delete restrict,
  constraint document_activity_events_type_check
    check (
      event_type in (
        'workspace_created',
        'opportunity_linked',
        'project_linked',
        'folder_created',
        'file_upload_initiated',
        'file_uploaded',
        'version_activated',
        'renamed',
        'moved',
        'soft_deleted',
        'restored',
        'purge_requested',
        'purged'
      )
    ),
  constraint document_activity_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index document_activity_events_workspace_occurred_idx
  on public.document_activity_events (workspace_id, occurred_at desc, id desc);

create index document_activity_events_node_occurred_idx
  on public.document_activity_events (node_id, occurred_at desc, id desc)
  where node_id is not null;

create table public.document_storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workspace_id uuid not null,
  version_id uuid null,
  job_type text not null,
  job_identity text not null,
  storage_key text not null,
  processing_status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  claimed_at timestamptz null,
  claim_expires_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  last_error_code text null,
  last_error_message text null,
  completed_at timestamptz null,
  dead_lettered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_storage_cleanup_jobs_workspace_fkey
    foreign key (organization_id, workspace_id)
    references public.document_workspaces (organization_id, id)
    on delete cascade,
  constraint document_storage_cleanup_jobs_version_fkey
    foreign key (organization_id, workspace_id, version_id)
    references public.document_versions (organization_id, workspace_id, id)
    on delete cascade,
  constraint document_storage_cleanup_jobs_identity_unique
    unique (job_identity),
  constraint document_storage_cleanup_jobs_type_check
    check (job_type in ('abandoned_upload', 'version_purge', 'orphan_reconciliation')),
  constraint document_storage_cleanup_jobs_identity_check
    check (char_length(btrim(job_identity)) between 1 and 250),
  constraint document_storage_cleanup_jobs_storage_key_check
    check (char_length(btrim(storage_key)) between 1 and 1000),
  constraint document_storage_cleanup_jobs_status_check
    check (
      processing_status in (
        'pending',
        'claimed',
        'retry_scheduled',
        'completed',
        'dead_lettered'
      )
    ),
  constraint document_storage_cleanup_jobs_attempts_check
    check (attempt_count >= 0 and max_attempts >= 1),
  constraint document_storage_cleanup_jobs_claim_check
    check (
      (
        processing_status = 'claimed'
        and claimed_at is not null
        and claim_expires_at is not null
        and claimed_by is not null
        and claim_token is not null
      )
      or processing_status <> 'claimed'
    )
);

create index document_storage_cleanup_jobs_claimable_idx
  on public.document_storage_cleanup_jobs (
    processing_status,
    available_at,
    claim_expires_at,
    created_at,
    id
  );

create index document_storage_cleanup_jobs_workspace_idx
  on public.document_storage_cleanup_jobs (
    organization_id,
    workspace_id,
    processing_status,
    created_at
  );

create trigger set_document_storage_cleanup_jobs_updated_at
before update on public.document_storage_cleanup_jobs
for each row execute function public.set_updated_at();

create or replace function public.prevent_document_activity_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Document activity events are append-only.'
    using errcode = '55000';
end;
$$;

create trigger document_activity_events_append_only
before update or delete on public.document_activity_events
for each row execute function public.prevent_document_activity_event_mutation();

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

  return new;
end;
$$;

create trigger validate_document_activity_event_scope
before insert on public.document_activity_events
for each row execute function public.validate_document_activity_event_scope();

create or replace function public.validate_document_node_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_row public.document_nodes%rowtype;
  version_row public.document_versions%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.workspace_id <> old.workspace_id
    or new.kind <> old.kind
  ) then
    raise exception 'Document node organization, workspace, and kind are immutable.'
      using errcode = '55000';
  end if;

  if new.parent_node_id is not null and (
    tg_op = 'INSERT'
    or old.parent_node_id is distinct from new.parent_node_id
  ) then
    select *
    into parent_row
    from public.document_nodes parent
    where parent.organization_id = new.organization_id
      and parent.workspace_id = new.workspace_id
      and parent.id = new.parent_node_id;

    if not found then
      raise exception 'Document parent folder was not found in this workspace.'
        using errcode = '23503';
    end if;

    if parent_row.kind <> 'folder' then
      raise exception 'A file cannot be used as a document parent.'
        using errcode = '23514';
    end if;

    if parent_row.deleted_at is not null then
      raise exception 'A deleted folder cannot be used as a document parent.'
        using errcode = '23514';
    end if;
  end if;

  if new.kind = 'folder' and new.current_version_id is not null then
    raise exception 'Folders cannot have a current file version.'
      using errcode = '23514';
  end if;

  if new.current_version_id is not null
    and (
      tg_op = 'INSERT'
      or old.current_version_id is distinct from new.current_version_id
    )
  then
    select *
    into version_row
    from public.document_versions version
    where version.organization_id = new.organization_id
      and version.workspace_id = new.workspace_id
      and version.node_id = new.id
      and version.id = new.current_version_id;

    if not found or version_row.upload_state <> 'active' then
      raise exception 'Current document version must be an active version of this file.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_document_node_hierarchy
before insert or update on public.document_nodes
for each row execute function public.validate_document_node_hierarchy();

create or replace function public.validate_document_node_active_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is null
    and new.parent_node_id is not null
    and not exists (
      select 1
      from public.document_nodes parent
      where parent.organization_id = new.organization_id
        and parent.workspace_id = new.workspace_id
        and parent.id = new.parent_node_id
        and parent.kind = 'folder'
        and parent.deleted_at is null
    )
  then
    raise exception 'An active document node requires an active parent folder.'
      using errcode = '23514';
  end if;

  if new.kind = 'folder'
    and new.deleted_at is not null
    and exists (
      select 1
      from public.document_nodes child
      where child.organization_id = new.organization_id
        and child.workspace_id = new.workspace_id
        and child.parent_node_id = new.id
        and child.deleted_at is null
    )
  then
    raise exception 'A deleted folder cannot contain active document nodes.'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger validate_document_node_active_hierarchy
after insert or update on public.document_nodes
deferrable initially immediate
for each row execute function public.validate_document_node_active_hierarchy();

create or replace function public.validate_document_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  node_kind text;
begin
  select node.kind
  into node_kind
  from public.document_nodes node
  where node.organization_id = new.organization_id
    and node.workspace_id = new.workspace_id
    and node.id = new.node_id;

  if node_kind is distinct from 'file' then
    raise exception 'Document versions can only belong to file nodes.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id
      or new.workspace_id <> old.workspace_id
      or new.node_id <> old.node_id
      or new.version_number <> old.version_number
      or new.storage_key <> old.storage_key
      or new.uploaded_by <> old.uploaded_by
      or new.initiated_at <> old.initiated_at
      or new.created_at <> old.created_at
    then
      raise exception 'Document version identity is immutable.'
        using errcode = '55000';
    end if;

    if old.upload_state in ('active', 'purged') and (
      new.byte_size is distinct from old.byte_size
      or new.claimed_mime_type is distinct from old.claimed_mime_type
      or new.verified_mime_type is distinct from old.verified_mime_type
      or new.file_extension is distinct from old.file_extension
      or new.sha256_checksum is distinct from old.sha256_checksum
      or new.uploaded_at is distinct from old.uploaded_at
      or new.verified_at is distinct from old.verified_at
    ) then
      raise exception 'Activated document version content metadata is immutable.'
        using errcode = '55000';
    end if;

    if not (
      new.upload_state = old.upload_state
      or (old.upload_state = 'pending' and new.upload_state in ('uploaded', 'failed', 'abandoned'))
      or (old.upload_state = 'uploaded' and new.upload_state in ('active', 'failed', 'abandoned', 'purge_pending'))
      or (old.upload_state in ('active', 'failed', 'abandoned') and new.upload_state = 'purge_pending')
      or (old.upload_state = 'purge_pending' and new.upload_state = 'purged')
    ) then
      raise exception 'Invalid document version lifecycle transition.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_document_version
before insert or update on public.document_versions
for each row execute function public.validate_document_version();

alter table public.document_workspaces enable row level security;
alter table public.document_workspaces force row level security;
alter table public.document_workspace_entities enable row level security;
alter table public.document_workspace_entities force row level security;
alter table public.document_nodes enable row level security;
alter table public.document_nodes force row level security;
alter table public.document_versions enable row level security;
alter table public.document_versions force row level security;
alter table public.document_activity_events enable row level security;
alter table public.document_activity_events force row level security;
alter table public.document_storage_cleanup_jobs enable row level security;
alter table public.document_storage_cleanup_jobs force row level security;

revoke all on public.document_workspaces from public, anon, authenticated;
revoke all on public.document_workspace_entities from public, anon, authenticated;
revoke all on public.document_nodes from public, anon, authenticated;
revoke all on public.document_versions from public, anon, authenticated;
revoke all on public.document_activity_events from public, anon, authenticated;
revoke all on public.document_storage_cleanup_jobs from public, anon, authenticated;

grant select on public.document_workspaces to authenticated;
grant select on public.document_workspace_entities to authenticated;
grant select on public.document_nodes to authenticated;
grant select on public.document_versions to authenticated;
grant select on public.document_activity_events to authenticated;
grant select, insert, update, delete on public.document_storage_cleanup_jobs to service_role;

create or replace function public.can_access_document_workspace(
  p_workspace_id uuid,
  p_permission_key text default 'files.view'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_workspaces workspace
    where workspace.id = p_workspace_id
      and public.has_org_permission(workspace.organization_id, p_permission_key)
      and exists (
        select 1
        from public.document_workspace_entities entity_link
        where entity_link.organization_id = workspace.organization_id
          and entity_link.workspace_id = workspace.id
      )
  );
$$;

revoke all on function public.can_access_document_workspace(uuid, text)
from public, anon;
grant execute on function public.can_access_document_workspace(uuid, text)
to authenticated;

create policy "Authorized members can view document workspaces"
on public.document_workspaces
for select
to authenticated
using (public.can_access_document_workspace(id, 'files.view'));

create policy "Authorized members can view document workspace links"
on public.document_workspace_entities
for select
to authenticated
using (public.can_access_document_workspace(workspace_id, 'files.view'));

create policy "Authorized members can view document nodes"
on public.document_nodes
for select
to authenticated
using (public.can_access_document_workspace(workspace_id, 'files.view'));

create policy "Authorized members can view document versions"
on public.document_versions
for select
to authenticated
using (public.can_access_document_workspace(workspace_id, 'files.view'));

create policy "Authorized members can view document activity"
on public.document_activity_events
for select
to authenticated
using (public.can_access_document_workspace(workspace_id, 'files.view'));

create or replace function public.assert_document_workspace_permission(
  p_workspace_id uuid,
  p_permission_key text
)
returns public.document_workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.document_workspaces%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  select *
  into workspace_row
  from public.document_workspaces workspace
  where workspace.id = p_workspace_id;

  if not found
    or not public.can_access_document_workspace(workspace_row.id, p_permission_key)
  then
    raise exception 'Document workspace not found or access denied.'
      using errcode = '42501';
  end if;

  return workspace_row;
end;
$$;

revoke all on function public.assert_document_workspace_permission(uuid, text)
from public, anon, authenticated;

create or replace function public.get_or_create_opportunity_document_workspace(
  p_opportunity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity_row public.organization_opportunities%rowtype;
  workspace_row public.document_workspaces%rowtype;
  entity_link_row public.document_workspace_entities%rowtype;
begin
  if actor_user_id is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  select *
  into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
  for key share;

  if not found
    or not public.has_org_permission(opportunity_row.organization_id, 'files.write')
  then
    raise exception 'Opportunity not found or access denied.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('document-opportunity:' || opportunity_row.id::text, 0)
  );

  select workspace.*
  into workspace_row
  from public.document_workspace_entities entity_link
  join public.document_workspaces workspace
    on workspace.organization_id = entity_link.organization_id
   and workspace.id = entity_link.workspace_id
  where entity_link.opportunity_id = opportunity_row.id;

  if found then
    return workspace_row.id;
  end if;

  insert into public.document_workspaces (
    organization_id,
    created_by,
    updated_by
  )
  values (
    opportunity_row.organization_id,
    actor_user_id,
    actor_user_id
  )
  returning * into workspace_row;

  insert into public.document_workspace_entities (
    organization_id,
    workspace_id,
    opportunity_id,
    linked_by
  )
  values (
    opportunity_row.organization_id,
    workspace_row.id,
    opportunity_row.id,
    actor_user_id
  )
  returning * into entity_link_row;

  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    entity_link_id,
    actor_user_id,
    event_type,
    metadata
  )
  values
    (
      opportunity_row.organization_id,
      workspace_row.id,
      entity_link_row.id,
      actor_user_id,
      'workspace_created',
      jsonb_build_object('source', 'opportunity')
    ),
    (
      opportunity_row.organization_id,
      workspace_row.id,
      entity_link_row.id,
      actor_user_id,
      'opportunity_linked',
      jsonb_build_object('opportunityId', opportunity_row.id)
    );

  return workspace_row.id;
end;
$$;

revoke all on function public.get_or_create_opportunity_document_workspace(uuid)
from public, anon;
grant execute on function public.get_or_create_opportunity_document_workspace(uuid)
to authenticated;

create or replace function public.link_project_to_opportunity_document_workspace(
  p_opportunity_id uuid,
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity_row public.organization_opportunities%rowtype;
  project_row public.organization_projects%rowtype;
  opportunity_link public.document_workspace_entities%rowtype;
  existing_project_link public.document_workspace_entities%rowtype;
  project_link public.document_workspace_entities%rowtype;
begin
  if actor_user_id is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  select *
  into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
  for key share;

  select *
  into project_row
  from public.organization_projects project
  where project.id = p_project_id
  for key share;

  if opportunity_row.id is null
    or project_row.id is null
    or opportunity_row.organization_id <> project_row.organization_id
    or project_row.source_opportunity_id is distinct from opportunity_row.id
    or not public.has_org_permission(opportunity_row.organization_id, 'files.write')
  then
    raise exception 'Opportunity and Project workspace linkage is not authorized.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('document-project:' || project_row.id::text, 0)
  );

  select *
  into opportunity_link
  from public.document_workspace_entities entity_link
  where entity_link.opportunity_id = opportunity_row.id;

  if not found then
    raise exception 'Opportunity document workspace does not exist.'
      using errcode = 'P0002';
  end if;

  select *
  into existing_project_link
  from public.document_workspace_entities entity_link
  where entity_link.project_id = project_row.id;

  if found then
    if existing_project_link.workspace_id <> opportunity_link.workspace_id then
      raise exception 'Project is already linked to a different document workspace.'
        using errcode = '23505';
    end if;

    return existing_project_link.workspace_id;
  end if;

  insert into public.document_workspace_entities (
    organization_id,
    workspace_id,
    project_id,
    linked_by
  )
  values (
    opportunity_row.organization_id,
    opportunity_link.workspace_id,
    project_row.id,
    actor_user_id
  )
  returning * into project_link;

  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    entity_link_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    opportunity_row.organization_id,
    opportunity_link.workspace_id,
    project_link.id,
    actor_user_id,
    'project_linked',
    jsonb_build_object(
      'opportunityId', opportunity_row.id,
      'projectId', project_row.id
    )
  );

  return opportunity_link.workspace_id;
end;
$$;

revoke all on function public.link_project_to_opportunity_document_workspace(uuid, uuid)
from public, anon;
grant execute on function public.link_project_to_opportunity_document_workspace(uuid, uuid)
to authenticated;

create or replace function public.create_document_folder(
  p_workspace_id uuid,
  p_parent_node_id uuid,
  p_display_name text
)
returns public.document_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  workspace_row public.document_workspaces%rowtype;
  node_row public.document_nodes%rowtype;
begin
  workspace_row := public.assert_document_workspace_permission(
    p_workspace_id,
    'files.write'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('document-workspace:' || workspace_row.id::text, 0)
  );

  if p_parent_node_id is not null then
    perform 1
    from public.document_nodes parent
    where parent.organization_id = workspace_row.organization_id
      and parent.workspace_id = workspace_row.id
      and parent.id = p_parent_node_id
      and parent.kind = 'folder'
      and parent.deleted_at is null
    for update;

    if not found then
      raise exception 'Parent folder not found.'
        using errcode = '23503';
    end if;
  end if;

  insert into public.document_nodes (
    organization_id,
    workspace_id,
    parent_node_id,
    kind,
    display_name,
    created_by,
    updated_by
  )
  values (
    workspace_row.organization_id,
    workspace_row.id,
    p_parent_node_id,
    'folder',
    btrim(p_display_name),
    actor_user_id,
    actor_user_id
  )
  returning * into node_row;

  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    node_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    workspace_row.organization_id,
    workspace_row.id,
    node_row.id,
    actor_user_id,
    'folder_created',
    jsonb_build_object(
      'displayName', node_row.display_name,
      'parentNodeId', node_row.parent_node_id
    )
  );

  return node_row;
end;
$$;

revoke all on function public.create_document_folder(uuid, uuid, text)
from public, anon;
grant execute on function public.create_document_folder(uuid, uuid, text)
to authenticated;

create or replace function public.rename_document_node(
  p_node_id uuid,
  p_display_name text
)
returns public.document_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  node_row public.document_nodes%rowtype;
  old_name text;
begin
  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id;

  if not found then
    raise exception 'Document node not found.'
      using errcode = 'P0002';
  end if;

  perform public.assert_document_workspace_permission(
    node_row.workspace_id,
    'files.write'
  );
  perform pg_advisory_xact_lock(
    hashtextextended('document-workspace:' || node_row.workspace_id::text, 0)
  );

  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id
    and node.deleted_at is null
  for update;

  if not found then
    raise exception 'Active document node not found.'
      using errcode = 'P0002';
  end if;

  old_name := node_row.display_name;
  if old_name = btrim(p_display_name) then
    return node_row;
  end if;

  update public.document_nodes node
  set
    display_name = btrim(p_display_name),
    updated_by = actor_user_id
  where node.id = node_row.id
  returning * into node_row;

  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    node_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    node_row.organization_id,
    node_row.workspace_id,
    node_row.id,
    actor_user_id,
    'renamed',
    jsonb_build_object(
      'oldDisplayName', old_name,
      'newDisplayName', node_row.display_name
    )
  );

  return node_row;
end;
$$;

revoke all on function public.rename_document_node(uuid, text)
from public, anon;
grant execute on function public.rename_document_node(uuid, text)
to authenticated;

create or replace function public.move_document_node(
  p_node_id uuid,
  p_target_parent_node_id uuid
)
returns public.document_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  node_row public.document_nodes%rowtype;
  old_parent_id uuid;
  creates_cycle boolean := false;
begin
  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id;

  if not found then
    raise exception 'Document node not found.'
      using errcode = 'P0002';
  end if;

  perform public.assert_document_workspace_permission(
    node_row.workspace_id,
    'files.write'
  );
  perform pg_advisory_xact_lock(
    hashtextextended('document-workspace:' || node_row.workspace_id::text, 0)
  );

  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id
    and node.deleted_at is null
  for update;

  if not found then
    raise exception 'Active document node not found.'
      using errcode = 'P0002';
  end if;

  if p_target_parent_node_id is not null then
    perform 1
    from public.document_nodes parent
    where parent.organization_id = node_row.organization_id
      and parent.workspace_id = node_row.workspace_id
      and parent.id = p_target_parent_node_id
      and parent.kind = 'folder'
      and parent.deleted_at is null
    for update;

    if not found then
      raise exception 'Target folder not found in this workspace.'
        using errcode = '23503';
    end if;
  end if;

  if node_row.kind = 'folder' and p_target_parent_node_id is not null then
    with recursive descendants as (
      select child.id
      from public.document_nodes child
      where child.id = node_row.id
      union all
      select child.id
      from public.document_nodes child
      join descendants ancestor on child.parent_node_id = ancestor.id
      where child.organization_id = node_row.organization_id
        and child.workspace_id = node_row.workspace_id
    )
    select exists (
      select 1
      from descendants
      where id = p_target_parent_node_id
    )
    into creates_cycle;

    if creates_cycle then
      raise exception 'A folder cannot be moved into itself or its descendant.'
        using errcode = '23514';
    end if;
  end if;

  old_parent_id := node_row.parent_node_id;
  if old_parent_id is not distinct from p_target_parent_node_id then
    return node_row;
  end if;

  update public.document_nodes node
  set
    parent_node_id = p_target_parent_node_id,
    updated_by = actor_user_id
  where node.id = node_row.id
  returning * into node_row;

  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    node_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    node_row.organization_id,
    node_row.workspace_id,
    node_row.id,
    actor_user_id,
    'moved',
    jsonb_build_object(
      'oldParentNodeId', old_parent_id,
      'newParentNodeId', node_row.parent_node_id
    )
  );

  return node_row;
end;
$$;

revoke all on function public.move_document_node(uuid, uuid)
from public, anon;
grant execute on function public.move_document_node(uuid, uuid)
to authenticated;

create or replace function public.soft_delete_document_node(
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
  deletion_batch uuid := gen_random_uuid();
  deletion_time timestamptz := now();
begin
  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id;

  if not found then
    raise exception 'Document node not found.'
      using errcode = 'P0002';
  end if;

  perform public.assert_document_workspace_permission(
    node_row.workspace_id,
    'files.delete'
  );
  perform pg_advisory_xact_lock(
    hashtextextended('document-workspace:' || node_row.workspace_id::text, 0)
  );

  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id
  for update;

  if node_row.deleted_at is not null then
    return node_row.deletion_batch_id;
  end if;

  with recursive subtree as (
    select node.id
    from public.document_nodes node
    where node.id = node_row.id
    union all
    select child.id
    from public.document_nodes child
    join subtree parent on child.parent_node_id = parent.id
    where child.organization_id = node_row.organization_id
      and child.workspace_id = node_row.workspace_id
      and child.deleted_at is null
  ),
  deleted_nodes as (
    update public.document_nodes node
    set
      deleted_at = deletion_time,
      deleted_by = actor_user_id,
      deletion_batch_id = deletion_batch,
      updated_by = actor_user_id
    where node.id in (select id from subtree)
      and node.deleted_at is null
    returning node.*
  )
  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    node_id,
    actor_user_id,
    event_type,
    metadata,
    occurred_at
  )
  select
    deleted.organization_id,
    deleted.workspace_id,
    deleted.id,
    actor_user_id,
    'soft_deleted',
    jsonb_build_object(
      'deletionBatchId', deletion_batch,
      'rootNodeId', node_row.id
    ),
    deletion_time
  from deleted_nodes deleted;

  return deletion_batch;
end;
$$;

revoke all on function public.soft_delete_document_node(uuid)
from public, anon;
grant execute on function public.soft_delete_document_node(uuid)
to authenticated;

create or replace function public.restore_document_node(
  p_node_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  node_row public.document_nodes%rowtype;
  restored_count integer := 0;
  restore_time timestamptz := now();
begin
  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id;

  if not found then
    raise exception 'Document node not found.'
      using errcode = 'P0002';
  end if;

  perform public.assert_document_workspace_permission(
    node_row.workspace_id,
    'files.delete'
  );
  perform pg_advisory_xact_lock(
    hashtextextended('document-workspace:' || node_row.workspace_id::text, 0)
  );

  select *
  into node_row
  from public.document_nodes node
  where node.id = p_node_id
  for update;

  if node_row.deleted_at is null then
    return 0;
  end if;

  if exists (
    select 1
    from public.document_nodes restoring
    join public.document_nodes parent
      on parent.id = restoring.parent_node_id
    where restoring.workspace_id = node_row.workspace_id
      and restoring.deletion_batch_id = node_row.deletion_batch_id
      and parent.deletion_batch_id is distinct from node_row.deletion_batch_id
      and parent.deleted_at is not null
  ) then
    raise exception 'Document subtree cannot be restored into a deleted parent.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.document_nodes restoring
    join public.document_nodes active
      on active.workspace_id = restoring.workspace_id
     and active.parent_node_id is not distinct from restoring.parent_node_id
     and active.normalized_name = restoring.normalized_name
     and active.deleted_at is null
    where restoring.workspace_id = node_row.workspace_id
      and restoring.deletion_batch_id = node_row.deletion_batch_id
  ) then
    raise exception 'A document with the same name already exists in the restore destination.'
      using errcode = '23505';
  end if;

  with restored_nodes as (
    update public.document_nodes restoring
    set
      deleted_at = null,
      deleted_by = null,
      deletion_batch_id = null,
      updated_by = actor_user_id
    where restoring.workspace_id = node_row.workspace_id
      and restoring.deletion_batch_id = node_row.deletion_batch_id
    returning restoring.*
  ),
  inserted_events as (
    insert into public.document_activity_events (
      organization_id,
      workspace_id,
      node_id,
      actor_user_id,
      event_type,
      metadata,
      occurred_at
    )
    select
      restored.organization_id,
      restored.workspace_id,
      restored.id,
      actor_user_id,
      'restored',
      jsonb_build_object(
        'deletionBatchId', node_row.deletion_batch_id,
        'rootNodeId', node_row.id
      ),
      restore_time
    from restored_nodes restored
    returning 1
  )
  select count(*)::integer
  into restored_count
  from inserted_events;

  return restored_count;
end;
$$;

revoke all on function public.restore_document_node(uuid)
from public, anon;
grant execute on function public.restore_document_node(uuid)
to authenticated;

commit;
