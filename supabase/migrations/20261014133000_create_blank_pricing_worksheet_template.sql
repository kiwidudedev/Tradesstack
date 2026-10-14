begin;

create or replace function public.create_pricing_worksheet_template_v1(
  p_organization_id uuid,
  p_user_id uuid,
  p_name text,
  p_category text default null,
  p_description text default null,
  p_sheets jsonb default '[]'::jsonb,
  p_input_manifest jsonb default '[]'::jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  request_key text := nullif(btrim(p_request_id), '');
  template_row public.pricing_worksheet_templates%rowtype;
  version_row public.pricing_worksheet_template_versions%rowtype;
  sheet_entry jsonb;
  template_sheet public.pricing_worksheet_template_version_sheets%rowtype;
  result_sheets jsonb;
begin
  if actor is null or actor is distinct from p_user_id then
    raise exception 'Authenticated actor is required.' using errcode = '42501';
  end if;
  if not public.has_org_permission(p_organization_id, 'pricing_worksheets.templates.write') then
    raise exception 'Not authorized to create pricing worksheet templates.' using errcode = '42501';
  end if;
  if request_key is null then
    raise exception 'A template request id is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'A template name is required.' using errcode = '22023';
  end if;
  if p_sheets is null or jsonb_typeof(p_sheets) <> 'array' or jsonb_array_length(p_sheets) = 0 then
    raise exception 'At least one template sheet is required.' using errcode = '22023';
  end if;
  if p_input_manifest is null or jsonb_typeof(p_input_manifest) <> 'array' then
    raise exception 'Template input manifest must be an array.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'template', to_jsonb(t),
    'version', to_jsonb(v),
    'sheets', coalesce((select jsonb_agg(to_jsonb(s) order by s.sheet_order)
      from public.pricing_worksheet_template_version_sheets s
      where s.template_version_id = v.id), '[]'::jsonb)
  )
  into result_sheets
  from public.pricing_worksheet_templates t
  join public.pricing_worksheet_template_versions v
    on v.id = t.current_version_id
  where t.organization_id = p_organization_id
    and v.organization_id = p_organization_id
    and v.metadata_snapshot->>'requestId' = request_key
  limit 1;
  if result_sheets is not null then
    return result_sheets;
  end if;

  result_sheets := '[]'::jsonb;

  insert into public.pricing_worksheet_templates (
    organization_id, name, category, description, created_by, updated_by
  ) values (
    p_organization_id,
    btrim(p_name),
    nullif(btrim(p_category), ''),
    nullif(btrim(p_description), ''),
    actor,
    actor
  ) returning * into template_row;

  insert into public.pricing_worksheet_template_versions (
    organization_id, template_id, version_number, source_workbook_id,
    source_workbook_version, metadata_snapshot, input_manifest, created_by
  ) values (
    p_organization_id,
    template_row.id,
    1,
    null,
    null,
    jsonb_build_object('requestId', request_key, 'workbookName', btrim(p_name), 'createdFrom', 'blank'),
    p_input_manifest,
    actor
  ) returning * into version_row;

  for sheet_entry in select value from jsonb_array_elements(p_sheets) order by (value->>'sheetOrder')::integer loop
    if nullif(btrim(sheet_entry->>'name'), '') is null then
      raise exception 'Template sheet names are required.' using errcode = '22023';
    end if;
    if coalesce((sheet_entry->>'sheetOrder')::integer, -1) < 0 then
      raise exception 'Template sheet order must be non-negative.' using errcode = '22023';
    end if;
    insert into public.pricing_worksheet_template_version_sheets (
      organization_id, template_version_id, name, sheet_order, is_default,
      worksheet_data, pricing_summary, extracted_pricing_data, version
    ) values (
      p_organization_id,
      version_row.id,
      btrim(sheet_entry->>'name'),
      (sheet_entry->>'sheetOrder')::integer,
      coalesce((sheet_entry->>'isDefault')::boolean, false),
      public._detach_pricing_worksheet_material_bindings(coalesce(sheet_entry->'worksheetData', '{}'::jsonb)),
      coalesce(sheet_entry->'pricingSummary', '{}'::jsonb),
      coalesce(sheet_entry->'extractedPricingData', '{}'::jsonb),
      greatest(1, coalesce((sheet_entry->>'version')::integer, 1))
    ) returning * into template_sheet;
    result_sheets := result_sheets || jsonb_build_array(to_jsonb(template_sheet));
  end loop;

  if not exists (
    select 1 from public.pricing_worksheet_template_version_sheets
    where organization_id = p_organization_id and template_version_id = version_row.id and is_default
  ) then
    update public.pricing_worksheet_template_version_sheets
    set is_default = true
    where organization_id = p_organization_id and template_version_id = version_row.id and sheet_order = 0;
  end if;

  update public.pricing_worksheet_templates
  set current_version_id = version_row.id
  where organization_id = p_organization_id and id = template_row.id;
  select * into template_row from public.pricing_worksheet_templates
  where organization_id = p_organization_id and id = template_row.id;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.sheet_order), '[]'::jsonb)
  into result_sheets
  from public.pricing_worksheet_template_version_sheets s
  where s.organization_id = p_organization_id and s.template_version_id = version_row.id;
  return jsonb_build_object('template', to_jsonb(template_row), 'version', to_jsonb(version_row), 'sheets', result_sheets);
end;
$$;

revoke all on function public.create_pricing_worksheet_template_v1(uuid, uuid, text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.create_pricing_worksheet_template_v1(uuid, uuid, text, text, text, jsonb, jsonb, text) to authenticated;

commit;
