begin;

revoke insert, update, delete on public.task_comments from public, anon, authenticated;
revoke insert, update, delete on public.task_attachments from public, anon, authenticated;

grant select on public.task_comments to authenticated;
grant select on public.task_attachments to authenticated;

drop policy if exists "Members can create task comments" on public.task_comments;
drop policy if exists "Members can update their own task comments" on public.task_comments;

drop policy if exists "Members can create task attachments" on public.task_attachments;
drop policy if exists "Members can update task attachments" on public.task_attachments;

commit;
