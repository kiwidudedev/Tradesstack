insert into storage.buckets (id, name, public, file_size_limit)
values ('project-variation-attachments', 'project-variation-attachments', false, 104857600)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create or replace function public.can_access_project_variation_attachment_storage_object(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    char_length(coalesce(object_path, '')) > 0
    and array_length(string_to_array(object_path, '/'), 1) >= 4
    and exists (
      select 1
      from public.organization_projects p
      where p.organization_id::text = split_part(object_path, '/', 1)
        and p.id::text = split_part(object_path, '/', 2)
        and public.is_member_of_organization(p.organization_id)
    );
$$;

grant execute on function public.can_access_project_variation_attachment_storage_object(text) to authenticated;

drop policy if exists "Members can read project variation attachment storage objects" on storage.objects;
create policy "Members can read project variation attachment storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-variation-attachments'
  and public.can_access_project_variation_attachment_storage_object(name)
);

drop policy if exists "Members can upload project variation attachment storage objects" on storage.objects;
create policy "Members can upload project variation attachment storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-variation-attachments'
  and public.can_access_project_variation_attachment_storage_object(name)
);

drop policy if exists "Members can delete project variation attachment storage objects" on storage.objects;
create policy "Members can delete project variation attachment storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-variation-attachments'
  and public.can_access_project_variation_attachment_storage_object(name)
);
