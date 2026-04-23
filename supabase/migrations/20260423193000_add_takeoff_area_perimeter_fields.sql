alter table public.takeoff_measurements
  add column if not exists measured_perimeter_base numeric(20, 6) null;

alter table public.takeoff_measurement_area_shapes
  add column if not exists measured_perimeter_base numeric(20, 6);

with shape_perimeters as (
  with ordered_points as (
    select
      area_shape.id as shape_id,
      measurement.id as measurement_id,
      calibration.scale_ratio,
      page.page_width_pts,
      page.page_height_pts,
      point.point_order,
      point.x,
      point.y,
      lead(point.x) over point_window as next_x,
      lead(point.y) over point_window as next_y,
      first_value(point.x) over full_point_window as first_x,
      first_value(point.y) over full_point_window as first_y
    from public.takeoff_measurement_area_shapes as area_shape
    join public.takeoff_measurements as measurement
      on measurement.id = area_shape.measurement_id
    join public.takeoff_pages as page
      on page.id = measurement.page_id
    join public.takeoff_calibrations as calibration
      on calibration.id = measurement.calibration_id
    join public.takeoff_measurement_area_shape_points as point
      on point.area_shape_id = area_shape.id
    window
      point_window as (partition by area_shape.id order by point.point_order),
      full_point_window as (
        partition by area_shape.id
        order by point.point_order
        rows between unbounded preceding and unbounded following
      )
  )
  select
    shape_id,
    measurement_id,
    sum(
      sqrt(
        power((coalesce(next_x, first_x) - x) * page_width_pts, 2) +
        power((coalesce(next_y, first_y) - y) * page_height_pts, 2)
      ) * scale_ratio
    )::numeric(20, 6) as measured_perimeter_base
  from ordered_points
  group by shape_id, measurement_id
)
update public.takeoff_measurement_area_shapes as area_shape
set measured_perimeter_base = coalesce(shape_perimeters.measured_perimeter_base, 0)
from shape_perimeters
where shape_perimeters.shape_id = area_shape.id;

alter table public.takeoff_measurement_area_shapes
  alter column measured_perimeter_base set default 0,
  alter column measured_perimeter_base set not null;

with measurement_perimeters as (
  select
    measurement_id,
    sum(measured_perimeter_base)::numeric(20, 6) as measured_perimeter_base
  from public.takeoff_measurement_area_shapes
  group by measurement_id
)
update public.takeoff_measurements as measurement
set measured_perimeter_base = measurement_perimeters.measured_perimeter_base
from measurement_perimeters
where measurement_perimeters.measurement_id = measurement.id;
