create table if not exists public.takeoff_measurement_line_paths (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  measurement_id uuid not null references public.takeoff_measurements (id) on delete cascade,
  path_order integer not null default 0,
  measured_length_base numeric(20, 6) not null,
  page_bbox_min_x numeric(12, 8) null,
  page_bbox_min_y numeric(12, 8) null,
  page_bbox_max_x numeric(12, 8) null,
  page_bbox_max_y numeric(12, 8) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint takeoff_measurement_line_paths_path_order_nonnegative check (path_order >= 0),
  constraint takeoff_measurement_line_paths_bbox_normalized check (
    (page_bbox_min_x is null or (page_bbox_min_x >= 0 and page_bbox_min_x <= 1)) and
    (page_bbox_min_y is null or (page_bbox_min_y >= 0 and page_bbox_min_y <= 1)) and
    (page_bbox_max_x is null or (page_bbox_max_x >= 0 and page_bbox_max_x <= 1)) and
    (page_bbox_max_y is null or (page_bbox_max_y >= 0 and page_bbox_max_y <= 1))
  ),
  constraint takeoff_measurement_line_paths_bbox_order check (
    (page_bbox_min_x is null or page_bbox_max_x is null or page_bbox_min_x <= page_bbox_max_x) and
    (page_bbox_min_y is null or page_bbox_max_y is null or page_bbox_min_y <= page_bbox_max_y)
  ),
  constraint takeoff_measurement_line_paths_unique_order unique (measurement_id, path_order)
);

create table if not exists public.takeoff_measurement_line_path_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  line_path_id uuid not null references public.takeoff_measurement_line_paths (id) on delete cascade,
  point_order integer not null,
  x numeric(12, 8) not null,
  y numeric(12, 8) not null,
  created_at timestamptz not null default now(),
  constraint takeoff_measurement_line_path_points_point_order_nonnegative check (point_order >= 0),
  constraint takeoff_measurement_line_path_points_x_normalized check (x >= 0 and x <= 1),
  constraint takeoff_measurement_line_path_points_y_normalized check (y >= 0 and y <= 1),
  constraint takeoff_measurement_line_path_points_unique_order unique (line_path_id, point_order)
);

create index if not exists takeoff_measurement_line_paths_measurement_idx
  on public.takeoff_measurement_line_paths (measurement_id, path_order);

create index if not exists takeoff_measurement_line_path_points_path_idx
  on public.takeoff_measurement_line_path_points (line_path_id, point_order);

with polyline_measurements as (
  select
    measurement.id,
    measurement.organization_id,
    measurement.measured_length_base,
    measurement.page_bbox_min_x,
    measurement.page_bbox_min_y,
    measurement.page_bbox_max_x,
    measurement.page_bbox_max_y,
    measurement.created_at,
    measurement.updated_at
  from public.takeoff_measurements as measurement
  where measurement.measurement_kind = 'line'
    and (
      select count(*)
      from public.takeoff_measurement_points as point
      where point.measurement_id = measurement.id
    ) > 2
)
insert into public.takeoff_measurement_line_paths (
  organization_id,
  measurement_id,
  path_order,
  measured_length_base,
  page_bbox_min_x,
  page_bbox_min_y,
  page_bbox_max_x,
  page_bbox_max_y,
  created_at,
  updated_at
)
select
  measurement.organization_id,
  measurement.id,
  0,
  coalesce(measurement.measured_length_base, 0),
  measurement.page_bbox_min_x,
  measurement.page_bbox_min_y,
  measurement.page_bbox_max_x,
  measurement.page_bbox_max_y,
  measurement.created_at,
  measurement.updated_at
from polyline_measurements as measurement
where not exists (
  select 1
  from public.takeoff_measurement_line_paths as existing_path
  where existing_path.measurement_id = measurement.id
    and existing_path.path_order = 0
);

insert into public.takeoff_measurement_line_path_points (
  organization_id,
  line_path_id,
  point_order,
  x,
  y,
  created_at
)
select
  point.organization_id,
  line_path.id,
  point.point_order,
  point.x,
  point.y,
  point.created_at
from public.takeoff_measurement_points as point
join public.takeoff_measurement_line_paths as line_path
  on line_path.measurement_id = point.measurement_id
 and line_path.path_order = 0
join public.takeoff_measurements as measurement
  on measurement.id = point.measurement_id
where measurement.measurement_kind = 'line'
  and (
    select count(*)
    from public.takeoff_measurement_points as existing_points
    where existing_points.measurement_id = measurement.id
  ) > 2
  and not exists (
    select 1
    from public.takeoff_measurement_line_path_points as existing_point
    where existing_point.line_path_id = line_path.id
      and existing_point.point_order = point.point_order
  );
