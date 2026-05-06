do $$
declare
  claim_project record;
begin
  for claim_project in
    select distinct
      c.organization_id,
      c.project_id
    from public.project_claims c
  loop
    perform public.recalculate_project_claim_snapshots(
      claim_project.organization_id,
      claim_project.project_id
    );
  end loop;
end;
$$;
