drop policy if exists "Admins can update organization" on public.organizations;
drop policy if exists "Members can update organization" on public.organizations;
create policy "Members can update organization"
on public.organizations
for update
using (
  public.is_member_of_organization(organizations.id)
)
with check (
  public.is_member_of_organization(organizations.id)
);

drop policy if exists "Admins can upload organization logo storage objects" on storage.objects;
drop policy if exists "Members can upload organization logo storage objects" on storage.objects;
create policy "Members can upload organization logo storage objects"
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
      and public.is_member_of_organization(o.id)
  )
);

drop policy if exists "Admins can update organization logo storage objects" on storage.objects;
drop policy if exists "Members can update organization logo storage objects" on storage.objects;
create policy "Members can update organization logo storage objects"
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
      and public.is_member_of_organization(o.id)
  )
)
with check (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.is_member_of_organization(o.id)
  )
);

drop policy if exists "Admins can delete organization logo storage objects" on storage.objects;
drop policy if exists "Members can delete organization logo storage objects" on storage.objects;
create policy "Members can delete organization logo storage objects"
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
      and public.is_member_of_organization(o.id)
  )
);
