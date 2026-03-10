create table if not exists public.request_rate_limits (
  route_key text not null,
  subject_key text not null,
  window_start timestamptz not null,
  hit_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (route_key, subject_key, window_start)
);

create index if not exists request_rate_limits_updated_at_idx
  on public.request_rate_limits (updated_at desc);

create table if not exists public.request_concurrency_limits (
  route_key text not null,
  subject_key text not null,
  active_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (route_key, subject_key)
);

create index if not exists request_concurrency_limits_updated_at_idx
  on public.request_concurrency_limits (updated_at desc);

revoke all on public.request_rate_limits from public;
revoke all on public.request_rate_limits from anon;
revoke all on public.request_rate_limits from authenticated;

revoke all on public.request_concurrency_limits from public;
revoke all on public.request_concurrency_limits from anon;
revoke all on public.request_concurrency_limits from authenticated;

create or replace function public.enforce_shared_rate_limit(
  p_route_key text,
  p_subject_key text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_seconds integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_limit integer := greatest(coalesce(p_limit, 0), 0);
  v_window_start timestamptz;
  v_hit_count integer;
begin
  if v_limit = 0 then
    return true;
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds);

  insert into public.request_rate_limits (route_key, subject_key, window_start, hit_count, updated_at)
  values (p_route_key, p_subject_key, v_window_start, 1, now())
  on conflict (route_key, subject_key, window_start)
  do update
    set hit_count = request_rate_limits.hit_count + 1,
        updated_at = now()
    where request_rate_limits.hit_count < v_limit
  returning hit_count into v_hit_count;

  return v_hit_count is not null;
end;
$$;

create or replace function public.acquire_shared_concurrency_slot(
  p_route_key text,
  p_subject_key text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 0), 0);
  v_active_count integer;
begin
  if v_limit = 0 then
    return true;
  end if;

  insert into public.request_concurrency_limits (route_key, subject_key, active_count, updated_at)
  values (p_route_key, p_subject_key, 1, now())
  on conflict (route_key, subject_key)
  do update
    set active_count = request_concurrency_limits.active_count + 1,
        updated_at = now()
    where request_concurrency_limits.active_count < v_limit
  returning active_count into v_active_count;

  return v_active_count is not null;
end;
$$;

create or replace function public.release_shared_concurrency_slot(
  p_route_key text,
  p_subject_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_count integer;
begin
  update public.request_concurrency_limits
  set active_count = greatest(active_count - 1, 0),
      updated_at = now()
  where route_key = p_route_key
    and subject_key = p_subject_key
  returning active_count into v_active_count;

  if v_active_count is null then
    return false;
  end if;

  if v_active_count = 0 then
    delete from public.request_concurrency_limits
    where route_key = p_route_key
      and subject_key = p_subject_key;
  end if;

  return true;
end;
$$;

grant execute on function public.enforce_shared_rate_limit(text, text, integer, integer) to authenticated;
grant execute on function public.acquire_shared_concurrency_slot(text, text, integer) to authenticated;
grant execute on function public.release_shared_concurrency_slot(text, text) to authenticated;

alter table public.ai_chat_usage
  add column if not exists reservation_state text not null default 'committed';

alter table public.ai_chat_usage
  drop constraint if exists ai_chat_usage_reservation_state_valid;

alter table public.ai_chat_usage
  add constraint ai_chat_usage_reservation_state_valid
  check (reservation_state in ('pending', 'committed'));

create index if not exists ai_chat_usage_user_state_created_at_idx
  on public.ai_chat_usage (user_id, reservation_state, created_at desc);

create or replace function public.reserve_ai_chat_usage_quota(
  p_user_id uuid,
  p_organization_id uuid,
  p_project_slug text,
  p_plan_tier text,
  p_month_start timestamptz,
  p_monthly_limit integer
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_month_start timestamptz := date_trunc('month', coalesce(p_month_start, now()));
  v_usage_id uuid;
  v_lock_namespace integer := hashtext('ai_chat_usage_quota');
  v_lock_key integer;
begin
  if auth.uid() is distinct from p_user_id then
    return null;
  end if;

  if coalesce(p_monthly_limit, 0) <= 0 then
    return null;
  end if;

  v_lock_key := hashtext(p_user_id::text || ':' || to_char(v_month_start, 'YYYY-MM'));
  perform pg_advisory_xact_lock(v_lock_namespace, v_lock_key);

  if (
    select count(*)
    from public.ai_chat_usage u
    where u.user_id = p_user_id
      and u.created_at >= v_month_start
      and u.reservation_state in ('pending', 'committed')
  ) >= p_monthly_limit then
    return null;
  end if;

  insert into public.ai_chat_usage (
    user_id,
    organization_id,
    project_slug,
    plan_tier,
    tokens_used,
    response_chars,
    created_at,
    reservation_state
  )
  values (
    p_user_id,
    p_organization_id,
    p_project_slug,
    coalesce(nullif(trim(p_plan_tier), ''), 'starter'),
    0,
    0,
    now(),
    'pending'
  )
  returning id into v_usage_id;

  return v_usage_id;
end;
$$;

create or replace function public.commit_ai_chat_quota_reservation(
  p_usage_id uuid,
  p_tokens_used integer,
  p_response_chars integer
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.ai_chat_usage
  set tokens_used = greatest(coalesce(p_tokens_used, 0), 0),
      response_chars = greatest(coalesce(p_response_chars, 0), 0),
      reservation_state = 'committed'
  where id = p_usage_id
    and user_id = auth.uid()
    and reservation_state = 'pending';

  return found;
end;
$$;

create or replace function public.release_ai_chat_quota_reservation(
  p_usage_id uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.ai_chat_usage
  where id = p_usage_id
    and user_id = auth.uid()
    and reservation_state = 'pending';

  return found;
end;
$$;

grant execute on function public.reserve_ai_chat_usage_quota(uuid, uuid, text, text, timestamptz, integer) to authenticated;
grant execute on function public.commit_ai_chat_quota_reservation(uuid, integer, integer) to authenticated;
grant execute on function public.release_ai_chat_quota_reservation(uuid) to authenticated;

create table if not exists public.change_detection_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  trade_pack_id uuid not null references public.project_drawing_sets (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  baseline_revision text not null default 'Rev A',
  revised_revision text not null default 'Rev B',
  revised_file_name text not null,
  status text not null default 'running',
  validation_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_detection_runs_status_valid check (status in ('running', 'complete', 'failed')),
  constraint change_detection_runs_baseline_revision_not_blank check (char_length(trim(baseline_revision)) > 0),
  constraint change_detection_runs_revised_revision_not_blank check (char_length(trim(revised_revision)) > 0),
  constraint change_detection_runs_revised_file_name_not_blank check (char_length(trim(revised_file_name)) > 0),
  constraint change_detection_runs_validation_json_object check (jsonb_typeof(validation_json) = 'object'),
  constraint change_detection_runs_result_json_object check (jsonb_typeof(result_json) = 'object')
);

create index if not exists change_detection_runs_project_status_created_idx
  on public.change_detection_runs (project_id, status, created_at desc);

create index if not exists change_detection_runs_trade_pack_created_idx
  on public.change_detection_runs (trade_pack_id, created_at desc);

drop trigger if exists set_change_detection_runs_updated_at on public.change_detection_runs;
create trigger set_change_detection_runs_updated_at
before update on public.change_detection_runs
for each row
execute function public.set_updated_at();

alter table public.change_detection_runs enable row level security;
alter table public.change_detection_runs force row level security;

drop policy if exists "Members can view change detection runs" on public.change_detection_runs;
create policy "Members can view change detection runs"
on public.change_detection_runs
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = change_detection_runs.project_id
      and p.organization_id = change_detection_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can insert change detection runs" on public.change_detection_runs;
create policy "Members can insert change detection runs"
on public.change_detection_runs
for insert
with check (
  change_detection_runs.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = change_detection_runs.project_id
      and p.organization_id = change_detection_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
  and exists (
    select 1
    from public.project_drawing_sets ds
    where ds.id = change_detection_runs.trade_pack_id
      and ds.project_id = change_detection_runs.project_id
      and ds.organization_id = change_detection_runs.organization_id
  )
);

drop policy if exists "Members can update change detection runs" on public.change_detection_runs;
create policy "Members can update change detection runs"
on public.change_detection_runs
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = change_detection_runs.project_id
      and p.organization_id = change_detection_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = change_detection_runs.project_id
      and p.organization_id = change_detection_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
  and exists (
    select 1
    from public.project_drawing_sets ds
    where ds.id = change_detection_runs.trade_pack_id
      and ds.project_id = change_detection_runs.project_id
      and ds.organization_id = change_detection_runs.organization_id
  )
);

grant select, insert, update on public.change_detection_runs to authenticated;
