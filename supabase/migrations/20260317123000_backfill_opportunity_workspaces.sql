-- One-time backfill: create a hidden tender workspace project for existing
-- opportunities that do not yet have workspace_project_id.
-- This only applies to opportunities that have not been converted.

do $$
declare
  opportunity_row record;
  fallback_user_id uuid;
  resolved_created_by uuid;
  base_slug text;
  slug_candidate text;
  suffix integer;
  new_workspace_project_id uuid;
begin
  for opportunity_row in
    select
      o.id,
      o.organization_id,
      o.created_by,
      o.owner_user_id,
      o.client_id,
      o.name,
      o.slug,
      o.location,
      o.created_at
    from public.organization_opportunities o
    where o.workspace_project_id is null
      and o.converted_project_id is null
    order by o.created_at asc, o.id asc
  loop
    select m.user_id
    into fallback_user_id
    from public.organization_members m
    where m.organization_id = opportunity_row.organization_id
    order by m.created_at asc
    limit 1;

    resolved_created_by := coalesce(opportunity_row.owner_user_id, opportunity_row.created_by, fallback_user_id);

    -- If we cannot resolve a creator, skip this row safely.
    if resolved_created_by is null then
      continue;
    end if;

    base_slug := coalesce(nullif(btrim(opportunity_row.slug), ''), 'opportunity-' || replace(opportunity_row.id::text, '-', '')) || '-tender';
    slug_candidate := base_slug;
    suffix := 1;

    while exists (
      select 1
      from public.organization_projects p
      where p.organization_id = opportunity_row.organization_id
        and p.slug = slug_candidate
    ) loop
      suffix := suffix + 1;
      slug_candidate := base_slug || '-' || suffix::text;
    end loop;

    insert into public.organization_projects (
      organization_id,
      created_by,
      client_id,
      name,
      slug,
      stage,
      location,
      cover_image_url,
      created_at,
      updated_at
    )
    values (
      opportunity_row.organization_id,
      resolved_created_by,
      opportunity_row.client_id,
      opportunity_row.name || ' Tender Workspace',
      slug_candidate,
      'Pricing',
      coalesce(nullif(btrim(opportunity_row.location), ''), 'Unspecified'),
      null,
      opportunity_row.created_at,
      now()
    )
    returning id into new_workspace_project_id;

    update public.organization_opportunities o
    set workspace_project_id = new_workspace_project_id
    where o.id = opportunity_row.id;
  end loop;
end
$$;
