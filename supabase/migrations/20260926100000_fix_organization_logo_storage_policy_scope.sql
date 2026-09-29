begin;

-- The original logo policies referenced `name` inside a subquery aliased to
-- organizations. PostgreSQL therefore resolved it as organizations.name,
-- instead of storage.objects.name, rejecting valid logo paths.

drop policy if exists "Privileged members can upload organization logo storage objects" on storage.objects;
create policy "Privileged members can upload organization logo storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(storage.objects.name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(storage.objects.name, '/', 1)
      and public.has_org_permission(o.id, 'settings.organization.update')
  )
);

drop policy if exists "Privileged members can update organization logo storage objects" on storage.objects;
create policy "Privileged members can update organization logo storage objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(storage.objects.name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(storage.objects.name, '/', 1)
      and public.has_org_permission(o.id, 'settings.organization.update')
  )
)
with check (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(storage.objects.name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(storage.objects.name, '/', 1)
      and public.has_org_permission(o.id, 'settings.organization.update')
  )
);

drop policy if exists "Privileged members can delete organization logo storage objects" on storage.objects;
create policy "Privileged members can delete organization logo storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(storage.objects.name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(storage.objects.name, '/', 1)
      and public.has_org_permission(o.id, 'settings.organization.update')
  )
);

commit;
