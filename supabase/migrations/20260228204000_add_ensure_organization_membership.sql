create or replace function public.ensure_organization_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_org_id uuid;
  existing_org_id uuid;
  resolved_display_name text;
  resolved_org_name text;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select m.organization_id
  into existing_member_org_id
  from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;

  if existing_member_org_id is not null then
    return existing_member_org_id;
  end if;

  select o.id
  into existing_org_id
  from public.organizations o
  where o.created_by = auth.uid()
  order by o.created_at asc
  limit 1;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  resolved_display_name := nullif(trim(coalesce(auth.jwt() ->> 'full_name', auth.jwt() ->> 'name', '')), '');

  if resolved_display_name is null then
    if current_email <> '' then
      resolved_display_name := split_part(current_email, '@', 1);
    else
      resolved_display_name := 'TradesStack User';
    end if;
  end if;

  if existing_org_id is null then
    resolved_org_name := nullif(trim(coalesce(auth.jwt() ->> 'organization_name', '')), '');

    if resolved_org_name is null then
      if current_email <> '' then
        resolved_org_name := initcap(split_part(current_email, '@', 1)) || ' Organization';
      else
        resolved_org_name := 'New Organization';
      end if;
    end if;

    insert into public.organizations (name, created_by)
    values (resolved_org_name, auth.uid())
    returning id into existing_org_id;
  end if;

  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (existing_org_id, auth.uid(), 'admin', resolved_display_name)
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    display_name = excluded.display_name,
    updated_at = now();

  return existing_org_id;
end;
$$;

grant execute on function public.ensure_organization_membership() to authenticated;
