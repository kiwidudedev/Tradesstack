alter table public.worksheet_event_classifications enable row level security;
alter table public.worksheet_event_classifications force row level security;

drop policy if exists "Members can view worksheet event classifications"
on public.worksheet_event_classifications;

create policy "Members can view worksheet event classifications"
on public.worksheet_event_classifications
for select
to authenticated
using (
  public._intelligence_can_read_visibility_scope(
    worksheet_event_classifications.organization_id,
    'organization'
  )
);

revoke all on public.worksheet_event_classifications from public, anon, authenticated;

grant select on public.worksheet_event_classifications to authenticated;
grant select, insert, update on public.worksheet_event_classifications to service_role;
