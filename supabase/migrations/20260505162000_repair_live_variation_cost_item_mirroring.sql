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
    if current_user <> 'postgres' then
      raise exception 'Authentication is required';
    end if;
  end if;

  if p_document_kind = 'opportunity_quote' then
    return query
    select o.organization_id, o.workspace_project_id
    from public.opportunity_quotes q
    join public.organization_opportunities o
      on o.id = q.opportunity_id
     and o.organization_id = q.organization_id
    where q.id = p_document_id
      and o.workspace_project_id is not null
      and (
        current_user = 'postgres'
        or public.has_org_permission(o.organization_id, 'leads.opportunities.write')
      );
    return;
  end if;

  if p_document_kind = 'project_quote' then
    return query
    select q.organization_id, q.project_id
    from public.project_quotes q
    where q.id = p_document_id
      and (
        current_user = 'postgres'
        or public.has_org_permission(q.organization_id, 'quotes.write')
      );
    return;
  end if;

  if p_document_kind = 'project_variation' then
    return query
    select v.organization_id, v.project_id
    from public.project_variations v
    where v.id = p_document_id
      and (
        current_user = 'postgres'
        or public.has_org_permission(v.organization_id, 'variations.write')
      );
    return;
  end if;

  if p_document_kind = 'project_purchase_order' then
    return query
    select po.organization_id, po.project_id
    from public.project_purchase_orders po
    where po.id = p_document_id
      and (
        current_user = 'postgres'
        or public.has_org_permission(po.organization_id, 'purchase_orders.write')
      );
    return;
  end if;

  if p_document_kind = 'project_claim' then
    return query
    select c.organization_id, c.project_id
    from public.project_claims c
    where c.id = p_document_id
      and (
        current_user = 'postgres'
        or public.is_member_of_organization(c.organization_id)
      );
    return;
  end if;

  raise exception 'Unsupported CostItem document kind: %', p_document_kind;
end;
$$;

create or replace function public.upsert_cost_items_for_project_variation(
  p_variation_id uuid,
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
  from public.resolve_cost_item_document_context('project_variation', p_variation_id)
  limit 1;

  if resolved_context.organization_id is null then
    raise exception 'Document not found or not authorized for project variation CostItem mirror write';
  end if;

  delete from public.cost_items ci
  where ci.source_document_kind = 'project_variation'
    and ci.source_document_id = p_variation_id
    and ci.source_revision_key = p_source_revision_key;

  select count(*)
  into missing_parent_count
  from public.project_variation_line_items li
  where li.organization_id = resolved_context.organization_id
    and li.project_id = resolved_context.project_id
    and li.variation_id = p_variation_id
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
    where v.id = p_variation_id
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
end;
$$;

grant execute on function public.upsert_cost_items_for_project_variation(uuid, text) to authenticated;

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
    raise exception 'You do not have permission to save variations for this organization';
  end if;

  if coalesce(btrim(p_variation_title), '') = '' then
    raise exception 'Variation title is required';
  end if;

  if coalesce(btrim(p_variation_number), '') = '' then
    raise exception 'Variation number is required';
  end if;

  if p_status not in ('Draft', 'Sent', 'Approved', 'Invoiced') then
    raise exception 'Variation status must be Draft, Sent, Approved, or Invoiced';
  end if;

  if p_origin not in ('Internal', 'Client') then
    raise exception 'Variation origin must be Internal or Client';
  end if;

  select *
  into saved_row
  from public.project_variations v
  where v.organization_id = p_organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id
  for update;

  if not found then
    raise exception 'Variation not found';
  end if;

  if saved_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This variation was updated by someone else. Please reload and try again.';
  end if;

  computed_subtotal := coalesce((
    select sum(round(coalesce((line_item->>'quantity')::numeric, 0) * coalesce((line_item->>'rate')::numeric, 0), 2))
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line_item
  ), 0);

  computed_margin_total := round(computed_subtotal * (coalesce(p_margin_percent, 0) / 100), 2);
  computed_grand_total := computed_subtotal + computed_margin_total - coalesce(p_discount_amount, 0) + coalesce(p_contingency_amount, 0);
  computed_gst_total := round(computed_grand_total * (coalesce(p_gst_percent, 0) / 100), 2);

  update public.project_variations
  set
    variation_title = btrim(p_variation_title),
    variation_number = btrim(p_variation_number),
    status = p_status,
    origin = p_origin,
    requested_by = nullif(btrim(coalesce(p_requested_by, '')), ''),
    requested_date = p_requested_date,
    due_date = p_due_date,
    sent_to_client_at = case when p_status in ('Sent', 'Approved', 'Invoiced') then p_sent_to_client_at else null end,
    approved_at = case when p_status in ('Approved', 'Invoiced') then p_approved_at else null end,
    invoice_ready = coalesce(p_invoice_ready, false),
    notes = coalesce(p_notes, ''),
    margin_percent = coalesce(p_margin_percent, 0),
    discount_amount = coalesce(p_discount_amount, 0),
    contingency_amount = coalesce(p_contingency_amount, 0),
    gst_percent = coalesce(p_gst_percent, 0),
    include_margin_in_export = coalesce(p_include_margin_in_export, true),
    include_discount_in_export = coalesce(p_include_discount_in_export, true),
    include_contingency_in_export = coalesce(p_include_contingency_in_export, true),
    validity_period = coalesce(p_validity_period, ''),
    payment_terms = coalesce(p_payment_terms, ''),
    lead_time = coalesce(p_lead_time, ''),
    terms_inclusions = coalesce(p_terms_inclusions, ''),
    terms_exclusions = coalesce(p_terms_exclusions, ''),
    clarifications = coalesce(p_clarifications, ''),
    assumptions = coalesce(p_assumptions, ''),
    subtotal = round(computed_subtotal, 2),
    margin_total = round(computed_margin_total, 2),
    gst_total = round(computed_gst_total, 2),
    total_variation_price = round(computed_grand_total + computed_gst_total, 2),
    updated_at = statement_timestamp()
  where id = saved_row.id
  returning *
  into saved_row;

  delete from public.project_variation_attachments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.variation_id = p_variation_id;

  insert into public.project_variation_attachments (
    organization_id,
    project_id,
    variation_id,
    storage_object_path,
    original_filename,
    mime_type,
    size_bytes,
    created_by
  )
  select
    p_organization_id,
    p_project_id,
    p_variation_id,
    nullif(btrim(coalesce(attachment->>'storage_object_path', '')), ''),
    nullif(btrim(coalesce(attachment->>'original_filename', '')), ''),
    nullif(btrim(coalesce(attachment->>'mime_type', '')), ''),
    coalesce((attachment->>'size_bytes')::bigint, 0),
    auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as attachment
  where nullif(btrim(coalesce(attachment->>'storage_object_path', '')), '') is not null;

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
    source_purchase_order_number,
    created_by
  )
  select
    coalesce(
      nullif((line_item->>'id')::uuid, null),
      gen_random_uuid()
    ),
    p_organization_id,
    p_project_id,
    p_variation_id,
    coalesce(line_item->>'section', 'General'),
    coalesce(line_item->>'description', ''),
    coalesce((line_item->>'quantity')::numeric, 0),
    nullif(btrim(coalesce(line_item->>'unit', '')), ''),
    coalesce((line_item->>'rate')::numeric, 0),
    round(coalesce((line_item->>'quantity')::numeric, 0) * coalesce((line_item->>'rate')::numeric, 0), 2),
    coalesce((line_item->>'sort_order')::integer, row_number() over ()),
    nullif(line_item->>'source_project_quote_id', '')::uuid,
    nullif(line_item->>'source_project_quote_line_item_id', '')::uuid,
    nullif(btrim(coalesce(line_item->>'source_project_quote_number', '')), ''),
    nullif(line_item->>'source_purchase_order_id', '')::uuid,
    nullif(line_item->>'source_purchase_order_line_item_id', '')::uuid,
    nullif(btrim(coalesce(line_item->>'source_purchase_order_number', '')), ''),
    auth.uid()
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line_item(line_item, ordinality);

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
  perform public.upsert_cost_items_for_project_variation(saved_row.id, cost_item_revision_key);

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
