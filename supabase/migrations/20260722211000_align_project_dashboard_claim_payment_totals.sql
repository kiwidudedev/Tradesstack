alter function public.get_project_dashboard_aggregate(
  uuid, text, timestamptz, date, timestamptz, timestamptz, date, date
) rename to get_project_dashboard_aggregate_before_xero_claim_payment;

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
  v_project_id uuid;
  v_claims_paid numeric := 0;
  v_claims_unpaid numeric := 0;
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

  select p.id into v_project_id
  from public.organization_projects p
  where p.organization_id = p_organization_id
    and p.slug = p_project_slug;

  select
    coalesce(sum(c.paid_amount) filter (
      where c.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
    ), 0),
    coalesce(sum(greatest(c.claim_amount - c.paid_amount, 0)) filter (
      where c.status in ('Submitted', 'Unpaid', 'Overdue')
    ), 0)
  into v_claims_paid, v_claims_unpaid
  from public.project_claims c
  where c.organization_id = p_organization_id
    and c.project_id = v_project_id;

  v_result := jsonb_set(v_result, '{financials,claimsPaidAmount}', to_jsonb(v_claims_paid), true);
  v_result := jsonb_set(v_result, '{financials,claimsUnpaidAmount}', to_jsonb(v_claims_unpaid), true);
  return v_result;
end;
$$;

revoke all on function public.get_project_dashboard_aggregate_before_xero_claim_payment(
  uuid, text, timestamptz, date, timestamptz, timestamptz, date, date
) from public, anon, authenticated;

grant execute on function public.get_project_dashboard_aggregate(
  uuid, text, timestamptz, date, timestamptz, timestamptz, date, date
) to authenticated;
