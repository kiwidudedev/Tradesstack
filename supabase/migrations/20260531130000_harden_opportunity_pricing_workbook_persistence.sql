create or replace function public._normalize_opportunity_pricing_workbook_name(
  p_name text,
  p_fallback text default 'Pricing Worksheet'
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(trim(p_name), ''), nullif(trim(p_fallback), ''), 'Pricing Worksheet');
$$;

create or replace function public._sync_opportunity_pricing_workbook_sheet_name(
  p_worksheet_data jsonb,
  p_sheet_name text
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_set(
    case
      when jsonb_typeof(coalesce(p_worksheet_data, '{}'::jsonb)) = 'object' then coalesce(p_worksheet_data, '{}'::jsonb)
      else '{}'::jsonb
    end,
    '{sheetName}',
    to_jsonb(public._normalize_opportunity_pricing_workbook_name(p_sheet_name)),
    true
  );
$$;

drop policy if exists "Members can view opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;
create policy "Members can view opportunity pricing workbook sheets"
on public.opportunity_pricing_workbook_sheets
for select
using (
  public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = opportunity_pricing_workbook_sheets.workbook_id
      and workbook.organization_id = opportunity_pricing_workbook_sheets.organization_id
      and workbook.opportunity_id = opportunity_pricing_workbook_sheets.opportunity_id
      and workbook.archived_at is null
      and public.is_member_of_organization(workbook.organization_id)
  )
);

drop policy if exists "Privileged members can create opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;
create policy "Privileged members can create opportunity pricing workbook sheets"
on public.opportunity_pricing_workbook_sheets
for insert
with check (
  opportunity_pricing_workbook_sheets.created_by = auth.uid()
  and opportunity_pricing_workbook_sheets.updated_by = auth.uid()
  and public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)
  and public.has_org_permission(opportunity_pricing_workbook_sheets.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = opportunity_pricing_workbook_sheets.workbook_id
      and workbook.organization_id = opportunity_pricing_workbook_sheets.organization_id
      and workbook.opportunity_id = opportunity_pricing_workbook_sheets.opportunity_id
      and workbook.archived_at is null
  )
);

drop policy if exists "Privileged members can update opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;
create policy "Privileged members can update opportunity pricing workbook sheets"
on public.opportunity_pricing_workbook_sheets
for update
using (
  public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)
  and public.has_org_permission(opportunity_pricing_workbook_sheets.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = opportunity_pricing_workbook_sheets.workbook_id
      and workbook.organization_id = opportunity_pricing_workbook_sheets.organization_id
      and workbook.opportunity_id = opportunity_pricing_workbook_sheets.opportunity_id
      and workbook.archived_at is null
  )
)
with check (
  public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)
  and public.has_org_permission(opportunity_pricing_workbook_sheets.organization_id, 'leads.opportunities.write')
  and opportunity_pricing_workbook_sheets.updated_by = auth.uid()
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = opportunity_pricing_workbook_sheets.workbook_id
      and workbook.organization_id = opportunity_pricing_workbook_sheets.organization_id
      and workbook.opportunity_id = opportunity_pricing_workbook_sheets.opportunity_id
      and workbook.archived_at is null
  )
);

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
  p_version integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workbook public.opportunity_pricing_worksheets%rowtype;
  v_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_sheet_name text := public._normalize_opportunity_pricing_workbook_name(
    p_name,
    coalesce(nullif(trim(coalesce(p_worksheet_data ->> 'sheetName', '')), ''), 'Pricing Worksheet')
  );
  v_worksheet_data jsonb := public._sync_opportunity_pricing_workbook_sheet_name(p_worksheet_data, v_sheet_name);
  v_version integer := greatest(coalesce(p_version, 1), 1);
  v_target_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_should_sync_parent boolean := false;
begin
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

  return jsonb_build_object(
    'workbook', to_jsonb(v_workbook),
    'sheet', to_jsonb(v_sheet)
  );
end;
$$;

create or replace function public.rename_opportunity_pricing_workbook(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_workbook_id uuid,
  p_user_id uuid,
  p_next_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workbook public.opportunity_pricing_worksheets%rowtype;
  v_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_next_name text;
  v_worksheet_data jsonb;
begin
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

  v_next_name := public._normalize_opportunity_pricing_workbook_name(
    p_next_name,
    coalesce(nullif(trim(v_workbook.name), ''), 'Pricing Worksheet')
  );
  v_worksheet_data := public._sync_opportunity_pricing_workbook_sheet_name(v_workbook.worksheet_data, v_next_name);

  return public.save_opportunity_pricing_workbook_active_sheet(
    p_organization_id := p_organization_id,
    p_opportunity_id := p_opportunity_id,
    p_user_id := p_user_id,
    p_workbook_id := p_workbook_id,
    p_sheet_id := (
      select sheet.id
      from public.opportunity_pricing_workbook_sheets sheet
      where sheet.workbook_id = p_workbook_id
        and sheet.organization_id = p_organization_id
        and sheet.opportunity_id = p_opportunity_id
      order by sheet.is_default desc, sheet.sheet_order asc, sheet.created_at asc
      limit 1
    ),
    p_name := v_next_name,
    p_trade_package := v_workbook.trade_package,
    p_worksheet_data := v_worksheet_data,
    p_pricing_summary := v_workbook.pricing_summary,
    p_extracted_pricing_data := v_workbook.extracted_pricing_data,
    p_version := v_workbook.version
  );
end;
$$;

create or replace function public.duplicate_opportunity_pricing_workbook(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_workbook_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_workbook public.opportunity_pricing_worksheets%rowtype;
  v_default_source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_inserted_workbook public.opportunity_pricing_worksheets%rowtype;
  v_inserted_default_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_inserted_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_sheet_record public.opportunity_pricing_workbook_sheets%rowtype;
  v_duplicate_name text;
  v_parent_worksheet_data jsonb;
  v_parent_pricing_summary jsonb;
  v_parent_extracted_pricing_data jsonb;
  v_parent_version integer;
  v_payload_sheets jsonb := '[]'::jsonb;
begin
  select *
  into v_source_workbook
  from public.opportunity_pricing_worksheets
  where id = p_workbook_id
    and organization_id = p_organization_id
    and opportunity_id = p_opportunity_id
    and archived_at is null;

  if not found then
    raise exception 'Pricing worksheet not found.';
  end if;

  select *
  into v_default_source_sheet
  from public.opportunity_pricing_workbook_sheets sheet
  where sheet.workbook_id = p_workbook_id
    and sheet.organization_id = p_organization_id
    and sheet.opportunity_id = p_opportunity_id
  order by sheet.is_default desc, sheet.sheet_order asc, sheet.created_at asc
  limit 1;

  v_duplicate_name := public._normalize_opportunity_pricing_workbook_name(
    v_source_workbook.name || ' Copy',
    'Worksheet Copy'
  );

  if v_default_source_sheet.id is null then
    v_parent_worksheet_data := public._sync_opportunity_pricing_workbook_sheet_name(
      v_source_workbook.worksheet_data,
      coalesce(nullif(trim(v_source_workbook.name), ''), 'Pricing Worksheet')
    );
    v_parent_pricing_summary := v_source_workbook.pricing_summary;
    v_parent_extracted_pricing_data := v_source_workbook.extracted_pricing_data;
    v_parent_version := greatest(coalesce(v_source_workbook.version, 1), 1);
  else
    v_parent_worksheet_data := public._sync_opportunity_pricing_workbook_sheet_name(
      v_default_source_sheet.worksheet_data,
      v_default_source_sheet.name
    );
    v_parent_pricing_summary := v_default_source_sheet.pricing_summary;
    v_parent_extracted_pricing_data := v_default_source_sheet.extracted_pricing_data;
    v_parent_version := greatest(coalesce(v_default_source_sheet.version, 1), 1);
  end if;

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
    v_duplicate_name,
    v_source_workbook.trade_package,
    v_parent_worksheet_data,
    coalesce(v_parent_pricing_summary, '{}'::jsonb),
    coalesce(v_parent_extracted_pricing_data, '{}'::jsonb),
    v_parent_version,
    p_user_id,
    p_user_id
  )
  returning * into v_inserted_workbook;

  if v_default_source_sheet.id is null then
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
      v_inserted_workbook.id,
      p_organization_id,
      p_opportunity_id,
      coalesce(nullif(trim(v_source_workbook.name), ''), 'Pricing Worksheet'),
      0,
      true,
      v_parent_worksheet_data,
      coalesce(v_parent_pricing_summary, '{}'::jsonb),
      coalesce(v_parent_extracted_pricing_data, '{}'::jsonb),
      v_parent_version,
      p_user_id,
      p_user_id
    )
    returning * into v_inserted_default_sheet;

    v_payload_sheets := jsonb_build_array(to_jsonb(v_inserted_default_sheet));
  else
    for v_sheet_record in
      select *
      from public.opportunity_pricing_workbook_sheets sheet
      where sheet.workbook_id = p_workbook_id
        and sheet.organization_id = p_organization_id
        and sheet.opportunity_id = p_opportunity_id
      order by sheet.sheet_order asc, sheet.created_at asc
    loop
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
        v_inserted_workbook.id,
        p_organization_id,
        p_opportunity_id,
        v_sheet_record.name,
        v_sheet_record.sheet_order,
        v_sheet_record.is_default,
        public._sync_opportunity_pricing_workbook_sheet_name(v_sheet_record.worksheet_data, v_sheet_record.name),
        coalesce(v_sheet_record.pricing_summary, '{}'::jsonb),
        coalesce(v_sheet_record.extracted_pricing_data, '{}'::jsonb),
        greatest(coalesce(v_sheet_record.version, 1), 1),
        p_user_id,
        p_user_id
      )
      returning * into v_inserted_sheet;

      v_payload_sheets := v_payload_sheets || jsonb_build_array(to_jsonb(v_inserted_sheet));
    end loop;
  end if;

  return jsonb_build_object(
    'workbook', to_jsonb(v_inserted_workbook),
    'sheets', v_payload_sheets
  );
end;
$$;

grant execute on function public.save_opportunity_pricing_workbook_active_sheet(uuid, uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, integer) to authenticated;
grant execute on function public.rename_opportunity_pricing_workbook(uuid, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.duplicate_opportunity_pricing_workbook(uuid, uuid, uuid, uuid) to authenticated;
