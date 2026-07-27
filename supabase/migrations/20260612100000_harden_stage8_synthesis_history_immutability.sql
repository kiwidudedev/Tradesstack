create or replace function public.prevent_organization_memory_synthesis_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'organization_memory_synthesis_history is append-only and cannot be %.', tg_op
    using errcode = '55000';
end;
$$;

drop trigger if exists organization_memory_synthesis_history_immutable_guard
  on public.organization_memory_synthesis_history;

create trigger organization_memory_synthesis_history_immutable_guard
before update or delete on public.organization_memory_synthesis_history
for each row
execute function public.prevent_organization_memory_synthesis_history_mutation();

create index if not exists omsh_org_recent_created_idx
  on public.organization_memory_synthesis_history (organization_id, created_at desc);
