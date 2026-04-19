create or replace function public.recalculate_project_claim_snapshots(
  p_organization_id uuid,
  p_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_row public.project_claims%rowtype;
  resolved_quote_value numeric := 0;
  resolved_approved_variations numeric := 0;
  resolved_revised_contract_value numeric := 0;
  resolved_claim_amount numeric := 0;
  resolved_previous_claims_total numeric := 0;
  resolved_percent_complete numeric := 0;
  resolved_retention_percent numeric := 0;
  certified_value_to_date numeric := 0;
  required_retention_to_date numeric := 0;
  prior_retention_balance numeric := 0;
  resolved_retention_withheld_amount numeric := 0;
  resolved_retention_released_amount numeric := 0;
  resolved_retention_held_to_date numeric := 0;
  resolved_retention_released_to_date numeric := 0;
  resolved_retention_balance numeric := 0;
  resolved_net_claim_excl_gst numeric := 0;
  resolved_gst_amount numeric := 0;
  resolved_total_payable numeric := 0;
  running_previous_claims_total numeric := 0;
  running_retention_held_total numeric := 0;
  running_retention_released_total numeric := 0;
  current_claim_counts boolean := true;
  claim_gst_rate numeric := 0.15;
begin
  if auth.uid() is null then
    if current_user <> 'postgres' then
      raise exception 'Authentication is required';
    end if;
  elsif not public.is_member_of_organization(p_organization_id) then
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

  resolved_quote_value := public.get_project_claim_base_quote_total(
    p_organization_id,
    p_project_id
  );

  resolved_approved_variations := public.get_project_claim_approved_variations_total(
    p_organization_id,
    p_project_id
  );

  resolved_revised_contract_value := resolved_quote_value + resolved_approved_variations;

  for claim_row in
    select c.*
    from public.project_claims c
    where c.organization_id = p_organization_id
      and c.project_id = p_project_id
    order by
      c.claim_date asc nulls last,
      c.created_at asc,
      c.id asc
  loop
    resolved_claim_amount := public.sync_project_claim_line_items(
      p_organization_id,
      p_project_id,
      claim_row.id,
      null,
      null
    );

    resolved_previous_claims_total := running_previous_claims_total;
    resolved_percent_complete := case
      when resolved_revised_contract_value <= 0 then 0
      else least(
        100,
        greatest(
          0,
          ((resolved_previous_claims_total + resolved_claim_amount) / resolved_revised_contract_value) * 100
        )
      )
    end;

    current_claim_counts := claim_row.status <> 'Cancelled';
    resolved_retention_percent := greatest(0, least(100, coalesce(claim_row.retention_percent, 0)));
    resolved_retention_released_amount := greatest(0, coalesce(claim_row.retention_released_amount, 0));
    certified_value_to_date := resolved_previous_claims_total + resolved_claim_amount;
    required_retention_to_date := certified_value_to_date * (resolved_retention_percent / 100);
    prior_retention_balance := running_retention_held_total - running_retention_released_total;
    resolved_retention_withheld_amount := round(
      greatest(0, required_retention_to_date - prior_retention_balance),
      2
    );
    resolved_net_claim_excl_gst := round(
      resolved_claim_amount
      - resolved_retention_withheld_amount
      + resolved_retention_released_amount,
      2
    );
    resolved_gst_amount := round(resolved_net_claim_excl_gst * claim_gst_rate, 2);
    resolved_total_payable := round(resolved_net_claim_excl_gst + resolved_gst_amount, 2);
    resolved_retention_held_to_date := round(
      running_retention_held_total
      + case when current_claim_counts then resolved_retention_withheld_amount else 0 end,
      2
    );
    resolved_retention_released_to_date := round(
      running_retention_released_total
      + case when current_claim_counts then resolved_retention_released_amount else 0 end,
      2
    );
    resolved_retention_balance := round(
      resolved_retention_held_to_date - resolved_retention_released_to_date,
      2
    );

    update public.project_claims c
    set
      claim_amount = round(resolved_claim_amount, 2),
      linked_quote_value = round(resolved_quote_value, 2),
      linked_approved_variations = round(resolved_approved_variations, 2),
      previous_claims_total = round(resolved_previous_claims_total, 2),
      revised_contract_value = round(resolved_revised_contract_value, 2),
      percent_complete = round(resolved_percent_complete, 3),
      retention_percent = round(resolved_retention_percent, 3),
      retention_withheld_amount = round(resolved_retention_withheld_amount, 2),
      retention_released_amount = round(resolved_retention_released_amount, 2),
      retention_held_to_date = round(resolved_retention_held_to_date, 2),
      retention_released_to_date = round(resolved_retention_released_to_date, 2),
      retention_balance = round(resolved_retention_balance, 2),
      net_claim_excl_gst = round(resolved_net_claim_excl_gst, 2),
      gst_amount = round(resolved_gst_amount, 2),
      total_payable = round(resolved_total_payable, 2)
    where c.id = claim_row.id
      and c.organization_id = p_organization_id
      and c.project_id = p_project_id;

    if current_claim_counts then
      running_previous_claims_total := running_previous_claims_total + resolved_claim_amount;
      running_retention_held_total := running_retention_held_total + resolved_retention_withheld_amount;
      running_retention_released_total := running_retention_released_total + resolved_retention_released_amount;
    end if;
  end loop;
end;
$$;

grant execute on function public.recalculate_project_claim_snapshots(uuid, uuid) to authenticated;
