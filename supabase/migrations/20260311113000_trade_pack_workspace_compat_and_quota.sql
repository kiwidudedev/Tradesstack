-- Safe migration toward Trade Pack workspaces without breaking legacy project dependencies.
-- Keeps public.organization_projects as the source of truth for existing flows.
-- Adds:
-- 1) organization-level plan settings + monthly trade-pack-workspace limits
-- 2) DB-enforced monthly creation quota on organization_projects inserts
-- 3) compatibility table public.trade_pack_workspaces synced from organization_projects

create table if not exists public.organization_plan_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan_tier text not null default 'starter',
  monthly_trade_pack_limit integer not null default 4,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_plan_settings_plan_tier_check check (plan_tier in ('starter', 'professional', 'business')),
  constraint organization_plan_settings_monthly_limit_positive check (monthly_trade_pack_limit > 0)
);

insert into public.organization_plan_settings (organization_id, plan_tier, monthly_trade_pack_limit)
select o.id, 'starter', 4
from public.organizations o
on conflict (organization_id) do nothing;

create or replace function public.create_default_organization_plan_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_plan_settings (organization_id, plan_tier, monthly_trade_pack_limit)
  values (new.id, 'starter', 4)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_default_organization_plan_settings on public.organizations;
create trigger create_default_organization_plan_settings
after insert on public.organizations
for each row
execute function public.create_default_organization_plan_settings();

drop trigger if exists set_organization_plan_settings_updated_at on public.organization_plan_settings;
create trigger set_organization_plan_settings_updated_at
before update on public.organization_plan_settings
for each row
execute function public.set_updated_at();

create or replace function public.default_trade_pack_monthly_limit(plan_tier text)
returns integer
language sql
immutable
as $$
  select case lower(trim(coalesce(plan_tier, 'starter')))
    when 'starter' then 4
    when 'professional' then 12
    when 'business' then 30
    else 4
  end;
$$;

create or replace function public.get_trade_pack_monthly_limit_for_organization(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_plan_tier text;
  v_limit integer;
begin
  if p_organization_id is null then
    return 4;
  end if;

  select s.plan_tier, s.monthly_trade_pack_limit
  into v_plan_tier, v_limit
  from public.organization_plan_settings s
  where s.organization_id = p_organization_id
  limit 1;

  if v_limit is not null and v_limit > 0 then
    return v_limit;
  end if;

  return public.default_trade_pack_monthly_limit(v_plan_tier);
end;
$$;

create or replace function public.count_trade_pack_workspaces_created_in_month(
  p_organization_id uuid,
  p_reference_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_count integer := 0;
begin
  if p_organization_id is null then
    return 0;
  end if;

  v_month_start := date_trunc('month', coalesce(p_reference_at, now()));
  v_month_end := v_month_start + interval '1 month';

  select count(*)
  into v_count
  from public.organization_projects p
  where p.organization_id = p_organization_id
    and p.created_at >= v_month_start
    and p.created_at < v_month_end;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.can_create_trade_pack_workspace(
  p_organization_id uuid,
  p_reference_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_limit integer;
  v_created integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    return false;
  end if;

  v_limit := public.get_trade_pack_monthly_limit_for_organization(p_organization_id);
  v_created := public.count_trade_pack_workspaces_created_in_month(p_organization_id, p_reference_at);

  return v_created < v_limit;
end;
$$;

create or replace function public.get_trade_pack_workspace_quota(
  p_organization_id uuid,
  p_reference_at timestamptz default now()
)
returns table (
  plan_tier text,
  monthly_limit integer,
  created_count integer,
  remaining integer,
  month_start timestamptz,
  month_end timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_plan_tier text;
  v_limit integer;
  v_created integer;
begin
  if auth.uid() is null then
    return;
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    return;
  end if;

  v_month_start := date_trunc('month', coalesce(p_reference_at, now()));
  v_month_end := v_month_start + interval '1 month';

  select s.plan_tier, s.monthly_trade_pack_limit
  into v_plan_tier, v_limit
  from public.organization_plan_settings s
  where s.organization_id = p_organization_id
  limit 1;

  if v_plan_tier is null then
    v_plan_tier := 'starter';
  end if;

  if v_limit is null or v_limit <= 0 then
    v_limit := public.default_trade_pack_monthly_limit(v_plan_tier);
  end if;

  v_created := public.count_trade_pack_workspaces_created_in_month(p_organization_id, p_reference_at);

  return query
  select
    v_plan_tier,
    v_limit,
    v_created,
    greatest(v_limit - v_created, 0),
    v_month_start,
    v_month_end;
end;
$$;

alter table public.organization_plan_settings enable row level security;

drop policy if exists "Members can view organization plan settings" on public.organization_plan_settings;
create policy "Members can view organization plan settings"
on public.organization_plan_settings
for select
using (
  public.is_member_of_organization(organization_plan_settings.organization_id)
);

drop policy if exists "Admins can manage organization plan settings" on public.organization_plan_settings;
create policy "Admins can manage organization plan settings"
on public.organization_plan_settings
for all
using (
  public.is_admin_of_organization(organization_plan_settings.organization_id)
)
with check (
  public.is_admin_of_organization(organization_plan_settings.organization_id)
);

grant select, insert, update on public.organization_plan_settings to authenticated;
grant execute on function public.default_trade_pack_monthly_limit(text) to authenticated;
grant execute on function public.get_trade_pack_monthly_limit_for_organization(uuid) to authenticated;
grant execute on function public.count_trade_pack_workspaces_created_in_month(uuid, timestamptz) to authenticated;
grant execute on function public.can_create_trade_pack_workspace(uuid, timestamptz) to authenticated;
grant execute on function public.get_trade_pack_workspace_quota(uuid, timestamptz) to authenticated;

drop policy if exists "Members can create organization projects" on public.organization_projects;
create policy "Members can create organization projects"
on public.organization_projects
for insert
with check (
  organization_projects.created_by = auth.uid()
  and public.is_member_of_organization(organization_projects.organization_id)
  and coalesce(organization_projects.created_at, now()) >= date_trunc('month', now())
  and coalesce(organization_projects.created_at, now()) < (date_trunc('month', now()) + interval '1 month')
  and public.can_create_trade_pack_workspace(organization_projects.organization_id, now())
);

-- Compatibility table for "trade_pack_workspace" terminology.
-- Legacy source-of-truth remains organization_projects during this phase.
-- Historical clean-install correction: organization_projects did not yet have
-- cover_image_url when this migration's compatibility backfill and sync trigger
-- first referenced it. The column must therefore be introduced here, before
-- those statements execute, or a database migrating from zero stops at this
-- migration. This only makes the existing migration chain executable; it does
-- not change runtime business behaviour.
alter table public.organization_projects
  add column if not exists cover_image_url text;

create table if not exists public.trade_pack_workspaces (
  id uuid primary key default gen_random_uuid(),
  legacy_project_id uuid not null references public.organization_projects (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  stage text not null default 'Planning',
  location text not null default 'Unspecified',
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_pack_workspaces_name_not_blank check (char_length(trim(name)) > 0),
  constraint trade_pack_workspaces_slug_not_blank check (char_length(trim(slug)) > 0),
  constraint trade_pack_workspaces_stage_check check (stage in ('Planning', 'Estimating', 'In Delivery')),
  constraint trade_pack_workspaces_legacy_project_unique unique (legacy_project_id),
  constraint trade_pack_workspaces_org_slug_unique unique (organization_id, slug)
);

create index if not exists trade_pack_workspaces_org_idx
  on public.trade_pack_workspaces (organization_id);

create index if not exists trade_pack_workspaces_org_created_at_idx
  on public.trade_pack_workspaces (organization_id, created_at desc);

drop trigger if exists set_trade_pack_workspaces_updated_at on public.trade_pack_workspaces;
create trigger set_trade_pack_workspaces_updated_at
before update on public.trade_pack_workspaces
for each row
execute function public.set_updated_at();

insert into public.trade_pack_workspaces (
  legacy_project_id,
  organization_id,
  created_by,
  name,
  slug,
  stage,
  location,
  cover_image_url,
  created_at,
  updated_at
)
select
  p.id,
  p.organization_id,
  p.created_by,
  p.name,
  p.slug,
  p.stage,
  p.location,
  p.cover_image_url,
  p.created_at,
  p.updated_at
from public.organization_projects p
on conflict (legacy_project_id) do update
set
  organization_id = excluded.organization_id,
  created_by = excluded.created_by,
  name = excluded.name,
  slug = excluded.slug,
  stage = excluded.stage,
  location = excluded.location,
  cover_image_url = excluded.cover_image_url,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

create or replace function public.sync_trade_pack_workspace_from_legacy_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.trade_pack_workspaces
    where legacy_project_id = old.id;
    return old;
  end if;

  insert into public.trade_pack_workspaces (
    legacy_project_id,
    organization_id,
    created_by,
    name,
    slug,
    stage,
    location,
    cover_image_url,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.organization_id,
    new.created_by,
    new.name,
    new.slug,
    new.stage,
    new.location,
    new.cover_image_url,
    new.created_at,
    new.updated_at
  )
  on conflict (legacy_project_id) do update
  set
    organization_id = excluded.organization_id,
    created_by = excluded.created_by,
    name = excluded.name,
    slug = excluded.slug,
    stage = excluded.stage,
    location = excluded.location,
    cover_image_url = excluded.cover_image_url,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists sync_trade_pack_workspace_from_legacy_project on public.organization_projects;
create trigger sync_trade_pack_workspace_from_legacy_project
after insert or update or delete on public.organization_projects
for each row
execute function public.sync_trade_pack_workspace_from_legacy_project();

alter table public.trade_pack_workspaces enable row level security;

drop policy if exists "Members can view trade pack workspaces" on public.trade_pack_workspaces;
create policy "Members can view trade pack workspaces"
on public.trade_pack_workspaces
for select
using (
  public.is_member_of_organization(trade_pack_workspaces.organization_id)
);

drop policy if exists "Admins can manage trade pack workspaces" on public.trade_pack_workspaces;
create policy "Admins can manage trade pack workspaces"
on public.trade_pack_workspaces
for all
using (
  public.is_admin_of_organization(trade_pack_workspaces.organization_id)
)
with check (
  public.is_admin_of_organization(trade_pack_workspaces.organization_id)
);

grant select, insert, update, delete on public.trade_pack_workspaces to authenticated;

create or replace function public.is_generated_trade_pack_file(
  p_file_name text,
  p_storage_path text
)
returns boolean
language sql
immutable
as $$
  select
    upper(coalesce(p_file_name, '')) like '%TRADE PACK%'
    or upper(coalesce(p_storage_path, '')) like '%-TRADE-PACK.PDF%';
$$;

create or replace function public.can_run_trade_pack_builder_once(
  p_organization_id uuid,
  p_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    return false;
  end if;

  return not exists (
    select 1
    from public.project_drawing_sets ds
    where ds.organization_id = p_organization_id
      and ds.project_id = p_project_id
      and public.is_generated_trade_pack_file(ds.file_name, ds.storage_path)
  );
end;
$$;

create or replace function public.can_run_scope_builder_once(
  p_organization_id uuid,
  p_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    return false;
  end if;

  return not exists (
    select 1
    from public.scope_runs s
    where s.organization_id = p_organization_id
      and s.project_id = p_project_id
      and s.status = 'complete'
  );
end;
$$;

create or replace function public.can_run_change_detection_once(
  p_organization_id uuid,
  p_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    return false;
  end if;

  return not exists (
    select 1
    from public.change_detection_runs c
    where c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.status = 'complete'
  );
end;
$$;

grant execute on function public.is_generated_trade_pack_file(text, text) to authenticated;
grant execute on function public.can_run_trade_pack_builder_once(uuid, uuid) to authenticated;
grant execute on function public.can_run_scope_builder_once(uuid, uuid) to authenticated;
grant execute on function public.can_run_change_detection_once(uuid, uuid) to authenticated;

drop policy if exists "Members can upload project drawing sets" on public.project_drawing_sets;
create policy "Members can upload project drawing sets"
on public.project_drawing_sets
for insert
with check (
  project_drawing_sets.uploaded_by = auth.uid()
  and project_drawing_sets.storage_path like project_drawing_sets.organization_id::text || '/' || project_drawing_sets.project_id::text || '/%'
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_drawing_sets.project_id
      and p.organization_id = project_drawing_sets.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
  and (
    not public.is_generated_trade_pack_file(project_drawing_sets.file_name, project_drawing_sets.storage_path)
    or public.can_run_trade_pack_builder_once(project_drawing_sets.organization_id, project_drawing_sets.project_id)
  )
);

drop policy if exists "Members can insert scope runs" on public.scope_runs;
create policy "Members can insert scope runs"
on public.scope_runs
for insert
with check (
  scope_runs.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = scope_runs.project_id
      and p.organization_id = scope_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
  and public.can_run_scope_builder_once(scope_runs.organization_id, scope_runs.project_id)
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
  and public.can_run_change_detection_once(change_detection_runs.organization_id, change_detection_runs.project_id)
);
