create or replace function public._intelligence_can_view_analytics(
  p_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  member_row public.organization_members%rowtype;
  current_db_role text := current_user;
begin
  if current_db_role in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return true;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  select *
  into member_row
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  limit 1;

  if member_row.id is null then
    return false;
  end if;

  return member_row.role in ('owner', 'admin')
    or public.has_org_permission(p_organization_id, 'intelligence.analytics.read');
end;
$$;

alter view public.intelligence_observability_daily_overview
  set (security_invoker = true);

alter view public.intelligence_observability_event_daily
  set (security_invoker = true);

alter view public.intelligence_observability_correction_daily
  set (security_invoker = true);

alter view public.intelligence_observability_ai_daily
  set (security_invoker = true);

alter view public.intelligence_observability_ai_confidence_daily
  set (security_invoker = true);

alter view public.intelligence_observability_validation_daily
  set (security_invoker = true);

alter view public.intelligence_observability_pricing_worksheet_daily
  set (security_invoker = true);

alter view public.intelligence_observability_cost_item_daily
  set (security_invoker = true);

alter view public.intelligence_observability_cost_item_review_backlog
  set (security_invoker = true);

alter view public.intelligence_observability_supplier_invoice_daily
  set (security_invoker = true);

alter view public.intelligence_observability_takeoff_daily
  set (security_invoker = true);
