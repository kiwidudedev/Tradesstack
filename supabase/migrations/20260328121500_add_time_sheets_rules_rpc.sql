create index if not exists project_time_sheet_entries_rules_idx
  on public.project_time_sheet_entries (clock_out_at, clock_in_at, warning_8h5_at);

create or replace function public.process_project_time_sheet_rules(
  p_now timestamptz default now(),
  p_project_id uuid default null,
  p_max_rows integer default 2000
)
returns table (
  processed_warnings integer,
  processed_auto_clock_outs integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_limit integer := greatest(1, coalesce(p_max_rows, 2000));
begin
  return query
  with candidate_entries as (
    select
      e.id,
      e.organization_id,
      e.project_id,
      e.worker_name,
      e.notes,
      extract(epoch from (v_now - e.clock_in_at)) / 3600.0 as elapsed_hours
    from public.project_time_sheet_entries e
    where e.clock_out_at is null
      and e.clock_in_at <= (v_now - interval '8 hours 30 minutes')
      and (p_project_id is null or e.project_id = p_project_id)
    order by e.clock_in_at asc
    limit v_limit
  ),
  warning_targets as (
    select c.*
    from candidate_entries c
    join public.project_time_sheet_entries e on e.id = c.id
    where c.elapsed_hours >= 8.5
      and c.elapsed_hours < 10
      and e.warning_8h5_at is null
  ),
  warning_updates as (
    update public.project_time_sheet_entries e
      set warning_8h5_at = v_now
    from warning_targets t
    where e.id = t.id
    returning e.id, e.organization_id, e.project_id, e.worker_name
  ),
  warning_events as (
    insert into public.project_time_sheet_events (
      organization_id,
      project_id,
      entry_id,
      actor_user_id,
      worker_name,
      event_type,
      message
    )
    select
      w.organization_id,
      w.project_id,
      w.id,
      null,
      w.worker_name,
      'warning_8h5',
      w.worker_name || ' - 8.5h warning triggered'
    from warning_updates w
    returning id
  ),
  auto_targets as (
    select c.*
    from candidate_entries c
    where c.elapsed_hours >= 10
  ),
  auto_updates as (
    update public.project_time_sheet_entries e
      set clock_out_at = v_now,
          auto_clocked_out = true,
          auto_clocked_out_at = v_now,
          total_hours = round(t.elapsed_hours::numeric, 2),
          notes = case
            when position('Auto clock-out applied at 10 hour limit.' in coalesce(e.notes, '')) > 0 then e.notes
            when char_length(trim(coalesce(e.notes, ''))) = 0 then 'Auto clock-out applied at 10 hour limit.'
            else e.notes || E'\n' || 'Auto clock-out applied at 10 hour limit.'
          end
    from auto_targets t
    where e.id = t.id
      and e.clock_out_at is null
    returning e.id, e.organization_id, e.project_id, e.worker_name
  ),
  auto_events as (
    insert into public.project_time_sheet_events (
      organization_id,
      project_id,
      entry_id,
      actor_user_id,
      worker_name,
      event_type,
      message
    )
    select
      a.organization_id,
      a.project_id,
      a.id,
      null,
      a.worker_name,
      'auto_clock_out',
      'Auto clock-out applied - ' || a.worker_name || ' reached 10 hours'
    from auto_updates a
    returning id
  )
  select
    (select count(*)::integer from warning_updates) as processed_warnings,
    (select count(*)::integer from auto_updates) as processed_auto_clock_outs;
end;
$$;

revoke all on function public.process_project_time_sheet_rules(timestamptz, uuid, integer) from public;
grant execute on function public.process_project_time_sheet_rules(timestamptz, uuid, integer) to service_role;
