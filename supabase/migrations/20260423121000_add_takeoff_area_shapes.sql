create table if not exists public.takeoff_measurement_area_shapes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  measurement_id uuid not null references public.takeoff_measurements (id) on delete cascade,
  shape_order integer not null default 0,
  measured_area_base numeric(20, 6) not null,
  page_bbox_min_x numeric(12, 8) null,
  page_bbox_min_y numeric(12, 8) null,
  page_bbox_max_x numeric(12, 8) null,
  page_bbox_max_y numeric(12, 8) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint takeoff_measurement_area_shapes_shape_order_nonnegative check (shape_order >= 0),
  constraint takeoff_measurement_area_shapes_bbox_normalized check (
    (page_bbox_min_x is null or (page_bbox_min_x >= 0 and page_bbox_min_x <= 1)) and
    (page_bbox_min_y is null or (page_bbox_min_y >= 0 and page_bbox_min_y <= 1)) and
    (page_bbox_max_x is null or (page_bbox_max_x >= 0 and page_bbox_max_x <= 1)) and
    (page_bbox_max_y is null or (page_bbox_max_y >= 0 and page_bbox_max_y <= 1))
  ),
  constraint takeoff_measurement_area_shapes_bbox_order check (
    (page_bbox_min_x is null or page_bbox_max_x is null or page_bbox_min_x <= page_bbox_max_x) and
    (page_bbox_min_y is null or page_bbox_max_y is null or page_bbox_min_y <= page_bbox_max_y)
  ),
  constraint takeoff_measurement_area_shapes_unique_order unique (measurement_id, shape_order)
);

create table if not exists public.takeoff_measurement_area_shape_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  area_shape_id uuid not null references public.takeoff_measurement_area_shapes (id) on delete cascade,
  point_order integer not null,
  x numeric(12, 8) not null,
  y numeric(12, 8) not null,
  created_at timestamptz not null default now(),
  constraint takeoff_measurement_area_shape_points_point_order_nonnegative check (point_order >= 0),
  constraint takeoff_measurement_area_shape_points_x_normalized check (x >= 0 and x <= 1),
  constraint takeoff_measurement_area_shape_points_y_normalized check (y >= 0 and y <= 1),
  constraint takeoff_measurement_area_shape_points_unique_order unique (area_shape_id, point_order)
);

create index if not exists takeoff_measurement_area_shapes_measurement_idx
  on public.takeoff_measurement_area_shapes (measurement_id, shape_order);

create index if not exists takeoff_measurement_area_shape_points_shape_idx
  on public.takeoff_measurement_area_shape_points (area_shape_id, point_order);

insert into public.takeoff_measurement_area_shapes (
  organization_id,
  measurement_id,
  shape_order,
  measured_area_base,
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
  coalesce(measurement.measured_area_base, 0),
  measurement.page_bbox_min_x,
  measurement.page_bbox_min_y,
  measurement.page_bbox_max_x,
  measurement.page_bbox_max_y,
  measurement.created_at,
  measurement.updated_at
from public.takeoff_measurements as measurement
where measurement.measurement_kind = 'area'
  and not exists (
    select 1
    from public.takeoff_measurement_area_shapes as existing_shape
    where existing_shape.measurement_id = measurement.id
      and existing_shape.shape_order = 0
  );

insert into public.takeoff_measurement_area_shape_points (
  organization_id,
  area_shape_id,
  point_order,
  x,
  y,
  created_at
)
select
  point.organization_id,
  area_shape.id,
  point.point_order,
  point.x,
  point.y,
  point.created_at
from public.takeoff_measurement_points as point
join public.takeoff_measurement_area_shapes as area_shape
  on area_shape.measurement_id = point.measurement_id
 and area_shape.shape_order = 0
where not exists (
  select 1
  from public.takeoff_measurement_area_shape_points as existing_point
  where existing_point.area_shape_id = area_shape.id
    and existing_point.point_order = point.point_order
);
