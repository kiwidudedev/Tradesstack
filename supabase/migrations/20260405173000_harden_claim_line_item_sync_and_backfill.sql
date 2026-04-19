create or replace function public.sync_project_claim_line_items(
  p_organization_id uuid,
  p_project_id uuid,
  p_claim_id uuid,
  p_input_line_items jsonb default null,
  p_target_claim_amount numeric default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  computed_claim_amount numeric := 0;
begin
  if auth.uid() is not null and not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  create temporary table if not exists _claim_line_input (
    source_kind text,
    source_line_item_id uuid,
    claim_percent numeric
  ) on commit drop;
  truncate _claim_line_input;

  if p_input_line_items is not null then
    insert into _claim_line_input (source_kind, source_line_item_id, claim_percent)
    select
      case
        when item->>'source_kind' in ('Quote', 'Variation') then item->>'source_kind'
        else 'Quote'
      end,
      (item->>'source_line_item_id')::uuid,
      greatest(0, least(100, coalesce((item->>'claim_percent')::numeric, 0)))
    from jsonb_array_elements(coalesce(p_input_line_items, '[]'::jsonb)) as item
    where nullif(item->>'source_line_item_id', '') is not null;
  end if;

  create temporary table if not exists _claim_line_prepared (
    source_kind text,
    source_document_id uuid,
    source_line_item_id uuid,
    source_number text,
    source_title text,
    section text,
    description text,
    quantity numeric,
    unit text,
    rate numeric,
    source_total numeric,
    previously_claimed_amount numeric,
    previously_claimed_percent numeric,
    claim_percent numeric,
    claim_amount numeric,
    cumulative_claimed_amount numeric,
    cumulative_claimed_percent numeric,
    sort_order integer
  ) on commit drop;
  truncate _claim_line_prepared;

  insert into _claim_line_prepared (
    source_kind,
    source_document_id,
    source_line_item_id,
    source_number,
    source_title,
    section,
    description,
    quantity,
    unit,
    rate,
    source_total,
    previously_claimed_amount,
    previously_claimed_percent,
    claim_percent,
    claim_amount,
    cumulative_claimed_amount,
    cumulative_claimed_percent,
    sort_order
  )
  with claim_row as (
    select
      c.id,
      c.claim_amount,
      c.claim_date,
      c.created_at
    from public.project_claims c
    where c.id = p_claim_id
      and c.organization_id = p_organization_id
      and c.project_id = p_project_id
    limit 1
  ),
  source_lines as (
    select *
    from public.get_project_claim_source_line_items(p_organization_id, p_project_id)
  ),
  previous_claims as (
    select
      cli.source_kind,
      cli.source_line_item_id,
      coalesce(sum(cli.claim_amount), 0) as previous_amount
    from public.project_claim_line_items cli
    join public.project_claims c
      on c.id = cli.claim_id
     and c.organization_id = p_organization_id
     and c.project_id = p_project_id
     and c.id <> p_claim_id
     and c.status <> 'Cancelled'
    cross join claim_row current_claim
    where cli.organization_id = p_organization_id
      and cli.project_id = p_project_id
      and (
        row(
          coalesce(c.claim_date, 'infinity'::date),
          c.created_at,
          c.id
        ) < row(
          coalesce(current_claim.claim_date, 'infinity'::date),
          current_claim.created_at,
          current_claim.id
        )
      )
    group by cli.source_kind, cli.source_line_item_id
  ),
  existing_lines as (
    select
      cli.source_kind,
      cli.source_line_item_id,
      cli.claim_percent
    from public.project_claim_line_items cli
    where cli.organization_id = p_organization_id
      and cli.project_id = p_project_id
      and cli.claim_id = p_claim_id
  ),
  totals as (
    select
      coalesce(sum(greatest(0, coalesce(s.source_total, 0) - coalesce(pc.previous_amount, 0))), 0) as total_remaining,
      greatest(0, coalesce(p_target_claim_amount, (select claim_amount from claim_row), 0)) as target_claim_amount
    from source_lines s
    left join previous_claims pc
      on pc.source_kind = s.source_kind
     and pc.source_line_item_id = s.source_line_item_id
  )
  select
    s.source_kind,
    s.source_document_id,
    s.source_line_item_id,
    s.source_number,
    s.source_title,
    s.section,
    s.description,
    s.quantity,
    s.unit,
    s.rate,
    round(coalesce(s.source_total, 0), 2) as source_total,
    round(coalesce(pc.previous_amount, 0), 2) as previously_claimed_amount,
    case
      when coalesce(s.source_total, 0) <= 0 then 0
      else round(least(100, greatest(0, (coalesce(pc.previous_amount, 0) / s.source_total) * 100)), 3)
    end as previously_claimed_percent,
    greatest(
      0,
      least(
        100,
        coalesce(
          inp.claim_percent,
          ex.claim_percent,
          case
            when t.total_remaining <= 0 then 0
            else (t.target_claim_amount / t.total_remaining) * 100
          end
        )
      )
    ) as claim_percent,
    round(
      greatest(0, coalesce(s.source_total, 0) - coalesce(pc.previous_amount, 0))
      * (
        greatest(
          0,
          least(
            100,
            coalesce(
              inp.claim_percent,
              ex.claim_percent,
              case
                when t.total_remaining <= 0 then 0
                else (t.target_claim_amount / t.total_remaining) * 100
              end
            )
          )
        ) / 100
      ),
      2
    ) as claim_amount,
    round(
      coalesce(pc.previous_amount, 0)
      + (
        greatest(0, coalesce(s.source_total, 0) - coalesce(pc.previous_amount, 0))
        * (
          greatest(
            0,
            least(
              100,
              coalesce(
                inp.claim_percent,
                ex.claim_percent,
                case
                  when t.total_remaining <= 0 then 0
                  else (t.target_claim_amount / t.total_remaining) * 100
                end
              )
            )
          ) / 100
        )
      ),
      2
    ) as cumulative_claimed_amount,
    case
      when coalesce(s.source_total, 0) <= 0 then 0
      else round(
        least(
          100,
          greatest(
            0,
            (
              coalesce(pc.previous_amount, 0)
              + (
                greatest(0, coalesce(s.source_total, 0) - coalesce(pc.previous_amount, 0))
                * (
                  greatest(
                    0,
                    least(
                      100,
                      coalesce(
                        inp.claim_percent,
                        ex.claim_percent,
                        case
                          when t.total_remaining <= 0 then 0
                          else (t.target_claim_amount / t.total_remaining) * 100
                        end
                      )
                    )
                  ) / 100
                )
              )
            ) / s.source_total * 100
          )
        ),
        3
      )
    end as cumulative_claimed_percent,
    s.sort_order
  from source_lines s
  cross join totals t
  left join previous_claims pc
    on pc.source_kind = s.source_kind
   and pc.source_line_item_id = s.source_line_item_id
  left join _claim_line_input inp
    on inp.source_kind = s.source_kind
   and inp.source_line_item_id = s.source_line_item_id
  left join existing_lines ex
    on ex.source_kind = s.source_kind
   and ex.source_line_item_id = s.source_line_item_id;

  delete from public.project_claim_line_items cli
  where cli.organization_id = p_organization_id
    and cli.project_id = p_project_id
    and cli.claim_id = p_claim_id;

  insert into public.project_claim_line_items (
    organization_id,
    project_id,
    claim_id,
    source_kind,
    source_document_id,
    source_line_item_id,
    source_number,
    source_title,
    section,
    description,
    quantity,
    unit,
    rate,
    source_total,
    previously_claimed_amount,
    previously_claimed_percent,
    claim_percent,
    claim_amount,
    cumulative_claimed_amount,
    cumulative_claimed_percent,
    sort_order
  )
  select
    p_organization_id,
    p_project_id,
    p_claim_id,
    p.source_kind,
    p.source_document_id,
    p.source_line_item_id,
    p.source_number,
    p.source_title,
    p.section,
    p.description,
    p.quantity,
    p.unit,
    p.rate,
    p.source_total,
    p.previously_claimed_amount,
    p.previously_claimed_percent,
    p.claim_percent,
    p.claim_amount,
    p.cumulative_claimed_amount,
    p.cumulative_claimed_percent,
    p.sort_order
  from _claim_line_prepared p;

  select coalesce(sum(p.claim_amount), 0)
  into computed_claim_amount
  from _claim_line_prepared p;

  return computed_claim_amount;
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

create or replace function public.ensure_project_claim_line_items_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_project_claim_line_items(
    new.organization_id,
    new.project_id,
    new.id,
    null,
    new.claim_amount
  );
  return new;
end;
$$;

drop trigger if exists set_project_claim_line_items_on_insert on public.project_claims;
create trigger set_project_claim_line_items_on_insert
after insert on public.project_claims
for each row
execute function public.ensure_project_claim_line_items_after_insert();

do $$
declare
  claim_row record;
begin
  for claim_row in
    select
      c.organization_id,
      c.project_id,
      c.id,
      c.claim_amount
    from public.project_claims c
    where not exists (
      select 1
      from public.project_claim_line_items cli
      where cli.claim_id = c.id
    )
    order by
      c.organization_id,
      c.project_id,
      coalesce(c.claim_date, c.created_at::date),
      c.created_at,
      c.id
  loop
    perform public.sync_project_claim_line_items(
      claim_row.organization_id,
      claim_row.project_id,
      claim_row.id,
      null,
      claim_row.claim_amount
    );
  end loop;
end;
$$;

grant execute on function public.sync_project_claim_line_items(uuid, uuid, uuid, jsonb, numeric) to authenticated;
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
  text,
  jsonb
) to authenticated;
