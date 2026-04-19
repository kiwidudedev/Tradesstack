drop policy if exists "Privileged members can update client notes" on public.client_notes;
create policy "Privileged members can update client notes"
on public.client_notes
for update
to authenticated
using (
  public.has_org_permission(client_notes.organization_id, 'leads.clients.write')
)
with check (
  public.has_org_permission(client_notes.organization_id, 'leads.clients.write')
  and exists (
    select 1
    from public.organization_clients c
    where c.id = client_notes.client_id
      and c.organization_id = client_notes.organization_id
  )
);

grant update on public.client_notes to authenticated;
