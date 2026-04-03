-- Improves AI chat read paths at higher scale.
create index if not exists ai_chat_conversations_user_project_active_last_message_idx
  on public.ai_chat_conversations (user_id, project_slug, last_message_at desc)
  where archived_at is null;

create index if not exists ai_chat_messages_conversation_created_desc_idx
  on public.ai_chat_messages (conversation_id, created_at desc);

create index if not exists ai_chat_messages_user_project_conversation_created_desc_idx
  on public.ai_chat_messages (user_id, project_slug, conversation_id, created_at desc);
