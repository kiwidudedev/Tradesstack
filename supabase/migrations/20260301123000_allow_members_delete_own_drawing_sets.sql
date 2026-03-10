drop policy if exists "Members can delete project drawing sets" on public.project_drawing_sets;
create policy "Members can delete project drawing sets"
on public.project_drawing_sets
for delete
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
);

drop policy if exists "Admins can delete project drawing storage objects" on storage.objects;
drop policy if exists "Members can delete project drawing storage objects" on storage.objects;
create policy "Members can delete project drawing storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-drawing-sets'
  and exists (
    select 1
    from public.project_drawing_sets ds
    join public.organization_projects p
      on p.id = ds.project_id
      and p.organization_id = ds.organization_id
    where ds.storage_path = storage.objects.name
      and (
        ds.uploaded_by = auth.uid()
        or public.is_admin_of_organization(p.organization_id)
      )
  )
);
