create table if not exists public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_slug text not null,
  title text not null default 'New Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  archived_at timestamptz null
);

create index if not exists ai_chat_conversations_user_project_last_message_idx
  on public.ai_chat_conversations (user_id, project_slug, last_message_at desc);

alter table public.ai_chat_conversations enable row level security;

drop policy if exists "ai_chat_conversations_select_own" on public.ai_chat_conversations;
create policy "ai_chat_conversations_select_own"
  on public.ai_chat_conversations
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ai_chat_conversations_insert_own" on public.ai_chat_conversations;
create policy "ai_chat_conversations_insert_own"
  on public.ai_chat_conversations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "ai_chat_conversations_update_own" on public.ai_chat_conversations;
create policy "ai_chat_conversations_update_own"
  on public.ai_chat_conversations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.ai_chat_messages
  add column if not exists conversation_id uuid null references public.ai_chat_conversations (id) on delete set null;

create index if not exists ai_chat_messages_user_conversation_created_at_idx
  on public.ai_chat_messages (user_id, conversation_id, created_at asc);

-- Backfill existing messages into one conversation per user/project_slug.
with distinct_pairs as (
  select distinct m.user_id, m.organization_id, m.project_slug
  from public.ai_chat_messages m
  where m.conversation_id is null
),
inserted as (
  insert into public.ai_chat_conversations (user_id, organization_id, project_slug, title, created_at, updated_at, last_message_at)
  select
    d.user_id,
    d.organization_id,
    d.project_slug,
    'Legacy Chat',
    now(),
    now(),
    now()
  from distinct_pairs d
  returning id, user_id, project_slug
)
update public.ai_chat_messages m
set conversation_id = i.id
from inserted i
where m.conversation_id is null
  and m.user_id = i.user_id
  and m.project_slug = i.project_slug;
