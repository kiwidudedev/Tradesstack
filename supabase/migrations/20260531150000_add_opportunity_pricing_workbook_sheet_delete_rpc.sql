create or replace function public.delete_opportunity_pricing_workbook_sheet(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_workbook_id uuid,
  p_sheet_id uuid,
  p_user_id uuid,
  p_next_sheet_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_next_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_remaining_count integer;
begin
  select *
  into v_deleted_sheet
  from public.opportunity_pricing_workbook_sheets
  where id = p_sheet_id
    and workbook_id = p_workbook_id
    and organization_id = p_organization_id
    and opportunity_id = p_opportunity_id;

  if not found then
    raise exception 'Worksheet page not found.';
  end if;

  select count(*)
  into v_remaining_count
  from public.opportunity_pricing_workbook_sheets
  where workbook_id = p_workbook_id
    and organization_id = p_organization_id
    and opportunity_id = p_opportunity_id;

  if v_remaining_count <= 1 then
    raise exception 'You must keep at least one worksheet page.';
  end if;

  delete from public.opportunity_pricing_workbook_sheets
  where id = v_deleted_sheet.id;

  if p_next_sheet_id is not null then
    select *
    into v_next_sheet
    from public.opportunity_pricing_workbook_sheets
    where id = p_next_sheet_id
      and workbook_id = p_workbook_id
      and organization_id = p_organization_id
      and opportunity_id = p_opportunity_id;
  end if;

  if v_deleted_sheet.is_default then
    if v_next_sheet.id is null then
      select *
      into v_next_sheet
      from public.opportunity_pricing_workbook_sheets
      where workbook_id = p_workbook_id
        and organization_id = p_organization_id
        and opportunity_id = p_opportunity_id
      order by sheet_order asc, created_at asc
      limit 1;
    end if;

    update public.opportunity_pricing_workbook_sheets
    set
      is_default = (id = v_next_sheet.id),
      updated_by = p_user_id
    where workbook_id = p_workbook_id
      and organization_id = p_organization_id
      and opportunity_id = p_opportunity_id
      and (is_default = true or id = v_next_sheet.id);

    if v_next_sheet.id is not null then
      update public.opportunity_pricing_worksheets
      set
        name = v_next_sheet.name,
        worksheet_data = v_next_sheet.worksheet_data,
        pricing_summary = v_next_sheet.pricing_summary,
        extracted_pricing_data = v_next_sheet.extracted_pricing_data,
        version = v_next_sheet.version,
        updated_by = p_user_id
      where id = p_workbook_id
        and organization_id = p_organization_id
        and opportunity_id = p_opportunity_id
        and archived_at is null;
    end if;
  end if;

  return jsonb_build_object(
    'deletedSheetId', v_deleted_sheet.id,
    'nextSheetId', coalesce(v_next_sheet.id, p_next_sheet_id)
  );
end;
$$;

grant execute on function public.delete_opportunity_pricing_workbook_sheet(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
