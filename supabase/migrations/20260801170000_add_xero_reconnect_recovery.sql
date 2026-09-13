begin;

alter table public.organization_xero_oauth_states
  add column if not exists connection_id uuid null
    references public.organization_xero_connections (id) on delete set null,
  add column if not exists correlation_id uuid null,
  add column if not exists status text null,
  add column if not exists redirect_issued_at timestamptz null,
  add column if not exists callback_received_at timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists cancelled_at timestamptz null,
  add column if not exists failure_code text null,
  add column if not exists failure_message text null,
  add column if not exists failure_at timestamptz null,
  add column if not exists callback_outcome text null,
  add column if not exists updated_at timestamptz null;

alter table public.organization_xero_oauth_states
  drop constraint if exists organization_xero_oauth_states_status_check;

alter table public.organization_xero_oauth_states
  add constraint organization_xero_oauth_states_status_check check (
    status is null or status in (
      'created',
      'redirect_issued',
      'callback_received',
      'completed',
      'expired',
      'cancelled',
      'failed'
    )
  );

alter table public.organization_xero_oauth_states
  drop constraint if exists organization_xero_oauth_states_correlation_id_unique;

alter table public.organization_xero_oauth_states
  add constraint organization_xero_oauth_states_correlation_id_unique
  unique (correlation_id);

create index if not exists organization_xero_oauth_states_attempt_lifecycle_idx
  on public.organization_xero_oauth_states
    (organization_id, connection_id, created_at desc);

create index if not exists organization_xero_oauth_states_active_attempt_idx
  on public.organization_xero_oauth_states
    (organization_id, user_id, connection_id, expires_at desc)
  where status in ('created', 'redirect_issued', 'callback_received');

create or replace function public.protect_xero_oauth_attempt_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.user_id is distinct from old.user_id
    or new.state_hash is distinct from old.state_hash
    or new.redirect_path is distinct from old.redirect_path
    or new.correlation_id is distinct from old.correlation_id
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at
    or (
      old.connection_id is not null
      and new.connection_id is distinct from old.connection_id
    ) then
    raise exception 'xero oauth attempt identity is immutable';
  end if;

  if old.status is not null
    and new.status is distinct from old.status
    and not (
      (old.status = 'created' and new.status in ('redirect_issued', 'failed', 'cancelled', 'expired'))
      or (old.status = 'redirect_issued' and new.status in ('callback_received', 'failed', 'cancelled', 'expired'))
      or (old.status = 'callback_received' and new.status in ('completed', 'failed', 'expired'))
    ) then
    raise exception 'invalid xero oauth attempt status transition';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_xero_oauth_attempt_identity
  on public.organization_xero_oauth_states;
create trigger protect_xero_oauth_attempt_identity
before update on public.organization_xero_oauth_states
for each row execute function public.protect_xero_oauth_attempt_identity();

drop trigger if exists set_organization_xero_oauth_states_updated_at
  on public.organization_xero_oauth_states;
create trigger set_organization_xero_oauth_states_updated_at
before update on public.organization_xero_oauth_states
for each row execute function public.set_updated_at();

create or replace function public.finalize_xero_oauth_attempt(
  p_attempt_id uuid,
  p_organization_id uuid,
  p_connection_id uuid,
  p_encrypted_token_set text,
  p_encryption_version integer,
  p_connection_status text,
  p_tenant_id text,
  p_tenant_name text,
  p_tenant_type text,
  p_tenant_connection_id text,
  p_xero_user_id text,
  p_scope text[],
  p_available_tenants_json jsonb,
  p_token_expires_at timestamptz,
  p_refresh_token_expires_at timestamptz,
  p_connected_by_user_id uuid,
  p_callback_outcome text
)
returns public.organization_xero_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.organization_xero_oauth_states%rowtype;
  v_connection public.organization_xero_connections%rowtype;
begin
  if p_connection_status not in ('connected', 'awaiting_tenant_selection') then
    raise exception 'invalid xero callback connection status';
  end if;

  if p_encrypted_token_set is null or char_length(trim(p_encrypted_token_set)) = 0 then
    raise exception 'encrypted xero token set is required';
  end if;

  select *
  into v_attempt
  from public.organization_xero_oauth_states
  where id = p_attempt_id
    and organization_id = p_organization_id
    and connection_id = p_connection_id
  for update;

  if not found or v_attempt.status <> 'callback_received' then
    raise exception 'xero oauth attempt is not ready to finalize';
  end if;

  select *
  into v_connection
  from public.organization_xero_connections
  where id = p_connection_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'xero connection was not found';
  end if;

  insert into public.organization_xero_connection_secrets (
    connection_id,
    encrypted_token_set,
    encryption_version,
    updated_at
  ) values (
    p_connection_id,
    p_encrypted_token_set,
    p_encryption_version,
    now()
  )
  on conflict (connection_id) do update set
    encrypted_token_set = excluded.encrypted_token_set,
    encryption_version = excluded.encryption_version,
    updated_at = excluded.updated_at;

  update public.organization_xero_connections
  set
    status = p_connection_status,
    tenant_id = p_tenant_id,
    tenant_name = p_tenant_name,
    tenant_type = p_tenant_type,
    tenant_connection_id = p_tenant_connection_id,
    xero_user_id = p_xero_user_id,
    scope = coalesce(p_scope, '{}'::text[]),
    available_tenants_json = coalesce(p_available_tenants_json, '[]'::jsonb),
    token_expires_at = p_token_expires_at,
    refresh_token_expires_at = p_refresh_token_expires_at,
    last_health_status = case
      when p_connection_status = 'connected' then 'healthy'
      else null
    end,
    last_health_checked_at = case
      when p_connection_status = 'connected' then now()
      else null
    end,
    last_error = null,
    connected_by_user_id = p_connected_by_user_id,
    updated_at = now()
  where id = p_connection_id
    and organization_id = p_organization_id
  returning * into v_connection;

  update public.organization_xero_oauth_states
  set
    status = 'completed',
    completed_at = now(),
    used_at = coalesce(used_at, now()),
    callback_outcome = p_callback_outcome,
    failure_code = null,
    failure_message = null,
    failure_at = null,
    updated_at = now()
  where id = p_attempt_id
    and status = 'callback_received';

  if not found then
    raise exception 'xero oauth attempt completion conflict';
  end if;

  return v_connection;
end;
$$;

revoke all on function public.finalize_xero_oauth_attempt(
  uuid, uuid, uuid, text, integer, text, text, text, text, text, text,
  text[], jsonb, timestamptz, timestamptz, uuid, text
) from public, anon, authenticated;

grant execute on function public.finalize_xero_oauth_attempt(
  uuid, uuid, uuid, text, integer, text, text, text, text, text, text,
  text[], jsonb, timestamptz, timestamptz, uuid, text
) to service_role;

commit;
