create or replace function public.build_time_sheet_entry_labour_line_description(
  p_organization_id uuid,
  p_worker_name text,
  p_clock_in_at timestamptz
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  organization_timezone text;
  effective_timezone text := 'Pacific/Auckland';
  local_clock_in timestamp;
begin
  select nullif(btrim(o.timezone), '')
  into organization_timezone
  from public.organizations o
  where o.id = p_organization_id
  limit 1;

  if organization_timezone is not null then
    effective_timezone := organization_timezone;
  end if;

  begin
    local_clock_in := p_clock_in_at at time zone effective_timezone;
  exception
    when others then
      local_clock_in := p_clock_in_at at time zone 'UTC';
  end;

  return coalesce(nullif(btrim(p_worker_name), ''), 'Worker') || ' - ' || to_char(local_clock_in, 'DD/MM/YYYY');
end;
$$;

create or replace function public.sync_purchase_order_line_from_time_sheet_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_purchase_order_id uuid;
  next_purchase_order_id uuid;
  preserved_rate numeric := 0;
  preserved_sort_order integer;
  preserved_line_uid uuid;
  preserved_cost_item_id uuid;
  preserved_source_cost_item_id uuid;
  deleted_cost_item_id uuid;
  computed_hours numeric := 0;
  line_description text;
  synced_line_id uuid;
begin
  if tg_op = 'DELETE' then
    previous_purchase_order_id := old.purchase_order_id;

    delete from public.project_purchase_order_line_items
    where source_time_sheet_entry_id = old.id
    returning cost_item_id into deleted_cost_item_id;

    perform public.retire_purchase_order_line_cost_item(deleted_cost_item_id);

    if previous_purchase_order_id is not null then
      perform public.recalculate_project_purchase_order_totals(previous_purchase_order_id);
    end if;

    return old;
  end if;

  previous_purchase_order_id := case when tg_op = 'UPDATE' then old.purchase_order_id else null end;
  next_purchase_order_id := new.purchase_order_id;

  select li.rate, li.sort_order, li.line_uid, li.cost_item_id, li.source_cost_item_id
  into preserved_rate, preserved_sort_order, preserved_line_uid, preserved_cost_item_id, preserved_source_cost_item_id
  from public.project_purchase_order_line_items li
  where li.source_time_sheet_entry_id = new.id
  limit 1;

  if previous_purchase_order_id is not null and previous_purchase_order_id is distinct from next_purchase_order_id then
    delete from public.project_purchase_order_line_items
    where source_time_sheet_entry_id = new.id
    returning cost_item_id into deleted_cost_item_id;

    perform public.recalculate_project_purchase_order_totals(previous_purchase_order_id);

    if next_purchase_order_id is null then
      perform public.retire_purchase_order_line_cost_item(deleted_cost_item_id);
    end if;
  end if;

  if next_purchase_order_id is null then
    return new;
  end if;

  computed_hours := greatest(0, coalesce(new.total_hours, 0));
  line_description := public.build_time_sheet_entry_labour_line_description(
    new.organization_id,
    new.worker_name,
    new.clock_in_at
  );

  insert into public.project_purchase_order_line_items (
    organization_id,
    project_id,
    purchase_order_id,
    line_uid,
    cost_item_id,
    source_cost_item_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    sort_order,
    source_time_sheet_entry_id
  )
  values (
    new.organization_id,
    new.project_id,
    next_purchase_order_id,
    coalesce(
      preserved_line_uid,
      (
        select li.line_uid
        from public.project_purchase_order_line_items li
        where li.source_time_sheet_entry_id = new.id
        limit 1
      ),
      gen_random_uuid()
    ),
    coalesce(
      preserved_cost_item_id,
      (
        select li.cost_item_id
        from public.project_purchase_order_line_items li
        where li.source_time_sheet_entry_id = new.id
        limit 1
      )
    ),
    coalesce(
      preserved_source_cost_item_id,
      (
        select li.source_cost_item_id
        from public.project_purchase_order_line_items li
        where li.source_time_sheet_entry_id = new.id
        limit 1
      )
    ),
    'Labour',
    line_description,
    computed_hours,
    'hrs',
    coalesce(preserved_rate, 0),
    round(computed_hours * coalesce(preserved_rate, 0), 2),
    coalesce(
      preserved_sort_order,
      (
        select coalesce(max(li.sort_order), -1) + 1
        from public.project_purchase_order_line_items li
        where li.purchase_order_id = next_purchase_order_id
      )
    ),
    new.id
  )
  on conflict (source_time_sheet_entry_id) do update
  set
    organization_id = excluded.organization_id,
    project_id = excluded.project_id,
    purchase_order_id = excluded.purchase_order_id,
    line_uid = coalesce(public.project_purchase_order_line_items.line_uid, excluded.line_uid),
    cost_item_id = coalesce(public.project_purchase_order_line_items.cost_item_id, excluded.cost_item_id),
    source_cost_item_id = coalesce(public.project_purchase_order_line_items.source_cost_item_id, excluded.source_cost_item_id),
    section = 'Labour',
    description = excluded.description,
    quantity = excluded.quantity,
    unit = 'hrs',
    total = round(excluded.quantity * public.project_purchase_order_line_items.rate, 2)
  returning id into synced_line_id;

  perform public.sync_purchase_order_line_cost_item(synced_line_id);
  perform public.recalculate_project_purchase_order_totals(next_purchase_order_id);

  return new;
end;
$$;

with synced_labour_descriptions as (
  select
    li.id as line_item_id,
    li.description as previous_description,
    entry.id as entry_id,
    public.build_time_sheet_entry_labour_line_description(
      entry.organization_id,
      entry.worker_name,
      entry.clock_in_at
    ) as next_description
  from public.project_purchase_order_line_items li
  join public.project_time_sheet_entries entry
    on entry.id = li.source_time_sheet_entry_id
  where li.source_time_sheet_entry_id is not null
)
update public.cost_items ci
set
  title = case
    when ci.title = synced_labour_descriptions.previous_description then synced_labour_descriptions.next_description
    else ci.title
  end,
  description = case
    when ci.description = synced_labour_descriptions.previous_description then synced_labour_descriptions.next_description
    else ci.description
  end
from synced_labour_descriptions
where ci.linked_purchase_order_line_item_id = synced_labour_descriptions.line_item_id
  and ci.origin_kind = 'time_sheet_sync'
  and ci.source_document_kind = 'project_purchase_order'
  and coalesce(ci.source_snapshot ->> 'source_time_sheet_entry_id', '') = synced_labour_descriptions.entry_id::text
  and (
    ci.title = synced_labour_descriptions.previous_description
    or ci.description = synced_labour_descriptions.previous_description
  )
  and (
    (ci.title = synced_labour_descriptions.previous_description and ci.title is distinct from synced_labour_descriptions.next_description)
    or (ci.description = synced_labour_descriptions.previous_description and ci.description is distinct from synced_labour_descriptions.next_description)
  );

with synced_labour_descriptions as (
  select
    li.id as line_item_id,
    public.build_time_sheet_entry_labour_line_description(
      entry.organization_id,
      entry.worker_name,
      entry.clock_in_at
    ) as next_description
  from public.project_purchase_order_line_items li
  join public.project_time_sheet_entries entry
    on entry.id = li.source_time_sheet_entry_id
  where li.source_time_sheet_entry_id is not null
)
update public.project_purchase_order_line_items li
set description = synced_labour_descriptions.next_description
from synced_labour_descriptions
where li.id = synced_labour_descriptions.line_item_id
  and li.description is distinct from synced_labour_descriptions.next_description;
