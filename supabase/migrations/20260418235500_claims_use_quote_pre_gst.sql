create or replace function public.calculate_project_quote_pre_gst_total(
  p_subtotal numeric,
  p_margin_percent numeric,
  p_discount_amount numeric,
  p_contingency_amount numeric
)
returns numeric
language sql
immutable
as $$
  select round(
    greatest(
      0,
      coalesce(p_subtotal, 0)
      + (coalesce(p_subtotal, 0) * (coalesce(p_margin_percent, 0) / 100))
      + coalesce(p_contingency_amount, 0)
      - coalesce(p_discount_amount, 0)
    ),
    2
  );
$$;

create or replace function public.get_project_claim_base_quote_total(
  p_organization_id uuid,
  p_project_id uuid
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.calculate_project_quote_pre_gst_total(
        q.subtotal,
        q.margin_percent,
        q.discount_amount,
        q.contingency_amount
      )
      from public.project_quotes q
      where q.organization_id = p_organization_id
        and q.project_id = p_project_id
      order by
        case
          when q.status = 'Accepted' then 0
          when q.status = 'Sent' then 1
          else 2
        end,
        q.updated_at desc
      limit 1
    ),
    0
  );
$$;

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

  select public.get_project_claim_base_quote_total(p_organization_id, p_project_id)
  into resolved_quote_value;

  select public.get_project_claim_approved_variations_total(p_organization_id, p_project_id)
  into resolved_approved_variations;

  select coalesce(sum(c.claim_amount), 0)
  into resolved_previous_claims_total
  from public.project_claims c
  where c.organization_id = p_organization_id
    and c.project_id = p_project_id
    and c.status <> 'Cancelled';

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
    created_row.notes,
    created_row.updated_at;
end;
$$;

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
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_claims%rowtype;
  updated_row public.project_claims%rowtype;
  resolved_quote_value numeric := 0;
  resolved_approved_variations numeric := 0;
  resolved_previous_claims_total numeric := 0;
  resolved_revised_contract_value numeric := 0;
  resolved_percent_complete numeric := 0;
  resolved_paid_amount numeric := 0;
  resolved_claim_amount numeric := 0;
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

  select *
  into existing_row
  from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Claim not found';
  end if;

  if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This claim was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  select public.get_project_claim_base_quote_total(p_organization_id, p_project_id)
  into resolved_quote_value;

  select public.get_project_claim_approved_variations_total(p_organization_id, p_project_id)
  into resolved_approved_variations;

  select coalesce(sum(c.claim_amount), 0)
  into resolved_previous_claims_total
  from public.project_claims c
  where c.organization_id = p_organization_id
    and c.project_id = p_project_id
    and c.id <> p_claim_id
    and c.status <> 'Cancelled';

  resolved_revised_contract_value := resolved_quote_value + resolved_approved_variations;
  resolved_paid_amount := greatest(0, coalesce(p_paid_amount, 0));

  resolved_claim_amount := public.sync_project_claim_line_items(
    p_organization_id,
    p_project_id,
    p_claim_id,
    p_line_items,
    null
  );

  resolved_percent_complete := case
    when resolved_revised_contract_value <= 0 then 0
    else least(100, greatest(0, ((resolved_previous_claims_total + resolved_claim_amount) / resolved_revised_contract_value) * 100))
  end;

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
    percent_complete = round(resolved_percent_complete, 3),
    claim_amount = round(resolved_claim_amount, 2),
    paid_amount = round(resolved_paid_amount, 2),
    linked_quote_value = round(resolved_quote_value, 2),
    linked_approved_variations = round(resolved_approved_variations, 2),
    previous_claims_total = round(resolved_previous_claims_total, 2),
    revised_contract_value = round(resolved_revised_contract_value, 2),
    notes = coalesce(p_notes, '')
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id
  returning * into updated_row;

  return query
  select
    updated_row.updated_at,
    updated_row.claim_amount,
    updated_row.linked_quote_value,
    updated_row.linked_approved_variations,
    updated_row.previous_claims_total,
    updated_row.revised_contract_value,
    updated_row.percent_complete,
    updated_row.paid_amount,
    updated_row.status;
end;
$$;

do $$
begin
  update public.project_claims c
  set
    claim_amount = round(
      coalesce(
        (
          select sum(cli.claim_amount)
          from public.project_claim_line_items cli
          where cli.organization_id = c.organization_id
            and cli.project_id = c.project_id
            and cli.claim_id = c.id
        ),
        0
      ),
      2
    ),
    linked_quote_value = round(public.get_project_claim_base_quote_total(c.organization_id, c.project_id), 2),
    linked_approved_variations = round(public.get_project_claim_approved_variations_total(c.organization_id, c.project_id), 2),
    previous_claims_total = round(
      coalesce(
        (
          select sum(prev.claim_amount)
          from public.project_claims prev
          where prev.organization_id = c.organization_id
            and prev.project_id = c.project_id
            and prev.id <> c.id
            and prev.status <> 'Cancelled'
        ),
        0
      ),
      2
    ),
    revised_contract_value = round(
      public.get_project_claim_base_quote_total(c.organization_id, c.project_id)
      + public.get_project_claim_approved_variations_total(c.organization_id, c.project_id),
      2
    ),
    percent_complete = round(
      case
        when public.get_project_claim_base_quote_total(c.organization_id, c.project_id)
          + public.get_project_claim_approved_variations_total(c.organization_id, c.project_id) <= 0 then 0
        else least(
          100,
          greatest(
            0,
            (
              coalesce(
                (
                  select sum(prev.claim_amount)
                  from public.project_claims prev
                  where prev.organization_id = c.organization_id
                    and prev.project_id = c.project_id
                    and prev.id <> c.id
                    and prev.status <> 'Cancelled'
                ),
                0
              )
              + coalesce(
                (
                  select sum(cli.claim_amount)
                  from public.project_claim_line_items cli
                  where cli.organization_id = c.organization_id
                    and cli.project_id = c.project_id
                    and cli.claim_id = c.id
                ),
                0
              )
            ) / (
              public.get_project_claim_base_quote_total(c.organization_id, c.project_id)
              + public.get_project_claim_approved_variations_total(c.organization_id, c.project_id)
            ) * 100
          )
        )
      end,
      3
    );
end;
$$;

grant execute on function public.calculate_project_quote_pre_gst_total(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.get_project_claim_base_quote_total(uuid, uuid) to authenticated;
