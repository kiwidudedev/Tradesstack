drop function if exists public.create_project_claim_draft(uuid, uuid, text);

create or replace function public.create_project_claim_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_title text default 'New Claim'
)
returns table (
  id uuid,
  claim_number text,
  claim_title text,
  claim_type text,
  status text,
  claim_date date,
  due_date date,
  period_start date,
  period_end date,
  percent_complete numeric,
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
  notes text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_row public.project_claims%rowtype;
  resolved_title text;
  resolved_quote_value numeric := 0;
  resolved_approved_variations numeric := 0;
  resolved_previous_claims_total numeric := 0;
  resolved_revised_contract_value numeric := 0;
  resolved_retention_percent numeric := 10;
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

  resolved_title := coalesce(nullif(btrim(p_title), ''), 'New Claim');

  resolved_quote_value := public.get_project_claim_base_quote_total(p_organization_id, p_project_id);
  resolved_approved_variations := public.get_project_claim_approved_variations_total(p_organization_id, p_project_id);

  resolved_previous_claims_total := (
    select coalesce(sum(c.claim_amount), 0)
    from public.project_claims c
    where c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.status <> 'Cancelled'
  );

  resolved_retention_percent := coalesce((
    select greatest(0, least(100, coalesce(nullif(c.retention_percent, 0), 10)))
    from public.project_claims c
    where c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.status <> 'Cancelled'
    order by
      c.updated_at desc,
      c.id desc
    limit 1
  ), 10);

  resolved_revised_contract_value := resolved_quote_value + resolved_approved_variations;

  insert into public.project_claims (
    organization_id,
    project_id,
    created_by,
    claim_number,
    claim_title,
    claim_type,
    status,
    claim_date,
    due_date,
    period_start,
    period_end,
    percent_complete,
    claim_amount,
    paid_amount,
    linked_quote_value,
    linked_approved_variations,
    previous_claims_total,
    revised_contract_value,
    retention_percent,
    retention_withheld_amount,
    retention_released_amount,
    retention_held_to_date,
    retention_released_to_date,
    retention_balance,
    net_claim_excl_gst,
    gst_amount,
    total_payable,
    notes
  ) values (
    p_organization_id,
    p_project_id,
    auth.uid(),
    public.generate_project_claim_number(p_organization_id, p_project_id),
    resolved_title,
    'Progress',
    'Draft',
    current_date,
    current_date + 7,
    current_date,
    current_date + 7,
    0,
    0,
    0,
    round(resolved_quote_value, 2),
    round(resolved_approved_variations, 2),
    round(resolved_previous_claims_total, 2),
    round(resolved_revised_contract_value, 2),
    round(resolved_retention_percent, 3),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    ''
  )
  returning * into created_row;

  perform public.sync_project_claim_line_items(
    p_organization_id,
    p_project_id,
    created_row.id,
    null,
    0
  );

  return query
  select
    created_row.id,
    created_row.claim_number,
    created_row.claim_title,
    created_row.claim_type,
    created_row.status,
    created_row.claim_date,
    created_row.due_date,
    created_row.period_start,
    created_row.period_end,
    created_row.percent_complete,
    created_row.paid_amount,
    created_row.retention_percent,
    created_row.retention_withheld_amount,
    created_row.retention_released_amount,
    created_row.retention_held_to_date,
    created_row.retention_released_to_date,
    created_row.retention_balance,
    created_row.net_claim_excl_gst,
    created_row.gst_amount,
    created_row.total_payable,
    created_row.notes,
    created_row.updated_at;
end;
$$;

grant execute on function public.create_project_claim_draft(uuid, uuid, text) to authenticated;
