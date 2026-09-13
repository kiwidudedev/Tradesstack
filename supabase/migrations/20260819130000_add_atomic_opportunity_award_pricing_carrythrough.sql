begin;

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
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  default_source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  created_workbook public.opportunity_pricing_worksheets%rowtype;
  created_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  resolved_manifest_id uuid := gen_random_uuid();
  resolved_working_quote_id uuid;
  resolved_classification text;
  resolved_source_workbook_count integer := 0;
  resolved_worksheet_line_count integer := 0;
  resolved_manual_line_count integer := 0;
  resolved_quote_line_count integer := 0;
  resolved_working_quote_number text;
  resolved_parent_worksheet_data jsonb;
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
      or existing_manifest.working_quote_id is null
    then
      raise exception 'Opportunity award pricing manifest conflicts with the final Project mapping'
        using errcode = 'TS409';
    end if;

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
    select 1
    from public.opportunity_final_projects mapping
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
    select 1
    from public.project_quote_line_items line
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
      on item.organization_id = link.organization_id
     and item.id = link.commercial_item_id
    left join public.opportunity_pricing_worksheets workbook
      on workbook.organization_id = item.organization_id
     and workbook.id = item.source_workbook_id
    left join public.opportunity_pricing_workbook_sheets sheet
      on sheet.organization_id = item.organization_id
     and sheet.workbook_id = item.source_workbook_id
     and sheet.id = item.source_sheet_id
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
    select 1
    from public.commercial_item_document_links link
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

  select count(*)::integer
  into resolved_quote_line_count
  from public.project_quote_line_items line
  where line.organization_id = p_organization_id
    and line.quote_id = p_accepted_quote_id;

  select
    count(distinct link.document_line_id)::integer,
    count(distinct item.source_workbook_id)::integer
  into resolved_worksheet_line_count, resolved_source_workbook_count
  from public.commercial_item_document_links link
  join public.commercial_items item
    on item.organization_id = link.organization_id
   and item.id = link.commercial_item_id
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

  resolved_working_quote_id := md5(resolved_manifest_id::text || ':working-quote')::uuid;
  resolved_working_quote_number := accepted_quote.quote_number || '-P1';

  if exists (
    select 1 from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.quote_number = resolved_working_quote_number
  ) then
    raise exception 'Project working quote number already exists; reconciliation is required'
      using errcode = 'TS409';
  end if;

  insert into public.project_quotes (
    id, organization_id, project_id, originating_opportunity_id, source_opportunity_id,
    source_opportunity_quote_id, source_opportunity_quote_number, created_by,
    quote_title, quote_number, client_name, company_name, contact_person, client_email,
    client_phone, site_address, project_name, quote_date, expiry_date, status,
    optional_items_notes, scope_exclusions, assumptions, scope_notes, subtotal,
    optional_subtotal, margin_percent, margin_amount, discount_amount, contingency_amount,
    gst_percent, gst_amount, total_quote_price, validity_period, payment_terms,
    retention_percent_default, lead_time, terms_inclusions, terms_exclusions,
    clarifications, acceptance_notes, predecessor_quote_id, revision_number,
    revision_kind, revision_created_at, revision_created_by, publication_basis_hash, published_at
  ) values (
    resolved_working_quote_id, p_organization_id, p_project_id, p_opportunity_id,
    p_opportunity_id, accepted_quote.source_opportunity_quote_id,
    accepted_quote.source_opportunity_quote_number, actor_user_id,
    accepted_quote.quote_title, resolved_working_quote_number, accepted_quote.client_name,
    accepted_quote.company_name, accepted_quote.contact_person, accepted_quote.client_email,
    accepted_quote.client_phone, accepted_quote.site_address, accepted_quote.project_name,
    accepted_quote.quote_date, accepted_quote.expiry_date, 'Draft',
    accepted_quote.optional_items_notes, accepted_quote.scope_exclusions,
    accepted_quote.assumptions, accepted_quote.scope_notes, accepted_quote.subtotal,
    accepted_quote.optional_subtotal, accepted_quote.margin_percent, accepted_quote.margin_amount,
    accepted_quote.discount_amount, accepted_quote.contingency_amount, accepted_quote.gst_percent,
    accepted_quote.gst_amount, accepted_quote.total_quote_price, accepted_quote.validity_period,
    accepted_quote.payment_terms, accepted_quote.retention_percent_default,
    accepted_quote.lead_time, accepted_quote.terms_inclusions, accepted_quote.terms_exclusions,
    accepted_quote.clarifications, accepted_quote.acceptance_notes, accepted_quote.id,
    accepted_quote.revision_number + 1, 'project_working', timezone('utc', now()),
    actor_user_id, accepted_quote.publication_basis_hash, accepted_quote.published_at
  );

  insert into public.project_quote_line_items (
    id, organization_id, project_id, quote_id, section, description, quantity, unit,
    rate, total, is_optional, sort_order, source_opportunity_quote_id,
    source_opportunity_quote_line_item_id, source_opportunity_quote_number,
    pricing_source_kind
  )
  select
    md5(resolved_manifest_id::text || ':working-line:' || line.id::text)::uuid,
    line.organization_id, p_project_id, resolved_working_quote_id, line.section,
    line.description, line.quantity, line.unit, line.rate, line.total, line.is_optional,
    line.sort_order, line.source_opportunity_quote_id,
    line.source_opportunity_quote_line_item_id, line.source_opportunity_quote_number,
    line.pricing_source_kind
  from public.project_quote_line_items line
  where line.organization_id = p_organization_id
    and line.quote_id = p_accepted_quote_id;

  insert into public.opportunity_award_pricing_manifests (
    id, organization_id, opportunity_id, project_id, accepted_quote_id, working_quote_id,
    classification, source_workbook_count, worksheet_line_count, manual_line_count,
    quote_subtotal_snapshot, quote_gst_snapshot, quote_total_snapshot, created_by
  ) values (
    resolved_manifest_id, p_organization_id, p_opportunity_id, p_project_id,
    p_accepted_quote_id, resolved_working_quote_id, resolved_classification,
    resolved_source_workbook_count, resolved_worksheet_line_count,
    resolved_manual_line_count, accepted_quote.subtotal, accepted_quote.gst_amount,
    accepted_quote.total_quote_price, actor_user_id
  );

  insert into public.opportunity_award_pricing_manifest_sources (
    id, organization_id, manifest_id, source_workbook_id, source_sheet_id,
    source_workbook_version, source_sheet_version, source_range, source_signature,
    commercial_item_id, workbook_snapshot, sheet_snapshot, material_bindings_snapshot
  )
  select
    md5(resolved_manifest_id::text || ':source:' || item.id::text)::uuid,
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
        and binding.workbook_id = workbook.id
        and binding.sheet_id = sheet.id
    ), '[]'::jsonb)
  from public.commercial_item_document_links link
  join public.commercial_items item
    on item.organization_id = link.organization_id
   and item.id = link.commercial_item_id
  join public.opportunity_pricing_worksheets workbook
    on workbook.organization_id = item.organization_id
   and workbook.id = item.source_workbook_id
  join public.opportunity_pricing_workbook_sheets sheet
    on sheet.organization_id = item.organization_id
   and sheet.workbook_id = item.source_workbook_id
   and sheet.id = item.source_sheet_id
  where link.organization_id = p_organization_id
    and link.document_kind = 'quote_line'
    and link.document_id = p_accepted_quote_id
    and link.link_role = 'source';

  insert into public.opportunity_award_pricing_manifest_lines (
    id, organization_id, manifest_id, quote_line_id, source_kind,
    manifest_source_id, commercial_item_id, quote_line_snapshot
  )
  select
    md5(resolved_manifest_id::text || ':manifest-line:' || line.id::text)::uuid,
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
   and link.document_kind = 'quote_line'
   and link.link_role = 'source'
   and link.document_id = line.quote_id
   and link.document_line_id = line.id
  left join public.commercial_items item
    on item.organization_id = link.organization_id
   and item.id = link.commercial_item_id
  where line.organization_id = p_organization_id
    and line.quote_id = p_accepted_quote_id;

  insert into public.commercial_item_document_links (
    id, organization_id, commercial_item_id, document_kind, document_id,
    document_line_id, link_role, snapshot_at_link_json, created_by, created_at
  )
  select
    md5(resolved_manifest_id::text || ':working-link:' || link.id::text)::uuid,
    link.organization_id, link.commercial_item_id, 'quote_line', resolved_working_quote_id,
    md5(resolved_manifest_id::text || ':working-line:' || link.document_line_id::text)::uuid,
    link.link_role, link.snapshot_at_link_json, actor_user_id, timezone('utc', now())
  from public.commercial_item_document_links link
  where link.organization_id = p_organization_id
    and link.document_kind = 'quote_line'
    and link.document_id = p_accepted_quote_id;

  for source_workbook in
    select distinct workbook.*
    from public.opportunity_award_pricing_manifest_sources source
    join public.opportunity_pricing_worksheets workbook
      on workbook.organization_id = source.organization_id
     and workbook.id = source.source_workbook_id
    where source.organization_id = p_organization_id
      and source.manifest_id = resolved_manifest_id
  loop
    select * into default_source_sheet
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.organization_id = p_organization_id
      and sheet.workbook_id = source_workbook.id
    order by sheet.is_default desc, sheet.sheet_order, sheet.created_at
    limit 1;

    resolved_parent_worksheet_data := public.regenerate_worksheet_material_binding_ids(
      coalesce(default_source_sheet.worksheet_data, source_workbook.worksheet_data)
    );

    insert into public.opportunity_pricing_worksheets (
      id, organization_id, opportunity_id, project_id, quote_id, variation_id,
      name, trade_package, sort_order, archived_at, last_active_sheet_id,
      worksheet_data, pricing_summary, extracted_pricing_data, version,
      created_by, updated_by, source_workbook_id, source_workbook_version,
      source_award_manifest_id, clone_kind
    ) values (
      md5(resolved_manifest_id::text || ':workbook:' || source_workbook.id::text)::uuid,
      p_organization_id, p_opportunity_id, p_project_id, resolved_working_quote_id, null,
      source_workbook.name, source_workbook.trade_package, source_workbook.sort_order,
      null,
      case when source_workbook.last_active_sheet_id is null then null
        else md5(resolved_manifest_id::text || ':sheet:' || source_workbook.last_active_sheet_id::text)::uuid end,
      resolved_parent_worksheet_data,
      coalesce(default_source_sheet.pricing_summary, source_workbook.pricing_summary),
      coalesce(default_source_sheet.extracted_pricing_data, source_workbook.extracted_pricing_data),
      greatest(coalesce(default_source_sheet.version, source_workbook.version, 1), 1),
      actor_user_id, actor_user_id, source_workbook.id, source_workbook.version,
      resolved_manifest_id, 'project_working'
    ) returning * into created_workbook;

    for source_sheet in
      select *
      from public.opportunity_pricing_workbook_sheets sheet
      where sheet.organization_id = p_organization_id
        and sheet.workbook_id = source_workbook.id
      order by sheet.sheet_order, sheet.created_at
    loop
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order,
        is_default, worksheet_data, pricing_summary, extracted_pricing_data,
        version, created_by, updated_by
      ) values (
        md5(resolved_manifest_id::text || ':sheet:' || source_sheet.id::text)::uuid,
        created_workbook.id, p_organization_id, p_opportunity_id, source_sheet.name,
        source_sheet.sheet_order, source_sheet.is_default,
        case when source_sheet.id = default_source_sheet.id then resolved_parent_worksheet_data
          else public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data) end,
        source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
        source_sheet.version, actor_user_id, actor_user_id
      ) returning * into created_sheet;
    end loop;
  end loop;

  update public.opportunity_pricing_worksheets workbook
  set award_locked_at = timezone('utc', now()),
      award_locked_reason = 'accepted_tender_basis',
      updated_by = actor_user_id
  where workbook.organization_id = p_organization_id
    and workbook.id in (
      select distinct source.source_workbook_id
      from public.opportunity_award_pricing_manifest_sources source
      where source.organization_id = p_organization_id
        and source.manifest_id = resolved_manifest_id
    );

  update public.project_quotes quote
  set award_locked_at = timezone('utc', now()),
      award_locked_reason = 'opportunity_award'
  where quote.organization_id = p_organization_id
    and quote.id = p_accepted_quote_id;

  return query select resolved_manifest_id, resolved_working_quote_id,
    resolved_classification, resolved_source_workbook_count,
    resolved_worksheet_line_count, resolved_manual_line_count;
end;
$$;

revoke all on function public.finalize_opportunity_award_pricing_v1(uuid, uuid, uuid, uuid)
from public, anon;
grant execute on function public.finalize_opportunity_award_pricing_v1(uuid, uuid, uuid, uuid)
to authenticated;

create or replace function public.finalize_award_pricing_after_quote_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  final_mapping public.opportunity_final_projects%rowtype;
begin
  select * into final_mapping
  from public.opportunity_final_projects mapping
  where mapping.organization_id = new.organization_id
    and mapping.accepted_quote_id = new.id
    and mapping.project_id = new.project_id;

  if found then
    perform * from public.finalize_opportunity_award_pricing_v1(
      new.organization_id,
      final_mapping.opportunity_id,
      final_mapping.project_id,
      final_mapping.accepted_quote_id
    );
  end if;
  return new;
end;
$$;

create trigger finalize_award_pricing_after_quote_attachment
after update of project_id on public.project_quotes
for each row execute function public.finalize_award_pricing_after_quote_attachment();

revoke all on function public.finalize_award_pricing_after_quote_attachment()
from public, anon, authenticated;

commit;
