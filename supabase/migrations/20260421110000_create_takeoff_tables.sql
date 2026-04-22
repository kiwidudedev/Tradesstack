do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'takeoff_measurement_kind'
  ) then
    create type public.takeoff_measurement_kind as enum ('line', 'area', 'count');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'takeoff_measurement_status'
  ) then
    create type public.takeoff_measurement_status as enum ('active', 'archived', 'deleted');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'takeoff_measurement_source'
  ) then
    create type public.takeoff_measurement_source as enum ('manual', 'ai', 'imported');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'takeoff_group_status'
  ) then
    create type public.takeoff_group_status as enum ('active', 'archived');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'takeoff_event_type'
  ) then
    create type public.takeoff_event_type as enum (
      'created',
      'updated',
      'recalculated',
      'archived',
      'deleted',
      'restored'
    );
  end if;
end
$$;

create table if not exists public.takeoff_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  drawing_set_id uuid not null references public.project_drawing_sets (id) on delete cascade,
  page_number integer not null,
  page_label text null,
  page_width_pts numeric(12, 4) not null,
  page_height_pts numeric(12, 4) not null,
  rotation_degrees integer not null default 0,
  source_revision text null,
  preview_storage_path text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint takeoff_pages_page_number_positive check (page_number > 0),
  constraint takeoff_pages_page_dimensions_positive check (page_width_pts > 0 and page_height_pts > 0),
  constraint takeoff_pages_rotation_valid check (rotation_degrees in (0, 90, 180, 270)),
  constraint takeoff_pages_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint takeoff_pages_unique_per_drawing unique (organization_id, drawing_set_id, page_number)
);

create table if not exists public.takeoff_calibrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  page_id uuid not null references public.takeoff_pages (id) on delete cascade,
  name text not null default 'Default calibration',
  scale_ratio numeric(20, 10) not null,
  unit_system text not null default 'metric',
  base_unit text not null,
  display_unit text not null,
  reference_length_input numeric(20, 6) not null,
  reference_length_base numeric(20, 6) not null,
  point_a_x numeric(12, 8) not null,
  point_a_y numeric(12, 8) not null,
  point_b_x numeric(12, 8) not null,
  point_b_y numeric(12, 8) not null,
  is_active boolean not null default true,
  superseded_by uuid null references public.takeoff_calibrations (id) on delete set null,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint takeoff_calibrations_name_not_blank check (char_length(trim(name)) > 0),
  constraint takeoff_calibrations_scale_positive check (scale_ratio > 0),
  constraint takeoff_calibrations_reference_positive check (reference_length_input > 0 and reference_length_base > 0),
  constraint takeoff_calibrations_unit_system_valid check (unit_system in ('metric', 'imperial')),
  constraint takeoff_calibrations_points_normalized check (
    point_a_x >= 0 and point_a_x <= 1 and
    point_a_y >= 0 and point_a_y <= 1 and
    point_b_x >= 0 and point_b_x <= 1 and
    point_b_y >= 0 and point_b_y <= 1
  ),
  constraint takeoff_calibrations_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.takeoff_measurement_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  parent_group_id uuid null references public.takeoff_measurement_groups (id) on delete set null,
  name text not null,
  code text null,
  color_hex text null,
  sort_order integer not null default 0,
  status public.takeoff_group_status not null default 'active',
  trade_id text null,
  trade_label text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint takeoff_measurement_groups_name_not_blank check (char_length(trim(name)) > 0),
  constraint takeoff_measurement_groups_sort_order_nonnegative check (sort_order >= 0),
  constraint takeoff_measurement_groups_color_valid check (
    color_hex is null or color_hex ~ '^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$'
  ),
  constraint takeoff_measurement_groups_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.takeoff_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  drawing_set_id uuid not null references public.project_drawing_sets (id) on delete cascade,
  page_id uuid not null references public.takeoff_pages (id) on delete cascade,
  calibration_id uuid null references public.takeoff_calibrations (id) on delete set null,
  group_id uuid null references public.takeoff_measurement_groups (id) on delete set null,
  measurement_kind public.takeoff_measurement_kind not null,
  status public.takeoff_measurement_status not null default 'active',
  source public.takeoff_measurement_source not null default 'manual',
  name text not null default '',
  description text not null default '',
  color_hex text null,
  quantity numeric(20, 6) not null default 1,
  count_value integer null,
  measured_length_base numeric(20, 6) null,
  measured_area_base numeric(20, 6) null,
  display_value numeric(20, 6) null,
  display_unit text null,
  page_bbox_min_x numeric(12, 8) null,
  page_bbox_min_y numeric(12, 8) null,
  page_bbox_max_x numeric(12, 8) null,
  page_bbox_max_y numeric(12, 8) null,
  ai_confidence numeric(5, 4) null,
  ai_model text null,
  ai_run_id uuid null,
  external_ref text null,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid not null references auth.users (id) on delete cascade,
  updated_by uuid null references auth.users (id) on delete set null,
  archived_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint takeoff_measurements_quantity_positive check (quantity > 0),
  constraint takeoff_measurements_count_nonnegative check (count_value is null or count_value >= 0),
  constraint takeoff_measurements_version_positive check (version > 0),
  constraint takeoff_measurements_ai_confidence_valid check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  constraint takeoff_measurements_color_valid check (
    color_hex is null or color_hex ~ '^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$'
  ),
  constraint takeoff_measurements_bbox_normalized check (
    (page_bbox_min_x is null or (page_bbox_min_x >= 0 and page_bbox_min_x <= 1)) and
    (page_bbox_min_y is null or (page_bbox_min_y >= 0 and page_bbox_min_y <= 1)) and
    (page_bbox_max_x is null or (page_bbox_max_x >= 0 and page_bbox_max_x <= 1)) and
    (page_bbox_max_y is null or (page_bbox_max_y >= 0 and page_bbox_max_y <= 1))
  ),
  constraint takeoff_measurements_bbox_order check (
    (page_bbox_min_x is null or page_bbox_max_x is null or page_bbox_min_x <= page_bbox_max_x) and
    (page_bbox_min_y is null or page_bbox_max_y is null or page_bbox_min_y <= page_bbox_max_y)
  ),
  constraint takeoff_measurements_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint takeoff_measurements_calibration_required check (
    (measurement_kind = 'count')
    or
    (measurement_kind in ('line', 'area') and calibration_id is not null)
  ),
  constraint takeoff_measurements_kind_shape check (
    (measurement_kind = 'line' and measured_length_base is not null and measured_area_base is null and count_value is null) or
    (measurement_kind = 'area' and measured_area_base is not null and measured_length_base is null and count_value is null) or
    (measurement_kind = 'count' and count_value is not null and measured_length_base is null and measured_area_base is null)
  )
);

create table if not exists public.takeoff_measurement_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  measurement_id uuid not null references public.takeoff_measurements (id) on delete cascade,
  point_order integer not null,
  x numeric(12, 8) not null,
  y numeric(12, 8) not null,
  created_at timestamptz not null default now(),
  constraint takeoff_measurement_points_point_order_nonnegative check (point_order >= 0),
  constraint takeoff_measurement_points_x_normalized check (x >= 0 and x <= 1),
  constraint takeoff_measurement_points_y_normalized check (y >= 0 and y <= 1),
  constraint takeoff_measurement_points_unique_order unique (measurement_id, point_order)
);

create table if not exists public.takeoff_measurement_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  measurement_id uuid not null references public.takeoff_measurements (id) on delete cascade,
  event_type public.takeoff_event_type not null,
  version integer not null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  change_reason text null,
  snapshot jsonb not null,
  diff jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint takeoff_measurement_events_version_positive check (version > 0),
  constraint takeoff_measurement_events_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint takeoff_measurement_events_diff_object check (jsonb_typeof(diff) = 'object'),
  constraint takeoff_measurement_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists takeoff_pages_project_drawing_page_idx
  on public.takeoff_pages (organization_id, project_id, drawing_set_id, page_number);

create index if not exists takeoff_pages_project_created_idx
  on public.takeoff_pages (organization_id, project_id, created_at desc);

create index if not exists takeoff_pages_opportunity_created_idx
  on public.takeoff_pages (organization_id, opportunity_id, created_at desc)
  where opportunity_id is not null;

create unique index if not exists takeoff_calibrations_one_active_per_page_idx
  on public.takeoff_calibrations (page_id)
  where is_active = true;

create index if not exists takeoff_calibrations_project_page_created_idx
  on public.takeoff_calibrations (organization_id, project_id, page_id, created_at desc);

create index if not exists takeoff_measurement_groups_project_status_sort_idx
  on public.takeoff_measurement_groups (organization_id, project_id, status, sort_order, created_at desc);

create index if not exists takeoff_measurement_groups_parent_idx
  on public.takeoff_measurement_groups (parent_group_id);

create index if not exists takeoff_measurements_project_page_status_idx
  on public.takeoff_measurements (organization_id, project_id, page_id, status, created_at desc);

create index if not exists takeoff_measurements_project_kind_status_idx
  on public.takeoff_measurements (organization_id, project_id, measurement_kind, status, created_at desc);

create index if not exists takeoff_measurements_group_status_idx
  on public.takeoff_measurements (organization_id, group_id, status, created_at desc)
  where group_id is not null;

create index if not exists takeoff_measurements_drawing_page_idx
  on public.takeoff_measurements (organization_id, drawing_set_id, page_id, created_at desc);

create index if not exists takeoff_measurements_opportunity_created_idx
  on public.takeoff_measurements (organization_id, opportunity_id, created_at desc)
  where opportunity_id is not null;

create index if not exists takeoff_measurement_points_measurement_order_idx
  on public.takeoff_measurement_points (measurement_id, point_order);

create index if not exists takeoff_measurement_events_measurement_version_idx
  on public.takeoff_measurement_events (measurement_id, version desc);

create index if not exists takeoff_measurement_events_project_created_idx
  on public.takeoff_measurement_events (organization_id, project_id, created_at desc);

create index if not exists takeoff_measurement_events_opportunity_created_idx
  on public.takeoff_measurement_events (organization_id, opportunity_id, created_at desc)
  where opportunity_id is not null;

drop trigger if exists set_takeoff_pages_updated_at on public.takeoff_pages;
create trigger set_takeoff_pages_updated_at
before update on public.takeoff_pages
for each row execute function public.set_updated_at();

drop trigger if exists set_takeoff_calibrations_updated_at on public.takeoff_calibrations;
create trigger set_takeoff_calibrations_updated_at
before update on public.takeoff_calibrations
for each row execute function public.set_updated_at();

drop trigger if exists set_takeoff_measurement_groups_updated_at on public.takeoff_measurement_groups;
create trigger set_takeoff_measurement_groups_updated_at
before update on public.takeoff_measurement_groups
for each row execute function public.set_updated_at();

drop trigger if exists set_takeoff_measurements_updated_at on public.takeoff_measurements;
create trigger set_takeoff_measurements_updated_at
before update on public.takeoff_measurements
for each row execute function public.set_updated_at();

create or replace function public.takeoff_opportunity_matches_project(
  p_organization_id uuid,
  p_project_id uuid,
  p_opportunity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_opportunity_id is null
    or exists (
      select 1
      from public.organization_opportunities o
      where o.id = p_opportunity_id
        and o.organization_id = p_organization_id
        and o.workspace_project_id = p_project_id
    );
$$;

grant execute on function public.takeoff_opportunity_matches_project(uuid, uuid, uuid) to authenticated;

create or replace function public.validate_takeoff_page_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  drawing_set_row public.project_drawing_sets%rowtype;
begin
  select *
  into drawing_set_row
  from public.project_drawing_sets
  where id = new.drawing_set_id;

  if drawing_set_row.id is null then
    raise exception 'Takeoff page drawing set does not exist.';
  end if;

  if drawing_set_row.organization_id <> new.organization_id then
    raise exception 'Takeoff page organization_id must match drawing set organization_id.';
  end if;

  if drawing_set_row.project_id <> new.project_id then
    raise exception 'Takeoff page project_id must match drawing set project_id.';
  end if;

  if not public.takeoff_opportunity_matches_project(new.organization_id, new.project_id, new.opportunity_id) then
    raise exception 'Takeoff page opportunity_id must reference an opportunity whose workspace_project_id matches project_id.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_takeoff_calibration_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  page_row public.takeoff_pages%rowtype;
begin
  select *
  into page_row
  from public.takeoff_pages
  where id = new.page_id;

  if page_row.id is null then
    raise exception 'Takeoff calibration page does not exist.';
  end if;

  if page_row.organization_id <> new.organization_id then
    raise exception 'Takeoff calibration organization_id must match page organization_id.';
  end if;

  if page_row.project_id <> new.project_id then
    raise exception 'Takeoff calibration project_id must match page project_id.';
  end if;

  if new.opportunity_id is not null and page_row.opportunity_id is not null and new.opportunity_id <> page_row.opportunity_id then
    raise exception 'Takeoff calibration opportunity_id must match page opportunity_id when page opportunity_id is present.';
  end if;

  if not public.takeoff_opportunity_matches_project(new.organization_id, new.project_id, new.opportunity_id) then
    raise exception 'Takeoff calibration opportunity_id must reference an opportunity whose workspace_project_id matches project_id.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_takeoff_measurement_group_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_group_row public.takeoff_measurement_groups%rowtype;
begin
  if not public.takeoff_opportunity_matches_project(new.organization_id, new.project_id, new.opportunity_id) then
    raise exception 'Takeoff measurement group opportunity_id must reference an opportunity whose workspace_project_id matches project_id.';
  end if;

  if new.parent_group_id is not null then
    select *
    into parent_group_row
    from public.takeoff_measurement_groups
    where id = new.parent_group_id;

    if parent_group_row.id is null then
      raise exception 'Parent takeoff measurement group does not exist.';
    end if;

    if parent_group_row.organization_id <> new.organization_id or parent_group_row.project_id <> new.project_id then
      raise exception 'Parent takeoff measurement group must belong to the same organization and project.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_takeoff_measurement_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  page_row public.takeoff_pages%rowtype;
  calibration_row public.takeoff_calibrations%rowtype;
  group_row public.takeoff_measurement_groups%rowtype;
begin
  select *
  into page_row
  from public.takeoff_pages
  where id = new.page_id;

  if page_row.id is null then
    raise exception 'Takeoff measurement page does not exist.';
  end if;

  if page_row.organization_id <> new.organization_id then
    raise exception 'Takeoff measurement organization_id must match page organization_id.';
  end if;

  if page_row.project_id <> new.project_id then
    raise exception 'Takeoff measurement project_id must match page project_id.';
  end if;

  if page_row.drawing_set_id <> new.drawing_set_id then
    raise exception 'Takeoff measurement drawing_set_id must match page drawing_set_id.';
  end if;

  if new.calibration_id is not null then
    select *
    into calibration_row
    from public.takeoff_calibrations
    where id = new.calibration_id;

    if calibration_row.id is null then
      raise exception 'Takeoff measurement calibration does not exist.';
    end if;

    if calibration_row.page_id <> new.page_id then
      raise exception 'Takeoff measurement calibration must belong to the same page.';
    end if;

    if calibration_row.project_id <> new.project_id or calibration_row.organization_id <> new.organization_id then
      raise exception 'Takeoff measurement calibration must belong to the same organization and project.';
    end if;
  end if;

  if new.group_id is not null then
    select *
    into group_row
    from public.takeoff_measurement_groups
    where id = new.group_id;

    if group_row.id is null then
      raise exception 'Takeoff measurement group does not exist.';
    end if;

    if group_row.project_id <> new.project_id or group_row.organization_id <> new.organization_id then
      raise exception 'Takeoff measurement group must belong to the same organization and project.';
    end if;
  end if;

  if new.opportunity_id is not null and page_row.opportunity_id is not null and new.opportunity_id <> page_row.opportunity_id then
    raise exception 'Takeoff measurement opportunity_id must match page opportunity_id when page opportunity_id is present.';
  end if;

  if not public.takeoff_opportunity_matches_project(new.organization_id, new.project_id, new.opportunity_id) then
    raise exception 'Takeoff measurement opportunity_id must reference an opportunity whose workspace_project_id matches project_id.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_takeoff_measurement_point_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  measurement_row public.takeoff_measurements%rowtype;
begin
  select *
  into measurement_row
  from public.takeoff_measurements
  where id = new.measurement_id;

  if measurement_row.id is null then
    raise exception 'Takeoff measurement point measurement does not exist.';
  end if;

  if measurement_row.organization_id <> new.organization_id then
    raise exception 'Takeoff measurement point organization_id must match measurement organization_id.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_takeoff_measurement_event_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  measurement_row public.takeoff_measurements%rowtype;
begin
  select *
  into measurement_row
  from public.takeoff_measurements
  where id = new.measurement_id;

  if measurement_row.id is null then
    raise exception 'Takeoff measurement event measurement does not exist.';
  end if;

  if measurement_row.organization_id <> new.organization_id then
    raise exception 'Takeoff measurement event organization_id must match measurement organization_id.';
  end if;

  if measurement_row.project_id <> new.project_id then
    raise exception 'Takeoff measurement event project_id must match measurement project_id.';
  end if;

  if measurement_row.opportunity_id is null and new.opportunity_id is not null then
    raise exception 'Takeoff measurement event opportunity_id must be null when measurement opportunity_id is null.';
  end if;

  if measurement_row.opportunity_id is not null and new.opportunity_id is not null and new.opportunity_id <> measurement_row.opportunity_id then
    raise exception 'Takeoff measurement event opportunity_id must match measurement opportunity_id when provided.';
  end if;

  if not public.takeoff_opportunity_matches_project(new.organization_id, new.project_id, new.opportunity_id) then
    raise exception 'Takeoff measurement event opportunity_id must reference an opportunity whose workspace_project_id matches project_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_takeoff_page_consistency on public.takeoff_pages;
create trigger validate_takeoff_page_consistency
before insert or update on public.takeoff_pages
for each row execute function public.validate_takeoff_page_consistency();

drop trigger if exists validate_takeoff_calibration_consistency on public.takeoff_calibrations;
create trigger validate_takeoff_calibration_consistency
before insert or update on public.takeoff_calibrations
for each row execute function public.validate_takeoff_calibration_consistency();

drop trigger if exists validate_takeoff_measurement_group_consistency on public.takeoff_measurement_groups;
create trigger validate_takeoff_measurement_group_consistency
before insert or update on public.takeoff_measurement_groups
for each row execute function public.validate_takeoff_measurement_group_consistency();

drop trigger if exists validate_takeoff_measurement_consistency on public.takeoff_measurements;
create trigger validate_takeoff_measurement_consistency
before insert or update on public.takeoff_measurements
for each row execute function public.validate_takeoff_measurement_consistency();

drop trigger if exists validate_takeoff_measurement_point_consistency on public.takeoff_measurement_points;
create trigger validate_takeoff_measurement_point_consistency
before insert or update on public.takeoff_measurement_points
for each row execute function public.validate_takeoff_measurement_point_consistency();

drop trigger if exists validate_takeoff_measurement_event_consistency on public.takeoff_measurement_events;
create trigger validate_takeoff_measurement_event_consistency
before insert or update on public.takeoff_measurement_events
for each row execute function public.validate_takeoff_measurement_event_consistency();

alter table public.takeoff_pages enable row level security;
alter table public.takeoff_calibrations enable row level security;
alter table public.takeoff_measurement_groups enable row level security;
alter table public.takeoff_measurements enable row level security;
alter table public.takeoff_measurement_points enable row level security;
alter table public.takeoff_measurement_events enable row level security;

drop policy if exists "Members can view takeoff pages" on public.takeoff_pages;
create policy "Members can view takeoff pages"
on public.takeoff_pages
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_pages.project_id
      and p.organization_id = takeoff_pages.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can create takeoff pages" on public.takeoff_pages;
create policy "Members can create takeoff pages"
on public.takeoff_pages
for insert
with check (
  takeoff_pages.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_pages.project_id
      and p.organization_id = takeoff_pages.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can update takeoff pages" on public.takeoff_pages;
create policy "Members can update takeoff pages"
on public.takeoff_pages
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_pages.project_id
      and p.organization_id = takeoff_pages.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_pages.project_id
      and p.organization_id = takeoff_pages.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Admins can delete takeoff pages" on public.takeoff_pages;
create policy "Admins can delete takeoff pages"
on public.takeoff_pages
for delete
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_pages.project_id
      and p.organization_id = takeoff_pages.organization_id
      and public.is_admin_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can view takeoff calibrations" on public.takeoff_calibrations;
create policy "Members can view takeoff calibrations"
on public.takeoff_calibrations
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_calibrations.project_id
      and p.organization_id = takeoff_calibrations.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can create takeoff calibrations" on public.takeoff_calibrations;
create policy "Members can create takeoff calibrations"
on public.takeoff_calibrations
for insert
with check (
  takeoff_calibrations.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_calibrations.project_id
      and p.organization_id = takeoff_calibrations.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can update takeoff calibrations" on public.takeoff_calibrations;
create policy "Members can update takeoff calibrations"
on public.takeoff_calibrations
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_calibrations.project_id
      and p.organization_id = takeoff_calibrations.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_calibrations.project_id
      and p.organization_id = takeoff_calibrations.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Admins can delete takeoff calibrations" on public.takeoff_calibrations;
create policy "Admins can delete takeoff calibrations"
on public.takeoff_calibrations
for delete
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_calibrations.project_id
      and p.organization_id = takeoff_calibrations.organization_id
      and public.is_admin_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can view takeoff measurement groups" on public.takeoff_measurement_groups;
create policy "Members can view takeoff measurement groups"
on public.takeoff_measurement_groups
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurement_groups.project_id
      and p.organization_id = takeoff_measurement_groups.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can create takeoff measurement groups" on public.takeoff_measurement_groups;
create policy "Members can create takeoff measurement groups"
on public.takeoff_measurement_groups
for insert
with check (
  takeoff_measurement_groups.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurement_groups.project_id
      and p.organization_id = takeoff_measurement_groups.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can update takeoff measurement groups" on public.takeoff_measurement_groups;
create policy "Members can update takeoff measurement groups"
on public.takeoff_measurement_groups
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurement_groups.project_id
      and p.organization_id = takeoff_measurement_groups.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurement_groups.project_id
      and p.organization_id = takeoff_measurement_groups.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Admins can delete takeoff measurement groups" on public.takeoff_measurement_groups;
create policy "Admins can delete takeoff measurement groups"
on public.takeoff_measurement_groups
for delete
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurement_groups.project_id
      and p.organization_id = takeoff_measurement_groups.organization_id
      and public.is_admin_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can view takeoff measurements" on public.takeoff_measurements;
create policy "Members can view takeoff measurements"
on public.takeoff_measurements
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurements.project_id
      and p.organization_id = takeoff_measurements.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can create takeoff measurements" on public.takeoff_measurements;
create policy "Members can create takeoff measurements"
on public.takeoff_measurements
for insert
with check (
  takeoff_measurements.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurements.project_id
      and p.organization_id = takeoff_measurements.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can update takeoff measurements" on public.takeoff_measurements;
create policy "Members can update takeoff measurements"
on public.takeoff_measurements
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurements.project_id
      and p.organization_id = takeoff_measurements.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurements.project_id
      and p.organization_id = takeoff_measurements.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Admins can delete takeoff measurements" on public.takeoff_measurements;
create policy "Admins can delete takeoff measurements"
on public.takeoff_measurements
for delete
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurements.project_id
      and p.organization_id = takeoff_measurements.organization_id
      and public.is_admin_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can view takeoff measurement points" on public.takeoff_measurement_points;
create policy "Members can view takeoff measurement points"
on public.takeoff_measurement_points
for select
using (
  exists (
    select 1
    from public.takeoff_measurements m
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where m.id = takeoff_measurement_points.measurement_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can create takeoff measurement points" on public.takeoff_measurement_points;
create policy "Members can create takeoff measurement points"
on public.takeoff_measurement_points
for insert
with check (
  exists (
    select 1
    from public.takeoff_measurements m
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where m.id = takeoff_measurement_points.measurement_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can update takeoff measurement points" on public.takeoff_measurement_points;
create policy "Members can update takeoff measurement points"
on public.takeoff_measurement_points
for update
using (
  exists (
    select 1
    from public.takeoff_measurements m
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where m.id = takeoff_measurement_points.measurement_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.takeoff_measurements m
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where m.id = takeoff_measurement_points.measurement_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Admins can delete takeoff measurement points" on public.takeoff_measurement_points;
create policy "Admins can delete takeoff measurement points"
on public.takeoff_measurement_points
for delete
using (
  exists (
    select 1
    from public.takeoff_measurements m
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where m.id = takeoff_measurement_points.measurement_id
      and public.is_admin_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can view takeoff measurement events" on public.takeoff_measurement_events;
create policy "Members can view takeoff measurement events"
on public.takeoff_measurement_events
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurement_events.project_id
      and p.organization_id = takeoff_measurement_events.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can create takeoff measurement events" on public.takeoff_measurement_events;
create policy "Members can create takeoff measurement events"
on public.takeoff_measurement_events
for insert
with check (
  (
    takeoff_measurement_events.actor_user_id is null
    or takeoff_measurement_events.actor_user_id = auth.uid()
  )
  and exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_measurement_events.project_id
      and p.organization_id = takeoff_measurement_events.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

grant select, insert, update, delete on public.takeoff_pages to authenticated;
grant select, insert, update, delete on public.takeoff_calibrations to authenticated;
grant select, insert, update, delete on public.takeoff_measurement_groups to authenticated;
grant select, insert, update, delete on public.takeoff_measurements to authenticated;
grant select, insert, update, delete on public.takeoff_measurement_points to authenticated;
grant select, insert on public.takeoff_measurement_events to authenticated;
