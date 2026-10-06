begin;

alter table public.assistant_tool_calls
  drop constraint if exists assistant_tool_calls_status_check;

alter table public.assistant_tool_calls
  add constraint assistant_tool_calls_status_check
  check (status in ('requested', 'started', 'succeeded', 'completed', 'empty', 'denied', 'failed', 'truncated'));

update public.assistant_configuration
set allowed_modules = array_append(allowed_modules, 'project_briefing')
where not ('project_briefing' = any(allowed_modules));

comment on column public.assistant_tool_calls.status is
  'Assistant read execution lifecycle/status. completed is retained for backward compatibility; new writes use succeeded, empty, denied, failed, or truncated.';

commit;
