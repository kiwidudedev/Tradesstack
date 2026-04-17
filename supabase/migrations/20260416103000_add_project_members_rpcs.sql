begin;

create or replace function public.add_project_member(
  p_organization_id uuid,
  p_project_id uuid,
  p_organization_member_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  project_id uuid,
  organization_member_id uuid,
  created_by uuid,
  is_active boolean,
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_active_row public.project_members%rowtype;
  restored_row public.project_members%rowtype;
  inserted_row public.project_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_owner_of_organization(p_organization_id) then
    raise exception 'Not authorized to manage project members for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.id = p_organization_member_id
      and m.organization_id = p_organization_id
  ) then
    raise exception 'Organization member not found for organization';
  end if;

  select *
  into existing_active_row
  from public.project_members pm
  where pm.organization_id = p_organization_id
    and pm.project_id = p_project_id
    and pm.organization_member_id = p_organization_member_id
    and pm.is_active = true
  order by pm.created_at asc
  limit 1;

  if existing_active_row.id is not null then
    return query
    select
      existing_active_row.id,
      existing_active_row.organization_id,
      existing_active_row.project_id,
      existing_active_row.organization_member_id,
      existing_active_row.created_by,
      existing_active_row.is_active,
      existing_active_row.removed_at,
      existing_active_row.removed_by,
      existing_active_row.created_at,
      existing_active_row.updated_at;
    return;
  end if;

  with candidate as (
    select pm.id
    from public.project_members pm
    where pm.organization_id = p_organization_id
      and pm.project_id = p_project_id
      and pm.organization_member_id = p_organization_member_id
      and pm.is_active = false
    order by pm.updated_at desc, pm.created_at desc
    limit 1
  )
  update public.project_members pm
  set
    is_active = true,
    removed_at = null,
    removed_by = null
  from candidate
  where pm.id = candidate.id
  returning pm.* into restored_row;

  if restored_row.id is not null then
    return query
    select
      restored_row.id,
      restored_row.organization_id,
      restored_row.project_id,
      restored_row.organization_member_id,
      restored_row.created_by,
      restored_row.is_active,
      restored_row.removed_at,
      restored_row.removed_by,
      restored_row.created_at,
      restored_row.updated_at;
    return;
  end if;

  begin
    insert into public.project_members (
      organization_id,
      project_id,
      organization_member_id,
      created_by
    )
    values (
      p_organization_id,
      p_project_id,
      p_organization_member_id,
      auth.uid()
    )
    returning * into inserted_row;
  exception
    when unique_violation then
      select *
      into inserted_row
      from public.project_members pm
      where pm.organization_id = p_organization_id
        and pm.project_id = p_project_id
        and pm.organization_member_id = p_organization_member_id
        and pm.is_active = true
      order by pm.created_at asc
      limit 1;

      if inserted_row.id is null then
        raise exception 'Active project membership already exists';
      end if;
  end;

  return query
  select
    inserted_row.id,
    inserted_row.organization_id,
    inserted_row.project_id,
    inserted_row.organization_member_id,
    inserted_row.created_by,
    inserted_row.is_active,
    inserted_row.removed_at,
    inserted_row.removed_by,
    inserted_row.created_at,
    inserted_row.updated_at;
end;
$$;

create or replace function public.remove_project_member(
  p_organization_id uuid,
  p_project_id uuid,
  p_organization_member_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  project_id uuid,
  organization_member_id uuid,
  created_by uuid,
  is_active boolean,
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.project_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_owner_of_organization(p_organization_id) then
    raise exception 'Not authorized to manage project members for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.id = p_organization_member_id
      and m.organization_id = p_organization_id
  ) then
    raise exception 'Organization member not found for organization';
  end if;

  update public.project_members pm
  set
    is_active = false,
    removed_at = now(),
    removed_by = auth.uid()
  where pm.organization_id = p_organization_id
    and pm.project_id = p_project_id
    and pm.organization_member_id = p_organization_member_id
    and pm.is_active = true
  returning pm.* into updated_row;

  if updated_row.id is null then
    raise exception 'Active project membership not found';
  end if;

  return query
  select
    updated_row.id,
    updated_row.organization_id,
    updated_row.project_id,
    updated_row.organization_member_id,
    updated_row.created_by,
    updated_row.is_active,
    updated_row.removed_at,
    updated_row.removed_by,
    updated_row.created_at,
    updated_row.updated_at;
end;
$$;

create or replace function public.list_project_members(
  p_organization_id uuid,
  p_project_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  project_id uuid,
  organization_member_id uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  role text,
  user_id uuid,
  display_name text,
  avatar_path text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  return query
  select
    pm.id,
    pm.organization_id,
    pm.project_id,
    pm.organization_member_id,
    pm.is_active,
    pm.created_at,
    pm.updated_at,
    m.role::text,
    m.user_id,
    m.display_name,
    m.avatar_path
  from public.project_members pm
  join public.organization_members m on m.id = pm.organization_member_id
  where pm.organization_id = p_organization_id
    and pm.project_id = p_project_id
    and pm.is_active = true
  order by lower(m.display_name), pm.created_at asc;
end;
$$;

grant execute on function public.add_project_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_project_members(uuid, uuid) to authenticated;

commit;
