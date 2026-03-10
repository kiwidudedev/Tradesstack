drop policy if exists "Members can rename project drawing sets" on public.project_drawing_sets;
create policy "Members can rename project drawing sets"
on public.project_drawing_sets
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = project_drawing_sets.project_id
      and p.organization_id = project_drawing_sets.organization_id
      and (
        project_drawing_sets.uploaded_by = auth.uid()
        or public.is_admin_of_organization(p.organization_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = project_drawing_sets.project_id
      and p.organization_id = project_drawing_sets.organization_id
      and (
        project_drawing_sets.uploaded_by = auth.uid()
        or public.is_admin_of_organization(p.organization_id)
      )
  )
);

grant update (file_name) on public.project_drawing_sets to authenticated;
