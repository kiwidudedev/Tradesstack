alter table public.project_variations
  add column if not exists margin_percent numeric(7,3) not null default 0,
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists contingency_amount numeric(14,2) not null default 0,
  add column if not exists include_margin_in_export boolean not null default false,
  add column if not exists include_discount_in_export boolean not null default false,
  add column if not exists include_contingency_in_export boolean not null default false;
