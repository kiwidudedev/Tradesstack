create table if not exists public.cost_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  source_document_kind text not null,
  source_document_id uuid not null,
  source_line_table text null,
  source_line_id uuid null,
  parent_cost_item_id uuid null references public.cost_items (id) on delete set null,
  origin_kind text not null default 'manual',
  source_snapshot jsonb not null default '{}'::jsonb,
  item_code text not null default '',
  item_type text not null default '',
  section text not null default '',
  category text not null default '',
  trade_id text null,
  trade_label text null,
  cost_code text not null default '',
  cost_type text not null default '',
  classification_confidence numeric null,
  needs_review boolean null,
  classification_source text null,
  confirmed_by_user_id uuid null references auth.users (id) on delete set null,
  confirmed_at timestamptz null,
  original_classification jsonb null,
  final_classification jsonb null,
  raw_description text null,
  normalized_description text null,
  project_type text null,
  building_type text null,
  sector text null,
  location_region text null,
  job_size text null,
  change_reason text null,
  change_type text null,
  supplier_id uuid null references public.organization_suppliers (id) on delete set null,
  supplier_name_snapshot text null,
  price_source text null,
  title text not null default '',
  description text not null default '',
  quantity numeric(14,3) not null default 0,
  unit text not null default '',
  unit_rate numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  is_optional boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'active',
  effective_from timestamptz not null default now(),
  effective_to timestamptz null,
  is_current boolean not null default true,
  source_revision_key text not null default '',
  source_fingerprint text not null default '',
  linked_quote_line_item_id uuid null references public.project_quote_line_items (id) on delete set null,
  linked_variation_line_item_id uuid null references public.project_variation_line_items (id) on delete set null,
  linked_purchase_order_line_item_id uuid null references public.project_purchase_order_line_items (id) on delete set null,
  linked_claim_line_item_id uuid null references public.project_claim_line_items (id) on delete set null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_items_source_document_kind_check check (
    source_document_kind in ('project_quote', 'project_variation', 'project_purchase_order', 'project_claim')
  ),
  constraint cost_items_source_line_table_check check (
    source_line_table is null
    or source_line_table in (
      'project_quote_line_items',
      'project_variation_line_items',
      'project_purchase_order_line_items',
      'project_claim_line_items'
    )
  ),
  constraint cost_items_origin_kind_check check (
    origin_kind in ('manual', 'scope_import', 'purchase_order_import', 'time_sheet_sync', 'claim_snapshot', 'system')
  ),
  constraint cost_items_classification_confidence_range_check check (
    classification_confidence is null
    or (classification_confidence >= 0 and classification_confidence <= 1)
  ),
  constraint cost_items_classification_source_check check (
    classification_source is null
    or classification_source in ('rules', 'user_confirmed', 'ai', 'imported')
  ),
  constraint cost_items_status_check check (
    status in ('active', 'superseded', 'deleted', 'snapshot')
  ),
  constraint cost_items_original_classification_object_check check (
    original_classification is null
    or jsonb_typeof(original_classification) = 'object'
  ),
  constraint cost_items_final_classification_object_check check (
    final_classification is null
    or jsonb_typeof(final_classification) = 'object'
  ),
  constraint cost_items_change_type_check check (
    change_type is null
    or change_type in ('client_change', 'scope_gap', 'design_change', 'site_condition', 'error', 'price_increase')
  ),
  constraint cost_items_price_source_check check (
    price_source is null
    or price_source in ('manual', 'supplier_quote', 'catalogue', 'historical', 'ai_estimate')
  ),
  constraint cost_items_snapshot_object_check check (jsonb_typeof(source_snapshot) = 'object'),
  constraint cost_items_effective_window_check check (effective_to is null or effective_to >= effective_from),
  constraint cost_items_single_live_link_check check (
    num_nonnulls(
      linked_quote_line_item_id,
      linked_variation_line_item_id,
      linked_purchase_order_line_item_id,
      linked_claim_line_item_id
    ) <= 1
  )
);

alter table public.cost_items
  add column if not exists classification_confidence numeric null,
  add column if not exists needs_review boolean null,
  add column if not exists classification_source text null,
  add column if not exists confirmed_by_user_id uuid null references auth.users (id) on delete set null,
  add column if not exists confirmed_at timestamptz null,
  add column if not exists original_classification jsonb null,
  add column if not exists final_classification jsonb null,
  add column if not exists raw_description text null,
  add column if not exists normalized_description text null,
  add column if not exists project_type text null,
  add column if not exists building_type text null,
  add column if not exists sector text null,
  add column if not exists location_region text null,
  add column if not exists job_size text null,
  add column if not exists change_reason text null,
  add column if not exists change_type text null,
  add column if not exists supplier_id uuid null references public.organization_suppliers (id) on delete set null,
  add column if not exists supplier_name_snapshot text null,
  add column if not exists price_source text null;

alter table public.cost_items
  drop constraint if exists cost_items_classification_confidence_range_check,
  drop constraint if exists cost_items_classification_source_check,
  drop constraint if exists cost_items_original_classification_object_check,
  drop constraint if exists cost_items_final_classification_object_check,
  drop constraint if exists cost_items_change_type_check,
  drop constraint if exists cost_items_price_source_check;

alter table public.cost_items
  add constraint cost_items_classification_confidence_range_check check (
    classification_confidence is null
    or (classification_confidence >= 0 and classification_confidence <= 1)
  ),
  add constraint cost_items_classification_source_check check (
    classification_source is null
    or classification_source in ('rules', 'user_confirmed', 'ai', 'imported')
  ),
  add constraint cost_items_original_classification_object_check check (
    original_classification is null
    or jsonb_typeof(original_classification) = 'object'
  ),
  add constraint cost_items_final_classification_object_check check (
    final_classification is null
    or jsonb_typeof(final_classification) = 'object'
  ),
  add constraint cost_items_change_type_check check (
    change_type is null
    or change_type in ('client_change', 'scope_gap', 'design_change', 'site_condition', 'error', 'price_increase')
  ),
  add constraint cost_items_price_source_check check (
    price_source is null
    or price_source in ('manual', 'supplier_quote', 'catalogue', 'historical', 'ai_estimate')
  );

create index if not exists cost_items_org_project_document_current_idx
  on public.cost_items (organization_id, project_id, source_document_kind, source_document_id, is_current);

create index if not exists cost_items_document_revision_idx
  on public.cost_items (source_document_kind, source_document_id, source_revision_key);

create index if not exists cost_items_document_fingerprint_idx
  on public.cost_items (source_document_kind, source_document_id, source_fingerprint);

create index if not exists cost_items_classification_confidence_idx
  on public.cost_items (classification_confidence)
  where classification_confidence is not null;

create index if not exists cost_items_needs_review_idx
  on public.cost_items (needs_review)
  where needs_review is not null;

create index if not exists cost_items_classification_source_idx
  on public.cost_items (classification_source)
  where classification_source is not null;

create index if not exists cost_items_project_context_idx
  on public.cost_items (project_type, sector, location_region)
  where project_type is not null or sector is not null or location_region is not null;

create index if not exists cost_items_parent_idx
  on public.cost_items (parent_cost_item_id)
  where parent_cost_item_id is not null;

create index if not exists cost_items_source_line_idx
  on public.cost_items (source_line_table, source_line_id)
  where source_line_table is not null and source_line_id is not null;

create index if not exists cost_items_quote_link_idx
  on public.cost_items (linked_quote_line_item_id)
  where linked_quote_line_item_id is not null;

create index if not exists cost_items_variation_link_idx
  on public.cost_items (linked_variation_line_item_id)
  where linked_variation_line_item_id is not null;

create index if not exists cost_items_purchase_order_link_idx
  on public.cost_items (linked_purchase_order_line_item_id)
  where linked_purchase_order_line_item_id is not null;

create index if not exists cost_items_claim_link_idx
  on public.cost_items (linked_claim_line_item_id)
  where linked_claim_line_item_id is not null;

create index if not exists cost_items_supplier_id_idx
  on public.cost_items (supplier_id)
  where supplier_id is not null;

create index if not exists cost_items_price_source_idx
  on public.cost_items (price_source)
  where price_source is not null;

create unique index if not exists cost_items_revision_line_unique_idx
  on public.cost_items (source_document_kind, source_document_id, source_revision_key, source_line_table, source_line_id)
  where source_line_table is not null and source_line_id is not null;

drop trigger if exists set_cost_items_updated_at on public.cost_items;
create trigger set_cost_items_updated_at
before update on public.cost_items
for each row execute function public.set_updated_at();

alter table public.cost_items enable row level security;

drop policy if exists "Members can view cost items" on public.cost_items;
create policy "Members can view cost items"
on public.cost_items
for select
to authenticated
using (public.is_member_of_organization(cost_items.organization_id));

grant select on public.cost_items to authenticated;

create or replace function public.compute_cost_item_source_fingerprint(
  p_source_document_kind text,
  p_source_line_table text,
  p_section text,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_unit_rate numeric,
  p_line_total numeric,
  p_is_optional boolean,
  p_sort_order integer,
  p_identity_a text default '',
  p_identity_b text default ''
)
returns text
language sql
immutable
as $$
  select md5(
    concat_ws(
      '|',
      lower(regexp_replace(btrim(coalesce(p_source_document_kind, '')), '\s+', ' ', 'g')),
      lower(regexp_replace(btrim(coalesce(p_source_line_table, '')), '\s+', ' ', 'g')),
      lower(regexp_replace(btrim(coalesce(p_section, '')), '\s+', ' ', 'g')),
      lower(regexp_replace(btrim(coalesce(p_description, '')), '\s+', ' ', 'g')),
      to_char(round(coalesce(p_quantity, 0), 3), 'FM999999999999990D000'),
      lower(regexp_replace(btrim(coalesce(p_unit, '')), '\s+', ' ', 'g')),
      to_char(round(coalesce(p_unit_rate, 0), 2), 'FM999999999999990D00'),
      to_char(round(coalesce(p_line_total, 0), 2), 'FM999999999999990D00'),
      case when coalesce(p_is_optional, false) then '1' else '0' end,
      coalesce(p_sort_order, 0)::text,
      lower(regexp_replace(btrim(coalesce(p_identity_a, '')), '\s+', ' ', 'g')),
      lower(regexp_replace(btrim(coalesce(p_identity_b, '')), '\s+', ' ', 'g'))
    )
  );
$$;

create or replace function public.resolve_cost_item_document_context(
  p_document_kind text,
  p_document_id uuid
)
returns table (
  organization_id uuid,
  project_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_document_kind = 'project_quote' then
    return query
    select q.organization_id, q.project_id
    from public.project_quotes q
    where q.id = p_document_id
      and public.has_org_permission(q.organization_id, 'quotes.write');
    return;
  end if;

  if p_document_kind = 'project_variation' then
    return query
    select v.organization_id, v.project_id
    from public.project_variations v
    where v.id = p_document_id
      and public.has_org_permission(v.organization_id, 'variations.write');
    return;
  end if;

  if p_document_kind = 'project_purchase_order' then
    return query
    select po.organization_id, po.project_id
    from public.project_purchase_orders po
    where po.id = p_document_id
      and public.has_org_permission(po.organization_id, 'purchase_orders.write');
    return;
  end if;

  if p_document_kind = 'project_claim' then
    return query
    select c.organization_id, c.project_id
    from public.project_claims c
    where c.id = p_document_id
      and public.is_member_of_organization(c.organization_id);
    return;
  end if;

  raise exception 'Unsupported CostItem document kind: %', p_document_kind;
end;
$$;

create or replace function public.begin_cost_item_revision(
  p_document_kind text,
  p_document_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_context record;
begin
  select *
  into resolved_context
  from public.resolve_cost_item_document_context(p_document_kind, p_document_id)
  limit 1;

  if resolved_context.organization_id is null then
    raise exception 'Document not found or not authorized for CostItem revision';
  end if;

  return lower(p_document_kind)
    || ':'
    || p_document_id::text
    || ':'
    || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS')
    || ':'
    || replace(gen_random_uuid()::text, '-', '');
end;
$$;

create or replace function public.supersede_previous_cost_items(
  p_document_kind text,
  p_document_id uuid,
  p_source_revision_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_context record;
  affected_count integer := 0;
begin
  select *
  into resolved_context
  from public.resolve_cost_item_document_context(p_document_kind, p_document_id)
  limit 1;

  if resolved_context.organization_id is null then
    raise exception 'Document not found or not authorized for CostItem supersede';
  end if;

  update public.cost_items ci
  set
    is_current = false,
    effective_to = coalesce(ci.effective_to, clock_timestamp()),
    status = case
      when ci.status = 'deleted' then ci.status
      else 'superseded'
    end
  where ci.source_document_kind = p_document_kind
    and ci.source_document_id = p_document_id
    and ci.is_current = true
    and ci.source_revision_key is distinct from p_source_revision_key;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

create or replace function public.upsert_cost_items_for_document(
  p_document_kind text,
  p_document_id uuid,
  p_source_revision_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_context record;
  rows_written integer := 0;
  missing_parent_count integer := 0;
begin
  select *
  into resolved_context
  from public.resolve_cost_item_document_context(p_document_kind, p_document_id)
  limit 1;

  if resolved_context.organization_id is null then
    raise exception 'Document not found or not authorized for CostItem mirror write';
  end if;

  delete from public.cost_items ci
  where ci.source_document_kind = p_document_kind
    and ci.source_document_id = p_document_id
    and ci.source_revision_key = p_source_revision_key;

  if p_document_kind = 'project_quote' then
    select count(*)
    into missing_parent_count
    from public.project_quote_line_items li
    where li.organization_id = resolved_context.organization_id
      and li.project_id = resolved_context.project_id
      and li.quote_id = p_document_id
      and li.source_opportunity_quote_line_item_id is not null
      and not exists (
        select 1
        from public.cost_items oci
        where oci.source_document_kind = 'opportunity_quote'
          and oci.source_document_id = li.source_opportunity_quote_id
          and oci.is_current = true
          and oci.linked_opportunity_quote_line_item_id = li.source_opportunity_quote_line_item_id
      );

    if missing_parent_count > 0 then
      raise exception 'Cannot mirror project quote CostItems: one or more converted quote lines have no matching current opportunity baseline CostItem';
    end if;

    with current_lines as (
      select
        q.organization_id,
        q.project_id,
        q.id as document_id,
        q.quote_number as document_number,
        q.quote_title as document_title,
        q.source_opportunity_id,
        q.source_opportunity_quote_id,
        q.source_opportunity_quote_number,
        li.id as line_item_id,
        li.section,
        li.description,
        li.quantity,
        li.unit,
        li.rate as unit_rate,
        coalesce(li.total, round(li.quantity * li.rate, 2)) as line_total,
        coalesce(li.is_optional, false) as is_optional,
        li.sort_order,
        li.source_opportunity_quote_id as source_quote_id,
        li.source_opportunity_quote_line_item_id as source_line_item_id,
        li.source_opportunity_quote_number as source_quote_number,
        public.compute_cost_item_source_fingerprint(
          'project_quote',
          'project_quote_line_items',
          li.section,
          li.description,
          li.quantity,
          li.unit,
          li.rate,
          coalesce(li.total, round(li.quantity * li.rate, 2)),
          coalesce(li.is_optional, false),
          li.sort_order,
          coalesce(li.source_opportunity_quote_line_item_id::text, ''),
          coalesce(li.source_opportunity_quote_number, '')
        ) as source_fingerprint
      from public.project_quotes q
      join public.project_quote_line_items li
        on li.organization_id = q.organization_id
       and li.project_id = q.project_id
       and li.quote_id = q.id
      where q.id = p_document_id
        and q.organization_id = resolved_context.organization_id
        and q.project_id = resolved_context.project_id
    )
    insert into public.cost_items (
      organization_id,
      project_id,
      source_document_kind,
      source_document_id,
      source_line_table,
      source_line_id,
      parent_cost_item_id,
      origin_kind,
      source_snapshot,
      item_code,
      item_type,
      section,
      category,
      trade_id,
      trade_label,
      cost_code,
      cost_type,
      title,
      description,
      quantity,
      unit,
      unit_rate,
      line_total,
      is_optional,
      sort_order,
      status,
      effective_from,
      effective_to,
      is_current,
      source_revision_key,
      source_fingerprint,
      linked_quote_line_item_id,
      linked_variation_line_item_id,
      linked_purchase_order_line_item_id,
      linked_claim_line_item_id,
      created_by
    )
    select
      cl.organization_id,
      cl.project_id,
      'project_quote',
      cl.document_id,
      'project_quote_line_items',
      cl.line_item_id,
      coalesce(oci.id, prev.id),
      'manual',
      jsonb_build_object(
        'document_kind', 'project_quote',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'source_opportunity_id', cl.source_opportunity_id,
        'source_opportunity_quote_id', cl.source_opportunity_quote_id,
        'source_opportunity_quote_number', cl.source_opportunity_quote_number,
        'source_opportunity_quote_line_item_id', cl.source_line_item_id,
        'line_item_id', cl.line_item_id,
        'section', cl.section,
        'is_optional', cl.is_optional
      ),
      '',
      'line_item',
      cl.section,
      cl.section,
      null,
      null,
      '',
      '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled line item'),
      coalesce(cl.description, ''),
      cl.quantity,
      cl.unit,
      cl.unit_rate,
      cl.line_total,
      cl.is_optional,
      cl.sort_order,
      'active',
      clock_timestamp(),
      null,
      true,
      p_source_revision_key,
      cl.source_fingerprint,
      cl.line_item_id,
      null,
      null,
      null,
      auth.uid()
    from current_lines cl
    left join public.cost_items oci
      on oci.source_document_kind = 'opportunity_quote'
     and oci.source_document_id = cl.source_quote_id
     and oci.is_current = true
     and oci.linked_opportunity_quote_line_item_id = cl.source_line_item_id
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.source_document_kind = 'project_quote'
        and ci.source_document_id = cl.document_id
        and ci.source_revision_key <> p_source_revision_key
        and ci.source_fingerprint = cl.source_fingerprint
      order by ci.effective_from desc, ci.created_at desc
      limit 1
    ) prev on true;

    get diagnostics rows_written = row_count;
    return rows_written;
  end if;

  if p_document_kind = 'project_variation' then
    with current_lines as (
      select
        v.organization_id,
        v.project_id,
        v.id as document_id,
        v.variation_number as document_number,
        v.variation_title as document_title,
        li.id as line_item_id,
        li.section,
        li.description,
        li.quantity,
        li.unit,
        li.rate as unit_rate,
        coalesce(li.total, round(li.quantity * li.rate, 2)) as line_total,
        li.sort_order,
        li.source_purchase_order_id,
        li.source_purchase_order_line_item_id,
        li.source_purchase_order_number,
        public.compute_cost_item_source_fingerprint(
          'project_variation',
          'project_variation_line_items',
          li.section,
          li.description,
          li.quantity,
          li.unit,
          li.rate,
          coalesce(li.total, round(li.quantity * li.rate, 2)),
          false,
          li.sort_order,
          coalesce(li.source_purchase_order_line_item_id::text, ''),
          coalesce(li.source_purchase_order_number, '')
        ) as source_fingerprint
      from public.project_variations v
      join public.project_variation_line_items li
        on li.organization_id = v.organization_id
       and li.project_id = v.project_id
       and li.variation_id = v.id
      where v.id = p_document_id
        and v.organization_id = resolved_context.organization_id
        and v.project_id = resolved_context.project_id
    )
    insert into public.cost_items (
      organization_id,
      project_id,
      source_document_kind,
      source_document_id,
      source_line_table,
      source_line_id,
      parent_cost_item_id,
      origin_kind,
      source_snapshot,
      item_code,
      item_type,
      section,
      category,
      trade_id,
      trade_label,
      cost_code,
      cost_type,
      title,
      description,
      quantity,
      unit,
      unit_rate,
      line_total,
      is_optional,
      sort_order,
      status,
      effective_from,
      effective_to,
      is_current,
      source_revision_key,
      source_fingerprint,
      linked_quote_line_item_id,
      linked_variation_line_item_id,
      linked_purchase_order_line_item_id,
      linked_claim_line_item_id,
      created_by
    )
    select
      cl.organization_id,
      cl.project_id,
      'project_variation',
      cl.document_id,
      'project_variation_line_items',
      cl.line_item_id,
      prev.id,
      case
        when cl.source_purchase_order_line_item_id is not null then 'purchase_order_import'
        else 'manual'
      end,
      jsonb_build_object(
        'document_kind', 'project_variation',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'line_item_id', cl.line_item_id,
        'source_purchase_order_id', cl.source_purchase_order_id,
        'source_purchase_order_line_item_id', cl.source_purchase_order_line_item_id,
        'source_purchase_order_number', cl.source_purchase_order_number
      ),
      '',
      'line_item',
      cl.section,
      cl.section,
      null,
      null,
      '',
      '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled line item'),
      coalesce(cl.description, ''),
      cl.quantity,
      cl.unit,
      cl.unit_rate,
      cl.line_total,
      false,
      cl.sort_order,
      'active',
      clock_timestamp(),
      null,
      true,
      p_source_revision_key,
      cl.source_fingerprint,
      null,
      cl.line_item_id,
      null,
      null,
      auth.uid()
    from current_lines cl
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.source_document_kind = 'project_variation'
        and ci.source_document_id = cl.document_id
        and ci.source_revision_key <> p_source_revision_key
        and ci.linked_variation_line_item_id = cl.line_item_id
      order by ci.effective_from desc, ci.created_at desc
      limit 1
    ) prev on true;

    get diagnostics rows_written = row_count;
    return rows_written;
  end if;

  if p_document_kind = 'project_purchase_order' then
    with current_lines as (
      select
        po.organization_id,
        po.project_id,
        po.id as document_id,
        po.purchase_order_number as document_number,
        po.purchase_order_title as document_title,
        po.supplier_id,
        po.issued_to_label,
        li.id as line_item_id,
        li.section,
        li.description,
        li.quantity,
        li.unit,
        li.rate as unit_rate,
        coalesce(li.total, round(li.quantity * li.rate, 2)) as line_total,
        li.sort_order,
        li.source_time_sheet_entry_id,
        public.compute_cost_item_source_fingerprint(
          'project_purchase_order',
          'project_purchase_order_line_items',
          li.section,
          li.description,
          li.quantity,
          li.unit,
          li.rate,
          coalesce(li.total, round(li.quantity * li.rate, 2)),
          false,
          li.sort_order,
          coalesce(li.source_time_sheet_entry_id::text, ''),
          ''
        ) as source_fingerprint
      from public.project_purchase_orders po
      join public.project_purchase_order_line_items li
        on li.organization_id = po.organization_id
       and li.project_id = po.project_id
       and li.purchase_order_id = po.id
      where po.id = p_document_id
        and po.organization_id = resolved_context.organization_id
        and po.project_id = resolved_context.project_id
    )
    insert into public.cost_items (
      organization_id,
      project_id,
      source_document_kind,
      source_document_id,
      source_line_table,
      source_line_id,
      parent_cost_item_id,
      origin_kind,
      source_snapshot,
      item_code,
      item_type,
      section,
      category,
      trade_id,
      trade_label,
      cost_code,
      cost_type,
      title,
      description,
      quantity,
      unit,
      unit_rate,
      line_total,
      is_optional,
      sort_order,
      status,
      effective_from,
      effective_to,
      is_current,
      source_revision_key,
      source_fingerprint,
      linked_quote_line_item_id,
      linked_variation_line_item_id,
      linked_purchase_order_line_item_id,
      linked_claim_line_item_id,
      created_by
    )
    select
      cl.organization_id,
      cl.project_id,
      'project_purchase_order',
      cl.document_id,
      'project_purchase_order_line_items',
      cl.line_item_id,
      prev.id,
      case
        when cl.source_time_sheet_entry_id is not null then 'time_sheet_sync'
        else 'manual'
      end,
      jsonb_build_object(
        'document_kind', 'project_purchase_order',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'line_item_id', cl.line_item_id,
        'supplier_id', cl.supplier_id,
        'issued_to_label', cl.issued_to_label,
        'source_time_sheet_entry_id', cl.source_time_sheet_entry_id
      ),
      '',
      'line_item',
      cl.section,
      cl.section,
      null,
      null,
      '',
      '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled line item'),
      coalesce(cl.description, ''),
      cl.quantity,
      cl.unit,
      cl.unit_rate,
      cl.line_total,
      false,
      cl.sort_order,
      'active',
      clock_timestamp(),
      null,
      true,
      p_source_revision_key,
      cl.source_fingerprint,
      null,
      null,
      cl.line_item_id,
      null,
      auth.uid()
    from current_lines cl
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.source_document_kind = 'project_purchase_order'
        and ci.source_document_id = cl.document_id
        and ci.source_revision_key <> p_source_revision_key
        and ci.source_fingerprint = cl.source_fingerprint
      order by ci.effective_from desc, ci.created_at desc
      limit 1
    ) prev on true;

    get diagnostics rows_written = row_count;
    return rows_written;
  end if;

  if p_document_kind = 'project_claim' then
    with current_lines as (
      select
        c.organization_id,
        c.project_id,
        c.id as document_id,
        c.claim_number as document_number,
        c.claim_title as document_title,
        cli.id as claim_line_item_id,
        cli.source_kind,
        cli.source_document_id,
        cli.source_line_item_id,
        cli.source_number,
        cli.source_title,
        cli.section,
        cli.description,
        cli.quantity,
        cli.unit,
        cli.rate as unit_rate,
        cli.source_total,
        cli.previously_claimed_amount,
        cli.previously_claimed_percent,
        cli.claim_percent,
        cli.claim_amount,
        cli.cumulative_claimed_amount,
        cli.cumulative_claimed_percent,
        cli.sort_order,
        public.compute_cost_item_source_fingerprint(
          'project_claim',
          'project_claim_line_items',
          cli.section,
          cli.description,
          cli.quantity,
          cli.unit,
          cli.rate,
          cli.claim_amount,
          false,
          cli.sort_order,
          cli.source_kind,
          cli.source_line_item_id::text
        ) as source_fingerprint
      from public.project_claims c
      join public.project_claim_line_items cli
        on cli.organization_id = c.organization_id
       and cli.project_id = c.project_id
       and cli.claim_id = c.id
      where c.id = p_document_id
        and c.organization_id = resolved_context.organization_id
        and c.project_id = resolved_context.project_id
    )
    insert into public.cost_items (
      organization_id,
      project_id,
      source_document_kind,
      source_document_id,
      source_line_table,
      source_line_id,
      parent_cost_item_id,
      origin_kind,
      source_snapshot,
      item_code,
      item_type,
      section,
      category,
      trade_id,
      trade_label,
      cost_code,
      cost_type,
      title,
      description,
      quantity,
      unit,
      unit_rate,
      line_total,
      is_optional,
      sort_order,
      status,
      effective_from,
      effective_to,
      is_current,
      source_revision_key,
      source_fingerprint,
      linked_quote_line_item_id,
      linked_variation_line_item_id,
      linked_purchase_order_line_item_id,
      linked_claim_line_item_id,
      created_by
    )
    select
      cl.organization_id,
      cl.project_id,
      'project_claim',
      cl.document_id,
      'project_claim_line_items',
      cl.claim_line_item_id,
      prev.id,
      'claim_snapshot',
      jsonb_build_object(
        'document_kind', 'project_claim',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'claim_line_item_id', cl.claim_line_item_id,
        'source_kind', cl.source_kind,
        'source_document_id', cl.source_document_id,
        'source_line_item_id', cl.source_line_item_id,
        'source_number', cl.source_number,
        'source_title', cl.source_title,
        'source_total', cl.source_total,
        'previously_claimed_amount', cl.previously_claimed_amount,
        'previously_claimed_percent', cl.previously_claimed_percent,
        'claim_percent', cl.claim_percent,
        'claim_amount', cl.claim_amount,
        'cumulative_claimed_amount', cl.cumulative_claimed_amount,
        'cumulative_claimed_percent', cl.cumulative_claimed_percent
      ),
      '',
      'claim_snapshot',
      cl.section,
      cl.section,
      null,
      null,
      '',
      '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled claim line item'),
      coalesce(cl.description, ''),
      cl.quantity,
      cl.unit,
      cl.unit_rate,
      cl.claim_amount,
      false,
      cl.sort_order,
      'snapshot',
      clock_timestamp(),
      null,
      true,
      p_source_revision_key,
      cl.source_fingerprint,
      null,
      null,
      null,
      cl.claim_line_item_id,
      auth.uid()
    from current_lines cl
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.source_document_kind = 'project_claim'
        and ci.source_document_id = cl.document_id
        and ci.source_revision_key <> p_source_revision_key
        and ci.linked_claim_line_item_id = cl.claim_line_item_id
      order by ci.effective_from desc, ci.created_at desc
      limit 1
    ) prev on true;

    get diagnostics rows_written = row_count;
    return rows_written;
  end if;

  raise exception 'Unsupported CostItem document kind for mirror write: %', p_document_kind;
end;
$$;

grant execute on function public.begin_cost_item_revision(text, uuid) to authenticated;
grant execute on function public.supersede_previous_cost_items(text, uuid, text) to authenticated;
grant execute on function public.upsert_cost_items_for_document(text, uuid, text) to authenticated;

create or replace function public.save_project_quote_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_quote_id uuid,
  p_expected_updated_at timestamptz,
  p_quote_title text,
  p_quote_number text,
  p_client_name text,
  p_company_name text,
  p_contact_person text,
  p_client_email text,
  p_client_phone text,
  p_site_address text,
  p_project_name text,
  p_quote_date date,
  p_expiry_date date,
  p_status text,
  p_optional_items_notes text,
  p_scope_exclusions text,
  p_assumptions text,
  p_scope_notes text,
  p_margin_percent numeric,
  p_discount_amount numeric,
  p_contingency_amount numeric,
  p_gst_percent numeric,
  p_validity_period text,
  p_payment_terms text,
  p_retention_percent_default numeric,
  p_lead_time text,
  p_terms_inclusions text,
  p_terms_exclusions text,
  p_clarifications text,
  p_acceptance_notes text,
  p_line_items jsonb
)
returns table (
  id uuid,
  updated_at timestamptz,
  subtotal numeric,
  optional_subtotal numeric,
  gst_amount numeric,
  total_quote_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_quotes%rowtype;
  saved_row public.project_quotes%rowtype;
  computed_subtotal numeric := 0;
  computed_optional_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst numeric := 0;
  computed_grand_total numeric := 0;
  resolved_retention_percent_default numeric := 0;
  saved_status text := 'Draft';
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  if coalesce(nullif(btrim(p_quote_title), ''), '') = '' then
    raise exception 'Quote title is required';
  end if;

  if coalesce(nullif(btrim(p_quote_number), ''), '') = '' then
    raise exception 'Quote number is required';
  end if;

  select
    coalesce(sum(
      case
        when coalesce((line.item->>'isOptional')::boolean, false) then 0
        else round(
          coalesce(nullif(line.item->>'quantity', '')::numeric, 0)
          * coalesce(nullif(line.item->>'rate', '')::numeric, 0),
          2
        )
      end
    ), 0),
    coalesce(sum(
      case
        when coalesce((line.item->>'isOptional')::boolean, false) then round(
          coalesce(nullif(line.item->>'quantity', '')::numeric, 0)
          * coalesce(nullif(line.item->>'rate', '')::numeric, 0),
          2
        )
        else 0
      end
    ), 0)
  into computed_subtotal, computed_optional_subtotal
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(
    0,
    computed_subtotal + computed_margin + computed_contingency - computed_discount
  );
  computed_gst := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst;
  resolved_retention_percent_default := greatest(
    0,
    least(100, coalesce(p_retention_percent_default, 0))
  );

  if p_quote_id is not null then
    select *
    into existing_row
    from public.project_quotes q
    where q.id = p_quote_id
      and q.organization_id = p_organization_id
      and q.project_id = p_project_id
    for update;

    if not found then
      raise exception 'Quote not found';
    end if;

    if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
      raise exception 'This quote was updated by another user. Refresh and try again.'
        using errcode = '40001';
    end if;

    update public.project_quotes q
    set
      quote_title = btrim(p_quote_title),
      quote_number = btrim(p_quote_number),
      client_name = coalesce(p_client_name, ''),
      company_name = coalesce(p_company_name, ''),
      contact_person = coalesce(p_contact_person, ''),
      client_email = coalesce(p_client_email, ''),
      client_phone = coalesce(p_client_phone, ''),
      site_address = coalesce(p_site_address, ''),
      project_name = coalesce(p_project_name, ''),
      quote_date = p_quote_date,
      expiry_date = p_expiry_date,
      status = case
        when p_status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then p_status
        else q.status
      end,
      optional_items_notes = coalesce(p_optional_items_notes, ''),
      scope_exclusions = coalesce(p_scope_exclusions, ''),
      assumptions = coalesce(p_assumptions, ''),
      scope_notes = coalesce(p_scope_notes, ''),
      subtotal = round(computed_subtotal, 2),
      optional_subtotal = round(computed_optional_subtotal, 2),
      margin_percent = round(coalesce(p_margin_percent, 0), 3),
      margin_amount = round(computed_margin, 2),
      discount_amount = round(coalesce(p_discount_amount, 0), 2),
      contingency_amount = round(coalesce(p_contingency_amount, 0), 2),
      gst_percent = round(coalesce(p_gst_percent, 0), 3),
      gst_amount = round(computed_gst, 2),
      total_quote_price = round(computed_grand_total, 2),
      validity_period = coalesce(p_validity_period, ''),
      payment_terms = coalesce(p_payment_terms, ''),
      retention_percent_default = round(resolved_retention_percent_default, 3),
      lead_time = coalesce(p_lead_time, ''),
      terms_inclusions = coalesce(p_terms_inclusions, ''),
      terms_exclusions = coalesce(p_terms_exclusions, ''),
      clarifications = coalesce(p_clarifications, ''),
      acceptance_notes = coalesce(p_acceptance_notes, '')
    where q.id = p_quote_id
      and q.organization_id = p_organization_id
      and q.project_id = p_project_id
    returning * into saved_row;
  else
    saved_status := case
      when p_status in ('Draft', 'Ready to Send', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired') then p_status
      else 'Draft'
    end;

    insert into public.project_quotes (
      organization_id,
      project_id,
      created_by,
      quote_title,
      quote_number,
      client_name,
      company_name,
      contact_person,
      client_email,
      client_phone,
      site_address,
      project_name,
      quote_date,
      expiry_date,
      status,
      optional_items_notes,
      scope_exclusions,
      assumptions,
      scope_notes,
      subtotal,
      optional_subtotal,
      margin_percent,
      margin_amount,
      discount_amount,
      contingency_amount,
      gst_percent,
      gst_amount,
      total_quote_price,
      validity_period,
      payment_terms,
      retention_percent_default,
      lead_time,
      terms_inclusions,
      terms_exclusions,
      clarifications,
      acceptance_notes
    ) values (
      p_organization_id,
      p_project_id,
      auth.uid(),
      btrim(p_quote_title),
      btrim(p_quote_number),
      coalesce(p_client_name, ''),
      coalesce(p_company_name, ''),
      coalesce(p_contact_person, ''),
      coalesce(p_client_email, ''),
      coalesce(p_client_phone, ''),
      coalesce(p_site_address, ''),
      coalesce(p_project_name, ''),
      p_quote_date,
      p_expiry_date,
      saved_status,
      coalesce(p_optional_items_notes, ''),
      coalesce(p_scope_exclusions, ''),
      coalesce(p_assumptions, ''),
      coalesce(p_scope_notes, ''),
      round(computed_subtotal, 2),
      round(computed_optional_subtotal, 2),
      round(coalesce(p_margin_percent, 0), 3),
      round(computed_margin, 2),
      round(coalesce(p_discount_amount, 0), 2),
      round(coalesce(p_contingency_amount, 0), 2),
      round(coalesce(p_gst_percent, 0), 3),
      round(computed_gst, 2),
      round(computed_grand_total, 2),
      coalesce(p_validity_period, ''),
      coalesce(p_payment_terms, ''),
      round(resolved_retention_percent_default, 3),
      coalesce(p_lead_time, ''),
      coalesce(p_terms_inclusions, ''),
      coalesce(p_terms_exclusions, ''),
      coalesce(p_clarifications, ''),
      coalesce(p_acceptance_notes, '')
    )
    returning * into saved_row;
  end if;

  delete from public.project_quote_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.quote_id = saved_row.id;

  insert into public.project_quote_line_items (
    id,
    organization_id,
    project_id,
    quote_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    is_optional,
    sort_order,
    source_opportunity_quote_id,
    source_opportunity_quote_line_item_id,
    source_opportunity_quote_number
  )
  select
    case
      when nullif(line.item->>'id', '') is not null then (line.item->>'id')::uuid
      else gen_random_uuid()
    end,
    p_organization_id,
    p_project_id,
    saved_row.id,
    case
      when line.item->>'section' in ('Item', 'Materials', 'Labour', 'Plant', 'Subcontractors', 'Preliminaries') then line.item->>'section'
      else 'Labour'
    end,
    coalesce(line.item->>'description', ''),
    coalesce(nullif(line.item->>'quantity', '')::numeric, 0),
    coalesce(line.item->>'unit', ''),
    coalesce(nullif(line.item->>'rate', '')::numeric, 0),
    round(
      coalesce(nullif(line.item->>'quantity', '')::numeric, 0)
      * coalesce(nullif(line.item->>'rate', '')::numeric, 0),
      2
    ),
    coalesce((line.item->>'isOptional')::boolean, false),
    row_number() over (),
    case
      when nullif(line.item->>'sourceOpportunityQuoteId', '') is not null then (line.item->>'sourceOpportunityQuoteId')::uuid
      else null
    end,
    case
      when nullif(line.item->>'sourceOpportunityQuoteLineItemId', '') is not null then (line.item->>'sourceOpportunityQuoteLineItemId')::uuid
      else null
    end,
    nullif(line.item->>'sourceOpportunityQuoteNumber', '')
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  -- CostItem dual-write (parallel layer only): mirror the persisted quote rows
  -- after all existing quote and quote-line writes have completed successfully.
  cost_item_revision_key := public.begin_cost_item_revision('project_quote', saved_row.id);
  perform public.supersede_previous_cost_items('project_quote', saved_row.id, cost_item_revision_key);
  perform public.upsert_cost_items_for_document('project_quote', saved_row.id, cost_item_revision_key);

  return query
  select
    saved_row.id,
    saved_row.updated_at,
    saved_row.subtotal,
    saved_row.optional_subtotal,
    saved_row.gst_amount,
    saved_row.total_quote_price,
    saved_row.status;
end;
$$;

create or replace function public.save_project_variation_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_variation_id uuid,
  p_expected_updated_at timestamptz,
  p_variation_title text,
  p_variation_number text,
  p_status text,
  p_origin text,
  p_requested_by text,
  p_requested_date date,
  p_due_date date,
  p_sent_to_client_at timestamptz,
  p_approved_at timestamptz,
  p_invoice_ready boolean,
  p_notes text,
  p_margin_percent numeric,
  p_discount_amount numeric,
  p_contingency_amount numeric,
  p_gst_percent numeric,
  p_include_margin_in_export boolean,
  p_include_discount_in_export boolean,
  p_include_contingency_in_export boolean,
  p_validity_period text,
  p_payment_terms text,
  p_lead_time text,
  p_terms_inclusions text,
  p_terms_exclusions text,
  p_clarifications text,
  p_assumptions text,
  p_line_items jsonb,
  p_attachments jsonb
)
returns table (
  updated_at timestamptz,
  subtotal numeric,
  gst_total numeric,
  total_variation_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_variations%rowtype;
  saved_row public.project_variations%rowtype;
  section_labour_total numeric := 0;
  section_materials_total numeric := 0;
  section_subcontractors_total numeric := 0;
  section_plant_total numeric := 0;
  section_margin_total numeric := 0;
  computed_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst_total numeric := 0;
  computed_grand_total numeric := 0;
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'variations.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  select *
  into existing_row
  from public.project_variations v
  where v.id = p_variation_id
    and v.organization_id = p_organization_id
    and v.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Variation not found';
  end if;

  if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This variation was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  select
    coalesce(sum(
      case when line.item->>'section' = 'Labour'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(
      case when line.item->>'section' = 'Materials'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(
      case when line.item->>'section' = 'Subcontractors'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(
      case when line.item->>'section' = 'Plant'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(
      case when line.item->>'section' = 'Margin'
        then round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)
        else 0 end
    ), 0),
    coalesce(sum(round(coalesce(nullif(line.item->>'quantity', '')::numeric, 0) * coalesce(nullif(line.item->>'rate', '')::numeric, 0), 2)), 0)
  into
    section_labour_total,
    section_materials_total,
    section_subcontractors_total,
    section_plant_total,
    section_margin_total,
    computed_subtotal
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst_total := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst_total;

  update public.project_variations v
  set
    variation_title = coalesce(nullif(btrim(p_variation_title), ''), v.variation_title),
    variation_number = coalesce(nullif(btrim(p_variation_number), ''), v.variation_number),
    status = case
      when p_status in ('Draft', 'Priced', 'Sent', 'Client Review', 'Approved', 'Rejected', 'Invoiced') then p_status
      else v.status
    end,
    origin = case
      when p_origin in ('Client Request', 'Drawing Revision', 'Site Instruction', 'RFI', 'Unknown') then p_origin
      else v.origin
    end,
    requested_by = coalesce(p_requested_by, ''),
    requested_date = p_requested_date,
    due_date = p_due_date,
    sent_to_client_at = p_sent_to_client_at,
    approved_at = p_approved_at,
    invoice_ready = coalesce(p_invoice_ready, false),
    notes = coalesce(p_notes, ''),
    labour_total = round(section_labour_total, 2),
    materials_total = round(section_materials_total, 2),
    subcontractors_total = round(section_subcontractors_total, 2),
    plant_total = round(section_plant_total, 2),
    margin_total = round(section_margin_total, 2),
    subtotal = round(computed_subtotal, 2),
    margin_percent = round(coalesce(p_margin_percent, 0), 3),
    discount_amount = round(coalesce(p_discount_amount, 0), 2),
    contingency_amount = round(coalesce(p_contingency_amount, 0), 2),
    gst_percent = round(coalesce(p_gst_percent, 0), 3),
    include_margin_in_export = coalesce(p_include_margin_in_export, true),
    include_discount_in_export = coalesce(p_include_discount_in_export, false),
    include_contingency_in_export = coalesce(p_include_contingency_in_export, false),
    validity_period = coalesce(p_validity_period, ''),
    payment_terms = coalesce(p_payment_terms, ''),
    lead_time = coalesce(p_lead_time, ''),
    terms_inclusions = coalesce(p_terms_inclusions, ''),
    terms_exclusions = coalesce(p_terms_exclusions, ''),
    clarifications = coalesce(p_clarifications, ''),
    assumptions = coalesce(p_assumptions, ''),
    gst_total = round(computed_gst_total, 2),
    total_variation_price = round(computed_grand_total, 2)
  where v.id = p_variation_id
    and v.organization_id = p_organization_id
    and v.project_id = p_project_id
  returning * into saved_row;

  create temporary table if not exists _existing_variation_line_items (
    id uuid,
    section text,
    description text,
    quantity numeric,
    unit text,
    rate numeric,
    sort_order integer,
    source_purchase_order_line_item_id uuid
  ) on commit drop;
  truncate _existing_variation_line_items;

  insert into _existing_variation_line_items (
    id,
    section,
    description,
    quantity,
    unit,
    rate,
    sort_order,
    source_purchase_order_line_item_id
  )
  select
    li.id,
    li.section,
    li.description,
    li.quantity,
    li.unit,
    li.rate,
    li.sort_order,
    li.source_purchase_order_line_item_id
  from public.project_variation_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.variation_id = p_variation_id;

  delete from public.project_variation_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.variation_id = p_variation_id;

  insert into public.project_variation_line_items (
    id,
    organization_id,
    project_id,
    variation_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    sort_order,
    source_purchase_order_id,
    source_purchase_order_line_item_id,
    source_purchase_order_number
  )
  with incoming_lines as (
    select
      case
        when nullif(line.item->>'id', '') is null then null
        else (line.item->>'id')::uuid
      end as incoming_id,
      case
        when line.item->>'section' in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then line.item->>'section'
        else 'Labour'
      end as resolved_section,
      coalesce(line.item->>'description', '') as resolved_description,
      coalesce(nullif(line.item->>'quantity', '')::numeric, 0) as resolved_quantity,
      coalesce(line.item->>'unit', '') as resolved_unit,
      coalesce(nullif(line.item->>'rate', '')::numeric, 0) as resolved_rate,
      (line.ordinality - 1)::integer as resolved_sort_order,
      case
        when nullif(line.item->>'sourcePurchaseOrderId', '') is null then null
        else (line.item->>'sourcePurchaseOrderId')::uuid
      end as resolved_source_purchase_order_id,
      case
        when nullif(line.item->>'sourcePurchaseOrderLineItemId', '') is null then null
        else (line.item->>'sourcePurchaseOrderLineItemId')::uuid
      end as resolved_source_purchase_order_line_item_id,
      coalesce(line.item->>'sourcePurchaseOrderNumber', '') as resolved_source_purchase_order_number
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality)
  ),
  reconciled_lines as (
    select
      coalesce(
        il.incoming_id,
        source_line_match.matched_id,
        signature_match.matched_id,
        gen_random_uuid()
      ) as resolved_id,
      il.resolved_section,
      il.resolved_description,
      il.resolved_quantity,
      il.resolved_unit,
      il.resolved_rate,
      il.resolved_sort_order,
      il.resolved_source_purchase_order_id,
      il.resolved_source_purchase_order_line_item_id,
      il.resolved_source_purchase_order_number
    from incoming_lines il
    left join lateral (
      select matches.candidate_id as matched_id
      from (
        select
          e.id as candidate_id,
          count(*) over () as candidate_count
        from _existing_variation_line_items e
        where il.resolved_source_purchase_order_line_item_id is not null
          and e.source_purchase_order_line_item_id = il.resolved_source_purchase_order_line_item_id
      ) matches
      where matches.candidate_count = 1
      limit 1
    ) source_line_match on true
    left join lateral (
      select matches.candidate_id as matched_id
      from (
        select
          e.id as candidate_id,
          count(*) over () as candidate_count
        from _existing_variation_line_items e
        where e.section = il.resolved_section
          and e.description = il.resolved_description
          and e.quantity = il.resolved_quantity
          and e.unit = il.resolved_unit
          and e.rate = il.resolved_rate
          and e.sort_order = il.resolved_sort_order
      ) matches
      where matches.candidate_count = 1
      limit 1
    ) signature_match on true
  )
  select
    rl.resolved_id,
    p_organization_id,
    p_project_id,
    p_variation_id,
    rl.resolved_section,
    rl.resolved_description,
    rl.resolved_quantity,
    rl.resolved_unit,
    rl.resolved_rate,
    round(rl.resolved_quantity * rl.resolved_rate, 2),
    rl.resolved_sort_order,
    rl.resolved_source_purchase_order_id,
    rl.resolved_source_purchase_order_line_item_id,
    rl.resolved_source_purchase_order_number
  from reconciled_lines rl;

  delete from public.project_variation_attachments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.variation_id = p_variation_id;

  insert into public.project_variation_attachments (
    id,
    organization_id,
    project_id,
    variation_id,
    file_kind,
    file_name,
    storage_path,
    external_url,
    uploaded_by
  )
  select
    case
      when nullif(att.item->>'id', '') is null then gen_random_uuid()
      else (att.item->>'id')::uuid
    end,
    p_organization_id,
    p_project_id,
    p_variation_id,
    case
      when att.item->>'type' in ('Drawing', 'Email', 'Site Instruction', 'Other') then att.item->>'type'
      else 'Other'
    end,
    coalesce(nullif(att.item->>'name', ''), 'Attachment'),
    nullif(att.item->>'storagePath', ''),
    nullif(att.item->>'externalUrl', ''),
    auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as att(item);

  if existing_row.status is distinct from saved_row.status then
    insert into public.project_variation_status_events (
      organization_id,
      project_id,
      variation_id,
      from_status,
      to_status,
      changed_by
    ) values (
      p_organization_id,
      p_project_id,
      p_variation_id,
      existing_row.status,
      saved_row.status,
      auth.uid()
    );
  end if;

  if saved_row.invoice_ready then
    insert into public.project_variation_invoice_items (
      organization_id,
      project_id,
      variation_id,
      amount,
      status
    ) values (
      p_organization_id,
      p_project_id,
      p_variation_id,
      round(saved_row.total_variation_price, 2),
      'Ready'
    )
    on conflict (variation_id) do update
    set
      amount = excluded.amount,
      status = excluded.status;
  else
    delete from public.project_variation_invoice_items ii
    where ii.organization_id = p_organization_id
      and ii.project_id = p_project_id
      and ii.variation_id = p_variation_id;
  end if;

  -- CostItem dual-write (parallel layer only): mirror the persisted variation rows
  -- after all existing variation child-table and invoice/status logic has completed.
  cost_item_revision_key := public.begin_cost_item_revision('project_variation', p_variation_id);
  perform public.supersede_previous_cost_items('project_variation', p_variation_id, cost_item_revision_key);
  perform public.upsert_cost_items_for_document('project_variation', p_variation_id, cost_item_revision_key);

  return query
  select
    saved_row.updated_at,
    saved_row.subtotal,
    saved_row.gst_total,
    saved_row.total_variation_price,
    saved_row.status;
end;
$$;

create or replace function public.save_project_purchase_order_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_expected_updated_at timestamptz,
  p_purchase_order_title text,
  p_purchase_order_number text,
  p_status text,
  p_origin text,
  p_supplier_id uuid,
  p_issued_to_label text,
  p_supplier_contact text,
  p_supplier_name_snapshot text,
  p_supplier_email_snapshot text,
  p_supplier_phone_snapshot text,
  p_requested_by text,
  p_requested_date date,
  p_due_date date,
  p_sent_to_client_at timestamptz,
  p_approved_at timestamptz,
  p_invoice_ready boolean,
  p_notes text,
  p_margin_percent numeric,
  p_discount_amount numeric,
  p_contingency_amount numeric,
  p_gst_percent numeric,
  p_include_margin_in_export boolean,
  p_include_discount_in_export boolean,
  p_include_contingency_in_export boolean,
  p_line_items jsonb,
  p_attachments jsonb
)
returns table (
  updated_at timestamptz,
  subtotal numeric,
  gst_total numeric,
  total_purchase_order_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_purchase_orders%rowtype;
  updated_row public.project_purchase_orders%rowtype;
  computed_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst_total numeric := 0;
  computed_grand_total numeric := 0;
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'purchase_orders.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from public.organization_suppliers s
    where s.id = p_supplier_id
      and s.organization_id = p_organization_id
  ) then
    raise exception 'Supplier does not belong to this organization';
  end if;

  select *
  into existing_row
  from public.project_purchase_orders po
  where po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Purchase order not found';
  end if;

  if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This purchase order was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  with normalized_line_items as (
    select
      coalesce(
        existing_synced_line.id,
        case
          when nullif(line.item->>'id', '') is null then gen_random_uuid()
          else (line.item->>'id')::uuid
        end
      ) as id,
      coalesce(
        existing_synced_line.section,
        case
          when line.item->>'section' in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then line.item->>'section'
          else 'Labour'
        end
      ) as section,
      coalesce(existing_synced_line.description, coalesce(line.item->>'description', '')) as description,
      coalesce(existing_synced_line.quantity, coalesce(nullif(line.item->>'quantity', '')::numeric, 0)) as quantity,
      coalesce(existing_synced_line.unit, coalesce(line.item->>'unit', '')) as unit,
      coalesce(nullif(line.item->>'rate', '')::numeric, 0) as rate,
      (line.ordinality - 1)::integer as sort_order,
      parsed.source_time_sheet_entry_id
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality)
    left join lateral (
      select case
        when nullif(line.item->>'source_time_sheet_entry_id', '') is null then null
        else (line.item->>'source_time_sheet_entry_id')::uuid
      end as source_time_sheet_entry_id
    ) parsed on true
    left join public.project_purchase_order_line_items existing_synced_line
      on existing_synced_line.organization_id = p_organization_id
      and existing_synced_line.project_id = p_project_id
      and existing_synced_line.purchase_order_id = p_purchase_order_id
      and existing_synced_line.source_time_sheet_entry_id = parsed.source_time_sheet_entry_id
  )
  select coalesce(sum(round(quantity * rate, 2)), 0)
  into computed_subtotal
  from normalized_line_items;

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst_total := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst_total;

  update public.project_purchase_orders po
  set
    purchase_order_title = coalesce(nullif(btrim(p_purchase_order_title), ''), po.purchase_order_number),
    purchase_order_number = coalesce(nullif(btrim(p_purchase_order_number), ''), po.purchase_order_number),
    status = p_status,
    origin = p_origin,
    supplier_id = p_supplier_id,
    issued_to_label = coalesce(p_issued_to_label, ''),
    supplier_contact = coalesce(p_supplier_contact, ''),
    supplier_name_snapshot = coalesce(p_supplier_name_snapshot, ''),
    supplier_email_snapshot = coalesce(p_supplier_email_snapshot, ''),
    supplier_phone_snapshot = coalesce(p_supplier_phone_snapshot, ''),
    requested_by = coalesce(p_requested_by, ''),
    requested_date = p_requested_date,
    due_date = p_due_date,
    sent_to_client_at = p_sent_to_client_at,
    approved_at = p_approved_at,
    invoice_ready = coalesce(p_invoice_ready, false),
    notes = coalesce(p_notes, ''),
    subtotal = round(computed_subtotal, 2),
    margin_percent = round(coalesce(p_margin_percent, 0), 3),
    discount_amount = round(coalesce(p_discount_amount, 0), 2),
    contingency_amount = round(coalesce(p_contingency_amount, 0), 2),
    gst_percent = round(coalesce(p_gst_percent, 0), 3),
    include_margin_in_export = coalesce(p_include_margin_in_export, true),
    include_discount_in_export = coalesce(p_include_discount_in_export, false),
    include_contingency_in_export = coalesce(p_include_contingency_in_export, false),
    gst_total = round(computed_gst_total, 2),
    total_purchase_order_price = round(computed_grand_total, 2)
  where po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  returning * into updated_row;

  delete from public.project_purchase_order_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.purchase_order_id = p_purchase_order_id;

  insert into public.project_purchase_order_line_items (
    id,
    organization_id,
    project_id,
    purchase_order_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    sort_order,
    source_time_sheet_entry_id
  )
  with normalized_line_items as (
    select
      coalesce(
        existing_synced_line.id,
        case
          when nullif(line.item->>'id', '') is null then gen_random_uuid()
          else (line.item->>'id')::uuid
        end
      ) as id,
      coalesce(
        existing_synced_line.section,
        case
          when line.item->>'section' in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then line.item->>'section'
          else 'Labour'
        end
      ) as section,
      coalesce(existing_synced_line.description, coalesce(line.item->>'description', '')) as description,
      coalesce(existing_synced_line.quantity, coalesce(nullif(line.item->>'quantity', '')::numeric, 0)) as quantity,
      coalesce(existing_synced_line.unit, coalesce(line.item->>'unit', '')) as unit,
      coalesce(nullif(line.item->>'rate', '')::numeric, 0) as rate,
      (line.ordinality - 1)::integer as sort_order,
      parsed.source_time_sheet_entry_id
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality)
    left join lateral (
      select case
        when nullif(line.item->>'source_time_sheet_entry_id', '') is null then null
        else (line.item->>'source_time_sheet_entry_id')::uuid
      end as source_time_sheet_entry_id
    ) parsed on true
    left join public.project_purchase_order_line_items existing_synced_line
      on existing_synced_line.organization_id = p_organization_id
      and existing_synced_line.project_id = p_project_id
      and existing_synced_line.purchase_order_id = p_purchase_order_id
      and existing_synced_line.source_time_sheet_entry_id = parsed.source_time_sheet_entry_id
  )
  select
    id,
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    section,
    description,
    quantity,
    unit,
    rate,
    round(quantity * rate, 2),
    sort_order,
    source_time_sheet_entry_id
  from normalized_line_items;

  delete from public.project_purchase_order_attachments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.purchase_order_id = p_purchase_order_id;

  insert into public.project_purchase_order_attachments (
    id,
    organization_id,
    project_id,
    purchase_order_id,
    file_kind,
    file_name,
    external_url,
    uploaded_by
  )
  select
    case
      when nullif(att.item->>'id', '') is null then gen_random_uuid()
      else (att.item->>'id')::uuid
    end,
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    case
      when att.item->>'type' in ('Drawing', 'Email', 'Site Instruction', 'Other') then att.item->>'type'
      else 'Other'
    end,
    coalesce(nullif(att.item->>'name', ''), 'Attachment'),
    coalesce(nullif(att.item->>'external_url', ''), 'manual://' || coalesce(nullif(att.item->>'name', ''), 'attachment')),
    auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as att(item);

  if existing_row.status is distinct from updated_row.status then
    insert into public.project_purchase_order_status_events (
      organization_id,
      project_id,
      purchase_order_id,
      from_status,
      to_status,
      changed_by
    ) values (
      p_organization_id,
      p_project_id,
      p_purchase_order_id,
      existing_row.status,
      updated_row.status,
      auth.uid()
    );
  end if;

  if updated_row.invoice_ready then
    insert into public.project_purchase_order_invoice_items (
      organization_id,
      project_id,
      purchase_order_id,
      amount,
      status
    ) values (
      p_organization_id,
      p_project_id,
      p_purchase_order_id,
      round(computed_grand_total, 2),
      'Ready'
    )
    on conflict (purchase_order_id)
    do update set
      amount = excluded.amount,
      status = excluded.status,
      updated_at = now();
  else
    delete from public.project_purchase_order_invoice_items ii
    where ii.organization_id = p_organization_id
      and ii.project_id = p_project_id
      and ii.purchase_order_id = p_purchase_order_id;
  end if;

  -- CostItem dual-write (parallel layer only): mirror the persisted purchase-order rows
  -- after all existing PO child-table and invoice/status logic has completed.
  cost_item_revision_key := public.begin_cost_item_revision('project_purchase_order', p_purchase_order_id);
  perform public.supersede_previous_cost_items('project_purchase_order', p_purchase_order_id, cost_item_revision_key);
  perform public.upsert_cost_items_for_document('project_purchase_order', p_purchase_order_id, cost_item_revision_key);

  return query
  select updated_row.updated_at, updated_row.subtotal, updated_row.gst_total, updated_row.total_purchase_order_price, updated_row.status;
end;
$$;

create or replace function public.save_project_claim_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_claim_id uuid,
  p_expected_updated_at timestamptz,
  p_claim_title text,
  p_claim_type text,
  p_status text,
  p_claim_date date,
  p_due_date date,
  p_period_start date,
  p_period_end date,
  p_percent_complete numeric,
  p_paid_amount numeric,
  p_retention_method text,
  p_retention_scale_bands jsonb,
  p_retention_percent numeric,
  p_retention_released_amount numeric,
  p_notes text,
  p_line_items jsonb
)
returns table (
  updated_at timestamptz,
  claim_amount numeric,
  linked_quote_value numeric,
  linked_approved_variations numeric,
  previous_claims_total numeric,
  revised_contract_value numeric,
  percent_complete numeric,
  paid_amount numeric,
  status text,
  retention_percent numeric,
  retention_withheld_amount numeric,
  retention_released_amount numeric,
  retention_held_to_date numeric,
  retention_released_to_date numeric,
  retention_balance numeric,
  net_claim_excl_gst numeric,
  gst_amount numeric,
  total_payable numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_retention_method text := case
    when coalesce(p_retention_method, 'flat') = 'sliding_scale' then 'sliding_scale'
    else 'flat'
  end;
  cost_item_revision_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  if not exists (
    select 1
    from public.project_claims c
    where c.id = p_claim_id
      and c.organization_id = p_organization_id
      and c.project_id = p_project_id
  ) then
    raise exception 'Claim not found';
  end if;

  if exists (
    select 1
    from public.project_claims c
    where c.id = p_claim_id
      and c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and p_expected_updated_at is not null
      and c.updated_at is distinct from p_expected_updated_at
  ) then
    raise exception 'This claim was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  perform public.sync_project_claim_line_items(
    p_organization_id,
    p_project_id,
    p_claim_id,
    p_line_items,
    null
  );

  update public.project_claims c
  set
    claim_title = coalesce(nullif(btrim(p_claim_title), ''), c.claim_title),
    claim_type = case
      when p_claim_type in ('Progress', 'Deposit', 'Final') then p_claim_type
      else c.claim_type
    end,
    status = case
      when p_status in ('Draft', 'Submitted', 'Unpaid', 'Paid', 'Overdue', 'Cancelled') then p_status
      else c.status
    end,
    claim_date = p_claim_date,
    due_date = p_due_date,
    period_start = p_period_start,
    period_end = p_period_end,
    paid_amount = round(greatest(0, coalesce(p_paid_amount, 0)), 2),
    retention_method = resolved_retention_method,
    retention_scale_bands = case
      when resolved_retention_method = 'sliding_scale' then coalesce(p_retention_scale_bands, '[]'::jsonb)
      else null
    end,
    retention_percent = round(
      greatest(0, least(100, coalesce(p_retention_percent, c.retention_percent, 0))),
      3
    ),
    retention_released_amount = round(
      greatest(0, coalesce(p_retention_released_amount, c.retention_released_amount, 0)),
      2
    ),
    notes = coalesce(p_notes, '')
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;

  perform public.recalculate_project_claim_snapshots(
    p_organization_id,
    p_project_id
  );

  -- CostItem dual-write (parallel layer only): mirror the saved claim snapshot rows
  -- only after the existing claim sync and snapshot recalculation have finished.
  cost_item_revision_key := public.begin_cost_item_revision('project_claim', p_claim_id);
  perform public.supersede_previous_cost_items('project_claim', p_claim_id, cost_item_revision_key);
  perform public.upsert_cost_items_for_document('project_claim', p_claim_id, cost_item_revision_key);

  return query
  select
    c.updated_at,
    c.claim_amount,
    c.linked_quote_value,
    c.linked_approved_variations,
    c.previous_claims_total,
    c.revised_contract_value,
    c.percent_complete,
    c.paid_amount,
    c.status,
    c.retention_percent,
    c.retention_withheld_amount,
    c.retention_released_amount,
    c.retention_held_to_date,
    c.retention_released_to_date,
    c.retention_balance,
    c.net_claim_excl_gst,
    c.gst_amount,
    c.total_payable
  from public.project_claims c
  where c.id = p_claim_id
    and c.organization_id = p_organization_id
    and c.project_id = p_project_id;
end;
$$;
