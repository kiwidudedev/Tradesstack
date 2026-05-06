drop policy if exists "Admins can delete takeoff measurement points" on public.takeoff_measurement_points;
create policy "Members can delete takeoff measurement points"
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
      and public.is_member_of_organization(p.organization_id)
  )
);
