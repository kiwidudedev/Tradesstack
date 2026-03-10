create table if not exists public.ai_chat_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid,
  project_slug text,
  plan_tier text not null default 'starter',
  tokens_used integer not null default 0,
  response_chars integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_chat_usage_user_created_at_idx
  on public.ai_chat_usage (user_id, created_at desc);

alter table public.ai_chat_usage enable row level security;

drop policy if exists "ai_chat_usage_select_own" on public.ai_chat_usage;
create policy "ai_chat_usage_select_own"
  on public.ai_chat_usage
  for select
  using (auth.uid() = user_id);

drop policy if exists "ai_chat_usage_insert_own" on public.ai_chat_usage;
create policy "ai_chat_usage_insert_own"
  on public.ai_chat_usage
  for insert
  with check (auth.uid() = user_id);
