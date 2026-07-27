begin;

-- Temporary helpers used only because the configured legacy service-role JWT
-- is accepted by PostgREST but rejected by the project's GoTrue admin endpoint.

create or replace function public.create_phase2a_verification_user(
  p_email text,
  p_password text,
  p_organization_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  user_id uuid := gen_random_uuid();
  organization_id uuid;
begin
  if p_email not like 'phase2a-%@example.invalid'
    or p_organization_name not like '__phase2a_verification__%'
    or char_length(p_password) < 16 then
    raise exception 'Verification auth helper accepts only synthetic Phase 2A identities.';
  end if;
  insert into auth.users(
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current
  ) values (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    lower(p_email),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', 'Phase 2A verification',
      'organization_name', p_organization_name
    ),
    now(), now(), '', '', '', '', ''
  );
  select o.id into organization_id
  from public.organizations o where o.created_by = user_id;
  if organization_id is null then
    raise exception 'Synthetic verification organization was not created.';
  end if;
  return jsonb_build_object(
    'userId', user_id,
    'organizationId', organization_id,
    'organizationName', p_organization_name,
    'email', lower(p_email)
  );
end;
$$;

create or replace function public.delete_phase2a_verification_user(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  user_email text;
begin
  select u.email into user_email from auth.users u where u.id = p_user_id;
  if user_email is null then return true; end if;
  if user_email not like 'phase2a-%@example.invalid' then
    raise exception 'Verification auth cleanup refuses non-synthetic users.';
  end if;
  if exists (
    select 1 from public.organizations o where o.created_by = p_user_id
  ) then
    raise exception 'Delete the synthetic verification organization before its auth user.';
  end if;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke all on function
  public.create_phase2a_verification_user(text,text,text),
  public.delete_phase2a_verification_user(uuid)
from public, anon, authenticated;
grant execute on function
  public.create_phase2a_verification_user(text,text,text),
  public.delete_phase2a_verification_user(uuid)
to service_role;

commit;
