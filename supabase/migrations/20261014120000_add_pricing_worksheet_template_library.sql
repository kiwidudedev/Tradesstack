begin;

-- Pricing Worksheet templates are organization-scoped snapshots. They are
-- deliberately separate from opportunity_pricing_worksheets because a
-- template has no opportunity owner and must never participate in commercial
-- ownership or award lineage.
create table if not exists public.pricing_worksheet_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  category text null,
  description text null,
  status text not null default 'active',
  current_version_id uuid null,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint pricing_worksheet_templates_name_not_blank check (char_length(btrim(name)) > 0),
  constraint pricing_worksheet_templates_status_check check (status in ('active', 'archived')),
  unique (organization_id, id)
);

create table if not exists public.pricing_worksheet_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid not null references public.pricing_worksheet_templates (id) on delete cascade,
  version_number integer not null,
  source_workbook_id uuid null,
  source_workbook_version integer null,
  metadata_snapshot jsonb not null default '{}'::jsonb,
  input_manifest jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint pricing_worksheet_template_versions_version_positive check (version_number > 0),
  constraint pricing_worksheet_template_versions_manifest_array check (jsonb_typeof(input_manifest) = 'array'),
  constraint pricing_worksheet_template_versions_metadata_object check (jsonb_typeof(metadata_snapshot) = 'object'),
  unique (organization_id, template_id, version_number),
  unique (organization_id, id),
  foreign key (organization_id, template_id)
    references public.pricing_worksheet_templates (organization_id, id) on delete cascade
);

create table if not exists public.pricing_worksheet_template_version_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_version_id uuid not null,
  name text not null,
  sheet_order integer not null,
  is_default boolean not null default false,
  worksheet_data jsonb not null default '{}'::jsonb,
  pricing_summary jsonb not null default '{}'::jsonb,
  extracted_pricing_data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint pricing_worksheet_template_version_sheets_name_not_blank check (char_length(btrim(name)) > 0),
  constraint pricing_worksheet_template_version_sheets_order_nonnegative check (sheet_order >= 0),
  constraint pricing_worksheet_template_version_sheets_version_positive check (version > 0),
  unique (organization_id, template_version_id, sheet_order),
  unique (organization_id, template_version_id, id),
  foreign key (organization_id, template_version_id)
    references public.pricing_worksheet_template_versions (organization_id, id) on delete cascade
);

create table if not exists public.pricing_worksheet_template_instantiations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid not null,
  template_version_id uuid not null,
  workbook_id uuid not null,
  request_id text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, request_id),
  unique (organization_id, workbook_id),
  foreign key (organization_id, template_id)
    references public.pricing_worksheet_templates (organization_id, id) on delete restrict,
  foreign key (organization_id, template_version_id)
    references public.pricing_worksheet_template_versions (organization_id, id) on delete restrict,
  foreign key (organization_id, workbook_id)
    references public.opportunity_pricing_worksheets (organization_id, id) on delete restrict
);

alter table public.pricing_worksheet_templates
  add constraint pricing_worksheet_templates_current_version_fk
  foreign key (organization_id, current_version_id)
  references public.pricing_worksheet_template_versions (organization_id, id) on delete restrict;

create index if not exists pricing_worksheet_templates_org_status_idx
  on public.pricing_worksheet_templates (organization_id, status, updated_at desc);
create index if not exists pricing_worksheet_template_versions_template_idx
  on public.pricing_worksheet_template_versions (organization_id, template_id, version_number desc);
create index if not exists pricing_worksheet_template_version_sheets_version_idx
  on public.pricing_worksheet_template_version_sheets (organization_id, template_version_id, sheet_order);

drop trigger if exists set_pricing_worksheet_templates_updated_at on public.pricing_worksheet_templates;
create trigger set_pricing_worksheet_templates_updated_at
before update on public.pricing_worksheet_templates
for each row execute function public.set_updated_at();

alter table public.pricing_worksheet_templates enable row level security;
alter table public.pricing_worksheet_templates force row level security;
alter table public.pricing_worksheet_template_versions enable row level security;
alter table public.pricing_worksheet_template_versions force row level security;
alter table public.pricing_worksheet_template_version_sheets enable row level security;
alter table public.pricing_worksheet_template_version_sheets force row level security;
alter table public.pricing_worksheet_template_instantiations enable row level security;
alter table public.pricing_worksheet_template_instantiations force row level security;

drop policy if exists pricing_worksheet_templates_select on public.pricing_worksheet_templates;
create policy pricing_worksheet_templates_select on public.pricing_worksheet_templates
for select to authenticated using (
  public.is_member_of_organization(organization_id)
  and public.has_org_permission(organization_id, 'pricing_worksheets.templates.view')
);
drop policy if exists pricing_worksheet_templates_update on public.pricing_worksheet_templates;
create policy pricing_worksheet_templates_update on public.pricing_worksheet_templates
for update to authenticated using (
  public.is_member_of_organization(organization_id)
  and public.has_org_permission(organization_id, 'pricing_worksheets.templates.manage')
) with check (
  public.is_member_of_organization(organization_id)
  and public.has_org_permission(organization_id, 'pricing_worksheets.templates.manage')
  and updated_by = auth.uid()
);
drop policy if exists pricing_worksheet_templates_insert on public.pricing_worksheet_templates;
create policy pricing_worksheet_templates_insert on public.pricing_worksheet_templates
for insert to authenticated with check (
  created_by = auth.uid() and updated_by = auth.uid()
  and public.is_member_of_organization(organization_id)
  and public.has_org_permission(organization_id, 'pricing_worksheets.templates.write')
);

drop policy if exists pricing_worksheet_template_versions_select on public.pricing_worksheet_template_versions;
create policy pricing_worksheet_template_versions_select on public.pricing_worksheet_template_versions
for select to authenticated using (
  public.is_member_of_organization(organization_id)
  and public.has_org_permission(organization_id, 'pricing_worksheets.templates.view')
);
drop policy if exists pricing_worksheet_template_version_sheets_select on public.pricing_worksheet_template_version_sheets;
create policy pricing_worksheet_template_version_sheets_select on public.pricing_worksheet_template_version_sheets
for select to authenticated using (
  public.is_member_of_organization(organization_id)
  and public.has_org_permission(organization_id, 'pricing_worksheets.templates.view')
);
drop policy if exists pricing_worksheet_template_instantiations_select on public.pricing_worksheet_template_instantiations;
create policy pricing_worksheet_template_instantiations_select on public.pricing_worksheet_template_instantiations
for select to authenticated using (
  public.is_member_of_organization(organization_id)
);

revoke all on public.pricing_worksheet_templates from public, anon;
revoke all on public.pricing_worksheet_template_versions from public, anon;
revoke all on public.pricing_worksheet_template_version_sheets from public, anon;
revoke all on public.pricing_worksheet_template_instantiations from public, anon;
grant select, insert, update on public.pricing_worksheet_templates to authenticated;
grant select on public.pricing_worksheet_template_versions to authenticated;
grant select on public.pricing_worksheet_template_version_sheets to authenticated;
grant select on public.pricing_worksheet_template_instantiations to authenticated;

insert into public.app_permissions (permission_key, description) values
  ('pricing_worksheets.templates.view', 'View company pricing worksheet templates'),
  ('pricing_worksheets.templates.write', 'Create pricing worksheet templates'),
  ('pricing_worksheets.templates.manage', 'Edit, archive, and manage pricing worksheet templates')
on conflict (permission_key) do update set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
select role_name, permission_key, role_name in ('owner', 'admin', 'qs', 'project_manager')
from (values ('owner'), ('admin'), ('qs'), ('project_manager'), ('worker')) roles(role_name)
cross join (values
  ('pricing_worksheets.templates.view'),
  ('pricing_worksheets.templates.write'),
  ('pricing_worksheets.templates.manage')
) permissions(permission_key)
on conflict (role, permission_key) do update set is_allowed = excluded.is_allowed, updated_at = now();

create or replace function public._apply_pricing_worksheet_template_inputs(
  p_worksheet_data jsonb,
  p_sheet_order integer,
  p_input_manifest jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  result jsonb := coalesce(p_worksheet_data, '{}'::jsonb);
  entry jsonb;
  cell_key text;
  default_value jsonb;
  cell jsonb;
begin
  if jsonb_typeof(coalesce(p_input_manifest, '[]'::jsonb)) <> 'array' then
    return result;
  end if;
  for entry in select value from jsonb_array_elements(p_input_manifest)
  loop
    if coalesce((entry->>'sheetOrder')::integer, -1) <> p_sheet_order then continue; end if;
    if coalesce((entry->>'clearOnCreate')::boolean, true) is false then continue; end if;
    cell_key := nullif(btrim(entry->>'cellKey'), '');
    if cell_key is null or cell_key !~ '^[A-Z]+[1-9][0-9]*$' then continue; end if;
    cell := result #> array['cells', cell_key];
    if cell is null or jsonb_typeof(cell) <> 'object' or cell ? 'formula' and nullif(cell->>'formula', '') is not null then
      continue;
    end if;
    default_value := case
      when entry ? 'defaultValue' then entry->'defaultValue'
      else 'null'::jsonb
    end;
    if default_value = 'null'::jsonb then
      result := jsonb_set(result, array['cells', cell_key, 'value'], 'null'::jsonb, true);
      result := jsonb_set(result, array['cells', cell_key, 'type'], '"empty"'::jsonb, true);
      result := jsonb_set(result, array['cells', cell_key, 'computedValue'], 'null'::jsonb, true);
      result := jsonb_set(result, array['cells', cell_key, 'displayValue'], '""'::jsonb, true);
    else
      result := jsonb_set(result, array['cells', cell_key, 'value'], default_value, true);
      result := jsonb_set(result, array['cells', cell_key, 'computedValue'], default_value, true);
      result := jsonb_set(result, array['cells', cell_key, 'type'],
        case when jsonb_typeof(default_value) = 'number' then '"number"'::jsonb else '"text"'::jsonb end, true);
      result := jsonb_set(result, array['cells', cell_key, 'displayValue'],
        to_jsonb(case when jsonb_typeof(default_value) = 'string' then default_value #>> '{}' else default_value::text end), true);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public._detach_pricing_worksheet_material_bindings(
  p_worksheet_data jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  result jsonb := coalesce(p_worksheet_data, '{}'::jsonb);
  cell_entry record;
  pricing jsonb;
  cell jsonb;
begin
  for cell_entry in select key, value from jsonb_each(coalesce(result->'cells', '{}'::jsonb))
  loop
    cell := cell_entry.value;
    pricing := cell #> '{metadata,materialPricing}';
    if pricing is null or jsonb_typeof(pricing) <> 'object' then continue; end if;
    cell := jsonb_set(cell, '{metadata,templateMaterialSnapshot}', pricing - 'bindingId', true);
    cell := cell #- '{metadata,materialPricing}';
    result := jsonb_set(result, array['cells', cell_entry.key], cell, true);
  end loop;
  return result;
end;
$$;

create or replace function public.save_pricing_worksheet_template_v1(
  p_organization_id uuid,
  p_source_workbook_id uuid,
  p_user_id uuid,
  p_name text,
  p_category text default null,
  p_description text default null,
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
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  template_row public.pricing_worksheet_templates%rowtype;
  version_row public.pricing_worksheet_template_versions%rowtype;
  sheet_row public.opportunity_pricing_workbook_sheets%rowtype;
  template_sheet public.pricing_worksheet_template_version_sheets%rowtype;
  request_key text := nullif(btrim(p_request_id), '');
  version_no integer;
  result_sheets jsonb := '[]'::jsonb;
begin
  if actor is null or actor is distinct from p_user_id then raise exception 'Authenticated actor is required.' using errcode = '42501'; end if;
  if not public.has_org_permission(p_organization_id, 'pricing_worksheets.templates.write') then raise exception 'Not authorized to create pricing worksheet templates.' using errcode = '42501'; end if;
  if request_key is null then raise exception 'A template request id is required.' using errcode = '22023'; end if;
  if exists (select 1 from public.pricing_worksheet_templates t join public.pricing_worksheet_template_versions v on v.id = t.current_version_id where t.organization_id = p_organization_id and v.metadata_snapshot->>'sourceWorkbookId' = p_source_workbook_id::text and v.metadata_snapshot->>'requestId' = request_key) then
    select jsonb_build_object('template', to_jsonb(t), 'version', to_jsonb(v), 'sheets', coalesce((select jsonb_agg(to_jsonb(s) order by s.sheet_order) from public.pricing_worksheet_template_version_sheets s where s.template_version_id = v.id), '[]'::jsonb)) into result_sheets from public.pricing_worksheet_templates t join public.pricing_worksheet_template_versions v on v.id = t.current_version_id where t.organization_id = p_organization_id and v.metadata_snapshot->>'sourceWorkbookId' = p_source_workbook_id::text and v.metadata_snapshot->>'requestId' = request_key limit 1;
    return result_sheets;
  end if;
  select * into source_workbook from public.opportunity_pricing_worksheets where organization_id = p_organization_id and id = p_source_workbook_id and archived_at is null;
  if not found then raise exception 'Pricing worksheet not found.' using errcode = 'P0002'; end if;
  if not public.is_member_of_organization(p_organization_id) then raise exception 'Not authorized for this organization.' using errcode = '42501'; end if;
  if p_input_manifest is null or jsonb_typeof(p_input_manifest) <> 'array' then raise exception 'Template input manifest must be an array.' using errcode = '22023'; end if;
  insert into public.pricing_worksheet_templates (organization_id, name, category, description, created_by, updated_by) values (p_organization_id, coalesce(nullif(btrim(p_name), ''), 'Pricing Worksheet Template'), nullif(btrim(p_category), ''), nullif(btrim(p_description), ''), actor, actor) returning * into template_row;
  version_no := 1;
  insert into public.pricing_worksheet_template_versions (organization_id, template_id, version_number, source_workbook_id, source_workbook_version, metadata_snapshot, input_manifest, created_by) values (p_organization_id, template_row.id, version_no, source_workbook.id, source_workbook.version, jsonb_build_object('sourceWorkbookId', source_workbook.id, 'sourceWorkbookVersion', source_workbook.version, 'requestId', request_key, 'workbookName', source_workbook.name, 'tradePackage', source_workbook.trade_package), p_input_manifest, actor) returning * into version_row;
  for sheet_row in select * from public.opportunity_pricing_workbook_sheets where organization_id = p_organization_id and workbook_id = source_workbook.id order by sheet_order, created_at loop
    insert into public.pricing_worksheet_template_version_sheets (organization_id, template_version_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version) values (p_organization_id, version_row.id, sheet_row.name, sheet_row.sheet_order, sheet_row.is_default, public._detach_pricing_worksheet_material_bindings(sheet_row.worksheet_data), sheet_row.pricing_summary, sheet_row.extracted_pricing_data, sheet_row.version) returning * into template_sheet;
    result_sheets := result_sheets || jsonb_build_array(to_jsonb(template_sheet));
  end loop;
  update public.pricing_worksheet_templates set current_version_id = version_row.id where organization_id = p_organization_id and id = template_row.id;
  select * into template_row from public.pricing_worksheet_templates where organization_id = p_organization_id and id = template_row.id;
  return jsonb_build_object('template', to_jsonb(template_row), 'version', to_jsonb(version_row), 'sheets', result_sheets);
end;
$$;

create or replace function public.create_pricing_worksheet_from_template_v1(
  p_organization_id uuid,
  p_template_version_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid default null,
  p_quote_id uuid default null,
  p_variation_id uuid default null,
  p_user_id uuid default null,
  p_name text default null,
  p_trade_package text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  template_version public.pricing_worksheet_template_versions%rowtype;
  template_row public.pricing_worksheet_templates%rowtype;
  workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.pricing_worksheet_template_version_sheets%rowtype;
  created_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  request_key text := nullif(btrim(p_request_id), '');
  data jsonb;
  result_sheets jsonb := '[]'::jsonb;
begin
  if actor is null or p_user_id is null or actor is distinct from p_user_id then raise exception 'Authenticated actor is required.' using errcode = '42501'; end if;
  if request_key is null then raise exception 'A workbook request id is required.' using errcode = '22023'; end if;
  if not public.has_org_permission(p_organization_id, 'pricing_worksheets.templates.view') then raise exception 'Not authorized to use pricing worksheet templates.' using errcode = '42501'; end if;
  select * into template_version from public.pricing_worksheet_template_versions where organization_id = p_organization_id and id = p_template_version_id;
  if not found then raise exception 'Pricing worksheet template version not found.' using errcode = 'P0002'; end if;
  select * into template_row from public.pricing_worksheet_templates where organization_id = p_organization_id and id = template_version.template_id and status = 'active' and archived_at is null;
  if not found then raise exception 'Pricing worksheet template is archived.' using errcode = 'P0002'; end if;
  if not public.can_write_pricing_workbook_owner(p_organization_id, p_opportunity_id, p_project_id, p_quote_id, p_variation_id) then raise exception 'Not authorized for the destination worksheet owner.' using errcode = '42501'; end if;
  if exists (select 1 from public.pricing_worksheet_template_instantiations i where i.organization_id = p_organization_id and i.request_id = request_key) then
    select jsonb_build_object('workbook', to_jsonb(w), 'sheets', coalesce((select jsonb_agg(to_jsonb(s) order by s.sheet_order) from public.opportunity_pricing_workbook_sheets s where s.organization_id = p_organization_id and s.workbook_id = i.workbook_id), '[]'::jsonb)) into data from public.pricing_worksheet_template_instantiations i join public.opportunity_pricing_worksheets w on w.organization_id = i.organization_id and w.id = i.workbook_id where i.organization_id = p_organization_id and i.request_id = request_key;
    return data;
  end if;
  select * into source_sheet from public.pricing_worksheet_template_version_sheets where organization_id = p_organization_id and template_version_id = p_template_version_id order by is_default desc, sheet_order, created_at limit 1;
  if not found then raise exception 'Template has no worksheet sheets.' using errcode = 'P0002'; end if;
  data := public._apply_pricing_worksheet_template_inputs(source_sheet.worksheet_data, source_sheet.sheet_order, template_version.input_manifest);
  insert into public.opportunity_pricing_worksheets (organization_id, opportunity_id, project_id, quote_id, variation_id, name, trade_package, worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by) values (p_organization_id, p_opportunity_id, p_project_id, p_quote_id, p_variation_id, coalesce(nullif(btrim(p_name), ''), template_row.name), coalesce(nullif(btrim(p_trade_package), ''), nullif(btrim(template_version.metadata_snapshot->>'tradePackage'), ''), template_row.name), data, source_sheet.pricing_summary, source_sheet.extracted_pricing_data, source_sheet.version, actor, actor) returning * into workbook;
  for source_sheet in select * from public.pricing_worksheet_template_version_sheets where organization_id = p_organization_id and template_version_id = p_template_version_id order by sheet_order, created_at loop
    data := public._apply_pricing_worksheet_template_inputs(source_sheet.worksheet_data, source_sheet.sheet_order, template_version.input_manifest);
    insert into public.opportunity_pricing_workbook_sheets (workbook_id, organization_id, opportunity_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by) values (workbook.id, p_organization_id, p_opportunity_id, source_sheet.name, source_sheet.sheet_order, source_sheet.is_default, data, source_sheet.pricing_summary, source_sheet.extracted_pricing_data, source_sheet.version, actor, actor) returning * into created_sheet;
    result_sheets := result_sheets || jsonb_build_array(to_jsonb(created_sheet));
  end loop;
  insert into public.pricing_worksheet_template_instantiations (organization_id, template_id, template_version_id, workbook_id, request_id, created_by) values (p_organization_id, template_row.id, template_version.id, workbook.id, request_key, actor);
  return jsonb_build_object('workbook', to_jsonb(workbook), 'sheets', result_sheets, 'templateId', template_row.id, 'templateVersionId', template_version.id);
end;
$$;

create or replace function public.create_pricing_worksheet_template_version_v1(
  p_organization_id uuid,
  p_template_id uuid,
  p_source_workbook_id uuid,
  p_user_id uuid,
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
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  template_row public.pricing_worksheet_templates%rowtype;
  version_row public.pricing_worksheet_template_versions%rowtype;
  sheet_row public.opportunity_pricing_workbook_sheets%rowtype;
  template_sheet public.pricing_worksheet_template_version_sheets%rowtype;
  request_key text := nullif(btrim(p_request_id), '');
  version_no integer;
  result_sheets jsonb := '[]'::jsonb;
begin
  if actor is null or actor is distinct from p_user_id or not public.has_org_permission(p_organization_id, 'pricing_worksheets.templates.manage') then
    raise exception 'Not authorized to create pricing worksheet template versions.' using errcode = '42501';
  end if;
  if request_key is null then raise exception 'A template version request id is required.' using errcode = '22023'; end if;
  if p_input_manifest is null or jsonb_typeof(p_input_manifest) <> 'array' then raise exception 'Template input manifest must be an array.' using errcode = '22023'; end if;
  select * into template_row from public.pricing_worksheet_templates where organization_id = p_organization_id and id = p_template_id and status = 'active' and archived_at is null;
  if not found then raise exception 'Active pricing worksheet template not found.' using errcode = 'P0002'; end if;
  select * into source_workbook from public.opportunity_pricing_worksheets where organization_id = p_organization_id and id = p_source_workbook_id and archived_at is null;
  if not found then raise exception 'Pricing worksheet source workbook not found.' using errcode = 'P0002'; end if;
  if not public.can_write_pricing_workbook_owner(p_organization_id, source_workbook.opportunity_id, source_workbook.project_id, source_workbook.quote_id, source_workbook.variation_id) then
    raise exception 'Not authorized for the source worksheet.' using errcode = '42501';
  end if;
  select jsonb_build_object('template', to_jsonb(t), 'version', to_jsonb(v), 'sheets', coalesce((select jsonb_agg(to_jsonb(s) order by s.sheet_order) from public.pricing_worksheet_template_version_sheets s where s.template_version_id = v.id), '[]'::jsonb))
  into result_sheets
  from public.pricing_worksheet_templates t
  join public.pricing_worksheet_template_versions v on v.template_id = t.id and v.organization_id = t.organization_id
  where t.organization_id = p_organization_id and t.id = p_template_id and v.metadata_snapshot->>'requestId' = request_key
  limit 1;
  if result_sheets is not null then return result_sheets; end if;
  select coalesce(max(version_number), 0) + 1 into version_no from public.pricing_worksheet_template_versions where organization_id = p_organization_id and template_id = p_template_id;
  insert into public.pricing_worksheet_template_versions (organization_id, template_id, version_number, source_workbook_id, source_workbook_version, metadata_snapshot, input_manifest, created_by)
  values (p_organization_id, p_template_id, version_no, source_workbook.id, source_workbook.version, jsonb_build_object('sourceWorkbookId', source_workbook.id, 'sourceWorkbookVersion', source_workbook.version, 'requestId', request_key, 'workbookName', source_workbook.name, 'tradePackage', source_workbook.trade_package), p_input_manifest, actor)
  returning * into version_row;
  for sheet_row in select * from public.opportunity_pricing_workbook_sheets where organization_id = p_organization_id and workbook_id = source_workbook.id order by sheet_order, created_at loop
    insert into public.pricing_worksheet_template_version_sheets (organization_id, template_version_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version)
    values (p_organization_id, version_row.id, sheet_row.name, sheet_row.sheet_order, sheet_row.is_default, public._detach_pricing_worksheet_material_bindings(sheet_row.worksheet_data), sheet_row.pricing_summary, sheet_row.extracted_pricing_data, sheet_row.version)
    returning * into template_sheet;
    result_sheets := result_sheets || jsonb_build_array(to_jsonb(template_sheet));
  end loop;
  update public.pricing_worksheet_templates set current_version_id = version_row.id, updated_by = actor where organization_id = p_organization_id and id = p_template_id;
  select * into template_row from public.pricing_worksheet_templates where organization_id = p_organization_id and id = p_template_id;
  return jsonb_build_object('template', to_jsonb(template_row), 'version', to_jsonb(version_row), 'sheets', result_sheets);
end;
$$;

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

create or replace function public.archive_pricing_worksheet_template_v1(
  p_organization_id uuid,
  p_template_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare updated_row public.pricing_worksheet_templates%rowtype;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id or not public.has_org_permission(p_organization_id, 'pricing_worksheets.templates.manage') then raise exception 'Not authorized to archive pricing worksheet templates.' using errcode = '42501'; end if;
  update public.pricing_worksheet_templates set status = 'archived', archived_at = coalesce(archived_at, now()), updated_by = p_user_id where organization_id = p_organization_id and id = p_template_id returning * into updated_row;
  if not found then raise exception 'Pricing worksheet template not found.' using errcode = 'P0002'; end if;
  return to_jsonb(updated_row);
end;
$$;

create or replace function public.update_pricing_worksheet_template_metadata_v1(
  p_organization_id uuid,
  p_template_id uuid,
  p_user_id uuid,
  p_name text,
  p_category text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare updated_row public.pricing_worksheet_templates%rowtype;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id or not public.has_org_permission(p_organization_id, 'pricing_worksheets.templates.manage') then
    raise exception 'Not authorized to edit pricing worksheet templates.' using errcode = '42501';
  end if;
  update public.pricing_worksheet_templates
  set name = coalesce(nullif(btrim(p_name), ''), name),
      category = nullif(btrim(p_category), ''),
      description = nullif(btrim(p_description), ''),
      updated_by = p_user_id
  where organization_id = p_organization_id and id = p_template_id
  returning * into updated_row;
  if not found then raise exception 'Pricing worksheet template not found.' using errcode = 'P0002'; end if;
  return to_jsonb(updated_row);
end;
$$;

create or replace function public.duplicate_pricing_worksheet_template_v1(
  p_organization_id uuid,
  p_template_id uuid,
  p_user_id uuid,
  p_name text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  source_template public.pricing_worksheet_templates%rowtype;
  source_version public.pricing_worksheet_template_versions%rowtype;
  new_template public.pricing_worksheet_templates%rowtype;
  new_version public.pricing_worksheet_template_versions%rowtype;
  source_sheet public.pricing_worksheet_template_version_sheets%rowtype;
  request_key text := nullif(btrim(p_request_id), '');
  result_sheets jsonb := '[]'::jsonb;
begin
  if actor is null or actor is distinct from p_user_id or not public.has_org_permission(p_organization_id, 'pricing_worksheets.templates.manage') then
    raise exception 'Not authorized to duplicate pricing worksheet templates.' using errcode = '42501';
  end if;
  if request_key is null then raise exception 'A template request id is required.' using errcode = '22023'; end if;
  select jsonb_build_object('template', to_jsonb(t), 'version', to_jsonb(v), 'sheets', coalesce((select jsonb_agg(to_jsonb(s) order by s.sheet_order) from public.pricing_worksheet_template_version_sheets s where s.template_version_id = v.id), '[]'::jsonb))
  into result_sheets
  from public.pricing_worksheet_templates t
  join public.pricing_worksheet_template_versions v on v.template_id = t.id and v.organization_id = t.organization_id
  where t.organization_id = p_organization_id and v.metadata_snapshot->>'duplicatedFromTemplateId' = p_template_id::text and v.metadata_snapshot->>'requestId' = request_key
  limit 1;
  if result_sheets is not null then return result_sheets; end if;
  select * into source_template from public.pricing_worksheet_templates where organization_id = p_organization_id and id = p_template_id;
  if not found or source_template.current_version_id is null then raise exception 'Pricing worksheet template not found.' using errcode = 'P0002'; end if;
  select * into source_version from public.pricing_worksheet_template_versions where organization_id = p_organization_id and id = source_template.current_version_id;
  insert into public.pricing_worksheet_templates (organization_id, name, category, description, created_by, updated_by)
  values (p_organization_id, coalesce(nullif(btrim(p_name), ''), source_template.name || ' Copy'), source_template.category, source_template.description, actor, actor)
  returning * into new_template;
  insert into public.pricing_worksheet_template_versions (organization_id, template_id, version_number, source_workbook_id, source_workbook_version, metadata_snapshot, input_manifest, created_by)
  values (p_organization_id, new_template.id, 1, source_version.source_workbook_id, source_version.source_workbook_version, source_version.metadata_snapshot || jsonb_build_object('duplicatedFromTemplateId', source_template.id, 'duplicatedFromVersionId', source_version.id, 'requestId', request_key), source_version.input_manifest, actor)
  returning * into new_version;
  for source_sheet in select * from public.pricing_worksheet_template_version_sheets where organization_id = p_organization_id and template_version_id = source_version.id order by sheet_order, created_at loop
    insert into public.pricing_worksheet_template_version_sheets (organization_id, template_version_id, name, sheet_order, is_default, worksheet_data, pricing_summary, extracted_pricing_data, version)
    values (p_organization_id, new_version.id, source_sheet.name, source_sheet.sheet_order, source_sheet.is_default, source_sheet.worksheet_data, source_sheet.pricing_summary, source_sheet.extracted_pricing_data, source_sheet.version)
    returning * into source_sheet;
    result_sheets := result_sheets || jsonb_build_array(to_jsonb(source_sheet));
  end loop;
  update public.pricing_worksheet_templates set current_version_id = new_version.id where organization_id = p_organization_id and id = new_template.id;
  select * into new_template from public.pricing_worksheet_templates where organization_id = p_organization_id and id = new_template.id;
  return jsonb_build_object('template', to_jsonb(new_template), 'version', to_jsonb(new_version), 'sheets', result_sheets);
end;
$$;

revoke all on function public.save_pricing_worksheet_template_v1(uuid, uuid, uuid, text, text, text, jsonb, text) from public, anon;
revoke all on function public.create_pricing_worksheet_from_template_v1(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.archive_pricing_worksheet_template_v1(uuid, uuid, uuid) from public, anon;
revoke all on function public.update_pricing_worksheet_template_metadata_v1(uuid, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.duplicate_pricing_worksheet_template_v1(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.create_pricing_worksheet_template_version_v1(uuid, uuid, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.save_pricing_worksheet_template_v1(uuid, uuid, uuid, text, text, text, jsonb, text) to authenticated;
grant execute on function public.create_pricing_worksheet_from_template_v1(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.archive_pricing_worksheet_template_v1(uuid, uuid, uuid) to authenticated;
grant execute on function public.update_pricing_worksheet_template_metadata_v1(uuid, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.duplicate_pricing_worksheet_template_v1(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.create_pricing_worksheet_template_version_v1(uuid, uuid, uuid, uuid, jsonb, text) to authenticated;
revoke all on function public.save_pricing_worksheet_template_version_v1(uuid, uuid, uuid, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_pricing_worksheet_template_version_v1(uuid, uuid, uuid, uuid, jsonb, jsonb, text) to authenticated;

commit;
