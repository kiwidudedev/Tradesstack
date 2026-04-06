begin;

create table if not exists public.organization_invite_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invite_id uuid null references public.organization_invites (id) on delete set null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organization_invite_audit_logs_event_type_check check (
    event_type in ('created', 'role_changed', 'resent', 'status_changed', 'updated', 'deleted')
  )
);

create index if not exists organization_invite_audit_logs_org_created_idx
on public.organization_invite_audit_logs (organization_id, created_at desc);

create index if not exists organization_invite_audit_logs_invite_idx
on public.organization_invite_audit_logs (invite_id, created_at desc);

create or replace function public.log_organization_invite_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_name text;
  payload jsonb;
begin
  if tg_op = 'INSERT' then
    event_name := 'created';
    payload := jsonb_build_object(
      'invited_email', new.invited_email,
      'role', new.role,
      'status', new.status,
      'expires_at', new.expires_at
    );

    insert into public.organization_invite_audit_logs (organization_id, invite_id, actor_user_id, event_type, details)
    values (new.organization_id, new.id, auth.uid(), event_name, payload);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.role is distinct from new.role then
      event_name := 'role_changed';
    elsif old.expires_at is distinct from new.expires_at and new.status = 'pending' then
      event_name := 'resent';
    elsif old.status is distinct from new.status then
      event_name := 'status_changed';
    else
      event_name := 'updated';
    end if;

    payload := jsonb_build_object(
      'from', jsonb_build_object('role', old.role, 'status', old.status, 'expires_at', old.expires_at),
      'to', jsonb_build_object('role', new.role, 'status', new.status, 'expires_at', new.expires_at),
      'invited_email', new.invited_email
    );

    insert into public.organization_invite_audit_logs (organization_id, invite_id, actor_user_id, event_type, details)
    values (new.organization_id, new.id, auth.uid(), event_name, payload);
    return new;
  end if;

  if tg_op = 'DELETE' then
    event_name := 'deleted';
    payload := jsonb_build_object(
      'invited_email', old.invited_email,
      'role', old.role,
      'status', old.status
    );

    insert into public.organization_invite_audit_logs (organization_id, invite_id, actor_user_id, event_type, details)
    values (old.organization_id, old.id, auth.uid(), event_name, payload);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists organization_invites_audit_trigger on public.organization_invites;
create trigger organization_invites_audit_trigger
after insert or update or delete on public.organization_invites
for each row
execute function public.log_organization_invite_audit();

alter table public.organization_invite_audit_logs enable row level security;
alter table public.organization_invite_audit_logs force row level security;

drop policy if exists "Owners can view invite audit logs" on public.organization_invite_audit_logs;
create policy "Owners can view invite audit logs"
on public.organization_invite_audit_logs
for select
using (public.is_owner_of_organization(organization_invite_audit_logs.organization_id));

grant select on public.organization_invite_audit_logs to authenticated;

commit;
