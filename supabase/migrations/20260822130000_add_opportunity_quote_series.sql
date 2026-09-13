begin;

-- Opportunity tendering is grouped by recipient. project_quotes remains the
-- canonical revision/evidence table; this table is only the stable series head.
create table public.opportunity_quote_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  opportunity_id uuid not null,
  recipient_client_id uuid null,
  base_quote_number text not null,
  current_revision_id uuid null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz null,
  constraint opportunity_quote_series_base_number_not_blank
    check (char_length(btrim(base_quote_number)) > 0),
  constraint opportunity_quote_series_org_id_unique unique (organization_id, id),
  constraint opportunity_quote_series_org_number_unique unique (organization_id, base_quote_number),
  constraint opportunity_quote_series_org_opportunity_fkey
    foreign key (organization_id, opportunity_id)
    references public.organization_opportunities (organization_id, id) on delete restrict
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_clients'::regclass
      and conname = 'organization_clients_organization_id_id_key'
  ) then
    alter table public.organization_clients
      add constraint organization_clients_organization_id_id_key unique (organization_id, id);
  end if;
end;
$$;

alter table public.opportunity_quote_series
  add constraint opportunity_quote_series_org_recipient_fkey
    foreign key (organization_id, recipient_client_id)
    references public.organization_clients (organization_id, id) on delete restrict;

alter table public.project_quotes
  add column if not exists quote_series_id uuid null;

alter table public.project_quotes
  add constraint project_quotes_org_quote_series_fkey
    foreign key (organization_id, quote_series_id)
    references public.opportunity_quote_series (organization_id, id) on delete restrict;

alter table public.opportunity_quote_series
  add constraint opportunity_quote_series_org_current_revision_fkey
    foreign key (organization_id, current_revision_id)
    references public.project_quotes (organization_id, id) on delete restrict;

alter table public.organization_opportunities
  add column if not exists accepted_quote_revision_id uuid null,
  add constraint organization_opportunities_org_accepted_quote_revision_fkey
    foreign key (organization_id, accepted_quote_revision_id)
    references public.project_quotes (organization_id, id) on delete restrict;

create index opportunity_quote_series_register_idx
  on public.opportunity_quote_series (organization_id, opportunity_id, updated_at desc)
  where archived_at is null;
create index opportunity_quote_series_recipient_idx
  on public.opportunity_quote_series (organization_id, recipient_client_id, updated_at desc)
  where archived_at is null;
create index project_quotes_series_history_idx
  on public.project_quotes (organization_id, quote_series_id, revision_number desc, created_at desc)
  where quote_series_id is not null;
create index organization_opportunities_accepted_revision_idx
  on public.organization_opportunities (organization_id, accepted_quote_revision_id)
  where accepted_quote_revision_id is not null;

drop trigger if exists set_opportunity_quote_series_updated_at on public.opportunity_quote_series;
create trigger set_opportunity_quote_series_updated_at
before update on public.opportunity_quote_series
for each row execute function public.set_updated_at();

create or replace function public.validate_opportunity_quote_series_revision()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  revision public.project_quotes%rowtype;
begin
  if new.current_revision_id is null then
    return new;
  end if;

  select * into revision
  from public.project_quotes quote
  where quote.organization_id = new.organization_id
    and quote.id = new.current_revision_id;

  if not found
    or revision.quote_series_id is distinct from new.id
    or revision.originating_opportunity_id is distinct from new.opportunity_id
    or revision.revision_kind <> 'tender'
  then
    raise exception 'Current quote revision must be a tender revision in the same Opportunity Quote Series'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_opportunity_quote_series_revision
before insert or update of organization_id, opportunity_id, current_revision_id
on public.opportunity_quote_series
for each row execute function public.validate_opportunity_quote_series_revision();

create or replace function public.validate_project_quote_series_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  series public.opportunity_quote_series%rowtype;
begin
  if new.quote_series_id is null then
    return new;
  end if;

  select * into series
  from public.opportunity_quote_series candidate
  where candidate.organization_id = new.organization_id
    and candidate.id = new.quote_series_id;

  if not found
    or new.originating_opportunity_id is distinct from series.opportunity_id
    or new.revision_kind <> 'tender'
  then
    raise exception 'Quote revision must belong to the same organization, Opportunity, and tender series'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_project_quote_series_ownership
before insert or update of organization_id, originating_opportunity_id, quote_series_id, revision_kind
on public.project_quotes
for each row execute function public.validate_project_quote_series_ownership();

create or replace function public.validate_opportunity_accepted_quote_revision()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  accepted public.project_quotes%rowtype;
  series public.opportunity_quote_series%rowtype;
begin
  if new.accepted_quote_revision_id is null then
    return new;
  end if;
  select * into accepted
  from public.project_quotes quote
  where quote.organization_id = new.organization_id
    and quote.id = new.accepted_quote_revision_id;
  if not found or accepted.originating_opportunity_id is distinct from new.id
    or accepted.quote_series_id is null or accepted.status <> 'Accepted'
  then
    raise exception 'Accepted revision must be an Accepted tender revision for this Opportunity'
      using errcode = 'TS422';
  end if;
  select * into series
  from public.opportunity_quote_series candidate
  where candidate.organization_id = new.organization_id
    and candidate.id = accepted.quote_series_id
    and candidate.opportunity_id = new.id
    and candidate.recipient_client_id is not null;
  if not found then
    raise exception 'Accepted revision does not have an authoritative recipient series'
      using errcode = 'TS422';
  end if;
  return new;
end;
$$;

create trigger validate_opportunity_accepted_quote_revision
before update of accepted_quote_revision_id on public.organization_opportunities
for each row execute function public.validate_opportunity_accepted_quote_revision();

-- Deterministic legacy backfill: one series per tender root chain. Project
-- working continuations deliberately remain outside tender-series navigation.
with recursive tender_chain as (
  select quote.id, quote.id as root_id, quote.organization_id,
    quote.originating_opportunity_id, quote.predecessor_quote_id
  from public.project_quotes quote
  where quote.originating_opportunity_id is not null
    and quote.revision_kind = 'tender'
    and (quote.predecessor_quote_id is null or not exists (
      select 1 from public.project_quotes predecessor
      where predecessor.organization_id = quote.organization_id
        and predecessor.id = quote.predecessor_quote_id
        and predecessor.revision_kind = 'tender'
    ))
  union all
  select child.id, chain.root_id, child.organization_id,
    child.originating_opportunity_id, child.predecessor_quote_id
  from tender_chain chain
  join public.project_quotes child
    on child.organization_id = chain.organization_id
   and child.predecessor_quote_id = chain.id
   and child.revision_kind = 'tender'
), roots as (
  select distinct on (chain.organization_id, chain.root_id)
    chain.organization_id, chain.root_id, chain.originating_opportunity_id,
    root.quote_number, root.created_by, root.created_at,
    opportunity.client_id
  from tender_chain chain
  join public.project_quotes root on root.id = chain.root_id
  join public.organization_opportunities opportunity
    on opportunity.organization_id = chain.organization_id
   and opportunity.id = chain.originating_opportunity_id
  order by chain.organization_id, chain.root_id
)
insert into public.opportunity_quote_series (
  id, organization_id, opportunity_id, recipient_client_id, base_quote_number,
  created_by, created_at, updated_at
)
select md5(root_id::text || ':opportunity-quote-series')::uuid,
  organization_id, originating_opportunity_id, client_id,
  regexp_replace(quote_number, '-R[0-9]+$', ''), created_by, created_at, created_at
from roots
on conflict (organization_id, base_quote_number) do nothing;

-- The existing award lock correctly protects commercial fields. Temporarily
-- suspend only that trigger while attaching non-commercial series lineage.
alter table public.project_quotes disable trigger reject_award_locked_quote_mutation;

with recursive tender_chain as (
  select quote.id, quote.id as root_id, quote.organization_id
  from public.project_quotes quote
  where quote.originating_opportunity_id is not null
    and quote.revision_kind = 'tender'
    and (quote.predecessor_quote_id is null or not exists (
      select 1 from public.project_quotes predecessor
      where predecessor.organization_id = quote.organization_id
        and predecessor.id = quote.predecessor_quote_id
        and predecessor.revision_kind = 'tender'
    ))
  union all
  select child.id, chain.root_id, child.organization_id
  from tender_chain chain
  join public.project_quotes child
    on child.organization_id = chain.organization_id
   and child.predecessor_quote_id = chain.id
   and child.revision_kind = 'tender'
)
update public.project_quotes quote
set quote_series_id = md5(chain.root_id::text || ':opportunity-quote-series')::uuid
from tender_chain chain
where quote.organization_id = chain.organization_id and quote.id = chain.id;

alter table public.project_quotes enable trigger reject_award_locked_quote_mutation;

update public.opportunity_quote_series series
set current_revision_id = (
      select quote.id from public.project_quotes quote
      where quote.organization_id = series.organization_id
        and quote.quote_series_id = series.id and quote.revision_kind = 'tender'
      order by quote.revision_number desc, quote.created_at desc, quote.id desc limit 1
    ),
    updated_at = greatest(series.updated_at, coalesce((
      select quote.updated_at from public.project_quotes quote
      where quote.organization_id = series.organization_id
        and quote.quote_series_id = series.id and quote.revision_kind = 'tender'
      order by quote.revision_number desc, quote.created_at desc, quote.id desc limit 1
    ), series.updated_at))
where exists (
  select 1 from public.project_quotes quote
  where quote.organization_id = series.organization_id and quote.quote_series_id = series.id
    and quote.revision_kind = 'tender'
);

-- Backfill acceptance authority only when exactly one Accepted revision exists.
with unambiguous as (
  select quote.organization_id, quote.originating_opportunity_id,
    (array_agg(quote.id order by quote.id))[1] as quote_id
  from public.project_quotes quote
  join public.opportunity_quote_series series
    on series.organization_id = quote.organization_id
   and series.id = quote.quote_series_id
   and series.recipient_client_id is not null
  where quote.quote_series_id is not null and quote.status = 'Accepted'
  group by quote.organization_id, quote.originating_opportunity_id
  having count(*) = 1
)
update public.organization_opportunities opportunity
set accepted_quote_revision_id = unambiguous.quote_id
from unambiguous
where opportunity.organization_id = unambiguous.organization_id
  and opportunity.id = unambiguous.originating_opportunity_id
  and opportunity.accepted_quote_revision_id is null;

-- Existing final mappings already identify an exact accepted revision. Where
-- its series recipient was deterministic, bring the final Project client into
-- alignment with that same authority.
update public.organization_projects project
set client_id = series.recipient_client_id
from public.opportunity_final_projects mapping
join public.organization_opportunities opportunity
  on opportunity.organization_id = mapping.organization_id
 and opportunity.id = mapping.opportunity_id
 and opportunity.accepted_quote_revision_id = mapping.accepted_quote_id
join public.project_quotes accepted
  on accepted.organization_id = mapping.organization_id
 and accepted.id = mapping.accepted_quote_id
join public.opportunity_quote_series series
  on series.organization_id = accepted.organization_id
 and series.id = accepted.quote_series_id
 and series.recipient_client_id is not null
where project.organization_id = mapping.organization_id
  and project.id = mapping.project_id
  and project.client_id is distinct from series.recipient_client_id;

create or replace function public.create_opportunity_quote_series_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_recipient_client_id uuid
)
returns table (series_id uuid, revision_id uuid, base_quote_number text, revision_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity public.organization_opportunities%rowtype;
  recipient public.organization_clients%rowtype;
  created_series public.opportunity_quote_series%rowtype;
  created_quote public.project_quotes%rowtype;
  prefix text;
  next_sequence integer;
  resolved_number text;
begin
  if actor_user_id is null or not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  select * into opportunity from public.organization_opportunities candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_opportunity_id
  for update;
  if not found or opportunity.converted_at is not null or opportunity.stage = 'Won' then
    raise exception 'Opportunity is unavailable for a new tender quote' using errcode = 'TS422';
  end if;
  select * into recipient from public.organization_clients client
  where client.organization_id = p_organization_id and client.id = p_recipient_client_id;
  if not found then
    raise exception 'Recipient client was not found for this organization' using errcode = 'TS422';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_opportunity_id::text, 0));
  prefix := 'Q-' || coalesce(nullif(opportunity.opportunity_code, ''),
    upper(left(regexp_replace(opportunity.slug, '[^a-zA-Z0-9]', '', 'g'), 8))) || '-';
  select coalesce(max((regexp_match(series.base_quote_number,
    '^' || regexp_replace(prefix, '([.\\+*?\[\](){}|^$])', '\\\1', 'g') || '([0-9]+)$'))[1]::integer), 0) + 1
  into next_sequence
  from public.opportunity_quote_series series
  where series.organization_id = p_organization_id
    and series.opportunity_id = p_opportunity_id;
  resolved_number := prefix || next_sequence::text;

  insert into public.opportunity_quote_series (
    organization_id, opportunity_id, recipient_client_id, base_quote_number, created_by
  ) values (p_organization_id, p_opportunity_id, recipient.id, resolved_number, actor_user_id)
  returning * into created_series;

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

  update public.opportunity_quote_series
  set current_revision_id = created_quote.id
  where organization_id = p_organization_id and id = created_series.id;

  return query select created_series.id, created_quote.id, resolved_number, 1;
end;
$$;

create or replace function public.create_opportunity_quote_revision_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_predecessor_quote_id uuid
)
returns table (series_id uuid, revision_id uuid, base_quote_number text, revision_number integer, cloned_workbook_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  predecessor public.project_quotes%rowtype;
  existing_successor public.project_quotes%rowtype;
  series public.opportunity_quote_series%rowtype;
  recipient public.organization_clients%rowtype;
  created_quote public.project_quotes%rowtype;
  source_workbook public.opportunity_pricing_worksheets%rowtype;
  source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  created_workbook_id uuid;
  cloned_count integer := 0;
  next_revision integer;
begin
  if actor_user_id is null or not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  select * into predecessor from public.project_quotes quote
  where quote.organization_id = p_organization_id
    and quote.originating_opportunity_id = p_opportunity_id
    and quote.id = p_predecessor_quote_id and quote.quote_series_id is not null
    and quote.revision_kind = 'tender'
  for update;
  if not found then raise exception 'Tender revision was not found for this Opportunity' using errcode = 'TS422'; end if;

  select * into series from public.opportunity_quote_series candidate
  where candidate.organization_id = p_organization_id and candidate.id = predecessor.quote_series_id
    and candidate.opportunity_id = p_opportunity_id and candidate.archived_at is null
  for update;
  if not found then raise exception 'Quote Series was not found' using errcode = 'TS422'; end if;

  select * into existing_successor from public.project_quotes quote
  where quote.organization_id = p_organization_id and quote.predecessor_quote_id = predecessor.id;
  if found then
    if existing_successor.quote_series_id is distinct from series.id then
      raise exception 'Existing successor has conflicting Quote Series lineage' using errcode = 'TS409';
    end if;
    return query select series.id, existing_successor.id, series.base_quote_number,
      existing_successor.revision_number,
      (select count(*)::integer from public.opportunity_pricing_worksheets workbook
       where workbook.organization_id = p_organization_id and workbook.quote_id = existing_successor.id);
    return;
  end if;
  if series.current_revision_id is distinct from predecessor.id then
    raise exception 'A newer current revision already exists' using errcode = 'TS409';
  end if;
  if predecessor.status = 'Draft' then
    raise exception 'The current Draft can be edited without creating a revision' using errcode = 'TS422';
  end if;
  if exists (select 1 from public.organization_opportunities opportunity
    where opportunity.organization_id = p_organization_id and opportunity.id = p_opportunity_id
      and (opportunity.converted_at is not null or opportunity.stage = 'Won')) then
    raise exception 'Tender revisions cannot be created after conversion' using errcode = 'TS409';
  end if;
  if series.recipient_client_id is null then
    raise exception 'Quote Series recipient must be reconciled before revision' using errcode = 'TS409';
  end if;
  select * into recipient from public.organization_clients client
  where client.organization_id = p_organization_id and client.id = series.recipient_client_id;
  if not found then raise exception 'Quote Series recipient is unavailable' using errcode = 'TS409'; end if;
  next_revision := predecessor.revision_number + 1;

  insert into public.project_quotes (
    organization_id, project_id, originating_opportunity_id, source_opportunity_id,
    source_opportunity_quote_id, source_opportunity_quote_number, created_by,
    quote_title, quote_number, client_name, company_name, contact_person, client_email,
    client_phone, site_address, project_name, quote_date, expiry_date, status,
    optional_items_notes, scope_exclusions, assumptions, scope_notes, subtotal,
    optional_subtotal, margin_percent, margin_amount, discount_amount, contingency_amount,
    gst_percent, gst_amount, total_quote_price, validity_period, payment_terms,
    retention_percent_default, lead_time, terms_inclusions, terms_exclusions,
    clarifications, acceptance_notes, predecessor_quote_id, revision_number,
    revision_kind, revision_created_by, pricing_basis_status, quote_series_id
  ) values (
    predecessor.organization_id, predecessor.project_id, predecessor.originating_opportunity_id,
    predecessor.source_opportunity_id, predecessor.source_opportunity_quote_id,
    predecessor.source_opportunity_quote_number, actor_user_id, predecessor.quote_title,
    series.base_quote_number || '-R' || next_revision::text, recipient.name,
    coalesce(recipient.company_name, ''), recipient.name, coalesce(recipient.email, ''),
    coalesce(recipient.phone, ''), predecessor.site_address, predecessor.project_name,
    current_date, predecessor.expiry_date, 'Draft', predecessor.optional_items_notes,
    predecessor.scope_exclusions, predecessor.assumptions, predecessor.scope_notes,
    predecessor.subtotal, predecessor.optional_subtotal, predecessor.margin_percent,
    predecessor.margin_amount, predecessor.discount_amount, predecessor.contingency_amount,
    predecessor.gst_percent, predecessor.gst_amount, predecessor.total_quote_price,
    predecessor.validity_period, predecessor.payment_terms, predecessor.retention_percent_default,
    predecessor.lead_time, predecessor.terms_inclusions, predecessor.terms_exclusions,
    predecessor.clarifications, predecessor.acceptance_notes, predecessor.id, next_revision,
    'tender', actor_user_id, 'unpublished', series.id
  ) returning * into created_quote;

  insert into public.project_quote_line_items (
    id, organization_id, project_id, quote_id, section, description, quantity, unit,
    rate, total, is_optional, sort_order, source_opportunity_quote_id,
    source_opportunity_quote_line_item_id, source_opportunity_quote_number, pricing_source_kind
  ) select md5(created_quote.id::text || ':line:' || line.id::text)::uuid,
    line.organization_id, line.project_id, created_quote.id, line.section, line.description,
    line.quantity, line.unit, line.rate, line.total, line.is_optional, line.sort_order,
    line.source_opportunity_quote_id, line.source_opportunity_quote_line_item_id,
    line.source_opportunity_quote_number, line.pricing_source_kind
  from public.project_quote_line_items line
  where line.organization_id = p_organization_id and line.quote_id = predecessor.id;

  insert into public.commercial_item_document_links (
    id, organization_id, commercial_item_id, document_kind, document_id,
    document_line_id, link_role, snapshot_at_link_json, created_by, created_at
  ) select md5(created_quote.id::text || ':link:' || link.id::text)::uuid,
    link.organization_id, link.commercial_item_id, link.document_kind, created_quote.id,
    md5(created_quote.id::text || ':line:' || link.document_line_id::text)::uuid,
    link.link_role, link.snapshot_at_link_json, actor_user_id, timezone('utc', now())
  from public.commercial_item_document_links link
  where link.organization_id = p_organization_id
    and link.document_kind = 'quote_line' and link.document_id = predecessor.id;

  for source_workbook in select * from public.opportunity_pricing_worksheets workbook
    where workbook.organization_id = p_organization_id and workbook.quote_id = predecessor.id
      and workbook.variation_id is null and workbook.archived_at is null
  loop
    created_workbook_id := md5(created_quote.id::text || ':workbook:' || source_workbook.id::text)::uuid;
    insert into public.opportunity_pricing_worksheets (
      id, organization_id, opportunity_id, project_id, quote_id, variation_id, name,
      trade_package, sort_order, archived_at, worksheet_data, pricing_summary,
      extracted_pricing_data, version, created_by, updated_by, source_workbook_id,
      source_workbook_version, source_award_manifest_id, source_quote_id, clone_kind
    ) values (
      created_workbook_id, p_organization_id, source_workbook.opportunity_id,
      source_workbook.project_id, created_quote.id, null, source_workbook.name,
      source_workbook.trade_package, source_workbook.sort_order, null,
      public.regenerate_worksheet_material_binding_ids(source_workbook.worksheet_data),
      source_workbook.pricing_summary, source_workbook.extracted_pricing_data,
      source_workbook.version, actor_user_id, actor_user_id, source_workbook.id,
      source_workbook.version, source_workbook.source_award_manifest_id, predecessor.id,
      'quote_revision'
    );
    for source_sheet in select * from public.opportunity_pricing_workbook_sheets sheet
      where sheet.organization_id = p_organization_id and sheet.workbook_id = source_workbook.id
    loop
      insert into public.opportunity_pricing_workbook_sheets (
        id, workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
        worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
      ) values (
        md5(created_quote.id::text || ':sheet:' || source_sheet.id::text)::uuid,
        created_workbook_id, p_organization_id, source_sheet.opportunity_id, source_sheet.name,
        source_sheet.sheet_order, source_sheet.is_default,
        public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data),
        source_sheet.pricing_summary, source_sheet.extracted_pricing_data,
        source_sheet.version, actor_user_id, actor_user_id
      );
    end loop;
    cloned_count := cloned_count + 1;
  end loop;

  update public.opportunity_quote_series
  set current_revision_id = created_quote.id
  where organization_id = p_organization_id and id = series.id;
  return query select series.id, created_quote.id, series.base_quote_number, next_revision, cloned_count;
end;
$$;

create or replace function public.select_opportunity_accepted_quote_revision_v1(
  p_organization_id uuid, p_opportunity_id uuid, p_quote_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id, 'leads.opportunities.write') then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  update public.organization_opportunities
  set accepted_quote_revision_id = p_quote_revision_id
  where organization_id = p_organization_id and id = p_opportunity_id;
  if not found then raise exception 'Opportunity was not found' using errcode = 'TS422'; end if;
  return p_quote_revision_id;
end;
$$;

create or replace function public.reject_issued_quote_revision_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('Sent', 'Accepted', 'Rejected', 'Expired') then
    if current_setting('tradesstack.conversion_opportunity_id', true) = old.originating_opportunity_id::text
      and (to_jsonb(new) - array['project_id','updated_at']::text[])
        = (to_jsonb(old) - array['project_id','updated_at']::text[])
    then return new; end if;
    -- Conversion may attach and award-lock the accepted row, but may not rewrite
    -- its commercial evidence.
    if old.status = 'Accepted' and new.status = old.status
      and (to_jsonb(new) - array['project_id','award_locked_at','award_locked_reason','pricing_basis_status','pricing_basis_checked_at','updated_at']::text[])
        = (to_jsonb(old) - array['project_id','award_locked_at','award_locked_reason','pricing_basis_status','pricing_basis_checked_at','updated_at']::text[])
    then return new; end if;
    raise exception 'Issued quote revisions are immutable; create a revision instead' using errcode = 'TS409';
  end if;
  return new;
end;
$$;

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
create trigger require_series_for_opportunity_quote_insert
before insert on public.project_quotes
for each row execute function public.require_series_for_opportunity_quote_insert();

create trigger reject_issued_quote_revision_mutation
before update on public.project_quotes
for each row execute function public.reject_issued_quote_revision_mutation();

create or replace function public.reject_issued_quote_revision_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('Sent', 'Accepted', 'Rejected', 'Expired') or old.predecessor_quote_id is not null
    or exists (select 1 from public.project_quotes child
      where child.organization_id = old.organization_id and child.predecessor_quote_id = old.id)
  then raise exception 'Issued or historical quote revisions cannot be deleted' using errcode = 'TS409'; end if;
  return old;
end;
$$;
create trigger reject_issued_quote_revision_delete
before delete on public.project_quotes
for each row execute function public.reject_issued_quote_revision_delete();

create or replace function public.reject_issued_quote_child_mutation()
returns trigger language plpgsql set search_path = public as $$
declare target_quote_id uuid; target_quote public.project_quotes%rowtype;
begin
  target_quote_id := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  select * into target_quote from public.project_quotes quote where quote.id = target_quote_id;
  if found and target_quote.status in ('Sent', 'Accepted', 'Rejected', 'Expired') then
    if tg_op = 'UPDATE'
      and current_setting('tradesstack.conversion_opportunity_id', true) = target_quote.originating_opportunity_id::text
      and (to_jsonb(new) - array['project_id','updated_at']::text[])
        = (to_jsonb(old) - array['project_id','updated_at']::text[])
    then return new; end if;
    raise exception 'Evidence belonging to an issued quote revision is immutable' using errcode = 'TS409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger reject_issued_quote_line_mutation
before insert or update or delete on public.project_quote_line_items
for each row execute function public.reject_issued_quote_child_mutation();

create or replace function public.reject_issued_quote_workbook_mutation()
returns trigger language plpgsql set search_path = public as $$
declare target_quote_id uuid;
begin
  target_quote_id := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  if target_quote_id is not null and exists (select 1 from public.project_quotes quote
    where quote.id = target_quote_id and quote.status in ('Sent','Accepted','Rejected','Expired'))
  then raise exception 'Worksheet evidence belonging to an issued quote revision is immutable' using errcode = 'TS409'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger reject_issued_quote_workbook_mutation
before update or delete on public.opportunity_pricing_worksheets
for each row execute function public.reject_issued_quote_workbook_mutation();

create or replace function public.reject_issued_quote_workbook_child_mutation()
returns trigger language plpgsql set search_path = public as $$
declare target_workbook_id uuid;
begin
  target_workbook_id := case when tg_op = 'DELETE' then old.workbook_id else new.workbook_id end;
  if exists (
    select 1 from public.opportunity_pricing_worksheets workbook
    join public.project_quotes quote
      on quote.organization_id = workbook.organization_id and quote.id = workbook.quote_id
    where workbook.id = target_workbook_id
      and quote.status in ('Sent','Accepted','Rejected','Expired')
  ) then
    raise exception 'Worksheet evidence belonging to an issued quote revision is immutable'
      using errcode = 'TS409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger reject_issued_quote_workbook_sheet_mutation
before insert or update or delete on public.opportunity_pricing_workbook_sheets
for each row execute function public.reject_issued_quote_workbook_child_mutation();
create trigger reject_issued_quote_material_binding_mutation
before insert or update or delete on public.worksheet_material_price_bindings
for each row execute function public.reject_issued_quote_workbook_child_mutation();

create or replace function public.reject_issued_quote_link_mutation()
returns trigger language plpgsql set search_path = public as $$
declare target record;
begin
  target := case when tg_op = 'DELETE' then old else new end;
  if target.document_kind = 'quote_line' and exists (select 1 from public.project_quotes quote
    where quote.id = target.document_id and quote.organization_id = target.organization_id
      and quote.status in ('Sent','Accepted','Rejected','Expired'))
  then raise exception 'Worksheet-source evidence belonging to an issued quote revision is immutable' using errcode = 'TS409'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger reject_issued_quote_link_mutation
before insert or update or delete on public.commercial_item_document_links
for each row execute function public.reject_issued_quote_link_mutation();

create or replace function public.get_opportunity_quote_register_v1(
  p_organization_id uuid, p_opportunity_id uuid
)
returns table (
  series_id uuid, base_quote_number text, recipient_client_id uuid, recipient_name text,
  current_revision_id uuid, revision_number integer, revision_count bigint, status text,
  total_quote_price numeric, quote_date date, expiry_date date, updated_at timestamptz,
  accepted_revision_id uuid, is_current_accepted boolean
)
language sql stable security invoker set search_path = public as $$
  select series.id, series.base_quote_number, series.recipient_client_id,
    coalesce(nullif(client.company_name, ''), client.name, 'Recipient reconciliation required'),
    current_quote.id, current_quote.revision_number,
    (select count(*) from public.project_quotes history
      where history.organization_id = series.organization_id and history.quote_series_id = series.id),
    current_quote.status, current_quote.total_quote_price, current_quote.quote_date,
    current_quote.expiry_date, current_quote.updated_at,
    opportunity.accepted_quote_revision_id,
    opportunity.accepted_quote_revision_id = current_quote.id
  from public.opportunity_quote_series series
  join public.organization_opportunities opportunity
    on opportunity.organization_id = series.organization_id and opportunity.id = series.opportunity_id
  join public.project_quotes current_quote
    on current_quote.organization_id = series.organization_id and current_quote.id = series.current_revision_id
  left join public.organization_clients client
    on client.organization_id = series.organization_id and client.id = series.recipient_client_id
  where series.organization_id = p_organization_id and series.opportunity_id = p_opportunity_id
    and series.archived_at is null
  order by series.updated_at desc, series.created_at desc;
$$;

create or replace function public.get_opportunity_quote_revision_history_v1(
  p_organization_id uuid, p_opportunity_id uuid, p_revision_id uuid
)
returns table (
  series_id uuid, base_quote_number text, recipient_client_id uuid, recipient_name text,
  current_revision_id uuid, revision_id uuid, revision_number integer, status text,
  total_quote_price numeric, quote_date date, expiry_date date, updated_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select series.id, series.base_quote_number, series.recipient_client_id,
    coalesce(nullif(client.company_name, ''), client.name, 'Recipient reconciliation required'),
    series.current_revision_id, history.id, history.revision_number, history.status,
    history.total_quote_price, history.quote_date, history.expiry_date, history.updated_at
  from public.project_quotes requested
  join public.opportunity_quote_series series
    on series.organization_id = requested.organization_id and series.id = requested.quote_series_id
  join public.project_quotes history
    on history.organization_id = series.organization_id and history.quote_series_id = series.id
  left join public.organization_clients client
    on client.organization_id = series.organization_id and client.id = series.recipient_client_id
  where requested.organization_id = p_organization_id
    and requested.originating_opportunity_id = p_opportunity_id and requested.id = p_revision_id
  order by history.revision_number desc, history.created_at desc;
$$;

-- Preserve the established lifecycle strategy engine, but put one commercial
-- authority gate in front of both its promotion and new-Project branches.
alter function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text)
  rename to award_opportunity_by_lifecycle_pre_quote_series_v1;

create or replace function public.award_opportunity_by_lifecycle_v1(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_accepted_quote_id uuid,
  p_correlation_id text
)
returns table (
  project_id uuid,
  project_slug text,
  project_created boolean,
  storage_clone_required boolean,
  lifecycle_strategy text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity public.organization_opportunities%rowtype;
  accepted public.project_quotes%rowtype;
  series public.opportunity_quote_series%rowtype;
  converted record;
begin
  select * into opportunity from public.organization_opportunities candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_opportunity_id
  for update;
  if not found or opportunity.accepted_quote_revision_id is distinct from p_accepted_quote_id then
    raise exception 'Conversion requires the explicitly selected accepted quote revision'
      using errcode = 'TS409';
  end if;
  select * into accepted from public.project_quotes quote
  where quote.organization_id = p_organization_id and quote.id = p_accepted_quote_id
    and quote.originating_opportunity_id = p_opportunity_id
    and quote.status = 'Accepted' and quote.quote_series_id is not null;
  if not found then raise exception 'Accepted quote revision is invalid for this Opportunity' using errcode = 'TS422'; end if;
  select * into series from public.opportunity_quote_series candidate
  where candidate.organization_id = p_organization_id and candidate.id = accepted.quote_series_id
    and candidate.opportunity_id = p_opportunity_id and candidate.recipient_client_id is not null;
  if not found then raise exception 'Accepted Quote Series recipient is unavailable' using errcode = 'TS422'; end if;

  perform set_config('tradesstack.conversion_opportunity_id', p_opportunity_id::text, true);
  select * into converted from public.award_opportunity_by_lifecycle_pre_quote_series_v1(
    p_organization_id, p_opportunity_id, p_accepted_quote_id, p_correlation_id
  );
  perform set_config('tradesstack.conversion_opportunity_id', '', true);
  update public.organization_projects project
  set client_id = series.recipient_client_id
  where project.organization_id = p_organization_id and project.id = converted.project_id
    and project.client_id is distinct from series.recipient_client_id;
  return query select converted.project_id, converted.project_slug, converted.project_created,
    converted.storage_clone_required, converted.lifecycle_strategy;
end;
$$;

alter table public.opportunity_quote_series enable row level security;
alter table public.opportunity_quote_series force row level security;
create policy "Members can view Opportunity Quote Series" on public.opportunity_quote_series
  for select to authenticated using (public.is_member_of_organization(organization_id));
create policy "Members can create Opportunity Quote Series" on public.opportunity_quote_series
  for insert to authenticated with check (created_by = auth.uid() and public.has_org_permission(organization_id, 'quotes.write'));
create policy "Members can update Opportunity Quote Series" on public.opportunity_quote_series
  for update to authenticated using (public.has_org_permission(organization_id, 'quotes.write'))
  with check (public.has_org_permission(organization_id, 'quotes.write'));

grant select on public.opportunity_quote_series to authenticated;
revoke all on function public.create_opportunity_quote_series_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_opportunity_quote_series_v1(uuid, uuid, uuid) to authenticated;
revoke all on function public.create_opportunity_quote_revision_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_opportunity_quote_revision_v1(uuid, uuid, uuid) to authenticated;
revoke all on function public.select_opportunity_accepted_quote_revision_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.select_opportunity_accepted_quote_revision_v1(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_opportunity_quote_register_v1(uuid, uuid) to authenticated;
grant execute on function public.get_opportunity_quote_revision_history_v1(uuid, uuid, uuid) to authenticated;
revoke all on function public.award_opportunity_by_lifecycle_pre_quote_series_v1(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.award_opportunity_by_lifecycle_v1(uuid, uuid, uuid, text) to authenticated;

commit;
