alter table if exists public.project_purchase_order_attachments
  add column if not exists uploaded_by uuid null references auth.users (id) on delete set null;

