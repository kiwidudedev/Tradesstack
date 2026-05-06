drop function if exists public.create_project_variation_draft(uuid, uuid, text);

create or replace function public.create_project_variation_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_title text default 'New Variation'
)
returns table (
  id uuid,
  updated_at timestamptz,
  variation_number text,
  variation_title text,
  status text,
  origin text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_row public.project_variations%rowtype;
  resolved_title text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'variations.write') then
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

  resolved_title := coalesce(nullif(btrim(p_title), ''), 'New Variation');

  insert into public.project_variations (
    organization_id,
    project_id,
    created_by,
    variation_title,
    variation_number,
    status,
    origin,
    source_reference,
    requested_by
  ) values (
    p_organization_id,
    p_project_id,
    auth.uid(),
    resolved_title,
    '',
    'Draft',
    'Unknown',
    '',
    ''
  )
  returning * into created_row;

  return query
  select
    created_row.id,
    created_row.updated_at,
    created_row.variation_number,
    created_row.variation_title,
    created_row.status,
    created_row.origin;
end;
$$;
