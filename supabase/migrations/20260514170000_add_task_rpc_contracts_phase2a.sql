begin;

-- ============================================================
-- Phase 2A: Shared task RPC contracts + backend activity logging
-- No UI changes. No QA trigger changes. No old attachment changes.
-- ============================================================

revoke insert, update, delete on public.task_activity_log from authenticated;
revoke insert, update, delete on public.task_activity_log from anon;

-- ------------------------------------------------------------
-- Internal helpers
-- ------------------------------------------------------------

create or replace function public._task_current_organization_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select m.organization_id
  into resolved_organization_id
  from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;

  if resolved_organization_id is null then
    raise exception 'Organization membership is required';
  end if;

  return resolved_organization_id;
end;
$$;

create or replace function public._task_normalize_status(p_status text)
returns text
language plpgsql
immutable
as $$
begin
  if p_status is null or btrim(p_status) = '' then
    return 'To Do';
  end if;

  if p_status not in ('To Do', 'In Progress', 'Need Review', 'Done', 'Archived') then
    raise exception 'Unsupported task status: %', p_status;
  end if;

  return p_status;
end;
$$;

create or replace function public._task_normalize_priority(p_priority text)
returns text
language plpgsql
immutable
as $$
begin
  if p_priority is null or btrim(p_priority) = '' then
    return 'Medium';
  end if;

  if p_priority not in ('Low', 'Medium', 'High') then
    raise exception 'Unsupported task priority: %', p_priority;
  end if;

  return p_priority;
end;
$$;

create or replace function public._task_assert_project_access(
  p_project_id uuid,
  p_organization_id uuid default null
)
returns public.organization_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid := coalesce(p_organization_id, public._task_current_organization_id());
  project_row public.organization_projects%rowtype;
begin
  select *
  into project_row
  from public.organization_projects p
  where p.id = p_project_id
    and p.organization_id = resolved_organization_id;

  if project_row.id is null then
    raise exception 'Project not found for organization';
  end if;

  if not public.is_member_of_organization(project_row.organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  return project_row;
end;
$$;

create or replace function public._task_assert_task_access(p_task_id uuid)
returns public.project_job_todos
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.project_job_todos%rowtype;
begin
  select *
  into task_row
  from public.project_job_todos t
  where t.id = p_task_id;

  if task_row.id is null then
    raise exception 'Task not found';
  end if;

  if not public.is_member_of_organization(task_row.organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  return task_row;
end;
$$;

create or replace function public._task_validate_assignee(
  p_organization_id uuid,
  p_assigned_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_assigned_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_assigned_user_id
  ) then
    raise exception 'Assigned user does not belong to this organization';
  end if;
end;
$$;

create or replace function public._write_task_activity(
  p_organization_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_field_name text default null,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if p_event_type is null or btrim(p_event_type) = '' then
    raise exception 'Task activity event type is required';
  end if;

  insert into public.task_activity_log (
    organization_id,
    task_id,
    project_id,
    actor_user_id,
    event_type,
    field_name,
    old_value,
    new_value,
    metadata
  )
  values (
    p_organization_id,
    p_task_id,
    p_project_id,
    p_actor_user_id,
    p_event_type,
    p_field_name,
    p_old_value,
    p_new_value,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public._task_to_json(p_task public.project_job_todos)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  project_row public.organization_projects%rowtype;
  client_name text := null;
  assignee_name text := null;
  creator_name text := null;
begin
  select *
  into project_row
  from public.organization_projects p
  where p.id = p_task.project_id
    and p.organization_id = p_task.organization_id;

  if project_row.client_id is not null then
    select coalesce(nullif(c.company_name, ''), c.name)
    into client_name
    from public.organization_clients c
    where c.id = project_row.client_id
      and c.organization_id = p_task.organization_id;
  end if;

  if p_task.assigned_user_id is not null then
    select m.display_name
    into assignee_name
    from public.organization_members m
    where m.organization_id = p_task.organization_id
      and m.user_id = p_task.assigned_user_id;
  end if;

  select m.display_name
  into creator_name
  from public.organization_members m
  where m.organization_id = p_task.organization_id
    and m.user_id = p_task.created_by;

  return jsonb_build_object(
    'id', p_task.id,
    'organizationId', p_task.organization_id,
    'projectId', p_task.project_id,
    'opportunityId', p_task.opportunity_id,
    'title', p_task.title,
    'description', p_task.description,
    'taskType', p_task.task_type,
    'trade', p_task.trade,
    'status', p_task.status,
    'priority', p_task.priority,
    'dueDate', p_task.due_date,
    'dueAt', p_task.due_at,
    'assignedUserId', p_task.assigned_user_id,
    'createdBy', p_task.created_by,
    'createdAt', p_task.created_at,
    'updatedBy', p_task.updated_by,
    'updatedAt', p_task.updated_at,
    'completedBy', p_task.completed_by,
    'completedAt', p_task.completed_at,
    'archivedBy', p_task.archived_by,
    'archivedAt', p_task.archived_at,
    'archiveReason', p_task.archive_reason,
    'deletedBy', p_task.deleted_by,
    'deletedAt', p_task.deleted_at,
    'deleteReason', p_task.delete_reason,
    'sourceType', p_task.source_type,
    'sourceId', p_task.source_id,
    'linkedIssueId', p_task.linked_issue_id,
    'linkedInspectionId', p_task.linked_inspection_id,
    'linkedInspectionItemId', p_task.linked_inspection_item_id,
    'linkedVariationId', p_task.linked_variation_id,
    'linkedPurchaseOrderId', p_task.linked_purchase_order_id,
    'linkedQuoteId', p_task.linked_quote_id,
    'linkedClientId', p_task.linked_client_id,
    'metadata', coalesce(p_task.metadata, '{}'::jsonb),
    'assignee', case
      when p_task.assigned_user_id is null then null
      else jsonb_build_object('userId', p_task.assigned_user_id, 'displayName', coalesce(assignee_name, 'Team Member'))
    end,
    'creator', jsonb_build_object('userId', p_task.created_by, 'displayName', coalesce(creator_name, 'Team Member')),
    'projectContext', jsonb_build_object(
      'projectName', project_row.name,
      'projectNumber', project_row.project_code,
      'clientName', client_name,
      'siteAddress', project_row.location,
      'projectManager', null,
      'projectStatus', project_row.stage,
      'startDate', null,
      'endDate', null
    )
  );
end;
$$;

revoke all on function public._task_current_organization_id() from public, anon, authenticated;
revoke all on function public._task_normalize_status(text) from public, anon, authenticated;
revoke all on function public._task_normalize_priority(text) from public, anon, authenticated;
revoke all on function public._task_assert_project_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public._task_assert_task_access(uuid) from public, anon, authenticated;
revoke all on function public._task_validate_assignee(uuid, uuid) from public, anon, authenticated;
revoke all on function public._write_task_activity(uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._task_to_json(public.project_job_todos) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Read RPCs
-- ------------------------------------------------------------

create or replace function public.list_tasks(
  p_project_id uuid default null,
  p_opportunity_id uuid default null,
  p_statuses text[] default null,
  p_include_archived boolean default false,
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organization_id uuid := public._task_current_organization_id();
begin
  return (
    select coalesce(jsonb_agg(public._task_to_json(t) order by t.due_at asc nulls last, t.due_date asc nulls last, t.updated_at desc), '[]'::jsonb)
    from public.project_job_todos t
    where t.organization_id = resolved_organization_id
      and (p_project_id is null or t.project_id = p_project_id)
      and (p_opportunity_id is null or t.opportunity_id = p_opportunity_id)
      and (p_statuses is null or t.status = any(p_statuses))
      and (p_include_deleted is true or t.deleted_at is null)
      and (
        p_include_archived is true
        or (
          t.archived_at is null
          and t.status <> 'Archived'
        )
      )
  );
end;
$$;

create or replace function public.get_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.project_job_todos%rowtype;
begin
  task_row := public._task_assert_task_access(p_task_id);
  return public._task_to_json(task_row);
end;
$$;

create or replace function public.list_task_activity(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.project_job_todos%rowtype;
begin
  task_row := public._task_assert_task_access(p_task_id);

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'organizationId', a.organization_id,
          'taskId', a.task_id,
          'projectId', a.project_id,
          'actorUserId', a.actor_user_id,
          'eventType', a.event_type,
          'fieldName', a.field_name,
          'oldValue', a.old_value,
          'newValue', a.new_value,
          'metadata', a.metadata,
          'createdAt', a.created_at
        )
        order by a.created_at desc
      ),
      '[]'::jsonb
    )
    from public.task_activity_log a
    where a.organization_id = task_row.organization_id
      and a.task_id = task_row.id
  );
end;
$$;

create or replace function public.list_task_comments(
  p_task_id uuid,
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.project_job_todos%rowtype;
begin
  task_row := public._task_assert_task_access(p_task_id);

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'organizationId', c.organization_id,
          'taskId', c.task_id,
          'projectId', c.project_id,
          'userId', c.user_id,
          'comment', c.comment,
          'metadata', c.metadata,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'deletedAt', c.deleted_at,
          'deletedBy', c.deleted_by
        )
        order by c.created_at asc
      ),
      '[]'::jsonb
    )
    from public.task_comments c
    where c.organization_id = task_row.organization_id
      and c.task_id = task_row.id
      and (p_include_deleted is true or c.deleted_at is null)
  );
end;
$$;

create or replace function public.list_task_attachments(
  p_task_id uuid,
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.project_job_todos%rowtype;
begin
  task_row := public._task_assert_task_access(p_task_id);

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'organizationId', a.organization_id,
          'taskId', a.task_id,
          'projectId', a.project_id,
          'commentId', a.comment_id,
          'uploadedBy', a.uploaded_by,
          'fileName', a.file_name,
          'originalFileName', a.original_file_name,
          'fileType', a.file_type,
          'mimeType', a.mime_type,
          'storageBucket', a.storage_bucket,
          'storagePath', a.storage_path,
          'fileSize', a.file_size,
          'attachmentType', a.attachment_type,
          'metadata', a.metadata,
          'createdAt', a.created_at,
          'deletedAt', a.deleted_at,
          'deletedBy', a.deleted_by
        )
        order by a.created_at desc
      ),
      '[]'::jsonb
    )
    from public.task_attachments a
    where a.organization_id = task_row.organization_id
      and a.task_id = task_row.id
      and (p_include_deleted is true or a.deleted_at is null)
  );
end;
$$;

-- ------------------------------------------------------------
-- Mutation RPCs
-- ------------------------------------------------------------

create or replace function public.create_task(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  resolved_organization_id uuid := public._task_current_organization_id();
  project_row public.organization_projects%rowtype;
  inserted_row public.project_job_todos%rowtype;
  requested_project_id uuid;
  requested_opportunity_id uuid;
  requested_assigned_user_id uuid;
  requested_status text;
  requested_priority text;
begin
  requested_project_id := nullif(p_input->>'projectId', '')::uuid;
  if requested_project_id is null then
    raise exception 'projectId is required';
  end if;

  project_row := public._task_assert_project_access(requested_project_id, resolved_organization_id);

  requested_opportunity_id := nullif(p_input->>'opportunityId', '')::uuid;
  if requested_opportunity_id is not null and not exists (
    select 1
    from public.organization_opportunities o
    where o.id = requested_opportunity_id
      and o.organization_id = resolved_organization_id
      and o.workspace_project_id = requested_project_id
  ) then
    raise exception 'Opportunity does not belong to this project';
  end if;

  requested_assigned_user_id := nullif(p_input->>'assignedUserId', '')::uuid;
  perform public._task_validate_assignee(resolved_organization_id, requested_assigned_user_id);

  requested_status := public._task_normalize_status(p_input->>'status');
  requested_priority := public._task_normalize_priority(p_input->>'priority');

  insert into public.project_job_todos (
    organization_id,
    project_id,
    opportunity_id,
    created_by,
    updated_by,
    title,
    description,
    due_date,
    due_at,
    assigned_user_id,
    trade,
    priority,
    status,
    is_completed,
    completed_by,
    completed_at,
    source_type,
    source_id,
    linked_issue_id,
    linked_inspection_id,
    linked_inspection_item_id,
    linked_variation_id,
    linked_purchase_order_id,
    linked_quote_id,
    linked_client_id,
    task_type,
    metadata
  )
  values (
    resolved_organization_id,
    requested_project_id,
    requested_opportunity_id,
    actor_user_id,
    actor_user_id,
    nullif(btrim(coalesce(p_input->>'title', '')), ''),
    coalesce(p_input->>'description', ''),
    nullif(p_input->>'dueDate', '')::date,
    nullif(p_input->>'dueAt', '')::timestamptz,
    requested_assigned_user_id,
    coalesce(p_input->>'trade', ''),
    requested_priority,
    requested_status,
    requested_status = 'Done',
    case when requested_status = 'Done' then actor_user_id else null end,
    case when requested_status = 'Done' then now() else null end,
    nullif(p_input->>'sourceType', ''),
    nullif(p_input->>'sourceId', '')::uuid,
    nullif(p_input->>'linkedIssueId', '')::uuid,
    nullif(p_input->>'linkedInspectionId', '')::uuid,
    nullif(p_input->>'linkedInspectionItemId', '')::uuid,
    nullif(p_input->>'linkedVariationId', '')::uuid,
    nullif(p_input->>'linkedPurchaseOrderId', '')::uuid,
    nullif(p_input->>'linkedQuoteId', '')::uuid,
    nullif(p_input->>'linkedClientId', '')::uuid,
    nullif(p_input->>'taskType', ''),
    coalesce(p_input->'metadata', '{}'::jsonb)
  )
  returning * into inserted_row;

  perform public._write_task_activity(
    inserted_row.organization_id,
    inserted_row.id,
    inserted_row.project_id,
    actor_user_id,
    'task_created',
    null,
    null,
    public._task_to_json(inserted_row),
    '{}'::jsonb
  );

  if inserted_row.assigned_user_id is not null then
    perform public._write_task_activity(
      inserted_row.organization_id,
      inserted_row.id,
      inserted_row.project_id,
      actor_user_id,
      'assigned',
      'assigned_user_id',
      null,
      to_jsonb(inserted_row.assigned_user_id),
      '{}'::jsonb
    );
  end if;

  return public._task_to_json(inserted_row);
end;
$$;

create or replace function public.update_task(
  p_task_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  old_row public.project_job_todos%rowtype;
  updated_row public.project_job_todos%rowtype;
  next_assigned_user_id uuid;
  next_status text;
  next_priority text;
begin
  old_row := public._task_assert_task_access(p_task_id);

  next_assigned_user_id := case
    when p_patch ? 'assignedUserId' then nullif(p_patch->>'assignedUserId', '')::uuid
    else old_row.assigned_user_id
  end;

  perform public._task_validate_assignee(old_row.organization_id, next_assigned_user_id);

  next_status := case
    when p_patch ? 'status' then public._task_normalize_status(p_patch->>'status')
    else old_row.status
  end;

  next_priority := case
    when p_patch ? 'priority' then public._task_normalize_priority(p_patch->>'priority')
    else old_row.priority
  end;

  update public.project_job_todos t
  set
    title = case when p_patch ? 'title' then nullif(btrim(coalesce(p_patch->>'title', '')), '') else t.title end,
    description = case when p_patch ? 'description' then coalesce(p_patch->>'description', '') else t.description end,
    due_date = case when p_patch ? 'dueDate' then nullif(p_patch->>'dueDate', '')::date else t.due_date end,
    due_at = case when p_patch ? 'dueAt' then nullif(p_patch->>'dueAt', '')::timestamptz else t.due_at end,
    assigned_user_id = next_assigned_user_id,
    trade = case when p_patch ? 'trade' then coalesce(p_patch->>'trade', '') else t.trade end,
    priority = next_priority,
    status = next_status,
    is_completed = next_status = 'Done',
    completed_by = case
      when next_status = 'Done' and t.completed_by is null then actor_user_id
      when next_status <> 'Done' then null
      else t.completed_by
    end,
    completed_at = case
      when next_status = 'Done' then coalesce(t.completed_at, now())
      else null
    end,
    linked_issue_id = case when p_patch ? 'linkedIssueId' then nullif(p_patch->>'linkedIssueId', '')::uuid else t.linked_issue_id end,
    linked_inspection_id = case when p_patch ? 'linkedInspectionId' then nullif(p_patch->>'linkedInspectionId', '')::uuid else t.linked_inspection_id end,
    linked_inspection_item_id = case when p_patch ? 'linkedInspectionItemId' then nullif(p_patch->>'linkedInspectionItemId', '')::uuid else t.linked_inspection_item_id end,
    linked_variation_id = case when p_patch ? 'linkedVariationId' then nullif(p_patch->>'linkedVariationId', '')::uuid else t.linked_variation_id end,
    linked_purchase_order_id = case when p_patch ? 'linkedPurchaseOrderId' then nullif(p_patch->>'linkedPurchaseOrderId', '')::uuid else t.linked_purchase_order_id end,
    linked_quote_id = case when p_patch ? 'linkedQuoteId' then nullif(p_patch->>'linkedQuoteId', '')::uuid else t.linked_quote_id end,
    linked_client_id = case when p_patch ? 'linkedClientId' then nullif(p_patch->>'linkedClientId', '')::uuid else t.linked_client_id end,
    task_type = case when p_patch ? 'taskType' then nullif(p_patch->>'taskType', '') else t.task_type end,
    metadata = case when p_patch ? 'metadata' then coalesce(p_patch->'metadata', '{}'::jsonb) else t.metadata end,
    updated_by = actor_user_id
  where t.id = p_task_id
    and t.organization_id = old_row.organization_id
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'Task not found';
  end if;

  if old_row.title is distinct from updated_row.title then
    perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'title_changed', 'title', to_jsonb(old_row.title), to_jsonb(updated_row.title), '{}'::jsonb);
  end if;

  if old_row.description is distinct from updated_row.description then
    perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'description_changed', 'description', to_jsonb(old_row.description), to_jsonb(updated_row.description), '{}'::jsonb);
  end if;

  if old_row.due_date is distinct from updated_row.due_date then
    perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'due_date_changed', 'due_date', to_jsonb(old_row.due_date), to_jsonb(updated_row.due_date), '{}'::jsonb);
  end if;

  if old_row.due_at is distinct from updated_row.due_at then
    perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'due_time_changed', 'due_at', to_jsonb(old_row.due_at), to_jsonb(updated_row.due_at), '{}'::jsonb);
  end if;

  if old_row.assigned_user_id is distinct from updated_row.assigned_user_id then
    perform public._write_task_activity(
      updated_row.organization_id,
      updated_row.id,
      updated_row.project_id,
      actor_user_id,
      case
        when old_row.assigned_user_id is null and updated_row.assigned_user_id is not null then 'assigned'
        when old_row.assigned_user_id is not null and updated_row.assigned_user_id is null then 'unassigned'
        else 'reassigned'
      end,
      'assigned_user_id',
      to_jsonb(old_row.assigned_user_id),
      to_jsonb(updated_row.assigned_user_id),
      '{}'::jsonb
    );
  end if;

  if old_row.status is distinct from updated_row.status then
    perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'status_changed', 'status', to_jsonb(old_row.status), to_jsonb(updated_row.status), '{}'::jsonb);

    if updated_row.status = 'Done' then
      perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'completed', 'status', to_jsonb(old_row.status), to_jsonb(updated_row.status), '{}'::jsonb);
    elsif old_row.status = 'Done' and updated_row.status <> 'Done' then
      perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'reopened', 'status', to_jsonb(old_row.status), to_jsonb(updated_row.status), '{}'::jsonb);
    end if;
  end if;

  if old_row.priority is distinct from updated_row.priority then
    perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'priority_changed', 'priority', to_jsonb(old_row.priority), to_jsonb(updated_row.priority), '{}'::jsonb);
  end if;

  return public._task_to_json(updated_row);
end;
$$;

create or replace function public.assign_task(
  p_task_id uuid,
  p_assigned_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.update_task(p_task_id, jsonb_build_object('assignedUserId', p_assigned_user_id));
end;
$$;

create or replace function public.complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.update_task(p_task_id, jsonb_build_object('status', 'Done'));
end;
$$;

create or replace function public.reopen_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.update_task(p_task_id, jsonb_build_object('status', 'To Do'));
end;
$$;

create or replace function public.archive_task(
  p_task_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  old_row public.project_job_todos%rowtype;
  updated_row public.project_job_todos%rowtype;
begin
  old_row := public._task_assert_task_access(p_task_id);

  update public.project_job_todos t
  set
    status = 'Archived',
    archived_at = now(),
    archived_by = actor_user_id,
    archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    updated_by = actor_user_id
  where t.id = p_task_id
    and t.organization_id = old_row.organization_id
  returning * into updated_row;

  perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'archived', 'archived_at', null, to_jsonb(updated_row.archived_at), jsonb_build_object('reason', updated_row.archive_reason));

  return public._task_to_json(updated_row);
end;
$$;

create or replace function public.soft_delete_task(
  p_task_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  old_row public.project_job_todos%rowtype;
  updated_row public.project_job_todos%rowtype;
begin
  old_row := public._task_assert_task_access(p_task_id);

  update public.project_job_todos t
  set
    deleted_at = now(),
    deleted_by = actor_user_id,
    delete_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    updated_by = actor_user_id
  where t.id = p_task_id
    and t.organization_id = old_row.organization_id
  returning * into updated_row;

  perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'deleted', 'deleted_at', null, to_jsonb(updated_row.deleted_at), jsonb_build_object('reason', updated_row.delete_reason));

  return public._task_to_json(updated_row);
end;
$$;

create or replace function public.restore_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  old_row public.project_job_todos%rowtype;
  updated_row public.project_job_todos%rowtype;
begin
  old_row := public._task_assert_task_access(p_task_id);

  update public.project_job_todos t
  set
    status = case when t.status = 'Archived' then 'To Do' else t.status end,
    archived_at = null,
    archived_by = null,
    archive_reason = null,
    deleted_at = null,
    deleted_by = null,
    delete_reason = null,
    updated_by = actor_user_id
  where t.id = p_task_id
    and t.organization_id = old_row.organization_id
  returning * into updated_row;

  perform public._write_task_activity(updated_row.organization_id, updated_row.id, updated_row.project_id, actor_user_id, 'restored', null, public._task_to_json(old_row), public._task_to_json(updated_row), '{}'::jsonb);

  return public._task_to_json(updated_row);
end;
$$;

create or replace function public.create_task_comment(
  p_task_id uuid,
  p_comment text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  task_row public.project_job_todos%rowtype;
  comment_row public.task_comments%rowtype;
begin
  task_row := public._task_assert_task_access(p_task_id);

  insert into public.task_comments (
    organization_id,
    task_id,
    project_id,
    user_id,
    comment,
    metadata
  )
  values (
    task_row.organization_id,
    task_row.id,
    task_row.project_id,
    actor_user_id,
    nullif(btrim(coalesce(p_comment, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into comment_row;

  perform public._write_task_activity(task_row.organization_id, task_row.id, task_row.project_id, actor_user_id, 'comment_added', null, null, to_jsonb(comment_row.id), jsonb_build_object('commentId', comment_row.id));

  return jsonb_build_object(
    'id', comment_row.id,
    'organizationId', comment_row.organization_id,
    'taskId', comment_row.task_id,
    'projectId', comment_row.project_id,
    'userId', comment_row.user_id,
    'comment', comment_row.comment,
    'metadata', comment_row.metadata,
    'createdAt', comment_row.created_at,
    'updatedAt', comment_row.updated_at,
    'deletedAt', comment_row.deleted_at,
    'deletedBy', comment_row.deleted_by
  );
end;
$$;

create or replace function public.update_task_comment(
  p_comment_id uuid,
  p_comment text,
  p_metadata jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  old_comment public.task_comments%rowtype;
  updated_comment public.task_comments%rowtype;
begin
  select *
  into old_comment
  from public.task_comments c
  where c.id = p_comment_id;

  if old_comment.id is null then
    raise exception 'Comment not found';
  end if;

  perform public._task_assert_task_access(old_comment.task_id);

  if old_comment.user_id <> actor_user_id then
    raise exception 'Only the comment author can update this comment';
  end if;

  update public.task_comments c
  set
    comment = nullif(btrim(coalesce(p_comment, '')), ''),
    metadata = coalesce(p_metadata, c.metadata)
  where c.id = p_comment_id
  returning * into updated_comment;

  perform public._write_task_activity(updated_comment.organization_id, updated_comment.task_id, updated_comment.project_id, actor_user_id, 'comment_updated', 'comment', to_jsonb(old_comment.comment), to_jsonb(updated_comment.comment), jsonb_build_object('commentId', updated_comment.id));

  return jsonb_build_object(
    'id', updated_comment.id,
    'organizationId', updated_comment.organization_id,
    'taskId', updated_comment.task_id,
    'projectId', updated_comment.project_id,
    'userId', updated_comment.user_id,
    'comment', updated_comment.comment,
    'metadata', updated_comment.metadata,
    'createdAt', updated_comment.created_at,
    'updatedAt', updated_comment.updated_at,
    'deletedAt', updated_comment.deleted_at,
    'deletedBy', updated_comment.deleted_by
  );
end;
$$;

create or replace function public.delete_task_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  old_comment public.task_comments%rowtype;
  updated_comment public.task_comments%rowtype;
begin
  select *
  into old_comment
  from public.task_comments c
  where c.id = p_comment_id;

  if old_comment.id is null then
    raise exception 'Comment not found';
  end if;

  perform public._task_assert_task_access(old_comment.task_id);

  update public.task_comments c
  set
    deleted_at = now(),
    deleted_by = actor_user_id
  where c.id = p_comment_id
  returning * into updated_comment;

  perform public._write_task_activity(updated_comment.organization_id, updated_comment.task_id, updated_comment.project_id, actor_user_id, 'comment_deleted', null, to_jsonb(old_comment.id), null, jsonb_build_object('commentId', updated_comment.id));

  return jsonb_build_object(
    'id', updated_comment.id,
    'deletedAt', updated_comment.deleted_at,
    'deletedBy', updated_comment.deleted_by
  );
end;
$$;

create or replace function public.add_task_link(
  p_task_id uuid,
  p_linked_type text,
  p_linked_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  task_row public.project_job_todos%rowtype;
  link_row public.task_links%rowtype;
begin
  task_row := public._task_assert_task_access(p_task_id);

  insert into public.task_links (
    organization_id,
    task_id,
    linked_type,
    linked_id,
    created_by,
    metadata
  )
  values (
    task_row.organization_id,
    task_row.id,
    p_linked_type,
    p_linked_id,
    actor_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (task_id, linked_type, linked_id)
  do update set metadata = excluded.metadata
  returning * into link_row;

  perform public._write_task_activity(task_row.organization_id, task_row.id, task_row.project_id, actor_user_id, 'source_linked', 'task_links', null, to_jsonb(link_row.linked_id), jsonb_build_object('taskLinkId', link_row.id, 'linkedType', link_row.linked_type));

  return jsonb_build_object(
    'id', link_row.id,
    'organizationId', link_row.organization_id,
    'taskId', link_row.task_id,
    'linkedType', link_row.linked_type,
    'linkedId', link_row.linked_id,
    'createdBy', link_row.created_by,
    'createdAt', link_row.created_at,
    'metadata', link_row.metadata
  );
end;
$$;

create or replace function public.remove_task_link(p_task_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  link_row public.task_links%rowtype;
  task_row public.project_job_todos%rowtype;
begin
  select *
  into link_row
  from public.task_links l
  where l.id = p_task_link_id;

  if link_row.id is null then
    raise exception 'Task link not found';
  end if;

  task_row := public._task_assert_task_access(link_row.task_id);

  delete from public.task_links l
  where l.id = link_row.id;

  perform public._write_task_activity(task_row.organization_id, task_row.id, task_row.project_id, actor_user_id, 'source_unlinked', 'task_links', to_jsonb(link_row.linked_id), null, jsonb_build_object('taskLinkId', link_row.id, 'linkedType', link_row.linked_type));

  return jsonb_build_object('id', link_row.id, 'removed', true);
end;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------

grant execute on function public.list_tasks(uuid, uuid, text[], boolean, boolean) to authenticated;
grant execute on function public.get_task(uuid) to authenticated;
grant execute on function public.list_task_activity(uuid) to authenticated;
grant execute on function public.list_task_comments(uuid, boolean) to authenticated;
grant execute on function public.list_task_attachments(uuid, boolean) to authenticated;

grant execute on function public.create_task(jsonb) to authenticated;
grant execute on function public.update_task(uuid, jsonb) to authenticated;
grant execute on function public.assign_task(uuid, uuid) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.reopen_task(uuid) to authenticated;
grant execute on function public.archive_task(uuid, text) to authenticated;
grant execute on function public.soft_delete_task(uuid, text) to authenticated;
grant execute on function public.restore_task(uuid) to authenticated;
grant execute on function public.create_task_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.update_task_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_task_comment(uuid) to authenticated;
grant execute on function public.add_task_link(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.remove_task_link(uuid) to authenticated;

commit;
