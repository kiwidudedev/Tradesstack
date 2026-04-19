alter table public.client_notes
add column if not exists sort_order integer;

with ranked_notes as (
  select
    id,
    row_number() over (
      partition by organization_id, client_id
      order by created_at desc, id desc
    ) - 1 as next_sort_order
  from public.client_notes
)
update public.client_notes as client_notes
set sort_order = ranked_notes.next_sort_order
from ranked_notes
where client_notes.id = ranked_notes.id
  and client_notes.sort_order is null;

alter table public.client_notes
alter column sort_order set not null;

create index if not exists client_notes_org_client_sort_idx
on public.client_notes (organization_id, client_id, sort_order asc);

drop function if exists public.reorder_client_notes(uuid, uuid[]);
create function public.reorder_client_notes(
  p_client_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_ordered_ids is null or cardinality(p_ordered_ids) = 0 then
    raise exception 'Ordered note ids are required.';
  end if;

  if not exists (
    select 1
    from public.organization_clients as c
    where c.id = p_client_id
  ) then
    raise exception 'Client not found';
  end if;

  if not exists (
    select 1
    from public.organization_clients as c
    where c.id = p_client_id
      and public.has_org_permission(c.organization_id, 'leads.clients.write')
  ) then
    raise exception 'You do not have permission to reorder client notes.';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_ids) as ordered_ids(note_id)
    group by note_id
    having count(*) > 1
  ) then
    raise exception 'Ordered note ids must be unique.';
  end if;

  if exists (
    select 1
    from public.client_notes
    where client_id = p_client_id
      and not (id = any (p_ordered_ids))
  ) then
    raise exception 'Ordered note ids must include every saved note for the client.';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_ids) as ordered_ids(note_id)
    where not exists (
      select 1
      from public.client_notes
      where client_id = p_client_id
        and id = note_id
    )
  ) then
    raise exception 'Ordered note ids must belong to the client.';
  end if;

  with ordered_notes as (
    select
      note_id as id,
      ordinality - 1 as next_sort_order
    from unnest(p_ordered_ids) with ordinality as ordered(note_id, ordinality)
  )
  update public.client_notes as client_notes
  set sort_order = ordered_notes.next_sort_order
  from ordered_notes
  where client_notes.id = ordered_notes.id
    and client_notes.client_id = p_client_id;
end;
$$;

grant execute on function public.reorder_client_notes(uuid, uuid[]) to authenticated;
