alter table public.cost_items
  add column if not exists work_type text null;
