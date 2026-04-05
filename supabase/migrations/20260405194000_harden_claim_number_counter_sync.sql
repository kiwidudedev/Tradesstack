create or replace function public.next_project_document_number(
  p_organization_id uuid,
  p_project_id uuid,
  p_document_kind text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
  seeded_last integer := 0;
begin
  if p_document_kind not in ('variation', 'purchase_order', 'claim') then
    raise exception 'Unsupported document kind: %', p_document_kind;
  end if;

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

  perform pg_advisory_xact_lock(hashtext(p_project_id::text || ':' || p_document_kind));

  if p_document_kind = 'variation' then
    select coalesce(max(substring(v.variation_number from '([0-9]+)$')::integer), 0)
      into seeded_last
    from public.project_variations v
    where v.organization_id = p_organization_id
      and v.project_id = p_project_id
      and v.variation_number ~ '.*-VAR-[0-9]+$';
  elsif p_document_kind = 'purchase_order' then
    select coalesce(max(substring(po.purchase_order_number from '([0-9]+)$')::integer), 0)
      into seeded_last
    from public.project_purchase_orders po
    where po.organization_id = p_organization_id
      and po.project_id = p_project_id
      and po.purchase_order_number ~ '.*-PO-[0-9]+$';
  else
    select coalesce(max(substring(c.claim_number from '([0-9]+)$')::integer), 0)
      into seeded_last
    from public.project_claims c
    where c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.claim_number ~ '.*-CL-[0-9]+$';
  end if;

  insert into public.project_document_counters (
    organization_id,
    project_id,
    document_kind,
    last_number
  )
  values (
    p_organization_id,
    p_project_id,
    p_document_kind,
    seeded_last + 1
  )
  on conflict (project_id, document_kind)
  do update
    set last_number = greatest(public.project_document_counters.last_number + 1, excluded.last_number),
        updated_at = now()
  returning last_number
  into next_number;

  return next_number;
end;
$$;

insert into public.project_document_counters (
  organization_id,
  project_id,
  document_kind,
  last_number
)
select
  c.organization_id,
  c.project_id,
  'claim',
  coalesce(max(substring(c.claim_number from '([0-9]+)$')::integer), 0)
from public.project_claims c
where c.claim_number ~ '.*-CL-[0-9]+$'
group by c.organization_id, c.project_id
on conflict (project_id, document_kind)
do update
  set last_number = greatest(public.project_document_counters.last_number, excluded.last_number),
      updated_at = now();
