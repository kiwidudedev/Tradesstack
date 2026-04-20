create or replace function public.delete_project_claim_safe(
  p_organization_id uuid,
  p_project_id uuid,
  p_claim_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_claim public.project_claims%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  select *
  into existing_claim
  from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Claim not found';
  end if;

  if coalesce(existing_claim.status, 'Draft') <> 'Draft' then
    raise exception 'Only draft claims can be deleted';
  end if;

  delete from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;

  perform public.recalculate_project_claim_snapshots(
    p_organization_id,
    p_project_id
  );
end;
$$;

grant execute on function public.delete_project_claim_safe(uuid, uuid, uuid) to authenticated;
