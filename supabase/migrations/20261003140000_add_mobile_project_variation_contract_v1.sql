begin;

-- Mobile Variations use the same project-member context as the mobile PO
-- contract.  The organization is always derived from the authenticated
-- project, never accepted from the caller.

create or replace function public.list_mobile_project_variations_v1(
  p_project_id uuid
)
returns table (
  variation_id uuid,
  project_id uuid,
  variation_number text,
  variation_title text,
  status text,
  origin text,
  requested_by text,
  requested_date date,
  due_date date,
  total_variation_price numeric,
  invoice_ready boolean,
  can_edit boolean,
  can_change_status boolean,
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
  can_write boolean;
begin
  select * into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  can_write := public.has_org_permission(current_context.organization_id, 'variations.write');

  return query
  select
    v.id,
    v.project_id,
    v.variation_number,
    v.variation_title,
    v.status,
    v.origin,
    v.requested_by,
    v.requested_date,
    v.due_date,
    v.total_variation_price,
    v.invoice_ready,
    can_write,
    can_write,
    v.created_at,
    v.updated_at
  from public.project_variations v
  where v.organization_id = current_context.organization_id
    and v.project_id = p_project_id
  order by v.created_at desc, v.id desc;
end;
$$;

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
          'source_purchase_order_number', li.source_purchase_order_number
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
    jsonb_build_array('update_header', 'update_status');
end;
$$;

create or replace function public.create_mobile_project_variation_v1(
  p_project_id uuid,
  p_title text default 'New Variation'
)
returns table (
  variation_id uuid,
  project_id uuid,
  variation_number text,
  variation_title text,
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_context record;
  created_row record;
begin
  select * into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  if not public.has_org_permission(current_context.organization_id, 'variations.write') then
    raise exception 'Not authorized to create variations for this organization';
  end if;

  select * into created_row
  from public.create_project_variation_draft(
    current_context.organization_id,
    p_project_id,
    p_title
  );

  return query
  select created_row.id, p_project_id, created_row.variation_number,
    created_row.variation_title, created_row.status, created_row.updated_at;
end;
$$;

create or replace function public.update_mobile_project_variation_header_v1(
  p_project_id uuid,
  p_variation_id uuid,
  p_expected_updated_at timestamptz,
  p_variation_title text,
  p_origin text,
  p_requested_by text,
  p_requested_date date,
  p_due_date date,
  p_notes text,
  p_validity_period text,
  p_payment_terms text,
  p_lead_time text,
  p_terms_inclusions text,
  p_terms_exclusions text,
  p_clarifications text,
  p_assumptions text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_context record;
  existing_row public.project_variations%rowtype;
  detail_row record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_expected_updated_at is null then
    raise exception 'Variation version is required. Please refresh and try again.' using errcode = '40001';
  end if;

  select * into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  if not public.has_org_permission(current_context.organization_id, 'variations.write') then
    raise exception 'Not authorized to edit variations for this organization';
  end if;

  select v.* into existing_row
  from public.project_variations v
  where v.organization_id = current_context.organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id
  for update;

  if not found then
    raise exception 'Variation not found for this project';
  end if;
  if existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This variation was updated by another user. Refresh and try again.' using errcode = '40001';
  end if;
  if coalesce(btrim(p_variation_title), '') = '' then
    raise exception 'Variation title is required';
  end if;
  if p_origin not in ('Client Request', 'Drawing Revision', 'Site Instruction', 'RFI', 'Unknown') then
    raise exception 'Variation origin is invalid';
  end if;

  update public.project_variations v
  set variation_title = btrim(p_variation_title),
      origin = p_origin,
      requested_by = coalesce(p_requested_by, ''),
      requested_date = p_requested_date,
      due_date = p_due_date,
      notes = coalesce(p_notes, ''),
      validity_period = coalesce(p_validity_period, ''),
      payment_terms = coalesce(p_payment_terms, ''),
      lead_time = coalesce(p_lead_time, ''),
      terms_inclusions = coalesce(p_terms_inclusions, ''),
      terms_exclusions = coalesce(p_terms_exclusions, ''),
      clarifications = coalesce(p_clarifications, ''),
      assumptions = coalesce(p_assumptions, ''),
      updated_at = statement_timestamp()
  where v.organization_id = current_context.organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id;

  select * into detail_row from public.get_mobile_project_variation_detail_v1(p_project_id, p_variation_id);
  return to_jsonb(detail_row);
end;
$$;

create or replace function public.update_mobile_project_variation_status_v1(
  p_project_id uuid,
  p_variation_id uuid,
  p_expected_updated_at timestamptz,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_context record;
  existing_row public.project_variations%rowtype;
  updated_row public.project_variations%rowtype;
  next_invoice_ready boolean;
  detail_row record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_expected_updated_at is null then
    raise exception 'Variation version is required. Please refresh and try again.' using errcode = '40001';
  end if;
  if p_status not in ('Draft', 'Priced', 'Sent', 'Client Review', 'Approved', 'Rejected', 'Invoiced') then
    raise exception 'Variation status is invalid';
  end if;

  select * into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  if not public.has_org_permission(current_context.organization_id, 'variations.write') then
    raise exception 'Not authorized to change variation status for this organization';
  end if;

  select v.* into existing_row
  from public.project_variations v
  where v.organization_id = current_context.organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id
  for update;

  if not found then
    raise exception 'Variation not found for this project';
  end if;
  if existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This variation was updated by another user. Refresh and try again.' using errcode = '40001';
  end if;
  if existing_row.status is not distinct from p_status then
    select * into detail_row from public.get_mobile_project_variation_detail_v1(p_project_id, p_variation_id);
    return to_jsonb(detail_row);
  end if;

  next_invoice_ready := p_status in ('Approved', 'Invoiced');

  update public.project_variations v
  set status = p_status,
      sent_to_client_at = case
        when p_status in ('Sent', 'Client Review') then coalesce(v.sent_to_client_at, statement_timestamp())
        else v.sent_to_client_at
      end,
      approved_at = case
        when p_status in ('Approved', 'Invoiced') then coalesce(v.approved_at, statement_timestamp())
        else v.approved_at
      end,
      rejected_at = case
        when p_status = 'Rejected' then coalesce(v.rejected_at, statement_timestamp())
        else v.rejected_at
      end,
      invoice_ready = next_invoice_ready,
      updated_at = statement_timestamp()
  where v.organization_id = current_context.organization_id
    and v.project_id = p_project_id
    and v.id = p_variation_id
  returning * into updated_row;

  insert into public.project_variation_status_events (
    organization_id, project_id, variation_id, from_status, to_status,
    changed_by, event_type, occurred_at, metadata, created_by
  ) values (
    current_context.organization_id, p_project_id, p_variation_id,
    existing_row.status, updated_row.status, auth.uid(),
    case when p_status = 'Approved' then 'approved'
         when p_status = 'Rejected' then 'rejected'
         else 'status_changed' end,
    statement_timestamp(),
    jsonb_build_object('source', 'update_mobile_project_variation_status_v1'),
    auth.uid()
  );

  if next_invoice_ready then
    insert into public.project_variation_invoice_items (
      organization_id, project_id, variation_id, amount, status
    ) values (
      current_context.organization_id, p_project_id, p_variation_id,
      round(updated_row.total_variation_price, 2), 'Ready'
    )
    on conflict (variation_id) do update set
      amount = excluded.amount,
      status = 'Ready';
  else
    delete from public.project_variation_invoice_items ii
    where ii.organization_id = current_context.organization_id
      and ii.project_id = p_project_id
      and ii.variation_id = p_variation_id;
  end if;

  perform public.recalculate_project_claim_snapshots(current_context.organization_id, p_project_id);

  select * into detail_row from public.get_mobile_project_variation_detail_v1(p_project_id, p_variation_id);
  return to_jsonb(detail_row);
end;
$$;

revoke all on function public.list_mobile_project_variations_v1(uuid) from public, anon;
revoke all on function public.get_mobile_project_variation_detail_v1(uuid, uuid) from public, anon;
revoke all on function public.get_project_variation_mobile_edit_snapshot_v1(uuid, uuid) from public, anon;
revoke all on function public.create_mobile_project_variation_v1(uuid, text) from public, anon;
revoke all on function public.update_mobile_project_variation_header_v1(uuid, uuid, timestamptz, text, text, text, date, date, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.update_mobile_project_variation_status_v1(uuid, uuid, timestamptz, text) from public, anon;

grant execute on function public.list_mobile_project_variations_v1(uuid) to authenticated;
grant execute on function public.get_mobile_project_variation_detail_v1(uuid, uuid) to authenticated;
grant execute on function public.get_project_variation_mobile_edit_snapshot_v1(uuid, uuid) to authenticated;
grant execute on function public.create_mobile_project_variation_v1(uuid, text) to authenticated;
grant execute on function public.update_mobile_project_variation_header_v1(uuid, uuid, timestamptz, text, text, text, date, date, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_mobile_project_variation_status_v1(uuid, uuid, timestamptz, text) to authenticated;

commit;
