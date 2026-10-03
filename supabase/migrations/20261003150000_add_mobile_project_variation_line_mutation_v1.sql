begin;

-- Extend the existing aggregated mobile detail payload with authoritative line
-- capability metadata.  A line is manual only when every current provenance
-- field is null; mobile may never edit or delete a provenance-bearing line.
create or replace function public.get_mobile_project_variation_detail_v1(
  p_project_id uuid,
  p_variation_id uuid
)
returns table (
  variation_id uuid,
  project_id uuid,
  variation_number text,
  variation_title text,
  status text,
  origin text,
  source_reference text,
  requested_by text,
  requested_date date,
  due_date date,
  sent_to_client_at timestamptz,
  client_viewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  invoice_ready boolean,
  invoice_reference text,
  notes text,
  labour_total numeric,
  materials_total numeric,
  subcontractors_total numeric,
  plant_total numeric,
  margin_total numeric,
  subtotal numeric,
  margin_percent numeric,
  discount_amount numeric,
  contingency_amount numeric,
  gst_percent numeric,
  gst_total numeric,
  total_variation_price numeric,
  include_margin_in_export boolean,
  include_discount_in_export boolean,
  include_contingency_in_export boolean,
  validity_period text,
  payment_terms text,
  lead_time text,
  terms_inclusions text,
  terms_exclusions text,
  clarifications text,
  assumptions text,
  line_items jsonb,
  attachments jsonb,
  status_events jsonb,
  can_edit boolean,
  can_change_status boolean,
  can_approve boolean,
  can_reject boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  current_context record;
  variation_row public.project_variations%rowtype;
  can_write boolean;
begin
  select * into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  select v.* into variation_row
  from public.project_variations v
  where v.organization_id = current_context.organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id;

  if not found then
    raise exception 'Variation not found for this project';
  end if;

  can_write := public.has_org_permission(current_context.organization_id, 'variations.write');

  return query
  select
    variation_row.id,
    variation_row.project_id,
    variation_row.variation_number,
    variation_row.variation_title,
    variation_row.status,
    variation_row.origin,
    variation_row.source_reference,
    variation_row.requested_by,
    variation_row.requested_date,
    variation_row.due_date,
    variation_row.sent_to_client_at,
    variation_row.client_viewed_at,
    variation_row.approved_at,
    variation_row.rejected_at,
    variation_row.invoice_ready,
    variation_row.invoice_reference,
    variation_row.notes,
    variation_row.labour_total,
    variation_row.materials_total,
    variation_row.subcontractors_total,
    variation_row.plant_total,
    variation_row.margin_total,
    variation_row.subtotal,
    variation_row.margin_percent,
    variation_row.discount_amount,
    variation_row.contingency_amount,
    variation_row.gst_percent,
    variation_row.gst_total,
    variation_row.total_variation_price,
    variation_row.include_margin_in_export,
    variation_row.include_discount_in_export,
    variation_row.include_contingency_in_export,
    variation_row.validity_period,
    variation_row.payment_terms,
    variation_row.lead_time,
    variation_row.terms_inclusions,
    variation_row.terms_exclusions,
    variation_row.clarifications,
    variation_row.assumptions,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', li.id,
          'section', li.section,
          'description', li.description,
          'quantity', li.quantity,
          'unit', li.unit,
          'rate', li.rate,
          'total', li.total,
          'sort_order', li.sort_order,
          'source_project_quote_id', li.source_project_quote_id,
          'source_project_quote_line_item_id', li.source_project_quote_line_item_id,
          'source_project_quote_number', li.source_project_quote_number,
          'source_purchase_order_id', li.source_purchase_order_id,
          'source_purchase_order_line_item_id', li.source_purchase_order_line_item_id,
          'source_purchase_order_number', li.source_purchase_order_number,
          'is_manual', (
            li.source_project_quote_id is null
            and li.source_project_quote_line_item_id is null
            and li.source_project_quote_number is null
            and li.source_purchase_order_id is null
            and li.source_purchase_order_line_item_id is null
            and li.source_purchase_order_number is null
          ),
          'is_editable', can_write and (
            li.source_project_quote_id is null
            and li.source_project_quote_line_item_id is null
            and li.source_project_quote_number is null
            and li.source_purchase_order_id is null
            and li.source_purchase_order_line_item_id is null
            and li.source_purchase_order_number is null
          ),
          'is_deletable', can_write and (
            li.source_project_quote_id is null
            and li.source_project_quote_line_item_id is null
            and li.source_project_quote_number is null
            and li.source_purchase_order_id is null
            and li.source_purchase_order_line_item_id is null
            and li.source_purchase_order_number is null
          ),
          'is_locked', not (
            li.source_project_quote_id is null
            and li.source_project_quote_line_item_id is null
            and li.source_project_quote_number is null
            and li.source_purchase_order_id is null
            and li.source_purchase_order_line_item_id is null
            and li.source_purchase_order_number is null
          ),
          'lock_reason', case
            when li.source_project_quote_id is not null
              or li.source_project_quote_line_item_id is not null
              or li.source_project_quote_number is not null then 'quote_lineage'
            when li.source_purchase_order_id is not null
              or li.source_purchase_order_line_item_id is not null
              or li.source_purchase_order_number is not null then 'purchase_order_lineage'
            else null
          end
        ) order by li.sort_order asc, li.created_at asc
      )
      from public.project_variation_line_items li
      where li.organization_id = current_context.organization_id
        and li.project_id = p_project_id
        and li.variation_id = variation_row.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', att.id,
          'file_name', att.file_name,
          'file_kind', att.file_kind,
          'notes', att.notes,
          'has_file', att.storage_path is not null,
          'has_external_url', public.is_safe_mobile_https_url(att.external_url),
          'created_at', att.created_at
        ) order by att.created_at asc
      )
      from public.project_variation_attachments att
      where att.organization_id = current_context.organization_id
        and att.project_id = p_project_id
        and att.variation_id = variation_row.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', se.id,
          'from_status', se.from_status,
          'to_status', se.to_status,
          'event_type', se.event_type,
          'changed_by', se.changed_by,
          'changed_at', se.changed_at,
          'occurred_at', se.occurred_at,
          'note', se.note,
          'metadata', se.metadata
        ) order by se.occurred_at asc, se.changed_at asc
      )
      from public.project_variation_status_events se
      where se.organization_id = current_context.organization_id
        and se.project_id = p_project_id
        and se.variation_id = variation_row.id
    ), '[]'::jsonb),
    can_write,
    can_write,
    can_write,
    can_write,
    variation_row.created_by,
    variation_row.created_at,
    variation_row.updated_at;
end;
$$;

create or replace function public.get_project_variation_mobile_edit_snapshot_v1(
  p_project_id uuid,
  p_variation_id uuid
)
returns table (
  variation_id uuid,
  project_id uuid,
  updated_at timestamptz,
  can_edit boolean,
  can_change_status boolean,
  can_approve boolean,
  can_reject boolean,
  is_locked boolean,
  lock_reason text,
  editable_fields jsonb,
  editable_actions jsonb
)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  current_context record;
  variation_row public.project_variations%rowtype;
  can_write boolean;
begin
  select * into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  select v.* into variation_row
  from public.project_variations v
  where v.organization_id = current_context.organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id;

  if not found then
    raise exception 'Variation not found for this project';
  end if;

  can_write := public.has_org_permission(current_context.organization_id, 'variations.write');

  return query
  select
    variation_row.id,
    variation_row.project_id,
    variation_row.updated_at,
    can_write,
    can_write,
    can_write,
    can_write,
    false,
    null::text,
    jsonb_build_array(
      'variation_title', 'origin', 'requested_by', 'requested_date',
      'due_date', 'notes', 'validity_period', 'payment_terms', 'lead_time',
      'terms_inclusions', 'terms_exclusions', 'clarifications', 'assumptions'
    ),
    case when can_write
      then jsonb_build_array('update_header', 'update_status', 'mutate_manual_line')
      else jsonb_build_array()
    end;
end;
$$;

create or replace function public.mobile_mutate_project_variation_manual_line_v1(
  p_project_id uuid,
  p_variation_id uuid,
  p_expected_updated_at timestamptz,
  p_operation text,
  p_line_item_id uuid,
  p_section text,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_rate numeric,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_context record;
  variation_row public.project_variations%rowtype;
  target_line public.project_variation_line_items%rowtype;
  operation_normalized text := lower(coalesce(p_operation, ''));
  section_normalized text;
  description_normalized text;
  unit_normalized text;
  resolved_sort_order integer;
  next_line_id uuid;
  mutable_line_items jsonb := '[]'::jsonb;
  preserved_attachments jsonb := '[]'::jsonb;
  detail_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Variation version is required. Please refresh and try again.'
      using errcode = '40001';
  end if;

  if operation_normalized not in ('add', 'edit', 'delete') then
    raise exception 'Operation must be add, edit, or delete';
  end if;

  select * into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  if not public.has_org_permission(current_context.organization_id, 'variations.write') then
    raise exception 'Not authorized to edit variations for this organization';
  end if;

  select * into variation_row
  from public.project_variations v
  where v.organization_id = current_context.organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id
  for update;

  if not found then
    raise exception 'Variation not found for this project';
  end if;

  if variation_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This variation was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  if operation_normalized = 'add' and p_line_item_id is not null then
    raise exception 'Line id must be omitted for add';
  end if;

  if operation_normalized in ('edit', 'delete') then
    if p_line_item_id is null then
      raise exception 'Line item id is required for edit or delete';
    end if;

    select * into target_line
    from public.project_variation_line_items li
    where li.organization_id = current_context.organization_id
      and li.project_id = p_project_id
      and li.variation_id = p_variation_id
      and li.id = p_line_item_id
    for update;

    if not found then
      raise exception 'Line item not found for this Variation';
    end if;

    if target_line.source_project_quote_id is not null
      or target_line.source_project_quote_line_item_id is not null
      or target_line.source_project_quote_number is not null
      or target_line.source_purchase_order_id is not null
      or target_line.source_purchase_order_line_item_id is not null
      or target_line.source_purchase_order_number is not null then
      raise exception 'Provenance-bearing Variation lines cannot be edited or deleted from mobile';
    end if;
  end if;

  if operation_normalized in ('add', 'edit') then
    if p_section not in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then
      raise exception 'Section must be one of Labour, Materials, Subcontractors, Plant, or Margin';
    end if;

    if p_quantity is null then
      raise exception 'Quantity is required';
    end if;

    if p_rate is null then
      raise exception 'Rate is required';
    end if;

    if p_sort_order is not null and p_sort_order < 0 then
      raise exception 'Sort order must be zero or greater';
    end if;

    section_normalized := p_section;
    description_normalized := coalesce(p_description, '');
    unit_normalized := coalesce(p_unit, '');
  end if;

  if operation_normalized = 'add' then
    next_line_id := gen_random_uuid();
    select coalesce(max(li.sort_order), -1) + 1
    into resolved_sort_order
    from public.project_variation_line_items li
    where li.organization_id = current_context.organization_id
      and li.project_id = p_project_id
      and li.variation_id = p_variation_id;
    resolved_sort_order := coalesce(p_sort_order, resolved_sort_order);
  elsif operation_normalized = 'edit' then
    next_line_id := target_line.id;
    resolved_sort_order := coalesce(p_sort_order, target_line.sort_order);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', li.id,
        'section', case when operation_normalized = 'edit' and li.id = target_line.id then section_normalized else li.section end,
        'description', case when operation_normalized = 'edit' and li.id = target_line.id then description_normalized else li.description end,
        'quantity', case when operation_normalized = 'edit' and li.id = target_line.id then p_quantity else li.quantity end,
        'unit', case when operation_normalized = 'edit' and li.id = target_line.id then unit_normalized else li.unit end,
        'rate', case when operation_normalized = 'edit' and li.id = target_line.id then p_rate else li.rate end,
        'total', case when operation_normalized = 'edit' and li.id = target_line.id then null else li.total end,
        'sort_order', case when operation_normalized = 'edit' and li.id = target_line.id then resolved_sort_order else li.sort_order end,
        'sourceProjectQuoteId', li.source_project_quote_id,
        'sourceProjectQuoteLineItemId', li.source_project_quote_line_item_id,
        'sourceProjectQuoteNumber', li.source_project_quote_number,
        'sourcePurchaseOrderId', li.source_purchase_order_id,
        'sourcePurchaseOrderLineItemId', li.source_purchase_order_line_item_id,
        'sourcePurchaseOrderNumber', li.source_purchase_order_number
      )
      order by
        case when operation_normalized = 'edit' and li.id = target_line.id then resolved_sort_order else li.sort_order end,
        li.created_at,
        li.id
    ),
    '[]'::jsonb
  )
  into mutable_line_items
  from public.project_variation_line_items li
  where li.organization_id = current_context.organization_id
    and li.project_id = p_project_id
    and li.variation_id = p_variation_id
    and not (operation_normalized = 'delete' and li.id = target_line.id);

  if operation_normalized = 'add' then
    mutable_line_items := mutable_line_items || jsonb_build_array(
      jsonb_build_object(
        'id', next_line_id,
        'section', section_normalized,
        'description', description_normalized,
        'quantity', p_quantity,
        'unit', unit_normalized,
        'rate', p_rate,
        'sort_order', resolved_sort_order,
        'sourceProjectQuoteId', null,
        'sourceProjectQuoteLineItemId', null,
        'sourceProjectQuoteNumber', null,
        'sourcePurchaseOrderId', null,
        'sourcePurchaseOrderLineItemId', null,
        'sourcePurchaseOrderNumber', null
      )
    );
    select coalesce(
      jsonb_agg(item order by (item->>'sort_order')::integer, ordinality),
      '[]'::jsonb
    )
    into mutable_line_items
    from jsonb_array_elements(mutable_line_items) with ordinality as line(item, ordinality);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', att.id,
        'name', att.file_name,
        'type', att.file_kind,
        'storagePath', att.storage_path,
        'externalUrl', att.external_url,
        'notes', att.notes
      ) order by att.created_at asc
    ),
    '[]'::jsonb
  )
  into preserved_attachments
  from public.project_variation_attachments att
  where att.organization_id = current_context.organization_id
    and att.project_id = p_project_id
    and att.variation_id = p_variation_id;

  perform 1
  from public.save_project_variation_draft(
    current_context.organization_id,
    p_project_id,
    p_variation_id,
    p_expected_updated_at,
    variation_row.variation_title,
    variation_row.variation_number,
    variation_row.status,
    variation_row.origin,
    variation_row.requested_by,
    variation_row.requested_date,
    variation_row.due_date,
    variation_row.sent_to_client_at,
    variation_row.approved_at,
    variation_row.invoice_ready,
    variation_row.notes,
    variation_row.margin_percent,
    variation_row.discount_amount,
    variation_row.contingency_amount,
    variation_row.gst_percent,
    variation_row.include_margin_in_export,
    variation_row.include_discount_in_export,
    variation_row.include_contingency_in_export,
    variation_row.validity_period,
    variation_row.payment_terms,
    variation_row.lead_time,
    variation_row.terms_inclusions,
    variation_row.terms_exclusions,
    variation_row.clarifications,
    variation_row.assumptions,
    mutable_line_items,
    preserved_attachments
  );

  select row_to_json(detail_row)::jsonb
  into detail_payload
  from public.get_mobile_project_variation_detail_v1(p_project_id, p_variation_id) as detail_row;

  return detail_payload;
end;
$$;

revoke all on function public.mobile_mutate_project_variation_manual_line_v1(
  uuid, uuid, timestamptz, text, uuid, text, text, numeric, text, numeric, integer
) from public, anon;

grant execute on function public.mobile_mutate_project_variation_manual_line_v1(
  uuid, uuid, timestamptz, text, uuid, text, text, numeric, text, numeric, integer
) to authenticated;

commit;
