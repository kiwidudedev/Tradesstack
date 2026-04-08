alter table if exists public.project_time_sheet_entries
  add column if not exists purchase_order_id uuid null references public.project_purchase_orders (id) on delete set null,
  add column if not exists purchase_order_number text not null default '',
  add column if not exists purchase_order_title text not null default '';

create index if not exists project_time_sheet_entries_purchase_order_idx
  on public.project_time_sheet_entries (purchase_order_id, clock_in_at desc)
  where purchase_order_id is not null;
