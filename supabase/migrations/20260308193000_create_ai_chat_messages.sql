create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid,
  project_slug text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_chat_messages_user_project_created_at_idx
  on public.ai_chat_messages (user_id, project_slug, created_at desc);

alter table public.ai_chat_messages enable row level security;

drop policy if exists "ai_chat_messages_select_own" on public.ai_chat_messages;
create policy "ai_chat_messages_select_own"
  on public.ai_chat_messages
  for select
  using (auth.uid() = user_id);

drop policy if exists "ai_chat_messages_insert_own" on public.ai_chat_messages;
create policy "ai_chat_messages_insert_own"
  on public.ai_chat_messages
  for insert
  with check (auth.uid() = user_id);
