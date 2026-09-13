begin;

-- Primary-client quotation distribution keeps the existing internal quote
-- numbers unique while exposing the Opportunity code as the shared reference.
alter table public.opportunity_quote_series
  add column if not exists display_reference text null,
  add column if not exists source_quote_revision_id uuid null,
  add column if not exists source_quote_updated_at timestamptz null,
  add column if not exists source_quote_hash text null;

alter table public.project_quotes
  add column if not exists source_quote_revision_id uuid null,
  add column if not exists source_quote_updated_at timestamptz null,
  add column if not exists source_quote_hash text null,
  add column if not exists legacy_master_deprecated_at timestamptz null;

alter table public.opportunity_quote_series
  add constraint opportunity_quote_series_org_source_quote_fkey
  foreign key (organization_id, source_quote_revision_id)
  references public.project_quotes (organization_id, id) on delete restrict;

alter table public.project_quotes
  add constraint project_quotes_org_source_quote_fkey
  foreign key (organization_id, source_quote_revision_id)
  references public.project_quotes (organization_id, id) on delete restrict;

create index opportunity_quote_series_source_quote_idx
  on public.opportunity_quote_series (organization_id, source_quote_revision_id)
  where source_quote_revision_id is not null;
create index project_quotes_source_quote_idx
  on public.project_quotes (organization_id, source_quote_revision_id)
  where source_quote_revision_id is not null;

update public.opportunity_quote_series series
set display_reference = coalesce(nullif(opportunity.opportunity_code, ''),
  upper(left(regexp_replace(opportunity.slug, '[^a-zA-Z0-9]', '', 'g'), 8)))
from public.organization_opportunities opportunity
where opportunity.organization_id = series.organization_id
  and opportunity.id = series.opportunity_id
  and series.display_reference is null;

alter table public.opportunity_quote_series
  alter column display_reference set not null;
alter table public.opportunity_quote_series
  add constraint opportunity_quote_series_display_reference_not_blank
  check (char_length(btrim(display_reference)) > 0);

create or replace function public.opportunity_quote_snapshot_hash_v1(
  p_organization_id uuid,
  p_quote_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(jsonb_build_object(
    'quote', jsonb_build_object(
      'quote_title', quote.quote_title,
      'site_address', quote.site_address,
      'project_name', quote.project_name,
      'expiry_date', quote.expiry_date,
      'optional_items_notes', quote.optional_items_notes,
      'scope_exclusions', quote.scope_exclusions,
      'assumptions', quote.assumptions,
      'scope_notes', quote.scope_notes,
      'subtotal', quote.subtotal,
      'optional_subtotal', quote.optional_subtotal,
      'margin_percent', quote.margin_percent,
      'margin_amount', quote.margin_amount,
      'discount_amount', quote.discount_amount,
      'contingency_amount', quote.contingency_amount,
      'gst_percent', quote.gst_percent,
      'gst_amount', quote.gst_amount,
      'total_quote_price', quote.total_quote_price,
      'validity_period', quote.validity_period,
      'payment_terms', quote.payment_terms,
      'retention_percent_default', quote.retention_percent_default,
      'lead_time', quote.lead_time,
      'terms_inclusions', quote.terms_inclusions,
      'terms_exclusions', quote.terms_exclusions,
      'clarifications', quote.clarifications,
      'acceptance_notes', quote.acceptance_notes
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', line.section,
        'description', line.description,
        'quantity', line.quantity,
        'unit', line.unit,
        'rate', line.rate,
        'total', line.total,
        'is_optional', line.is_optional,
        'sort_order', line.sort_order,
        'source_opportunity_quote_id', line.source_opportunity_quote_id,
        'source_opportunity_quote_line_item_id', line.source_opportunity_quote_line_item_id,
        'source_opportunity_quote_number', line.source_opportunity_quote_number,
        'pricing_source_kind', line.pricing_source_kind
      ) order by line.sort_order, line.id)
      from public.project_quote_line_items line
      where line.organization_id = p_organization_id and line.quote_id = p_quote_id
    ), '[]'::jsonb)
  )::text)
  from public.project_quotes quote
  where quote.organization_id = p_organization_id and quote.id = p_quote_id;
$$;

create or replace function public.opportunity_quote_has_meaningful_state_v1(
  p_organization_id uuid,
  p_quote_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    quote.total_quote_price <> 0
    or quote.subtotal <> 0
    or quote.optional_subtotal <> 0
    or quote.margin_amount <> 0
    or quote.discount_amount <> 0
    or quote.contingency_amount <> 0
    or exists (select 1 from public.project_quote_line_items line
      where line.organization_id = p_organization_id and line.quote_id = p_quote_id)
    or exists (select 1 from public.opportunity_pricing_worksheets workbook
      where workbook.organization_id = p_organization_id and workbook.quote_id = p_quote_id
        and workbook.archived_at is null)
    or coalesce(nullif(btrim(quote.optional_items_notes), ''),
      nullif(btrim(quote.scope_exclusions), ''), nullif(btrim(quote.assumptions), ''),
      nullif(btrim(quote.scope_notes), ''), nullif(btrim(quote.payment_terms), ''),
      nullif(btrim(quote.lead_time), ''), nullif(btrim(quote.terms_inclusions), ''),
      nullif(btrim(quote.terms_exclusions), ''), nullif(btrim(quote.clarifications), ''),
      nullif(btrim(quote.acceptance_notes), '')) is not null,
    false
  )
  from public.project_quotes quote
  where quote.organization_id = p_organization_id and quote.id = p_quote_id;
$$;

-- The old trigger required provenance targets to remain Master rows. Stop that
-- runtime dependency before adopting safe Master rows into Primary series.
drop trigger if exists validate_opportunity_master_quote_v1 on public.project_quotes;

-- Fail closed before changing any row where two different meaningful sources
-- exist. The application audit can then reconcile that Opportunity explicitly.
do $$
declare
  conflict record;
begin
  select master.originating_opportunity_id as opportunity_id
  into conflict
  from public.project_quotes master
  join public.organization_opportunities opportunity
    on opportunity.organization_id = master.organization_id
   and opportunity.id = master.originating_opportunity_id
  join public.opportunity_quote_series series
    on series.organization_id = opportunity.organization_id
   and series.opportunity_id = opportunity.id
   and series.recipient_client_id = opportunity.client_id
   and series.archived_at is null
  join public.project_quotes primary_quote
    on primary_quote.organization_id = series.organization_id
   and primary_quote.id = series.current_revision_id
  where master.is_master_quote
    and master.legacy_master_deprecated_at is null
    and public.opportunity_quote_has_meaningful_state_v1(master.organization_id, master.id)
    and public.opportunity_quote_has_meaningful_state_v1(primary_quote.organization_id, primary_quote.id)
    and public.opportunity_quote_snapshot_hash_v1(master.organization_id, master.id)
      is distinct from public.opportunity_quote_snapshot_hash_v1(primary_quote.organization_id, primary_quote.id)
  limit 1;
  if found then
    raise exception 'Ambiguous Master and Primary Client quote state for Opportunity %; reconciliation required', conflict.opportunity_id
      using errcode = 'TS409';
  end if;
end;
$$;

-- Adopt a Master row when no Primary series exists. If an empty Primary Draft
-- already exists, move the meaningful commercial evidence into that Draft.
do $$
declare
  master public.project_quotes%rowtype;
  opportunity public.organization_opportunities%rowtype;
  recipient public.organization_clients%rowtype;
  primary_series public.opportunity_quote_series%rowtype;
  primary_quote public.project_quotes%rowtype;
  created_series public.opportunity_quote_series%rowtype;
  prefix text;
  next_sequence integer;
  resolved_number text;
  display_ref text;
  master_meaningful boolean;
  primary_meaningful boolean;
begin
  for master in
    select * from public.project_quotes quote
    where quote.is_master_quote and quote.legacy_master_deprecated_at is null
    order by quote.created_at, quote.id
  loop
    select * into opportunity from public.organization_opportunities candidate
    where candidate.organization_id = master.organization_id
      and candidate.id = master.originating_opportunity_id;
    if not found or opportunity.client_id is null then
      update public.project_quotes set legacy_master_deprecated_at = timezone('utc', now())
      where id = master.id;
      continue;
    end if;
    select * into recipient from public.organization_clients client
    where client.organization_id = opportunity.organization_id and client.id = opportunity.client_id;
    display_ref := coalesce(nullif(opportunity.opportunity_code, ''),
      upper(left(regexp_replace(opportunity.slug, '[^a-zA-Z0-9]', '', 'g'), 8)));
    select * into primary_series from public.opportunity_quote_series series
    where series.organization_id = opportunity.organization_id
      and series.opportunity_id = opportunity.id
      and series.recipient_client_id = opportunity.client_id
      and series.archived_at is null
    order by series.created_at limit 1;

    if not found then
      prefix := 'Q-' || display_ref || '-';
      select coalesce(max((regexp_match(series.base_quote_number,
        '^' || regexp_replace(prefix, '([.\\+*?\[\](){}|^$])', '\\\1', 'g') || '([0-9]+)$'))[1]::integer), 0) + 1
      into next_sequence from public.opportunity_quote_series series
      where series.organization_id = opportunity.organization_id and series.opportunity_id = opportunity.id;
      resolved_number := prefix || next_sequence::text;
      insert into public.opportunity_quote_series (
        organization_id, opportunity_id, recipient_client_id, base_quote_number,
        display_reference, created_by, created_at, updated_at
      ) values (
        opportunity.organization_id, opportunity.id, opportunity.client_id, resolved_number,
        display_ref, master.created_by, master.created_at, master.updated_at
      ) returning * into created_series;
      update public.project_quotes quote
      set is_master_quote = false,
        quote_series_id = created_series.id,
        quote_number = resolved_number,
        quote_title = case when quote.quote_title = 'Master Quote' then opportunity.name || ' Quotation' else quote.quote_title end,
        client_name = recipient.name,
        company_name = coalesce(recipient.company_name, ''),
        contact_person = recipient.name,
        client_email = coalesce(recipient.email, ''),
        client_phone = coalesce(recipient.phone, ''),
        legacy_master_deprecated_at = null
      where quote.id = master.id;
      update public.opportunity_quote_series series
      set current_revision_id = master.id
      where series.id = created_series.id;
      update public.opportunity_quote_series series
      set source_quote_revision_id = master.id,
        source_quote_updated_at = master.updated_at,
        source_quote_hash = public.opportunity_quote_snapshot_hash_v1(master.organization_id, master.id)
      where series.organization_id = master.organization_id
        and series.source_master_quote_id = master.id
        and series.id <> created_series.id;
      continue;
    end if;

    select * into primary_quote from public.project_quotes quote
    where quote.organization_id = primary_series.organization_id
      and quote.id = primary_series.current_revision_id;
    master_meaningful := public.opportunity_quote_has_meaningful_state_v1(master.organization_id, master.id);
    primary_meaningful := public.opportunity_quote_has_meaningful_state_v1(primary_quote.organization_id, primary_quote.id);
    if master_meaningful and not primary_meaningful and primary_quote.status = 'Draft' then
      update public.project_quotes quote set
        quote_title = case when master.quote_title = 'Master Quote' then opportunity.name || ' Quotation' else master.quote_title end,
        site_address = master.site_address, project_name = master.project_name,
        expiry_date = master.expiry_date, optional_items_notes = master.optional_items_notes,
        scope_exclusions = master.scope_exclusions, assumptions = master.assumptions,
        scope_notes = master.scope_notes, subtotal = master.subtotal,
        optional_subtotal = master.optional_subtotal, margin_percent = master.margin_percent,
        margin_amount = master.margin_amount, discount_amount = master.discount_amount,
        contingency_amount = master.contingency_amount, gst_percent = master.gst_percent,
        gst_amount = master.gst_amount, total_quote_price = master.total_quote_price,
        validity_period = master.validity_period, payment_terms = master.payment_terms,
        retention_percent_default = master.retention_percent_default, lead_time = master.lead_time,
        terms_inclusions = master.terms_inclusions, terms_exclusions = master.terms_exclusions,
        clarifications = master.clarifications, acceptance_notes = master.acceptance_notes
      where quote.id = primary_quote.id;
      update public.project_quote_line_items line set quote_id = primary_quote.id
      where line.organization_id = master.organization_id and line.quote_id = master.id;
      update public.commercial_item_document_links link set document_id = primary_quote.id
      where link.organization_id = master.organization_id
        and link.document_kind = 'quote_line' and link.document_id = master.id;
      update public.opportunity_pricing_worksheets workbook set quote_id = primary_quote.id
      where workbook.organization_id = master.organization_id and workbook.quote_id = master.id;
    end if;
    update public.opportunity_quote_series series
    set source_quote_revision_id = primary_quote.id,
      source_quote_updated_at = primary_quote.updated_at,
      source_quote_hash = public.opportunity_quote_snapshot_hash_v1(primary_quote.organization_id, primary_quote.id)
    where series.organization_id = master.organization_id and series.source_master_quote_id = master.id;
    update public.project_quotes quote set legacy_master_deprecated_at = timezone('utc', now())
    where quote.id = master.id;
  end loop;
end;
$$;

create or replace function public.propagate_quote_distribution_provenance_v1()
returns trigger language plpgsql set search_path = public as $$
declare predecessor public.project_quotes%rowtype;
begin
  if new.predecessor_quote_id is not null and new.source_quote_revision_id is null then
    select * into predecessor from public.project_quotes quote
    where quote.organization_id = new.organization_id and quote.id = new.predecessor_quote_id;
    if found then
      new.source_quote_revision_id := predecessor.source_quote_revision_id;
      new.source_quote_updated_at := predecessor.source_quote_updated_at;
      new.source_quote_hash := predecessor.source_quote_hash;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists propagate_quote_distribution_provenance_v1 on public.project_quotes;
create trigger propagate_quote_distribution_provenance_v1
before insert or update of predecessor_quote_id, source_quote_revision_id on public.project_quotes
for each row execute function public.propagate_quote_distribution_provenance_v1();

create or replace function public.require_series_for_opportunity_quote_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.originating_opportunity_id is not null and new.project_id is null
    and new.revision_kind = 'tender' and new.quote_series_id is null
  then
    raise exception 'Opportunity quotes must be created through an atomic Quote Series operation'
      using errcode = 'TS422';
  end if;
  return new;
end;
$$;

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
  select coalesce(max((regexp_match(series.base_quote_number,
    '^' || regexp_replace(prefix, '([.\\+*?\[\](){}|^$])', '\\\1', 'g') || '([0-9]+)$'))[1]::integer), 0) + 1
  into next_sequence from public.opportunity_quote_series series
  where series.organization_id = p_organization_id and series.opportunity_id = p_opportunity_id;
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

create or replace function public.create_opportunity_quote_series_v1(
  p_organization_id uuid, p_opportunity_id uuid, p_recipient_client_id uuid
)
returns table (series_id uuid, revision_id uuid, base_quote_number text, revision_number integer)
language sql security definer set search_path = public as $$
  select result.series_id, result.revision_id, result.base_quote_number, result.revision_number
  from public.distribute_opportunity_primary_quote_core_v1(
    p_organization_id, p_opportunity_id, p_recipient_client_id
  ) result;
$$;

create or replace function public.initialize_primary_opportunity_quote_v1(
  p_organization_id uuid, p_opportunity_id uuid
)
returns table (series_id uuid, revision_id uuid, base_quote_number text, revision_number integer)
language plpgsql security definer set search_path = public as $$
declare primary_client_id uuid;
begin
  select opportunity.client_id into primary_client_id
  from public.organization_opportunities opportunity
  where opportunity.organization_id = p_organization_id and opportunity.id = p_opportunity_id;
  if primary_client_id is null then
    raise exception 'Select a Primary Client before creating a quote' using errcode = 'TS422';
  end if;
  return query select result.series_id, result.revision_id, result.base_quote_number, result.revision_number
  from public.create_opportunity_quote_series_v1(
    p_organization_id, p_opportunity_id, primary_client_id
  ) result;
end;
$$;

create or replace function public.create_missing_opportunity_client_quotes_v1(
  p_organization_id uuid, p_opportunity_id uuid
)
returns table (
  client_id uuid, client_name text, outcome text,
  series_id uuid, revision_id uuid, base_quote_number text
)
language plpgsql security definer set search_path = public as $$
declare relationship record; result record;
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_opportunities opportunity
    join public.opportunity_quote_series series
      on series.organization_id = opportunity.organization_id
     and series.opportunity_id = opportunity.id
     and series.recipient_client_id = opportunity.client_id
     and series.archived_at is null
    where opportunity.organization_id = p_organization_id and opportunity.id = p_opportunity_id
      and series.current_revision_id is not null
  ) then
    raise exception 'Create the Primary Client quote before creating missing Tender Client quotes'
      using errcode = 'TS422';
  end if;
  for relationship in
    select tender.client_id, coalesce(nullif(client.company_name, ''), client.name) as client_name
    from public.opportunity_tender_clients tender
    join public.organization_clients client
      on client.organization_id = tender.organization_id and client.id = tender.client_id
    where tender.organization_id = p_organization_id and tender.opportunity_id = p_opportunity_id
      and tender.archived_at is null
    order by tender.is_primary desc, tender.created_at, tender.client_id
  loop
    select * into result from public.distribute_opportunity_primary_quote_core_v1(
      p_organization_id, p_opportunity_id, relationship.client_id
    );
    return query select relationship.client_id, relationship.client_name,
      case when result.created then 'created' else 'skipped' end,
      result.series_id, result.revision_id, result.base_quote_number;
  end loop;
end;
$$;

drop function if exists public.get_opportunity_quotation_workspace_v1(uuid, uuid);
create function public.get_opportunity_quotation_workspace_v1(
  p_organization_id uuid, p_opportunity_id uuid
)
returns table (primary_quote jsonb, tender_clients jsonb)
language sql stable security definer set search_path = public as $$
  with opportunity as (
    select candidate.* from public.organization_opportunities candidate
    where candidate.organization_id = p_organization_id and candidate.id = p_opportunity_id
  ), primary_source as (
    select quote.*, series.id as primary_series_id,
      public.opportunity_quote_snapshot_hash_v1(p_organization_id, quote.id) as current_hash
    from opportunity
    join public.opportunity_quote_series series
      on series.organization_id = opportunity.organization_id
     and series.opportunity_id = opportunity.id
     and series.recipient_client_id = opportunity.client_id
     and series.archived_at is null
    join public.project_quotes quote
      on quote.organization_id = series.organization_id and quote.id = series.current_revision_id
    limit 1
  ), tender_rows as (
    select tender.id as tender_client_id, tender.client_id, tender.is_primary, true as is_tender_client,
      coalesce(nullif(client.company_name, ''), client.name) as client_name,
      client.name as contact_name, client.email, client.phone,
      series.id as series_id, series.base_quote_number, series.display_reference,
      current_quote.id as current_revision_id, current_quote.revision_number,
      greatest(coalesce(current_quote.revision_number, 1) - 1, 0) as display_revision_number,
      current_quote.status, current_quote.total_quote_price, current_quote.quote_date,
      current_quote.expiry_date, current_quote.updated_at,
      coalesce((select count(*)::integer from public.project_quotes history
        where history.organization_id = series.organization_id and history.quote_series_id = series.id), 0) as revision_count,
      opportunity.accepted_quote_revision_id,
      opportunity.accepted_quote_revision_id = current_quote.id as is_current_accepted,
      case when series.source_quote_revision_id is null then false
        else series.source_quote_hash is distinct from public.opportunity_quote_snapshot_hash_v1(
          p_organization_id, series.source_quote_revision_id) end as source_changed_since_distribution
    from public.opportunity_tender_clients tender
    join public.organization_clients client
      on client.organization_id = tender.organization_id and client.id = tender.client_id
    left join lateral (
      select candidate.* from public.opportunity_quote_series candidate
      where candidate.organization_id = tender.organization_id
        and candidate.opportunity_id = tender.opportunity_id
        and candidate.recipient_client_id = tender.client_id and candidate.archived_at is null
      order by candidate.created_at limit 1
    ) series on true
    left join public.project_quotes current_quote
      on current_quote.organization_id = series.organization_id and current_quote.id = series.current_revision_id
    join opportunity on opportunity.organization_id = tender.organization_id
      and opportunity.id = tender.opportunity_id
    where tender.organization_id = p_organization_id and tender.opportunity_id = p_opportunity_id
      and tender.archived_at is null
  ), orphan_rows as (
    select null::uuid as tender_client_id, series.recipient_client_id as client_id,
      false as is_primary, false as is_tender_client,
      coalesce(nullif(client.company_name, ''), client.name, 'Unresolved recipient') as client_name,
      client.name as contact_name, client.email, client.phone,
      series.id as series_id, series.base_quote_number, series.display_reference,
      current_quote.id as current_revision_id, current_quote.revision_number,
      greatest(current_quote.revision_number - 1, 0) as display_revision_number,
      current_quote.status, current_quote.total_quote_price, current_quote.quote_date,
      current_quote.expiry_date, current_quote.updated_at,
      (select count(*)::integer from public.project_quotes history
        where history.organization_id = series.organization_id and history.quote_series_id = series.id) as revision_count,
      opportunity.accepted_quote_revision_id,
      opportunity.accepted_quote_revision_id = current_quote.id as is_current_accepted,
      case when series.source_quote_revision_id is null then false
        else series.source_quote_hash is distinct from public.opportunity_quote_snapshot_hash_v1(
          p_organization_id, series.source_quote_revision_id) end as source_changed_since_distribution
    from public.opportunity_quote_series series
    join opportunity on opportunity.organization_id = series.organization_id and opportunity.id = series.opportunity_id
    join public.project_quotes current_quote
      on current_quote.organization_id = series.organization_id and current_quote.id = series.current_revision_id
    left join public.organization_clients client
      on client.organization_id = series.organization_id and client.id = series.recipient_client_id
    where series.organization_id = p_organization_id and series.opportunity_id = p_opportunity_id
      and series.archived_at is null and not exists (
        select 1 from public.opportunity_tender_clients tender
        where tender.organization_id = series.organization_id and tender.opportunity_id = series.opportunity_id
          and tender.client_id = series.recipient_client_id and tender.archived_at is null
      )
  ), all_rows as (select * from tender_rows union all select * from orphan_rows)
  select (select to_jsonb(primary_source) from primary_source),
    coalesce((select jsonb_agg(to_jsonb(all_rows) order by is_primary desc, client_name, client_id)
      from all_rows), '[]'::jsonb)
  where public.is_member_of_organization(p_organization_id)
    and exists (select 1 from opportunity);
$$;

drop function if exists public.get_or_create_opportunity_master_quote_v1(uuid, uuid);
drop function if exists public.distribute_opportunity_master_quote_core_v1(uuid, uuid, uuid);
drop function if exists public.opportunity_master_quote_snapshot_hash_v1(uuid, uuid);
drop function if exists public.validate_opportunity_master_quote_v1();
drop index if exists public.project_quotes_one_master_per_opportunity_uidx;

revoke all on function public.initialize_primary_opportunity_quote_v1(uuid, uuid) from public, anon;
grant execute on function public.initialize_primary_opportunity_quote_v1(uuid, uuid) to authenticated;
revoke all on function public.distribute_opportunity_primary_quote_core_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.distribute_opportunity_primary_quote_core_v1(uuid, uuid, uuid) to authenticated;
revoke all on function public.opportunity_quote_snapshot_hash_v1(uuid, uuid) from public, anon;
grant execute on function public.opportunity_quote_snapshot_hash_v1(uuid, uuid) to authenticated;

commit;
