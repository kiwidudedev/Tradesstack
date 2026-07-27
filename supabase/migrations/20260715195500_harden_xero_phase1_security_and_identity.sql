begin;

alter table public.organization_xero_connections
  drop constraint if exists organization_xero_connections_status_check;

alter table public.organization_xero_connections
  add constraint organization_xero_connections_status_check check (
    status in (
      'disconnected',
      'pending_authorization',
      'awaiting_tenant_selection',
      'connected',
      'attention_required',
      'error'
    )
  );

alter table public.organization_xero_connection_secrets enable row level security;
alter table public.organization_xero_connection_secrets force row level security;

alter table public.organization_xero_oauth_states enable row level security;
alter table public.organization_xero_oauth_states force row level security;

revoke all on public.organization_xero_connection_secrets from public;
revoke all on public.organization_xero_connection_secrets from anon;
revoke all on public.organization_xero_connection_secrets from authenticated;

revoke all on public.organization_xero_oauth_states from public;
revoke all on public.organization_xero_oauth_states from anon;
revoke all on public.organization_xero_oauth_states from authenticated;

drop policy if exists "Service role can manage xero connection secrets" on public.organization_xero_connection_secrets;
create policy "Service role can manage xero connection secrets"
on public.organization_xero_connection_secrets
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage xero oauth states" on public.organization_xero_oauth_states;
create policy "Service role can manage xero oauth states"
on public.organization_xero_oauth_states
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.organization_xero_connection_secrets to service_role;
grant select, insert, update, delete on public.organization_xero_oauth_states to service_role;

commit;
