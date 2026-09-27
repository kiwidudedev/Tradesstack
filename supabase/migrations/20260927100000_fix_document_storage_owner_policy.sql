-- Hosted Supabase Storage writes the authenticated owner to owner_id.
-- Keep document uploads private and bound to the exact pending reservation.
drop policy if exists "Authorized pending document uploads can create objects"
on storage.objects;

create policy "Authorized pending document uploads can create objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-documents'
  and owner_id = (select auth.uid()::text)
  and public.can_upload_document_storage_object(name)
);
