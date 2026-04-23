drop policy if exists "Admins can delete takeoff measurement area shapes" on public.takeoff_measurement_area_shapes;
create policy "Members can delete takeoff measurement area shapes"
on public.takeoff_measurement_area_shapes
for delete
using (
  exists (
    select 1
    from public.takeoff_measurements m
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where m.id = takeoff_measurement_area_shapes.measurement_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Admins can delete takeoff measurement area shape points" on public.takeoff_measurement_area_shape_points;
create policy "Members can delete takeoff measurement area shape points"
on public.takeoff_measurement_area_shape_points
for delete
using (
  exists (
    select 1
    from public.takeoff_measurement_area_shapes s
    join public.takeoff_measurements m
      on m.id = s.measurement_id
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where s.id = takeoff_measurement_area_shape_points.area_shape_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Admins can delete takeoff measurement line paths" on public.takeoff_measurement_line_paths;
create policy "Members can delete takeoff measurement line paths"
on public.takeoff_measurement_line_paths
for delete
using (
  exists (
    select 1
    from public.takeoff_measurements m
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where m.id = takeoff_measurement_line_paths.measurement_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Admins can delete takeoff measurement line path points" on public.takeoff_measurement_line_path_points;
create policy "Members can delete takeoff measurement line path points"
on public.takeoff_measurement_line_path_points
for delete
using (
  exists (
    select 1
    from public.takeoff_measurement_line_paths lp
    join public.takeoff_measurements m
      on m.id = lp.measurement_id
    join public.organization_projects p
      on p.id = m.project_id
     and p.organization_id = m.organization_id
    where lp.id = takeoff_measurement_line_path_points.line_path_id
      and public.is_member_of_organization(p.organization_id)
  )
);
