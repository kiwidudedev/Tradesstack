alter table public.project_variation_line_items
  alter column quantity drop not null,
  alter column quantity drop default,
  alter column unit drop not null,
  alter column unit drop default,
  alter column rate drop not null,
  alter column rate drop default,
  alter column total drop not null,
  alter column total drop default;

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
  id uuid,
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
    raise exception 'You do not have permission to save variations for this organization';
  end if;

  if p_variation_id is null then
    raise exception 'Variation id is required';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Variation version is required. Please refresh and try again.'
      using errcode = '40001';
  end if;

  if coalesce(btrim(p_variation_title), '') = '' then
    raise exception 'Variation title is required';
  end if;

  if coalesce(btrim(p_variation_number), '') = '' then
    raise exception 'Variation number is required';
  end if;

  if p_status not in ('Draft', 'Priced', 'Sent', 'Client Review', 'Approved', 'Rejected', 'Invoiced') then
    raise exception 'Variation status must be Draft, Priced, Sent, Client Review, Approved, Rejected, or Invoiced';
  end if;

  if p_origin not in ('Client Request', 'Drawing Revision', 'Site Instruction', 'RFI', 'Unknown') then
    raise exception 'Variation origin must be one of: Client Request, Drawing Revision, Site Instruction, RFI, Unknown';
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

  if existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This variation was updated by someone else. Please reload and try again.'
      using errcode = '40001';
  end if;

  create temporary table if not exists _incoming_variation_line_values (
    incoming_id uuid,
    resolved_section text,
    resolved_description text,
    resolved_quantity numeric,
    resolved_unit text,
    resolved_rate numeric,
    resolved_total numeric,
    resolved_sort_order integer,
    resolved_source_project_quote_id uuid,
    resolved_source_project_quote_line_item_id uuid,
    resolved_source_project_quote_number text,
    resolved_source_purchase_order_id uuid,
    resolved_source_purchase_order_line_item_id uuid,
    resolved_source_purchase_order_number text
  ) on commit drop;
  truncate _incoming_variation_line_values;

  insert into _incoming_variation_line_values (
    incoming_id,
    resolved_section,
    resolved_description,
    resolved_quantity,
    resolved_unit,
    resolved_rate,
    resolved_total,
    resolved_sort_order,
    resolved_source_project_quote_id,
    resolved_source_project_quote_line_item_id,
    resolved_source_project_quote_number,
    resolved_source_purchase_order_id,
    resolved_source_purchase_order_line_item_id,
    resolved_source_purchase_order_number
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
      nullif(btrim(coalesce(line.item->>'quantity', '')), '')::numeric as resolved_quantity,
      nullif(btrim(coalesce(line.item->>'unit', '')), '') as resolved_unit,
      nullif(btrim(coalesce(line.item->>'rate', '')), '')::numeric as resolved_rate,
      nullif(btrim(coalesce(line.item->>'total', '')), '')::numeric as explicit_total,
      (line.ordinality - 1)::integer as resolved_sort_order,
      case
        when nullif(line.item->>'sourceProjectQuoteId', '') is null then null
        else (line.item->>'sourceProjectQuoteId')::uuid
      end as resolved_source_project_quote_id,
      case
        when nullif(line.item->>'sourceProjectQuoteLineItemId', '') is null then null
        else (line.item->>'sourceProjectQuoteLineItemId')::uuid
      end as resolved_source_project_quote_line_item_id,
      nullif(btrim(coalesce(line.item->>'sourceProjectQuoteNumber', '')), '') as resolved_source_project_quote_number,
      case
        when nullif(line.item->>'sourcePurchaseOrderId', '') is null then null
        else (line.item->>'sourcePurchaseOrderId')::uuid
      end as resolved_source_purchase_order_id,
      case
        when nullif(line.item->>'sourcePurchaseOrderLineItemId', '') is null then null
        else (line.item->>'sourcePurchaseOrderLineItemId')::uuid
      end as resolved_source_purchase_order_line_item_id,
      nullif(btrim(coalesce(line.item->>'sourcePurchaseOrderNumber', '')), '') as resolved_source_purchase_order_number
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality)
  )
  select
    incoming_id,
    resolved_section,
    resolved_description,
    resolved_quantity,
    resolved_unit,
    resolved_rate,
    case
      when explicit_total is not null then round(explicit_total, 2)
      when resolved_quantity is not null and resolved_rate is not null then round(resolved_quantity * resolved_rate, 2)
      else null
    end,
    resolved_sort_order,
    resolved_source_project_quote_id,
    resolved_source_project_quote_line_item_id,
    resolved_source_project_quote_number,
    resolved_source_purchase_order_id,
    resolved_source_purchase_order_line_item_id,
    resolved_source_purchase_order_number
  from incoming_lines;

  select
    coalesce(sum(case when resolved_section = 'Labour' then coalesce(resolved_total, 0) else 0 end), 0),
    coalesce(sum(case when resolved_section = 'Materials' then coalesce(resolved_total, 0) else 0 end), 0),
    coalesce(sum(case when resolved_section = 'Subcontractors' then coalesce(resolved_total, 0) else 0 end), 0),
    coalesce(sum(case when resolved_section = 'Plant' then coalesce(resolved_total, 0) else 0 end), 0),
    coalesce(sum(case when resolved_section = 'Margin' then coalesce(resolved_total, 0) else 0 end), 0),
    coalesce(sum(coalesce(resolved_total, 0)), 0)
  into
    section_labour_total,
    section_materials_total,
    section_subcontractors_total,
    section_plant_total,
    section_margin_total,
    computed_subtotal
  from _incoming_variation_line_values;

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst_total := round(pre_gst_total * (coalesce(p_gst_percent, 0) / 100), 2);
  computed_grand_total := round(pre_gst_total + computed_gst_total, 2);

  update public.project_variations v
  set
    variation_title = btrim(p_variation_title),
    variation_number = btrim(p_variation_number),
    status = p_status,
    origin = p_origin,
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
    total_variation_price = computed_grand_total,
    updated_at = statement_timestamp()
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
    total numeric,
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
    total,
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
    li.total,
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
  with reconciled_lines as (
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
      il.resolved_total,
      il.resolved_sort_order,
      il.resolved_source_project_quote_id,
      il.resolved_source_project_quote_line_item_id,
      il.resolved_source_project_quote_number,
      il.resolved_source_purchase_order_id,
      il.resolved_source_purchase_order_line_item_id,
      il.resolved_source_purchase_order_number
    from _incoming_variation_line_values il
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
          and e.quantity is not distinct from il.resolved_quantity
          and e.unit is not distinct from il.resolved_unit
          and e.rate is not distinct from il.resolved_rate
          and e.total is not distinct from il.resolved_total
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
    rl.resolved_total,
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
      changed_by,
      event_type,
      occurred_at,
      metadata,
      created_by
    ) values (
      p_organization_id,
      p_project_id,
      p_variation_id,
      existing_row.status,
      saved_row.status,
      auth.uid(),
      case when saved_row.status = 'Approved' then 'approved' else 'status_changed' end,
      case when saved_row.status = 'Approved' then coalesce(saved_row.approved_at, now()) else now() end,
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
    saved_row.id,
    saved_row.updated_at,
    saved_row.subtotal,
    saved_row.gst_total,
    saved_row.total_variation_price,
    saved_row.status;
end;
$$;

create or replace function public.can_insert_commercial_item_document_link(
  p_organization_id uuid,
  p_commercial_item_id uuid,
  p_document_kind text,
  p_document_id uuid,
  p_document_line_id uuid,
  p_link_role text
)
returns boolean
language sql
stable
as $$
  select case
    when p_document_kind = 'quote_line' then exists (
      select 1
      from public.commercial_items item
      join public.organization_projects project
        on project.id = item.project_id
       and project.organization_id = item.organization_id
      join public.project_quote_line_items line
        on line.id = p_document_line_id
       and line.quote_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_quotes quote
        on quote.id = line.quote_id
       and quote.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and item.project_id is not null
        and item.project_id = line.project_id
        and item.project_id = quote.project_id
        and project.source_opportunity_id = item.opportunity_id
        and quote.source_opportunity_id = item.opportunity_id
        and (
          p_link_role <> 'source'
          or not exists (
            select 1
            from public.commercial_item_document_links existing_link
            where existing_link.organization_id = p_organization_id
              and existing_link.document_kind = 'quote_line'
              and existing_link.document_line_id = p_document_line_id
              and existing_link.link_role = 'source'
              and existing_link.commercial_item_id <> p_commercial_item_id
          )
        )
    )
    when p_document_kind = 'purchase_order_line' then exists (
      select 1
      from public.commercial_items item
      join public.organization_projects project
        on project.id = item.project_id
       and project.organization_id = item.organization_id
      join public.project_purchase_order_line_items line
        on line.id = p_document_line_id
       and line.purchase_order_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_purchase_orders purchase_order
        on purchase_order.id = line.purchase_order_id
       and purchase_order.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and item.project_id is not null
        and item.project_id = line.project_id
        and item.project_id = purchase_order.project_id
        and project.source_opportunity_id = item.opportunity_id
        and (
          p_link_role <> 'source'
          or not exists (
            select 1
            from public.commercial_item_document_links existing_link
            where existing_link.organization_id = p_organization_id
              and existing_link.document_kind = 'purchase_order_line'
              and existing_link.document_line_id = p_document_line_id
              and existing_link.link_role = 'source'
              and existing_link.commercial_item_id <> p_commercial_item_id
          )
        )
    )
    when p_document_kind = 'variation_line' then exists (
      select 1
      from public.commercial_items item
      join public.organization_projects project
        on project.id = item.project_id
       and project.organization_id = item.organization_id
      join public.project_variation_line_items line
        on line.id = p_document_line_id
       and line.variation_id = p_document_id
       and line.organization_id = p_organization_id
      join public.project_variations variation
        on variation.id = line.variation_id
       and variation.organization_id = p_organization_id
      where item.id = p_commercial_item_id
        and item.organization_id = p_organization_id
        and item.project_id is not null
        and item.project_id = line.project_id
        and item.project_id = variation.project_id
        and project.source_opportunity_id = item.opportunity_id
        and (
          nullif(item.source_link_json->>'variationId', '') is null
          or nullif(item.source_link_json->>'variationId', '')::uuid = variation.id
        )
        and (
          p_link_role <> 'source'
          or not exists (
            select 1
            from public.commercial_item_document_links existing_link
            where existing_link.organization_id = p_organization_id
              and existing_link.document_kind = 'variation_line'
              and existing_link.document_line_id = p_document_line_id
              and existing_link.link_role = 'source'
              and existing_link.commercial_item_id <> p_commercial_item_id
          )
        )
    )
    else false
  end;
$$;

create or replace function public.link_commercial_item_to_variation_line(p_input jsonb)
returns table (
  id uuid,
  organization_id uuid,
  commercial_item_id uuid,
  document_kind text,
  document_id uuid,
  document_line_id uuid,
  link_role text,
  snapshot_at_link_json jsonb,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  inserted_row public.commercial_item_document_links%rowtype;
  resolved_organization_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  resolved_commercial_item_id uuid := nullif(p_input->>'commercialItemId', '')::uuid;
  resolved_variation_id uuid := nullif(p_input->>'variationId', '')::uuid;
  resolved_variation_line_id uuid := nullif(p_input->>'variationLineId', '')::uuid;
  resolved_link_role text := coalesce(nullif(p_input->>'linkRole', ''), 'source');
  resolved_snapshot_json jsonb := coalesce(p_input->'snapshotAtLinkJson', '{}'::jsonb);
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if resolved_organization_id is null or resolved_commercial_item_id is null or resolved_variation_id is null or resolved_variation_line_id is null then
    raise exception 'organizationId, commercialItemId, variationId, and variationLineId are required';
  end if;

  if not public.has_org_permission(resolved_organization_id, 'variations.write') then
    raise exception 'Not authorized to link commercial items to variation lines';
  end if;

  if not public.can_insert_commercial_item_document_link(
    resolved_organization_id,
    resolved_commercial_item_id,
    'variation_line',
    resolved_variation_id,
    resolved_variation_line_id,
    resolved_link_role
  ) then
    raise exception 'Variation line must match the commercial item organization, project, opportunity, and variation scope';
  end if;

  update public.commercial_item_document_links as existing_link
  set
    snapshot_at_link_json = resolved_snapshot_json,
    link_role = resolved_link_role
  where existing_link.organization_id = resolved_organization_id
    and existing_link.commercial_item_id = resolved_commercial_item_id
    and existing_link.document_kind = 'variation_line'
    and existing_link.document_id = resolved_variation_id
    and existing_link.document_line_id = resolved_variation_line_id
  returning existing_link.* into inserted_row;

  if not found then
    insert into public.commercial_item_document_links (
      organization_id,
      commercial_item_id,
      document_kind,
      document_id,
      document_line_id,
      link_role,
      snapshot_at_link_json,
      created_by
    )
    values (
      resolved_organization_id,
      resolved_commercial_item_id,
      'variation_line',
      resolved_variation_id,
      resolved_variation_line_id,
      resolved_link_role,
      resolved_snapshot_json,
      actor_user_id
    )
    returning * into inserted_row;
  end if;

  return query
  select
    inserted_row.id,
    inserted_row.organization_id,
    inserted_row.commercial_item_id,
    inserted_row.document_kind,
    inserted_row.document_id,
    inserted_row.document_line_id,
    inserted_row.link_role,
    inserted_row.snapshot_at_link_json,
    inserted_row.created_by,
    inserted_row.created_at;
end;
$$;

grant execute on function public.link_commercial_item_to_variation_line(jsonb) to authenticated;
