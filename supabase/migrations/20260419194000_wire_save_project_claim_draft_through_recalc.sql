drop function if exists public.save_project_claim_draft(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  date,
  date,
  date,
  date,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  jsonb
);

create or replace function public.save_project_claim_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_claim_id uuid,
  p_expected_updated_at timestamptz,
  p_claim_title text,
  p_claim_type text,
  p_status text,
  p_claim_date date,
  p_due_date date,
  p_period_start date,
  p_period_end date,
  p_percent_complete numeric,
  p_paid_amount numeric,
  p_retention_percent numeric,
  p_retention_released_amount numeric,
  p_notes text,
  p_line_items jsonb
)
returns table (
  updated_at timestamptz,
  claim_amount numeric,
  linked_quote_value numeric,
  linked_approved_variations numeric,
  previous_claims_total numeric,
  revised_contract_value numeric,
  percent_complete numeric,
  paid_amount numeric,
  status text,
  retention_percent numeric,
  retention_withheld_amount numeric,
  retention_released_amount numeric,
  retention_held_to_date numeric,
  retention_released_to_date numeric,
  retention_balance numeric,
  net_claim_excl_gst numeric,
  gst_amount numeric,
  total_payable numeric
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

  if exists (
    select 1
    from public.project_claims c
    where c.id = p_claim_id
      and c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and p_expected_updated_at is not null
      and c.updated_at is distinct from p_expected_updated_at
  ) then
    raise exception 'This claim was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  perform public.sync_project_claim_line_items(
    p_organization_id,
    p_project_id,
    p_claim_id,
    p_line_items,
    null
  );

  update public.project_claims c
  set
    claim_title = coalesce(nullif(btrim(p_claim_title), ''), c.claim_title),
    claim_type = case
      when p_claim_type in ('Progress', 'Deposit', 'Final') then p_claim_type
      else c.claim_type
    end,
    status = case
      when p_status in ('Draft', 'Submitted', 'Unpaid', 'Paid', 'Overdue', 'Cancelled') then p_status
      else c.status
    end,
    claim_date = p_claim_date,
    due_date = p_due_date,
    period_start = p_period_start,
    period_end = p_period_end,
    paid_amount = round(greatest(0, coalesce(p_paid_amount, 0)), 2),
    retention_percent = round(
      greatest(0, least(100, coalesce(p_retention_percent, c.retention_percent, 0))),
      3
    ),
    retention_released_amount = round(
      greatest(0, coalesce(p_retention_released_amount, c.retention_released_amount, 0)),
      2
    ),
    notes = coalesce(p_notes, '')
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;

  perform public.recalculate_project_claim_snapshots(
    p_organization_id,
    p_project_id
  );

  return query
  select
    c.updated_at,
    c.claim_amount,
    c.linked_quote_value,
    c.linked_approved_variations,
    c.previous_claims_total,
    c.revised_contract_value,
    c.percent_complete,
    c.paid_amount,
    c.status,
    c.retention_percent,
    c.retention_withheld_amount,
    c.retention_released_amount,
    c.retention_held_to_date,
    c.retention_released_to_date,
    c.retention_balance,
    c.net_claim_excl_gst,
    c.gst_amount,
    c.total_payable
  from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;
end;
$$;

grant execute on function public.save_project_claim_draft(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  date,
  date,
  date,
  date,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  jsonb
) to authenticated;
