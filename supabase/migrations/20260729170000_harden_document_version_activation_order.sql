-- Phase 2 hardening: a concurrently reserved replacement may only advance the
-- current-version pointer. Completing an older reservation after a newer one
-- has activated must not roll the file back to the older version.

create or replace function public.validate_document_current_version_progression()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  previous_version_number integer;
  next_version_number integer;
begin
  if old.current_version_id is null
    or new.current_version_id is null
    or old.current_version_id = new.current_version_id
  then
    return new;
  end if;

  select version.version_number
  into previous_version_number
  from public.document_versions version
  where version.organization_id = old.organization_id
    and version.workspace_id = old.workspace_id
    and version.node_id = old.id
    and version.id = old.current_version_id;

  select version.version_number
  into next_version_number
  from public.document_versions version
  where version.organization_id = new.organization_id
    and version.workspace_id = new.workspace_id
    and version.node_id = new.id
    and version.id = new.current_version_id;

  if previous_version_number is null
    or next_version_number is null
    or next_version_number <= previous_version_number
  then
    raise exception 'Current document version must advance monotonically.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_document_current_version_progression
on public.document_nodes;
create trigger validate_document_current_version_progression
before update of current_version_id on public.document_nodes
for each row
when (old.current_version_id is distinct from new.current_version_id)
execute function public.validate_document_current_version_progression();
