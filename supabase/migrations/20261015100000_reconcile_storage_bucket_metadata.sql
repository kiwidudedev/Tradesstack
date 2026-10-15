-- Reconcile Supabase-managed Storage bucket metadata when a migration is
-- recorded as applied but the provider-managed bucket rows were not created.
-- This is intentionally forward-only and idempotent.  It does not move or
-- delete objects and is safe to apply to Main and dedicated client projects.

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
