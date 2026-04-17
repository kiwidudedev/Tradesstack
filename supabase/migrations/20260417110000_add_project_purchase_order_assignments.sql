begin;

create table if not exists public.project_purchase_order_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  purchase_order_id uuid not null references public.project_purchase_orders (id) on delete cascade,
  organization_member_id uuid not null references public.organization_members (id) on delete cascade,
  is_active boolean not null default true,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_purchase_order_assignments_unique_project_po_member
    unique (project_id, purchase_order_id, organization_member_id)
);

create index if not exists project_purchase_order_assignments_org_project_idx
  on public.project_purchase_order_assignments (organization_id, project_id);

create index if not exists project_purchase_order_assignments_member_idx
  on public.project_purchase_order_assignments (organization_member_id);

create index if not exists project_purchase_order_assignments_purchase_order_idx
  on public.project_purchase_order_assignments (purchase_order_id);

drop trigger if exists set_project_purchase_order_assignments_updated_at on public.project_purchase_order_assignments;
create trigger set_project_purchase_order_assignments_updated_at
before update on public.project_purchase_order_assignments
for each row execute function public.set_updated_at();

create or replace function public.validate_project_purchase_order_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_order_project_id uuid;
  purchase_order_organization_id uuid;
  member_organization_id uuid;
begin
  select po.project_id, po.organization_id
  into purchase_order_project_id, purchase_order_organization_id
  from public.project_purchase_orders po
  where po.id = new.purchase_order_id;

  if purchase_order_project_id is null then
    raise exception 'Purchase order not found for assignment.';
  end if;

  select m.organization_id
  into member_organization_id
  from public.organization_members m
  where m.id = new.organization_member_id;

  if member_organization_id is null then
    raise exception 'Organization member not found for assignment.';
  end if;

  if purchase_order_organization_id <> new.organization_id then
    raise exception 'Assignment organization does not match purchase order organization.';
  end if;

  if purchase_order_project_id <> new.project_id then
    raise exception 'Assignment project does not match purchase order project.';
  end if;

  if member_organization_id <> new.organization_id then
    raise exception 'Assignment organization does not match member organization.';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.organization_id = new.organization_id
      and pm.project_id = new.project_id
      and pm.organization_member_id = new.organization_member_id
      and pm.is_active = true
  ) then
    raise exception 'Organization member must be assigned to the project before being assigned to the purchase order.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_project_purchase_order_assignment on public.project_purchase_order_assignments;
create trigger validate_project_purchase_order_assignment
before insert or update on public.project_purchase_order_assignments
for each row execute function public.validate_project_purchase_order_assignment();

alter table public.project_purchase_order_assignments enable row level security;
alter table public.project_purchase_order_assignments force row level security;

drop policy if exists "Members can view purchase order assignments" on public.project_purchase_order_assignments;
create policy "Members can view purchase order assignments"
on public.project_purchase_order_assignments
for select
using (public.is_member_of_organization(project_purchase_order_assignments.organization_id));

drop policy if exists "Permitted users can create purchase order assignments" on public.project_purchase_order_assignments;
create policy "Permitted users can create purchase order assignments"
on public.project_purchase_order_assignments
for insert
with check (
  auth.uid() is not null
  and public.has_org_permission(project_purchase_order_assignments.organization_id, 'purchase_orders.write')
);

drop policy if exists "Permitted users can update purchase order assignments" on public.project_purchase_order_assignments;
create policy "Permitted users can update purchase order assignments"
on public.project_purchase_order_assignments
for update
using (
  auth.uid() is not null
  and public.has_org_permission(project_purchase_order_assignments.organization_id, 'purchase_orders.write')
)
with check (
  auth.uid() is not null
  and public.has_org_permission(project_purchase_order_assignments.organization_id, 'purchase_orders.write')
);

drop policy if exists "Permitted users can delete purchase order assignments" on public.project_purchase_order_assignments;
create policy "Permitted users can delete purchase order assignments"
on public.project_purchase_order_assignments
for delete
using (
  auth.uid() is not null
  and public.has_org_permission(project_purchase_order_assignments.organization_id, 'purchase_orders.write')
);

grant select, insert, update, delete on public.project_purchase_order_assignments to authenticated;

create or replace function public.add_purchase_order_assignment(
  p_organization_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_organization_member_id uuid
)
returns public.project_purchase_order_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row public.project_purchase_order_assignments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'purchase_orders.write') then
    raise exception 'You do not have permission to manage purchase order assignments';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  insert into public.project_purchase_order_assignments (
    organization_id,
    project_id,
    purchase_order_id,
    organization_member_id,
    is_active,
    created_by
  )
  values (
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    p_organization_member_id,
    true,
    auth.uid()
  )
  on conflict (project_id, purchase_order_id, organization_member_id)
  do update
  set
    is_active = true,
    updated_at = now()
  returning * into assignment_row;

  return assignment_row;
end;
$$;

create or replace function public.remove_purchase_order_assignment(
  p_organization_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_organization_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'purchase_orders.write') then
    raise exception 'You do not have permission to manage purchase order assignments';
  end if;

  delete from public.project_purchase_order_assignments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.purchase_order_id = p_purchase_order_id
    and a.organization_member_id = p_organization_member_id;
end;
$$;

create or replace function public.list_purchase_order_assignments(
  p_organization_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  project_id uuid,
  purchase_order_id uuid,
  organization_member_id uuid,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
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
    a.id,
    a.organization_id,
    a.project_id,
    a.purchase_order_id,
    a.organization_member_id,
    a.is_active,
    a.created_by,
    a.created_at,
    a.updated_at
  from public.project_purchase_order_assignments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.purchase_order_id = p_purchase_order_id
  order by a.created_at asc;
end;
$$;

create or replace function public.list_worker_assigned_purchase_orders(
  p_organization_id uuid,
  p_project_id uuid,
  p_organization_member_id uuid
)
returns table (
  id uuid,
  purchase_order_number text,
  title text,
  status text,
  created_at timestamptz
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
    po.id,
    po.purchase_order_number,
    po.purchase_order_title as title,
    po.status,
    po.created_at
  from public.project_purchase_order_assignments a
  join public.project_purchase_orders po
    on po.id = a.purchase_order_id
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.organization_member_id = p_organization_member_id
    and a.is_active = true
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  order by po.created_at desc;
end;
$$;

grant execute on function public.add_purchase_order_assignment(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_purchase_order_assignment(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.list_purchase_order_assignments(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_worker_assigned_purchase_orders(uuid, uuid, uuid) to authenticated;

commit;
