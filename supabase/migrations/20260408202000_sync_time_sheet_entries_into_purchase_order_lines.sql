alter table if exists public.project_purchase_order_line_items
  add column if not exists source_time_sheet_entry_id uuid null references public.project_time_sheet_entries (id) on delete set null;

create unique index if not exists project_purchase_order_line_items_time_sheet_entry_uidx
  on public.project_purchase_order_line_items (source_time_sheet_entry_id);

create or replace function public.recalculate_project_purchase_order_totals(
  p_purchase_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_order_row public.project_purchase_orders%rowtype;
  computed_subtotal numeric := 0;
  computed_labour_total numeric := 0;
  computed_materials_total numeric := 0;
  computed_subcontractors_total numeric := 0;
  computed_plant_total numeric := 0;
  computed_margin_lines_total numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst_total numeric := 0;
  computed_grand_total numeric := 0;
begin
  select *
  into purchase_order_row
  from public.project_purchase_orders
  where id = p_purchase_order_id
  for update;

  if not found then
    return;
  end if;

  select
    coalesce(sum(li.total), 0),
    coalesce(sum(li.total) filter (where li.section = 'Labour'), 0),
    coalesce(sum(li.total) filter (where li.section = 'Materials'), 0),
    coalesce(sum(li.total) filter (where li.section = 'Subcontractors'), 0),
    coalesce(sum(li.total) filter (where li.section = 'Plant'), 0),
    coalesce(sum(li.total) filter (where li.section = 'Margin'), 0)
  into
    computed_subtotal,
    computed_labour_total,
    computed_materials_total,
    computed_subcontractors_total,
    computed_plant_total,
    computed_margin_lines_total
  from public.project_purchase_order_line_items li
  where li.purchase_order_id = p_purchase_order_id;

  computed_margin := computed_subtotal * (coalesce(purchase_order_row.margin_percent, 0) / 100);
  computed_discount := coalesce(purchase_order_row.discount_amount, 0);
  computed_contingency := coalesce(purchase_order_row.contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst_total := pre_gst_total * (coalesce(purchase_order_row.gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst_total;

  update public.project_purchase_orders
  set
    labour_total = round(computed_labour_total, 2),
    materials_total = round(computed_materials_total, 2),
    subcontractors_total = round(computed_subcontractors_total, 2),
    plant_total = round(computed_plant_total, 2),
    margin_total = round(computed_margin_lines_total, 2),
    subtotal = round(computed_subtotal, 2),
    gst_total = round(computed_gst_total, 2),
    total_purchase_order_price = round(computed_grand_total, 2)
  where id = p_purchase_order_id;
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
  computed_hours numeric := 0;
  line_description text;
begin
  if tg_op = 'DELETE' then
    previous_purchase_order_id := old.purchase_order_id;

    delete from public.project_purchase_order_line_items
    where source_time_sheet_entry_id = old.id;

    if previous_purchase_order_id is not null then
      perform public.recalculate_project_purchase_order_totals(previous_purchase_order_id);
    end if;

    return old;
  end if;

  previous_purchase_order_id := case when tg_op = 'UPDATE' then old.purchase_order_id else null end;
  next_purchase_order_id := new.purchase_order_id;

  if previous_purchase_order_id is not null and previous_purchase_order_id is distinct from next_purchase_order_id then
    delete from public.project_purchase_order_line_items
    where source_time_sheet_entry_id = new.id;

    perform public.recalculate_project_purchase_order_totals(previous_purchase_order_id);
  end if;

  if next_purchase_order_id is null then
    return new;
  end if;

  select li.rate, li.sort_order
  into preserved_rate, preserved_sort_order
  from public.project_purchase_order_line_items li
  where li.source_time_sheet_entry_id = new.id
  limit 1;

  computed_hours := greatest(0, coalesce(new.total_hours, 0));
  line_description := coalesce(nullif(btrim(new.worker_name), ''), 'Worker') || ' - ' || to_char(new.clock_in_at, 'DD/MM/YYYY');

  insert into public.project_purchase_order_line_items (
    organization_id,
    project_id,
    purchase_order_id,
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
    section = 'Labour',
    description = excluded.description,
    quantity = excluded.quantity,
    unit = 'hrs',
    total = round(excluded.quantity * public.project_purchase_order_line_items.rate, 2);

  perform public.recalculate_project_purchase_order_totals(next_purchase_order_id);

  return new;
end;
$$;

drop trigger if exists sync_purchase_order_line_from_time_sheet_entry on public.project_time_sheet_entries;
create trigger sync_purchase_order_line_from_time_sheet_entry
after insert or update or delete on public.project_time_sheet_entries
for each row execute function public.sync_purchase_order_line_from_time_sheet_entry();

insert into public.project_purchase_order_line_items (
  organization_id,
  project_id,
  purchase_order_id,
  section,
  description,
  quantity,
  unit,
  rate,
  total,
  sort_order,
  source_time_sheet_entry_id
)
select
  entry.organization_id,
  entry.project_id,
  entry.purchase_order_id,
  'Labour',
  coalesce(nullif(btrim(entry.worker_name), ''), 'Worker') || ' - ' || to_char(entry.clock_in_at, 'DD/MM/YYYY'),
  greatest(0, coalesce(entry.total_hours, 0)),
  'hrs',
  0,
  0,
  row_number() over (partition by entry.purchase_order_id order by entry.clock_in_at, entry.created_at, entry.id) - 1,
  entry.id
from public.project_time_sheet_entries entry
where entry.purchase_order_id is not null
  and not exists (
    select 1
    from public.project_purchase_order_line_items line_item
    where line_item.source_time_sheet_entry_id = entry.id
  );

do $$
declare
  affected_purchase_order_id uuid;
begin
  for affected_purchase_order_id in
    select distinct purchase_order_id
    from public.project_time_sheet_entries
    where purchase_order_id is not null
  loop
    perform public.recalculate_project_purchase_order_totals(affected_purchase_order_id);
  end loop;
end;
$$;
