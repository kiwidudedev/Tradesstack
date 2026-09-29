-- Reconcile Storage metadata that is not represented in the Phase 1O SQL
-- baseline dump.  The baseline contains the application tables/functions, but
-- Supabase-managed storage.buckets and storage.objects policy rows are not
-- reliably reproduced when historical migrations are represented as applied.
-- Keep this forward-only and idempotent; do not edit or replay old migrations.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-drawing-sets', 'project-drawing-sets', false, 5368709120, null),
  ('project-variation-attachments', 'project-variation-attachments', false, 104857600, null),
  ('project-quality-photos', 'project-quality-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']::text[]),
  ('supplier-invoice-documents', 'supplier-invoice-documents', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]),
  ('task-attachments', 'task-attachments', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']::text[]),
  ('material-library-imports', 'material-library-imports', false, 26214400, array['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]),
  ('retention-claim-documents', 'retention-claim-documents', false, 10485760, array['application/pdf']::text[]),
  ('project-qa-evidence', 'project-qa-evidence', false, 104857600, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']::text[]),
  ('organization-logos', 'organization-logos', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Reassert the drawing-set contract because it is the canonical private source
-- path for drawings and generated trade packs.  The helper is owned by the
-- application migration and is deliberately reused here.
drop policy if exists "Members can read project drawing storage objects" on storage.objects;
create policy "Members can read project drawing storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-drawing-sets'
  and public.can_access_project_drawing_storage_object(name)
);

drop policy if exists "Members can upload project drawing storage objects" on storage.objects;
create policy "Members can upload project drawing storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-drawing-sets'
  and public.can_access_project_drawing_storage_object(name)
);

drop policy if exists "Admins can delete project drawing storage objects" on storage.objects;
create policy "Admins can delete project drawing storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-drawing-sets'
  and exists (
    select 1
    from public.organization_projects p
    where p.organization_id::text = split_part(name, '/', 1)
      and p.id::text = split_part(name, '/', 2)
      and public.is_admin_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can read project variation attachment storage objects" on storage.objects;
create policy "Members can read project variation attachment storage objects"
on storage.objects for select to authenticated
using (bucket_id = 'project-variation-attachments' and public.can_access_project_variation_attachment_storage_object(name));

drop policy if exists "Members can upload project variation attachment storage objects" on storage.objects;
create policy "Members can upload project variation attachment storage objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'project-variation-attachments' and public.can_access_project_variation_attachment_storage_object(name));

drop policy if exists "Members can delete project variation attachment storage objects" on storage.objects;
create policy "Members can delete project variation attachment storage objects"
on storage.objects for delete to authenticated
using (bucket_id = 'project-variation-attachments' and public.can_access_project_variation_attachment_storage_object(name));

drop policy if exists "Members can read project quality photo storage objects" on storage.objects;
create policy "Members can read project quality photo storage objects"
on storage.objects for select to authenticated
using (bucket_id = 'project-quality-photos' and public.can_access_project_quality_photo_storage_object(name));

drop policy if exists "Members can upload project quality photo storage objects" on storage.objects;
create policy "Members can upload project quality photo storage objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'project-quality-photos' and public.can_access_project_quality_photo_storage_object(name));

drop policy if exists "Members can update project quality photo storage objects" on storage.objects;
create policy "Members can update project quality photo storage objects"
on storage.objects for update to authenticated
using (bucket_id = 'project-quality-photos' and public.can_access_project_quality_photo_storage_object(name))
with check (bucket_id = 'project-quality-photos' and public.can_access_project_quality_photo_storage_object(name));

drop policy if exists "Members can delete project quality photo storage objects" on storage.objects;
create policy "Members can delete project quality photo storage objects"
on storage.objects for delete to authenticated
using (bucket_id = 'project-quality-photos' and public.can_access_project_quality_photo_storage_object(name));

drop policy if exists "Members can read task attachment storage objects" on storage.objects;
create policy "Members can read task attachment storage objects"
on storage.objects for select to authenticated
using (bucket_id = 'task-attachments' and public.can_access_task_attachment_storage_object(name));

drop policy if exists "Members can upload task attachment storage objects" on storage.objects;
create policy "Members can upload task attachment storage objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'task-attachments' and public.can_access_task_attachment_storage_object(name));

drop policy if exists "Members can update task attachment storage objects" on storage.objects;
create policy "Members can update task attachment storage objects"
on storage.objects for update to authenticated
using (bucket_id = 'task-attachments' and public.can_access_task_attachment_storage_object(name))
with check (bucket_id = 'task-attachments' and public.can_access_task_attachment_storage_object(name));

drop policy if exists "Members can delete task attachment storage objects" on storage.objects;
create policy "Members can delete task attachment storage objects"
on storage.objects for delete to authenticated
using (bucket_id = 'task-attachments' and public.can_access_task_attachment_storage_object(name));

drop policy if exists "Members can read supplier invoice document storage objects" on storage.objects;
create policy "Members can read supplier invoice document storage objects"
on storage.objects for select to authenticated
using (bucket_id = 'supplier-invoice-documents' and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.view'));

drop policy if exists "Members can upload supplier invoice document storage objects" on storage.objects;
create policy "Members can upload supplier invoice document storage objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'supplier-invoice-documents' and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.write'));

drop policy if exists "Members can update supplier invoice document storage objects" on storage.objects;
create policy "Members can update supplier invoice document storage objects"
on storage.objects for update to authenticated
using (bucket_id = 'supplier-invoice-documents' and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.write'))
with check (bucket_id = 'supplier-invoice-documents' and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.write'));

drop policy if exists "Members can delete supplier invoice document storage objects" on storage.objects;
create policy "Members can delete supplier invoice document storage objects"
on storage.objects for delete to authenticated
using (bucket_id = 'supplier-invoice-documents' and public.can_access_supplier_invoice_document_storage_object(name, 'supplier_invoices.write'));

drop policy if exists "Members can read material import storage objects" on storage.objects;
create policy "Members can read material import storage objects"
on storage.objects for select to authenticated
using (bucket_id = 'material-library-imports' and public.can_access_material_import_storage_object(name, 'materials.view'));

drop policy if exists "Members can upload material import storage objects" on storage.objects;
create policy "Members can upload material import storage objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'material-library-imports' and public.can_access_material_import_storage_object(name, 'materials.write'));

drop policy if exists "Members can update material import storage objects" on storage.objects;
create policy "Members can update material import storage objects"
on storage.objects for update to authenticated
using (bucket_id = 'material-library-imports' and public.can_access_material_import_storage_object(name, 'materials.write'))
with check (bucket_id = 'material-library-imports' and public.can_access_material_import_storage_object(name, 'materials.write'));

drop policy if exists "Members can delete material import storage objects" on storage.objects;
create policy "Members can delete material import storage objects"
on storage.objects for delete to authenticated
using (bucket_id = 'material-library-imports' and public.can_access_material_import_storage_object(name, 'materials.write'));

drop policy if exists "Members can read organization logo storage objects" on storage.objects;
create policy "Members can read organization logo storage objects"
on storage.objects for select to authenticated
using (bucket_id = 'organization-logos' and public.can_access_organization_logo_storage_object(name));

drop policy if exists "Admins can upload organization logo storage objects" on storage.objects;
create policy "Admins can upload organization logo storage objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'organization-logos' and array_length(string_to_array(name, '/'), 1) >= 2 and exists (select 1 from public.organizations o where o.id::text = split_part(name, '/', 1) and public.is_admin_of_organization(o.id)));

drop policy if exists "Admins can update organization logo storage objects" on storage.objects;
create policy "Admins can update organization logo storage objects"
on storage.objects for update to authenticated
using (bucket_id = 'organization-logos' and array_length(string_to_array(name, '/'), 1) >= 2 and exists (select 1 from public.organizations o where o.id::text = split_part(name, '/', 1) and public.is_admin_of_organization(o.id)))
with check (bucket_id = 'organization-logos' and array_length(string_to_array(name, '/'), 1) >= 2 and exists (select 1 from public.organizations o where o.id::text = split_part(name, '/', 1) and public.is_admin_of_organization(o.id)));

drop policy if exists "Admins can delete organization logo storage objects" on storage.objects;
create policy "Admins can delete organization logo storage objects"
on storage.objects for delete to authenticated
using (bucket_id = 'organization-logos' and array_length(string_to_array(name, '/'), 1) >= 2 and exists (select 1 from public.organizations o where o.id::text = split_part(name, '/', 1) and public.is_admin_of_organization(o.id)));
