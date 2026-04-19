create or replace function public.update_project_claim_status(
  p_organization_id uuid,
  p_project_id uuid,
  p_claim_id uuid,
  p_status text
)
returns table (
  id uuid,
  claim_number text,
  claim_title text,
  claim_type text,
  status text,
  claim_date date,
  period_start date,
  period_end date,
  due_date date,
  percent_complete numeric,
  claim_amount numeric,
  paid_amount numeric,
  retention_percent numeric,
  retention_withheld_amount numeric,
  retention_released_amount numeric,
  retention_held_to_date numeric,
  retention_released_to_date numeric,
  retention_balance numeric,
  net_claim_excl_gst numeric,
  gst_amount numeric,
  total_payable numeric,
  linked_quote_value numeric,
  linked_approved_variations numeric,
  revised_contract_value numeric,
  previous_claims_total numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
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

  if not exists (
    select 1
    from public.project_claims c
    where c.id = p_claim_id
      and c.organization_id = p_organization_id
      and c.project_id = p_project_id
  ) then
    raise exception 'Claim not found';
  end if;

  update public.project_claims c
  set status = case
    when p_status in ('Draft', 'Submitted', 'Unpaid', 'Paid', 'Overdue', 'Cancelled') then p_status
    else c.status
  end
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;

  perform public.recalculate_project_claim_snapshots(
    p_organization_id,
    p_project_id
  );

  return query
  select
    c.id,
    c.claim_number,
    c.claim_title,
    c.claim_type,
    c.status,
    c.claim_date,
    c.period_start,
    c.period_end,
    c.due_date,
    c.percent_complete,
    c.claim_amount,
    c.paid_amount,
    c.retention_percent,
    c.retention_withheld_amount,
    c.retention_released_amount,
    c.retention_held_to_date,
    c.retention_released_to_date,
    c.retention_balance,
    c.net_claim_excl_gst,
    c.gst_amount,
    c.total_payable,
    c.linked_quote_value,
    c.linked_approved_variations,
    c.revised_contract_value,
    c.previous_claims_total,
    c.updated_at
  from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;
end;
$$;

grant execute on function public.update_project_claim_status(uuid, uuid, uuid, text) to authenticated;
