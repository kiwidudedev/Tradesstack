alter table public.supplier_invoice_line_allocations
  drop constraint if exists supplier_invoice_line_allocations_review_status_check;

alter table public.supplier_invoice_line_allocations
  add constraint supplier_invoice_line_allocations_review_status_check
  check (
    review_status in (
      'pending',
      'reviewed',
      'needs_cost_review',
      'needs_accounting_review',
      'auto_approved',
      'resolved',
      'needs_routing_review',
      'needs_accounting_mapping',
      'high_value_review',
      'disputed'
    )
  );

create or replace function public.prepare_supplier_invoice_line_allocation_review_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  review_fields_changed boolean := false;
begin
  new.approval_notes := coalesce(new.approval_notes, '');
  new.approval_checks_json := coalesce(new.approval_checks_json, '{}'::jsonb);
  new.ai_suggestion_metadata_json := coalesce(new.ai_suggestion_metadata_json, '{}'::jsonb);

  if tg_op = 'INSERT' then
    review_fields_changed := true;
  else
    review_fields_changed := (
      new.review_status is distinct from old.review_status
      or new.approval_status is distinct from old.approval_status
      or new.approval_notes is distinct from old.approval_notes
      or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
      or new.reviewed_at is distinct from old.reviewed_at
      or new.approved_by_user_id is distinct from old.approved_by_user_id
      or new.approved_at is distinct from old.approved_at
      or new.approval_checks_json is distinct from old.approval_checks_json
    );
  end if;

  if review_fields_changed
    and new.review_status in (
      'reviewed',
      'needs_cost_review',
      'needs_accounting_review',
      'resolved',
      'needs_routing_review',
      'needs_accounting_mapping',
      'high_value_review',
      'disputed'
    )
    and auth.uid() is not null
    and not public.has_org_permission(new.organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to review supplier invoice line allocations.';
  end if;

  if review_fields_changed
    and new.approval_status in ('approved', 'disputed')
    and auth.uid() is not null
    and not public.has_org_permission(new.organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to approve supplier invoice line allocations.';
  end if;

  if new.approval_status = 'pending' then
    new.approved_by_user_id := null;
    new.approved_at := null;
  elsif new.approved_at is null then
    new.approved_at := now();
  end if;

  if new.review_status in ('pending', 'auto_approved') then
    new.reviewed_by_user_id := null;
    new.reviewed_at := null;
  elsif new.reviewed_at is null then
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.resolve_default_tradesstack_accounting_mapping(
  p_organization_id uuid,
  p_tradesstack_cost_code integer,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_mapping_id uuid := null;
  provider_count integer := 0;
begin
  with matching as (
    select
      m.id,
      m.provider,
      m.project_id,
      m.updated_at
    from public.organization_tradesstack_accounting_mappings m
    where m.organization_id = p_organization_id
      and m.tradesstack_cost_code = p_tradesstack_cost_code
      and m.is_active = true
      and (m.project_id = p_project_id or m.project_id is null)
    order by
      case when p_project_id is not null and m.project_id = p_project_id then 0 else 1 end,
      m.updated_at desc,
      m.id desc
  )
  select count(distinct provider)
  into provider_count
  from matching;

  if provider_count = 1 then
    select id
    into resolved_mapping_id
    from (
      select *
      from public.organization_tradesstack_accounting_mappings m
      where m.organization_id = p_organization_id
        and m.tradesstack_cost_code = p_tradesstack_cost_code
        and m.is_active = true
        and (m.project_id = p_project_id or m.project_id is null)
      order by
        case when p_project_id is not null and m.project_id = p_project_id then 0 else 1 end,
        m.updated_at desc,
        m.id desc
      limit 1
    ) picked;
  end if;

  return resolved_mapping_id;
end;
$$;

create or replace function public.resolve_cost_item_financial_routing_defaults(
  p_organization_id uuid,
  p_project_id uuid,
  p_source_document_kind text,
  p_source_line_table text default null,
  p_origin_kind text default null,
  p_item_type text default null,
  p_category text default null,
  p_section text default null,
  p_title text default null,
  p_description text default null,
  p_amount numeric default null
)
returns table (
  tradesstack_cost_code integer,
  tradesstack_cost_code_label text,
  financial_routing_confidence numeric,
  financial_routing_source text,
  review_status text,
  review_reason text,
  accounting_mapping_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_source_document_kind text := lower(trim(coalesce(p_source_document_kind, '')));
  normalized_origin_kind text := lower(trim(coalesce(p_origin_kind, '')));
  normalized_item_type text := lower(trim(coalesce(p_item_type, '')));
  normalized_category text := lower(trim(coalesce(p_category, '')));
  normalized_section text := lower(trim(coalesce(p_section, '')));
  combined_text text := lower(
    trim(
      concat_ws(
        ' ',
        coalesce(p_section, ''),
        coalesce(p_category, ''),
        coalesce(p_title, ''),
        coalesce(p_description, '')
      )
    )
  );
  resolved_code integer := null;
  resolved_label text := null;
  resolved_confidence numeric := null;
  resolved_source text := null;
  resolved_review_status text := null;
  resolved_review_reason text := null;
  resolved_accounting_mapping_id uuid := null;
  high_value boolean := coalesce(p_amount, 0) >= 25000;
begin
  if normalized_source_document_kind = 'project_claim' then
    resolved_code := 600;
    resolved_label := 'Payment Claims';
    resolved_confidence := 0.99;
    resolved_source := 'payment_claim';
  elsif normalized_origin_kind = 'time_sheet_sync' then
    resolved_code := 200;
    resolved_label := 'Labour';
    resolved_confidence := 0.99;
    resolved_source := 'labour_context';
  elsif normalized_category in ('materials', 'material') or normalized_section in ('materials', 'material') then
    resolved_code := 100;
    resolved_label := 'Materials';
    resolved_confidence := 0.99;
    resolved_source := 'rules';
  elsif normalized_category in ('labour', 'labor') or normalized_section in ('labour', 'labor') then
    resolved_code := 200;
    resolved_label := 'Labour';
    resolved_confidence := 0.99;
    resolved_source := 'labour_context';
  elsif normalized_category in ('subcontractor', 'sub contractor', 'subcontractors', 'sub contractors', 'subbie', 'subbies')
    or normalized_section in ('subcontractor', 'sub contractor', 'subcontractors', 'sub contractors', 'subbie', 'subbies') then
    resolved_code := 300;
    resolved_label := 'Subcontractors';
    resolved_confidence := 0.99;
    resolved_source := 'subcontract_context';
  elsif normalized_category in ('plant', 'equipment', 'plant & equipment', 'plant and equipment', 'scaffold', 'scaffolding')
    or normalized_section in ('plant', 'equipment', 'plant & equipment', 'plant and equipment', 'scaffold', 'scaffolding') then
    resolved_code := 400;
    resolved_label := 'Plant & Equipment';
    resolved_confidence := 0.99;
    resolved_source := 'plant_hire';
  elsif normalized_category in ('overhead', 'overheads', 'preliminaries', 'preliminary', 'general expenses', 'general expense', 'margin', 'admin', 'administration')
    or normalized_section in ('overhead', 'overheads', 'preliminaries', 'preliminary', 'general expenses', 'general expense', 'margin', 'admin', 'administration') then
    resolved_code := 500;
    resolved_label := 'Overheads';
    resolved_confidence := 0.97;
    resolved_source := 'rules';
  elsif normalized_category in ('payment claim', 'payment claims', 'progress claim', 'progress claims')
    or normalized_section in ('payment claim', 'payment claims', 'progress claim', 'progress claims') then
    resolved_code := 600;
    resolved_label := 'Payment Claims';
    resolved_confidence := 0.99;
    resolved_source := 'payment_claim';
  elsif normalized_category in ('retention', 'retentions', 'retention release', 'holdback')
    or normalized_section in ('retention', 'retentions', 'retention release', 'holdback') then
    resolved_code := 700;
    resolved_label := 'Retentions';
    resolved_confidence := 0.99;
    resolved_source := 'retention_workflow';
  elsif combined_text ~ '\b(subcontract|subbie|subcontractor|vendor package|supply and install|supply \& install)\b' then
    resolved_code := 300;
    resolved_label := 'Subcontractors';
    resolved_confidence := 0.94;
    resolved_source := 'subcontract_context';
  elsif combined_text ~ '\b(payment claim|progress claim|claim schedule)\b' then
    resolved_code := 600;
    resolved_label := 'Payment Claims';
    resolved_confidence := 0.97;
    resolved_source := 'payment_claim';
  elsif combined_text ~ '\b(retention|retained|holdback|release of retention)\b' then
    resolved_code := 700;
    resolved_label := 'Retentions';
    resolved_confidence := 0.97;
    resolved_source := 'retention_workflow';
  elsif combined_text ~ '\b(scaffold|scaffolding|crane|lift hire|plant hire|equipment hire|telehandler|excavator|generator hire|hire)\b' then
    resolved_code := 400;
    resolved_label := 'Plant & Equipment';
    resolved_confidence := 0.92;
    resolved_source := 'plant_hire';
  elsif combined_text ~ '\b(labour|labor|install|installation|crew|hours|hourly|timesheet)\b' then
    resolved_code := 200;
    resolved_label := 'Labour';
    resolved_confidence := 0.92;
    resolved_source := 'labour_context';
  elsif combined_text ~ '\b(material|materials|product|products|supply|sheet|sheets|stud|studs|track|tracks|cladding|plasterboard|gib|coloursteel|timber|panel|panels)\b' then
    resolved_code := 100;
    resolved_label := 'Materials';
    resolved_confidence := 0.88;
    resolved_source := 'rules';
  elsif combined_text ~ '\b(prelim|preliminary|site office|admin|insurance|permit|compliance|office|margin)\b' then
    resolved_code := 500;
    resolved_label := 'Overheads';
    resolved_confidence := 0.82;
    resolved_source := 'rules';
  else
    resolved_code := 800;
    resolved_label := 'Others';
    resolved_confidence := 0.35;
    resolved_source := 'ai_fallback';
    resolved_review_status := case when high_value then 'high_value_review' else 'needs_routing_review' end;
    resolved_review_reason := case
      when high_value then 'High-value item needs routing review.'
      else 'Routing context was ambiguous.'
    end;
  end if;

  if resolved_review_status is null then
    resolved_review_status := case when high_value then 'high_value_review' else 'auto_approved' end;
    resolved_review_reason := case
      when high_value then 'High-value item requires reviewer acknowledgement.'
      else null
    end;
  end if;

  resolved_accounting_mapping_id := public.resolve_default_tradesstack_accounting_mapping(
    p_organization_id,
    resolved_code,
    p_project_id
  );

  if resolved_review_status = 'auto_approved' and resolved_accounting_mapping_id is null then
    resolved_review_status := 'needs_accounting_mapping';
    resolved_review_reason := 'Missing accounting mapping for TradesStack routing code.';
  end if;

  return query
  select
    resolved_code,
    resolved_label,
    resolved_confidence,
    resolved_source,
    resolved_review_status,
    resolved_review_reason,
    resolved_accounting_mapping_id;
end;
$$;

create or replace function public.upsert_opportunity_quote_cost_items(
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
begin
  select *
  into resolved_context
  from public.resolve_cost_item_document_context('opportunity_quote', p_document_id)
  limit 1;

  if resolved_context.organization_id is null or resolved_context.project_id is null then
    raise exception 'Opportunity quote not found, not authorized, or missing workspace project for CostItem mirror write';
  end if;

  delete from public.cost_items ci
  where ci.source_document_kind = 'opportunity_quote'
    and ci.source_document_id = p_document_id
    and ci.source_revision_key = p_source_revision_key;

  with current_lines as (
    select
      q.organization_id,
      o.workspace_project_id as project_id,
      q.id as document_id,
      q.quote_number as document_number,
      q.quote_title as document_title,
      q.opportunity_id,
      o.opportunity_code,
      o.name as opportunity_name,
      li.id as line_item_id,
      li.section,
      li.description,
      li.quantity,
      li.unit,
      li.rate as unit_rate,
      coalesce(li.total, round(li.quantity * li.rate, 2)) as line_total,
      coalesce(li.is_optional, false) as is_optional,
      li.sort_order,
      public.compute_cost_item_source_fingerprint(
        'opportunity_quote',
        'opportunity_quote_line_items',
        li.section,
        li.description,
        li.quantity,
        li.unit,
        li.rate,
        coalesce(li.total, round(li.quantity * li.rate, 2)),
        coalesce(li.is_optional, false),
        li.sort_order,
        '',
        ''
      ) as source_fingerprint
    from public.opportunity_quotes q
    join public.organization_opportunities o
      on o.id = q.opportunity_id
     and o.organization_id = q.organization_id
    join public.opportunity_quote_line_items li
      on li.organization_id = q.organization_id
     and li.quote_id = q.id
    where q.id = p_document_id
      and q.organization_id = resolved_context.organization_id
      and o.workspace_project_id = resolved_context.project_id
  ), classified_lines as (
    select
      cl.*,
      routing.tradesstack_cost_code,
      routing.tradesstack_cost_code_label,
      routing.financial_routing_confidence,
      routing.financial_routing_source,
      routing.review_status,
      routing.review_reason,
      routing.accounting_mapping_id
    from current_lines cl
    cross join lateral public.resolve_cost_item_financial_routing_defaults(
      cl.organization_id,
      cl.project_id,
      'opportunity_quote',
      'opportunity_quote_line_items',
      'manual',
      'line_item',
      cl.section,
      cl.section,
      cl.description,
      cl.description,
      cl.line_total
    ) routing
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
    tradesstack_cost_code,
    tradesstack_cost_code_label,
    financial_routing_confidence,
    financial_routing_source,
    accounting_mapping_id,
    review_status,
    review_reason,
    ai_construction_intelligence,
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
    linked_opportunity_quote_line_item_id,
    created_by
  )
  select
    cl.organization_id,
    cl.project_id,
    'opportunity_quote',
    cl.document_id,
    'opportunity_quote_line_items',
    cl.line_item_id,
    prev.id,
    'manual',
    jsonb_build_object(
      'document_kind', 'opportunity_quote',
      'document_number', cl.document_number,
      'document_title', cl.document_title,
      'opportunity_id', cl.opportunity_id,
      'opportunity_code', cl.opportunity_code,
      'opportunity_name', cl.opportunity_name,
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
    cl.tradesstack_cost_code,
    cl.tradesstack_cost_code_label,
    cl.financial_routing_confidence,
    cl.financial_routing_source,
    cl.accounting_mapping_id,
    cl.review_status,
    cl.review_reason,
    '{}'::jsonb,
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
    auth.uid()
  from classified_lines cl
  left join lateral (
    select ci.id
    from public.cost_items ci
    where ci.source_document_kind = 'opportunity_quote'
      and ci.source_document_id = cl.document_id
      and ci.source_revision_key <> p_source_revision_key
      and ci.source_fingerprint = cl.source_fingerprint
    order by ci.effective_from desc, ci.created_at desc
    limit 1
  ) prev on true;

  get diagnostics rows_written = row_count;
  return rows_written;
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
  if p_document_kind = 'project_variation' then
    return public.upsert_cost_items_for_project_variation(p_document_id, p_source_revision_key);
  end if;

  if p_document_kind = 'project_purchase_order' then
    return public.upsert_cost_items_for_project_purchase_order(p_document_id, p_source_revision_key);
  end if;

  if p_document_kind = 'project_claim' then
    return public.upsert_cost_items_for_project_claim(p_document_id, p_source_revision_key);
  end if;

  if p_document_kind <> 'project_quote' then
    raise exception 'Unsupported CostItem document kind for mirror write: %', p_document_kind;
  end if;

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
  ), classified_lines as (
    select
      cl.*,
      routing.tradesstack_cost_code,
      routing.tradesstack_cost_code_label,
      routing.financial_routing_confidence,
      routing.financial_routing_source,
      routing.review_status,
      routing.review_reason,
      routing.accounting_mapping_id
    from current_lines cl
    cross join lateral public.resolve_cost_item_financial_routing_defaults(
      cl.organization_id,
      cl.project_id,
      'project_quote',
      'project_quote_line_items',
      'manual',
      'line_item',
      cl.section,
      cl.section,
      cl.description,
      cl.description,
      cl.line_total
    ) routing
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
    tradesstack_cost_code,
    tradesstack_cost_code_label,
    financial_routing_confidence,
    financial_routing_source,
    accounting_mapping_id,
    review_status,
    review_reason,
    ai_construction_intelligence,
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
    cl.tradesstack_cost_code,
    cl.tradesstack_cost_code_label,
    cl.financial_routing_confidence,
    cl.financial_routing_source,
    cl.accounting_mapping_id,
    cl.review_status,
    cl.review_reason,
    '{}'::jsonb,
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
  from classified_lines cl
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
  ), classified_lines as (
    select
      cl.*,
      routing.tradesstack_cost_code,
      routing.tradesstack_cost_code_label,
      routing.financial_routing_confidence,
      routing.financial_routing_source,
      routing.review_status,
      routing.review_reason,
      routing.accounting_mapping_id
    from current_lines cl
    cross join lateral public.resolve_cost_item_financial_routing_defaults(
      cl.organization_id,
      cl.project_id,
      'project_variation',
      'project_variation_line_items',
      case
        when cl.source_project_quote_line_item_id is not null then 'system'
        when cl.source_purchase_order_line_item_id is not null then 'purchase_order_import'
        else 'manual'
      end,
      'line_item',
      cl.section,
      cl.section,
      cl.description,
      cl.description,
      cl.line_total
    ) routing
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
    tradesstack_cost_code,
    tradesstack_cost_code_label,
    financial_routing_confidence,
    financial_routing_source,
    accounting_mapping_id,
    review_status,
    review_reason,
    ai_construction_intelligence,
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
    cl.tradesstack_cost_code,
    cl.tradesstack_cost_code_label,
    cl.financial_routing_confidence,
    cl.financial_routing_source,
    cl.accounting_mapping_id,
    cl.review_status,
    cl.review_reason,
    '{}'::jsonb,
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
  from classified_lines cl
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

create or replace function public.sync_purchase_order_line_cost_item(
  p_purchase_order_line_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  line_row record;
  resolved_cost_item_id uuid;
  resolved_parent_cost_item_id uuid;
  resolved_fingerprint text;
  resolved_routing record;
begin
  select
    po.organization_id,
    po.project_id,
    po.id as purchase_order_id,
    po.purchase_order_number,
    po.purchase_order_title,
    po.supplier_id,
    po.issued_to_label,
    li.id as line_item_id,
    li.line_uid,
    li.cost_item_id,
    li.source_cost_item_id,
    li.section,
    li.description,
    li.quantity,
    li.unit,
    li.rate as unit_rate,
    coalesce(li.total, round(li.quantity * li.rate, 2)) as line_total,
    li.sort_order,
    li.source_time_sheet_entry_id
  into line_row
  from public.project_purchase_order_line_items li
  join public.project_purchase_orders po
    on po.id = li.purchase_order_id
   and po.organization_id = li.organization_id
   and po.project_id = li.project_id
  where li.id = p_purchase_order_line_item_id;

  if not found then
    return null;
  end if;

  select *
  into resolved_routing
  from public.resolve_cost_item_financial_routing_defaults(
    line_row.organization_id,
    line_row.project_id,
    'project_purchase_order',
    'project_purchase_order_line_items',
    case when line_row.source_time_sheet_entry_id is not null then 'time_sheet_sync' else 'manual' end,
    'line_item',
    line_row.section,
    line_row.section,
    line_row.description,
    line_row.description,
    line_row.line_total
  );

  resolved_fingerprint := public.compute_cost_item_source_fingerprint(
    'project_purchase_order',
    'project_purchase_order_line_items',
    line_row.section,
    line_row.description,
    line_row.quantity,
    line_row.unit,
    line_row.unit_rate,
    line_row.line_total,
    false,
    line_row.sort_order,
    coalesce(line_row.source_time_sheet_entry_id::text, ''),
    coalesce(line_row.line_uid::text, '')
  );

  resolved_parent_cost_item_id := null;

  if line_row.source_time_sheet_entry_id is not null then
    select ci.id
    into resolved_parent_cost_item_id
    from public.cost_items ci
    where ci.organization_id = line_row.organization_id
      and ci.project_id = line_row.project_id
      and ci.is_current = true
      and ci.source_document_kind <> 'project_purchase_order'
      and ci.source_snapshot ->> 'source_time_sheet_entry_id' = line_row.source_time_sheet_entry_id::text
    order by ci.effective_from desc, ci.created_at desc
    limit 1;
  end if;

  if resolved_parent_cost_item_id is null and line_row.source_cost_item_id is not null then
    select ci.id
    into resolved_parent_cost_item_id
    from public.cost_items ci
    where ci.id = line_row.source_cost_item_id
      and ci.organization_id = line_row.organization_id
      and ci.project_id = line_row.project_id
      and ci.is_current = true
    limit 1;
  end if;

  resolved_cost_item_id := line_row.cost_item_id;

  if resolved_cost_item_id is not null then
    update public.cost_items
    set
      organization_id = line_row.organization_id,
      project_id = line_row.project_id,
      source_document_kind = 'project_purchase_order',
      source_document_id = line_row.purchase_order_id,
      source_line_table = 'project_purchase_order_line_items',
      source_line_id = line_row.line_item_id,
      parent_cost_item_id = resolved_parent_cost_item_id,
      origin_kind = case
        when line_row.source_time_sheet_entry_id is not null then 'time_sheet_sync'
        else 'manual'
      end,
      source_snapshot = jsonb_build_object(
        'document_kind', 'project_purchase_order',
        'document_number', line_row.purchase_order_number,
        'document_title', line_row.purchase_order_title,
        'line_item_id', line_row.line_item_id,
        'line_uid', line_row.line_uid,
        'supplier_id', line_row.supplier_id,
        'issued_to_label', line_row.issued_to_label,
        'source_cost_item_id', line_row.source_cost_item_id,
        'source_time_sheet_entry_id', line_row.source_time_sheet_entry_id
      ),
      supplier_id = line_row.supplier_id,
      supplier_name_snapshot = line_row.issued_to_label,
      tradesstack_cost_code = resolved_routing.tradesstack_cost_code,
      tradesstack_cost_code_label = resolved_routing.tradesstack_cost_code_label,
      financial_routing_confidence = resolved_routing.financial_routing_confidence,
      financial_routing_source = resolved_routing.financial_routing_source,
      accounting_mapping_id = resolved_routing.accounting_mapping_id,
      review_status = resolved_routing.review_status,
      review_reason = resolved_routing.review_reason,
      ai_construction_intelligence = coalesce(ai_construction_intelligence, '{}'::jsonb),
      title = coalesce(nullif(btrim(line_row.description), ''), 'Untitled line item'),
      description = coalesce(line_row.description, ''),
      quantity = line_row.quantity,
      unit = line_row.unit,
      unit_rate = line_row.unit_rate,
      line_total = line_row.line_total,
      sort_order = line_row.sort_order,
      source_fingerprint = resolved_fingerprint,
      linked_purchase_order_line_item_id = line_row.line_item_id,
      status = 'active',
      effective_to = null,
      is_current = true
    where id = resolved_cost_item_id;

    if found then
      update public.project_purchase_order_line_items
      set cost_item_id = resolved_cost_item_id
      where id = line_row.line_item_id
        and cost_item_id is distinct from resolved_cost_item_id;

      return resolved_cost_item_id;
    end if;
  end if;

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
    supplier_id,
    supplier_name_snapshot,
    tradesstack_cost_code,
    tradesstack_cost_code_label,
    financial_routing_confidence,
    financial_routing_source,
    accounting_mapping_id,
    review_status,
    review_reason,
    ai_construction_intelligence,
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
  values (
    line_row.organization_id,
    line_row.project_id,
    'project_purchase_order',
    line_row.purchase_order_id,
    'project_purchase_order_line_items',
    line_row.line_item_id,
    resolved_parent_cost_item_id,
    case
      when line_row.source_time_sheet_entry_id is not null then 'time_sheet_sync'
      else 'manual'
    end,
    jsonb_build_object(
      'document_kind', 'project_purchase_order',
      'document_number', line_row.purchase_order_number,
      'document_title', line_row.purchase_order_title,
      'line_item_id', line_row.line_item_id,
      'line_uid', line_row.line_uid,
      'supplier_id', line_row.supplier_id,
      'issued_to_label', line_row.issued_to_label,
      'source_cost_item_id', line_row.source_cost_item_id,
      'source_time_sheet_entry_id', line_row.source_time_sheet_entry_id
    ),
    '',
    'line_item',
    line_row.section,
    line_row.section,
    null,
    null,
    '',
    '',
    line_row.supplier_id,
    line_row.issued_to_label,
    resolved_routing.tradesstack_cost_code,
    resolved_routing.tradesstack_cost_code_label,
    resolved_routing.financial_routing_confidence,
    resolved_routing.financial_routing_source,
    resolved_routing.accounting_mapping_id,
    resolved_routing.review_status,
    resolved_routing.review_reason,
    '{}'::jsonb,
    coalesce(nullif(btrim(line_row.description), ''), 'Untitled line item'),
    coalesce(line_row.description, ''),
    line_row.quantity,
    line_row.unit,
    line_row.unit_rate,
    line_row.line_total,
    false,
    line_row.sort_order,
    'active',
    clock_timestamp(),
    null,
    true,
    'line-sync',
    resolved_fingerprint,
    null,
    null,
    line_row.line_item_id,
    null,
    auth.uid()
  )
  returning id into resolved_cost_item_id;

  update public.project_purchase_order_line_items
  set cost_item_id = resolved_cost_item_id
  where id = line_row.line_item_id
    and cost_item_id is distinct from resolved_cost_item_id;

  return resolved_cost_item_id;
end;
$$;

create or replace function public.upsert_cost_items_for_project_purchase_order(
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
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into resolved_context
  from public.resolve_cost_item_document_context('project_purchase_order', p_document_id);

  if resolved_context.organization_id is null then
    raise exception 'Document context not found for cost item sync.';
  end if;

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
      li.line_uid,
      li.cost_item_id as previous_cost_item_id,
      li.source_cost_item_id,
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
        coalesce(li.line_uid::text, '')
      ) as source_fingerprint
    from public.project_purchase_orders po
    join public.project_purchase_order_line_items li
      on li.organization_id = po.organization_id
     and li.project_id = po.project_id
     and li.purchase_order_id = po.id
    where po.id = p_document_id
      and po.organization_id = resolved_context.organization_id
      and po.project_id = resolved_context.project_id
  ), classified_lines as (
    select
      cl.*,
      routing.tradesstack_cost_code,
      routing.tradesstack_cost_code_label,
      routing.financial_routing_confidence,
      routing.financial_routing_source,
      routing.review_status,
      routing.review_reason,
      routing.accounting_mapping_id
    from current_lines cl
    cross join lateral public.resolve_cost_item_financial_routing_defaults(
      cl.organization_id,
      cl.project_id,
      'project_purchase_order',
      'project_purchase_order_line_items',
      case when cl.source_time_sheet_entry_id is not null then 'time_sheet_sync' else 'manual' end,
      'line_item',
      cl.section,
      cl.section,
      cl.description,
      cl.description,
      cl.line_total
    ) routing
  ), inserted_cost_items as (
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
      supplier_id,
      supplier_name_snapshot,
      tradesstack_cost_code,
      tradesstack_cost_code_label,
      financial_routing_confidence,
      financial_routing_source,
      accounting_mapping_id,
      review_status,
      review_reason,
      ai_construction_intelligence,
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
      coalesce(time_sheet_parent.id, explicit_parent.id),
      case
        when cl.source_time_sheet_entry_id is not null then 'time_sheet_sync'
        else 'manual'
      end,
      jsonb_build_object(
        'document_kind', 'project_purchase_order',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'line_item_id', cl.line_item_id,
        'line_uid', cl.line_uid,
        'supplier_id', cl.supplier_id,
        'issued_to_label', cl.issued_to_label,
        'source_cost_item_id', cl.source_cost_item_id,
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
      cl.supplier_id,
      cl.issued_to_label,
      cl.tradesstack_cost_code,
      cl.tradesstack_cost_code_label,
      cl.financial_routing_confidence,
      cl.financial_routing_source,
      cl.accounting_mapping_id,
      cl.review_status,
      cl.review_reason,
      '{}'::jsonb,
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
    from classified_lines cl
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.organization_id = cl.organization_id
        and ci.project_id = cl.project_id
        and ci.is_current = true
        and ci.source_document_kind <> 'project_purchase_order'
        and cl.source_time_sheet_entry_id is not null
        and ci.source_snapshot ->> 'source_time_sheet_entry_id' = cl.source_time_sheet_entry_id::text
      order by ci.effective_from desc, ci.created_at desc
      limit 1
    ) time_sheet_parent on true
    left join lateral (
      select ci.id
      from public.cost_items ci
      where ci.id = cl.source_cost_item_id
        and ci.organization_id = cl.organization_id
        and ci.project_id = cl.project_id
        and ci.is_current = true
      limit 1
    ) explicit_parent on true
    returning id, linked_purchase_order_line_item_id
  )
  update public.project_purchase_order_line_items li
  set cost_item_id = inserted_cost_items.id
  from inserted_cost_items
  where li.id = inserted_cost_items.linked_purchase_order_line_item_id
    and li.cost_item_id is distinct from inserted_cost_items.id;

  get diagnostics rows_written = row_count;
  return rows_written;
end;
$$;

create or replace function public.upsert_cost_items_for_project_claim(
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
begin
  select *
  into resolved_context
  from public.resolve_cost_item_document_context('project_claim', p_document_id)
  limit 1;

  if resolved_context.organization_id is null then
    raise exception 'Document not found or not authorized for claim CostItem mirror write';
  end if;

  delete from public.cost_items ci
  where ci.source_document_kind = 'project_claim'
    and ci.source_document_id = p_document_id
    and ci.source_revision_key = p_source_revision_key;

  with current_lines as (
    select
      c.organization_id,
      c.project_id,
      c.id as document_id,
      c.claim_number as document_number,
      c.claim_title as document_title,
      cli.id as claim_line_item_id,
      cli.line_uid,
      cli.source_kind,
      cli.source_document_id,
      cli.source_line_item_id,
      cli.source_number,
      cli.source_title,
      cli.source_cost_item_id,
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
        coalesce(cli.line_uid::text, cli.source_line_item_id::text)
      ) as source_fingerprint
    from public.project_claims c
    join public.project_claim_line_items cli
      on cli.organization_id = c.organization_id
     and cli.project_id = c.project_id
     and cli.claim_id = c.id
    where c.id = p_document_id
      and c.organization_id = resolved_context.organization_id
      and c.project_id = resolved_context.project_id
  ), classified_lines as (
    select
      cl.*,
      routing.tradesstack_cost_code,
      routing.tradesstack_cost_code_label,
      routing.financial_routing_confidence,
      routing.financial_routing_source,
      routing.review_status,
      routing.review_reason,
      routing.accounting_mapping_id
    from current_lines cl
    cross join lateral public.resolve_cost_item_financial_routing_defaults(
      cl.organization_id,
      cl.project_id,
      'project_claim',
      'project_claim_line_items',
      'claim_snapshot',
      'claim_snapshot',
      cl.section,
      cl.section,
      cl.description,
      cl.description,
      cl.claim_amount
    ) routing
  ), inserted_cost_items as (
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
      tradesstack_cost_code,
      tradesstack_cost_code_label,
      financial_routing_confidence,
      financial_routing_source,
      accounting_mapping_id,
      review_status,
      review_reason,
      ai_construction_intelligence,
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
      parent_ci.id,
      'claim_snapshot',
      jsonb_build_object(
        'document_kind', 'project_claim',
        'document_number', cl.document_number,
        'document_title', cl.document_title,
        'claim_line_item_id', cl.claim_line_item_id,
        'line_uid', cl.line_uid,
        'source_kind', cl.source_kind,
        'source_document_id', cl.source_document_id,
        'source_line_item_id', cl.source_line_item_id,
        'source_number', cl.source_number,
        'source_title', cl.source_title,
        'source_cost_item_id', cl.source_cost_item_id,
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
      cl.tradesstack_cost_code,
      cl.tradesstack_cost_code_label,
      cl.financial_routing_confidence,
      cl.financial_routing_source,
      cl.accounting_mapping_id,
      cl.review_status,
      cl.review_reason,
      '{}'::jsonb,
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
    from classified_lines cl
    left join public.cost_items parent_ci
      on parent_ci.id = cl.source_cost_item_id
     and parent_ci.organization_id = cl.organization_id
     and parent_ci.project_id = cl.project_id
     and parent_ci.is_current = true
    returning id, linked_claim_line_item_id
  )
  update public.project_claim_line_items cli
  set cost_item_id = inserted_cost_items.id
  from inserted_cost_items
  where cli.id = inserted_cost_items.linked_claim_line_item_id
    and cli.cost_item_id is distinct from inserted_cost_items.id;

  get diagnostics rows_written = row_count;
  return rows_written;
end;
$$;

with repair_candidates as (
  select
    ci.id,
    ci.ai_construction_intelligence,
    routing.tradesstack_cost_code,
    routing.tradesstack_cost_code_label,
    routing.financial_routing_confidence,
    routing.financial_routing_source,
    routing.accounting_mapping_id,
    routing.review_status,
    routing.review_reason
  from public.cost_items ci
  cross join lateral public.resolve_cost_item_financial_routing_defaults(
    ci.organization_id,
    ci.project_id,
    ci.source_document_kind,
    ci.source_line_table,
    ci.origin_kind,
    ci.item_type,
    ci.category,
    ci.section,
    ci.title,
    ci.description,
    ci.line_total
  ) routing
  where ci.is_current = true
    and ci.status <> 'deleted'
    and ci.status <> 'superseded'
    and ci.tradesstack_cost_code is null
    and ci.source_document_kind in ('project_purchase_order', 'project_variation', 'project_claim', 'opportunity_quote', 'project_quote')
), repaired_cost_items as (
  update public.cost_items ci
  set
    tradesstack_cost_code = rc.tradesstack_cost_code,
    tradesstack_cost_code_label = rc.tradesstack_cost_code_label,
    financial_routing_confidence = rc.financial_routing_confidence,
    financial_routing_source = rc.financial_routing_source,
    accounting_mapping_id = rc.accounting_mapping_id,
    review_status = rc.review_status,
    review_reason = rc.review_reason,
    ai_construction_intelligence = coalesce(rc.ai_construction_intelligence, '{}'::jsonb)
  from repair_candidates rc
  where ci.id = rc.id
  returning ci.id
)
select count(*) from repaired_cost_items;

with allocation_candidates as (
  select
    a.id,
    a.ai_construction_intelligence,
    coalesce(source_ci.tradesstack_cost_code, cost_ci.tradesstack_cost_code, routing.tradesstack_cost_code) as next_tradesstack_cost_code,
    coalesce(source_ci.tradesstack_cost_code_label, cost_ci.tradesstack_cost_code_label, routing.tradesstack_cost_code_label) as next_tradesstack_cost_code_label,
    coalesce(source_ci.accounting_mapping_id, cost_ci.accounting_mapping_id, routing.accounting_mapping_id) as next_accounting_mapping_id,
    case
      when coalesce(source_ci.tradesstack_cost_code, cost_ci.tradesstack_cost_code, routing.tradesstack_cost_code) is null then 'needs_routing_review'
      when coalesce(source_ci.accounting_mapping_id, cost_ci.accounting_mapping_id, routing.accounting_mapping_id) is null
        and routing.review_status = 'auto_approved' then 'needs_accounting_mapping'
      else coalesce(routing.review_status, 'needs_routing_review')
    end as next_review_status,
    case
      when coalesce(source_ci.tradesstack_cost_code, cost_ci.tradesstack_cost_code, routing.tradesstack_cost_code) is null then 'Routing context was ambiguous.'
      when coalesce(source_ci.accounting_mapping_id, cost_ci.accounting_mapping_id, routing.accounting_mapping_id) is null
        and routing.review_status = 'auto_approved' then 'Missing accounting mapping for TradesStack routing code.'
      else routing.review_reason
    end as next_review_reason
  from public.supplier_invoice_line_allocations a
  join public.supplier_invoice_lines il
    on il.id = a.supplier_invoice_line_id
  left join public.project_purchase_order_line_items pol
    on pol.id = a.purchase_order_line_item_id
  left join public.cost_items cost_ci
    on cost_ci.id = a.cost_item_id
  left join public.cost_items source_ci
    on source_ci.id = a.source_cost_item_id
  cross join lateral public.resolve_cost_item_financial_routing_defaults(
    a.organization_id,
    a.project_id,
    coalesce(cost_ci.source_document_kind, 'supplier_invoice'),
    coalesce(cost_ci.source_line_table, 'supplier_invoice_line_allocations'),
    coalesce(cost_ci.origin_kind, 'manual'),
    'supplier_invoice_line_allocation',
    coalesce(pol.section, cost_ci.category, cost_ci.section),
    coalesce(pol.section, il.description),
    il.description,
    il.description,
    a.allocated_amount
  ) routing
  where a.tradesstack_cost_code is null
), repaired_allocations as (
  update public.supplier_invoice_line_allocations a
  set
    tradesstack_cost_code = ac.next_tradesstack_cost_code,
    tradesstack_cost_code_label = ac.next_tradesstack_cost_code_label,
    accounting_mapping_id = ac.next_accounting_mapping_id,
    review_status = ac.next_review_status,
    review_reason = ac.next_review_reason,
    ai_construction_intelligence = coalesce(ac.ai_construction_intelligence, '{}'::jsonb)
  from allocation_candidates ac
  where a.id = ac.id
  returning a.id
)
select count(*) from repaired_allocations;

with actual_cost_candidates as (
  select
    e.id,
    e.ai_construction_intelligence,
    a.tradesstack_cost_code,
    a.tradesstack_cost_code_label,
    a.accounting_mapping_id
  from public.project_actual_cost_events e
  join public.supplier_invoice_line_allocations a
    on a.id = e.supplier_invoice_line_allocation_id
  where e.tradesstack_cost_code is null
    and a.tradesstack_cost_code is not null
), repaired_actual_costs as (
  update public.project_actual_cost_events e
  set
    tradesstack_cost_code = ac.tradesstack_cost_code,
    tradesstack_cost_code_label = ac.tradesstack_cost_code_label,
    accounting_mapping_id = coalesce(ac.accounting_mapping_id, e.accounting_mapping_id),
    ai_construction_intelligence = coalesce(ac.ai_construction_intelligence, '{}'::jsonb)
  from actual_cost_candidates ac
  where e.id = ac.id
  returning e.id
)
select count(*) from repaired_actual_costs;
