create or replace function public.generate_project_claim_number(
  p_organization_id uuid,
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_project_code text;
  next_sequence integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
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

  -- Serialize claim-number generation for this project so concurrent inserts
  -- cannot allocate the same number.
  perform pg_advisory_xact_lock(hashtext(p_project_id::text || ':claim-number'));

  select coalesce(
           nullif(btrim(project_code), ''),
           nullif(regexp_replace(upper(coalesce(slug, '')), '[^A-Z0-9]+', '-', 'g'), ''),
           'JOB'
         )
    into resolved_project_code
  from public.organization_projects
  where id = p_project_id
    and organization_id = p_organization_id;

  if resolved_project_code is null then
    raise exception 'Could not resolve project code for claim numbering';
  end if;

  with used as (
    select distinct substring(c.claim_number from '([0-9]+)$')::integer as n
    from public.project_claims c
    where c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.claim_number ~ '.*-CL-[0-9]+$'
  ),
  bounds as (
    select coalesce(max(n), 0) as max_n from used
  ),
  candidates as (
    select generate_series(1, greatest((select max_n from bounds) + 1, 1)) as n
  )
  select min(c.n)
    into next_sequence
  from candidates c
  where not exists (select 1 from used u where u.n = c.n);

  return format('%s-CL-%s', resolved_project_code, lpad(next_sequence::text, 2, '0'));
end;
$$;

grant execute on function public.generate_project_claim_number(uuid, uuid) to authenticated;
