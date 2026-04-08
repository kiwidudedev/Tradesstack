alter table if exists public.project_variation_line_items
  add column if not exists source_purchase_order_id uuid null references public.project_purchase_orders (id) on delete set null,
  add column if not exists source_purchase_order_line_item_id uuid null references public.project_purchase_order_line_items (id) on delete set null,
  add column if not exists source_purchase_order_number text not null default '';

create index if not exists project_variation_line_items_source_po_idx
  on public.project_variation_line_items (source_purchase_order_id, source_purchase_order_line_item_id)
  where source_purchase_order_id is not null;
