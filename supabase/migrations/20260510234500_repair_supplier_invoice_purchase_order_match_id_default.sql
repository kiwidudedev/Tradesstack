begin;

alter table if exists public.supplier_invoice_purchase_order_matches
  alter column id set default gen_random_uuid(),
  alter column created_at set default now(),
  alter column updated_at set default now();

commit;
