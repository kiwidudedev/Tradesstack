create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.organization_clients (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_notes_body_not_blank check (char_length(trim(body)) > 0)
);

create index if not exists client_notes_org_client_created_idx
on public.client_notes (organization_id, client_id, created_at desc);

drop trigger if exists set_client_notes_updated_at on public.client_notes;
create trigger set_client_notes_updated_at
before update on public.client_notes
for each row
execute function public.set_updated_at();

alter table public.client_notes enable row level security;
alter table public.client_notes force row level security;

drop policy if exists "Members can view client notes" on public.client_notes;
create policy "Members can view client notes"
on public.client_notes
for select
to authenticated
using (
  public.is_member_of_organization(client_notes.organization_id)
);

drop policy if exists "Privileged members can create client notes" on public.client_notes;
create policy "Privileged members can create client notes"
on public.client_notes
for insert
to authenticated
with check (
  client_notes.created_by = auth.uid()
  and public.has_org_permission(client_notes.organization_id, 'leads.clients.write')
  and exists (
    select 1
    from public.organization_clients c
    where c.id = client_notes.client_id
      and c.organization_id = client_notes.organization_id
  )
);

grant select, insert on public.client_notes to authenticated;
