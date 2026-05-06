alter table public.project_claim_line_items
  add column if not exists line_uid uuid,
  add column if not exists cost_item_id uuid null references public.cost_items (id) on delete set null,
  add column if not exists source_cost_item_id uuid null references public.cost_items (id) on delete set null;

update public.project_claim_line_items
set line_uid = gen_random_uuid()
where line_uid is null;

alter table public.project_claim_line_items
  alter column line_uid set not null;

create unique index if not exists project_claim_line_items_claim_line_uid_uidx
  on public.project_claim_line_items (claim_id, line_uid);

create index if not exists project_claim_line_items_cost_item_idx
  on public.project_claim_line_items (cost_item_id)
  where cost_item_id is not null;

create index if not exists project_claim_line_items_source_cost_item_idx
  on public.project_claim_line_items (source_cost_item_id)
  where source_cost_item_id is not null;

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
    line_uid uuid,
    cost_item_id uuid,
    source_cost_item_id uuid,
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
    line_uid,
    cost_item_id,
    source_cost_item_id,
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
      cli.claim_percent,
      cli.line_uid,
      cli.cost_item_id,
      cli.source_cost_item_id
    from public.project_claim_line_items cli
    where cli.organization_id = p_organization_id
      and cli.project_id = p_project_id
      and cli.claim_id = p_claim_id
  ),
  quote_source_cost_items as (
    select
      ci.source_document_id,
      ci.linked_quote_line_item_id as source_line_item_id,
      ci.id
    from public.cost_items ci
    where ci.organization_id = p_organization_id
      and ci.project_id = p_project_id
      and ci.source_document_kind = 'project_quote'
      and ci.is_current = true
      and ci.linked_quote_line_item_id is not null
  ),
  variation_source_cost_items as (
    select distinct on (ci.source_document_id)
      ci.source_document_id,
      ci.id
    from public.cost_items ci
    where ci.organization_id = p_organization_id
      and ci.project_id = p_project_id
      and ci.source_document_kind = 'project_variation'
      and ci.is_current = true
    order by
      ci.source_document_id,
      ci.sort_order asc,
      ci.effective_from desc,
      ci.created_at desc,
      ci.id asc
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
    coalesce(ex.line_uid, gen_random_uuid()) as line_uid,
    ex.cost_item_id,
    coalesce(
      case
        when s.source_kind = 'Quote' then qci.id
        when s.source_kind = 'Variation' then vci.id
        else null
      end,
      ex_source.id
    ) as source_cost_item_id,
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
   and ex.source_line_item_id = s.source_line_item_id
  left join public.cost_items ex_source
    on ex_source.id = ex.source_cost_item_id
   and ex_source.organization_id = p_organization_id
   and ex_source.project_id = p_project_id
   and ex_source.is_current = true
  left join quote_source_cost_items qci
    on s.source_kind = 'Quote'
   and qci.source_document_id = s.source_document_id
   and qci.source_line_item_id = s.source_line_item_id
  left join variation_source_cost_items vci
    on s.source_kind = 'Variation'
   and vci.source_document_id = s.source_document_id;

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
    line_uid,
    cost_item_id,
    source_cost_item_id,
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
    p.line_uid,
    p.cost_item_id,
    p.source_cost_item_id,
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

create or replace function public.upsert_cost_items_for_project_claim(
  p_document_id uuid,
  p_source_revision_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_context record;
  rows_written integer := 0;
begin
  select *
  into resolved_context
  from public.resolve_cost_item_document_context('project_claim', p_document_id)
  limit 1;

  if resolved_context.organization_id is null then
    raise exception 'Document not found or not authorized for claim CostItem mirror write';
  end if;

  delete from public.cost_items ci
  where ci.source_document_kind = 'project_claim'
    and ci.source_document_id = p_document_id
    and ci.source_revision_key = p_source_revision_key;

  with current_lines as (
    select
      c.organization_id,
      c.project_id,
      c.id as document_id,
      c.claim_number as document_number,
      c.claim_title as document_title,
      cli.id as claim_line_item_id,
      cli.line_uid,
      cli.source_kind,
      cli.source_document_id,
      cli.source_line_item_id,
      cli.source_number,
      cli.source_title,
      cli.source_cost_item_id,
      cli.section,
      cli.description,
      cli.quantity,
      cli.unit,
      cli.rate as unit_rate,
      cli.source_total,
      cli.previously_claimed_amount,
      cli.previously_claimed_percent,
      cli.claim_percent,
      cli.claim_amount,
      cli.cumulative_claimed_amount,
      cli.cumulative_claimed_percent,
      cli.sort_order,
      public.compute_cost_item_source_fingerprint(
        'project_claim',
        'project_claim_line_items',
        cli.section,
        cli.description,
        cli.quantity,
        cli.unit,
        cli.rate,
        cli.claim_amount,
        false,
        cli.sort_order,
        cli.source_kind,
        coalesce(cli.line_uid::text, cli.source_line_item_id::text)
      ) as source_fingerprint
    from public.project_claims c
    join public.project_claim_line_items cli
      on cli.organization_id = c.organization_id
     and cli.project_id = c.project_id
     and cli.claim_id = c.id
    where c.id = p_document_id
      and c.organization_id = resolved_context.organization_id
      and c.project_id = resolved_context.project_id
  ), inserted_cost_items as (
    insert into public.cost_items (
      organization_id,
      project_id,
      source_document_kind,
      source_document_id,
      source_line_table,
      source_line_id,
      parent_cost_item_id,
      origin_kind,
      source_snapshot,
      item_code,
      item_type,
      section,
      category,
      trade_id,
      trade_label,
      cost_code,
      cost_type,
      title,
      description,
      quantity,
      unit,
      unit_rate,
      line_total,
      is_optional,
      sort_order,
      status,
      effective_from,
      effective_to,
      is_current,
      source_revision_key,
      source_fingerprint,
      linked_quote_line_item_id,
      linked_variation_line_item_id,
      linked_purchase_order_line_item_id,
      linked_claim_line_item_id,
      created_by
    )
    select
      cl.organization_id,
      cl.project_id,
      'project_claim',
      cl.document_id,
      'project_claim_line_items',
      cl.claim_line_item_id,
      parent_ci.id,
      'claim_snapshot',
      jsonb_build_object(
        'document_kind', 'project_claim',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'claim_line_item_id', cl.claim_line_item_id,
        'line_uid', cl.line_uid,
        'source_kind', cl.source_kind,
        'source_document_id', cl.source_document_id,
        'source_line_item_id', cl.source_line_item_id,
        'source_number', cl.source_number,
        'source_title', cl.source_title,
        'source_cost_item_id', cl.source_cost_item_id,
        'source_total', cl.source_total,
        'previously_claimed_amount', cl.previously_claimed_amount,
        'previously_claimed_percent', cl.previously_claimed_percent,
        'claim_percent', cl.claim_percent,
        'claim_amount', cl.claim_amount,
        'cumulative_claimed_amount', cl.cumulative_claimed_amount,
        'cumulative_claimed_percent', cl.cumulative_claimed_percent
      ),
      '',
      'claim_snapshot',
      cl.section,
      cl.section,
      null,
      null,
      '',
      '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled claim line item'),
      coalesce(cl.description, ''),
      cl.quantity,
      cl.unit,
      cl.unit_rate,
      cl.claim_amount,
      false,
      cl.sort_order,
      'snapshot',
      clock_timestamp(),
      null,
      true,
      p_source_revision_key,
      cl.source_fingerprint,
      null,
      null,
      null,
      cl.claim_line_item_id,
      auth.uid()
    from current_lines cl
    left join public.cost_items parent_ci
      on parent_ci.id = cl.source_cost_item_id
     and parent_ci.organization_id = cl.organization_id
     and parent_ci.project_id = cl.project_id
     and parent_ci.is_current = true
    returning id, linked_claim_line_item_id
  )
  update public.project_claim_line_items cli
  set cost_item_id = inserted_cost_items.id
  from inserted_cost_items
  where cli.id = inserted_cost_items.linked_claim_line_item_id
    and cli.cost_item_id is distinct from inserted_cost_items.id;

  get diagnostics rows_written = row_count;
  return rows_written;
end;
$$;

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
  resolved_retention_method text := 'flat';
  resolved_retention_scale_bands jsonb := '[]'::jsonb;
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
  tier_row jsonb;
  tier_lower_bound numeric := 0;
  tier_upper_bound numeric := 0;
  tier_rate_percent numeric := 0;
  tier_covered_amount numeric := 0;
  cost_item_revision_key text;
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
    resolved_retention_method := case
      when coalesce(claim_row.retention_method, 'flat') = 'sliding_scale' then 'sliding_scale'
      else 'flat'
    end;
    resolved_retention_scale_bands := coalesce(claim_row.retention_scale_bands, '[]'::jsonb);
    resolved_retention_released_amount := greatest(0, coalesce(claim_row.retention_released_amount, 0));
    certified_value_to_date := resolved_previous_claims_total + resolved_claim_amount;

    if resolved_retention_method = 'flat' then
      required_retention_to_date := certified_value_to_date * (resolved_retention_percent / 100);
    else
      required_retention_to_date := 0;
      tier_lower_bound := 0;

      for tier_row in
        select value
        from jsonb_array_elements(resolved_retention_scale_bands)
      loop
        tier_upper_bound := case
          when jsonb_typeof(tier_row -> 'up_to') = 'number' then greatest(0, (tier_row ->> 'up_to')::numeric)
          else null
        end;
        tier_rate_percent := case
          when jsonb_typeof(tier_row -> 'rate_percent') = 'number' then greatest(0, least(100, (tier_row ->> 'rate_percent')::numeric))
          else 0
        end;

        tier_covered_amount := case
          when tier_upper_bound is null then greatest(0, certified_value_to_date - tier_lower_bound)
          else greatest(0, least(certified_value_to_date, tier_upper_bound) - tier_lower_bound)
        end;

        required_retention_to_date := required_retention_to_date + (tier_covered_amount * (tier_rate_percent / 100));

        if tier_upper_bound is null then
          exit;
        end if;

        tier_lower_bound := greatest(tier_lower_bound, tier_upper_bound);
      end loop;
    end if;

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

    cost_item_revision_key := public.begin_cost_item_revision('project_claim', claim_row.id);
    perform public.supersede_previous_cost_items('project_claim', claim_row.id, cost_item_revision_key);
    perform public.upsert_cost_items_for_project_claim(claim_row.id, cost_item_revision_key);

    if current_claim_counts then
      running_previous_claims_total := running_previous_claims_total + resolved_claim_amount;
      running_retention_held_total := running_retention_held_total + resolved_retention_withheld_amount;
      running_retention_released_total := running_retention_released_total + resolved_retention_released_amount;
    end if;
  end loop;
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
  retention_method text,
  retention_scale_bands jsonb,
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
  resolved_retention_method text := 'flat';
  resolved_retention_scale_bands jsonb := null;
  resolved_retention_percent numeric := 10;
  cost_item_revision_key text;
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

  resolved_retention_method := coalesce((
    select case
      when coalesce(c.retention_method, 'flat') = 'sliding_scale' then 'sliding_scale'
      else 'flat'
    end
    from public.project_claims c
    where c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.status <> 'Cancelled'
    order by
      c.updated_at desc,
      c.id desc
    limit 1
  ), 'flat');

  resolved_retention_scale_bands := case
    when resolved_retention_method = 'sliding_scale' then (
      select c.retention_scale_bands
      from public.project_claims c
      where c.organization_id = p_organization_id
        and c.project_id = p_project_id
        and c.status <> 'Cancelled'
      order by
        c.updated_at desc,
        c.id desc
      limit 1
    )
    else null
  end;

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
    retention_method,
    retention_scale_bands,
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
    resolved_retention_method,
    case
      when resolved_retention_method = 'sliding_scale' then resolved_retention_scale_bands
      else null
    end,
    round(coalesce(resolved_retention_percent, 10), 3),
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

  cost_item_revision_key := public.begin_cost_item_revision('project_claim', created_row.id);
  perform public.supersede_previous_cost_items('project_claim', created_row.id, cost_item_revision_key);
  perform public.upsert_cost_items_for_project_claim(created_row.id, cost_item_revision_key);

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
    created_row.retention_method,
    created_row.retention_scale_bands,
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
  p_retention_method text,
  p_retention_scale_bands jsonb,
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
  resolved_retention_method text := case
    when coalesce(p_retention_method, 'flat') = 'sliding_scale' then 'sliding_scale'
    else 'flat'
  end;
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
    retention_method = resolved_retention_method,
    retention_scale_bands = case
      when resolved_retention_method = 'sliding_scale' then coalesce(p_retention_scale_bands, '[]'::jsonb)
      else null
    end,
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

create or replace function public.delete_project_claim_safe(
  p_organization_id uuid,
  p_project_id uuid,
  p_claim_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_claim public.project_claims%rowtype;
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

  select *
  into existing_claim
  from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Claim not found';
  end if;

  if coalesce(existing_claim.status, 'Draft') <> 'Draft' then
    raise exception 'Only draft claims can be deleted';
  end if;

  update public.cost_items
  set
    status = 'deleted',
    effective_to = coalesce(effective_to, clock_timestamp()),
    is_current = false,
    source_line_id = null,
    linked_claim_line_item_id = null
  where source_document_kind = 'project_claim'
    and source_document_id = p_claim_id
    and is_current = true;

  delete from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;

  perform public.recalculate_project_claim_snapshots(
    p_organization_id,
    p_project_id
  );
end;
$$;

do $$
declare
  project_row record;
begin
  for project_row in
    select distinct
      c.organization_id,
      c.project_id
    from public.project_claims c
    order by c.organization_id, c.project_id
  loop
    perform public.recalculate_project_claim_snapshots(
      project_row.organization_id,
      project_row.project_id
    );
  end loop;
end;
$$;

grant execute on function public.sync_project_claim_line_items(uuid, uuid, uuid, jsonb, numeric) to authenticated;
grant execute on function public.upsert_cost_items_for_project_claim(uuid, text) to authenticated;
grant execute on function public.recalculate_project_claim_snapshots(uuid, uuid) to authenticated;
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
  jsonb,
  numeric,
  numeric,
  text,
  jsonb
) to authenticated;
grant execute on function public.delete_project_claim_safe(uuid, uuid, uuid) to authenticated;
