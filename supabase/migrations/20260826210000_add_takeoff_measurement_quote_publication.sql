begin;

alter table public.commercial_items
  alter column source_workbook_id drop not null,
  alter column source_worksheet_id drop not null,
  alter column source_sheet_id drop not null,
  alter column source_range drop not null,
  add column if not exists source_takeoff_measurement_id uuid null
    references public.takeoff_measurements (id) on delete restrict;

alter table public.commercial_items
  drop constraint if exists commercial_items_source_type_check,
  drop constraint if exists commercial_items_source_range_not_blank,
  add constraint commercial_items_source_type_check
    check (source_type in ('worksheet_selection', 'takeoff_measurement')),
  add constraint commercial_items_source_range_not_blank
    check (source_range is null or char_length(trim(source_range)) > 0),
  add constraint commercial_items_source_identity_check check (
    (source_type = 'worksheet_selection'
      and source_workbook_id is not null
      and source_worksheet_id is not null
      and source_sheet_id is not null
      and source_range is not null
      and source_takeoff_measurement_id is null)
    or
    (source_type = 'takeoff_measurement'
      and source_workbook_id is null
      and source_worksheet_id is null
      and source_sheet_id is null
      and source_range is null
      and source_takeoff_measurement_id is not null)
  );

create index if not exists commercial_items_takeoff_source_idx
  on public.commercial_items (organization_id, source_takeoff_measurement_id, source_version desc)
  where source_takeoff_measurement_id is not null;

alter table public.project_quote_line_items
  drop constraint if exists project_quote_line_items_pricing_source_kind_check,
  add constraint project_quote_line_items_pricing_source_kind_check
    check (pricing_source_kind in ('worksheet', 'takeoff', 'manual', 'unresolved'));

create or replace function public.sync_quote_line_pricing_source_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_link public.commercial_item_document_links%rowtype;
  resolved_kind text;
begin
  target_link := case when tg_op = 'DELETE' then old else new end;
  if target_link.document_kind <> 'quote_line' or target_link.link_role <> 'source' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (
    select 1 from public.project_quotes quote
    where quote.organization_id = target_link.organization_id
      and quote.id = target_link.document_id
      and quote.award_locked_at is not null
  ) then
    raise exception 'Source links belonging to an award-locked quote are immutable' using errcode = 'TS409';
  end if;

  if tg_op = 'DELETE' then
    select case item.source_type when 'takeoff_measurement' then 'takeoff' else 'worksheet' end
      into resolved_kind
    from public.commercial_item_document_links link
    join public.commercial_items item on item.id = link.commercial_item_id and item.organization_id = link.organization_id
    where link.organization_id = target_link.organization_id
      and link.document_kind = 'quote_line'
      and link.document_id = target_link.document_id
      and link.document_line_id = target_link.document_line_id
      and link.link_role = 'source'
      and link.id <> target_link.id
    limit 1;
    resolved_kind := coalesce(resolved_kind, 'manual');
  else
    select case item.source_type when 'takeoff_measurement' then 'takeoff' else 'worksheet' end
      into resolved_kind
    from public.commercial_items item
    where item.organization_id = target_link.organization_id
      and item.id = target_link.commercial_item_id;
  end if;

  update public.project_quote_line_items line
  set pricing_source_kind = resolved_kind
  where line.organization_id = target_link.organization_id
    and line.quote_id = target_link.document_id
    and line.id = target_link.document_line_id;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.enforce_quote_line_pricing_source_kind_from_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_kind text;
begin
  if pg_trigger_depth() = 1 then
    select case item.source_type when 'takeoff_measurement' then 'takeoff' else 'worksheet' end
      into resolved_kind
    from public.commercial_item_document_links link
    join public.commercial_items item on item.id = link.commercial_item_id and item.organization_id = link.organization_id
    where link.organization_id = new.organization_id
      and link.document_kind = 'quote_line'
      and link.link_role = 'source'
      and link.document_id = new.quote_id
      and link.document_line_id = new.id
    limit 1;
    if resolved_kind is not null then new.pricing_source_kind := resolved_kind; end if;
  end if;
  return new;
end;
$$;

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
  if not public.has_org_permission(org_id, 'leads.opportunities.write')
    or not public.has_org_permission(org_id, 'quotes.write') then
    raise exception 'Not authorized to publish Takeoff measurements for this organization';
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

create or replace function public.validate_and_record_quote_publication_v1(
  p_organization_id uuid,
  p_quote_id uuid
)
returns table (
  quote_id uuid,
  publication_basis_hash text,
  pricing_basis_status text,
  persisted_total numeric,
  quote_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.project_quotes%rowtype;
  computed_subtotal numeric := 0;
  computed_optional_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_gst numeric := 0;
  computed_total numeric := 0;
  invalid_line_count integer := 0;
  invalid_source_value_count integer := 0;
  duplicate_source_link_count integer := 0;
  basis jsonb := '{}'::jsonb;
  basis_hash text;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if not public.has_org_permission(p_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;
  select * into quote_row from public.project_quotes quote
  where quote.organization_id = p_organization_id and quote.id = p_quote_id for update;
  if not found then raise exception 'Quote not found for organization'; end if;
  if quote_row.award_locked_at is not null then
    raise exception 'Award-locked quote revisions cannot be republished' using errcode = 'TS409';
  end if;

  select
    coalesce(sum(case when line.is_optional then 0 else round(line.quantity * line.rate, 2) end), 0),
    coalesce(sum(case when line.is_optional then round(line.quantity * line.rate, 2) else 0 end), 0),
    count(*) filter (where line.total <> round(line.quantity * line.rate, 2))
  into computed_subtotal, computed_optional_subtotal, invalid_line_count
  from public.project_quote_line_items line
  where line.organization_id = p_organization_id and line.quote_id = p_quote_id;

  select count(*)::integer into invalid_source_value_count
  from public.project_quote_line_items line
  join public.commercial_item_document_links link
    on link.organization_id = line.organization_id and link.document_kind = 'quote_line'
   and link.document_id = line.quote_id and link.document_line_id = line.id and link.link_role = 'source'
  join public.commercial_items item
    on item.organization_id = link.organization_id and item.id = link.commercial_item_id
  cross join lateral (
    select coalesce(item.quantity, 1::numeric) quantity,
      coalesce(item.unit, 'Item') unit,
      case when item.rate is not null then item.rate
        when item.total is not null and coalesce(item.quantity, 1::numeric) <> 0
          then item.total / coalesce(item.quantity, 1::numeric)
        else 0::numeric end rate
  ) effective_source
  where line.organization_id = p_organization_id and line.quote_id = p_quote_id
    and (
      line.pricing_source_kind <> case item.source_type
        when 'takeoff_measurement' then 'takeoff' else 'worksheet' end
      or round(effective_source.quantity, 3) <> round(line.quantity, 3)
      or effective_source.unit <> line.unit
      or round(effective_source.rate, 2) <> round(line.rate, 2)
      or round(effective_source.quantity * effective_source.rate, 2) <> line.total
    );

  select count(*)::integer into duplicate_source_link_count from (
    select link.document_line_id
    from public.commercial_item_document_links link
    where link.organization_id = p_organization_id and link.document_kind = 'quote_line'
      and link.document_id = p_quote_id and link.link_role = 'source'
    group by link.document_line_id having count(*) <> 1
  ) duplicates;

  computed_margin := computed_subtotal * (quote_row.margin_percent / 100);
  computed_gst := greatest(0, computed_subtotal + computed_margin + quote_row.contingency_amount - quote_row.discount_amount)
    * (quote_row.gst_percent / 100);
  computed_total := greatest(0, computed_subtotal + computed_margin + quote_row.contingency_amount - quote_row.discount_amount)
    + computed_gst;
  if invalid_line_count > 0 or invalid_source_value_count > 0 or duplicate_source_link_count > 0
    or quote_row.subtotal <> round(computed_subtotal, 2)
    or quote_row.optional_subtotal <> round(computed_optional_subtotal, 2)
    or quote_row.margin_amount <> round(computed_margin, 2)
    or quote_row.gst_amount <> round(computed_gst, 2)
    or quote_row.total_quote_price <> round(computed_total, 2)
  then raise exception 'Quote publication totals do not reconcile with persisted quote lines' using errcode = 'TS422';
  end if;

  select jsonb_build_object(
    'version', 2, 'quoteId', quote_row.id, 'lineCount', count(distinct line.id),
    'manualLineIds', coalesce(jsonb_agg(distinct line.id order by line.id)
      filter (where line.pricing_source_kind = 'manual'), '[]'::jsonb),
    'commercialItems', coalesce(jsonb_agg(distinct jsonb_build_object(
      'lineId', line.id, 'commercialItemId', item.id, 'sourceType', item.source_type,
      'workbookId', item.source_workbook_id, 'sheetId', item.source_sheet_id,
      'range', item.source_range, 'measurementId', item.source_takeoff_measurement_id,
      'sourceSignature', item.source_signature, 'sourceVersion', item.source_version
    )) filter (where item.id is not null), '[]'::jsonb),
    'workbookIds', coalesce(jsonb_agg(distinct item.source_workbook_id::text)
      filter (where item.source_workbook_id is not null), '[]'::jsonb),
    'takeoffMeasurementIds', coalesce(jsonb_agg(distinct item.source_takeoff_measurement_id::text)
      filter (where item.source_takeoff_measurement_id is not null), '[]'::jsonb),
    'subtotal', quote_row.subtotal, 'gst', quote_row.gst_amount,
    'total', quote_row.total_quote_price
  ) into basis
  from public.project_quote_line_items line
  left join public.commercial_item_document_links link
    on link.organization_id = line.organization_id and link.document_kind = 'quote_line'
   and link.document_id = line.quote_id and link.document_line_id = line.id and link.link_role = 'source'
  left join public.commercial_items item
    on item.organization_id = link.organization_id and item.id = link.commercial_item_id
  where line.organization_id = p_organization_id and line.quote_id = p_quote_id;

  basis_hash := md5(basis::text);
  update public.project_quotes quote set publication_basis_json = basis,
    publication_basis_hash = basis_hash, pricing_basis_status = 'current',
    pricing_basis_checked_at = timezone('utc', now()), published_at = timezone('utc', now())
  where quote.organization_id = p_organization_id and quote.id = p_quote_id
  returning quote.* into quote_row;
  return query select quote_row.id, basis_hash, 'current'::text,
    quote_row.total_quote_price, quote_row.updated_at;
end;
$$;

revoke execute on function public.validate_and_record_quote_publication_v1(uuid, uuid) from public, anon;
grant execute on function public.validate_and_record_quote_publication_v1(uuid, uuid) to authenticated;

-- Source-neutral aliases retain the established, atomic Quote save/link engine.
create or replace function public.publish_commercial_quote_v1(p_input jsonb)
returns table (id uuid, updated_at timestamptz, subtotal numeric, optional_subtotal numeric,
  gst_amount numeric, total_quote_price numeric, status text,
  originating_opportunity_id uuid, project_id uuid)
language sql security definer set search_path = public
as $$ select * from public.publish_worksheet_commercial_quote_v1(p_input); $$;

create or replace function public.publish_commercial_quotes_v1(p_input jsonb)
returns table (id uuid, updated_at timestamptz, subtotal numeric, optional_subtotal numeric,
  gst_amount numeric, total_quote_price numeric, status text,
  originating_opportunity_id uuid, project_id uuid)
language sql security definer set search_path = public
as $$ select * from public.publish_worksheet_commercial_quotes_v1(p_input); $$;

revoke execute on function public.publish_commercial_quote_v1(jsonb) from public, anon;
revoke execute on function public.publish_commercial_quotes_v1(jsonb) from public, anon;
grant execute on function public.publish_commercial_quote_v1(jsonb) to authenticated;
grant execute on function public.publish_commercial_quotes_v1(jsonb) to authenticated;

commit;
