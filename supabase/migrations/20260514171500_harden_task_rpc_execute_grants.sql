begin;

-- Phase 2A hardening: prevent default PUBLIC/anon execute access on task RPCs.
-- Auth/org checks exist in the functions, but the intended exposed role is authenticated only.

revoke all on function public.list_tasks(uuid, uuid, text[], boolean, boolean) from public, anon, authenticated;
revoke all on function public.get_task(uuid) from public, anon, authenticated;
revoke all on function public.list_task_activity(uuid) from public, anon, authenticated;
revoke all on function public.list_task_comments(uuid, boolean) from public, anon, authenticated;
revoke all on function public.list_task_attachments(uuid, boolean) from public, anon, authenticated;

revoke all on function public.create_task(jsonb) from public, anon, authenticated;
revoke all on function public.update_task(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.assign_task(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_task(uuid) from public, anon, authenticated;
revoke all on function public.reopen_task(uuid) from public, anon, authenticated;
revoke all on function public.archive_task(uuid, text) from public, anon, authenticated;
revoke all on function public.soft_delete_task(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_task(uuid) from public, anon, authenticated;
revoke all on function public.create_task_comment(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_task_comment(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_task_comment(uuid) from public, anon, authenticated;
revoke all on function public.add_task_link(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.remove_task_link(uuid) from public, anon, authenticated;

grant execute on function public.list_tasks(uuid, uuid, text[], boolean, boolean) to authenticated;
grant execute on function public.get_task(uuid) to authenticated;
grant execute on function public.list_task_activity(uuid) to authenticated;
grant execute on function public.list_task_comments(uuid, boolean) to authenticated;
grant execute on function public.list_task_attachments(uuid, boolean) to authenticated;

grant execute on function public.create_task(jsonb) to authenticated;
grant execute on function public.update_task(uuid, jsonb) to authenticated;
grant execute on function public.assign_task(uuid, uuid) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.reopen_task(uuid) to authenticated;
grant execute on function public.archive_task(uuid, text) to authenticated;
grant execute on function public.soft_delete_task(uuid, text) to authenticated;
grant execute on function public.restore_task(uuid) to authenticated;
grant execute on function public.create_task_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.update_task_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_task_comment(uuid) to authenticated;
grant execute on function public.add_task_link(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.remove_task_link(uuid) to authenticated;

commit;
