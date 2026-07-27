drop function if exists public.save_opportunity_pricing_workbook_active_sheet(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer
);

grant execute on function public.save_opportunity_pricing_workbook_active_sheet(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer,
  text
) to authenticated;
