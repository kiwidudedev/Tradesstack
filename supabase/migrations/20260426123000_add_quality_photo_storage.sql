alter table public.project_quality_photos
  add column if not exists storage_path text null;

create index if not exists project_quality_photos_storage_path_idx
  on public.project_quality_photos (organization_id, project_id, storage_path)
  where storage_path is not null;

alter table public.project_quality_inspection_items
  add column if not exists photo_storage_path text null;

create index if not exists project_quality_inspection_items_photo_storage_path_idx
  on public.project_quality_inspection_items (organization_id, project_id, photo_storage_path)
  where photo_storage_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-quality-photos',
  'project-quality-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_project_quality_photo_storage_object(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    char_length(coalesce(object_path, '')) > 0
    and array_length(string_to_array(object_path, '/'), 1) >= 5
    and exists (
      select 1
      from public.organization_projects p
      where p.organization_id::text = split_part(object_path, '/', 1)
        and p.id::text = split_part(object_path, '/', 2)
        and (
          public.is_owner_of_organization(p.organization_id)
          or exists (
            select 1
            from public.project_members pm
            join public.organization_members om on om.id = pm.organization_member_id
            where pm.organization_id = p.organization_id
              and pm.project_id = p.id
              and pm.is_active = true
              and om.user_id = auth.uid()
          )
          or (
            not exists (
              select 1
              from public.project_members pm
              where pm.organization_id = p.organization_id
                and pm.project_id = p.id
                and pm.is_active = true
            )
            and public.is_member_of_organization(p.organization_id)
          )
        )
    );
$$;

grant execute on function public.can_access_project_quality_photo_storage_object(text) to authenticated;

drop policy if exists "Members can read project quality photo storage objects" on storage.objects;
create policy "Members can read project quality photo storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-quality-photos'
  and public.can_access_project_quality_photo_storage_object(name)
);

drop policy if exists "Members can upload project quality photo storage objects" on storage.objects;
create policy "Members can upload project quality photo storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-quality-photos'
  and public.can_access_project_quality_photo_storage_object(name)
);

drop policy if exists "Members can update project quality photo storage objects" on storage.objects;
create policy "Members can update project quality photo storage objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-quality-photos'
  and public.can_access_project_quality_photo_storage_object(name)
)
with check (
  bucket_id = 'project-quality-photos'
  and public.can_access_project_quality_photo_storage_object(name)
);

drop policy if exists "Members can delete project quality photo storage objects" on storage.objects;
create policy "Members can delete project quality photo storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-quality-photos'
  and public.can_access_project_quality_photo_storage_object(name)
);
