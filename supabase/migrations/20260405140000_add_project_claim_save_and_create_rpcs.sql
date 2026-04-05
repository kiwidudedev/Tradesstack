alter table if exists public.project_document_counters
  drop constraint if exists project_document_counters_kind_check;

alter table if exists public.project_document_counters
  add constraint project_document_counters_kind_check
  check (document_kind in ('variation', 'purchase_order', 'claim'));

create or replace function public.next_project_document_number(
  p_organization_id uuid,
  p_project_id uuid,
  p_document_kind text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  if p_document_kind not in ('variation', 'purchase_order', 'claim') then
    raise exception 'Unsupported document kind: %', p_document_kind;
  end if;

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

  perform pg_advisory_xact_lock(hashtext(p_project_id::text || ':' || p_document_kind));

  insert into public.project_document_counters (
    organization_id,
    project_id,
    document_kind,
    last_number
  )
  values (
    p_organization_id,
    p_project_id,
    p_document_kind,
    1
  )
  on conflict (project_id, document_kind)
  do update
    set last_number = public.project_document_counters.last_number + 1,
        updated_at = now()
  returning last_number
  into next_number;

  return next_number;
end;
$$;

create or replace function public.generate_project_claim_number(
  p_organization_id uuid,
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_project_code text;
  next_sequence integer;
begin
  select coalesce(
           nullif(btrim(project_code), ''),
           nullif(regexp_replace(upper(coalesce(slug, '')), '[^A-Z0-9]+', '-', 'g'), ''),
           'JOB'
         )
    into resolved_project_code
  from public.organization_projects
  where id = p_project_id
    and organization_id = p_organization_id;

  if resolved_project_code is null then
    raise exception 'Could not resolve project code for claim numbering';
  end if;

  next_sequence := public.next_project_document_number(p_organization_id, p_project_id, 'claim');

  return format('%s-CL-%s', resolved_project_code, lpad(next_sequence::text, 2, '0'));
end;
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

  select coalesce(q.total_quote_price, 0)
  into resolved_quote_value
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
  limit 1;

  select coalesce(sum(v.total_variation_price), 0)
  into resolved_approved_variations
  from public.project_variations v
  where v.organization_id = p_organization_id
    and v.project_id = p_project_id
    and v.status = 'Approved';

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
  p_notes text
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

  select coalesce(q.total_quote_price, 0)
  into resolved_quote_value
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
  limit 1;

  select coalesce(sum(v.total_variation_price), 0)
  into resolved_approved_variations
  from public.project_variations v
  where v.organization_id = p_organization_id
    and v.project_id = p_project_id
    and v.status = 'Approved';

  select coalesce(sum(c.claim_amount), 0)
  into resolved_previous_claims_total
  from public.project_claims c
  where c.organization_id = p_organization_id
    and c.project_id = p_project_id
    and c.id <> p_claim_id
    and c.status <> 'Cancelled';

  resolved_revised_contract_value := resolved_quote_value + resolved_approved_variations;
  resolved_percent_complete := greatest(0, least(100, coalesce(p_percent_complete, 0)));
  resolved_paid_amount := greatest(0, coalesce(p_paid_amount, 0));
  resolved_claim_amount := greatest(0, (resolved_revised_contract_value * (resolved_percent_complete / 100)) - resolved_previous_claims_total);

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

grant execute on function public.generate_project_claim_number(uuid, uuid) to authenticated;
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
  text
) to authenticated;
