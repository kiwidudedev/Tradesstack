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
      organization_id, project_id, source_document_kind, source_document_id, source_line_table, source_line_id,
      parent_cost_item_id, origin_kind, source_snapshot, item_code, item_type, section, category, trade_id,
      trade_label, cost_code, cost_type, title, description, quantity, unit, unit_rate, line_total, is_optional,
      sort_order, status, effective_from, effective_to, is_current, source_revision_key, source_fingerprint,
      linked_quote_line_item_id, linked_variation_line_item_id, linked_purchase_order_line_item_id, linked_claim_line_item_id, created_by
    )
    select
      cl.organization_id, cl.project_id, 'project_variation', cl.document_id, 'project_variation_line_items', cl.line_item_id,
      prev.id,
      case when cl.source_purchase_order_line_item_id is not null then 'purchase_order_import' else 'manual' end,
      jsonb_build_object(
        'document_kind', 'project_variation',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'line_item_id', cl.line_item_id,
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
        'supplier_id', cl.supplier_id,
        'issued_to_label', cl.issued_to_label,
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
        c.organization_id, c.project_id, c.id as document_id, c.claim_number as document_number, c.claim_title as document_title,
        cli.id as claim_line_item_id, cli.source_kind, cli.source_document_id, cli.source_line_item_id, cli.source_number,
        cli.source_title, cli.section, cli.description, cli.quantity, cli.unit, cli.rate as unit_rate, cli.source_total,
        cli.previously_claimed_amount, cli.previously_claimed_percent, cli.claim_percent, cli.claim_amount,
        cli.cumulative_claimed_amount, cli.cumulative_claimed_percent, cli.sort_order,
        public.compute_cost_item_source_fingerprint(
          'project_claim', 'project_claim_line_items', cli.section, cli.description, cli.quantity, cli.unit, cli.rate,
          cli.claim_amount, false, cli.sort_order, cli.source_kind, cli.source_line_item_id::text
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
      cl.organization_id, cl.project_id, 'project_claim', cl.document_id, 'project_claim_line_items', cl.claim_line_item_id,
      prev.id, 'claim_snapshot',
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
      '', 'claim_snapshot', cl.section, cl.section, null, null, '', '',
      coalesce(nullif(btrim(cl.description), ''), 'Untitled claim line item'),
      coalesce(cl.description, ''), cl.quantity, cl.unit, cl.unit_rate, cl.claim_amount, false, cl.sort_order,
      'snapshot', clock_timestamp(), null, true, p_source_revision_key, cl.source_fingerprint,
      null, null, null, cl.claim_line_item_id, auth.uid()
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
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst;
  resolved_retention_percent_default := greatest(0, least(100, coalesce(p_retention_percent_default, 0)));

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

    if p_expected_updated_at is null then
      raise exception 'Quote version is required. Please refresh and try again.'
        using errcode = '40001';
    end if;

    if existing_row.updated_at is distinct from p_expected_updated_at then
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
      organization_id, project_id, created_by, quote_title, quote_number, client_name, company_name, contact_person,
      client_email, client_phone, site_address, project_name, quote_date, expiry_date, status, optional_items_notes,
      scope_exclusions, assumptions, scope_notes, subtotal, optional_subtotal, margin_percent, margin_amount,
      discount_amount, contingency_amount, gst_percent, gst_amount, total_quote_price, validity_period,
      payment_terms, retention_percent_default, lead_time, terms_inclusions, terms_exclusions, clarifications, acceptance_notes
    ) values (
      p_organization_id, p_project_id, auth.uid(), btrim(p_quote_title), btrim(p_quote_number), coalesce(p_client_name, ''),
      coalesce(p_company_name, ''), coalesce(p_contact_person, ''), coalesce(p_client_email, ''), coalesce(p_client_phone, ''),
      coalesce(p_site_address, ''), coalesce(p_project_name, ''), p_quote_date, p_expiry_date, saved_status,
      coalesce(p_optional_items_notes, ''), coalesce(p_scope_exclusions, ''), coalesce(p_assumptions, ''),
      coalesce(p_scope_notes, ''), round(computed_subtotal, 2), round(computed_optional_subtotal, 2),
      round(coalesce(p_margin_percent, 0), 3), round(computed_margin, 2), round(coalesce(p_discount_amount, 0), 2),
      round(coalesce(p_contingency_amount, 0), 2), round(coalesce(p_gst_percent, 0), 3), round(computed_gst, 2),
      round(computed_grand_total, 2), coalesce(p_validity_period, ''), coalesce(p_payment_terms, ''),
      round(resolved_retention_percent_default, 3), coalesce(p_lead_time, ''), coalesce(p_terms_inclusions, ''),
      coalesce(p_terms_exclusions, ''), coalesce(p_clarifications, ''), coalesce(p_acceptance_notes, '')
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

grant execute on function public.upsert_cost_items_for_document(text, uuid, text) to authenticated;
grant execute on function public.save_project_quote_draft(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, text,
  date, date, text, text, text, text, text, numeric, numeric, numeric, numeric, text, text,
  numeric, text, text, text, text, text, jsonb
) to authenticated;
