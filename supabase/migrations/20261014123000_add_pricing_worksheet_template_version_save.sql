begin;

-- Forward migration: template version editing persists a complete in-memory
-- workbook snapshot without creating an opportunity-owned workbook.
create or replace function public.save_pricing_worksheet_template_version_v1(
  p_organization_id uuid,
  p_template_id uuid,
  p_expected_version_id uuid,
  p_user_id uuid,
  p_sheets jsonb,
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
  template_row public.pricing_worksheet_templates%rowtype;
  version_row public.pricing_worksheet_template_versions%rowtype;
  sheet_entry jsonb;
  template_sheet public.pricing_worksheet_template_version_sheets%rowtype;
  request_key text := nullif(btrim(p_request_id), '');
  version_no integer;
  result_sheets jsonb := '[]'::jsonb;
begin
  if actor is null or actor is distinct from p_user_id or not public.has_org_permission(p_organization_id, 'pricing_worksheets.templates.manage') then
    raise exception 'Not authorized to save pricing worksheet template versions.' using errcode = '42501';
  end if;
  if request_key is null then raise exception 'A template version request id is required.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_sheets, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_sheets, '[]'::jsonb)) = 0 then raise exception 'Template version must contain at least one worksheet.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_input_manifest, '[]'::jsonb)) <> 'array' then raise exception 'Template input manifest must be an array.' using errcode = '22023'; end if;
  select * into template_row from public.pricing_worksheet_templates where organization_id = p_organization_id and id = p_template_id for update;
  if not found or template_row.status <> 'active' or template_row.archived_at is not null then raise exception 'Active pricing worksheet template not found.' using errcode = 'P0002'; end if;
  if template_row.current_version_id is distinct from p_expected_version_id then raise exception 'This template has a newer version. Reload it before saving.' using errcode = '40001'; end if;
  select jsonb_build_object('template', to_jsonb(t), 'version', to_jsonb(v), 'sheets', coalesce((select jsonb_agg(to_jsonb(s) order by s.sheet_order) from public.pricing_worksheet_template_version_sheets s where s.template_version_id = v.id), '[]'::jsonb))
  into result_sheets
  from public.pricing_worksheet_templates t
  join public.pricing_worksheet_template_versions v on v.template_id = t.id and v.organization_id = t.organization_id
  where t.organization_id = p_organization_id and t.id = p_template_id and v.metadata_snapshot->>'requestId' = request_key
  limit 1;
  if result_sheets is not null then return result_sheets; end if;
  select coalesce(max(version_number), 0) + 1 into version_no from public.pricing_worksheet_template_versions where organization_id = p_organization_id and template_id = p_template_id;
  insert into public.pricing_worksheet_template_versions (organization_id, template_id, version_number, source_workbook_id, source_workbook_version, metadata_snapshot, input_manifest, created_by)
  values (p_organization_id, p_template_id, version_no, null, null, jsonb_build_object('sourceTemplateVersionId', p_expected_version_id, 'requestId', request_key), p_input_manifest, actor)
  returning * into version_row;
  for sheet_entry in select value from jsonb_array_elements(p_sheets) loop
    if nullif(btrim(sheet_entry->>'name'), '') is null or coalesce((sheet_entry->>'sheetOrder')::integer, -1) < 0 or jsonb_typeof(sheet_entry->'worksheetData') <> 'object' then
      raise exception 'Template worksheet snapshot is invalid.' using errcode = '22023';
    end if;
    insert into public.pricing_worksheet_template_version_sheets (organization_id, template_version_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version)
    values (p_organization_id, version_row.id, btrim(sheet_entry->>'name'), (sheet_entry->>'sheetOrder')::integer, coalesce((sheet_entry->>'isDefault')::boolean, false), public._detach_pricing_worksheet_material_bindings(sheet_entry->'worksheetData'), coalesce(sheet_entry->'pricingSummary', '{}'::jsonb), coalesce(sheet_entry->'extractedPricingData', '{}'::jsonb), greatest(1, coalesce((sheet_entry->>'version')::integer, 1)))
    returning * into template_sheet;
    result_sheets := result_sheets || jsonb_build_array(to_jsonb(template_sheet));
  end loop;
  if not exists (select 1 from public.pricing_worksheet_template_version_sheets where organization_id = p_organization_id and template_version_id = version_row.id and is_default) then
    update public.pricing_worksheet_template_version_sheets set is_default = true where organization_id = p_organization_id and template_version_id = version_row.id and sheet_order = (select min(sheet_order) from public.pricing_worksheet_template_version_sheets where organization_id = p_organization_id and template_version_id = version_row.id);
  end if;
  update public.pricing_worksheet_templates set current_version_id = version_row.id, updated_by = actor where organization_id = p_organization_id and id = p_template_id;
  select * into template_row from public.pricing_worksheet_templates where organization_id = p_organization_id and id = p_template_id;
  return jsonb_build_object('template', to_jsonb(template_row), 'version', to_jsonb(version_row), 'sheets', result_sheets);
end;
$$;

revoke all on function public.save_pricing_worksheet_template_version_v1(uuid, uuid, uuid, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_pricing_worksheet_template_version_v1(uuid, uuid, uuid, uuid, jsonb, jsonb, text) to authenticated;

commit;
