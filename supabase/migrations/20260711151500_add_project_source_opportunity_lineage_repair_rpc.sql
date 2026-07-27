create or replace function public.repair_project_source_opportunity_lineage(
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.organization_projects%rowtype;
  resolved_opportunity_id uuid;
  candidate_count integer;
begin
  select *
  into project_row
  from public.organization_projects
  where id = p_project_id;

  if not found then
    raise exception 'Project % does not exist.', p_project_id;
  end if;

  if project_row.source_opportunity_id is not null then
    return project_row.source_opportunity_id;
  end if;

  with distinct_candidates as (
    select distinct opportunity.id as opportunity_id
    from public.organization_opportunities as opportunity
    where opportunity.organization_id = project_row.organization_id
      and (
        opportunity.workspace_project_id = project_row.id
        or opportunity.converted_project_id = project_row.id
      )
  )
  select candidate.opportunity_id, count(*) over ()
  into resolved_opportunity_id, candidate_count
  from distinct_candidates as candidate
  limit 1;

  if candidate_count is null or candidate_count = 0 then
    return null;
  end if;

  if candidate_count > 1 then
    raise exception 'Project source opportunity lineage is ambiguous for project %.', p_project_id;
  end if;

  update public.organization_projects
  set source_opportunity_id = resolved_opportunity_id
  where id = project_row.id
    and source_opportunity_id is null;

  return resolved_opportunity_id;
end;
$$;

grant execute on function public.repair_project_source_opportunity_lineage(uuid) to authenticated;
