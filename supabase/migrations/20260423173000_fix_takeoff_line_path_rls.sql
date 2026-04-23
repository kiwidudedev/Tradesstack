alter table public.takeoff_measurement_line_paths enable row level security;
alter table public.takeoff_measurement_line_path_points enable row level security;

drop policy if exists "Members can view takeoff measurement line paths" on public.takeoff_measurement_line_paths;
create policy "Members can view takeoff measurement line paths"
on public.takeoff_measurement_line_paths
for select
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

drop policy if exists "Members can create takeoff measurement line paths" on public.takeoff_measurement_line_paths;
create policy "Members can create takeoff measurement line paths"
on public.takeoff_measurement_line_paths
for insert
with check (
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

drop policy if exists "Members can update takeoff measurement line paths" on public.takeoff_measurement_line_paths;
create policy "Members can update takeoff measurement line paths"
on public.takeoff_measurement_line_paths
for update
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
)
with check (
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

drop policy if exists "Admins can delete takeoff measurement line paths" on public.takeoff_measurement_line_paths;
create policy "Admins can delete takeoff measurement line paths"
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
      and public.is_admin_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can view takeoff measurement line path points" on public.takeoff_measurement_line_path_points;
create policy "Members can view takeoff measurement line path points"
on public.takeoff_measurement_line_path_points
for select
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

drop policy if exists "Members can create takeoff measurement line path points" on public.takeoff_measurement_line_path_points;
create policy "Members can create takeoff measurement line path points"
on public.takeoff_measurement_line_path_points
for insert
with check (
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

drop policy if exists "Members can update takeoff measurement line path points" on public.takeoff_measurement_line_path_points;
create policy "Members can update takeoff measurement line path points"
on public.takeoff_measurement_line_path_points
for update
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
)
with check (
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

drop policy if exists "Admins can delete takeoff measurement line path points" on public.takeoff_measurement_line_path_points;
create policy "Admins can delete takeoff measurement line path points"
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
      and public.is_admin_of_organization(p.organization_id)
  )
);

grant select, insert, update, delete on public.takeoff_measurement_line_paths to authenticated;
grant select, insert, update, delete on public.takeoff_measurement_line_path_points to authenticated;
