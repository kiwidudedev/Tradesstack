create table if not exists public.project_drawing_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  file_size_bytes bigint not null,
  mime_type text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_drawing_sets_file_name_not_blank check (char_length(trim(file_name)) > 0),
  constraint project_drawing_sets_path_not_blank check (char_length(trim(storage_path)) > 0),
  constraint project_drawing_sets_file_size_positive check (file_size_bytes > 0)
);

create index if not exists project_drawing_sets_project_uploaded_at_idx
on public.project_drawing_sets (project_id, uploaded_at desc);

create index if not exists project_drawing_sets_org_uploaded_at_idx
on public.project_drawing_sets (organization_id, uploaded_at desc);

drop trigger if exists set_project_drawing_sets_updated_at on public.project_drawing_sets;
create trigger set_project_drawing_sets_updated_at
before update on public.project_drawing_sets
for each row
execute function public.set_updated_at();

alter table public.project_drawing_sets enable row level security;

drop policy if exists "Members can view project drawing sets" on public.project_drawing_sets;
create policy "Members can view project drawing sets"
on public.project_drawing_sets
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = project_drawing_sets.project_id
      and p.organization_id = project_drawing_sets.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can upload project drawing sets" on public.project_drawing_sets;
create policy "Members can upload project drawing sets"
on public.project_drawing_sets
for insert
with check (
  project_drawing_sets.uploaded_by = auth.uid()
  and project_drawing_sets.storage_path like project_drawing_sets.organization_id::text || '/' || project_drawing_sets.project_id::text || '/%'
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_drawing_sets.project_id
      and p.organization_id = project_drawing_sets.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can delete project drawing sets" on public.project_drawing_sets;
create policy "Members can delete project drawing sets"
on public.project_drawing_sets
for delete
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = project_drawing_sets.project_id
      and p.organization_id = project_drawing_sets.organization_id
      and public.is_admin_of_organization(p.organization_id)
  )
);

grant select, insert, delete on public.project_drawing_sets to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-drawing-sets', 'project-drawing-sets', false, 5368709120)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create or replace function public.can_access_project_drawing_storage_object(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    char_length(coalesce(object_path, '')) > 0
    and array_length(string_to_array(object_path, '/'), 1) >= 3
    and exists (
      select 1
      from public.organization_projects p
      where p.organization_id::text = split_part(object_path, '/', 1)
        and p.id::text = split_part(object_path, '/', 2)
        and public.is_member_of_organization(p.organization_id)
    );
$$;

grant execute on function public.can_access_project_drawing_storage_object(text) to authenticated;

drop policy if exists "Members can read project drawing storage objects" on storage.objects;
create policy "Members can read project drawing storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-drawing-sets'
  and public.can_access_project_drawing_storage_object(name)
);

drop policy if exists "Members can upload project drawing storage objects" on storage.objects;
create policy "Members can upload project drawing storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-drawing-sets'
  and public.can_access_project_drawing_storage_object(name)
);

drop policy if exists "Admins can delete project drawing storage objects" on storage.objects;
create policy "Admins can delete project drawing storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-drawing-sets'
  and exists (
    select 1
    from public.organization_projects p
    where p.organization_id::text = split_part(name, '/', 1)
      and p.id::text = split_part(name, '/', 2)
      and public.is_admin_of_organization(p.organization_id)
  )
);
