begin;

alter table public.opportunity_pricing_worksheets
  drop constraint opportunity_pricing_worksheets_clone_lineage_check,
  add constraint opportunity_pricing_worksheets_clone_lineage_check
  check (
    (clone_kind is null and source_workbook_id is null and source_workbook_version is null
      and source_award_manifest_id is null and source_quote_id is null)
    or (
      clone_kind = 'project_working' and source_workbook_id is not null
      and source_workbook_version is not null and source_workbook_version > 0
      and source_award_manifest_id is not null and source_quote_id is null
      and project_id is not null and quote_id is not null and variation_id is null
    )
    or (
      clone_kind = 'project_workspace' and source_workbook_id is not null
      and source_workbook_version is not null and source_workbook_version > 0
      and source_quote_id is null and project_id is not null
      and quote_id is null and variation_id is null
    )
    or (
      clone_kind = 'quote_revision' and source_workbook_id is not null
      and source_workbook_version is not null and source_workbook_version > 0
      and source_quote_id is not null and project_id is not null and quote_id is not null
    )
  );

create or replace function public.ensure_legacy_project_pricing_workbooks_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid,
  p_actor_user_id uuid
)
returns table (source_count integer, reused_count integer, created_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  default_source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  continuation public.opportunity_pricing_worksheets%rowtype;
  namespace_id uuid := md5(p_organization_id::text || ':' || p_opportunity_id::text || ':' || p_project_id::text)::uuid;
  destination_workbook_id uuid;
  destination_sheet_id uuid;
  parent_worksheet jsonb;
  sheet_count integer;
  resolved_source_count integer := 0;
  resolved_reused_count integer := 0;
  resolved_created_count integer := 0;
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_user_id then
    raise exception 'Authenticated reconciliation actor is required.' using errcode = '42501';
  end if;
  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.opportunity_final_projects mapping
    where mapping.organization_id = p_organization_id
      and mapping.opportunity_id = p_opportunity_id
      and mapping.project_id = p_project_id
      and mapping.accepted_quote_id is null
  ) then
    raise exception 'Legacy final Project mapping is invalid.' using errcode = 'TS409';
  end if;

  for source_workbook in
    select * from public.opportunity_pricing_worksheets source
    where source.organization_id = p_organization_id
      and source.opportunity_id = p_opportunity_id
      and source.project_id is null and source.quote_id is null and source.variation_id is null
      and source.clone_kind is null and source.archived_at is null
    order by source.created_at, source.id
  loop
    resolved_source_count := resolved_source_count + 1;
    select * into continuation from public.opportunity_pricing_worksheets candidate
    where candidate.organization_id = p_organization_id
      and candidate.project_id = p_project_id
      and candidate.source_workbook_id = source_workbook.id
      and candidate.clone_kind in ('project_working', 'project_workspace')
      and candidate.archived_at is null limit 1;
    if found then
      resolved_reused_count := resolved_reused_count + 1;
      continue;
    end if;

    destination_workbook_id := md5(namespace_id::text || ':project-workbook:' || source_workbook.id::text)::uuid;
    select * into default_source_sheet from public.opportunity_pricing_workbook_sheets sheet
    where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
    order by sheet.is_default desc, sheet.sheet_order, sheet.created_at limit 1;
    parent_worksheet := public.regenerate_worksheet_material_binding_ids(
      coalesce(default_source_sheet.worksheet_data, source_workbook.worksheet_data)
    );

    insert into public.opportunity_pricing_worksheets (
      id, organization_id, opportunity_id, project_id, quote_id, variation_id,
      name, trade_package, sort_order, worksheet_data, pricing_summary,
      extracted_pricing_data, version, created_by, updated_by, source_workbook_id,
      source_workbook_version, source_award_manifest_id, source_quote_id, clone_kind
    ) values (
      destination_workbook_id, p_organization_id, p_opportunity_id, p_project_id, null, null,
      source_workbook.name, source_workbook.trade_package, source_workbook.sort_order,
      parent_worksheet,
      coalesce(default_source_sheet.pricing_summary, source_workbook.pricing_summary),
      coalesce(default_source_sheet.extracted_pricing_data, source_workbook.extracted_pricing_data),
      greatest(coalesce(default_source_sheet.version, source_workbook.version, 1), 1),
      p_actor_user_id, p_actor_user_id, source_workbook.id,
      greatest(coalesce(source_workbook.version, 1), 1), null, null, 'project_workspace'
    ) on conflict do nothing;
    get diagnostics sheet_count = row_count;
    if sheet_count = 0 then
      resolved_reused_count := resolved_reused_count + 1;
      continue;
    end if;
    resolved_created_count := resolved_created_count + 1;

    sheet_count := 0;
    for source_sheet in
      select * from public.opportunity_pricing_workbook_sheets sheet
      where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
      order by sheet.sheet_order, sheet.created_at
    loop
      destination_sheet_id := md5(namespace_id::text || ':project-sheet:' || source_sheet.id::text)::uuid;
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
        worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
      ) values (
        destination_sheet_id, destination_workbook_id, p_organization_id, p_opportunity_id,
        source_sheet.name, source_sheet.sheet_order, source_sheet.is_default,
        case when source_sheet.id = default_source_sheet.id then parent_worksheet
          else public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data) end,
        source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
        source_sheet.version, p_actor_user_id, p_actor_user_id
      ) on conflict (id) do nothing;
      sheet_count := sheet_count + 1;
    end loop;

    if sheet_count = 0 then
      destination_sheet_id := md5(namespace_id::text || ':project-sheet:legacy:' || source_workbook.id::text)::uuid;
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
        worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
      ) values (
        destination_sheet_id, destination_workbook_id, p_organization_id, p_opportunity_id,
        coalesce(nullif(btrim(source_workbook.name), ''), 'Pricing Worksheet'), 0, true,
        parent_worksheet, source_workbook.pricing_summary, source_workbook.extracted_pricing_data,
        greatest(coalesce(source_workbook.version, 1), 1), p_actor_user_id, p_actor_user_id
      ) on conflict (id) do nothing;
    end if;

    update public.opportunity_pricing_worksheets destination
    set last_active_sheet_id = case
      when source_workbook.last_active_sheet_id is not null
        then md5(namespace_id::text || ':project-sheet:' || source_workbook.last_active_sheet_id::text)::uuid
      else (select sheet.id from public.opportunity_pricing_workbook_sheets sheet
        where sheet.workbook_id = destination_workbook_id
        order by sheet.is_default desc, sheet.sheet_order, sheet.created_at limit 1)
      end
    where destination.id = destination_workbook_id;
  end loop;

  return query select resolved_source_count, resolved_reused_count, resolved_created_count;
end;
$$;

revoke all on function public.ensure_legacy_project_pricing_workbooks_v1(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

do $$
declare
  function_definition text;
  patched_definition text;
  target_signature regprocedure := 'public.reconcile_project_pricing_workbooks_v1(boolean,uuid)'::regprocedure;
begin
  select pg_get_functiondef(target_signature) into function_definition;
  patched_definition := replace(
    function_definition,
    'perform * from public.finalize_opportunity_award_pricing_v1(
        mapping.organization_id, mapping.opportunity_id,
        mapping.project_id, mapping.accepted_quote_id
      );',
    'if mapping.accepted_quote_id is null then
        perform * from public.ensure_legacy_project_pricing_workbooks_v1(
          mapping.organization_id, mapping.opportunity_id, mapping.project_id, mapping.created_by
        );
      else
        perform * from public.finalize_opportunity_award_pricing_v1(
          mapping.organization_id, mapping.opportunity_id,
          mapping.project_id, mapping.accepted_quote_id
        );
      end if;'
  );
  if patched_definition = function_definition then
    raise exception 'Could not locate reconciliation finalizer boundary in %', target_signature;
  end if;
  execute patched_definition;
end;
$$;

commit;
