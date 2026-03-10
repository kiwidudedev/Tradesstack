-- Allow authenticated users to update/delete only their own usage rows.
-- Required for atomic quota reservation commit/release RPC flow.

drop policy if exists "ai_chat_usage_update_own" on public.ai_chat_usage;
create policy "ai_chat_usage_update_own"
  on public.ai_chat_usage
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_chat_usage_delete_own" on public.ai_chat_usage;
create policy "ai_chat_usage_delete_own"
  on public.ai_chat_usage
  for delete
  using (auth.uid() = user_id);

grant update, delete on public.ai_chat_usage to authenticated;
