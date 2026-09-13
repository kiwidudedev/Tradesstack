begin;

-- Quote numbers are organization-wide. The prior allocator inspected only the
-- current opportunity, so repeated opportunity codes/slugs could both select
-- the same base number and violate opportunity_quote_series_org_number_unique.
create or replace function public.distribute_opportunity_primary_quote_core_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_recipient_client_id uuid
)
returns table (
  series_id uuid, revision_id uuid, base_quote_number text,
  revision_number integer, created boolean
)
language plpgsql security definer set search_path = public as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity public.organization_opportunities%rowtype;
  recipient public.organization_clients%rowtype;
  primary_series public.opportunity_quote_series%rowtype;
  source_quote public.project_quotes%rowtype;
  existing_series public.opportunity_quote_series%rowtype;
  created_series public.opportunity_quote_series%rowtype;
  created_quote public.project_quotes%rowtype;
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  created_workbook_id uuid;
  display_ref text;
  prefix text;
  next_sequence integer;
  resolved_number text;
  snapshot_hash text;
begin
  if actor_user_id is null or not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  select * into opportunity from public.organization_opportunities candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_opportunity_id for update;
  if not found or opportunity.client_id is null
    or opportunity.converted_at is not null or opportunity.stage = 'Won'
  then raise exception 'Opportunity and Primary Client are required for quotation creation' using errcode = 'TS422'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_opportunity_id::text, 0));
  select * into existing_series from public.opportunity_quote_series series
  where series.organization_id = p_organization_id and series.opportunity_id = p_opportunity_id
    and series.recipient_client_id = p_recipient_client_id and series.archived_at is null
  order by series.created_at limit 1;
  if found then
    return query select existing_series.id, existing_series.current_revision_id,
      existing_series.base_quote_number,
      coalesce((select quote.revision_number from public.project_quotes quote
        where quote.id = existing_series.current_revision_id), 1), false;
    return;
  end if;
  if not exists (select 1 from public.opportunity_tender_clients tender
    where tender.organization_id = p_organization_id and tender.opportunity_id = p_opportunity_id
      and tender.client_id = p_recipient_client_id and tender.archived_at is null)
  then raise exception 'Recipient must be an active Tender Client' using errcode = 'TS422'; end if;
  select * into recipient from public.organization_clients client
  where client.organization_id = p_organization_id and client.id = p_recipient_client_id;
  if not found then raise exception 'Recipient client was not found' using errcode = 'TS422'; end if;

  display_ref := coalesce(nullif(opportunity.opportunity_code, ''),
    upper(left(regexp_replace(opportunity.slug, '[^a-zA-Z0-9]', '', 'g'), 8)));
  prefix := 'Q-' || display_ref || '-';

  -- base_quote_number is unique for the whole organization, so allocation must
  -- be serialized and calculated at that same scope. Include project_quotes to
  -- avoid colliding with legacy/non-series quote numbers that share the prefix.
  perform pg_advisory_xact_lock(
    hashtextextended('opportunity-quote-number:' || p_organization_id::text || ':' || lower(prefix), 0)
  );
  select coalesce(max(candidate.sequence_number), 0) + 1
  into next_sequence
  from (
    select (regexp_match(series.base_quote_number,
      '^' || regexp_replace(prefix, '([.\\+*?\[\](){}|^$])', '\\\1', 'g') || '([0-9]+)$'))[1]::integer
      as sequence_number
    from public.opportunity_quote_series series
    where series.organization_id = p_organization_id
    union all
    select (regexp_match(quote.quote_number,
      '^' || regexp_replace(prefix, '([.\\+*?\[\](){}|^$])', '\\\1', 'g') || '([0-9]+)$'))[1]::integer
      as sequence_number
    from public.project_quotes quote
    where quote.organization_id = p_organization_id
  ) candidate;
  resolved_number := prefix || next_sequence::text;

  if p_recipient_client_id <> opportunity.client_id then
    select * into primary_series from public.opportunity_quote_series series
    where series.organization_id = p_organization_id and series.opportunity_id = p_opportunity_id
      and series.recipient_client_id = opportunity.client_id and series.archived_at is null
    order by series.created_at limit 1;
    if not found or primary_series.current_revision_id is null then
      raise exception 'Create the Primary Client quote before creating Tender Client quotes' using errcode = 'TS422';
    end if;
    select * into source_quote from public.project_quotes quote
    where quote.organization_id = p_organization_id and quote.id = primary_series.current_revision_id
      and quote.quote_series_id = primary_series.id;
    if not found then raise exception 'Primary Client current quote revision is unavailable' using errcode = 'TS409'; end if;
    snapshot_hash := public.opportunity_quote_snapshot_hash_v1(p_organization_id, source_quote.id);
  end if;

  insert into public.opportunity_quote_series (
    organization_id, opportunity_id, recipient_client_id, base_quote_number,
    display_reference, source_quote_revision_id, source_quote_updated_at, source_quote_hash, created_by
  ) values (
    p_organization_id, p_opportunity_id, recipient.id, resolved_number, display_ref,
    source_quote.id, source_quote.updated_at, snapshot_hash, actor_user_id
  ) returning * into created_series;

  if p_recipient_client_id = opportunity.client_id then
    insert into public.project_quotes (
      organization_id, project_id, originating_opportunity_id, source_opportunity_id,
      created_by, quote_title, quote_number, client_name, company_name, contact_person,
      client_email, client_phone, site_address, project_name, quote_date, status,
      validity_period, revision_number, revision_kind, revision_created_by, quote_series_id
    ) values (
      p_organization_id, null, p_opportunity_id, p_opportunity_id, actor_user_id,
      opportunity.name || ' Quotation', resolved_number, recipient.name,
      coalesce(recipient.company_name, ''), recipient.name, coalesce(recipient.email, ''),
      coalesce(recipient.phone, ''), opportunity.location, opportunity.name, current_date,
      'Draft', '30 days', 1, 'tender', actor_user_id, created_series.id
    ) returning * into created_quote;
  else
    insert into public.project_quotes (
      organization_id, project_id, originating_opportunity_id, source_opportunity_id,
      source_opportunity_quote_id, source_opportunity_quote_number, created_by,
      quote_title, quote_number, client_name, company_name, contact_person, client_email,
      client_phone, site_address, project_name, quote_date, expiry_date, status,
      optional_items_notes, scope_exclusions, assumptions, scope_notes, subtotal,
      optional_subtotal, margin_percent, margin_amount, discount_amount, contingency_amount,
      gst_percent, gst_amount, total_quote_price, validity_period, payment_terms,
      retention_percent_default, lead_time, terms_inclusions, terms_exclusions,
      clarifications, acceptance_notes, revision_number, revision_kind,
      revision_created_by, pricing_basis_status, quote_series_id,
      source_quote_revision_id, source_quote_updated_at, source_quote_hash
    ) values (
      p_organization_id, null, p_opportunity_id, p_opportunity_id,
      source_quote.source_opportunity_quote_id, source_quote.source_opportunity_quote_number, actor_user_id,
      source_quote.quote_title, resolved_number, recipient.name, coalesce(recipient.company_name, ''),
      recipient.name, coalesce(recipient.email, ''), coalesce(recipient.phone, ''),
      source_quote.site_address, source_quote.project_name, current_date, source_quote.expiry_date, 'Draft',
      source_quote.optional_items_notes, source_quote.scope_exclusions, source_quote.assumptions,
      source_quote.scope_notes, source_quote.subtotal, source_quote.optional_subtotal,
      source_quote.margin_percent, source_quote.margin_amount, source_quote.discount_amount,
      source_quote.contingency_amount, source_quote.gst_percent, source_quote.gst_amount,
      source_quote.total_quote_price, source_quote.validity_period, source_quote.payment_terms,
      source_quote.retention_percent_default, source_quote.lead_time, source_quote.terms_inclusions,
      source_quote.terms_exclusions, source_quote.clarifications, source_quote.acceptance_notes,
      1, 'tender', actor_user_id, 'unpublished', created_series.id,
      source_quote.id, source_quote.updated_at, snapshot_hash
    ) returning * into created_quote;

    insert into public.project_quote_line_items (
      id, organization_id, project_id, quote_id, section, description, quantity, unit,
      rate, total, is_optional, sort_order, source_opportunity_quote_id,
      source_opportunity_quote_line_item_id, source_opportunity_quote_number, pricing_source_kind
    ) select md5(created_quote.id::text || ':source-line:' || line.id::text)::uuid,
      line.organization_id, null, created_quote.id, line.section, line.description,
      line.quantity, line.unit, line.rate, line.total, line.is_optional, line.sort_order,
      line.source_opportunity_quote_id, line.source_opportunity_quote_line_item_id,
      line.source_opportunity_quote_number, line.pricing_source_kind
    from public.project_quote_line_items line
    where line.organization_id = p_organization_id and line.quote_id = source_quote.id;

    insert into public.commercial_item_document_links (
      id, organization_id, commercial_item_id, document_kind, document_id,
      document_line_id, link_role, snapshot_at_link_json, created_by, created_at
    ) select md5(created_quote.id::text || ':source-link:' || link.id::text)::uuid,
      link.organization_id, link.commercial_item_id, link.document_kind, created_quote.id,
      case when link.document_line_id is null then null
        else md5(created_quote.id::text || ':source-line:' || link.document_line_id::text)::uuid end,
      link.link_role, link.snapshot_at_link_json, actor_user_id, timezone('utc', now())
    from public.commercial_item_document_links link
    where link.organization_id = p_organization_id
      and link.document_kind = 'quote_line' and link.document_id = source_quote.id;

    for source_workbook in select * from public.opportunity_pricing_worksheets workbook
      where workbook.organization_id = p_organization_id and workbook.quote_id = source_quote.id
        and workbook.variation_id is null and workbook.archived_at is null
    loop
      created_workbook_id := md5(created_quote.id::text || ':source-workbook:' || source_workbook.id::text)::uuid;
      insert into public.opportunity_pricing_worksheets (
        id, organization_id, opportunity_id, project_id, quote_id, variation_id, name,
        trade_package, sort_order, archived_at, worksheet_data, pricing_summary,
        extracted_pricing_data, version, created_by, updated_by, source_workbook_id,
        source_workbook_version, source_award_manifest_id, source_quote_id, clone_kind
      ) values (
        created_workbook_id, p_organization_id, source_workbook.opportunity_id, null,
        created_quote.id, null, source_workbook.name, source_workbook.trade_package,
        source_workbook.sort_order, null,
        public.regenerate_worksheet_material_binding_ids(source_workbook.worksheet_data),
        source_workbook.pricing_summary, source_workbook.extracted_pricing_data,
        source_workbook.version, actor_user_id, actor_user_id, source_workbook.id,
        source_workbook.version, source_workbook.source_award_manifest_id, source_quote.id,
        'quote_revision'
      );
      for source_sheet in select * from public.opportunity_pricing_workbook_sheets sheet
        where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
      loop
        insert into public.opportunity_pricing_workbook_sheets (
          id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
          worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
        ) values (
          md5(created_quote.id::text || ':source-sheet:' || source_sheet.id::text)::uuid,
          created_workbook_id, p_organization_id, source_sheet.opportunity_id, source_sheet.name,
          source_sheet.sheet_order, source_sheet.is_default,
          public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data),
          source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
          source_sheet.version, actor_user_id, actor_user_id
        );
      end loop;
    end loop;
  end if;
  update public.opportunity_quote_series set current_revision_id = created_quote.id
  where organization_id = p_organization_id and id = created_series.id;
  return query select created_series.id, created_quote.id, resolved_number, 1, true;
end;
$$;

commit;

