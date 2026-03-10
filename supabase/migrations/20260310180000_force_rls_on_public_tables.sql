-- Defense-in-depth hardening:
-- Enforce RLS even for table owners on all public application tables.
-- This does not change existing policies; it ensures policies are always applied.

alter table if exists public.organizations force row level security;
alter table if exists public.organization_members force row level security;
alter table if exists public.organization_invites force row level security;
alter table if exists public.organization_projects force row level security;
alter table if exists public.project_drawing_sets force row level security;
alter table if exists public.trade_packs force row level security;
alter table if exists public.scope_runs force row level security;
alter table if exists public.project_trade_pack_page_index force row level security;
alter table if exists public.project_trade_pack_reason_snapshots force row level security;
alter table if exists public.ai_chat_usage force row level security;
alter table if exists public.ai_chat_messages force row level security;
