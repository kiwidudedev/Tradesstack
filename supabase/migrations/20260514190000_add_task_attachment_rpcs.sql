begin;

create or replace function public._task_attachment_to_json(p_attachment public.task_attachments)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_attachment.id,
    'organizationId', p_attachment.organization_id,
    'taskId', p_attachment.task_id,
    'projectId', p_attachment.project_id,
    'commentId', p_attachment.comment_id,
    'uploadedBy', p_attachment.uploaded_by,
    'fileName', p_attachment.file_name,
    'originalFileName', p_attachment.original_file_name,
    'fileType', p_attachment.file_type,
    'mimeType', p_attachment.mime_type,
    'storageBucket', p_attachment.storage_bucket,
    'storagePath', p_attachment.storage_path,
    'fileSize', p_attachment.file_size,
    'attachmentType', p_attachment.attachment_type,
    'metadata', p_attachment.metadata,
    'createdAt', p_attachment.created_at,
    'deletedAt', p_attachment.deleted_at,
    'deletedBy', p_attachment.deleted_by
  );
$$;

revoke all on function public._task_attachment_to_json(public.task_attachments) from public, anon, authenticated;

create or replace function public.create_task_attachment(
  p_task_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  task_row public.project_job_todos%rowtype;
  attachment_row public.task_attachments%rowtype;
  requested_comment_id uuid;
  requested_storage_bucket text;
  requested_storage_path text;
  requested_attachment_type text;
begin
  task_row := public._task_assert_task_access(p_task_id);

  requested_storage_bucket := coalesce(nullif(btrim(p_input->>'storageBucket'), ''), 'task-attachments');
  if requested_storage_bucket <> 'task-attachments' then
    raise exception 'Invalid task attachment storage bucket';
  end if;

  requested_storage_path := nullif(btrim(coalesce(p_input->>'storagePath', '')), '');
  if requested_storage_path is null then
    raise exception 'storagePath is required';
  end if;

  if not public.can_access_task_attachment_storage_object(requested_storage_path) then
    raise exception 'Invalid or inaccessible task attachment storage path';
  end if;

  if split_part(requested_storage_path, '/', 1) <> task_row.organization_id::text then
    raise exception 'Storage path organization does not match task';
  end if;

  if split_part(requested_storage_path, '/', 2) <> 'unscoped'
     and split_part(requested_storage_path, '/', 2) <> task_row.project_id::text then
    raise exception 'Storage path project does not match task';
  end if;

  if split_part(requested_storage_path, '/', 4) <> task_row.id::text then
    raise exception 'Storage path task does not match task';
  end if;

  requested_comment_id := nullif(p_input->>'commentId', '')::uuid;
  if requested_comment_id is not null and not exists (
    select 1
    from public.task_comments c
    where c.id = requested_comment_id
      and c.organization_id = task_row.organization_id
      and c.task_id = task_row.id
      and c.deleted_at is null
  ) then
    raise exception 'Task comment not found';
  end if;

  requested_attachment_type := coalesce(nullif(btrim(p_input->>'attachmentType'), ''), 'other');

  insert into public.task_attachments (
    organization_id,
    task_id,
    project_id,
    comment_id,
    uploaded_by,
    file_name,
    original_file_name,
    file_type,
    mime_type,
    storage_bucket,
    storage_path,
    file_size,
    attachment_type,
    metadata
  )
  values (
    task_row.organization_id,
    task_row.id,
    task_row.project_id,
    requested_comment_id,
    actor_user_id,
    nullif(btrim(coalesce(p_input->>'fileName', '')), ''),
    nullif(btrim(coalesce(p_input->>'originalFileName', '')), ''),
    nullif(btrim(coalesce(p_input->>'fileType', '')), ''),
    nullif(btrim(coalesce(p_input->>'mimeType', '')), ''),
    requested_storage_bucket,
    requested_storage_path,
    nullif(p_input->>'fileSize', '')::bigint,
    requested_attachment_type,
    coalesce(p_input->'metadata', '{}'::jsonb)
  )
  returning * into attachment_row;

  perform public._write_task_activity(
    task_row.organization_id,
    task_row.id,
    task_row.project_id,
    actor_user_id,
    'attachment_added',
    null,
    null,
    to_jsonb(attachment_row.id),
    jsonb_build_object(
      'attachmentId', attachment_row.id,
      'fileName', attachment_row.file_name,
      'storagePath', attachment_row.storage_path
    )
  );

  return public._task_attachment_to_json(attachment_row);
end;
$$;

create or replace function public.delete_task_attachment(p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  old_attachment public.task_attachments%rowtype;
  updated_attachment public.task_attachments%rowtype;
  task_row public.project_job_todos%rowtype;
begin
  select *
  into old_attachment
  from public.task_attachments a
  where a.id = p_attachment_id;

  if old_attachment.id is null then
    raise exception 'Task attachment not found';
  end if;

  task_row := public._task_assert_task_access(old_attachment.task_id);

  update public.task_attachments a
  set
    deleted_at = coalesce(a.deleted_at, now()),
    deleted_by = coalesce(a.deleted_by, actor_user_id)
  where a.id = old_attachment.id
  returning * into updated_attachment;

  perform public._write_task_activity(
    task_row.organization_id,
    task_row.id,
    task_row.project_id,
    actor_user_id,
    'attachment_removed',
    null,
    to_jsonb(old_attachment.id),
    null,
    jsonb_build_object(
      'attachmentId', old_attachment.id,
      'fileName', old_attachment.file_name,
      'storagePath', old_attachment.storage_path
    )
  );

  return public._task_attachment_to_json(updated_attachment);
end;
$$;

grant execute on function public.create_task_attachment(uuid, jsonb) to authenticated;
grant execute on function public.delete_task_attachment(uuid) to authenticated;

commit;
