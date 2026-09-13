begin;

-- Source capture is destination-neutral. Destination RPCs enforce their own
-- permission (quotes.write, purchase_orders.write, and so on).
create or replace function public.create_takeoff_commercial_item(p_input jsonb)
returns table (
  id uuid, organization_id uuid, opportunity_id uuid, project_id uuid,
  source_type text, source_workbook_id uuid, source_worksheet_id uuid,
  source_sheet_id uuid, source_takeoff_measurement_id uuid, source_range text,
  source_signature text, source_version integer, source_status text,
  stale_reason_code text, last_source_checked_at timestamptz,
  last_source_changed_at timestamptz, description text, quantity numeric,
  unit text, rate numeric, total numeric, snapshot_json jsonb,
  source_link_json jsonb, ucl_classification text, ucl_validation_status text,
  created_by uuid, updated_by uuid, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  actor_user_id uuid := auth.uid();
  org_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  opp_id uuid := nullif(p_input->>'opportunityId', '')::uuid;
  commercial_project_id uuid := nullif(p_input->>'projectId', '')::uuid;
  data_project_id uuid := nullif(p_input->>'dataProjectId', '')::uuid;
  measurement_id uuid := nullif(p_input->>'measurementId', '')::uuid;
  commercial_description text := btrim(coalesce(p_input->>'description', ''));
  commercial_rate numeric := round(coalesce(nullif(p_input->>'rate', '')::numeric, 0), 2);
  measurement public.takeoff_measurements%rowtype;
  inserted_row public.commercial_items%rowtype;
  commercial_quantity numeric;
  signature text;
  snapshot jsonb;
  source_link jsonb;
  resolved_owner_type text;
  resolved_owner_slug text;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  if org_id is null or opp_id is null or data_project_id is null or measurement_id is null then
    raise exception 'organizationId, opportunityId, dataProjectId, and measurementId are required' using errcode = 'TS422';
  end if;
  if commercial_description = '' then raise exception 'Description is required' using errcode = 'TS422'; end if;
  if commercial_rate < 0 then raise exception 'Rate must be non-negative' using errcode = 'TS422'; end if;
  if not public.has_org_permission(org_id, 'leads.opportunities.write') then
    raise exception 'Not authorized to capture Takeoff commercial items for this organization';
  end if;
  if not exists (
    select 1 from public.organization_opportunities o
    where o.organization_id = org_id and o.id = opp_id
      and o.workspace_project_id = data_project_id
  ) then
    raise exception 'Takeoff data Project does not belong to the Opportunity lineage';
  end if;
  if commercial_project_id is not null and not exists (
    select 1 from public.organization_projects p
    where p.organization_id = org_id and p.id = commercial_project_id and p.source_opportunity_id = opp_id
  ) then raise exception 'Commercial Project does not belong to the Opportunity'; end if;
  if commercial_project_id is not null then
    select 'project', p.slug into resolved_owner_type, resolved_owner_slug
    from public.organization_projects p
    where p.organization_id = org_id and p.id = commercial_project_id;
  else
    select 'opportunity', o.slug into resolved_owner_type, resolved_owner_slug
    from public.organization_opportunities o
    where o.organization_id = org_id and o.id = opp_id;
  end if;

  select m.* into measurement from public.takeoff_measurements m
  where m.organization_id = org_id and m.project_id = data_project_id and m.id = measurement_id
    and m.status = 'active' and m.measurement_kind in ('line', 'area', 'count')
    and exists (select 1 from public.project_drawing_sets ds where ds.id = m.drawing_set_id and ds.organization_id = org_id and ds.project_id = data_project_id)
    and exists (select 1 from public.takeoff_pages page where page.id = m.page_id and page.organization_id = org_id and page.project_id = data_project_id and page.drawing_set_id = m.drawing_set_id);
  if not found then raise exception 'Active committed measurement was not found for the authorized Takeoff Project' using errcode = 'TS404'; end if;

  commercial_quantity := round(case when measurement.measurement_kind = 'count'
    then coalesce(measurement.count_value, measurement.display_value)
    else measurement.display_value end, 3);
  if commercial_quantity is null or commercial_quantity < 0 then
    raise exception 'Measurement does not have a valid committed display quantity' using errcode = 'TS422';
  end if;
  if nullif(btrim(coalesce(measurement.display_unit, '')), '') is null then
    raise exception 'Measurement does not have a committed display unit' using errcode = 'TS422';
  end if;

  snapshot := jsonb_build_object(
    'version', 1, 'sourceType', 'takeoff_measurement',
    'measurementId', measurement.id, 'measurementVersion', measurement.version,
    'measurementUpdatedAt', measurement.updated_at, 'measurementKind', measurement.measurement_kind,
    'drawingSetId', measurement.drawing_set_id, 'pageId', measurement.page_id,
    'measurementName', measurement.name, 'measurementDescription', measurement.description,
    'displayQuantity', commercial_quantity, 'displayUnit', measurement.display_unit,
    'commercialDescription', commercial_description, 'commercialQuantity', commercial_quantity,
    'commercialRate', commercial_rate, 'commercialTotal', round(commercial_quantity * commercial_rate, 2)
  );
  signature := md5(snapshot::text);
  source_link := jsonb_build_object(
    'sourceType', 'takeoff_measurement', 'measurementId', measurement.id,
    'measurementVersion', measurement.version, 'drawingSetId', measurement.drawing_set_id,
    'measurementUpdatedAt', measurement.updated_at, 'pageId', measurement.page_id,
    'ownerType', resolved_owner_type, 'ownerSlug', resolved_owner_slug,
    'opportunityId', opp_id, 'projectId', commercial_project_id,
    'dataProjectId', data_project_id, 'capturedAt', timezone('utc', now())
  );

  select item.* into inserted_row from public.commercial_items item
  where item.organization_id = org_id and item.opportunity_id = opp_id
    and item.source_type = 'takeoff_measurement'
    and item.source_takeoff_measurement_id = measurement.id
    and item.source_signature = signature
  order by item.created_at desc limit 1;

  if not found then
    insert into public.commercial_items (
      organization_id, opportunity_id, project_id, source_type,
      source_takeoff_measurement_id, source_signature, source_version, source_status,
      last_source_checked_at, description, quantity, unit, rate, total,
      snapshot_json, source_link_json, locked_metadata_json,
      ucl_validation_status, created_by, updated_by
    ) values (
      org_id, opp_id, commercial_project_id, 'takeoff_measurement',
      measurement.id, signature, measurement.version, 'current', timezone('utc', now()),
      commercial_description, commercial_quantity, measurement.display_unit, commercial_rate,
      round(commercial_quantity * commercial_rate, 2), snapshot, source_link, '{}'::jsonb,
      'not_reviewed', actor_user_id, actor_user_id
    ) returning * into inserted_row;
  end if;

  return query select inserted_row.id, inserted_row.organization_id, inserted_row.opportunity_id,
    inserted_row.project_id, inserted_row.source_type, inserted_row.source_workbook_id,
    inserted_row.source_worksheet_id, inserted_row.source_sheet_id,
    inserted_row.source_takeoff_measurement_id, inserted_row.source_range,
    inserted_row.source_signature, inserted_row.source_version, inserted_row.source_status,
    inserted_row.stale_reason_code, inserted_row.last_source_checked_at,
    inserted_row.last_source_changed_at, inserted_row.description, inserted_row.quantity,
    inserted_row.unit, inserted_row.rate, inserted_row.total, inserted_row.snapshot_json,
    inserted_row.source_link_json, inserted_row.ucl_classification,
    inserted_row.ucl_validation_status, inserted_row.created_by, inserted_row.updated_by,
    inserted_row.created_at, inserted_row.updated_at;
end;
$$;

revoke execute on function public.create_takeoff_commercial_item(jsonb) from public, anon;
grant execute on function public.create_takeoff_commercial_item(jsonb) to authenticated;

create table if not exists public.takeoff_purchase_order_publication_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_key text not null,
  request_fingerprint text not null,
  purchase_order_id uuid not null references public.project_purchase_orders(id) on delete cascade,
  result_json jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, request_key),
  constraint takeoff_po_publication_request_key_not_blank check (btrim(request_key) <> ''),
  constraint takeoff_po_publication_result_object check (jsonb_typeof(result_json) = 'object')
);

alter table public.takeoff_purchase_order_publication_requests enable row level security;
alter table public.takeoff_purchase_order_publication_requests force row level security;
revoke all on table public.takeoff_purchase_order_publication_requests from public, anon, authenticated;

create or replace function public.publish_takeoff_commercial_purchase_order_v1(p_input jsonb)
returns table (
  purchase_order_id uuid,
  purchase_order_line_id uuid,
  purchase_order_number text,
  commercial_item_id uuid,
  target_mode text,
  reused_commercial_item boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  actor_user_id uuid := auth.uid();
  org_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  opp_id uuid := nullif(p_input->>'opportunityId', '')::uuid;
  project_id uuid := nullif(p_input->>'projectId', '')::uuid;
  data_project_id uuid := nullif(p_input->>'dataProjectId', '')::uuid;
  measurement_id uuid := nullif(p_input->>'measurementId', '')::uuid;
  supplier_id uuid := nullif(p_input->>'supplierId', '')::uuid;
  requested_po_id uuid := nullif(p_input->>'purchaseOrderId', '')::uuid;
  expected_updated_at timestamptz := nullif(p_input->>'expectedUpdatedAt', '')::timestamptz;
  description text := btrim(coalesce(p_input->>'description', ''));
  rate numeric := round(coalesce(nullif(p_input->>'rate', '')::numeric, 0), 2);
  mode text := btrim(coalesce(p_input->>'targetMode', ''));
  section_name text := btrim(coalesce(p_input->>'section', ''));
  requested_title text := coalesce(nullif(btrim(p_input->>'purchaseOrderTitle'), ''), 'New Purchase Order');
  request_key_value text := btrim(coalesce(p_input->>'requestKey', ''));
  request_fingerprint_value text;
  prior_result jsonb;
  po public.project_purchase_orders%rowtype;
  supplier public.organization_suppliers%rowtype;
  item record;
  created_po record;
  saved_po record;
  linked_row record;
  line_items jsonb := '[]'::jsonb;
  attachments jsonb := '[]'::jsonb;
  new_line_id uuid := gen_random_uuid();
  new_line_uid uuid := gen_random_uuid();
  existing_item_ids uuid[] := array[]::uuid[];
  was_reused boolean := false;
  result_value jsonb;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  if org_id is null or opp_id is null or project_id is null or data_project_id is null or measurement_id is null then
    raise exception 'organizationId, opportunityId, projectId, dataProjectId, and measurementId are required' using errcode = 'TS422';
  end if;
  if supplier_id is null then raise exception 'supplierId is required' using errcode = 'TS422'; end if;
  if description = '' then raise exception 'Description is required' using errcode = 'TS422'; end if;
  if rate < 0 then raise exception 'Rate must be non-negative' using errcode = 'TS422'; end if;
  if mode not in ('new', 'existing') then raise exception 'targetMode must be new or existing' using errcode = 'TS422'; end if;
  if section_name not in ('Labour', 'Materials', 'Subcontractors', 'Plant') then
    raise exception 'section must be Labour, Materials, Subcontractors, or Plant' using errcode = 'TS422';
  end if;
  if request_key_value = '' then raise exception 'requestKey is required' using errcode = 'TS422'; end if;
  if not public.has_org_permission(org_id, 'leads.opportunities.write')
    or not public.has_org_permission(org_id, 'purchase_orders.write') then
    raise exception 'Not authorized to publish Takeoff measurements to Purchase Orders';
  end if;
  if not exists (
    select 1 from public.organization_opportunities o
    where o.organization_id = org_id and o.id = opp_id
      and o.workspace_project_id = data_project_id and o.converted_project_id = project_id
  ) or not exists (
    select 1 from public.organization_projects p
    where p.organization_id = org_id and p.id = project_id and p.source_opportunity_id = opp_id
  ) then
    raise exception 'The Purchase Order Project is not the converted Project for this Takeoff Opportunity';
  end if;

  select s.* into supplier from public.organization_suppliers s
  where s.organization_id = org_id and s.id = supplier_id and s.is_active = true;
  if not found then raise exception 'Active supplier not found for organization'; end if;

  request_fingerprint_value := md5((p_input - 'requestKey')::text);
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || request_key_value, 0));
  select r.result_json into prior_result
  from public.takeoff_purchase_order_publication_requests r
  where r.organization_id = org_id and r.request_key = request_key_value
    and r.request_fingerprint = request_fingerprint_value;
  if found then
    return query select
      (prior_result->>'purchaseOrderId')::uuid,
      (prior_result->>'purchaseOrderLineId')::uuid,
      prior_result->>'purchaseOrderNumber',
      (prior_result->>'commercialItemId')::uuid,
      prior_result->>'targetMode',
      coalesce((prior_result->>'reusedCommercialItem')::boolean, false);
    return;
  end if;
  if exists (
    select 1 from public.takeoff_purchase_order_publication_requests r
    where r.organization_id = org_id and r.request_key = request_key_value
  ) then raise exception 'requestKey was already used for a different Purchase Order publication' using errcode = 'TS409'; end if;

  if mode = 'new' then
    select * into created_po from public.create_project_purchase_order_draft(
      org_id, project_id, requested_title, 'Material Supply'
    );
    requested_po_id := created_po.id;
  elsif requested_po_id is null or expected_updated_at is null then
    raise exception 'purchaseOrderId and expectedUpdatedAt are required for an existing Purchase Order' using errcode = 'TS422';
  end if;

  select p.* into po from public.project_purchase_orders p
  where p.organization_id = org_id and p.project_id = project_id and p.id = requested_po_id
  for update;
  if not found then raise exception 'Draft Purchase Order not found for the converted Project' using errcode = 'TS404'; end if;
  if po.status <> 'Draft' then raise exception 'Only Draft Purchase Orders can receive Takeoff measurements' using errcode = 'TS409'; end if;
  if mode = 'existing' and po.updated_at is distinct from expected_updated_at then
    raise exception 'This Purchase Order was updated by another user. Refresh and try again.' using errcode = 'TS409';
  end if;
  if po.supplier_id is not null and po.supplier_id <> supplier_id then
    raise exception 'Selected supplier does not match the existing Purchase Order supplier' using errcode = 'TS409';
  end if;

  select coalesce(array_agg(ci.id), array[]::uuid[]) into existing_item_ids
  from public.commercial_items ci
  where ci.organization_id = org_id and ci.opportunity_id = opp_id
    and ci.source_type = 'takeoff_measurement' and ci.source_takeoff_measurement_id = measurement_id;

  select * into item from public.create_takeoff_commercial_item(jsonb_build_object(
    'organizationId', org_id, 'opportunityId', opp_id, 'projectId', project_id,
    'dataProjectId', data_project_id, 'measurementId', measurement_id,
    'description', description, 'rate', rate
  ));
  was_reused := item.id = any(existing_item_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', li.id, 'line_uid', li.line_uid, 'cost_item_id', li.cost_item_id,
    'source_cost_item_id', li.source_cost_item_id, 'section', li.section,
    'description', li.description, 'quantity', li.quantity, 'unit', li.unit,
    'rate', li.rate, 'sort_order', li.sort_order,
    'source_time_sheet_entry_id', li.source_time_sheet_entry_id
  ) order by li.sort_order, li.created_at, li.id), '[]'::jsonb)
  into line_items
  from public.project_purchase_order_line_items li
  where li.organization_id = org_id and li.project_id = project_id and li.purchase_order_id = po.id;

  line_items := line_items || jsonb_build_array(jsonb_build_object(
    'id', new_line_id, 'line_uid', new_line_uid, 'cost_item_id', null,
    'source_cost_item_id', null, 'section', section_name, 'description', item.description,
    'quantity', item.quantity, 'unit', item.unit, 'rate', item.rate,
    'sort_order', jsonb_array_length(line_items), 'source_time_sheet_entry_id', null
  ));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'type', a.file_kind, 'name', a.file_name,
    'storagePath', a.storage_path, 'externalUrl', a.external_url, 'notes', a.notes
  ) order by a.created_at, a.id), '[]'::jsonb)
  into attachments
  from public.project_purchase_order_attachments a
  where a.organization_id = org_id and a.project_id = project_id and a.purchase_order_id = po.id;

  select * into saved_po from public.save_project_purchase_order_draft(
    org_id, project_id, po.id, po.updated_at, po.purchase_order_title,
    po.purchase_order_number, 'Draft', po.origin, supplier.id,
    coalesce(nullif(btrim(supplier.company_name), ''), supplier.name),
    coalesce(nullif(btrim(supplier.primary_contact_email), ''), supplier.email, ''),
    coalesce(nullif(btrim(supplier.company_name), ''), supplier.name),
    coalesce(nullif(btrim(supplier.primary_contact_email), ''), supplier.email, ''),
    coalesce(nullif(btrim(supplier.primary_contact_phone), ''), supplier.phone, ''),
    po.requested_by, po.requested_date, po.due_date, po.sent_to_client_at,
    po.approved_at, po.invoice_ready, po.notes, po.margin_percent,
    po.discount_amount, po.contingency_amount, po.gst_percent,
    po.include_margin_in_export, po.include_discount_in_export,
    po.include_contingency_in_export, line_items, attachments
  );

  select * into linked_row from public.link_commercial_item_to_purchase_order_line(jsonb_build_object(
    'organizationId', org_id, 'commercialItemId', item.id,
    'purchaseOrderId', po.id, 'purchaseOrderLineId', new_line_id,
    'linkRole', 'source',
    'snapshotAtLinkJson', jsonb_build_object(
      'description', item.description, 'quantity', item.quantity, 'unit', item.unit,
      'rate', item.rate, 'total', item.total, 'sourceType', item.source_type,
      'sourceTakeoffMeasurementId', item.source_takeoff_measurement_id,
      'sourceVersion', item.source_version, 'sourceLink', item.source_link_json
    )
  ));

  result_value := jsonb_build_object(
    'purchaseOrderId', po.id, 'purchaseOrderLineId', new_line_id,
    'purchaseOrderNumber', po.purchase_order_number, 'commercialItemId', item.id,
    'targetMode', mode, 'reusedCommercialItem', was_reused
  );
  insert into public.takeoff_purchase_order_publication_requests (
    organization_id, request_key, request_fingerprint, purchase_order_id,
    result_json, created_by
  ) values (org_id, request_key_value, request_fingerprint_value, po.id, result_value, actor_user_id);

  return query select po.id, new_line_id, po.purchase_order_number, item.id, mode, was_reused;
end;
$$;

revoke execute on function public.publish_takeoff_commercial_purchase_order_v1(jsonb) from public, anon;
grant execute on function public.publish_takeoff_commercial_purchase_order_v1(jsonb) to authenticated;

commit;
