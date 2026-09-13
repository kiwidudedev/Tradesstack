begin;

alter table public.opportunity_pricing_worksheets
  add column if not exists source_quote_id uuid null;

alter table public.opportunity_pricing_worksheets
  drop constraint opportunity_pricing_worksheets_clone_lineage_check,
  add constraint opportunity_pricing_worksheets_org_source_quote_fkey
    foreign key (organization_id, source_quote_id)
    references public.project_quotes (organization_id, id) on delete restrict,
  add constraint opportunity_pricing_worksheets_clone_lineage_check
    check (
      (clone_kind is null and source_workbook_id is null and source_workbook_version is null
        and source_award_manifest_id is null and source_quote_id is null)
      or (
        clone_kind = 'project_working' and source_workbook_id is not null
        and source_workbook_version is not null and source_workbook_version > 0
        and source_award_manifest_id is not null and source_quote_id is null
        and project_id is not null and quote_id is not null
      )
      or (
        clone_kind = 'quote_revision' and source_workbook_id is not null
        and source_workbook_version is not null and source_workbook_version > 0
        and source_quote_id is not null and project_id is not null and quote_id is not null
      )
    );

create or replace function public.create_project_quote_revision_v1(
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
  predecessor public.project_quotes%rowtype;
  existing_successor public.project_quotes%rowtype;
  created_quote public.project_quotes%rowtype;
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  default_source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  created_workbook public.opportunity_pricing_worksheets%rowtype;
  resolved_quote_id uuid;
  resolved_quote_number text;
  resolved_revision_number integer;
  resolved_workbook_count integer := 0;
  resolved_parent_worksheet_data jsonb;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  select * into predecessor
  from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.project_id = p_project_id
    and quote.id = p_predecessor_quote_id
  for update;
  if not found then
    raise exception 'Predecessor quote was not found for this Project' using errcode = 'TS422';
  end if;

  select * into existing_successor
  from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.predecessor_quote_id = p_predecessor_quote_id;
  if found then
    return query select existing_successor.id, existing_successor.quote_number,
      existing_successor.revision_number,
      (select count(*)::integer from public.opportunity_pricing_worksheets workbook
       where workbook.organization_id = p_organization_id and workbook.quote_id = existing_successor.id);
    return;
  end if;

  resolved_revision_number := predecessor.revision_number + 1;
  resolved_quote_id := md5(p_predecessor_quote_id::text || ':revision:' || resolved_revision_number::text)::uuid;
  resolved_quote_number := coalesce(nullif(btrim(p_quote_number), ''),
    predecessor.quote_number || '-R' || resolved_revision_number::text);

  if exists (
    select 1 from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.project_id = p_project_id
      and quote.quote_number = resolved_quote_number
  ) then
    raise exception 'The requested quote revision number already exists' using errcode = 'TS409';
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
    revision_kind, revision_created_at, revision_created_by, pricing_basis_status
  ) values (
    resolved_quote_id, predecessor.organization_id, predecessor.project_id,
    predecessor.originating_opportunity_id, predecessor.source_opportunity_id,
    predecessor.source_opportunity_quote_id, predecessor.source_opportunity_quote_number,
    actor_user_id, predecessor.quote_title, resolved_quote_number, predecessor.client_name,
    predecessor.company_name, predecessor.contact_person, predecessor.client_email,
    predecessor.client_phone, predecessor.site_address, predecessor.project_name,
    current_date, predecessor.expiry_date, 'Draft', predecessor.optional_items_notes,
    predecessor.scope_exclusions, predecessor.assumptions, predecessor.scope_notes,
    predecessor.subtotal, predecessor.optional_subtotal, predecessor.margin_percent,
    predecessor.margin_amount, predecessor.discount_amount, predecessor.contingency_amount,
    predecessor.gst_percent, predecessor.gst_amount, predecessor.total_quote_price,
    predecessor.validity_period, predecessor.payment_terms,
    predecessor.retention_percent_default, predecessor.lead_time,
    predecessor.terms_inclusions, predecessor.terms_exclusions,
    predecessor.clarifications, predecessor.acceptance_notes, predecessor.id,
    resolved_revision_number, 'project_working', timezone('utc', now()), actor_user_id,
    'unpublished'
  ) returning * into created_quote;

  insert into public.project_quote_line_items (
    id, organization_id, project_id, quote_id, section, description, quantity, unit,
    rate, total, is_optional, sort_order, source_opportunity_quote_id,
    source_opportunity_quote_line_item_id, source_opportunity_quote_number, pricing_source_kind
  )
  select md5(created_quote.id::text || ':line:' || line.id::text)::uuid,
    line.organization_id, line.project_id, created_quote.id, line.section, line.description,
    line.quantity, line.unit, line.rate, line.total, line.is_optional, line.sort_order,
    line.source_opportunity_quote_id, line.source_opportunity_quote_line_item_id,
    line.source_opportunity_quote_number, line.pricing_source_kind
  from public.project_quote_line_items line
  where line.organization_id = p_organization_id and line.quote_id = predecessor.id;

  insert into public.commercial_item_document_links (
    id, organization_id, commercial_item_id, document_kind, document_id,
    document_line_id, link_role, snapshot_at_link_json, created_by, created_at
  )
  select md5(created_quote.id::text || ':link:' || link.id::text)::uuid,
    link.organization_id, link.commercial_item_id, link.document_kind, created_quote.id,
    md5(created_quote.id::text || ':line:' || link.document_line_id::text)::uuid,
    link.link_role, link.snapshot_at_link_json, actor_user_id, timezone('utc', now())
  from public.commercial_item_document_links link
  where link.organization_id = p_organization_id
    and link.document_kind = 'quote_line' and link.document_id = predecessor.id;

  for source_workbook in
    select * from public.opportunity_pricing_worksheets workbook
    where workbook.organization_id = p_organization_id
      and workbook.quote_id = predecessor.id and workbook.variation_id is null
      and workbook.archived_at is null
    order by workbook.sort_order, workbook.created_at
  loop
    select * into default_source_sheet
    from public.opportunity_pricing_workbook_sheets sheet
    where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
    order by sheet.is_default desc, sheet.sheet_order, sheet.created_at limit 1;

    resolved_parent_worksheet_data := public.regenerate_worksheet_material_binding_ids(
      coalesce(default_source_sheet.worksheet_data, source_workbook.worksheet_data)
    );
    insert into public.opportunity_pricing_worksheets (
      id, organization_id, opportunity_id, project_id, quote_id, variation_id,
      name, trade_package, sort_order, archived_at, last_active_sheet_id,
      worksheet_data, pricing_summary, extracted_pricing_data, version,
      created_by, updated_by, source_workbook_id, source_workbook_version,
      source_award_manifest_id, source_quote_id, clone_kind
    ) values (
      md5(created_quote.id::text || ':workbook:' || source_workbook.id::text)::uuid,
      p_organization_id, source_workbook.opportunity_id, p_project_id, created_quote.id, null,
      source_workbook.name, source_workbook.trade_package, source_workbook.sort_order, null,
      case when source_workbook.last_active_sheet_id is null then null
        else md5(created_quote.id::text || ':sheet:' || source_workbook.last_active_sheet_id::text)::uuid end,
      resolved_parent_worksheet_data,
      coalesce(default_source_sheet.pricing_summary, source_workbook.pricing_summary),
      coalesce(default_source_sheet.extracted_pricing_data, source_workbook.extracted_pricing_data),
      greatest(coalesce(default_source_sheet.version, source_workbook.version, 1), 1),
      actor_user_id, actor_user_id, source_workbook.id, source_workbook.version,
      source_workbook.source_award_manifest_id, predecessor.id, 'quote_revision'
    ) returning * into created_workbook;

    for source_sheet in
      select * from public.opportunity_pricing_workbook_sheets sheet
      where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
      order by sheet.sheet_order, sheet.created_at
    loop
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order,
        is_default, worksheet_data, pricing_summary, extracted_pricing_data,
        version, created_by, updated_by
      ) values (
        md5(created_quote.id::text || ':sheet:' || source_sheet.id::text)::uuid,
        created_workbook.id, p_organization_id, source_workbook.opportunity_id,
        source_sheet.name, source_sheet.sheet_order, source_sheet.is_default,
        case when source_sheet.id = default_source_sheet.id then resolved_parent_worksheet_data
          else public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data) end,
        source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
        source_sheet.version, actor_user_id, actor_user_id
      );
    end loop;
    resolved_workbook_count := resolved_workbook_count + 1;
  end loop;

  return query select created_quote.id, created_quote.quote_number,
    created_quote.revision_number, resolved_workbook_count;
end;
$$;

revoke all on function public.create_project_quote_revision_v1(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_project_quote_revision_v1(uuid, uuid, uuid, text) to authenticated;

commit;
