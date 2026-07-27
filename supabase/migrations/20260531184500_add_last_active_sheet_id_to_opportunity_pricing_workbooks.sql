alter table if exists public.opportunity_pricing_worksheets
add column if not exists last_active_sheet_id uuid;
