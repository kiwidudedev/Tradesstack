alter table public.takeoff_measurement_area_shapes enable row level security;
alter table public.takeoff_measurement_area_shape_points enable row level security;

drop policy if exists "Members can view takeoff measurement area shapes" on public.takeoff_measurement_area_shapes;
create policy "Members can view takeoff measurement area shapes"
on public.takeoff_measurement_area_shapes
for select
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

drop policy if exists "Members can create takeoff measurement area shapes" on public.takeoff_measurement_area_shapes;
create policy "Members can create takeoff measurement area shapes"
on public.takeoff_measurement_area_shapes
for insert
with check (
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

drop policy if exists "Members can update takeoff measurement area shapes" on public.takeoff_measurement_area_shapes;
create policy "Members can update takeoff measurement area shapes"
on public.takeoff_measurement_area_shapes
for update
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
)
with check (
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

drop policy if exists "Admins can delete takeoff measurement area shapes" on public.takeoff_measurement_area_shapes;
create policy "Admins can delete takeoff measurement area shapes"
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
      and public.is_admin_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can view takeoff measurement area shape points" on public.takeoff_measurement_area_shape_points;
create policy "Members can view takeoff measurement area shape points"
on public.takeoff_measurement_area_shape_points
for select
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

drop policy if exists "Members can create takeoff measurement area shape points" on public.takeoff_measurement_area_shape_points;
create policy "Members can create takeoff measurement area shape points"
on public.takeoff_measurement_area_shape_points
for insert
with check (
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

drop policy if exists "Members can update takeoff measurement area shape points" on public.takeoff_measurement_area_shape_points;
create policy "Members can update takeoff measurement area shape points"
on public.takeoff_measurement_area_shape_points
for update
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
)
with check (
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

drop policy if exists "Admins can delete takeoff measurement area shape points" on public.takeoff_measurement_area_shape_points;
create policy "Admins can delete takeoff measurement area shape points"
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
      and public.is_admin_of_organization(p.organization_id)
  )
);

grant select, insert, update, delete on public.takeoff_measurement_area_shapes to authenticated;
grant select, insert, update, delete on public.takeoff_measurement_area_shape_points to authenticated;
