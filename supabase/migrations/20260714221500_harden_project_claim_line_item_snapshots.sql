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
    source_document_id uuid,
    source_line_item_id uuid,
    claim_percent numeric
  ) on commit drop;
  truncate _claim_line_input;

  if p_input_line_items is not null then
    insert into _claim_line_input (source_kind, source_document_id, source_line_item_id, claim_percent)
    select
      case
        when item->>'source_kind' in ('Quote', 'Variation') then item->>'source_kind'
        else 'Quote'
      end,
      (item->>'source_document_id')::uuid,
      (item->>'source_line_item_id')::uuid,
      greatest(0, least(100, coalesce((item->>'claim_percent')::numeric, 0)))
    from jsonb_array_elements(coalesce(p_input_line_items, '[]'::jsonb)) as item
    where nullif(item->>'source_document_id', '') is not null
      and nullif(item->>'source_line_item_id', '') is not null;
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
  live_source_lines as (
    select *
    from public.get_project_claim_source_line_items(p_organization_id, p_project_id)
  ),
  existing_claim_snapshot_rows as (
    select
      cli.source_kind,
      cli.source_document_id,
      cli.source_line_item_id,
      cli.source_number,
      cli.source_title,
      cli.line_uid,
      cli.cost_item_id,
      cli.source_cost_item_id,
      cli.section,
      cli.description,
      cli.quantity,
      cli.unit,
      cli.rate,
      cli.source_total,
      cli.previously_claimed_amount,
      cli.previously_claimed_percent,
      cli.claim_percent,
      cli.claim_amount,
      cli.cumulative_claimed_amount,
      cli.cumulative_claimed_percent,
      cli.sort_order
    from public.project_claim_line_items cli
    where cli.organization_id = p_organization_id
      and cli.project_id = p_project_id
      and cli.claim_id = p_claim_id
  ),
  source_lines as (
    select
      ls.source_kind,
      ls.source_document_id,
      ls.source_line_item_id,
      ls.source_number,
      ls.source_title,
      ls.section,
      ls.description,
      ls.quantity,
      ls.unit,
      ls.rate,
      ls.source_total,
      ls.sort_order
    from live_source_lines ls

    union all

    select
      ex.source_kind,
      ex.source_document_id,
      ex.source_line_item_id,
      ex.source_number,
      ex.source_title,
      ex.section,
      ex.description,
      ex.quantity,
      ex.unit,
      ex.rate,
      ex.source_total,
      ex.sort_order
    from existing_claim_snapshot_rows ex
    where not exists (
      select 1
      from live_source_lines ls
      where ls.source_kind = ex.source_kind
        and ls.source_document_id = ex.source_document_id
        and ls.source_line_item_id = ex.source_line_item_id
    )
  ),
  previous_claims as (
    select
      cli.source_kind,
      cli.source_document_id,
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
    group by cli.source_kind, cli.source_document_id, cli.source_line_item_id
  ),
  existing_lines as (
    select *
    from existing_claim_snapshot_rows
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
     and pc.source_document_id = s.source_document_id
     and pc.source_line_item_id = s.source_line_item_id
  )
  select
    s.source_kind,
    coalesce(ex.source_document_id, s.source_document_id) as source_document_id,
    coalesce(ex.source_line_item_id, s.source_line_item_id) as source_line_item_id,
    coalesce(nullif(ex.source_number, ''), s.source_number, '') as source_number,
    coalesce(nullif(ex.source_title, ''), s.source_title, '') as source_title,
    coalesce(ex.line_uid, gen_random_uuid()) as line_uid,
    ex.cost_item_id,
    coalesce(
      ex.source_cost_item_id,
      ex_source.id,
      case
        when s.source_kind = 'Quote' then qci.id
        when s.source_kind = 'Variation' then vci.id
        else null
      end
    ) as source_cost_item_id,
    coalesce(nullif(ex.section, ''), s.section, 'Item') as section,
    coalesce(nullif(ex.description, ''), s.description, '') as description,
    coalesce(ex.quantity, s.quantity, 0) as quantity,
    coalesce(nullif(ex.unit, ''), s.unit, '') as unit,
    coalesce(ex.rate, s.rate, 0) as rate,
    round(coalesce(ex.source_total, s.source_total, 0), 2) as source_total,
    round(coalesce(pc.previous_amount, 0), 2) as previously_claimed_amount,
    case
      when coalesce(ex.source_total, s.source_total, 0) <= 0 then 0
      else round(
        least(
          100,
          greatest(0, (coalesce(pc.previous_amount, 0) / coalesce(ex.source_total, s.source_total, 0)) * 100)
        ),
        3
      )
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
      greatest(0, coalesce(ex.source_total, s.source_total, 0) - coalesce(pc.previous_amount, 0))
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
        greatest(0, coalesce(ex.source_total, s.source_total, 0) - coalesce(pc.previous_amount, 0))
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
      when coalesce(ex.source_total, s.source_total, 0) <= 0 then 0
      else round(
        least(
          100,
          greatest(
            0,
            (
              coalesce(pc.previous_amount, 0)
              + (
                greatest(0, coalesce(ex.source_total, s.source_total, 0) - coalesce(pc.previous_amount, 0))
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
            ) / coalesce(ex.source_total, s.source_total, 0) * 100
          )
        ),
        3
      )
    end as cumulative_claimed_percent,
    coalesce(ex.sort_order, s.sort_order, 0) as sort_order
  from source_lines s
  cross join totals t
  left join previous_claims pc
    on pc.source_kind = s.source_kind
   and pc.source_document_id = s.source_document_id
   and pc.source_line_item_id = s.source_line_item_id
  left join _claim_line_input inp
    on inp.source_kind = s.source_kind
   and inp.source_document_id = s.source_document_id
   and inp.source_line_item_id = s.source_line_item_id
  left join existing_lines ex
    on ex.source_kind = s.source_kind
   and ex.source_document_id = s.source_document_id
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

  update public.project_claim_line_items cli
  set
    source_number = p.source_number,
    source_title = p.source_title,
    line_uid = p.line_uid,
    cost_item_id = p.cost_item_id,
    source_cost_item_id = p.source_cost_item_id,
    section = p.section,
    description = p.description,
    quantity = p.quantity,
    unit = p.unit,
    rate = p.rate,
    source_total = p.source_total,
    previously_claimed_amount = p.previously_claimed_amount,
    previously_claimed_percent = p.previously_claimed_percent,
    claim_percent = p.claim_percent,
    claim_amount = p.claim_amount,
    cumulative_claimed_amount = p.cumulative_claimed_amount,
    cumulative_claimed_percent = p.cumulative_claimed_percent,
    sort_order = p.sort_order
  from _claim_line_prepared p
  where cli.organization_id = p_organization_id
    and cli.project_id = p_project_id
    and cli.claim_id = p_claim_id
    and cli.source_kind = p.source_kind
    and cli.source_document_id = p.source_document_id
    and cli.source_line_item_id = p.source_line_item_id;

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
  from _claim_line_prepared p
  where not exists (
    select 1
    from public.project_claim_line_items cli
    where cli.organization_id = p_organization_id
      and cli.project_id = p_project_id
      and cli.claim_id = p_claim_id
      and cli.source_kind = p.source_kind
      and cli.source_document_id = p.source_document_id
      and cli.source_line_item_id = p.source_line_item_id
  );

  select coalesce(sum(p.claim_amount), 0)
  into computed_claim_amount
  from _claim_line_prepared p;

  return computed_claim_amount;
end;
$$;

update public.project_claim_line_items cli
set description = qli.description
from public.project_quote_line_items qli
where cli.source_kind = 'Quote'
  and cli.organization_id = qli.organization_id
  and cli.project_id = qli.project_id
  and cli.source_document_id = qli.quote_id
  and cli.source_line_item_id = qli.id
  and nullif(btrim(cli.description), '') is null;

update public.project_claim_line_items cli
set description = vli.description
from public.project_variation_line_items vli
where cli.source_kind = 'Variation'
  and cli.organization_id = vli.organization_id
  and cli.project_id = vli.project_id
  and cli.source_document_id = vli.variation_id
  and cli.source_line_item_id = vli.id
  and nullif(btrim(cli.description), '') is null;

grant execute on function public.sync_project_claim_line_items(uuid, uuid, uuid, jsonb, numeric) to authenticated;
