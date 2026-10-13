-- Project dashboards must display the client/company identity, not the contact name.
-- Preserve the existing aggregate implementation and its Xero payment overlay;
-- only canonicalize the project client label in the public dashboard result.
create or replace function public.get_project_dashboard_aggregate(
  p_organization_id uuid,
  p_project_slug text,
  p_now timestamptz,
  p_today date,
  p_start_of_day timestamptz,
  p_end_of_day timestamptz,
  p_month_start date,
  p_month_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_company_name text;
  v_contact_name text;
begin
  v_result := public.get_project_dashboard_aggregate_before_xero_claim_payment(
    p_organization_id,
    p_project_slug,
    p_now,
    p_today,
    p_start_of_day,
    p_end_of_day,
    p_month_start,
    p_month_end
  );

  select
    c.company_name,
    c.name
  into
    v_company_name,
    v_contact_name
  from public.organization_projects p
  left join public.organization_clients c
    on c.id = p.client_id
   and c.organization_id = p.organization_id
  where p.organization_id = p_organization_id
    and p.slug = p_project_slug;

  v_company_name := coalesce(
    nullif(btrim(v_company_name), ''),
    nullif(btrim(v_contact_name), ''),
    'Unassigned'
  );

  return jsonb_set(
    v_result,
    '{project,clientName}',
    to_jsonb(v_company_name),
    true
  );
end;
$$;

grant execute on function public.get_project_dashboard_aggregate(
  uuid, text, timestamptz, date, timestamptz, timestamptz, date, date
) to authenticated;
