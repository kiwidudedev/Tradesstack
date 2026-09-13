begin;

-- Existing Opportunity links are readable with files.view. Creating the
-- workspace remains a files.write operation, matching Project resolution.
create or replace function public.resolve_opportunity_document_workspace(
  p_opportunity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity_row public.organization_opportunities%rowtype;
  workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
  for key share;

  if not found
    or not public.has_org_permission(opportunity_row.organization_id, 'files.view')
  then
    raise exception 'Opportunity not found or access denied.' using errcode = '42501';
  end if;

  select entity_link.workspace_id into workspace_id
  from public.document_workspace_entities entity_link
  where entity_link.opportunity_id = opportunity_row.id;

  return workspace_id;
end;
$$;

revoke all on function public.resolve_opportunity_document_workspace(uuid)
from public, anon;
grant execute on function public.resolve_opportunity_document_workspace(uuid)
to authenticated;

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
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into opportunity_row
  from public.organization_opportunities opportunity
  where opportunity.id = p_opportunity_id
  for key share;

  if not found
    or not public.has_org_permission(opportunity_row.organization_id, 'files.view')
  then
    raise exception 'Opportunity not found or access denied.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('document-opportunity:' || opportunity_row.id::text, 0)
  );

  select workspace.* into workspace_row
  from public.document_workspace_entities entity_link
  join public.document_workspaces workspace
    on workspace.organization_id = entity_link.organization_id
   and workspace.id = entity_link.workspace_id
  where entity_link.opportunity_id = opportunity_row.id;

  if found then
    return workspace_row.id;
  end if;

  if not public.has_org_permission(opportunity_row.organization_id, 'files.write') then
    raise exception 'Opportunity document workspace creation is not authorized.'
      using errcode = '42501';
  end if;

  insert into public.document_workspaces (organization_id, created_by, updated_by)
  values (opportunity_row.organization_id, actor_user_id, actor_user_id)
  returning * into workspace_row;

  insert into public.document_workspace_entities (
    organization_id, workspace_id, opportunity_id, linked_by
  ) values (
    opportunity_row.organization_id, workspace_row.id, opportunity_row.id, actor_user_id
  ) returning * into entity_link_row;

  insert into public.document_activity_events (
    organization_id, workspace_id, entity_link_id, actor_user_id, event_type, metadata
  ) values
    (
      opportunity_row.organization_id, workspace_row.id, entity_link_row.id,
      actor_user_id, 'workspace_created', jsonb_build_object('source', 'opportunity')
    ),
    (
      opportunity_row.organization_id, workspace_row.id, entity_link_row.id,
      actor_user_id, 'opportunity_linked',
      jsonb_build_object('opportunityId', opportunity_row.id)
    );

  return workspace_row.id;
end;
$$;

revoke all on function public.get_or_create_opportunity_document_workspace(uuid)
from public, anon;
grant execute on function public.get_or_create_opportunity_document_workspace(uuid)
to authenticated;

-- A compact capability contract lets server-rendered controls mirror the
-- permissions already enforced by mutation RPCs.
create or replace function public.get_document_workspace_capabilities(
  p_workspace_id uuid
)
returns table (
  can_view boolean,
  can_write boolean,
  can_delete boolean,
  can_purge boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  workspace_row public.document_workspaces%rowtype;
begin
  workspace_row := public.assert_document_workspace_permission(
    p_workspace_id,
    'files.view'
  );

  return query select
    true,
    public.has_org_permission(workspace_row.organization_id, 'files.write'),
    public.has_org_permission(workspace_row.organization_id, 'files.delete'),
    public.has_org_permission(workspace_row.organization_id, 'files.purge');
end;
$$;

revoke all on function public.get_document_workspace_capabilities(uuid)
from public, anon;
grant execute on function public.get_document_workspace_capabilities(uuid)
to authenticated;

-- Keep the prior implementations as private delegates, then wrap their full
-- result paths in the document continuity invariant. A failed or conflicting
-- link raises in the same transaction and rolls the conversion back.
alter function public.convert_accepted_opportunity_to_project(uuid, uuid, uuid)
rename to convert_accepted_opportunity_to_project_without_document_guard;

revoke all on function public.convert_accepted_opportunity_to_project_without_document_guard(
  uuid, uuid, uuid
) from public, anon, authenticated;

create function public.convert_accepted_opportunity_to_project(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid
)
returns table (
  project_id uuid,
  project_slug text,
  project_created boolean,
  storage_clone_required boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  conversion_result record;
begin
  select * into conversion_result
  from public.convert_accepted_opportunity_to_project_without_document_guard(
    p_organization_id,
    p_opportunity_id,
    p_accepted_quote_id
  );

  perform public.ensure_opportunity_project_document_workspace(
    p_opportunity_id,
    conversion_result.project_id
  );

  return query select
    conversion_result.project_id,
    conversion_result.project_slug,
    conversion_result.project_created,
    conversion_result.storage_clone_required;
end;
$$;

revoke all on function public.convert_accepted_opportunity_to_project(uuid, uuid, uuid)
from public, anon;
grant execute on function public.convert_accepted_opportunity_to_project(uuid, uuid, uuid)
to authenticated;

alter function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
rename to award_opportunity_by_lifecycle_v1_without_document_invariant;

revoke all on function public.award_opportunity_by_lifecycle_v1_without_document_invariant(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

create function public.award_opportunity_by_lifecycle_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_correlation_id text
)
returns table (
  project_id uuid,
  project_slug text,
  project_created boolean,
  storage_clone_required boolean,
  lifecycle_strategy text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  award_result record;
begin
  select * into award_result
  from public.award_opportunity_by_lifecycle_v1_without_document_invariant(
    p_organization_id,
    p_opportunity_id,
    p_accepted_quote_id,
    p_correlation_id
  );

  perform public.ensure_opportunity_project_document_workspace(
    p_opportunity_id,
    award_result.project_id
  );

  return query select
    award_result.project_id,
    award_result.project_slug,
    award_result.project_created,
    award_result.storage_clone_required,
    award_result.lifecycle_strategy;
end;
$$;

revoke all on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
from public, anon;
grant execute on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
to authenticated;

comment on function public.convert_accepted_opportunity_to_project(uuid, uuid, uuid)
is 'Legacy Opportunity conversion with transactional Opportunity/Project document workspace continuity on every return path.';

comment on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
is 'Lifecycle award orchestrator with transactional shared document workspace continuity for promotion and legacy strategies.';

commit;
