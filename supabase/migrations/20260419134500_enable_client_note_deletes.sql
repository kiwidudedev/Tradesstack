drop policy if exists "Privileged members can delete client notes" on public.client_notes;
create policy "Privileged members can delete client notes"
on public.client_notes
for delete
to authenticated
using (
  public.has_org_permission(client_notes.organization_id, 'leads.clients.write')
);

grant delete on public.client_notes to authenticated;
