-- Forward fix: R2 stores bytes outside Supabase Storage, but Supabase remains the
-- authorization, metadata and immutable document-version authority.
create or replace function public.complete_document_upload_r2(
  p_version_id uuid,
  p_actor_user_id uuid,
  p_actual_size bigint,
  p_actual_mime_type text,
  p_storage_etag text,
  p_storage_object_id uuid
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
  activation_time timestamptz := now();
begin
  select version.* into version_row
  from public.document_versions version
  where version.id = p_version_id
  for update;

  if p_actor_user_id is null or not found or version_row.uploaded_by <> p_actor_user_id then
    raise exception 'Pending upload not found or access denied.';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    join public.role_permissions role_permission
      on role_permission.role = member.role
      and role_permission.permission_key = 'files.write'
      and role_permission.is_allowed
    where member.organization_id = version_row.organization_id
      and member.user_id = p_actor_user_id
  ) then
    raise exception 'Pending upload not found or access denied.';
  end if;

  select node.* into node_row
  from public.document_nodes node
  where node.organization_id = version_row.organization_id
    and node.workspace_id = version_row.workspace_id
    and node.id = version_row.node_id
  for update;

  if not found or node_row.kind <> 'file' or node_row.deleted_at is not null
    or node_row.lifecycle_state not in ('pending', 'active') then
    raise exception 'Document file is not available for activation.';
  end if;

  if version_row.upload_state = 'active' then
    return query select node_row.id, version_row.id, version_row.version_number,
      node_row.display_name, version_row.byte_size, version_row.verified_mime_type,
      version_row.activated_at;
    return;
  end if;
  if version_row.upload_state <> 'pending' or version_row.upload_expires_at <= now()
    or p_actual_size is null or p_actual_size <> version_row.byte_size
    or lower(btrim(coalesce(p_actual_mime_type, ''))) <> lower(version_row.claimed_mime_type)
    or not public.document_upload_mime_extension_allowed(p_actual_mime_type, version_row.file_extension)
    or nullif(btrim(coalesce(p_storage_etag, '')), '') is null
    or p_storage_object_id is null then
    raise exception 'R2 object does not match the upload reservation.';
  end if;

  update public.document_versions version set
    upload_state = 'active', verified_mime_type = lower(btrim(p_actual_mime_type)),
    storage_object_id = p_storage_object_id, storage_etag = left(btrim(p_storage_etag), 512),
    uploaded_at = activation_time, verified_at = activation_time, activated_at = activation_time,
    failure_code = null, failure_message = null
  where version.id = version_row.id returning * into version_row;

  update public.document_nodes node set lifecycle_state = 'active', current_version_id = version_row.id,
    updated_by = p_actor_user_id, updated_at = activation_time where node.id = node_row.id returning * into node_row;

  insert into public.document_activity_events (organization_id, workspace_id, node_id, version_id, actor_user_id, event_type, metadata)
  values (version_row.organization_id, version_row.workspace_id, version_row.node_id, version_row.id, p_actor_user_id, 'file_uploaded', jsonb_build_object('version_number', version_row.version_number, 'byte_size', version_row.byte_size)),
    (version_row.organization_id, version_row.workspace_id, version_row.node_id, version_row.id, p_actor_user_id, 'version_activated', jsonb_build_object('version_number', version_row.version_number, 'replacement', version_row.replaces_version_id is not null));

  return query select node_row.id, version_row.id, version_row.version_number,
    node_row.display_name, version_row.byte_size, version_row.verified_mime_type,
    version_row.activated_at;
end;
$$;

revoke all on function public.complete_document_upload_r2(uuid, uuid, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function public.complete_document_upload_r2(uuid, uuid, bigint, text, text, uuid) to service_role;
