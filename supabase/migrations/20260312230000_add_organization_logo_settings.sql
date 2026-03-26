alter table public.organizations
add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos',
  'organization-logos',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_organization_logo_storage_object(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    char_length(coalesce(object_path, '')) > 0
    and array_length(string_to_array(object_path, '/'), 1) >= 2
    and exists (
      select 1
      from public.organizations o
      where o.id::text = split_part(object_path, '/', 1)
        and public.is_member_of_organization(o.id)
    );
$$;

grant execute on function public.can_access_organization_logo_storage_object(text) to authenticated;

drop policy if exists "Members can read organization logo storage objects" on storage.objects;
create policy "Members can read organization logo storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'organization-logos'
  and public.can_access_organization_logo_storage_object(name)
);

drop policy if exists "Admins can upload organization logo storage objects" on storage.objects;
create policy "Admins can upload organization logo storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.is_admin_of_organization(o.id)
  )
);

drop policy if exists "Admins can update organization logo storage objects" on storage.objects;
create policy "Admins can update organization logo storage objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.is_admin_of_organization(o.id)
  )
)
with check (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.is_admin_of_organization(o.id)
  )
);

drop policy if exists "Admins can delete organization logo storage objects" on storage.objects;
create policy "Admins can delete organization logo storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.is_admin_of_organization(o.id)
  )
);
