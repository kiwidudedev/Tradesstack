-- Critical tenant-isolation hardening:
-- Never auto-join a user into an organization by email match alone.
-- A join at signup is only allowed when a valid invite_token is explicitly supplied.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_name text;
  member_name text;
  new_org_id uuid;
  invite_row public.organization_invites%rowtype;
  supplied_invite_token uuid;
begin
  org_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'organization_name', '')), '');
  member_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  if member_name is null then
    member_name := split_part(new.email, '@', 1);
  end if;

  -- Only allow auto-join when a token is explicitly supplied during signup.
  -- This removes implicit org-joining by matching pending invites on email alone.
  begin
    supplied_invite_token := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_token', '')), '')::uuid;
  exception
    when invalid_text_representation then
      supplied_invite_token := null;
  end;

  if supplied_invite_token is not null then
    select i.*
    into invite_row
    from public.organization_invites i
    where i.token = supplied_invite_token
      and lower(i.invited_email) = lower(new.email)
      and i.status = 'pending'
      and i.expires_at > now()
    limit 1;

    if found then
      insert into public.organization_members (organization_id, user_id, role, display_name)
      values (invite_row.organization_id, new.id, invite_row.role, member_name)
      on conflict (organization_id, user_id) do update
      set
        role = excluded.role,
        display_name = excluded.display_name,
        updated_at = now();

      update public.organization_invites
      set status = 'accepted', accepted_at = now(), updated_at = now()
      where id = invite_row.id;

      return new;
    end if;
  end if;

  -- Default signup path: create a fresh organization for this user.
  if org_name is null then
    org_name := split_part(new.email, '@', 1) || ' Organization';
  end if;

  insert into public.organizations (name, created_by)
  values (org_name, new.id)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (new_org_id, new.id, 'admin', member_name)
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$;
