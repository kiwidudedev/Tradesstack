-- Long-term stability for organization settings updates.
-- 1) explicit RLS policies scoped to authenticated role
-- 2) security-definer RPC to update org settings with membership checks

-- Organizations RLS: explicit membership checks, no helper-function dependency.
drop policy if exists "Admins can update organization" on public.organizations;
drop policy if exists "Members can update organization" on public.organizations;
create policy "Members can update organization"
on public.organizations
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
  )
);

-- Storage RLS for organization logos: explicit membership checks.
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
    from public.organization_members m
    where m.organization_id::text = split_part(name, '/', 1)
      and m.user_id = auth.uid()
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
    from public.organization_members m
    where m.organization_id::text = split_part(name, '/', 1)
      and m.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organization_members m
    where m.organization_id::text = split_part(name, '/', 1)
      and m.user_id = auth.uid()
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
    from public.organization_members m
    where m.organization_id::text = split_part(name, '/', 1)
      and m.user_id = auth.uid()
  )
);

-- Security-definer RPC for robust org settings updates.
create or replace function public.update_organization_settings(
  p_organization_id uuid,
  p_name text default null,
  p_logo_path text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.organizations;
  normalized_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'Not authorized for this organization';
  end if;

  normalized_name := nullif(trim(coalesce(p_name, '')), '');

  if p_logo_path is not null and p_logo_path <> '' and p_logo_path not like p_organization_id::text || '/%' then
    raise exception 'Logo path must be scoped to organization';
  end if;

  update public.organizations o
  set
    name = coalesce(normalized_name, o.name),
    logo_path = coalesce(p_logo_path, o.logo_path),
    updated_at = now()
  where o.id = p_organization_id
  returning o.* into updated_row;

  if updated_row.id is null then
    raise exception 'Organization not found';
  end if;

  return updated_row;
end;
$$;

grant execute on function public.update_organization_settings(uuid, text, text) to authenticated;
