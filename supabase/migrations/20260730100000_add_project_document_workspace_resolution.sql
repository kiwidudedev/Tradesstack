begin;

-- Return an already-linked Project workspace to viewers without requiring the
-- write permission needed to create a workspace or entity link.
create or replace function public.resolve_project_document_workspace(
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  project_row public.organization_projects%rowtype;
  workspace_id uuid;
begin
  if actor_user_id is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  select *
  into project_row
  from public.organization_projects project
  where project.id = p_project_id
  for key share;

  if not found
    or not public.has_org_permission(project_row.organization_id, 'files.view')
  then
    raise exception 'Project not found or access denied.'
      using errcode = '42501';
  end if;

  select entity_link.workspace_id
  into workspace_id
  from public.document_workspace_entities entity_link
  where entity_link.project_id = project_row.id;

  return workspace_id;
end;
$$;

revoke all on function public.resolve_project_document_workspace(uuid)
from public, anon;
grant execute on function public.resolve_project_document_workspace(uuid)
to authenticated;

-- Create a direct Project workspace, or reuse/link the source Opportunity
-- workspace for converted Projects. Existing links only require files.view;
-- any new workspace or entity link requires files.write.
create or replace function public.get_or_create_project_document_workspace(
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  project_row public.organization_projects%rowtype;
  workspace_row public.document_workspaces%rowtype;
  entity_link_row public.document_workspace_entities%rowtype;
  workspace_id uuid;
begin
  if actor_user_id is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  select *
  into project_row
  from public.organization_projects project
  where project.id = p_project_id
  for key share;

  if not found
    or not public.has_org_permission(project_row.organization_id, 'files.view')
  then
    raise exception 'Project not found or access denied.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('document-project:' || project_row.id::text, 0)
  );

  select entity_link.workspace_id
  into workspace_id
  from public.document_workspace_entities entity_link
  where entity_link.project_id = project_row.id;

  if found then
    return workspace_id;
  end if;

  if not public.has_org_permission(project_row.organization_id, 'files.write') then
    raise exception 'Project document workspace creation is not authorized.'
      using errcode = '42501';
  end if;

  if project_row.source_opportunity_id is not null then
    workspace_id := public.get_or_create_opportunity_document_workspace(
      project_row.source_opportunity_id
    );
    return public.link_project_to_opportunity_document_workspace(
      project_row.source_opportunity_id,
      project_row.id
    );
  end if;

  insert into public.document_workspaces (
    organization_id,
    created_by,
    updated_by
  )
  values (
    project_row.organization_id,
    actor_user_id,
    actor_user_id
  )
  returning * into workspace_row;

  insert into public.document_workspace_entities (
    organization_id,
    workspace_id,
    project_id,
    linked_by
  )
  values (
    project_row.organization_id,
    workspace_row.id,
    project_row.id,
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
      project_row.organization_id,
      workspace_row.id,
      entity_link_row.id,
      actor_user_id,
      'workspace_created',
      jsonb_build_object('source', 'project')
    ),
    (
      project_row.organization_id,
      workspace_row.id,
      entity_link_row.id,
      actor_user_id,
      'project_linked',
      jsonb_build_object('projectId', project_row.id)
    );

  return workspace_row.id;
end;
$$;

revoke all on function public.get_or_create_project_document_workspace(uuid)
from public, anon;
grant execute on function public.get_or_create_project_document_workspace(uuid)
to authenticated;

-- Conversion calls one RPC. Both nested functions retain their independent
-- authorization, organization, lineage, concurrency and conflict checks.
create or replace function public.ensure_opportunity_project_document_workspace(
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  workspace_id := public.get_or_create_opportunity_document_workspace(
    p_opportunity_id
  );

  return public.link_project_to_opportunity_document_workspace(
    p_opportunity_id,
    p_project_id
  );
end;
$$;

revoke all on function public.ensure_opportunity_project_document_workspace(uuid, uuid)
from public, anon;
grant execute on function public.ensure_opportunity_project_document_workspace(uuid, uuid)
to authenticated;

commit;
