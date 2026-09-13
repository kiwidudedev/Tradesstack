-- Phase 2: private Storage and resumable upload/download foundation.
-- File bodies are uploaded directly to Supabase Storage using TUS. Application
-- routes authorize initiation/completion but never proxy document bytes.

alter table public.document_nodes
  add column lifecycle_state text not null default 'active';

alter table public.document_nodes
  add constraint document_nodes_lifecycle_state_check
  check (
    (kind = 'folder' and lifecycle_state = 'active')
    or
    (kind = 'file' and lifecycle_state in ('pending', 'active', 'abandoned'))
  );

drop index public.document_nodes_active_root_name_uidx;
drop index public.document_nodes_active_child_name_uidx;

create unique index document_nodes_live_root_name_uidx
  on public.document_nodes (workspace_id, normalized_name)
  where
    parent_node_id is null
    and deleted_at is null
    and lifecycle_state in ('pending', 'active');

create unique index document_nodes_live_child_name_uidx
  on public.document_nodes (workspace_id, parent_node_id, normalized_name)
  where
    parent_node_id is not null
    and deleted_at is null
    and lifecycle_state in ('pending', 'active');

alter table public.document_versions
  add column upload_idempotency_key uuid null,
  add column upload_expires_at timestamptz null,
  add column upload_request_fingerprint text null,
  add column replaces_version_id uuid null,
  add column storage_object_id uuid null,
  add column storage_etag text null,
  add column activated_at timestamptz null;

alter table public.document_versions
  add constraint document_versions_replaces_version_fkey
  foreign key (organization_id, workspace_id, node_id, replaces_version_id)
  references public.document_versions (organization_id, workspace_id, node_id, id)
  on delete restrict;

alter table public.document_versions
  add constraint document_versions_upload_reservation_check
  check (
    (
      upload_idempotency_key is null
      and upload_expires_at is null
      and upload_request_fingerprint is null
    )
    or
    (
      upload_idempotency_key is not null
      and upload_expires_at is not null
      and upload_request_fingerprint ~ '^[a-f0-9]{64}$'
      and byte_size is not null
      and byte_size between 1 and 2147483648
    )
  );

alter table public.document_versions
  add constraint document_versions_storage_etag_check
  check (
    storage_etag is null
    or char_length(btrim(storage_etag)) between 1 and 512
  );

alter table public.document_versions
  add constraint document_versions_activation_check
  check (
    upload_state <> 'active'
    or (
      storage_object_id is not null
      and activated_at is not null
      and uploaded_at is not null
      and verified_at is not null
    )
  ) not valid;

alter table public.document_versions
  validate constraint document_versions_activation_check;

create unique index document_versions_uploader_idempotency_uidx
  on public.document_versions (uploaded_by, upload_idempotency_key)
  where upload_idempotency_key is not null;

create unique index document_versions_storage_object_uidx
  on public.document_versions (storage_object_id)
  where storage_object_id is not null;

create index document_versions_expired_upload_idx
  on public.document_versions (upload_expires_at, id)
  where upload_state in ('pending', 'uploaded');

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'organization-documents',
  'organization-documents',
  false,
  2147483648,
  array[
    'application/pdf',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.validate_document_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  node_row public.document_nodes%rowtype;
begin
  select node.*
  into node_row
  from public.document_nodes node
  where node.organization_id = new.organization_id
    and node.workspace_id = new.workspace_id
    and node.id = new.node_id;

  if not found or node_row.kind <> 'file' then
    raise exception 'Document versions must belong to a file node.';
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
      or new.upload_idempotency_key is distinct from old.upload_idempotency_key
      or new.upload_expires_at is distinct from old.upload_expires_at
      or new.upload_request_fingerprint is distinct from old.upload_request_fingerprint
      or new.replaces_version_id is distinct from old.replaces_version_id
    then
      raise exception 'Document version identity is immutable; upload reservation metadata is immutable.';
    end if;

    if old.upload_state in ('active', 'purge_pending', 'purged')
      and (
        new.byte_size is distinct from old.byte_size
        or new.claimed_mime_type is distinct from old.claimed_mime_type
        or new.verified_mime_type is distinct from old.verified_mime_type
        or new.file_extension is distinct from old.file_extension
        or new.sha256_checksum is distinct from old.sha256_checksum
        or new.uploaded_at is distinct from old.uploaded_at
        or new.verified_at is distinct from old.verified_at
        or new.storage_object_id is distinct from old.storage_object_id
        or new.storage_etag is distinct from old.storage_etag
        or new.activated_at is distinct from old.activated_at
      )
    then
      raise exception 'Activated document content metadata is immutable.';
    end if;

    if old.upload_state in ('failed', 'abandoned', 'purged')
      and new.upload_state <> old.upload_state
    then
      raise exception 'Terminal document upload states cannot transition.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.document_upload_mime_extension_allowed(
  p_mime_type text,
  p_extension text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select (lower(btrim(coalesce(p_mime_type, ''))), lower(btrim(coalesce(p_extension, ''))))
    in (
      ('application/pdf', 'pdf'),
      ('text/plain', 'txt'),
      ('text/csv', 'csv'),
      ('image/jpeg', 'jpg'),
      ('image/jpeg', 'jpeg'),
      ('image/png', 'png'),
      ('image/webp', 'webp'),
      ('application/msword', 'doc'),
      ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'),
      ('application/vnd.ms-excel', 'xls'),
      ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'),
      ('application/vnd.ms-powerpoint', 'ppt'),
      ('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx')
    );
$$;

revoke all on function public.document_upload_mime_extension_allowed(text, text)
from public, anon;
grant execute on function public.document_upload_mime_extension_allowed(text, text)
to authenticated, service_role;

create or replace function public.can_upload_document_storage_object(
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and coalesce(p_object_path, '') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.document_versions version
      join public.document_nodes node
        on node.organization_id = version.organization_id
       and node.workspace_id = version.workspace_id
       and node.id = version.node_id
      where version.storage_key = p_object_path
        and version.uploaded_by = auth.uid()
        and version.upload_state = 'pending'
        and version.upload_expires_at > now()
        and node.deleted_at is null
        and node.lifecycle_state in ('pending', 'active')
        and public.can_access_document_workspace(
          version.workspace_id,
          'files.write'
        )
    );
$$;

revoke all on function public.can_upload_document_storage_object(text)
from public, anon;
grant execute on function public.can_upload_document_storage_object(text)
to authenticated;

drop policy if exists "Authorized pending document uploads can create objects"
on storage.objects;
create policy "Authorized pending document uploads can create objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-documents'
  and owner = auth.uid()
  and public.can_upload_document_storage_object(name)
);

-- Deliberately no authenticated SELECT, UPDATE, or DELETE policy exists for
-- organization-documents. User-bound TUS may only create an exact reserved
-- pending object. Metadata verification, signed downloads, and future cleanup
-- cross the service-role boundary only after document-domain authorization.

drop policy if exists "Authorized members can view document nodes"
on public.document_nodes;
create policy "Authorized members can view active document nodes"
on public.document_nodes
for select
to authenticated
using (
  lifecycle_state = 'active'
  and public.can_access_document_workspace(workspace_id, 'files.view')
);

drop policy if exists "Authorized members can view document versions"
on public.document_versions;
create policy "Authorized members can view active document versions"
on public.document_versions
for select
to authenticated
using (
  upload_state = 'active'
  and public.can_access_document_workspace(workspace_id, 'files.view')
);

create or replace function public.resolve_document_upload_workspace(
  p_opportunity_id uuid,
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_id uuid;
  entity_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized.';
  end if;

  if (p_opportunity_id is not null)::integer
    + (p_project_id is not null)::integer <> 1
  then
    raise exception 'Exactly one Opportunity or Project identifier is required.';
  end if;

  if p_opportunity_id is not null then
    select opportunity.organization_id
    into entity_organization_id
    from public.organization_opportunities opportunity
    where opportunity.id = p_opportunity_id;

    if not found
      or not public.has_org_permission(entity_organization_id, 'files.write')
    then
      raise exception 'Opportunity not found or access denied.';
    end if;

    workspace_id :=
      public.get_or_create_opportunity_document_workspace(p_opportunity_id);
  else
    select project.organization_id, link.workspace_id
    into entity_organization_id, workspace_id
    from public.organization_projects project
    left join public.document_workspace_entities link
      on link.organization_id = project.organization_id
     and link.project_id = project.id
    where project.id = p_project_id;

    if not found
      or workspace_id is null
      or not public.has_org_permission(entity_organization_id, 'files.write')
    then
      raise exception 'Project document workspace not found or access denied.';
    end if;
  end if;

  return workspace_id;
end;
$$;

revoke all on function public.resolve_document_upload_workspace(uuid, uuid)
from public, anon;
grant execute on function public.resolve_document_upload_workspace(uuid, uuid)
to authenticated;

create or replace function public.initiate_document_upload(
  p_opportunity_id uuid,
  p_project_id uuid,
  p_parent_node_id uuid,
  p_display_name text,
  p_claimed_mime_type text,
  p_file_extension text,
  p_byte_size bigint,
  p_existing_node_id uuid,
  p_idempotency_key uuid
)
returns table (
  node_id uuid,
  version_id uuid,
  version_number integer,
  storage_key text,
  upload_state text,
  upload_expires_at timestamptz,
  display_name text,
  claimed_mime_type text,
  byte_size bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  resolved_workspace_id uuid;
  resolved_organization_id uuid;
  normalized_display_name text := btrim(coalesce(p_display_name, ''));
  normalized_mime_type text := lower(btrim(coalesce(p_claimed_mime_type, '')));
  normalized_extension text := lower(btrim(coalesce(p_file_extension, '')));
  request_fingerprint text;
  existing_version public.document_versions%rowtype;
  target_node public.document_nodes%rowtype;
  parent_node public.document_nodes%rowtype;
  new_version_id uuid := gen_random_uuid();
  next_version_number integer;
  previous_version_id uuid;
begin
  if caller_id is null then
    raise exception 'Unauthorized.';
  end if;

  if p_idempotency_key is null then
    raise exception 'An idempotency key is required.';
  end if;

  if p_byte_size is null or p_byte_size < 1 then
    raise exception 'Document files cannot be empty.';
  end if;

  if p_byte_size > 2147483648 then
    raise exception 'Document file exceeds the 2 GiB limit.';
  end if;

  if normalized_display_name = ''
    or char_length(normalized_display_name) > 250
    or normalized_display_name in ('.', '..')
    or normalized_display_name ~ '[[:cntrl:]]'
    or normalized_display_name ~ E'[/\\\\]'
  then
    raise exception 'Invalid document file name.';
  end if;

  if normalized_extension = ''
    or normalized_extension !~ '^[a-z0-9]{1,16}$'
    or right(lower(normalized_display_name), char_length(normalized_extension) + 1)
      <> '.' || normalized_extension
  then
    raise exception 'Document extension does not match the file name.';
  end if;

  if lower(normalized_display_name) ~
    '\.(exe|com|bat|cmd|msi|msp|scr|ps1|psm1|sh|bash|zsh|js|mjs|cjs|html?|svg|zip|rar|7z|tar|gz|bz2|xz|iso|dmg|pkg|app|apk|jar|docm|dotm|xlsm|xltm|pptm|potm)(\.|$)'
  then
    raise exception 'Blocked document file type.';
  end if;

  if not public.document_upload_mime_extension_allowed(
    normalized_mime_type,
    normalized_extension
  ) then
    raise exception 'Document MIME type and extension are not allowed.';
  end if;

  resolved_workspace_id :=
    public.resolve_document_upload_workspace(p_opportunity_id, p_project_id);

  select workspace.organization_id
  into resolved_organization_id
  from public.document_workspaces workspace
  where workspace.id = resolved_workspace_id;

  perform pg_advisory_xact_lock(
    hashtextextended('document-upload:' || resolved_workspace_id::text, 0)
  );

  request_fingerprint := encode(
    extensions.digest(
      concat_ws(
        '|',
        resolved_workspace_id::text,
        coalesce(p_parent_node_id::text, ''),
        normalized_display_name,
        normalized_mime_type,
        normalized_extension,
        p_byte_size::text,
        coalesce(p_existing_node_id::text, '')
      ),
      'sha256'
    ),
    'hex'
  );

  select version.*
  into existing_version
  from public.document_versions version
  where version.uploaded_by = caller_id
    and version.upload_idempotency_key = p_idempotency_key;

  if found then
    if existing_version.workspace_id <> resolved_workspace_id
      or existing_version.upload_request_fingerprint <> request_fingerprint
    then
      raise exception 'Idempotency key was already used for another upload.';
    end if;

    return query
    select
      node.id,
      existing_version.id,
      existing_version.version_number,
      existing_version.storage_key,
      existing_version.upload_state,
      existing_version.upload_expires_at,
      node.display_name,
      existing_version.claimed_mime_type,
      existing_version.byte_size
    from public.document_nodes node
    where node.id = existing_version.node_id;
    return;
  end if;

  if p_parent_node_id is not null then
    select node.*
    into parent_node
    from public.document_nodes node
    where node.organization_id = resolved_organization_id
      and node.workspace_id = resolved_workspace_id
      and node.id = p_parent_node_id
    for update;

    if not found
      or parent_node.kind <> 'folder'
      or parent_node.deleted_at is not null
      or parent_node.lifecycle_state <> 'active'
    then
      raise exception 'Parent folder not found.';
    end if;
  end if;

  if p_existing_node_id is null then
    insert into public.document_nodes (
      organization_id,
      workspace_id,
      parent_node_id,
      kind,
      display_name,
      lifecycle_state,
      created_by,
      updated_by
    )
    values (
      resolved_organization_id,
      resolved_workspace_id,
      p_parent_node_id,
      'file',
      normalized_display_name,
      'pending',
      caller_id,
      caller_id
    )
    returning * into target_node;

    next_version_number := 1;
    previous_version_id := null;
  else
    select node.*
    into target_node
    from public.document_nodes node
    where node.organization_id = resolved_organization_id
      and node.workspace_id = resolved_workspace_id
      and node.id = p_existing_node_id
    for update;

    if not found
      or target_node.kind <> 'file'
      or target_node.deleted_at is not null
      or target_node.lifecycle_state <> 'active'
      or target_node.current_version_id is null
    then
      raise exception 'Replacement target must be a live active file.';
    end if;

    if target_node.parent_node_id is distinct from p_parent_node_id
      or target_node.display_name <> normalized_display_name
    then
      raise exception 'Replacement must preserve the file name and parent folder.';
    end if;

    select coalesce(max(version.version_number), 0) + 1
    into next_version_number
    from public.document_versions version
    where version.node_id = target_node.id;

    previous_version_id := target_node.current_version_id;
  end if;

  insert into public.document_versions (
    id,
    organization_id,
    workspace_id,
    node_id,
    version_number,
    storage_key,
    upload_state,
    byte_size,
    claimed_mime_type,
    file_extension,
    uploaded_by,
    upload_idempotency_key,
    upload_expires_at,
    upload_request_fingerprint,
    replaces_version_id
  )
  values (
    new_version_id,
    resolved_organization_id,
    resolved_workspace_id,
    target_node.id,
    next_version_number,
    resolved_organization_id::text
      || '/' || resolved_workspace_id::text
      || '/' || new_version_id::text,
    'pending',
    p_byte_size,
    normalized_mime_type,
    normalized_extension,
    caller_id,
    p_idempotency_key,
    now() + interval '24 hours',
    request_fingerprint,
    previous_version_id
  )
  returning * into existing_version;

  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    node_id,
    version_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    resolved_organization_id,
    resolved_workspace_id,
    target_node.id,
    existing_version.id,
    caller_id,
    'file_upload_initiated',
    jsonb_build_object(
      'version_number', existing_version.version_number,
      'replacement', p_existing_node_id is not null,
      'byte_size', p_byte_size
    )
  );

  return query
  select
    target_node.id,
    existing_version.id,
    existing_version.version_number,
    existing_version.storage_key,
    existing_version.upload_state,
    existing_version.upload_expires_at,
    target_node.display_name,
    existing_version.claimed_mime_type,
    existing_version.byte_size;
end;
$$;

revoke all on function public.initiate_document_upload(
  uuid, uuid, uuid, text, text, text, bigint, uuid, uuid
) from public, anon;
grant execute on function public.initiate_document_upload(
  uuid, uuid, uuid, text, text, text, bigint, uuid, uuid
) to authenticated;

create or replace function public.complete_document_upload(
  p_version_id uuid,
  p_actor_user_id uuid
)
returns table (
  node_id uuid,
  version_id uuid,
  version_number integer,
  display_name text,
  byte_size bigint,
  verified_mime_type text,
  activated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  version_row public.document_versions%rowtype;
  node_row public.document_nodes%rowtype;
  object_row storage.objects%rowtype;
  actual_size bigint;
  actual_mime_type text;
  actor_can_write boolean;
  activation_time timestamptz := now();
begin
  if p_actor_user_id is null then
    raise exception 'Authenticated actor is required.';
  end if;

  select version.*
  into version_row
  from public.document_versions version
  where version.id = p_version_id
  for update;

  if not found or version_row.uploaded_by <> p_actor_user_id then
    raise exception 'Pending upload not found or access denied.';
  end if;

  select exists (
    select 1
    from public.organization_members member
    join public.role_permissions role_permission
     on role_permission.role = member.role
     and role_permission.permission_key = 'files.write'
     and role_permission.is_allowed
    where member.organization_id = version_row.organization_id
      and member.user_id = p_actor_user_id
  )
  into actor_can_write;

  if not actor_can_write then
    raise exception 'Pending upload not found or access denied.';
  end if;

  select node.*
  into node_row
  from public.document_nodes node
  where node.organization_id = version_row.organization_id
    and node.workspace_id = version_row.workspace_id
    and node.id = version_row.node_id
  for update;

  if not found
    or node_row.kind <> 'file'
    or node_row.deleted_at is not null
    or node_row.lifecycle_state not in ('pending', 'active')
  then
    raise exception 'Document file is not available for activation.';
  end if;

  if version_row.upload_state = 'active' then
    if node_row.current_version_id <> version_row.id then
      raise exception 'Activated version is no longer current.';
    end if;

    return query
    select
      node_row.id,
      version_row.id,
      version_row.version_number,
      node_row.display_name,
      version_row.byte_size,
      version_row.verified_mime_type,
      version_row.activated_at;
    return;
  end if;

  if version_row.upload_state <> 'pending' then
    raise exception 'Upload is not pending.';
  end if;

  if version_row.upload_expires_at <= now() then
    raise exception 'Pending upload has expired.';
  end if;

  select object.*
  into object_row
  from storage.objects object
  where object.bucket_id = 'organization-documents'
    and object.name = version_row.storage_key;

  if not found then
    raise exception 'Expected Storage object was not found.';
  end if;

  actual_size := nullif(object_row.metadata ->> 'size', '')::bigint;
  actual_mime_type := lower(
    btrim(
      coalesce(
        object_row.metadata ->> 'mimetype',
        object_row.metadata ->> 'contentType',
        ''
      )
    )
  );

  if actual_size is null or actual_size <> version_row.byte_size then
    raise exception 'Stored object size does not match the reservation.';
  end if;

  if actual_mime_type = ''
    or actual_mime_type <> lower(version_row.claimed_mime_type)
    or not public.document_upload_mime_extension_allowed(
      actual_mime_type,
      version_row.file_extension
    )
  then
    raise exception 'Stored object MIME type does not match the reservation.';
  end if;

  update public.document_versions version
  set
    upload_state = 'active',
    verified_mime_type = actual_mime_type,
    storage_object_id = object_row.id,
    storage_etag = nullif(
      coalesce(
        object_row.metadata ->> 'eTag',
        object_row.metadata ->> 'etag',
        ''
      ),
      ''
    ),
    uploaded_at = activation_time,
    verified_at = activation_time,
    activated_at = activation_time,
    failure_code = null,
    failure_message = null
  where version.id = version_row.id
  returning * into version_row;

  update public.document_nodes node
  set
    lifecycle_state = 'active',
    current_version_id = version_row.id,
    updated_by = p_actor_user_id,
    updated_at = activation_time
  where node.id = node_row.id
  returning * into node_row;

  insert into public.document_activity_events (
    organization_id,
    workspace_id,
    node_id,
    version_id,
    actor_user_id,
    event_type,
    metadata
  )
  values
    (
      version_row.organization_id,
      version_row.workspace_id,
      version_row.node_id,
      version_row.id,
      p_actor_user_id,
      'file_uploaded',
      jsonb_build_object(
        'version_number', version_row.version_number,
        'byte_size', version_row.byte_size
      )
    ),
    (
      version_row.organization_id,
      version_row.workspace_id,
      version_row.node_id,
      version_row.id,
      p_actor_user_id,
      'version_activated',
      jsonb_build_object(
        'version_number', version_row.version_number,
        'replacement', version_row.replaces_version_id is not null
      )
    );

  return query
  select
    node_row.id,
    version_row.id,
    version_row.version_number,
    node_row.display_name,
    version_row.byte_size,
    version_row.verified_mime_type,
    version_row.activated_at;
end;
$$;

revoke all on function public.complete_document_upload(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.complete_document_upload(uuid, uuid)
to service_role;

create or replace function public.mark_document_upload_failed(
  p_version_id uuid,
  p_failure_code text,
  p_failure_message text,
  p_abandon boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  version_row public.document_versions%rowtype;
  next_state text := case when p_abandon then 'abandoned' else 'failed' end;
begin
  if caller_id is null then
    raise exception 'Unauthorized.';
  end if;

  select version.*
  into version_row
  from public.document_versions version
  where version.id = p_version_id
  for update;

  if not found
    or version_row.uploaded_by <> caller_id
    or not public.has_org_permission(version_row.organization_id, 'files.write')
  then
    raise exception 'Pending upload not found or access denied.';
  end if;

  if version_row.upload_state in ('failed', 'abandoned') then
    return version_row.upload_state;
  end if;

  if version_row.upload_state <> 'pending' then
    raise exception 'Only pending uploads can be failed or abandoned.';
  end if;

  update public.document_versions version
  set
    upload_state = next_state,
    failed_at = case when next_state = 'failed' then now() else null end,
    abandoned_at = case when next_state = 'abandoned' then now() else null end,
    failure_code = left(nullif(btrim(p_failure_code), ''), 100),
    failure_message = left(nullif(btrim(p_failure_message), ''), 1000)
  where version.id = version_row.id;

  if version_row.replaces_version_id is null then
    update public.document_nodes node
    set
      lifecycle_state = 'abandoned',
      updated_by = caller_id,
      updated_at = now()
    where node.id = version_row.node_id
      and node.current_version_id is null;
  end if;

  insert into public.document_storage_cleanup_jobs (
    organization_id,
    workspace_id,
    version_id,
    job_type,
    job_identity,
    storage_key
  )
  values (
    version_row.organization_id,
    version_row.workspace_id,
    version_row.id,
    'abandoned_upload',
    'document-version:' || version_row.id::text || ':abandoned-upload',
    version_row.storage_key
  )
  on conflict (job_identity) do nothing;

  return next_state;
end;
$$;

revoke all on function public.mark_document_upload_failed(uuid, text, text, boolean)
from public, anon;
grant execute on function public.mark_document_upload_failed(uuid, text, text, boolean)
to authenticated;

create or replace function public.abandon_expired_document_uploads(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  version_row public.document_versions%rowtype;
  abandoned_count integer := 0;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'Limit must be between 1 and 1000.';
  end if;

  for version_row in
    select version.*
    from public.document_versions version
    where version.upload_state = 'pending'
      and version.upload_expires_at <= now()
    order by version.upload_expires_at, version.id
    for update skip locked
    limit p_limit
  loop
    update public.document_versions version
    set
      upload_state = 'abandoned',
      abandoned_at = now(),
      failure_code = 'upload_expired',
      failure_message = 'Pending document upload expired before activation.'
    where version.id = version_row.id;

    if version_row.replaces_version_id is null then
      update public.document_nodes node
      set
        lifecycle_state = 'abandoned',
        updated_at = now()
      where node.id = version_row.node_id
        and node.current_version_id is null;
    end if;

    insert into public.document_storage_cleanup_jobs (
      organization_id,
      workspace_id,
      version_id,
      job_type,
      job_identity,
      storage_key
    )
    values (
      version_row.organization_id,
      version_row.workspace_id,
      version_row.id,
      'abandoned_upload',
      'document-version:' || version_row.id::text || ':abandoned-upload',
      version_row.storage_key
    )
    on conflict (job_identity) do nothing;

    abandoned_count := abandoned_count + 1;
  end loop;

  return abandoned_count;
end;
$$;

revoke all on function public.abandon_expired_document_uploads(integer)
from public, anon, authenticated;
grant execute on function public.abandon_expired_document_uploads(integer)
to service_role;

create or replace function public.resolve_document_download(
  p_node_id uuid,
  p_version_id uuid default null
)
returns table (
  node_id uuid,
  version_id uuid,
  storage_key text,
  display_name text,
  verified_mime_type text,
  byte_size bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  node_row public.document_nodes%rowtype;
  resolved_version_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized.';
  end if;

  select node.*
  into node_row
  from public.document_nodes node
  where node.id = p_node_id;

  if not found
    or node_row.kind <> 'file'
    or node_row.lifecycle_state <> 'active'
    or node_row.deleted_at is not null
    or node_row.current_version_id is null
    or not public.can_access_document_workspace(
      node_row.workspace_id,
      'files.view'
    )
  then
    raise exception 'Document file not found or access denied.';
  end if;

  resolved_version_id := coalesce(p_version_id, node_row.current_version_id);

  return query
  select
    node_row.id,
    version.id,
    version.storage_key,
    node_row.display_name,
    version.verified_mime_type,
    version.byte_size
  from public.document_versions version
  where version.organization_id = node_row.organization_id
    and version.workspace_id = node_row.workspace_id
    and version.node_id = node_row.id
    and version.id = resolved_version_id
    and version.id = node_row.current_version_id
    and version.upload_state = 'active'
    and version.storage_object_id is not null;

  if not found then
    raise exception 'Active document version not found or access denied.';
  end if;
end;
$$;

revoke all on function public.resolve_document_download(uuid, uuid)
from public, anon;
grant execute on function public.resolve_document_download(uuid, uuid)
to authenticated;
