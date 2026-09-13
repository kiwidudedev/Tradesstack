begin;

create table public.opportunity_tender_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  opportunity_id uuid not null,
  client_id uuid not null,
  is_primary boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz null,
  constraint opportunity_tender_clients_org_opportunity_fkey
    foreign key (organization_id, opportunity_id)
    references public.organization_opportunities (organization_id, id) on delete restrict,
  constraint opportunity_tender_clients_org_client_fkey
    foreign key (organization_id, client_id)
    references public.organization_clients (organization_id, id) on delete restrict
);

create unique index opportunity_tender_clients_active_client_uidx
  on public.opportunity_tender_clients (organization_id, opportunity_id, client_id)
  where archived_at is null;
create unique index opportunity_tender_clients_primary_uidx
  on public.opportunity_tender_clients (organization_id, opportunity_id)
  where archived_at is null and is_primary;
create index opportunity_tender_clients_register_idx
  on public.opportunity_tender_clients (organization_id, opportunity_id, is_primary desc, created_at)
  where archived_at is null;
create index opportunity_tender_clients_client_idx
  on public.opportunity_tender_clients (organization_id, client_id, opportunity_id)
  where archived_at is null;

drop trigger if exists set_opportunity_tender_clients_updated_at on public.opportunity_tender_clients;
create trigger set_opportunity_tender_clients_updated_at
before update on public.opportunity_tender_clients
for each row execute function public.set_updated_at();

alter table public.project_quotes
  add column if not exists is_master_quote boolean not null default false,
  add column if not exists source_master_quote_id uuid null,
  add column if not exists source_master_quote_updated_at timestamptz null,
  add column if not exists source_master_quote_hash text null;

alter table public.project_quotes
  add constraint project_quotes_org_source_master_fkey
  foreign key (organization_id, source_master_quote_id)
  references public.project_quotes (organization_id, id) on delete restrict;

alter table public.opportunity_quote_series
  add column if not exists source_master_quote_id uuid null;

alter table public.opportunity_quote_series
  add constraint opportunity_quote_series_org_source_master_fkey
  foreign key (organization_id, source_master_quote_id)
  references public.project_quotes (organization_id, id) on delete restrict;

create unique index project_quotes_one_master_per_opportunity_uidx
  on public.project_quotes (organization_id, originating_opportunity_id)
  where is_master_quote;
create index project_quotes_source_master_idx
  on public.project_quotes (organization_id, source_master_quote_id)
  where source_master_quote_id is not null;
create unique index opportunity_quote_series_master_distribution_uidx
  on public.opportunity_quote_series (organization_id, opportunity_id, recipient_client_id)
  where archived_at is null and recipient_client_id is not null and source_master_quote_id is not null;

-- Preserve the primary/default CRM client and add every existing series recipient
-- to the complete tender-recipient set without altering any historical series.
insert into public.opportunity_tender_clients (
  organization_id, opportunity_id, client_id, is_primary, created_by, created_at
)
select opportunity.organization_id, opportunity.id, opportunity.client_id, true,
  opportunity.created_by, opportunity.created_at
from public.organization_opportunities opportunity
where opportunity.client_id is not null
on conflict (organization_id, opportunity_id, client_id) where archived_at is null
do update set is_primary = true;

insert into public.opportunity_tender_clients (
  organization_id, opportunity_id, client_id, is_primary, created_by, created_at
)
select series.organization_id, series.opportunity_id, series.recipient_client_id,
  opportunity.client_id = series.recipient_client_id,
  series.created_by, series.created_at
from public.opportunity_quote_series series
join public.organization_opportunities opportunity
  on opportunity.organization_id = series.organization_id
 and opportunity.id = series.opportunity_id
where series.recipient_client_id is not null
on conflict (organization_id, opportunity_id, client_id) where archived_at is null
do nothing;

create or replace function public.validate_opportunity_master_quote_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_master public.project_quotes%rowtype;
  predecessor public.project_quotes%rowtype;
begin
  if new.is_master_quote then
    if new.originating_opportunity_id is null
      or new.project_id is not null
      or new.quote_series_id is not null
      or new.predecessor_quote_id is not null
      or new.source_master_quote_id is not null
      or new.status <> 'Draft'
    then
      raise exception 'Master Quote must be a Draft source record owned directly by its Opportunity'
        using errcode = 'TS422';
    end if;
    if tg_op = 'UPDATE' and exists (
      select 1 from public.organization_opportunities opportunity
      where opportunity.organization_id = new.organization_id
        and opportunity.id = new.originating_opportunity_id
        and (opportunity.converted_at is not null or opportunity.stage = 'Won')
    ) then
      raise exception 'Master Quote is historical after Opportunity conversion'
        using errcode = 'TS409';
    end if;
  end if;

  if new.predecessor_quote_id is not null and new.source_master_quote_id is null then
    select * into predecessor
    from public.project_quotes quote
    where quote.organization_id = new.organization_id
      and quote.id = new.predecessor_quote_id;
    if found and predecessor.source_master_quote_id is not null then
      new.source_master_quote_id := predecessor.source_master_quote_id;
      new.source_master_quote_updated_at := predecessor.source_master_quote_updated_at;
      new.source_master_quote_hash := predecessor.source_master_quote_hash;
    end if;
  end if;

  if new.source_master_quote_id is not null then
    select * into source_master
    from public.project_quotes quote
    where quote.organization_id = new.organization_id
      and quote.id = new.source_master_quote_id;
    if not found
      or not source_master.is_master_quote
      or source_master.originating_opportunity_id is distinct from new.originating_opportunity_id
      or new.is_master_quote
      or new.quote_series_id is null
    then
      raise exception 'Distributed quote source must be the Master Quote for the same Opportunity'
        using errcode = 'TS422';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_opportunity_master_quote_v1
before insert or update of organization_id, originating_opportunity_id, project_id,
  quote_series_id, predecessor_quote_id, status, is_master_quote,
  source_master_quote_id, source_master_quote_updated_at, source_master_quote_hash
on public.project_quotes
for each row execute function public.validate_opportunity_master_quote_v1();

create or replace function public.require_series_for_opportunity_quote_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.originating_opportunity_id is not null and new.project_id is null
    and new.revision_kind = 'tender' and new.quote_series_id is null
    and not new.is_master_quote
  then
    raise exception 'Opportunity quotes must be created through an atomic Quote Series operation'
      using errcode = 'TS422';
  end if;
  return new;
end;
$$;

create or replace function public.opportunity_master_quote_snapshot_hash_v1(
  p_organization_id uuid,
  p_master_quote_id uuid
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
      where line.organization_id = p_organization_id
        and line.quote_id = p_master_quote_id
    ), '[]'::jsonb)
  )::text)
  from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.id = p_master_quote_id
    and quote.is_master_quote;
$$;

create or replace function public.sync_opportunity_tender_clients_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_client_ids uuid[],
  p_primary_client_id uuid
)
returns table (active_count integer, archived_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  normalized_ids uuid[];
  archived_rows integer := 0;
begin
  if actor_user_id is null
    or not public.has_org_permission(p_organization_id, 'leads.opportunities.write')
  then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[])
  into normalized_ids
  from unnest(coalesce(p_client_ids, '{}'::uuid[])) value
  where value is not null;

  if p_primary_client_id is null
    or not (p_primary_client_id = any(normalized_ids))
    or coalesce(array_length(normalized_ids, 1), 0) = 0
  then
    raise exception 'Tender Clients must include the primary client' using errcode = 'TS422';
  end if;

  perform 1 from public.organization_opportunities opportunity
  where opportunity.organization_id = p_organization_id
    and opportunity.id = p_opportunity_id
  for update;
  if not found then
    raise exception 'Opportunity was not found' using errcode = 'TS422';
  end if;

  if exists (
    select 1 from unnest(normalized_ids) value
    where not exists (
      select 1 from public.organization_clients client
      where client.organization_id = p_organization_id and client.id = value
    )
  ) then
    raise exception 'A Tender Client was not found for this organization' using errcode = 'TS422';
  end if;

  update public.opportunity_tender_clients relationship
  set archived_at = timezone('utc', now()), is_primary = false
  where relationship.organization_id = p_organization_id
    and relationship.opportunity_id = p_opportunity_id
    and relationship.archived_at is null
    and not (relationship.client_id = any(normalized_ids));
  get diagnostics archived_rows = row_count;

  update public.opportunity_tender_clients relationship
  set is_primary = false
  where relationship.organization_id = p_organization_id
    and relationship.opportunity_id = p_opportunity_id
    and relationship.archived_at is null
    and relationship.is_primary;

  insert into public.opportunity_tender_clients (
    organization_id, opportunity_id, client_id, is_primary, created_by
  )
  select p_organization_id, p_opportunity_id, value,
    value = p_primary_client_id, actor_user_id
  from unnest(normalized_ids) value
  on conflict (organization_id, opportunity_id, client_id) where archived_at is null
  do update set is_primary = excluded.is_primary;

  update public.organization_opportunities opportunity
  set client_id = p_primary_client_id
  where opportunity.organization_id = p_organization_id
    and opportunity.id = p_opportunity_id;

  return query select coalesce(array_length(normalized_ids, 1), 0), archived_rows;
end;
$$;

create or replace function public.create_opportunity_workspace_with_tender_clients_v1(
  p_organization_id uuid,
  p_creation_request_id uuid,
  p_name text,
  p_client_id uuid default null,
  p_new_client jsonb default null,
  p_owner_user_id uuid default null,
  p_location text default 'Unspecified',
  p_due_date date default null,
  p_estimated_value numeric default 0,
  p_notes text default '',
  p_tender_client_ids uuid[] default '{}'::uuid[]
)
returns table (
  opportunity_id uuid,
  opportunity_slug text,
  workspace_project_id uuid,
  workspace_project_slug text,
  lifecycle_id uuid,
  records_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created record;
  resolved_primary_client_id uuid;
  resolved_client_ids uuid[];
begin
  select * into created
  from public.create_opportunity_workspace_controlled_v1(
    p_organization_id, p_creation_request_id, p_name, p_client_id, p_new_client,
    p_owner_user_id, p_location, p_due_date, p_estimated_value, p_notes
  );

  select opportunity.client_id into resolved_primary_client_id
  from public.organization_opportunities opportunity
  where opportunity.organization_id = p_organization_id
    and opportunity.id = created.opportunity_id;

  select array_agg(distinct value) into resolved_client_ids
  from unnest(array_append(coalesce(p_tender_client_ids, '{}'::uuid[]), resolved_primary_client_id)) value
  where value is not null;

  perform public.sync_opportunity_tender_clients_v1(
    p_organization_id, created.opportunity_id, resolved_client_ids, resolved_primary_client_id
  );

  return query select created.opportunity_id, created.opportunity_slug,
    created.workspace_project_id, created.workspace_project_slug,
    created.lifecycle_id, created.records_created;
end;
$$;

create or replace function public.update_opportunity_details_and_tender_clients_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_name text,
  p_location text,
  p_due_date date,
  p_client_ids uuid[],
  p_primary_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(btrim(p_name), ''), '') = '' then
    raise exception 'Opportunity name is required' using errcode = 'TS422';
  end if;
  perform public.sync_opportunity_tender_clients_v1(
    p_organization_id, p_opportunity_id, p_client_ids, p_primary_client_id
  );
  update public.organization_opportunities opportunity
  set name = btrim(p_name),
    location = coalesce(nullif(btrim(p_location), ''), 'Unspecified'),
    due_date = p_due_date
  where opportunity.organization_id = p_organization_id
    and opportunity.id = p_opportunity_id;
end;
$$;

create or replace function public.get_or_create_opportunity_master_quote_v1(
  p_organization_id uuid,
  p_opportunity_id uuid
)
returns table (master_quote_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity public.organization_opportunities%rowtype;
  existing public.project_quotes%rowtype;
begin
  if actor_user_id is null or not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  select * into opportunity from public.organization_opportunities candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_opportunity_id
  for update;
  if not found then raise exception 'Opportunity was not found' using errcode = 'TS422'; end if;

  select * into existing from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
    and quote.is_master_quote
  for update;
  if found then
    return query select existing.id, false;
    return;
  end if;
  if opportunity.converted_at is not null or opportunity.stage = 'Won' then
    raise exception 'Master Quote cannot be created after conversion' using errcode = 'TS409';
  end if;

  insert into public.project_quotes (
    organization_id, project_id, originating_opportunity_id, source_opportunity_id,
    created_by, quote_title, quote_number, site_address, project_name, status,
    revision_number, revision_kind, revision_created_by, is_master_quote
  ) values (
    p_organization_id, null, p_opportunity_id, p_opportunity_id, actor_user_id,
    'Master Quote', 'MASTER-' || p_opportunity_id::text,
    opportunity.location, opportunity.name, 'Draft', 1, 'tender', actor_user_id, true
  ) returning * into existing;
  return query select existing.id, true;
end;
$$;

create or replace function public.distribute_opportunity_master_quote_core_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_recipient_client_id uuid
)
returns table (
  series_id uuid,
  revision_id uuid,
  base_quote_number text,
  revision_number integer,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity public.organization_opportunities%rowtype;
  recipient public.organization_clients%rowtype;
  master public.project_quotes%rowtype;
  existing_series public.opportunity_quote_series%rowtype;
  created_series public.opportunity_quote_series%rowtype;
  created_quote public.project_quotes%rowtype;
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  created_workbook_id uuid;
  prefix text;
  next_sequence integer;
  resolved_number text;
  snapshot_hash text;
begin
  if actor_user_id is null or not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  select * into opportunity from public.organization_opportunities candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_opportunity_id
  for update;
  if not found or opportunity.converted_at is not null or opportunity.stage = 'Won' then
    raise exception 'Opportunity is unavailable for client quote distribution' using errcode = 'TS422';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_opportunity_id::text, 0));

  select * into existing_series from public.opportunity_quote_series series
  where series.organization_id = p_organization_id
    and series.opportunity_id = p_opportunity_id
    and series.recipient_client_id = p_recipient_client_id
    and series.archived_at is null
  order by series.created_at
  limit 1;
  if found then
    return query select existing_series.id, existing_series.current_revision_id,
      existing_series.base_quote_number, coalesce((select quote.revision_number
        from public.project_quotes quote where quote.id = existing_series.current_revision_id), 1), false;
    return;
  end if;

  if not exists (
    select 1 from public.opportunity_tender_clients relationship
    where relationship.organization_id = p_organization_id
      and relationship.opportunity_id = p_opportunity_id
      and relationship.client_id = p_recipient_client_id
      and relationship.archived_at is null
  ) then
    raise exception 'Recipient must be an active Tender Client' using errcode = 'TS422';
  end if;
  select * into recipient from public.organization_clients client
  where client.organization_id = p_organization_id and client.id = p_recipient_client_id;
  if not found then raise exception 'Recipient client was not found' using errcode = 'TS422'; end if;
  select * into master from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
    and quote.is_master_quote
  for update;
  if not found then raise exception 'Build the Master Quote before creating client quotations' using errcode = 'TS422'; end if;

  snapshot_hash := public.opportunity_master_quote_snapshot_hash_v1(p_organization_id, master.id);
  prefix := 'Q-' || coalesce(nullif(opportunity.opportunity_code, ''),
    upper(left(regexp_replace(opportunity.slug, '[^a-zA-Z0-9]', '', 'g'), 8))) || '-';
  select coalesce(max((regexp_match(series.base_quote_number,
    '^' || regexp_replace(prefix, '([.\\+*?\[\](){}|^$])', '\\\1', 'g') || '([0-9]+)$'))[1]::integer), 0) + 1
  into next_sequence
  from public.opportunity_quote_series series
  where series.organization_id = p_organization_id and series.opportunity_id = p_opportunity_id;
  resolved_number := prefix || next_sequence::text;

  insert into public.opportunity_quote_series (
    organization_id, opportunity_id, recipient_client_id, base_quote_number,
    source_master_quote_id, created_by
  ) values (
    p_organization_id, p_opportunity_id, recipient.id, resolved_number, master.id, actor_user_id
  ) returning * into created_series;

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
    source_master_quote_id, source_master_quote_updated_at, source_master_quote_hash
  ) values (
    p_organization_id, null, p_opportunity_id, p_opportunity_id,
    master.source_opportunity_quote_id, master.source_opportunity_quote_number, actor_user_id,
    master.quote_title, resolved_number, recipient.name, coalesce(recipient.company_name, ''),
    recipient.name, coalesce(recipient.email, ''), coalesce(recipient.phone, ''),
    master.site_address, master.project_name, current_date, master.expiry_date, 'Draft',
    master.optional_items_notes, master.scope_exclusions, master.assumptions, master.scope_notes,
    master.subtotal, master.optional_subtotal, master.margin_percent, master.margin_amount,
    master.discount_amount, master.contingency_amount, master.gst_percent, master.gst_amount,
    master.total_quote_price, master.validity_period, master.payment_terms,
    master.retention_percent_default, master.lead_time, master.terms_inclusions,
    master.terms_exclusions, master.clarifications, master.acceptance_notes,
    1, 'tender', actor_user_id, 'unpublished', created_series.id,
    master.id, master.updated_at, snapshot_hash
  ) returning * into created_quote;

  insert into public.project_quote_line_items (
    id, organization_id, project_id, quote_id, section, description, quantity, unit,
    rate, total, is_optional, sort_order, source_opportunity_quote_id,
    source_opportunity_quote_line_item_id, source_opportunity_quote_number, pricing_source_kind
  ) select md5(created_quote.id::text || ':master-line:' || line.id::text)::uuid,
    line.organization_id, null, created_quote.id, line.section, line.description,
    line.quantity, line.unit, line.rate, line.total, line.is_optional, line.sort_order,
    line.source_opportunity_quote_id, line.source_opportunity_quote_line_item_id,
    line.source_opportunity_quote_number, line.pricing_source_kind
  from public.project_quote_line_items line
  where line.organization_id = p_organization_id and line.quote_id = master.id;

  insert into public.commercial_item_document_links (
    id, organization_id, commercial_item_id, document_kind, document_id,
    document_line_id, link_role, snapshot_at_link_json, created_by, created_at
  ) select md5(created_quote.id::text || ':master-link:' || link.id::text)::uuid,
    link.organization_id, link.commercial_item_id, link.document_kind, created_quote.id,
    case when link.document_line_id is null then null
      else md5(created_quote.id::text || ':master-line:' || link.document_line_id::text)::uuid end,
    link.link_role, link.snapshot_at_link_json, actor_user_id, timezone('utc', now())
  from public.commercial_item_document_links link
  where link.organization_id = p_organization_id
    and link.document_kind = 'quote_line' and link.document_id = master.id;

  for source_workbook in select * from public.opportunity_pricing_worksheets workbook
    where workbook.organization_id = p_organization_id and workbook.quote_id = master.id
      and workbook.variation_id is null and workbook.archived_at is null
  loop
    created_workbook_id := md5(created_quote.id::text || ':master-workbook:' || source_workbook.id::text)::uuid;
    insert into public.opportunity_pricing_worksheets (
      id, organization_id, opportunity_id, project_id, quote_id, variation_id, name,
      trade_package, sort_order, archived_at, worksheet_data, pricing_summary,
      extracted_pricing_data, version, created_by, updated_by, source_workbook_id,
      source_workbook_version, source_award_manifest_id, source_quote_id, clone_kind
    ) values (
      created_workbook_id, p_organization_id, source_workbook.opportunity_id,
      null, created_quote.id, null, source_workbook.name, source_workbook.trade_package,
      source_workbook.sort_order, null,
      public.regenerate_worksheet_material_binding_ids(source_workbook.worksheet_data),
      source_workbook.pricing_summary, source_workbook.extracted_pricing_data,
      source_workbook.version, actor_user_id, actor_user_id, source_workbook.id,
      source_workbook.version, source_workbook.source_award_manifest_id, master.id,
      'quote_revision'
    );
    for source_sheet in select * from public.opportunity_pricing_workbook_sheets sheet
      where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
    loop
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
        worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
      ) values (
        md5(created_quote.id::text || ':master-sheet:' || source_sheet.id::text)::uuid,
        created_workbook_id, p_organization_id, source_sheet.opportunity_id, source_sheet.name,
        source_sheet.sheet_order, source_sheet.is_default,
        public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data),
        source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
        source_sheet.version, actor_user_id, actor_user_id
      );
    end loop;
  end loop;

  update public.opportunity_quote_series
  set current_revision_id = created_quote.id
  where organization_id = p_organization_id and id = created_series.id;
  return query select created_series.id, created_quote.id, resolved_number, 1, true;
end;
$$;

create or replace function public.create_opportunity_quote_series_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_recipient_client_id uuid
)
returns table (series_id uuid, revision_id uuid, base_quote_number text, revision_number integer)
language sql
security definer
set search_path = public
as $$
  select result.series_id, result.revision_id, result.base_quote_number, result.revision_number
  from public.distribute_opportunity_master_quote_core_v1(
    p_organization_id, p_opportunity_id, p_recipient_client_id
  ) result;
$$;

create or replace function public.create_missing_opportunity_client_quotes_v1(
  p_organization_id uuid,
  p_opportunity_id uuid
)
returns table (
  client_id uuid,
  client_name text,
  outcome text,
  series_id uuid,
  revision_id uuid,
  base_quote_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  relationship record;
  result record;
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  for relationship in
    select tender.client_id,
      coalesce(nullif(client.company_name, ''), client.name) as client_name
    from public.opportunity_tender_clients tender
    join public.organization_clients client
      on client.organization_id = tender.organization_id and client.id = tender.client_id
    where tender.organization_id = p_organization_id
      and tender.opportunity_id = p_opportunity_id
      and tender.archived_at is null
    order by tender.is_primary desc, tender.created_at, tender.client_id
  loop
    select * into result from public.distribute_opportunity_master_quote_core_v1(
      p_organization_id, p_opportunity_id, relationship.client_id
    );
    return query select relationship.client_id, relationship.client_name,
      case when result.created then 'created' else 'skipped' end,
      result.series_id, result.revision_id, result.base_quote_number;
  end loop;
end;
$$;

create or replace function public.get_opportunity_quotation_workspace_v1(
  p_organization_id uuid,
  p_opportunity_id uuid
)
returns table (master_quote jsonb, tender_clients jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with master as (
    select quote.*,
      public.opportunity_master_quote_snapshot_hash_v1(p_organization_id, quote.id) as current_hash
    from public.project_quotes quote
    where quote.organization_id = p_organization_id
      and quote.originating_opportunity_id = p_opportunity_id
      and quote.is_master_quote
    limit 1
  ), tender_rows as (
    select tender.id as tender_client_id, tender.client_id, tender.is_primary, true as is_tender_client,
      coalesce(nullif(client.company_name, ''), client.name) as client_name,
      client.name as contact_name, client.email, client.phone,
      series.id as series_id, series.base_quote_number,
      current_quote.id as current_revision_id,
      current_quote.revision_number, current_quote.status,
      current_quote.total_quote_price, current_quote.quote_date,
      current_quote.expiry_date, current_quote.updated_at,
      coalesce((select count(*)::integer from public.project_quotes history
        where history.organization_id = series.organization_id and history.quote_series_id = series.id), 0) as revision_count,
      opportunity.accepted_quote_revision_id,
      opportunity.accepted_quote_revision_id = current_quote.id as is_current_accepted,
      case when series.id is null then false
        else current_quote.source_master_quote_hash is distinct from (select current_hash from master) end
        as master_changed_since_distribution
    from public.opportunity_tender_clients tender
    join public.organization_clients client
      on client.organization_id = tender.organization_id and client.id = tender.client_id
    left join lateral (
      select candidate.* from public.opportunity_quote_series candidate
      where candidate.organization_id = tender.organization_id
        and candidate.opportunity_id = tender.opportunity_id
        and candidate.recipient_client_id = tender.client_id
        and candidate.archived_at is null
      order by candidate.created_at
      limit 1
    ) series on true
    left join public.project_quotes current_quote
      on current_quote.organization_id = series.organization_id
     and current_quote.id = series.current_revision_id
    join public.organization_opportunities opportunity
      on opportunity.organization_id = tender.organization_id
     and opportunity.id = tender.opportunity_id
    where tender.organization_id = p_organization_id
      and tender.opportunity_id = p_opportunity_id
      and tender.archived_at is null
  ), orphan_rows as (
    select null::uuid as tender_client_id, series.recipient_client_id as client_id,
      false as is_primary, false as is_tender_client,
      coalesce(nullif(client.company_name, ''), client.name, 'Unresolved recipient') as client_name,
      client.name as contact_name, client.email, client.phone,
      series.id as series_id, series.base_quote_number,
      current_quote.id as current_revision_id,
      current_quote.revision_number, current_quote.status,
      current_quote.total_quote_price, current_quote.quote_date,
      current_quote.expiry_date, current_quote.updated_at,
      (select count(*)::integer from public.project_quotes history
        where history.organization_id = series.organization_id and history.quote_series_id = series.id) as revision_count,
      opportunity.accepted_quote_revision_id,
      opportunity.accepted_quote_revision_id = current_quote.id as is_current_accepted,
      case when series.source_master_quote_id is null then false
        else current_quote.source_master_quote_hash is distinct from (select current_hash from master) end
        as master_changed_since_distribution
    from public.opportunity_quote_series series
    join public.organization_opportunities opportunity
      on opportunity.organization_id = series.organization_id and opportunity.id = series.opportunity_id
    join public.project_quotes current_quote
      on current_quote.organization_id = series.organization_id and current_quote.id = series.current_revision_id
    left join public.organization_clients client
      on client.organization_id = series.organization_id and client.id = series.recipient_client_id
    where series.organization_id = p_organization_id
      and series.opportunity_id = p_opportunity_id
      and series.archived_at is null
      and not exists (
        select 1 from public.opportunity_tender_clients tender
        where tender.organization_id = series.organization_id
          and tender.opportunity_id = series.opportunity_id
          and tender.client_id = series.recipient_client_id
          and tender.archived_at is null
      )
  ), all_rows as (
    select * from tender_rows
    union all
    select * from orphan_rows
  )
  select (select to_jsonb(master) from master),
    coalesce((select jsonb_agg(to_jsonb(all_rows) order by is_primary desc, client_name, client_id) from all_rows), '[]'::jsonb)
  where public.is_member_of_organization(p_organization_id)
    and exists (select 1 from public.organization_opportunities opportunity
      where opportunity.organization_id = p_organization_id and opportunity.id = p_opportunity_id);
$$;

alter table public.opportunity_tender_clients enable row level security;
alter table public.opportunity_tender_clients force row level security;
create policy "Members can view Opportunity Tender Clients" on public.opportunity_tender_clients
for select using (public.is_member_of_organization(organization_id));

-- All mutations use organization-checked, transactional RPCs.
revoke insert, update, delete on public.opportunity_quote_series from authenticated;
grant select on public.opportunity_tender_clients to authenticated;

revoke all on function public.sync_opportunity_tender_clients_v1(uuid, uuid, uuid[], uuid) from public, anon;
grant execute on function public.sync_opportunity_tender_clients_v1(uuid, uuid, uuid[], uuid) to authenticated;
revoke all on function public.update_opportunity_details_and_tender_clients_v1(uuid, uuid, text, text, date, uuid[], uuid) from public, anon;
grant execute on function public.update_opportunity_details_and_tender_clients_v1(uuid, uuid, text, text, date, uuid[], uuid) to authenticated;
revoke all on function public.create_opportunity_workspace_with_tender_clients_v1(uuid, uuid, text, uuid, jsonb, uuid, text, date, numeric, text, uuid[]) from public, anon;
grant execute on function public.create_opportunity_workspace_with_tender_clients_v1(uuid, uuid, text, uuid, jsonb, uuid, text, date, numeric, text, uuid[]) to authenticated;
revoke all on function public.get_or_create_opportunity_master_quote_v1(uuid, uuid) from public, anon;
grant execute on function public.get_or_create_opportunity_master_quote_v1(uuid, uuid) to authenticated;
revoke all on function public.opportunity_master_quote_snapshot_hash_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.distribute_opportunity_master_quote_core_v1(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_opportunity_quote_series_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_opportunity_quote_series_v1(uuid, uuid, uuid) to authenticated;
revoke all on function public.create_missing_opportunity_client_quotes_v1(uuid, uuid) from public, anon;
grant execute on function public.create_missing_opportunity_client_quotes_v1(uuid, uuid) to authenticated;
revoke all on function public.get_opportunity_quotation_workspace_v1(uuid, uuid) from public, anon;
grant execute on function public.get_opportunity_quotation_workspace_v1(uuid, uuid) to authenticated;

commit;
