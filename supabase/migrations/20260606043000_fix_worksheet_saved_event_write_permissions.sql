create or replace function public.save_opportunity_pricing_workbook_active_sheet(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_user_id uuid,
  p_workbook_id uuid default null,
  p_sheet_id uuid default null,
  p_name text default null,
  p_trade_package text default null,
  p_worksheet_data jsonb default '{}'::jsonb,
  p_pricing_summary jsonb default '{}'::jsonb,
  p_extracted_pricing_data jsonb default '{}'::jsonb,
  p_version integer default 1,
  p_save_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workbook public.opportunity_pricing_worksheets%rowtype;
  v_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_target_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_sheet_name text;
  v_worksheet_data jsonb;
  v_version integer;
  v_should_sync_parent boolean := false;
  v_actor_member_id uuid;
  v_actor_role text;
  v_save_request_id text;
begin
  v_sheet_name := public._normalize_opportunity_pricing_workbook_name(
    p_name,
    coalesce(nullif(trim(p_worksheet_data->>'sheetName'), ''), 'Pricing Worksheet')
  );
  v_worksheet_data := public._sync_opportunity_pricing_workbook_sheet_name(
    coalesce(p_worksheet_data, '{}'::jsonb),
    v_sheet_name
  );
  v_version := greatest(coalesce(p_version, nullif((v_worksheet_data->>'version')::integer, 0), 1), 1);
  v_save_request_id := nullif(btrim(coalesce(p_save_request_id, '')), '');

  if auth.uid() is not null then
    select member.id, member.role
    into v_actor_member_id, v_actor_role
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
    limit 1;
  end if;

  if p_workbook_id is null then
    insert into public.opportunity_pricing_worksheets (
      organization_id,
      opportunity_id,
      name,
      trade_package,
      worksheet_data,
      pricing_summary,
      extracted_pricing_data,
      version,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_opportunity_id,
      v_sheet_name,
      p_trade_package,
      v_worksheet_data,
      coalesce(p_pricing_summary, '{}'::jsonb),
      coalesce(p_extracted_pricing_data, '{}'::jsonb),
      v_version,
      p_user_id,
      p_user_id
    )
    returning * into v_workbook;
    v_should_sync_parent := true;
  else
    select *
    into v_workbook
    from public.opportunity_pricing_worksheets
    where id = p_workbook_id
      and organization_id = p_organization_id
      and opportunity_id = p_opportunity_id
      and archived_at is null;

    if not found then
      raise exception 'Pricing worksheet not found.';
    end if;

    if p_sheet_id is not null then
      select *
      into v_target_sheet
      from public.opportunity_pricing_workbook_sheets
      where id = p_sheet_id
        and workbook_id = v_workbook.id
        and organization_id = p_organization_id
        and opportunity_id = p_opportunity_id;

      if not found then
        raise exception 'Worksheet page not found.';
      end if;

      v_should_sync_parent := coalesce(v_target_sheet.is_default, false);
    else
      v_should_sync_parent := true;
    end if;

    if v_should_sync_parent then
      update public.opportunity_pricing_worksheets
      set
        name = v_sheet_name,
        trade_package = p_trade_package,
        worksheet_data = v_worksheet_data,
        pricing_summary = coalesce(p_pricing_summary, '{}'::jsonb),
        extracted_pricing_data = coalesce(p_extracted_pricing_data, '{}'::jsonb),
        version = v_version,
        updated_by = p_user_id
      where id = p_workbook_id
        and organization_id = p_organization_id
        and opportunity_id = p_opportunity_id
        and archived_at is null
      returning * into v_workbook;
    else
      update public.opportunity_pricing_worksheets
      set
        trade_package = p_trade_package,
        updated_by = p_user_id
      where id = p_workbook_id
        and organization_id = p_organization_id
        and opportunity_id = p_opportunity_id
        and archived_at is null
      returning * into v_workbook;
    end if;
  end if;

  if p_sheet_id is not null then
    update public.opportunity_pricing_workbook_sheets
    set
      name = v_sheet_name,
      worksheet_data = v_worksheet_data,
      pricing_summary = coalesce(p_pricing_summary, '{}'::jsonb),
      extracted_pricing_data = coalesce(p_extracted_pricing_data, '{}'::jsonb),
      version = v_version,
      updated_by = p_user_id
    where id = p_sheet_id
      and workbook_id = v_workbook.id
      and organization_id = p_organization_id
      and opportunity_id = p_opportunity_id
    returning * into v_sheet;
  end if;

  if v_sheet.id is null then
    update public.opportunity_pricing_workbook_sheets
    set
      name = v_sheet_name,
      worksheet_data = v_worksheet_data,
      pricing_summary = coalesce(p_pricing_summary, '{}'::jsonb),
      extracted_pricing_data = coalesce(p_extracted_pricing_data, '{}'::jsonb),
      version = v_version,
      updated_by = p_user_id
    where workbook_id = v_workbook.id
      and organization_id = p_organization_id
      and opportunity_id = p_opportunity_id
      and is_default = true
    returning * into v_sheet;
  end if;

  if v_sheet.id is null then
    insert into public.opportunity_pricing_workbook_sheets (
      workbook_id,
      organization_id,
      opportunity_id,
      name,
      sheet_order,
      is_default,
      worksheet_data,
      pricing_summary,
      extracted_pricing_data,
      version,
      created_by,
      updated_by
    )
    values (
      v_workbook.id,
      p_organization_id,
      p_opportunity_id,
      v_sheet_name,
      0,
      true,
      v_worksheet_data,
      coalesce(p_pricing_summary, '{}'::jsonb),
      coalesce(p_extracted_pricing_data, '{}'::jsonb),
      v_version,
      p_user_id,
      p_user_id
    )
    returning * into v_sheet;
  end if;

  perform public.write_intelligence_event(
    jsonb_build_object(
      'organizationId', p_organization_id,
      'userId', auth.uid(),
      'projectId', null,
      'opportunityId', p_opportunity_id,
      'module', 'pricing_worksheets',
      'eventFamily', 'commercial_action',
      'eventType', 'worksheet_saved',
      'action', 'saved',
      'entityType', 'pricing_worksheet_page',
      'entityId', v_sheet.id,
      'parentEntityType', 'pricing_workbook',
      'parentEntityId', v_workbook.id,
      'relatedEntities', '[]'::jsonb,
      'lineageRefs', '[]'::jsonb,
      'sourceChannel', 'system',
      'sourceRequestId', v_save_request_id,
      'diffData', '{}'::jsonb,
      'metadata', jsonb_build_object(
        'workbookId', v_workbook.id,
        'workbookName', v_workbook.name,
        'worksheetId', v_workbook.id,
        'sheetId', v_sheet.id,
        'sheetName', v_sheet.name,
        'worksheetName', v_sheet.name,
        'tradePackage', v_workbook.trade_package,
        'userId', p_user_id,
        'projectId', null,
        'source', 'system',
        'structureSummary', public._pricing_worksheet_structure_summary(v_sheet.worksheet_data)
      ),
      'privacyClassification', 'financial_sensitive',
      'visibilityScope', 'organization',
      'containsFinancialData', true,
      'containsPersonalData', false,
      'containsAttachmentContent', false,
      'occurredAt', now()
    )
  );

  return jsonb_build_object(
    'workbook', to_jsonb(v_workbook),
    'sheet', to_jsonb(v_sheet)
  );
end;
$$;
