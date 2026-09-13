begin;

create or replace function public.mark_project_quote_pricing_basis_stale_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workbook_id uuid;
begin
  if tg_table_name = 'opportunity_pricing_workbook_sheets' then
    target_workbook_id := nullif(to_jsonb(new)->>'workbook_id', '')::uuid;
  else
    target_workbook_id := new.id;
  end if;

  update public.project_quotes quote
  set pricing_basis_status = 'stale',
      pricing_basis_checked_at = timezone('utc', now())
  where quote.organization_id = new.organization_id
    and quote.award_locked_at is null
    and quote.pricing_basis_status = 'current'
    and quote.publication_basis_json->'workbookIds' @> jsonb_build_array(target_workbook_id::text);

  return new;
end;
$$;

commit;
