begin;

-- Variation worksheet rows intentionally preserve sparse commercial values. The
-- Variation table already permits these nulls; its mirrored CostItem must be able
-- to preserve the same snapshot without inventing quantity, unit, rate, or total.
alter table public.cost_items
  alter column quantity drop not null,
  alter column unit drop not null,
  alter column unit_rate drop not null,
  alter column line_total drop not null;

create table if not exists public.worksheet_variation_publication_requests (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_key text not null,
  variation_id uuid not null references public.project_variations (id) on delete cascade,
  result_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, request_key)
);

alter table public.worksheet_variation_publication_requests enable row level security;
alter table public.worksheet_variation_publication_requests force row level security;

create or replace function public.publish_worksheet_commercial_variation_v1(p_input jsonb)
returns table (
  id uuid,
  updated_at timestamptz,
  status text,
  variation_number text,
  added_line_count integer,
  skipped_row_count integer,
  variation_line_ids uuid[],
  commercial_item_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  resolved_organization_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  resolved_opportunity_id uuid := nullif(p_input->>'opportunityId', '')::uuid;
  resolved_project_id uuid := nullif(p_input->>'projectId', '')::uuid;
  resolved_variation_id uuid := nullif(p_input->>'variationId', '')::uuid;
  resolved_workbook_id uuid := nullif(p_input->>'workbookId', '')::uuid;
  resolved_worksheet_id uuid := nullif(p_input->>'worksheetId', '')::uuid;
  resolved_sheet_id uuid := nullif(p_input->>'sheetId', '')::uuid;
  resolved_request_key text := nullif(p_input->>'requestKey', '');
  resolved_expected_updated_at timestamptz := nullif(p_input->>'expectedUpdatedAt', '')::timestamptz;
  resolved_source_version integer := coalesce(nullif(p_input->>'worksheetVersion', '')::integer, 1);
  resolved_skipped_count integer := coalesce(nullif(p_input->>'skippedRowCount', '')::integer, 0);
  existing_request public.worksheet_variation_publication_requests%rowtype;
  variation_row public.project_variations%rowtype;
  saved_row record;
  source_row jsonb;
  source_ordinality bigint;
  source_line_id uuid;
  source_section text;
  commercial_item_id uuid;
  accumulated_line_items jsonb := coalesce(p_input->'existingLineItems', '[]'::jsonb);
  accumulated_line_ids uuid[] := array[]::uuid[];
  accumulated_commercial_item_ids uuid[] := array[]::uuid[];
  result_payload jsonb;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if resolved_organization_id is null or resolved_opportunity_id is null or resolved_project_id is null
    or resolved_variation_id is null or resolved_workbook_id is null or resolved_worksheet_id is null
    or resolved_sheet_id is null or resolved_request_key is null or resolved_expected_updated_at is null then
    raise exception 'Organization, opportunity, project, Variation, worksheet, sheet, request key, and expected version are required';
  end if;
  if not public.has_org_permission(resolved_organization_id, 'variations.write') then
    raise exception 'Not authorized to publish worksheet lines to this Variation' using errcode = '42501';
  end if;
  if not public.has_org_permission(resolved_organization_id, 'leads.opportunities.write') then
    raise exception 'Not authorized to create worksheet commercial items' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(resolved_organization_id::text || ':' || resolved_request_key, 0));

  select request.* into existing_request
  from public.worksheet_variation_publication_requests request
  where request.organization_id = resolved_organization_id
    and request.request_key = resolved_request_key;

  if found then
    if existing_request.variation_id <> resolved_variation_id then
      raise exception 'Variation publication request key belongs to another Variation' using errcode = 'TS409';
    end if;
    return query select
      existing_request.variation_id,
      (existing_request.result_json->>'updatedAt')::timestamptz,
      existing_request.result_json->>'status',
      existing_request.result_json->>'variationNumber',
      (existing_request.result_json->>'addedLineCount')::integer,
      (existing_request.result_json->>'skippedRowCount')::integer,
      array(select jsonb_array_elements_text(existing_request.result_json->'variationLineIds')::uuid),
      array(select jsonb_array_elements_text(existing_request.result_json->'commercialItemIds')::uuid);
    return;
  end if;

  select variation.* into variation_row
  from public.project_variations variation
  where variation.organization_id = resolved_organization_id
    and variation.project_id = resolved_project_id
    and variation.id = resolved_variation_id
  for update;

  if not found then
    raise exception 'Variation not found for organization and project';
  end if;
  if variation_row.status not in ('Draft', 'Priced') then
    raise exception 'This variation can no longer be changed from the pricing worksheet.' using errcode = 'TS409';
  end if;
  if variation_row.updated_at is distinct from resolved_expected_updated_at then
    raise exception 'This variation changed while the worksheet mapping was open. Refresh and try again.' using errcode = 'TS409';
  end if;
  if not exists (
    select 1 from public.organization_projects project
    where project.organization_id = resolved_organization_id
      and project.id = resolved_project_id
      and project.source_opportunity_id = resolved_opportunity_id
  ) then
    raise exception 'Project and opportunity lineage do not match';
  end if;
  if not exists (
    select 1 from public.opportunity_pricing_worksheets workbook
    where workbook.organization_id = resolved_organization_id
      and workbook.opportunity_id = resolved_opportunity_id
      and workbook.project_id = resolved_project_id
      and workbook.variation_id = resolved_variation_id
      and workbook.id = resolved_workbook_id
  ) then
    raise exception 'Worksheet does not belong to the target Variation';
  end if;
  if resolved_worksheet_id <> resolved_workbook_id then
    raise exception 'Worksheet identity must match its workbook identity';
  end if;
  if not exists (
    select 1 from public.opportunity_pricing_workbook_sheets sheet
    where sheet.organization_id = resolved_organization_id
      and sheet.opportunity_id = resolved_opportunity_id
      and sheet.workbook_id = resolved_workbook_id
      and sheet.id = resolved_sheet_id
  ) then
    raise exception 'Worksheet sheet does not belong to the source workbook';
  end if;
  if jsonb_typeof(coalesce(p_input->'commercialRows', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_input->'commercialRows', '[]'::jsonb)) = 0 then
    raise exception 'At least one mapped commercial row is required';
  end if;

  for source_row in select value from jsonb_array_elements(p_input->'commercialRows')
  loop
    source_line_id := nullif(source_row->>'lineId', '')::uuid;
    source_section := nullif(source_row->>'section', '');
    if source_line_id is null then
      raise exception 'Every mapped Variation row requires a stable line ID';
    end if;
    if source_section not in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then
      raise exception 'Variation section is invalid';
    end if;
    if coalesce(nullif(btrim(source_row->>'sourceRange'), ''), '') = ''
      or coalesce(nullif(btrim(source_row->>'sourceSignature'), ''), '') = '' then
      raise exception 'Mapped worksheet provenance is incomplete';
    end if;

    select item.id into commercial_item_id
    from public.commercial_items item
    where item.organization_id = resolved_organization_id
      and item.opportunity_id = resolved_opportunity_id
      and item.project_id = resolved_project_id
      and item.source_workbook_id = resolved_workbook_id
      and item.source_worksheet_id = resolved_worksheet_id
      and item.source_sheet_id = resolved_sheet_id
      and item.source_range = source_row->>'sourceRange'
      and item.source_signature = source_row->>'sourceSignature'
    order by item.created_at asc
    limit 1;

    if commercial_item_id is null then
      select created.id into commercial_item_id
      from public.create_commercial_item(jsonb_build_object(
        'organizationId', resolved_organization_id,
        'opportunityId', resolved_opportunity_id,
        'projectId', resolved_project_id,
        'sourceType', 'worksheet_selection',
        'sourceWorkbookId', resolved_workbook_id,
        'sourceWorksheetId', resolved_worksheet_id,
        'sourceSheetId', resolved_sheet_id,
        'sourceRange', source_row->>'sourceRange',
        'sourceSignature', source_row->>'sourceSignature',
        'sourceVersion', resolved_source_version,
        'sourceStatus', 'current',
        'description', coalesce(source_row->>'description', ''),
        'quantity', source_row->'quantity',
        'unit', source_row->'unit',
        'rate', source_row->'rate',
        'total', source_row->'total',
        'snapshotJson', coalesce(source_row->'snapshotJson', '{}'::jsonb),
        'sourceLinkJson', coalesce(source_row->'sourceLinkJson', '{}'::jsonb),
        'lockedMetadataJson', coalesce(source_row->'lockedMetadataJson', '{}'::jsonb),
        'uclValidationStatus', 'not_reviewed'
      )) created;
    end if;

    accumulated_line_items := accumulated_line_items || jsonb_build_array(jsonb_build_object(
      'id', source_line_id,
      'section', source_section,
      'description', coalesce(source_row->>'description', ''),
      'quantity', source_row->'quantity',
      'unit', source_row->'unit',
      'rate', source_row->'rate',
      'total', source_row->'total',
      'sourceProjectQuoteId', null,
      'sourceProjectQuoteLineItemId', null,
      'sourceProjectQuoteNumber', '',
      'sourcePurchaseOrderId', null,
      'sourcePurchaseOrderLineItemId', null,
      'sourcePurchaseOrderNumber', ''
    ));
    accumulated_line_ids := array_append(accumulated_line_ids, source_line_id);
    accumulated_commercial_item_ids := array_append(accumulated_commercial_item_ids, commercial_item_id);
  end loop;

  select * into saved_row
  from public.save_project_variation_draft(
    p_organization_id => resolved_organization_id,
    p_project_id => resolved_project_id,
    p_variation_id => resolved_variation_id,
    p_expected_updated_at => resolved_expected_updated_at,
    p_variation_title => coalesce(p_input->'variation'->>'title', variation_row.variation_title),
    p_variation_number => coalesce(p_input->'variation'->>'number', variation_row.variation_number),
    p_status => variation_row.status,
    p_origin => coalesce(p_input->'variation'->>'origin', variation_row.origin),
    p_requested_by => coalesce(p_input->'variation'->>'requestedBy', variation_row.requested_by),
    p_requested_date => nullif(p_input->'variation'->>'requestedDate', '')::date,
    p_due_date => nullif(p_input->'variation'->>'dueDate', '')::date,
    p_sent_to_client_at => nullif(p_input->'variation'->>'sentToClientAt', '')::timestamptz,
    p_approved_at => nullif(p_input->'variation'->>'approvedAt', '')::timestamptz,
    p_invoice_ready => coalesce((p_input->'variation'->>'invoiceReady')::boolean, false),
    p_notes => coalesce(p_input->'variation'->>'notes', ''),
    p_margin_percent => coalesce((p_input->'variation'->>'marginPercent')::numeric, 0),
    p_discount_amount => coalesce((p_input->'variation'->>'discountAmount')::numeric, 0),
    p_contingency_amount => coalesce((p_input->'variation'->>'contingencyAmount')::numeric, 0),
    p_gst_percent => coalesce((p_input->'variation'->>'gstPercent')::numeric, 0),
    p_include_margin_in_export => coalesce((p_input->'variation'->>'includeMarginInExport')::boolean, true),
    p_include_discount_in_export => coalesce((p_input->'variation'->>'includeDiscountInExport')::boolean, false),
    p_include_contingency_in_export => coalesce((p_input->'variation'->>'includeContingencyInExport')::boolean, false),
    p_validity_period => coalesce(p_input->'variation'->>'validityPeriod', ''),
    p_payment_terms => coalesce(p_input->'variation'->>'paymentTerms', ''),
    p_lead_time => coalesce(p_input->'variation'->>'leadTime', ''),
    p_terms_inclusions => coalesce(p_input->'variation'->>'termsInclusions', ''),
    p_terms_exclusions => coalesce(p_input->'variation'->>'termsExclusions', ''),
    p_clarifications => coalesce(p_input->'variation'->>'clarifications', ''),
    p_assumptions => coalesce(p_input->'variation'->>'assumptions', ''),
    p_line_items => accumulated_line_items,
    p_attachments => coalesce(p_input->'attachments', '[]'::jsonb)
  );

  for source_row, source_ordinality in
    select value, ordinality
    from jsonb_array_elements(p_input->'commercialRows') with ordinality
  loop
    perform public.link_commercial_item_to_variation_line(jsonb_build_object(
      'organizationId', resolved_organization_id,
      'commercialItemId', accumulated_commercial_item_ids[source_ordinality::integer],
      'variationId', resolved_variation_id,
      'variationLineId', accumulated_line_ids[source_ordinality::integer],
      'linkRole', 'source',
      'snapshotAtLinkJson', jsonb_build_object(
        'version', 1,
        'commercialItemId', accumulated_commercial_item_ids[source_ordinality::integer],
        'description', source_row->>'description',
        'quantity', source_row->'quantity',
        'unit', source_row->'unit',
        'rate', source_row->'rate',
        'total', source_row->'total',
        'sourceStatus', 'current',
        'sourceRange', source_row->>'sourceRange',
        'sourceWorkbookId', resolved_workbook_id,
        'sourceWorksheetId', resolved_worksheet_id,
        'sourceSheetId', resolved_sheet_id,
        'sourceLink', coalesce(source_row->'sourceLinkJson', '{}'::jsonb)
      )
    ));
  end loop;

  result_payload := jsonb_build_object(
    'updatedAt', saved_row.updated_at,
    'status', saved_row.status,
    'variationNumber', variation_row.variation_number,
    'addedLineCount', cardinality(accumulated_line_ids),
    'skippedRowCount', resolved_skipped_count,
    'variationLineIds', to_jsonb(accumulated_line_ids),
    'commercialItemIds', to_jsonb(accumulated_commercial_item_ids)
  );

  insert into public.worksheet_variation_publication_requests (
    organization_id, request_key, variation_id, result_json, created_by
  ) values (
    resolved_organization_id, resolved_request_key, resolved_variation_id, result_payload, actor_user_id
  );

  return query select
    resolved_variation_id,
    saved_row.updated_at::timestamptz,
    saved_row.status::text,
    variation_row.variation_number,
    cardinality(accumulated_line_ids),
    resolved_skipped_count,
    accumulated_line_ids,
    accumulated_commercial_item_ids;
end;
$$;

revoke all on table public.worksheet_variation_publication_requests from public, anon, authenticated;
revoke execute on function public.publish_worksheet_commercial_variation_v1(jsonb) from public, anon;
grant execute on function public.publish_worksheet_commercial_variation_v1(jsonb) to authenticated;

commit;
