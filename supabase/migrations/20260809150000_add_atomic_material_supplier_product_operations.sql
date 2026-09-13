begin;

-- Phase 1F installs the transactional write engine only. Legacy writers remain
-- available until Phase 1G, so supplier_product_id intentionally stays nullable.

drop index if exists public.organization_material_supplier_prices_idempotency_key;
create unique index organization_material_supplier_prices_product_idempotency_key
  on public.organization_material_supplier_prices (
    organization_id,
    supplier_product_id,
    idempotency_key
  )
  where supplier_product_id is not null and idempotency_key is not null;

create or replace function public.materials_phase1f_error(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'materials_phase1f:' || p_code;
end;
$$;

create or replace function public.materials_phase1f_require_writer(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.has_org_permission(p_organization_id, 'materials.write') then
    perform public.materials_phase1f_error('permission_denied');
  end if;
  return v_actor;
end;
$$;

create or replace function public.materials_phase1f_set_preferred_internal(
  p_organization_id uuid,
  p_material_id uuid,
  p_supplier_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.organization_material_supplier_products%rowtype;
  v_price_id uuid;
begin
  perform 1
  from public.organization_materials
  where organization_id = p_organization_id and id = p_material_id
  for update;
  if not found then
    perform public.materials_phase1f_error('material_not_found');
  end if;

  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = p_organization_id and id = p_supplier_product_id
  for update;
  if not found then
    perform public.materials_phase1f_error('supplier_product_not_found');
  end if;
  if v_product.material_id <> p_material_id then
    perform public.materials_phase1f_error('preferred_product_mismatch');
  end if;
  if not v_product.is_active or v_product.archived_at is not null then
    perform public.materials_phase1f_error('preferred_product_inactive');
  end if;

  update public.organization_material_supplier_products
  set is_preferred = false, updated_by = auth.uid()
  where organization_id = p_organization_id
    and material_id = p_material_id
    and is_preferred = true
    and id <> p_supplier_product_id;

  update public.organization_material_supplier_products
  set is_preferred = true, updated_by = auth.uid()
  where organization_id = p_organization_id and id = p_supplier_product_id;

  update public.organization_material_supplier_prices
  set is_preferred = false
  where organization_id = p_organization_id
    and material_id = p_material_id
    and is_current = true
    and is_preferred = true;

  select id into v_price_id
  from public.organization_material_supplier_prices
  where organization_id = p_organization_id
    and supplier_product_id = p_supplier_product_id
    and is_current = true
  order by effective_from desc, id
  limit 1
  for update;

  if v_price_id is not null then
    update public.organization_material_supplier_prices
    set is_preferred = true
    where organization_id = p_organization_id and id = v_price_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'supplier_product_id', p_supplier_product_id,
    'material_id', p_material_id,
    'legacy_preferred_price_id', v_price_id
  );
end;
$$;

create or replace function public.materials_phase1f_add_price_internal(
  p_organization_id uuid,
  p_supplier_product_id uuid,
  p_unit_cost numeric,
  p_currency text,
  p_effective_from timestamptz,
  p_effective_was_explicit boolean,
  p_source text,
  p_idempotency_key text,
  p_import_batch_id uuid,
  p_import_row_id uuid,
  p_observation_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.organization_material_supplier_products%rowtype;
  v_existing public.organization_material_supplier_prices%rowtype;
  v_current public.organization_material_supplier_prices%rowtype;
  v_new public.organization_material_supplier_prices%rowtype;
  v_currency text := pg_catalog.upper(pg_catalog.btrim(p_currency));
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_now timestamptz := statement_timestamp();
begin
  if p_unit_cost is null or p_unit_cost < 0 then
    perform public.materials_phase1f_error('invalid_price');
  end if;
  if v_currency is null or v_currency = '' then
    perform public.materials_phase1f_error('invalid_currency');
  end if;
  if v_key is null or v_key = '' then
    perform public.materials_phase1f_error('idempotency_key_required');
  end if;
  if p_source not in ('manual', 'import', 'supplier_invoice', 'purchase_order', 'api') then
    perform public.materials_phase1f_error('invalid_source');
  end if;

  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = p_organization_id and id = p_supplier_product_id
  for update;
  if not found then
    perform public.materials_phase1f_error('supplier_product_not_found');
  end if;
  if not v_product.is_active or v_product.archived_at is not null then
    perform public.materials_phase1f_error('supplier_product_inactive');
  end if;

  select * into v_existing
  from public.organization_material_supplier_prices
  where organization_id = p_organization_id
    and supplier_product_id = p_supplier_product_id
    and idempotency_key = v_key;

  if v_existing.id is not null then
    if v_existing.unit_cost is distinct from p_unit_cost
      or v_existing.currency is distinct from v_currency
      or (p_effective_was_explicit and v_existing.effective_from is distinct from p_effective_from)
      or v_existing.source is distinct from p_source
      or v_existing.import_batch_id is distinct from p_import_batch_id
      or v_existing.import_row_id is distinct from p_import_row_id then
      perform public.materials_phase1f_error('idempotency_conflict');
    end if;
    return pg_catalog.jsonb_build_object(
      'supplier_product_id', p_supplier_product_id,
      'price_id', v_existing.id,
      'idempotent_replay', true
    );
  end if;

  if p_effective_from > v_now + interval '1 second' then
    perform public.materials_phase1f_error('future_price_requires_read_cutover');
  end if;

  if p_import_batch_id is not null and not exists (
    select 1 from public.organization_material_import_batches
    where organization_id = p_organization_id and id = p_import_batch_id
  ) then
    perform public.materials_phase1f_error('organization_mismatch');
  end if;
  if p_import_row_id is not null and not exists (
    select 1 from public.organization_material_import_rows
    where organization_id = p_organization_id
      and id = p_import_row_id
      and (p_import_batch_id is null or import_batch_id = p_import_batch_id)
  ) then
    perform public.materials_phase1f_error('organization_mismatch');
  end if;

  select * into v_current
  from public.organization_material_supplier_prices
  where organization_id = p_organization_id
    and supplier_product_id = p_supplier_product_id
    and is_current = true
  order by effective_from desc, id
  limit 1
  for update;

  if v_current.id is not null and p_effective_from < v_current.effective_from then
    perform public.materials_phase1f_error('unsupported_backdated_price');
  end if;
  if v_current.id is null and exists (
    select 1 from public.organization_material_supplier_prices
    where organization_id = p_organization_id
      and supplier_product_id = p_supplier_product_id
      and effective_from > p_effective_from
  ) then
    perform public.materials_phase1f_error('unsupported_backdated_price');
  end if;

  if v_current.id is not null then
    update public.organization_material_supplier_prices
    set is_current = false,
        is_preferred = false,
        effective_to = p_effective_from
    where organization_id = p_organization_id and id = v_current.id;
  end if;

  if v_product.is_preferred then
    update public.organization_material_supplier_prices
    set is_preferred = false
    where organization_id = p_organization_id
      and material_id = v_product.material_id
      and is_current = true
      and is_preferred = true;
  end if;

  begin
    insert into public.organization_material_supplier_prices (
      organization_id, material_id, supplier_id, supplier_product_id,
      import_batch_id, import_row_id, supersedes_price_id, idempotency_key,
      supplier_sku, supplier_description, unit, unit_cost, currency,
      is_preferred, is_current, source, effective_from, effective_to,
      created_by, observation_metadata
    ) values (
      p_organization_id, v_product.material_id, v_product.supplier_id, v_product.id,
      p_import_batch_id, p_import_row_id, v_current.id, v_key,
      v_product.supplier_sku, v_product.supplier_description, v_product.supplier_unit,
      p_unit_cost, v_currency, v_product.is_preferred, true, p_source,
      p_effective_from, null, auth.uid(), p_observation_metadata
    ) returning * into v_new;
  exception when unique_violation then
    perform public.materials_phase1f_error('price_interval_conflict');
  end;

  return pg_catalog.jsonb_build_object(
    'supplier_product_id', v_product.id,
    'price_id', v_new.id,
    'supersedes_price_id', v_new.supersedes_price_id,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.add_supplier_product_price_version(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_effective_explicit boolean := p_input ? 'effective_from';
begin
  perform public.materials_phase1f_require_writer(v_org);
  return public.materials_phase1f_add_price_internal(
    v_org,
    (p_input->>'supplier_product_id')::uuid,
    (p_input->>'unit_cost')::numeric,
    coalesce(p_input->>'currency', 'NZD'),
    coalesce((p_input->>'effective_from')::timestamptz, statement_timestamp()),
    v_effective_explicit,
    coalesce(p_input->>'source', 'manual'),
    p_input->>'idempotency_key',
    (p_input->>'import_batch_id')::uuid,
    (p_input->>'import_row_id')::uuid,
    p_input->'observation_metadata'
  );
end;
$$;

create or replace function public.set_preferred_supplier_product(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
begin
  perform public.materials_phase1f_require_writer(v_org);
  return public.materials_phase1f_set_preferred_internal(
    v_org,
    (p_input->>'material_id')::uuid,
    (p_input->>'supplier_product_id')::uuid
  );
end;
$$;

create or replace function public.create_supplier_product_with_initial_price(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_actor uuid;
  v_material_id uuid := (p_input->>'material_id')::uuid;
  v_supplier_id uuid := (p_input->>'supplier_id')::uuid;
  v_product public.organization_material_supplier_products%rowtype;
  v_result jsonb;
begin
  v_actor := public.materials_phase1f_require_writer(v_org);
  if not exists (select 1 from public.organization_materials where organization_id = v_org and id = v_material_id) then
    perform public.materials_phase1f_error('material_not_found');
  end if;
  if not exists (select 1 from public.organization_suppliers where organization_id = v_org and id = v_supplier_id) then
    perform public.materials_phase1f_error('supplier_not_found');
  end if;
  if nullif(pg_catalog.btrim(p_input->>'supplier_unit'), '') is null then
    perform public.materials_phase1f_error('invalid_unit');
  end if;
  if nullif(pg_catalog.btrim(p_input->>'supplier_sku'), '') is null
     and nullif(pg_catalog.btrim(p_input->>'supplier_description'), '') is null then
    perform public.materials_phase1f_error('identity_required');
  end if;

  begin
    insert into public.organization_material_supplier_products (
      organization_id, material_id, supplier_id, supplier_sku,
      supplier_description, supplier_unit, identity_variant, identity_status,
      is_preferred, created_source, created_by, updated_by, metadata
    ) values (
      v_org, v_material_id, v_supplier_id,
      nullif(pg_catalog.btrim(p_input->>'supplier_sku'), ''),
      nullif(pg_catalog.btrim(p_input->>'supplier_description'), ''),
      pg_catalog.btrim(p_input->>'supplier_unit'),
      coalesce(nullif(pg_catalog.btrim(p_input->>'identity_variant'), ''), 'default'),
      'confirmed', false, coalesce(p_input->>'created_source', 'manual'),
      v_actor, v_actor, coalesce(p_input->'product_metadata', '{}'::jsonb)
    ) returning * into v_product;
  exception when unique_violation then
    perform public.materials_phase1f_error('identity_conflict');
  end;

  insert into public.organization_material_supplier_product_assignments (
    organization_id, supplier_product_id, previous_material_id, new_material_id,
    reason, created_by, metadata
  ) values (
    v_org, v_product.id, null, v_material_id,
    'Initial Supplier Product assignment.', v_actor,
    pg_catalog.jsonb_build_object('operation', 'phase1f_create_product')
  );

  v_result := public.materials_phase1f_add_price_internal(
    v_org, v_product.id, (p_input->>'unit_cost')::numeric,
    coalesce(p_input->>'currency', 'NZD'),
    coalesce((p_input->>'effective_from')::timestamptz, statement_timestamp()),
    p_input ? 'effective_from', coalesce(p_input->>'source', 'manual'),
    p_input->>'idempotency_key', null, null, p_input->'observation_metadata'
  );

  if coalesce((p_input->>'is_preferred')::boolean, false) then
    perform public.materials_phase1f_set_preferred_internal(v_org, v_material_id, v_product.id);
  end if;

  return v_result || pg_catalog.jsonb_build_object('created_product', true);
end;
$$;

create or replace function public.remap_supplier_product_material(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_product public.organization_material_supplier_products%rowtype;
  v_new_material_id uuid := (p_input->>'new_material_id')::uuid;
  v_reason text := pg_catalog.btrim(p_input->>'reason');
begin
  perform public.materials_phase1f_require_writer(v_org);
  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = v_org and id = (p_input->>'supplier_product_id')::uuid
  for update;
  if not found then
    perform public.materials_phase1f_error('supplier_product_not_found');
  end if;
  if not exists (select 1 from public.organization_materials where organization_id = v_org and id = v_new_material_id) then
    perform public.materials_phase1f_error('material_not_found');
  end if;
  if v_product.material_id = v_new_material_id then
    return pg_catalog.jsonb_build_object('supplier_product_id', v_product.id, 'no_op', true);
  end if;
  if v_reason is null or v_reason = '' then
    perform public.materials_phase1f_error('remap_reason_required');
  end if;
  if exists (
    select 1 from public.organization_material_supplier_prices
    where organization_id = v_org and supplier_product_id = v_product.id
  ) then
    perform public.materials_phase1f_error('remap_price_history_not_supported');
  end if;

  begin
    update public.organization_material_supplier_products
    set material_id = v_new_material_id, updated_by = auth.uid()
    where organization_id = v_org and id = v_product.id;
  exception when unique_violation then
    perform public.materials_phase1f_error('identity_conflict');
  end;

  insert into public.organization_material_supplier_product_assignments (
    organization_id, supplier_product_id, previous_material_id, new_material_id,
    reason, created_by, metadata
  ) values (
    v_org, v_product.id, v_product.material_id, v_new_material_id,
    v_reason, auth.uid(), pg_catalog.jsonb_build_object('operation', 'phase1f_remap')
  );

  return pg_catalog.jsonb_build_object(
    'supplier_product_id', v_product.id,
    'previous_material_id', v_product.material_id,
    'new_material_id', v_new_material_id,
    'no_op', false
  );
end;
$$;

create or replace function public.approve_material_import_row(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_actor uuid;
  v_row public.organization_material_import_rows%rowtype;
  v_batch public.organization_material_import_batches%rowtype;
  v_product public.organization_material_supplier_products%rowtype;
  v_material_id uuid := (p_input->>'material_id')::uuid;
  v_product_id uuid := (p_input->>'supplier_product_id')::uuid;
  v_price_result jsonb;
  v_price_id uuid;
  v_name text;
begin
  v_actor := public.materials_phase1f_require_writer(v_org);

  select * into v_row
  from public.organization_material_import_rows
  where organization_id = v_org and id = (p_input->>'import_row_id')::uuid
  for update;
  if not found then
    perform public.materials_phase1f_error('import_row_not_found');
  end if;

  if v_row.status = 'approved' then
    if v_row.approved_supplier_product_id is not null and v_row.approved_supplier_price_id is not null then
      return pg_catalog.jsonb_build_object(
        'material_id', v_row.matched_material_id,
        'supplier_product_id', v_row.approved_supplier_product_id,
        'price_id', v_row.approved_supplier_price_id,
        'idempotent_replay', true
      );
    end if;
    perform public.materials_phase1f_error('import_row_already_approved');
  end if;

  select * into v_batch
  from public.organization_material_import_batches
  where organization_id = v_org and id = v_row.import_batch_id
  for update;
  if not found then
    perform public.materials_phase1f_error('organization_mismatch');
  end if;
  if v_batch.supplier_id is null then
    perform public.materials_phase1f_error('supplier_not_found');
  end if;

  if v_material_id is null then
    v_name := pg_catalog.btrim(coalesce(p_input->>'material_name', v_row.reviewed_name, v_row.extracted_name));
    if v_name is null or v_name = '' then
      perform public.materials_phase1f_error('material_name_required');
    end if;
    begin
      insert into public.organization_materials (
        organization_id, created_by, name, normalized_name, description,
        default_unit, metadata, is_active
      ) values (
        v_org, v_actor, v_name,
        pg_catalog.lower(pg_catalog.regexp_replace(v_name, '\s+', ' ', 'g')),
        coalesce(p_input->>'material_description', v_row.reviewed_description, v_row.extracted_description),
        coalesce(nullif(pg_catalog.btrim(p_input->>'material_unit'), ''), v_row.reviewed_unit, v_row.extracted_unit, 'ea'),
        pg_catalog.jsonb_build_object('created_from_import_row_id', v_row.id), true
      ) returning id into v_material_id;
    exception when unique_violation then
      perform public.materials_phase1f_error('identity_conflict');
    end;
  elsif not exists (select 1 from public.organization_materials where organization_id = v_org and id = v_material_id) then
    perform public.materials_phase1f_error('material_not_found');
  end if;

  if v_product_id is not null then
    select * into v_product
    from public.organization_material_supplier_products
    where organization_id = v_org and id = v_product_id
    for update;
    if not found then
      perform public.materials_phase1f_error('supplier_product_not_found');
    end if;
    if v_product.material_id <> v_material_id or v_product.supplier_id <> v_batch.supplier_id then
      perform public.materials_phase1f_error('organization_mismatch');
    end if;
  else
    begin
      insert into public.organization_material_supplier_products (
        organization_id, material_id, supplier_id, supplier_sku,
        supplier_description, supplier_unit, identity_variant, identity_status,
        created_source, created_by, updated_by, metadata
      ) values (
        v_org, v_material_id, v_batch.supplier_id,
        nullif(pg_catalog.btrim(coalesce(p_input->>'supplier_sku', v_row.reviewed_supplier_sku, v_row.supplier_sku)), ''),
        nullif(pg_catalog.btrim(coalesce(p_input->>'supplier_description', v_row.reviewed_supplier_description, v_row.supplier_description)), ''),
        coalesce(nullif(pg_catalog.btrim(p_input->>'supplier_unit'), ''), v_row.reviewed_unit, v_row.extracted_unit, 'ea'),
        coalesce(nullif(pg_catalog.btrim(p_input->>'identity_variant'), ''), 'default'),
        'confirmed', 'import', v_actor, v_actor,
        pg_catalog.jsonb_build_object('created_from_import_row_id', v_row.id)
      ) returning * into v_product;
    exception when unique_violation then
      perform public.materials_phase1f_error('identity_conflict');
    when check_violation then
      perform public.materials_phase1f_error('identity_required');
    end;
    v_product_id := v_product.id;
    insert into public.organization_material_supplier_product_assignments (
      organization_id, supplier_product_id, previous_material_id, new_material_id,
      reason, source_import_row_id, created_by, metadata
    ) values (
      v_org, v_product.id, null, v_material_id,
      'Initial Supplier Product assignment from import approval.', v_row.id,
      v_actor, pg_catalog.jsonb_build_object('operation', 'phase1f_import_approval')
    );
  end if;

  v_price_result := public.materials_phase1f_add_price_internal(
    v_org, v_product_id,
    coalesce((p_input->>'unit_cost')::numeric, v_row.reviewed_unit_cost, v_row.extracted_unit_cost),
    coalesce(p_input->>'currency', v_row.reviewed_currency, v_row.extracted_currency, 'NZD'),
    coalesce((p_input->>'effective_from')::timestamptz, statement_timestamp()),
    p_input ? 'effective_from', 'import',
    coalesce(p_input->>'idempotency_key', 'import-row:' || v_row.id::text),
    v_batch.id, v_row.id,
    pg_catalog.jsonb_build_object('import_row_id', v_row.id, 'import_batch_id', v_batch.id)
  );
  v_price_id := (v_price_result->>'price_id')::uuid;

  update public.organization_material_import_rows
  set matched_material_id = v_material_id,
      action = case when (p_input->>'material_id') is null then 'create_material' else 'match_material' end,
      status = 'approved',
      reviewed_name = coalesce(p_input->>'material_name', reviewed_name, extracted_name),
      reviewed_description = coalesce(p_input->>'material_description', reviewed_description, extracted_description),
      reviewed_unit = coalesce(p_input->>'material_unit', reviewed_unit, extracted_unit),
      reviewed_unit_cost = coalesce((p_input->>'unit_cost')::numeric, reviewed_unit_cost, extracted_unit_cost),
      reviewed_currency = coalesce(p_input->>'currency', reviewed_currency, extracted_currency, 'NZD'),
      reviewed_by = v_actor,
      reviewed_at = statement_timestamp(),
      approved_supplier_product_id = v_product_id,
      approved_supplier_price_id = v_price_id
  where organization_id = v_org and id = v_row.id;

  update public.organization_material_import_batches
  set rows_approved = (
        select pg_catalog.count(*)::integer
        from public.organization_material_import_rows
        where organization_id = v_org and import_batch_id = v_batch.id and status = 'approved'
      ),
      rows_rejected = (
        select pg_catalog.count(*)::integer
        from public.organization_material_import_rows
        where organization_id = v_org and import_batch_id = v_batch.id and status = 'rejected'
      ),
      status = case
        when not exists (
          select 1 from public.organization_material_import_rows
          where organization_id = v_org and import_batch_id = v_batch.id and status = 'pending_review'
        ) then 'approved'
        else 'partially_approved'
      end
  where organization_id = v_org and id = v_batch.id;

  return pg_catalog.jsonb_build_object(
    'material_id', v_material_id,
    'supplier_product_id', v_product_id,
    'price_id', v_price_id,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.materials_phase1f_error(text) from public, anon, authenticated;
revoke all on function public.materials_phase1f_require_writer(uuid) from public, anon, authenticated;
revoke all on function public.materials_phase1f_set_preferred_internal(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.materials_phase1f_add_price_internal(uuid, uuid, numeric, text, timestamptz, boolean, text, text, uuid, uuid, jsonb) from public, anon, authenticated;

revoke all on function public.create_supplier_product_with_initial_price(jsonb) from public, anon;
revoke all on function public.add_supplier_product_price_version(jsonb) from public, anon;
revoke all on function public.set_preferred_supplier_product(jsonb) from public, anon;
revoke all on function public.remap_supplier_product_material(jsonb) from public, anon;
revoke all on function public.approve_material_import_row(jsonb) from public, anon;

grant execute on function public.create_supplier_product_with_initial_price(jsonb) to authenticated;
grant execute on function public.add_supplier_product_price_version(jsonb) to authenticated;
grant execute on function public.set_preferred_supplier_product(jsonb) to authenticated;
grant execute on function public.remap_supplier_product_material(jsonb) to authenticated;
grant execute on function public.approve_material_import_row(jsonb) to authenticated;

comment on function public.add_supplier_product_price_version(jsonb) is
  'Phase 1F atomic immediate price supersession. Future scheduling is intentionally rejected until legacy reads are cut over.';
comment on function public.remap_supplier_product_material(jsonb) is
  'Phase 1F controlled remap. Products with price history are intentionally rejected to preserve price snapshot evidence.';

-- Live integration probes use representative tenant data but execute inside
-- exception-backed subtransactions. Every successful fixture is deliberately
-- rolled back; an unexpected result aborts the migration.
do $$
declare
  v_actor uuid;
  v_org uuid;
  v_product_id uuid;
  v_product public.organization_material_supplier_products%rowtype;
  v_current public.organization_material_supplier_prices%rowtype;
  v_other_material_id uuid;
  v_result jsonb;
  v_new_price_id uuid;
  v_probe_sku text := 'phase1f-migration-probe-sku';
  v_probe_unit text := 'phase1f-probe-unit';
  v_batch_id uuid;
  v_row_id uuid;
begin
  select member.user_id, product.organization_id, product.id
  into v_actor, v_org, v_product_id
  from public.organization_material_supplier_products product
  join public.organization_members member
    on member.organization_id = product.organization_id
   and member.role in ('owner', 'admin', 'qs', 'project_manager')
  where product.is_active = true
    and exists (
      select 1 from public.organization_material_supplier_prices price
      where price.organization_id = product.organization_id
        and price.supplier_product_id = product.id
        and price.is_current = true
    )
  order by product.id, member.user_id
  limit 1;

  if v_actor is null then
    raise notice 'Phase 1F transactional probes skipped: no writable attached-price fixture.';
    return;
  end if;

  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = v_org and id = v_product_id;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor::text, true);
  if not public.has_org_permission(v_org, 'materials.write') then
    raise exception 'Phase 1F probe fixture does not have materials.write.';
  end if;

  select * into v_current
  from public.organization_material_supplier_prices
  where organization_id = v_org
    and supplier_product_id = v_product.id
    and is_current = true
  order by effective_from desc, id
  limit 1;

  select id into v_other_material_id
  from public.organization_materials
  where organization_id = v_org and id <> v_product.material_id
  order by id
  limit 1;

  begin
    v_result := public.add_supplier_product_price_version(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'supplier_product_id', v_product.id,
      'unit_cost', v_current.unit_cost,
      'currency', v_current.currency,
      'effective_from', statement_timestamp(),
      'source', 'api',
      'idempotency_key', 'phase1f-migration-price-probe'
    ));
    v_new_price_id := (v_result->>'price_id')::uuid;

    if not exists (
      select 1 from public.organization_material_supplier_prices
      where id = v_new_price_id
        and supplier_product_id = v_product.id
        and supersedes_price_id = v_current.id
        and is_current = true
    ) or exists (
      select 1 from public.organization_material_supplier_prices
      where id = v_current.id and is_current = true
    ) then
      raise exception 'Phase 1F immediate supersession probe failed.';
    end if;

    v_result := public.add_supplier_product_price_version(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'supplier_product_id', v_product.id,
      'unit_cost', v_current.unit_cost,
      'currency', v_current.currency,
      'effective_from', (select effective_from from public.organization_material_supplier_prices where id = v_new_price_id),
      'source', 'api',
      'idempotency_key', 'phase1f-migration-price-probe'
    ));
    if (v_result->>'price_id')::uuid <> v_new_price_id
       or (v_result->>'idempotent_replay')::boolean is not true then
      raise exception 'Phase 1F idempotent replay probe failed.';
    end if;

    begin
      perform public.add_supplier_product_price_version(pg_catalog.jsonb_build_object(
        'organization_id', v_org,
        'supplier_product_id', v_product.id,
        'unit_cost', v_current.unit_cost + 1,
        'currency', v_current.currency,
        'source', 'api',
        'idempotency_key', 'phase1f-migration-price-probe'
      ));
      raise exception 'Phase 1F idempotency conflict probe was accepted.';
    exception when raise_exception then
      if sqlerrm <> 'materials_phase1f:idempotency_conflict' then raise; end if;
    end;

    raise exception 'phase1f_price_probe_rollback';
  exception when raise_exception then
    if sqlerrm = 'phase1f_price_probe_rollback' then
      raise notice 'Phase 1F probe passed: supersession, predecessor, rollback, and idempotency.';
    else
      raise;
    end if;
  end;

  begin
    perform public.add_supplier_product_price_version(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'supplier_product_id', v_product.id,
      'unit_cost', v_current.unit_cost,
      'currency', v_current.currency,
      'effective_from', statement_timestamp() + interval '1 day',
      'source', 'api',
      'idempotency_key', 'phase1f-future-probe'
    ));
    raise exception 'Phase 1F future price probe was accepted.';
  exception when raise_exception then
    if sqlerrm = 'materials_phase1f:future_price_requires_read_cutover' then
      raise notice 'Phase 1F probe passed: future price rejected during legacy-read compatibility.';
    else
      raise;
    end if;
  end;

  begin
    perform public.add_supplier_product_price_version(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'supplier_product_id', v_product.id,
      'unit_cost', v_current.unit_cost,
      'currency', v_current.currency,
      'effective_from', v_current.effective_from - interval '1 second',
      'source', 'api',
      'idempotency_key', 'phase1f-backdated-probe'
    ));
    raise exception 'Phase 1F backdated price probe was accepted.';
  exception when raise_exception then
    if sqlerrm = 'materials_phase1f:unsupported_backdated_price' then
      raise notice 'Phase 1F probe passed: ambiguous backdated price rejected.';
    else
      raise;
    end if;
  end;

  begin
    perform public.create_supplier_product_with_initial_price(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'material_id', v_product.material_id,
      'supplier_id', v_product.supplier_id,
      'supplier_sku', v_probe_sku,
      'supplier_unit', v_probe_unit,
      'currency', 'NZD',
      'source', 'api',
      'idempotency_key', 'phase1f-create-failure-probe'
    ));
    raise exception 'Phase 1F invalid initial price probe was accepted.';
  exception when raise_exception then
    if sqlerrm <> 'materials_phase1f:invalid_price' then raise; end if;
  end;
  if exists (
    select 1 from public.organization_material_supplier_products
    where organization_id = v_org and normalized_supplier_sku = v_probe_sku
  ) then
    raise exception 'Phase 1F failed create left a partial Supplier Product.';
  end if;
  raise notice 'Phase 1F probe passed: failed initial price rolled back the product.';

  begin
    v_result := public.create_supplier_product_with_initial_price(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'material_id', v_product.material_id,
      'supplier_id', v_product.supplier_id,
      'supplier_sku', v_probe_sku,
      'supplier_unit', v_probe_unit,
      'unit_cost', v_current.unit_cost,
      'currency', 'NZD',
      'source', 'api',
      'idempotency_key', 'phase1f-create-success-probe'
    ));
    if not exists (
      select 1
      from public.organization_material_supplier_products product
      join public.organization_material_supplier_product_assignments assignment
        on assignment.organization_id = product.organization_id
       and assignment.supplier_product_id = product.id
      join public.organization_material_supplier_prices price
        on price.organization_id = product.organization_id
       and price.supplier_product_id = product.id
      where product.organization_id = v_org
        and product.normalized_supplier_sku = v_probe_sku
        and price.id = (v_result->>'price_id')::uuid
    ) then
      raise exception 'Phase 1F create product lineage probe failed.';
    end if;
    raise exception 'phase1f_create_probe_rollback';
  exception when raise_exception then
    if sqlerrm = 'phase1f_create_probe_rollback' then
      raise notice 'Phase 1F probe passed: product, assignment, and initial price are atomic.';
    else
      raise;
    end if;
  end;

  begin
    perform public.set_preferred_supplier_product(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'material_id', v_product.material_id,
      'supplier_product_id', v_product.id
    ));
    if (select pg_catalog.count(*) from public.organization_material_supplier_products
        where organization_id = v_org and material_id = v_product.material_id and is_preferred) <> 1
       or (select pg_catalog.count(*) from public.organization_material_supplier_prices
           where organization_id = v_org and material_id = v_product.material_id
             and is_current and is_preferred) <> 1 then
      raise exception 'Phase 1F preferred synchronization probe failed.';
    end if;
    raise exception 'phase1f_preference_probe_rollback';
  exception when raise_exception then
    if sqlerrm = 'phase1f_preference_probe_rollback' then
      raise notice 'Phase 1F probe passed: product and legacy price preference synchronized.';
    else
      raise;
    end if;
  end;

  if v_other_material_id is not null then
    begin
      perform public.remap_supplier_product_material(pg_catalog.jsonb_build_object(
        'organization_id', v_org,
        'supplier_product_id', v_product.id,
        'new_material_id', v_other_material_id,
        'reason', 'Migration probe'
      ));
      raise exception 'Phase 1F priced-product remap probe was accepted.';
    exception when raise_exception then
      if sqlerrm = 'materials_phase1f:remap_price_history_not_supported' then
        raise notice 'Phase 1F probe passed: priced-product remap rejected without rewriting history.';
      else
        raise;
      end if;
    end;
  end if;

  begin
    insert into public.organization_material_import_batches (
      organization_id, supplier_id, uploaded_by, file_name, file_type, status, rows_extracted
    ) values (v_org, v_product.supplier_id, v_actor, 'phase1f-probe.csv', 'text/csv', 'ready_for_review', 1)
    returning id into v_batch_id;
    insert into public.organization_material_import_rows (
      organization_id, import_batch_id, row_index, extracted_name, extracted_unit,
      extracted_unit_cost, extracted_currency, supplier_sku, status
    ) values (
      v_org, v_batch_id, 1, 'Phase 1F probe', v_product.supplier_unit,
      v_current.unit_cost, v_current.currency, v_product.supplier_sku, 'pending_review'
    ) returning id into v_row_id;

    v_result := public.approve_material_import_row(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'import_row_id', v_row_id,
      'material_id', v_product.material_id,
      'supplier_product_id', v_product.id,
      'unit_cost', v_current.unit_cost,
      'currency', v_current.currency,
      'idempotency_key', 'phase1f-import-probe'
    ));
    v_new_price_id := (v_result->>'price_id')::uuid;
    if not exists (
      select 1
      from public.organization_material_import_rows row
      join public.organization_material_supplier_prices price
        on price.organization_id = row.organization_id
       and price.id = row.approved_supplier_price_id
       and price.import_row_id = row.id
       and price.import_batch_id = row.import_batch_id
      where row.id = v_row_id
        and row.status = 'approved'
        and row.approved_supplier_product_id = v_product.id
        and price.id = v_new_price_id
    ) then
      raise exception 'Phase 1F import provenance probe failed.';
    end if;
    v_result := public.approve_material_import_row(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'import_row_id', v_row_id
    ));
    if (v_result->>'price_id')::uuid <> v_new_price_id
       or (v_result->>'idempotent_replay')::boolean is not true then
      raise exception 'Phase 1F import retry probe failed.';
    end if;
    raise exception 'phase1f_import_probe_rollback';
  exception when raise_exception then
    if sqlerrm = 'phase1f_import_probe_rollback' then
      raise notice 'Phase 1F probe passed: import approval, provenance, retry, and rollback.';
    else
      raise;
    end if;
  end;

  begin
    perform pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
    perform public.add_supplier_product_price_version(pg_catalog.jsonb_build_object(
      'organization_id', v_org,
      'supplier_product_id', v_product.id,
      'unit_cost', v_current.unit_cost,
      'currency', v_current.currency,
      'source', 'api',
      'idempotency_key', 'phase1f-permission-probe'
    ));
    raise exception 'Phase 1F permission probe was accepted.';
  exception when raise_exception then
    if sqlerrm = 'materials_phase1f:permission_denied' then
      raise notice 'Phase 1F probe passed: unauthorized caller rejected.';
    else
      raise;
    end if;
  end;
end;
$$;

commit;
