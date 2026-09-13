begin;

create table if not exists public.takeoff_variation_publication_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_key text not null,
  request_fingerprint text not null,
  variation_id uuid not null references public.project_variations(id) on delete cascade,
  result_json jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, request_key),
  constraint takeoff_variation_publication_request_key_not_blank check (btrim(request_key) <> ''),
  constraint takeoff_variation_publication_result_object check (jsonb_typeof(result_json) = 'object')
);

alter table public.takeoff_variation_publication_requests enable row level security;
alter table public.takeoff_variation_publication_requests force row level security;
revoke all on table public.takeoff_variation_publication_requests from public, anon, authenticated;

create or replace function public.publish_takeoff_commercial_variation_v1(p_input jsonb)
returns table (
  variation_id uuid,
  variation_line_id uuid,
  variation_number text,
  commercial_item_id uuid,
  target_mode text,
  status text,
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
  commercial_project_id uuid := nullif(p_input->>'projectId', '')::uuid;
  data_project_id uuid := nullif(p_input->>'dataProjectId', '')::uuid;
  measurement_id uuid := nullif(p_input->>'measurementId', '')::uuid;
  requested_variation_id uuid := nullif(p_input->>'variationId', '')::uuid;
  expected_updated_at timestamptz := nullif(p_input->>'expectedUpdatedAt', '')::timestamptz;
  commercial_description text := btrim(coalesce(p_input->>'description', ''));
  commercial_rate numeric := round(coalesce(nullif(p_input->>'rate', '')::numeric, 0), 2);
  mode text := btrim(coalesce(p_input->>'targetMode', ''));
  section_name text := btrim(coalesce(p_input->>'section', ''));
  requested_title text := btrim(coalesce(p_input->>'variationTitle', ''));
  request_key_value text := btrim(coalesce(p_input->>'requestKey', ''));
  request_fingerprint_value text;
  prior_result jsonb;
  variation_row public.project_variations%rowtype;
  commercial_item record;
  created_variation record;
  saved_variation record;
  linked_row record;
  line_items jsonb := '[]'::jsonb;
  attachments jsonb := '[]'::jsonb;
  new_line_id uuid := gen_random_uuid();
  existing_item_ids uuid[] := array[]::uuid[];
  was_reused boolean := false;
  result_value jsonb;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  if org_id is null or opp_id is null or commercial_project_id is null
    or data_project_id is null or measurement_id is null then
    raise exception 'organizationId, opportunityId, projectId, dataProjectId, and measurementId are required' using errcode = 'TS422';
  end if;
  if commercial_description = '' then raise exception 'Description is required' using errcode = 'TS422'; end if;
  if commercial_rate < 0 then raise exception 'Rate must be non-negative' using errcode = 'TS422'; end if;
  if mode not in ('new', 'existing') then raise exception 'targetMode must be new or existing' using errcode = 'TS422'; end if;
  if section_name not in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then
    raise exception 'section must be Labour, Materials, Subcontractors, Plant, or Margin' using errcode = 'TS422';
  end if;
  if mode = 'new' and requested_title = '' then raise exception 'variationTitle is required for a new Variation' using errcode = 'TS422'; end if;
  if request_key_value = '' then raise exception 'requestKey is required' using errcode = 'TS422'; end if;
  if not public.has_org_permission(org_id, 'leads.opportunities.write')
    or not public.has_org_permission(org_id, 'variations.write') then
    raise exception 'Not authorized to publish Takeoff measurements to Variations' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organization_opportunities o
    where o.organization_id = org_id and o.id = opp_id
      and o.workspace_project_id = data_project_id
      and o.converted_project_id = commercial_project_id
  ) or not exists (
    select 1 from public.organization_projects p
    where p.organization_id = org_id and p.id = commercial_project_id
      and p.source_opportunity_id = opp_id
  ) then
    raise exception 'The Variation Project is not the converted Project for this Takeoff Opportunity' using errcode = 'TS404';
  end if;

  request_fingerprint_value := md5((p_input - 'requestKey')::text);
  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || request_key_value, 0));
  select request.result_json into prior_result
  from public.takeoff_variation_publication_requests request
  where request.organization_id = org_id and request.request_key = request_key_value
    and request.request_fingerprint = request_fingerprint_value;
  if found then
    return query select
      (prior_result->>'variationId')::uuid,
      (prior_result->>'variationLineId')::uuid,
      prior_result->>'variationNumber',
      (prior_result->>'commercialItemId')::uuid,
      prior_result->>'targetMode',
      prior_result->>'status',
      coalesce((prior_result->>'reusedCommercialItem')::boolean, false);
    return;
  end if;
  if exists (
    select 1 from public.takeoff_variation_publication_requests request
    where request.organization_id = org_id and request.request_key = request_key_value
  ) then
    raise exception 'requestKey was already used for a different Variation publication' using errcode = 'TS409';
  end if;

  if mode = 'new' then
    select * into created_variation
    from public.create_project_variation_draft(org_id, commercial_project_id, requested_title);
    requested_variation_id := created_variation.id;
  elsif requested_variation_id is null or expected_updated_at is null then
    raise exception 'variationId and expectedUpdatedAt are required for an existing Variation' using errcode = 'TS422';
  end if;

  select variation.* into variation_row
  from public.project_variations variation
  where variation.organization_id = org_id
    and variation.project_id = commercial_project_id
    and variation.id = requested_variation_id
  for update;
  if not found then raise exception 'Variation not found for the converted Project' using errcode = 'TS404'; end if;
  if variation_row.status not in ('Draft', 'Priced') then
    raise exception 'Only Draft or Priced Variations can receive Takeoff measurements' using errcode = 'TS409';
  end if;
  if mode = 'existing' and variation_row.updated_at is distinct from expected_updated_at then
    raise exception 'This Variation was updated by another user. Refresh and try again.' using errcode = 'TS409';
  end if;

  select coalesce(array_agg(item.id), array[]::uuid[]) into existing_item_ids
  from public.commercial_items item
  where item.organization_id = org_id and item.opportunity_id = opp_id
    and item.source_type = 'takeoff_measurement'
    and item.source_takeoff_measurement_id = measurement_id;

  select * into commercial_item
  from public.create_takeoff_commercial_item(jsonb_build_object(
    'organizationId', org_id, 'opportunityId', opp_id,
    'projectId', commercial_project_id, 'dataProjectId', data_project_id,
    'measurementId', measurement_id, 'description', commercial_description,
    'rate', commercial_rate
  ));
  was_reused := commercial_item.id = any(existing_item_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', line.id, 'section', line.section, 'description', line.description,
    'quantity', line.quantity, 'unit', line.unit, 'rate', line.rate, 'total', line.total,
    'sourceProjectQuoteId', line.source_project_quote_id,
    'sourceProjectQuoteLineItemId', line.source_project_quote_line_item_id,
    'sourceProjectQuoteNumber', coalesce(line.source_project_quote_number, ''),
    'sourcePurchaseOrderId', line.source_purchase_order_id,
    'sourcePurchaseOrderLineItemId', line.source_purchase_order_line_item_id,
    'sourcePurchaseOrderNumber', coalesce(line.source_purchase_order_number, '')
  ) order by line.sort_order, line.created_at, line.id), '[]'::jsonb)
  into line_items
  from public.project_variation_line_items line
  where line.organization_id = org_id and line.project_id = commercial_project_id
    and line.variation_id = variation_row.id;

  line_items := line_items || jsonb_build_array(jsonb_build_object(
    'id', new_line_id, 'section', section_name,
    'description', commercial_item.description, 'quantity', commercial_item.quantity,
    'unit', commercial_item.unit, 'rate', commercial_item.rate, 'total', commercial_item.total,
    'sourceProjectQuoteId', null, 'sourceProjectQuoteLineItemId', null,
    'sourceProjectQuoteNumber', '', 'sourcePurchaseOrderId', null,
    'sourcePurchaseOrderLineItemId', null, 'sourcePurchaseOrderNumber', ''
  ));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', attachment.id, 'type', attachment.file_kind, 'name', attachment.file_name,
    'storagePath', attachment.storage_path, 'externalUrl', attachment.external_url
  ) order by attachment.created_at, attachment.id), '[]'::jsonb)
  into attachments
  from public.project_variation_attachments attachment
  where attachment.organization_id = org_id and attachment.project_id = commercial_project_id
    and attachment.variation_id = variation_row.id;

  select * into saved_variation
  from public.save_project_variation_draft(
    p_organization_id => org_id,
    p_project_id => commercial_project_id,
    p_variation_id => variation_row.id,
    p_expected_updated_at => variation_row.updated_at,
    p_variation_title => variation_row.variation_title,
    p_variation_number => variation_row.variation_number,
    p_status => variation_row.status,
    p_origin => variation_row.origin,
    p_requested_by => variation_row.requested_by,
    p_requested_date => variation_row.requested_date,
    p_due_date => variation_row.due_date,
    p_sent_to_client_at => variation_row.sent_to_client_at,
    p_approved_at => variation_row.approved_at,
    p_invoice_ready => variation_row.invoice_ready,
    p_notes => variation_row.notes,
    p_margin_percent => variation_row.margin_percent,
    p_discount_amount => variation_row.discount_amount,
    p_contingency_amount => variation_row.contingency_amount,
    p_gst_percent => variation_row.gst_percent,
    p_include_margin_in_export => variation_row.include_margin_in_export,
    p_include_discount_in_export => variation_row.include_discount_in_export,
    p_include_contingency_in_export => variation_row.include_contingency_in_export,
    p_validity_period => variation_row.validity_period,
    p_payment_terms => variation_row.payment_terms,
    p_lead_time => variation_row.lead_time,
    p_terms_inclusions => variation_row.terms_inclusions,
    p_terms_exclusions => variation_row.terms_exclusions,
    p_clarifications => variation_row.clarifications,
    p_assumptions => variation_row.assumptions,
    p_line_items => line_items,
    p_attachments => attachments
  );

  select * into linked_row
  from public.link_commercial_item_to_variation_line(jsonb_build_object(
    'organizationId', org_id, 'commercialItemId', commercial_item.id,
    'variationId', variation_row.id, 'variationLineId', new_line_id,
    'linkRole', 'source',
    'snapshotAtLinkJson', jsonb_build_object(
      'version', 1, 'commercialItemId', commercial_item.id,
      'description', commercial_item.description, 'quantity', commercial_item.quantity,
      'unit', commercial_item.unit, 'rate', commercial_item.rate,
      'total', commercial_item.total, 'sourceStatus', commercial_item.source_status,
      'sourceType', commercial_item.source_type,
      'sourceTakeoffMeasurementId', commercial_item.source_takeoff_measurement_id,
      'sourceVersion', commercial_item.source_version,
      'sourceLink', commercial_item.source_link_json
    )
  ));

  result_value := jsonb_build_object(
    'variationId', variation_row.id, 'variationLineId', new_line_id,
    'variationNumber', variation_row.variation_number,
    'commercialItemId', commercial_item.id, 'targetMode', mode,
    'status', saved_variation.status, 'reusedCommercialItem', was_reused
  );
  insert into public.takeoff_variation_publication_requests (
    organization_id, request_key, request_fingerprint, variation_id, result_json, created_by
  ) values (
    org_id, request_key_value, request_fingerprint_value,
    variation_row.id, result_value, actor_user_id
  );

  return query select variation_row.id, new_line_id, variation_row.variation_number,
    commercial_item.id, mode, saved_variation.status, was_reused;
end;
$$;

revoke execute on function public.publish_takeoff_commercial_variation_v1(jsonb) from public, anon;
grant execute on function public.publish_takeoff_commercial_variation_v1(jsonb) to authenticated;

commit;
