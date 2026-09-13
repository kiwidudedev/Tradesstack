begin;

-- Award finalisation records and locks the accepted commercial basis, but a
-- Project quote revision is now a separate, explicit user action.  Keep the
-- existing return shape for callers; working_quote_id is intentionally null
-- for awards completed under this lifecycle.
create or replace function public.finalize_opportunity_award_pricing_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid,
  p_accepted_quote_id uuid
)
returns table (
  manifest_id uuid,
  working_quote_id uuid,
  classification text,
  source_workbook_count integer,
  worksheet_line_count integer,
  manual_line_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  accepted_quote public.project_quotes%rowtype;
  existing_manifest public.opportunity_award_pricing_manifests%rowtype;
  resolved_manifest_id uuid := gen_random_uuid();
  resolved_classification text;
  resolved_source_workbook_count integer := 0;
  resolved_worksheet_line_count integer := 0;
  resolved_manual_line_count integer := 0;
  resolved_quote_line_count integer := 0;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not (
    public.has_org_permission(p_organization_id, 'leads.opportunities.write')
    and public.has_org_permission(p_organization_id, 'quotes.write')
  ) then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  select * into existing_manifest
  from public.opportunity_award_pricing_manifests manifest
  where manifest.organization_id = p_organization_id
    and manifest.opportunity_id = p_opportunity_id;

  if found then
    if existing_manifest.project_id is distinct from p_project_id
      or existing_manifest.accepted_quote_id is distinct from p_accepted_quote_id
    then
      raise exception 'Opportunity award pricing manifest conflicts with the final Project mapping'
        using errcode = 'TS409';
    end if;

    perform * from public.ensure_opportunity_project_pricing_workbooks_v1(
      p_organization_id, p_opportunity_id, p_project_id, p_accepted_quote_id
    );

    return query select
      existing_manifest.id,
      existing_manifest.working_quote_id,
      existing_manifest.classification,
      existing_manifest.source_workbook_count,
      existing_manifest.worksheet_line_count,
      existing_manifest.manual_line_count;
    return;
  end if;

  if not exists (
    select 1 from public.opportunity_final_projects mapping
    where mapping.organization_id = p_organization_id
      and mapping.opportunity_id = p_opportunity_id
      and mapping.project_id = p_project_id
      and mapping.accepted_quote_id = p_accepted_quote_id
  ) then
    raise exception 'Final Project and accepted quote mapping is missing' using errcode = 'TS409';
  end if;

  select * into accepted_quote
  from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.id = p_accepted_quote_id
    and quote.originating_opportunity_id = p_opportunity_id
    and quote.project_id = p_project_id
  for update;

  if not found or accepted_quote.status <> 'Accepted' then
    raise exception 'Accepted quote pricing basis is unavailable' using errcode = 'TS422';
  end if;

  if accepted_quote.award_locked_at is not null then
    raise exception 'Accepted quote is locked without an award pricing manifest' using errcode = 'TS409';
  end if;

  if exists (
    select 1 from public.project_quote_line_items line
    where line.organization_id = p_organization_id
      and line.quote_id = p_accepted_quote_id
      and line.pricing_source_kind = 'unresolved'
  ) then
    raise exception 'Accepted quote pricing basis requires reconciliation before award'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1
    from public.project_quote_line_items line
    left join public.commercial_item_document_links link
      on link.organization_id = line.organization_id
     and link.document_kind = 'quote_line'
     and link.link_role = 'source'
     and link.document_id = line.quote_id
     and link.document_line_id = line.id
    left join public.commercial_items item
      on item.organization_id = link.organization_id and item.id = link.commercial_item_id
    left join public.opportunity_pricing_worksheets workbook
      on workbook.organization_id = item.organization_id and workbook.id = item.source_workbook_id
    left join public.opportunity_pricing_workbook_sheets sheet
      on sheet.organization_id = item.organization_id
     and sheet.workbook_id = item.source_workbook_id and sheet.id = item.source_sheet_id
    where line.organization_id = p_organization_id
      and line.quote_id = p_accepted_quote_id
      and (
        (line.pricing_source_kind = 'worksheet' and link.id is null)
        or (link.id is not null and (
          item.id is null
          or item.opportunity_id <> p_opportunity_id
          or workbook.id is null
          or workbook.opportunity_id <> p_opportunity_id
          or workbook.quote_id is not null
          or workbook.variation_id is not null
          or workbook.archived_at is not null
          or sheet.id is null
        ))
      )
  ) then
    raise exception 'Accepted quote pricing basis contains broken worksheet lineage'
      using errcode = 'TS409';
  end if;

  if exists (
    select 1 from public.commercial_item_document_links link
    where link.organization_id = p_organization_id
      and link.document_kind = 'quote_line'
      and link.document_id = p_accepted_quote_id
      and link.link_role = 'source'
    group by link.document_line_id
    having count(*) <> 1
  ) then
    raise exception 'Accepted quote pricing basis contains duplicate line evidence'
      using errcode = 'TS409';
  end if;

  select count(*)::integer into resolved_quote_line_count
  from public.project_quote_line_items line
  where line.organization_id = p_organization_id and line.quote_id = p_accepted_quote_id;

  select count(distinct link.document_line_id)::integer,
    count(distinct item.source_workbook_id)::integer
  into resolved_worksheet_line_count, resolved_source_workbook_count
  from public.commercial_item_document_links link
  join public.commercial_items item
    on item.organization_id = link.organization_id and item.id = link.commercial_item_id
  where link.organization_id = p_organization_id
    and link.document_kind = 'quote_line'
    and link.document_id = p_accepted_quote_id
    and link.link_role = 'source';

  resolved_worksheet_line_count := coalesce(resolved_worksheet_line_count, 0);
  resolved_source_workbook_count := coalesce(resolved_source_workbook_count, 0);
  resolved_manual_line_count := resolved_quote_line_count - resolved_worksheet_line_count;

  if resolved_manual_line_count < 0 then
    raise exception 'Accepted quote pricing basis contains duplicate line evidence'
      using errcode = 'TS409';
  elsif resolved_quote_line_count = 0 then
    resolved_classification := 'NO_WORKSHEET';
  elsif resolved_worksheet_line_count = 0 then
    resolved_classification := 'MANUAL_ONLY';
  elsif resolved_manual_line_count > 0 then
    resolved_classification := 'MIXED';
  elsif resolved_source_workbook_count = 1 then
    resolved_classification := 'EXACT';
  else
    resolved_classification := 'DERIVABLE';
  end if;

  insert into public.opportunity_award_pricing_manifests (
    id, organization_id, opportunity_id, project_id, accepted_quote_id, working_quote_id,
    classification, source_workbook_count, worksheet_line_count, manual_line_count,
    quote_subtotal_snapshot, quote_gst_snapshot, quote_total_snapshot, created_by
  ) values (
    resolved_manifest_id, p_organization_id, p_opportunity_id, p_project_id,
    p_accepted_quote_id, null, resolved_classification, resolved_source_workbook_count,
    resolved_worksheet_line_count, resolved_manual_line_count, accepted_quote.subtotal,
    accepted_quote.gst_amount, accepted_quote.total_quote_price, actor_user_id
  );

  insert into public.opportunity_award_pricing_manifest_sources (
    id, organization_id, manifest_id, source_workbook_id, source_sheet_id,
    source_workbook_version, source_sheet_version, source_range, source_signature,
    commercial_item_id, workbook_snapshot, sheet_snapshot, material_bindings_snapshot
  )
  select md5(resolved_manifest_id::text || ':source:' || item.id::text)::uuid,
    p_organization_id, resolved_manifest_id, workbook.id, sheet.id, workbook.version,
    sheet.version, item.source_range, item.source_signature, item.id,
    jsonb_build_object(
      'id', workbook.id, 'name', workbook.name, 'tradePackage', workbook.trade_package,
      'sortOrder', workbook.sort_order, 'version', workbook.version,
      'worksheetData', workbook.worksheet_data, 'pricingSummary', workbook.pricing_summary,
      'extractedPricingData', workbook.extracted_pricing_data,
      'capturedAt', timezone('utc', now())
    ),
    jsonb_build_object(
      'id', sheet.id, 'name', sheet.name, 'sheetOrder', sheet.sheet_order,
      'isDefault', sheet.is_default, 'version', sheet.version,
      'worksheetData', sheet.worksheet_data, 'pricingSummary', sheet.pricing_summary,
      'extractedPricingData', sheet.extracted_pricing_data,
      'capturedAt', timezone('utc', now())
    ),
    coalesce((
      select jsonb_agg(to_jsonb(binding) order by binding.inserted_at, binding.id)
      from public.worksheet_material_price_bindings binding
      where binding.organization_id = p_organization_id
        and binding.workbook_id = workbook.id and binding.sheet_id = sheet.id
    ), '[]'::jsonb)
  from public.commercial_item_document_links link
  join public.commercial_items item
    on item.organization_id = link.organization_id and item.id = link.commercial_item_id
  join public.opportunity_pricing_worksheets workbook
    on workbook.organization_id = item.organization_id and workbook.id = item.source_workbook_id
  join public.opportunity_pricing_workbook_sheets sheet
    on sheet.organization_id = item.organization_id
   and sheet.workbook_id = item.source_workbook_id and sheet.id = item.source_sheet_id
  where link.organization_id = p_organization_id
    and link.document_kind = 'quote_line'
    and link.document_id = p_accepted_quote_id
    and link.link_role = 'source';

  insert into public.opportunity_award_pricing_manifest_lines (
    id, organization_id, manifest_id, quote_line_id, source_kind,
    manifest_source_id, commercial_item_id, quote_line_snapshot
  )
  select md5(resolved_manifest_id::text || ':manifest-line:' || line.id::text)::uuid,
    p_organization_id, resolved_manifest_id, line.id,
    case when link.id is null then 'manual' else 'worksheet' end,
    case when link.id is null then null
      else md5(resolved_manifest_id::text || ':source:' || item.id::text)::uuid end,
    item.id,
    jsonb_build_object(
      'id', line.id, 'section', line.section, 'description', line.description,
      'quantity', line.quantity, 'unit', line.unit, 'rate', line.rate,
      'total', line.total, 'isOptional', line.is_optional,
      'sortOrder', line.sort_order, 'capturedAt', timezone('utc', now())
    )
  from public.project_quote_line_items line
  left join public.commercial_item_document_links link
    on link.organization_id = line.organization_id
   and link.document_kind = 'quote_line' and link.link_role = 'source'
   and link.document_id = line.quote_id and link.document_line_id = line.id
  left join public.commercial_items item
    on item.organization_id = link.organization_id and item.id = link.commercial_item_id
  where line.organization_id = p_organization_id and line.quote_id = p_accepted_quote_id;

  update public.project_quotes quote
  set award_locked_at = timezone('utc', now()),
      award_locked_reason = 'opportunity_award'
  where quote.organization_id = p_organization_id and quote.id = p_accepted_quote_id;

  perform * from public.ensure_opportunity_project_pricing_workbooks_v1(
    p_organization_id, p_opportunity_id, p_project_id, p_accepted_quote_id
  );

  return query select resolved_manifest_id, null::uuid, resolved_classification,
    resolved_source_workbook_count, resolved_worksheet_line_count, resolved_manual_line_count;
end;
$$;

revoke all on function public.finalize_opportunity_award_pricing_v1(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.finalize_opportunity_award_pricing_v1(uuid, uuid, uuid, uuid)
  to authenticated;

-- Keep the established quote/line/link successor implementation, then clone
-- the Project-owned workspaces into that revision only after the user invokes
-- Create Revision.
alter function public.create_project_quote_revision_v1(uuid, uuid, uuid, text)
  rename to create_project_quote_revision_core_v1;

revoke all on function public.create_project_quote_revision_core_v1(uuid, uuid, uuid, text)
  from public, anon, authenticated;

create function public.create_project_quote_revision_v1(
  p_organization_id uuid,
  p_project_id uuid,
  p_predecessor_quote_id uuid,
  p_quote_number text
)
returns table (
  quote_id uuid,
  quote_number text,
  revision_number integer,
  cloned_workbook_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  created_revision record;
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  default_source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  destination_workbook_id uuid;
  destination_sheet_id uuid;
  parent_worksheet jsonb;
begin
  select * into created_revision
  from public.create_project_quote_revision_core_v1(
    p_organization_id, p_project_id, p_predecessor_quote_id, p_quote_number
  );

  for source_workbook in
    select * from public.opportunity_pricing_worksheets workbook
    where workbook.organization_id = p_organization_id
      and workbook.project_id = p_project_id
      and workbook.quote_id is null
      and workbook.variation_id is null
      and workbook.clone_kind = 'project_workspace'
      and workbook.archived_at is null
    order by workbook.sort_order, workbook.created_at
  loop
    if exists (
      select 1 from public.opportunity_pricing_worksheets clone
      where clone.organization_id = p_organization_id
        and clone.quote_id = created_revision.quote_id
        and clone.source_workbook_id = source_workbook.id
        and clone.clone_kind = 'quote_revision'
    ) then
      continue;
    end if;

    destination_workbook_id := md5(created_revision.quote_id::text || ':workspace:' || source_workbook.id::text)::uuid;
    select * into default_source_sheet
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
    order by sheet.is_default desc, sheet.sheet_order, sheet.created_at limit 1;

    parent_worksheet := public.regenerate_worksheet_material_binding_ids(
      coalesce(default_source_sheet.worksheet_data, source_workbook.worksheet_data)
    );

    insert into public.opportunity_pricing_worksheets (
      id, organization_id, opportunity_id, project_id, quote_id, variation_id,
      name, trade_package, sort_order, archived_at, last_active_sheet_id,
      worksheet_data, pricing_summary, extracted_pricing_data, version,
      created_by, updated_by, source_workbook_id, source_workbook_version,
      source_award_manifest_id, source_quote_id, clone_kind
    ) values (
      destination_workbook_id, p_organization_id, source_workbook.opportunity_id,
      p_project_id, created_revision.quote_id, null, source_workbook.name,
      source_workbook.trade_package, source_workbook.sort_order, null,
      case when source_workbook.last_active_sheet_id is null then null
        else md5(created_revision.quote_id::text || ':workspace-sheet:' || source_workbook.last_active_sheet_id::text)::uuid end,
      parent_worksheet,
      coalesce(default_source_sheet.pricing_summary, source_workbook.pricing_summary),
      coalesce(default_source_sheet.extracted_pricing_data, source_workbook.extracted_pricing_data),
      greatest(coalesce(default_source_sheet.version, source_workbook.version, 1), 1),
      actor_user_id, actor_user_id, source_workbook.id, source_workbook.version,
      source_workbook.source_award_manifest_id, p_predecessor_quote_id, 'quote_revision'
    ) on conflict (id) do nothing;

    for source_sheet in
      select * from public.opportunity_pricing_workbook_sheets sheet
      where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
      order by sheet.sheet_order, sheet.created_at
    loop
      destination_sheet_id := md5(created_revision.quote_id::text || ':workspace-sheet:' || source_sheet.id::text)::uuid;
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order,
        is_default, worksheet_data, pricing_summary, extracted_pricing_data,
        version, created_by, updated_by
      ) values (
        destination_sheet_id, destination_workbook_id, p_organization_id,
        source_workbook.opportunity_id, source_sheet.name, source_sheet.sheet_order,
        source_sheet.is_default,
        case when source_sheet.id = default_source_sheet.id then parent_worksheet
          else public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data) end,
        source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
        source_sheet.version, actor_user_id, actor_user_id
      ) on conflict (id) do nothing;
    end loop;
  end loop;

  return query select created_revision.quote_id, created_revision.quote_number,
    created_revision.revision_number,
    (select count(*)::integer from public.opportunity_pricing_worksheets workbook
      where workbook.organization_id = p_organization_id
        and workbook.quote_id = created_revision.quote_id);
end;
$$;

revoke all on function public.create_project_quote_revision_v1(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.create_project_quote_revision_v1(uuid, uuid, uuid, text)
  to authenticated;

commit;
