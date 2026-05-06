update public.project_variation_line_items
set source_purchase_order_number = null
where source_purchase_order_number = '';

alter table public.project_variation_line_items
  alter column source_purchase_order_number drop default,
  alter column source_purchase_order_number drop not null;
