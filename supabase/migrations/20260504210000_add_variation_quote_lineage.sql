alter table public.project_variation_line_items
  add column if not exists source_project_quote_id uuid null references public.project_quotes (id) on delete set null,
  add column if not exists source_project_quote_line_item_id uuid null references public.project_quote_line_items (id) on delete set null,
  add column if not exists source_project_quote_number text null;

create index if not exists project_variation_line_items_source_quote_idx
  on public.project_variation_line_items (variation_id, source_project_quote_line_item_id)
  where source_project_quote_line_item_id is not null;

drop function if exists public.save_project_variation_draft(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date, date, timestamptz, timestamptz,
  boolean, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean, text, text, text,
  text, text, text, text, jsonb, jsonb
);

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
    select count(*)
    into missing_parent_count
    from public.project_variation_line_items li
    where li.organization_id = resolved_context.organization_id
      and li.project_id = resolved_context.project_id
      and li.variation_id = p_document_id
      and li.source_project_quote_line_item_id is not null
      and not exists (
        select 1
        from public.cost_items qci
        where qci.source_document_kind = 'project_quote'
          and qci.source_document_id = li.source_project_quote_id
          and qci.is_current = true
          and qci.linked_quote_line_item_id = li.source_project_quote_line_item_id
      );

    if missing_parent_count > 0 then
      raise exception 'Cannot mirror project variation CostItems: one or more quote-linked variation lines have no matching current project quote CostItem';
    end if;

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
        li.source_project_quote_id,
        li.source_project_quote_line_item_id,
        li.source_project_quote_number,
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
          coalesce(li.source_project_quote_line_item_id::text, coalesce(li.source_purchase_order_line_item_id::text, '')),
          coalesce(nullif(li.source_project_quote_number, ''), coalesce(li.source_purchase_order_number, ''))
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
      organization_id, project_id, source_document_kind, source_document_id, source_line_table, source_line_id,
      parent_cost_item_id, origin_kind, source_snapshot, item_code, item_type, section, category, trade_id,
      trade_label, cost_code, cost_type, title, description, quantity, unit, unit_rate, line_total, is_optional,
      sort_order, status, effective_from, effective_to, is_current, source_revision_key, source_fingerprint,
      linked_quote_line_item_id, linked_variation_line_item_id, linked_purchase_order_line_item_id, linked_claim_line_item_id, created_by
    )
    select
      cl.organization_id, cl.project_id, 'project_variation', cl.document_id, 'project_variation_line_items', cl.line_item_id,
      coalesce(qci.id, prev.id),
      case
        when cl.source_project_quote_line_item_id is not null then 'system'
        when cl.source_purchase_order_line_item_id is not null then 'purchase_order_import'
        else 'manual'
      end,
      jsonb_build_object(
        'document_kind', 'project_variation',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'line_item_id', cl.line_item_id,
        'source_project_quote_id', cl.source_project_quote_id,
        'source_project_quote_line_item_id', cl.source_project_quote_line_item_id,
        'source_project_quote_number', cl.source_project_quote_number,
        'source_purchase_order_id', cl.source_purchase_order_id,
        'source_purchase_order_line_item_id', cl.source_purchase_order_line_item_id,
        'source_purchase_order_number', cl.source_purchase_order_number
      ),
      '', 'line_item', cl.section, cl.section, null, null, '', '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled line item'),
      coalesce(cl.description, ''), cl.quantity, cl.unit, cl.unit_rate, cl.line_total, false, cl.sort_order,
      'active', clock_timestamp(), null, true, p_source_revision_key, cl.source_fingerprint,
      null, cl.line_item_id, null, null, auth.uid()
    from current_lines cl
    left join public.cost_items qci
      on qci.source_document_kind = 'project_quote'
     and qci.source_document_id = cl.source_project_quote_id
     and qci.is_current = true
     and qci.linked_quote_line_item_id = cl.source_project_quote_line_item_id
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
      organization_id, project_id, source_document_kind, source_document_id, source_line_table, source_line_id,
      parent_cost_item_id, origin_kind, source_snapshot, item_code, item_type, section, category, trade_id,
      trade_label, cost_code, cost_type, title, description, quantity, unit, unit_rate, line_total, is_optional,
      sort_order, status, effective_from, effective_to, is_current, source_revision_key, source_fingerprint,
      linked_quote_line_item_id, linked_variation_line_item_id, linked_purchase_order_line_item_id, linked_claim_line_item_id, created_by
    )
    select
      cl.organization_id, cl.project_id, 'project_purchase_order', cl.document_id, 'project_purchase_order_line_items', cl.line_item_id,
      prev.id,
      case when cl.source_time_sheet_entry_id is not null then 'time_sheet_sync' else 'manual' end,
      jsonb_build_object(
        'document_kind', 'project_purchase_order',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'line_item_id', cl.line_item_id,
        'source_time_sheet_entry_id', cl.source_time_sheet_entry_id
      ),
      '', 'line_item', cl.section, cl.section, null, null, '', '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled line item'),
      coalesce(cl.description, ''), cl.quantity, cl.unit, cl.unit_rate, cl.line_total, false, cl.sort_order,
      'active', clock_timestamp(), null, true, p_source_revision_key, cl.source_fingerprint,
      null, null, cl.line_item_id, null, auth.uid()
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
        cli.id as line_item_id,
        cli.section,
        cli.description,
        cli.quantity,
        cli.unit,
        cli.unit_rate,
        cli.claim_amount as line_total,
        cli.sort_order,
        cli.source_kind,
        cli.source_document_id,
        cli.source_line_item_id,
        cli.source_number,
        public.compute_cost_item_source_fingerprint(
          'project_claim',
          'project_claim_line_items',
          cli.section,
          cli.description,
          cli.quantity,
          cli.unit,
          cli.unit_rate,
          cli.claim_amount,
          false,
          cli.sort_order,
          coalesce(cli.source_line_item_id::text, ''),
          coalesce(cli.source_kind, '')
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
      organization_id, project_id, source_document_kind, source_document_id, source_line_table, source_line_id,
      parent_cost_item_id, origin_kind, source_snapshot, item_code, item_type, section, category, trade_id,
      trade_label, cost_code, cost_type, title, description, quantity, unit, unit_rate, line_total, is_optional,
      sort_order, status, effective_from, effective_to, is_current, source_revision_key, source_fingerprint,
      linked_quote_line_item_id, linked_variation_line_item_id, linked_purchase_order_line_item_id, linked_claim_line_item_id, created_by
    )
    select
      cl.organization_id, cl.project_id, 'project_claim', cl.document_id, 'project_claim_line_items', cl.line_item_id,
      prev.id,
      'claim_snapshot',
      jsonb_build_object(
        'document_kind', 'project_claim',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'line_item_id', cl.line_item_id,
        'source_kind', cl.source_kind,
        'source_document_id', cl.source_document_id,
        'source_line_item_id', cl.source_line_item_id,
        'source_number', cl.source_number
      ),
      '', 'line_item', cl.section, cl.section, null, null, '', '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled line item'),
      coalesce(cl.description, ''), cl.quantity, cl.unit, cl.unit_rate, cl.line_total, false, cl.sort_order,
      'snapshot', clock_timestamp(), null, true, p_source_revision_key, cl.source_fingerprint,
      null, null, null, cl.line_item_id, auth.uid()
    from current_lines cl
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.source_document_kind = 'project_claim'
        and ci.source_document_id = cl.document_id
        and ci.source_revision_key <> p_source_revision_key
        and ci.linked_claim_line_item_id = cl.line_item_id
      order by ci.effective_from desc, ci.created_at desc
      limit 1
    ) prev on true;

    get diagnostics rows_written = row_count;
    return rows_written;
  end if;

  raise exception 'Unsupported CostItem document kind: %', p_document_kind;
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
  saved_row public.project_variations%rowtype;
  computed_subtotal numeric := 0;
  computed_margin_total numeric := 0;
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

  if p_variation_id is null then
    raise exception 'Variation id is required';
  end if;

  if p_expected_updated_at is not null then
    perform 1
    from public.project_variations v
    where v.id = p_variation_id
      and v.organization_id = p_organization_id
      and v.project_id = p_project_id
      and v.updated_at = p_expected_updated_at;

    if not found then
      raise exception 'Variation was updated by someone else. Refresh and try again.';
    end if;
  end if;

  with line_totals as (
    select
      coalesce(sum(round(coalesce(nullif(item->>'quantity', '')::numeric, 0) * coalesce(nullif(item->>'rate', '')::numeric, 0), 2)), 0) as subtotal
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) item
  )
  select line_totals.subtotal
  into computed_subtotal
  from line_totals;

  computed_margin_total := round(computed_subtotal * coalesce(p_margin_percent, 0) / 100, 2);
  computed_grand_total := round(
    computed_subtotal
    + computed_margin_total
    + coalesce(p_contingency_amount, 0)
    - coalesce(p_discount_amount, 0),
    2
  );
  computed_gst_total := round(computed_grand_total * coalesce(p_gst_percent, 0) / 100, 2);
  computed_grand_total := round(computed_grand_total + computed_gst_total, 2);

  update public.project_variations v
  set
    variation_title = coalesce(nullif(p_variation_title, ''), v.variation_title),
    variation_number = coalesce(nullif(p_variation_number, ''), v.variation_number),
    status = coalesce(nullif(p_status, ''), v.status),
    origin = coalesce(nullif(p_origin, ''), v.origin),
    requested_by = coalesce(p_requested_by, ''),
    requested_date = p_requested_date,
    due_date = p_due_date,
    sent_to_client_at = p_sent_to_client_at,
    approved_at = p_approved_at,
    invoice_ready = coalesce(p_invoice_ready, false),
    notes = coalesce(p_notes, ''),
    subtotal = round(computed_subtotal, 2),
    margin_percent = coalesce(p_margin_percent, 0),
    discount_amount = coalesce(p_discount_amount, 0),
    contingency_amount = coalesce(p_contingency_amount, 0),
    gst_percent = coalesce(p_gst_percent, 0),
    include_margin_in_export = coalesce(p_include_margin_in_export, false),
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
    source_project_quote_line_item_id uuid,
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
    source_project_quote_line_item_id,
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
    li.source_project_quote_line_item_id,
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
    source_project_quote_id,
    source_project_quote_line_item_id,
    source_project_quote_number,
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
        when nullif(line.item->>'sourceProjectQuoteId', '') is null then null
        else (line.item->>'sourceProjectQuoteId')::uuid
      end as resolved_source_project_quote_id,
      case
        when nullif(line.item->>'sourceProjectQuoteLineItemId', '') is null then null
        else (line.item->>'sourceProjectQuoteLineItemId')::uuid
      end as resolved_source_project_quote_line_item_id,
      coalesce(line.item->>'sourceProjectQuoteNumber', '') as resolved_source_project_quote_number,
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
        quote_line_match.matched_id,
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
      il.resolved_source_project_quote_id,
      il.resolved_source_project_quote_line_item_id,
      il.resolved_source_project_quote_number,
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
        where il.resolved_source_project_quote_line_item_id is not null
          and e.source_project_quote_line_item_id = il.resolved_source_project_quote_line_item_id
      ) matches
      where matches.candidate_count = 1
      limit 1
    ) quote_line_match on true
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
    rl.resolved_source_project_quote_id,
    rl.resolved_source_project_quote_line_item_id,
    rl.resolved_source_project_quote_number,
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
    coalesce(att.item->>'type', 'Email'),
    coalesce(att.item->>'name', ''),
    nullif(att.item->>'storagePath', ''),
    nullif(att.item->>'externalUrl', ''),
    auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) att(item);

  if saved_row.status = 'Approved' then
    insert into public.project_variation_status_events (
      organization_id,
      project_id,
      variation_id,
      event_type,
      occurred_at,
      metadata,
      created_by
    )
    values (
      p_organization_id,
      p_project_id,
      saved_row.id,
      'approved',
      coalesce(saved_row.approved_at, now()),
      jsonb_build_object('source', 'save_project_variation_draft'),
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

  cost_item_revision_key := public.begin_cost_item_revision('project_variation', saved_row.id);
  perform public.supersede_previous_cost_items('project_variation', saved_row.id, cost_item_revision_key);
  perform public.upsert_cost_items_for_document('project_variation', saved_row.id, cost_item_revision_key);

  return query
  select
    saved_row.updated_at,
    saved_row.subtotal,
    saved_row.gst_total,
    saved_row.total_variation_price,
    saved_row.status;
end;
$$;

grant execute on function public.save_project_variation_draft(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, date, date, timestamptz, timestamptz,
  boolean, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean, text, text, text,
  text, text, text, text, jsonb, jsonb
) to authenticated;
