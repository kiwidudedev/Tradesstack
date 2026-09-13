-- Phase 3: bounded, organization-authorized reads for the Opportunity Files UI.

create or replace function public.list_document_workspace_nodes(
  p_workspace_id uuid,
  p_parent_node_id uuid default null,
  p_search text default null,
  p_file_type text default 'all',
  p_sort text default 'name',
  p_direction text default 'asc',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  node_id uuid,
  kind text,
  display_name text,
  parent_node_id uuid,
  owner_user_id uuid,
  owner_name text,
  created_at timestamptz,
  updated_at timestamptz,
  byte_size bigint,
  mime_type text,
  file_extension text,
  version_number integer,
  upload_state text,
  sha256_checksum text,
  parent_name text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  normalized_type text := lower(btrim(coalesce(p_file_type, 'all')));
  normalized_sort text := lower(btrim(coalesce(p_sort, 'name')));
  normalized_direction text := lower(btrim(coalesce(p_direction, 'asc')));
begin
  perform public.assert_document_workspace_permission(p_workspace_id, 'files.view');

  if p_limit < 1 or p_limit > 200 or p_offset < 0 then
    raise exception 'Invalid document listing page.';
  end if;
  if normalized_type not in (
    'all', 'folders', 'pdf', 'images', 'documents', 'spreadsheets',
    'presentations', 'text', 'other'
  ) then
    raise exception 'Invalid document file-type filter.';
  end if;
  if normalized_sort not in ('name', 'modified', 'owner', 'size')
    or normalized_direction not in ('asc', 'desc')
  then
    raise exception 'Invalid document sort.';
  end if;

  if normalized_search is null and p_parent_node_id is not null
    and not exists (
      select 1
      from public.document_nodes parent
      where parent.workspace_id = p_workspace_id
        and parent.id = p_parent_node_id
        and parent.kind = 'folder'
        and parent.lifecycle_state = 'active'
        and parent.deleted_at is null
    )
  then
    raise exception 'Document folder not found.';
  end if;

  return query
  select
    node.id,
    node.kind,
    node.display_name,
    node.parent_node_id,
    node.created_by,
    coalesce(nullif(member.display_name, ''), 'Unknown user'),
    node.created_at,
    node.updated_at,
    version.byte_size,
    coalesce(version.verified_mime_type, version.claimed_mime_type),
    version.file_extension,
    version.version_number,
    version.upload_state,
    version.sha256_checksum,
    parent.display_name,
    count(*) over()
  from public.document_nodes node
  left join public.document_versions version
    on version.id = node.current_version_id
    and version.organization_id = node.organization_id
    and version.workspace_id = node.workspace_id
    and version.node_id = node.id
  left join public.organization_members member
    on member.organization_id = node.organization_id
    and member.user_id = node.created_by
  left join public.document_nodes parent
    on parent.organization_id = node.organization_id
    and parent.workspace_id = node.workspace_id
    and parent.id = node.parent_node_id
  where node.workspace_id = p_workspace_id
    and node.deleted_at is null
    and node.lifecycle_state = 'active'
    and (node.kind = 'folder' or (
      node.kind = 'file'
      and version.upload_state = 'active'
      and version.id = node.current_version_id
    ))
    and (
      (normalized_search is null and node.parent_node_id is not distinct from p_parent_node_id)
      or
      (normalized_search is not null and node.normalized_name like '%' || normalized_search || '%')
    )
    and (
      normalized_type = 'all'
      or (normalized_type = 'folders' and node.kind = 'folder')
      or (node.kind = 'file' and case normalized_type
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
      end)
    )
  order by
    case when normalized_sort = 'name' and normalized_direction = 'asc'
      then node.normalized_name end asc,
    case when normalized_sort = 'name' and normalized_direction = 'desc'
      then node.normalized_name end desc,
    case when normalized_sort = 'modified' and normalized_direction = 'asc'
      then node.updated_at end asc,
    case when normalized_sort = 'modified' and normalized_direction = 'desc'
      then node.updated_at end desc,
    case when normalized_sort = 'owner' and normalized_direction = 'asc'
      then lower(coalesce(member.display_name, '')) end asc,
    case when normalized_sort = 'owner' and normalized_direction = 'desc'
      then lower(coalesce(member.display_name, '')) end desc,
    case when normalized_sort = 'size' and normalized_direction = 'asc'
      then version.byte_size end asc nulls first,
    case when normalized_sort = 'size' and normalized_direction = 'desc'
      then version.byte_size end desc nulls last,
    node.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_document_workspace_nodes(
  uuid, uuid, text, text, text, text, integer, integer
) from public, anon;
grant execute on function public.list_document_workspace_nodes(
  uuid, uuid, text, text, text, text, integer, integer
) to authenticated;

create or replace function public.get_document_folder_breadcrumbs(
  p_workspace_id uuid,
  p_folder_node_id uuid
)
returns table (
  node_id uuid,
  parent_node_id uuid,
  display_name text,
  depth integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_document_workspace_permission(p_workspace_id, 'files.view');

  if p_folder_node_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.document_nodes folder
    where folder.workspace_id = p_workspace_id
      and folder.id = p_folder_node_id
      and folder.kind = 'folder'
      and folder.lifecycle_state = 'active'
      and folder.deleted_at is null
  ) then
    raise exception 'Document folder not found.';
  end if;

  return query
  with recursive ancestors as (
    select folder.id, folder.parent_node_id, folder.display_name, 0 as depth
    from public.document_nodes folder
    where folder.workspace_id = p_workspace_id
      and folder.id = p_folder_node_id
    union all
    select parent.id, parent.parent_node_id, parent.display_name, child.depth + 1
    from public.document_nodes parent
    join ancestors child on child.parent_node_id = parent.id
    where parent.workspace_id = p_workspace_id
      and parent.kind = 'folder'
      and parent.lifecycle_state = 'active'
      and parent.deleted_at is null
  )
  select ancestors.id, ancestors.parent_node_id, ancestors.display_name, ancestors.depth
  from ancestors
  order by ancestors.depth desc;
end;
$$;

revoke all on function public.get_document_folder_breadcrumbs(uuid, uuid)
from public, anon;
grant execute on function public.get_document_folder_breadcrumbs(uuid, uuid)
to authenticated;

create or replace function public.list_document_workspace_folders(
  p_workspace_id uuid
)
returns table (
  node_id uuid,
  parent_node_id uuid,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_document_workspace_permission(p_workspace_id, 'files.view');

  return query
  select folder.id, folder.parent_node_id, folder.display_name
  from public.document_nodes folder
  where folder.workspace_id = p_workspace_id
    and folder.kind = 'folder'
    and folder.lifecycle_state = 'active'
    and folder.deleted_at is null
  order by folder.normalized_name, folder.id
  limit 1000;
end;
$$;

revoke all on function public.list_document_workspace_folders(uuid)
from public, anon;
grant execute on function public.list_document_workspace_folders(uuid)
to authenticated;
