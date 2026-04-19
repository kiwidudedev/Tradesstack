alter table public.project_quotes
  add column if not exists retention_percent_default numeric(7,3) not null default 0;

alter table public.project_claims
  add column if not exists retention_percent numeric(7,3) not null default 0,
  add column if not exists retention_withheld_amount numeric(14,2) not null default 0,
  add column if not exists retention_released_amount numeric(14,2) not null default 0,
  add column if not exists retention_held_to_date numeric(14,2) not null default 0,
  add column if not exists retention_released_to_date numeric(14,2) not null default 0,
  add column if not exists retention_balance numeric(14,2) not null default 0,
  add column if not exists net_claim_excl_gst numeric(14,2) not null default 0,
  add column if not exists gst_amount numeric(14,2) not null default 0,
  add column if not exists total_payable numeric(14,2) not null default 0;

create or replace function public.get_project_claim_base_quote_retention_percent_default(
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
      select round(coalesce(q.retention_percent_default, 0), 3)
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

drop function if exists public.save_project_quote_draft(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
);

create or replace function public.save_project_quote_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_quote_id uuid,
  p_expected_updated_at timestamptz,
  p_quote_title text,
  p_quote_number text,
  p_client_name text,
  p_company_name text,
  p_contact_person text,
  p_client_email text,
  p_client_phone text,
  p_site_address text,
  p_project_name text,
  p_quote_date date,
  p_expiry_date date,
  p_status text,
  p_optional_items_notes text,
  p_scope_exclusions text,
  p_assumptions text,
  p_scope_notes text,
  p_margin_percent numeric,
  p_discount_amount numeric,
  p_contingency_amount numeric,
  p_gst_percent numeric,
  p_validity_period text,
  p_payment_terms text,
  p_retention_percent_default numeric,
  p_lead_time text,
  p_terms_inclusions text,
  p_terms_exclusions text,
  p_clarifications text,
  p_acceptance_notes text,
  p_line_items jsonb
)
returns table (
  id uuid,
  updated_at timestamptz,
  subtotal numeric,
  optional_subtotal numeric,
  gst_amount numeric,
  total_quote_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_quotes%rowtype;
  saved_row public.project_quotes%rowtype;
  v_computed_subtotal numeric := 0;
  v_computed_optional_subtotal numeric := 0;
  v_computed_margin numeric := 0;
  v_computed_discount numeric := 0;
  v_computed_contingency numeric := 0;
  v_pre_gst_total numeric := 0;
  v_computed_gst numeric := 0;
  v_computed_grand_total numeric := 0;
  v_resolved_retention_percent_default numeric := 0;
  v_saved_status text := 'Draft';
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
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

  if coalesce(nullif(btrim(p_quote_title), ''), '') = '' then
    raise exception 'Quote title is required';
  end if;

  if coalesce(nullif(btrim(p_quote_number), ''), '') = '' then
    raise exception 'Quote number is required';
  end if;

  select
    coalesce(sum(
      case
        when coalesce((line.item->>'isOptional')::boolean, false) then 0
        else round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
      end
    ), 0),
    coalesce(sum(
      case
        when coalesce((line.item->>'isOptional')::boolean, false) then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0
      end
    ), 0)
  into v_computed_subtotal, v_computed_optional_subtotal
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  v_computed_margin := v_computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  v_computed_discount := coalesce(p_discount_amount, 0);
  v_computed_contingency := coalesce(p_contingency_amount, 0);
  v_pre_gst_total := greatest(0, v_computed_subtotal + v_computed_margin + v_computed_contingency - v_computed_discount);
  v_computed_gst := v_pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  v_computed_grand_total := v_pre_gst_total + v_computed_gst;
  v_resolved_retention_percent_default := greatest(0, least(100, coalesce(p_retention_percent_default, 0)));

  if p_quote_id is not null then
    select *
    into existing_row
    from public.project_quotes q
    where q.id = p_quote_id
      and q.organization_id = p_organization_id
      and q.project_id = p_project_id
    for update;

    if not found then
      raise exception 'Quote not found';
    end if;

    if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
      raise exception 'This quote was updated by another user. Refresh and try again.'
        using errcode = '40001';
    end if;

    execute $quote_update$
      update public.project_quotes q
      set
        quote_title = btrim($1),
        quote_number = btrim($2),
        client_name = coalesce($3, ''),
        company_name = coalesce($4, ''),
        contact_person = coalesce($5, ''),
        client_email = coalesce($6, ''),
        client_phone = coalesce($7, ''),
        site_address = coalesce($8, ''),
        project_name = coalesce($9, ''),
        quote_date = $10,
        expiry_date = $11,
        status = case
          when $12 in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then $12
          else q.status
        end,
        optional_items_notes = coalesce($13, ''),
        scope_exclusions = coalesce($14, ''),
        assumptions = coalesce($15, ''),
        scope_notes = coalesce($16, ''),
        subtotal = round(($17)::numeric, 2),
        optional_subtotal = round(($18)::numeric, 2),
        margin_percent = round(coalesce(($19)::numeric, 0), 3),
        margin_amount = round(($20)::numeric, 2),
        discount_amount = round(coalesce(($21)::numeric, 0), 2),
        contingency_amount = round(coalesce(($22)::numeric, 0), 2),
        gst_percent = round(coalesce(($23)::numeric, 0), 3),
        gst_amount = round(($24)::numeric, 2),
        total_quote_price = round(($25)::numeric, 2),
        validity_period = coalesce($26, ''),
        payment_terms = coalesce($27, ''),
        retention_percent_default = round(($28)::numeric, 3),
        lead_time = coalesce($29, ''),
        terms_inclusions = coalesce($30, ''),
        terms_exclusions = coalesce($31, ''),
        clarifications = coalesce($32, ''),
        acceptance_notes = coalesce($33, '')
      where q.id = $34
        and q.organization_id = $35
        and q.project_id = $36
      returning *
    $quote_update$
    into saved_row
    using
      p_quote_title,
      p_quote_number,
      p_client_name,
      p_company_name,
      p_contact_person,
      p_client_email,
      p_client_phone,
      p_site_address,
      p_project_name,
      p_quote_date,
      p_expiry_date,
      p_status,
      p_optional_items_notes,
      p_scope_exclusions,
      p_assumptions,
      p_scope_notes,
      v_computed_subtotal,
      v_computed_optional_subtotal,
      p_margin_percent,
      v_computed_margin,
      p_discount_amount,
      p_contingency_amount,
      p_gst_percent,
      v_computed_gst,
      v_computed_grand_total,
      p_validity_period,
      p_payment_terms,
      v_resolved_retention_percent_default,
      p_lead_time,
      p_terms_inclusions,
      p_terms_exclusions,
      p_clarifications,
      p_acceptance_notes,
      p_quote_id,
      p_organization_id,
      p_project_id;
  else
    v_saved_status := case
      when p_status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then p_status
      else 'Draft'
    end;

    execute $quote_insert$
      insert into public.project_quotes (
        organization_id,
        project_id,
        created_by,
        quote_title,
        quote_number,
        client_name,
        company_name,
        contact_person,
        client_email,
        client_phone,
        site_address,
        project_name,
        quote_date,
        expiry_date,
        status,
        optional_items_notes,
        scope_exclusions,
        assumptions,
        scope_notes,
        subtotal,
        optional_subtotal,
        margin_percent,
        margin_amount,
        discount_amount,
        contingency_amount,
        gst_percent,
        gst_amount,
        total_quote_price,
        validity_period,
        payment_terms,
        retention_percent_default,
        lead_time,
        terms_inclusions,
        terms_exclusions,
        clarifications,
        acceptance_notes
      ) values (
        $1,
        $2,
        auth.uid(),
        btrim($3),
        btrim($4),
        coalesce($5, ''),
        coalesce($6, ''),
        coalesce($7, ''),
        coalesce($8, ''),
        coalesce($9, ''),
        coalesce($10, ''),
        coalesce($11, ''),
        $12,
        $13,
        $14,
        coalesce($15, ''),
        coalesce($16, ''),
        coalesce($17, ''),
        coalesce($18, ''),
        round(($19)::numeric, 2),
        round(($20)::numeric, 2),
        round(coalesce(($21)::numeric, 0), 3),
        round(($22)::numeric, 2),
        round(coalesce(($23)::numeric, 0), 2),
        round(coalesce(($24)::numeric, 0), 2),
        round(coalesce(($25)::numeric, 0), 3),
        round(($26)::numeric, 2),
        round(($27)::numeric, 2),
        coalesce($28, ''),
        coalesce($29, ''),
        round(($30)::numeric, 3),
        coalesce($31, ''),
        coalesce($32, ''),
        coalesce($33, ''),
        coalesce($34, ''),
        coalesce($35, '')
      )
      returning *
    $quote_insert$
    into saved_row
    using
      p_organization_id,
      p_project_id,
      p_quote_title,
      p_quote_number,
      p_client_name,
      p_company_name,
      p_contact_person,
      p_client_email,
      p_client_phone,
      p_site_address,
      p_project_name,
      p_quote_date,
      p_expiry_date,
      v_saved_status,
      p_optional_items_notes,
      p_scope_exclusions,
      p_assumptions,
      p_scope_notes,
      v_computed_subtotal,
      v_computed_optional_subtotal,
      p_margin_percent,
      v_computed_margin,
      p_discount_amount,
      p_contingency_amount,
      p_gst_percent,
      v_computed_gst,
      v_computed_grand_total,
      p_validity_period,
      p_payment_terms,
      v_resolved_retention_percent_default,
      p_lead_time,
      p_terms_inclusions,
      p_terms_exclusions,
      p_clarifications,
      p_acceptance_notes;
  end if;

  delete from public.project_quote_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.quote_id = saved_row.id;

  insert into public.project_quote_line_items (
    id,
    organization_id,
    project_id,
    quote_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    is_optional,
    sort_order
  )
  select
    case
      when nullif(line.item->>'id', '') is not null then (line.item->>'id')::uuid
      else gen_random_uuid()
    end,
    p_organization_id,
    p_project_id,
    saved_row.id,
    case
      when line.item->>'section' in ('Item', 'Materials', 'Labour', 'Plant', 'Subcontractors', 'Preliminaries') then line.item->>'section'
      else 'Labour'
    end,
    coalesce(line.item->>'description', ''),
    coalesce(nullif(line.item->>'quantity', '')::numeric, 0),
    coalesce(line.item->>'unit', ''),
    coalesce(nullif(line.item->>'rate', '')::numeric, 0),
    round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2),
    coalesce((line.item->>'isOptional')::boolean, false),
    row_number() over ()
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  return query
  select
    saved_row.id,
    saved_row.updated_at,
    saved_row.subtotal,
    saved_row.optional_subtotal,
    saved_row.gst_amount,
    saved_row.total_quote_price,
    saved_row.status;
end;
$$;

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
    0,
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
declare
  existing_row public.project_claims%rowtype;
  updated_row public.project_claims%rowtype;
  resolved_paid_amount numeric := 0;
  resolved_status text := 'Draft';
  resolved_retention_percent numeric := 0;
  resolved_retention_released_amount numeric := 0;
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

  resolved_paid_amount := greatest(0, coalesce(p_paid_amount, 0));

  perform public.sync_project_claim_line_items(
    p_organization_id,
    p_project_id,
    p_claim_id,
    p_line_items,
    null
  );

  resolved_status := case
    when p_status in ('Draft', 'Submitted', 'Unpaid', 'Paid', 'Overdue', 'Cancelled') then p_status
    else existing_row.status
  end;
  resolved_retention_percent := greatest(0, least(100, coalesce(p_retention_percent, existing_row.retention_percent, 0)));
  resolved_retention_released_amount := greatest(0, coalesce(p_retention_released_amount, existing_row.retention_released_amount, 0));

  update public.project_claims c
  set
    claim_title = coalesce(nullif(btrim(p_claim_title), ''), c.claim_title),
    claim_type = case
      when p_claim_type in ('Progress', 'Deposit', 'Final') then p_claim_type
      else c.claim_type
    end,
    status = resolved_status,
    claim_date = p_claim_date,
    due_date = p_due_date,
    period_start = p_period_start,
    period_end = p_period_end,
    paid_amount = round(resolved_paid_amount, 2),
    retention_percent = round(resolved_retention_percent, 3),
    retention_released_amount = round(resolved_retention_released_amount, 2),
    notes = coalesce(p_notes, '')
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id
  returning * into updated_row;

  perform public.recalculate_project_claim_snapshots(
    p_organization_id,
    p_project_id
  );

  select *
  into updated_row
  from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;

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
    updated_row.status,
    updated_row.retention_percent,
    updated_row.retention_withheld_amount,
    updated_row.retention_released_amount,
    updated_row.retention_held_to_date,
    updated_row.retention_released_to_date,
    updated_row.retention_balance,
    updated_row.net_claim_excl_gst,
    updated_row.gst_amount,
    updated_row.total_payable;
end;
$$;

with recalculated_claims as (
  select
    c.id,
    round(coalesce(c.claim_amount, 0) * (greatest(0, least(100, coalesce(c.retention_percent, 0))) / 100), 2) as retention_withheld_amount,
    round(coalesce(c.retention_released_amount, 0), 2) as retention_released_amount,
    round(
      coalesce(c.claim_amount, 0)
      - round(coalesce(c.claim_amount, 0) * (greatest(0, least(100, coalesce(c.retention_percent, 0))) / 100), 2)
      + round(coalesce(c.retention_released_amount, 0), 2),
      2
    ) as net_claim_excl_gst
  from public.project_claims c
),
retention_totals as (
  select
    c.id,
    round(
      coalesce(sum(case when prev.status <> 'Cancelled' then prev.retention_withheld_amount else 0 end), 0)
      + case when c.status <> 'Cancelled' then rc.retention_withheld_amount else 0 end,
      2
    ) as retention_held_to_date,
    round(
      coalesce(sum(case when prev.status <> 'Cancelled' then prev.retention_released_amount else 0 end), 0)
      + case when c.status <> 'Cancelled' then rc.retention_released_amount else 0 end,
      2
    ) as retention_released_to_date
  from public.project_claims c
  join recalculated_claims rc
    on rc.id = c.id
  left join public.project_claims prev
    on prev.organization_id = c.organization_id
   and prev.project_id = c.project_id
   and prev.id <> c.id
   and prev.status <> 'Cancelled'
  group by c.id, c.status, rc.retention_withheld_amount, rc.retention_released_amount
)
update public.project_claims c
set
  retention_percent = round(greatest(0, least(100, coalesce(c.retention_percent, 0))), 3),
  retention_withheld_amount = rc.retention_withheld_amount,
  retention_released_amount = rc.retention_released_amount,
  retention_held_to_date = rt.retention_held_to_date,
  retention_released_to_date = rt.retention_released_to_date,
  retention_balance = round(rt.retention_held_to_date - rt.retention_released_to_date, 2),
  net_claim_excl_gst = rc.net_claim_excl_gst,
  gst_amount = round(rc.net_claim_excl_gst * 0.15, 2),
  total_payable = round(rc.net_claim_excl_gst + round(rc.net_claim_excl_gst * 0.15, 2), 2)
from recalculated_claims rc
join retention_totals rt
  on rt.id = rc.id
where c.id = rc.id;

grant execute on function public.get_project_claim_base_quote_retention_percent_default(uuid, uuid) to authenticated;
grant execute on function public.save_project_quote_draft(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;
grant execute on function public.create_project_claim_draft(uuid, uuid, text) to authenticated;
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
