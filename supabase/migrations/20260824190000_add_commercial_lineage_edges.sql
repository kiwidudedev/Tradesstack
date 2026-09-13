begin;

create table public.commercial_lineage_edges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  project_id uuid null references public.organization_projects (id) on delete restrict,
  from_entity_type text not null,
  from_entity_id uuid not null,
  to_entity_type text not null,
  to_entity_id uuid not null,
  relationship_type text not null,
  evidence_source text not null,
  evidence_version text not null,
  evidence_ref jsonb not null default '{}'::jsonb,
  evidence_batch_id uuid null,
  contribution_quantity numeric null,
  contribution_amount numeric null,
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid null references auth.users (id) on delete set null,
  superseded_at timestamptz null,
  superseded_by uuid null references public.commercial_lineage_edges (id) on delete restrict,
  supersession_reason text null,
  constraint commercial_lineage_edges_type_values_check check (
    from_entity_type in (
      'commercial_item', 'organization_material',
      'organization_material_supplier_product', 'organization_material_supplier_price',
      'takeoff_measurement', 'project_quote', 'project_quote_line_item',
      'project_variation', 'project_variation_line_item',
      'project_purchase_order_line_item'
    )
    and to_entity_type in (
      'commercial_item', 'organization_material',
      'organization_material_supplier_product', 'organization_material_supplier_price',
      'takeoff_measurement', 'project_quote', 'project_quote_line_item',
      'project_variation', 'project_variation_line_item',
      'project_purchase_order_line_item'
    )
  ),
  constraint commercial_lineage_edges_relationship_type_check check (
    relationship_type in (
      'derived_from_material', 'priced_from_supplier_product',
      'priced_from_supplier_price', 'measured_from', 'scoped_by', 'caused_by'
    )
  ),
  constraint commercial_lineage_edges_no_self_edge_check check (
    from_entity_type is distinct from to_entity_type or from_entity_id is distinct from to_entity_id
  ),
  constraint commercial_lineage_edges_evidence_ref_object_check check (
    jsonb_typeof(evidence_ref) = 'object'
  ),
  constraint commercial_lineage_edges_evidence_ref_size_check check (
    octet_length(evidence_ref::text) <= 16384
  ),
  constraint commercial_lineage_edges_evidence_labels_check check (
    char_length(btrim(evidence_source)) between 1 and 120
    and char_length(btrim(evidence_version)) between 1 and 80
  ),
  constraint commercial_lineage_edges_contribution_quantity_check check (
    contribution_quantity is null or contribution_quantity >= 0
  ),
  constraint commercial_lineage_edges_contribution_amount_check check (
    contribution_amount is null or contribution_amount >= 0
  ),
  constraint commercial_lineage_edges_supersession_state_check check (
    (
      superseded_at is null
      and superseded_by is null
      and supersession_reason is null
    )
    or (
      superseded_at is not null
      and supersession_reason is not null
      and char_length(btrim(supersession_reason)) > 0
    )
  ),
  constraint commercial_lineage_edges_not_superseded_by_self_check check (superseded_by is distinct from id)
);

comment on table public.commercial_lineage_edges is
  'Additive, factual commercial provenance for relationships not already represented by a strong FK or commercial_item_document_links.';
comment on column public.commercial_lineage_edges.from_entity_id is
  'Downstream or derived entity. The destination of the underlying business derivation.';
comment on column public.commercial_lineage_edges.to_entity_id is
  'Factual upstream source entity. Unknown sources are never represented by fake edges.';
comment on column public.commercial_lineage_edges.contribution_amount is
  'Optional provenance evidence only. Canonical financial records remain the sole financial truth.';

create unique index commercial_lineage_edges_active_identity_key
  on public.commercial_lineage_edges (
    organization_id, from_entity_type, from_entity_id,
    to_entity_type, to_entity_id, relationship_type
  )
  where superseded_at is null;

create index commercial_lineage_edges_from_active_idx
  on public.commercial_lineage_edges (organization_id, from_entity_type, from_entity_id, created_at)
  where superseded_at is null;

create index commercial_lineage_edges_to_active_idx
  on public.commercial_lineage_edges (organization_id, to_entity_type, to_entity_id, created_at)
  where superseded_at is null;

create index commercial_lineage_edges_project_active_idx
  on public.commercial_lineage_edges (organization_id, project_id, created_at)
  where superseded_at is null and project_id is not null;

create or replace function public.resolve_commercial_lineage_entity_scope(
  p_entity_type text,
  p_entity_id uuid
)
returns table (organization_id uuid, project_id uuid)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  case p_entity_type
    when 'commercial_item' then
      return query select item.organization_id, item.project_id
        from public.commercial_items item where item.id = p_entity_id;
    when 'organization_material' then
      return query select material.organization_id, null::uuid
        from public.organization_materials material where material.id = p_entity_id;
    when 'organization_material_supplier_product' then
      return query select product.organization_id, null::uuid
        from public.organization_material_supplier_products product where product.id = p_entity_id;
    when 'organization_material_supplier_price' then
      return query select price.organization_id, null::uuid
        from public.organization_material_supplier_prices price where price.id = p_entity_id;
    when 'takeoff_measurement' then
      return query select measurement.organization_id, measurement.project_id
        from public.takeoff_measurements measurement where measurement.id = p_entity_id;
    when 'project_quote' then
      return query select quote.organization_id, quote.project_id
        from public.project_quotes quote where quote.id = p_entity_id;
    when 'project_quote_line_item' then
      return query select line.organization_id, quote.project_id
        from public.project_quote_line_items line
        join public.project_quotes quote on quote.id = line.quote_id
        where line.id = p_entity_id;
    when 'project_variation' then
      return query select variation.organization_id, variation.project_id
        from public.project_variations variation where variation.id = p_entity_id;
    when 'project_variation_line_item' then
      return query select line.organization_id, variation.project_id
        from public.project_variation_line_items line
        join public.project_variations variation on variation.id = line.variation_id
        where line.id = p_entity_id;
    when 'project_purchase_order_line_item' then
      return query select line.organization_id, purchase_order.project_id
        from public.project_purchase_order_line_items line
        join public.project_purchase_orders purchase_order on purchase_order.id = line.purchase_order_id
        where line.id = p_entity_id;
    else
      raise exception 'commercial_lineage:unsupported_entity_type:%', p_entity_type using errcode = '22023';
  end case;
end;
$$;

create or replace function public.commercial_lineage_relationship_is_allowed(
  p_from_entity_type text,
  p_to_entity_type text,
  p_relationship_type text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from_entity_type, p_to_entity_type, p_relationship_type) in (
    ('commercial_item', 'organization_material', 'derived_from_material'),
    ('commercial_item', 'organization_material_supplier_product', 'priced_from_supplier_product'),
    ('commercial_item', 'organization_material_supplier_price', 'priced_from_supplier_price'),
    ('commercial_item', 'takeoff_measurement', 'measured_from'),
    ('commercial_item', 'project_quote', 'scoped_by'),
    ('commercial_item', 'project_variation', 'scoped_by'),
    ('project_purchase_order_line_item', 'project_quote_line_item', 'caused_by'),
    ('project_purchase_order_line_item', 'project_variation_line_item', 'caused_by')
  );
$$;

create or replace function public.validate_commercial_lineage_edge()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  from_scope record;
  to_scope record;
begin
  if not public.commercial_lineage_relationship_is_allowed(
    new.from_entity_type, new.to_entity_type, new.relationship_type
  ) then
    raise exception 'commercial_lineage:unsupported_relationship_pair' using errcode = '23514';
  end if;

  select * into from_scope
  from public.resolve_commercial_lineage_entity_scope(new.from_entity_type, new.from_entity_id);
  if not found then
    raise exception 'commercial_lineage:missing_from_entity' using errcode = '23503';
  end if;

  select * into to_scope
  from public.resolve_commercial_lineage_entity_scope(new.to_entity_type, new.to_entity_id);
  if not found then
    raise exception 'commercial_lineage:missing_to_entity' using errcode = '23503';
  end if;

  if from_scope.organization_id is distinct from new.organization_id
    or to_scope.organization_id is distinct from new.organization_id then
    raise exception 'commercial_lineage:cross_organization_edge' using errcode = '23514';
  end if;

  if from_scope.project_id is not null and to_scope.project_id is not null
    and from_scope.project_id is distinct from to_scope.project_id then
    raise exception 'commercial_lineage:project_mismatch' using errcode = '23514';
  end if;

  if new.project_id is not null
    and new.project_id is distinct from coalesce(from_scope.project_id, to_scope.project_id) then
    raise exception 'commercial_lineage:edge_project_mismatch' using errcode = '23514';
  end if;

  new.project_id := coalesce(new.project_id, from_scope.project_id, to_scope.project_id);
  return new;
end;
$$;

create trigger commercial_lineage_edges_validate
before insert on public.commercial_lineage_edges
for each row execute function public.validate_commercial_lineage_edge();

create or replace function public.reject_commercial_lineage_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.from_entity_type is distinct from old.from_entity_type
    or new.from_entity_id is distinct from old.from_entity_id
    or new.to_entity_type is distinct from old.to_entity_type
    or new.to_entity_id is distinct from old.to_entity_id
    or new.relationship_type is distinct from old.relationship_type
    or new.evidence_source is distinct from old.evidence_source
    or new.evidence_version is distinct from old.evidence_version
    or new.evidence_ref is distinct from old.evidence_ref
    or new.evidence_batch_id is distinct from old.evidence_batch_id
    or new.contribution_quantity is distinct from old.contribution_quantity
    or new.contribution_amount is distinct from old.contribution_amount
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'commercial_lineage:identity_and_evidence_are_immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger commercial_lineage_edges_preserve_evidence
before update on public.commercial_lineage_edges
for each row execute function public.reject_commercial_lineage_evidence_mutation();

alter table public.commercial_lineage_edges enable row level security;
alter table public.commercial_lineage_edges force row level security;

revoke all on public.commercial_lineage_edges from public, anon, authenticated;
grant select, insert, update on public.commercial_lineage_edges to service_role;

create or replace function public.sync_commercial_item_lineage_internal(
  p_commercial_item_id uuid,
  p_evidence_batch_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.commercial_items%rowtype;
  cell jsonb;
  material jsonb;
  measure jsonb;
  source_price_id uuid;
  inserted_count integer := 0;
  affected integer := 0;
  owner_id uuid;
begin
  select * into item from public.commercial_items where id = p_commercial_item_id;
  if not found then
    raise exception 'commercial_lineage:commercial_item_not_found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(item.locked_metadata_json -> 'cells') = 'array' then
    for cell in select value from jsonb_array_elements(item.locked_metadata_json -> 'cells') loop
      material := cell -> 'metadata' -> 'materialPricing';
      if jsonb_typeof(material) = 'object' and (material ->> 'version') in ('1', '2') then
        source_price_id := case
          when material ->> 'version' = '2' then nullif(material #>> '{sourcePricing,supplierPriceId}', '')::uuid
          else nullif(material ->> 'supplierPriceId', '')::uuid
        end;

        if exists (
          select 1
          from public.worksheet_material_price_bindings binding
          where binding.id = nullif(material ->> 'bindingId', '')::uuid
            and binding.organization_id = item.organization_id
            and binding.workbook_id = item.source_workbook_id
            and binding.sheet_id = item.source_sheet_id
            and binding.current_cell_address = cell ->> 'cellKey'
            and binding.organization_material_id = nullif(material ->> 'organizationMaterialId', '')::uuid
            and binding.supplier_product_id = nullif(material ->> 'supplierProductId', '')::uuid
            and binding.supplier_price_id = source_price_id
            and binding.binding_state = 'active'
        ) then
          insert into public.commercial_lineage_edges (
            organization_id, project_id, from_entity_type, from_entity_id,
            to_entity_type, to_entity_id, relationship_type,
            evidence_source, evidence_version, evidence_ref, evidence_batch_id, created_by
          ) values
          (item.organization_id, item.project_id, 'commercial_item', item.id,
            'organization_material', (material ->> 'organizationMaterialId')::uuid, 'derived_from_material',
            'commercial_item_locked_metadata', 'material_pricing_v' || (material ->> 'version'),
            jsonb_build_object('cellKey', cell ->> 'cellKey', 'bindingId', material ->> 'bindingId',
              'worksheetVersion', item.locked_metadata_json -> 'worksheetVersion'), p_evidence_batch_id, item.created_by),
          (item.organization_id, item.project_id, 'commercial_item', item.id,
            'organization_material_supplier_product', (material ->> 'supplierProductId')::uuid, 'priced_from_supplier_product',
            'commercial_item_locked_metadata', 'material_pricing_v' || (material ->> 'version'),
            jsonb_build_object('cellKey', cell ->> 'cellKey', 'bindingId', material ->> 'bindingId',
              'worksheetVersion', item.locked_metadata_json -> 'worksheetVersion'), p_evidence_batch_id, item.created_by),
          (item.organization_id, item.project_id, 'commercial_item', item.id,
            'organization_material_supplier_price', source_price_id, 'priced_from_supplier_price',
            'commercial_item_locked_metadata', 'material_pricing_v' || (material ->> 'version'),
            jsonb_build_object('cellKey', cell ->> 'cellKey', 'bindingId', material ->> 'bindingId',
              'worksheetVersion', item.locked_metadata_json -> 'worksheetVersion'), p_evidence_batch_id, item.created_by)
          on conflict (organization_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type)
            where superseded_at is null do nothing;
          get diagnostics affected = row_count;
          inserted_count := inserted_count + affected;
        end if;
      end if;

      measure := cell -> 'metadata' -> 'measureSource';
      if jsonb_typeof(measure) = 'object' and measure ->> 'version' = '1'
        and exists (
          select 1
          from public.takeoff_measurements measurement
          where measurement.id = nullif(measure ->> 'measurementId', '')::uuid
            and measurement.organization_id = item.organization_id
            and measurement.project_id = nullif(measure ->> 'projectId', '')::uuid
            and (item.project_id is null or measurement.project_id = item.project_id)
            and (item.project_id is not null or measurement.opportunity_id = item.opportunity_id)
            and measurement.drawing_set_id = nullif(measure ->> 'drawingSetId', '')::uuid
            and measurement.page_id = nullif(measure ->> 'pageId', '')::uuid
            and measurement.group_id is not distinct from nullif(measure ->> 'groupId', '')::uuid
            and measurement.version = (measure ->> 'measurementVersion')::integer
            and measurement.archived_at is null
        ) then
        insert into public.commercial_lineage_edges (
          organization_id, project_id, from_entity_type, from_entity_id,
          to_entity_type, to_entity_id, relationship_type,
          evidence_source, evidence_version, evidence_ref, evidence_batch_id,
          contribution_quantity, created_by
        ) values (
          item.organization_id, coalesce(item.project_id, (measure ->> 'projectId')::uuid),
          'commercial_item', item.id, 'takeoff_measurement', (measure ->> 'measurementId')::uuid, 'measured_from',
          'commercial_item_locked_metadata', 'measure_source_v1',
          jsonb_build_object(
            'cellKey', cell ->> 'cellKey', 'bindingId', measure ->> 'bindingId',
            'worksheetVersion', item.locked_metadata_json -> 'worksheetVersion',
            'measurementVersion', measure -> 'measurementVersion',
            'insertedField', measure -> 'insertedField', 'insertedUnit', measure -> 'insertedUnit'
          ), p_evidence_batch_id, (measure ->> 'insertedQuantity')::numeric, item.created_by
        )
        on conflict (organization_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type)
          where superseded_at is null do nothing;
        get diagnostics affected = row_count;
        inserted_count := inserted_count + affected;
      end if;
    end loop;
  end if;

  owner_id := nullif(item.source_link_json ->> 'variationId', '')::uuid;
  if owner_id is not null and exists (
    select 1 from public.project_variations variation
    where variation.id = owner_id and variation.organization_id = item.organization_id
      and (item.project_id is null or variation.project_id = item.project_id)
  ) then
    insert into public.commercial_lineage_edges (
      organization_id, project_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id,
      relationship_type, evidence_source, evidence_version, evidence_ref, evidence_batch_id, created_by
    ) values (
      item.organization_id, item.project_id, 'commercial_item', item.id, 'project_variation', owner_id,
      'scoped_by', 'commercial_item_source_link', 'worksheet_selection_v1',
      jsonb_build_object('sourceRange', item.source_range, 'sourceVersion', item.source_version),
      p_evidence_batch_id, item.created_by
    ) on conflict (organization_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type)
      where superseded_at is null do nothing;
    get diagnostics affected = row_count;
    inserted_count := inserted_count + affected;
  end if;

  owner_id := nullif(item.source_link_json ->> 'quoteId', '')::uuid;
  if owner_id is not null and exists (
    select 1 from public.project_quotes quote
    where quote.id = owner_id and quote.organization_id = item.organization_id
      and (item.project_id is null or quote.project_id = item.project_id)
      and (quote.source_opportunity_id is null or quote.source_opportunity_id = item.opportunity_id)
  ) then
    insert into public.commercial_lineage_edges (
      organization_id, project_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id,
      relationship_type, evidence_source, evidence_version, evidence_ref, evidence_batch_id, created_by
    ) values (
      item.organization_id, item.project_id, 'commercial_item', item.id, 'project_quote', owner_id,
      'scoped_by', 'commercial_item_source_link', 'worksheet_selection_v1',
      jsonb_build_object('sourceRange', item.source_range, 'sourceVersion', item.source_version),
      p_evidence_batch_id, item.created_by
    ) on conflict (organization_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type)
      where superseded_at is null do nothing;
    get diagnostics affected = row_count;
    inserted_count := inserted_count + affected;
  end if;

  return inserted_count;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return inserted_count;
end;
$$;

create or replace function public.sync_commercial_item_lineage(p_commercial_item_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_organization_id uuid;
begin
  select organization_id into item_organization_id
  from public.commercial_items where id = p_commercial_item_id;
  if item_organization_id is null then
    raise exception 'commercial_lineage:commercial_item_not_found' using errcode = 'P0002';
  end if;
  if auth.role() <> 'service_role'
    and not public.is_member_of_organization(item_organization_id) then
    raise exception 'commercial_lineage:permission_denied' using errcode = '42501';
  end if;
  return public.sync_commercial_item_lineage_internal(p_commercial_item_id, null);
end;
$$;

create or replace function public.backfill_commercial_lineage_edges(
  p_evidence_batch_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_id uuid;
  inserted_count integer := 0;
  item_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'commercial_lineage:service_role_required' using errcode = '42501';
  end if;
  for item_id in select id from public.commercial_items order by id loop
    item_count := item_count + 1;
    inserted_count := inserted_count + public.sync_commercial_item_lineage_internal(item_id, p_evidence_batch_id);
  end loop;
  return jsonb_build_object(
    'evidenceBatchId', p_evidence_batch_id,
    'commercialItemsScanned', item_count,
    'edgesInserted', inserted_count
  );
end;
$$;

revoke all on function public.resolve_commercial_lineage_entity_scope(text, uuid) from public, anon, authenticated;
revoke all on function public.commercial_lineage_relationship_is_allowed(text, text, text) from public, anon, authenticated;
revoke all on function public.validate_commercial_lineage_edge() from public, anon, authenticated;
revoke all on function public.reject_commercial_lineage_evidence_mutation() from public, anon, authenticated;
revoke all on function public.sync_commercial_item_lineage_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sync_commercial_item_lineage(uuid) from public, anon, authenticated;
revoke all on function public.backfill_commercial_lineage_edges(uuid) from public, anon, authenticated;

grant execute on function public.sync_commercial_item_lineage(uuid) to authenticated, service_role;
grant execute on function public.backfill_commercial_lineage_edges(uuid) to service_role;

commit;
