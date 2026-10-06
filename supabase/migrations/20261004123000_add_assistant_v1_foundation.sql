begin;

create table if not exists public.assistant_configuration (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  is_enabled boolean not null default true,
  provider text not null default 'openai',
  model text null,
  allowed_modules text[] not null default array['project_overview','project_activity','financial_summary','quotes','purchase_orders','variations','payment_claims','retentions','contacts','qa','documents']::text[],
  allowed_roles text[] not null default array['owner','admin','qs','project_manager','worker','member']::text[],
  financial_data_enabled boolean not null default true,
  document_data_enabled boolean not null default false,
  monthly_message_limit integer not null default 200 check (monthly_message_limit between 1 and 10000),
  max_tool_calls_per_turn integer not null default 4 check (max_tool_calls_per_turn between 1 and 8),
  retention_days integer not null default 90 check (retention_days between 1 and 3650),
  system_context text not null default '',
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_tool_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid null references public.organization_projects(id) on delete set null,
  conversation_id uuid null references public.ai_chat_conversations(id) on delete set null,
  message_id uuid null references public.ai_chat_messages(id) on delete set null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  status text not null check (status in ('completed','denied','failed')),
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

alter table public.ai_chat_messages
  add column if not exists citations jsonb not null default '[]'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists assistant_tool_calls_org_created_idx
  on public.assistant_tool_calls (organization_id, created_at desc);
create index if not exists assistant_tool_calls_conversation_idx
  on public.assistant_tool_calls (conversation_id, created_at asc);

alter table public.assistant_configuration enable row level security;
alter table public.assistant_configuration force row level security;
alter table public.assistant_tool_calls enable row level security;
alter table public.assistant_tool_calls force row level security;

drop policy if exists assistant_configuration_select on public.assistant_configuration;
create policy assistant_configuration_select on public.assistant_configuration
  for select to authenticated
  using (public.is_member_of_organization(organization_id));

drop policy if exists assistant_configuration_manage on public.assistant_configuration;
create policy assistant_configuration_manage on public.assistant_configuration
  for all to authenticated
  using (public.is_owner_of_organization(organization_id))
  with check (public.is_owner_of_organization(organization_id));

drop policy if exists assistant_tool_calls_select on public.assistant_tool_calls;
create policy assistant_tool_calls_select on public.assistant_tool_calls
  for select to authenticated
  using (public.is_member_of_organization(organization_id));

drop policy if exists assistant_tool_calls_insert on public.assistant_tool_calls;
create policy assistant_tool_calls_insert on public.assistant_tool_calls
  for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and public.is_member_of_organization(organization_id)
  );

grant select on public.assistant_configuration to authenticated;
grant insert, update, delete on public.assistant_configuration to authenticated;
grant select, insert on public.assistant_tool_calls to authenticated;

commit;
