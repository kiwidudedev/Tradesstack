begin;

-- Historical data is fully attached, but supplier_product_id remains nullable
-- until the current direct writers create/resolve Supplier Products atomically.

alter table public.organization_material_supplier_prices
  add constraint organization_material_supplier_prices_product_chain_key
  unique (organization_id, supplier_product_id, id);

alter table public.organization_material_supplier_prices
  add constraint material_prices_org_material_fkey
    foreign key (organization_id, material_id)
    references public.organization_materials (organization_id, id)
    not valid,
  add constraint material_prices_org_supplier_fkey
    foreign key (organization_id, supplier_id)
    references public.organization_suppliers (organization_id, id)
    not valid,
  add constraint material_prices_org_batch_fkey
    foreign key (organization_id, import_batch_id)
    references public.organization_material_import_batches (organization_id, id)
    not valid,
  add constraint material_prices_same_product_predecessor_fkey
    foreign key (organization_id, supplier_product_id, supersedes_price_id)
    references public.organization_material_supplier_prices (
      organization_id,
      supplier_product_id,
      id
    )
    not valid;

alter table public.organization_material_import_batches
  add constraint material_import_batches_org_supplier_fkey
    foreign key (organization_id, supplier_id)
    references public.organization_suppliers (organization_id, id)
    not valid;

alter table public.organization_material_import_rows
  add constraint material_import_rows_org_batch_fkey
    foreign key (organization_id, import_batch_id)
    references public.organization_material_import_batches (organization_id, id)
    not valid,
  add constraint material_import_rows_org_material_fkey
    foreign key (organization_id, matched_material_id)
    references public.organization_materials (organization_id, id)
    not valid;

alter table public.organization_material_supplier_prices
  validate constraint material_prices_org_material_fkey;
alter table public.organization_material_supplier_prices
  validate constraint material_prices_org_supplier_fkey;
alter table public.organization_material_supplier_prices
  validate constraint material_prices_org_batch_fkey;
alter table public.organization_material_supplier_prices
  validate constraint material_prices_same_product_predecessor_fkey;
alter table public.organization_material_import_batches
  validate constraint material_import_batches_org_supplier_fkey;
alter table public.organization_material_import_rows
  validate constraint material_import_rows_org_batch_fkey;
alter table public.organization_material_import_rows
  validate constraint material_import_rows_org_material_fkey;

-- Controlled negative probes run only where representative data exists. Every
-- attempted mutation is isolated in a PL/pgSQL subtransaction and rolls back
-- on the expected constraint error. An unexpectedly accepted mutation aborts
-- and rolls back the entire migration.
do $$
declare
  base_price public.organization_material_supplier_prices%rowtype;
  base_product public.organization_material_supplier_products%rowtype;
  other_org_product public.organization_material_supplier_products%rowtype;
  same_org_other_price public.organization_material_supplier_prices%rowtype;
  other_org_price public.organization_material_supplier_prices%rowtype;
  preferred_product public.organization_material_supplier_products%rowtype;
  same_material_other_product public.organization_material_supplier_products%rowtype;
  other_org_material_id uuid;
  same_org_material_id uuid;
  other_org_supplier_id uuid;
  same_org_supplier_id uuid;
  probe_batch_id uuid;
  other_org_batch_id uuid;
  probe_row_id uuid;
begin
  select * into base_price
  from public.organization_material_supplier_prices
  where supplier_product_id is not null
  order by id
  limit 1;

  if base_price.id is null then
    raise notice 'Phase 1E negative probes skipped: no attached price fixture.';
    return;
  end if;

  select * into base_product
  from public.organization_material_supplier_products
  where id = base_price.supplier_product_id;

  select * into other_org_product
  from public.organization_material_supplier_products
  where organization_id <> base_price.organization_id
  order by id
  limit 1;

  select id into other_org_material_id
  from public.organization_materials
  where organization_id <> base_price.organization_id
  order by id
  limit 1;

  select id into same_org_material_id
  from public.organization_materials
  where organization_id = base_price.organization_id
    and id <> base_price.material_id
  order by id
  limit 1;

  select id into other_org_supplier_id
  from public.organization_suppliers
  where organization_id <> base_price.organization_id
  order by id
  limit 1;

  select id into same_org_supplier_id
  from public.organization_suppliers
  where organization_id = base_price.organization_id
    and id <> base_price.supplier_id
  order by id
  limit 1;

  select * into same_org_other_price
  from public.organization_material_supplier_prices
  where organization_id = base_price.organization_id
    and supplier_product_id <> base_price.supplier_product_id
  order by id
  limit 1;

  select * into other_org_price
  from public.organization_material_supplier_prices
  where organization_id <> base_price.organization_id
  order by id
  limit 1;

  select * into preferred_product
  from public.organization_material_supplier_products product
  where product.is_preferred = true
    and exists (
      select 1
      from public.organization_material_supplier_products sibling
      where sibling.organization_id = product.organization_id
        and sibling.material_id = product.material_id
        and sibling.id <> product.id
    )
  order by product.id
  limit 1;

  if preferred_product.id is not null then
    select * into same_material_other_product
    from public.organization_material_supplier_products
    where organization_id = preferred_product.organization_id
      and material_id = preferred_product.material_id
      and id <> preferred_product.id
    order by id
    limit 1;
  end if;

  if other_org_material_id is not null then
    begin
      update public.organization_material_supplier_products
      set material_id = other_org_material_id
      where id = base_product.id;
      raise exception 'Negative probe failed: cross-organization product/material update was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-organization product/material rejected.';
    end;
  end if;

  if other_org_supplier_id is not null then
    begin
      update public.organization_material_supplier_products
      set supplier_id = other_org_supplier_id
      where id = base_product.id;
      raise exception 'Negative probe failed: cross-organization product/supplier update was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-organization product/supplier rejected.';
    end;
  end if;

  if other_org_product.id is not null then
    begin
      update public.organization_material_supplier_prices
      set supplier_product_id = other_org_product.id
      where id = base_price.id;
      raise exception 'Negative probe failed: cross-organization price/product update was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-organization price/product rejected.';
    end;
  end if;

  if same_org_material_id is not null then
      begin
        update public.organization_material_supplier_prices
        set material_id = same_org_material_id,
            is_current = false,
            is_preferred = false
        where id = base_price.id;
      raise exception 'Negative probe failed: price/product material mismatch was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: price/product material mismatch rejected.';
    end;
  end if;

  if same_org_supplier_id is not null then
      begin
        update public.organization_material_supplier_prices
        set supplier_id = same_org_supplier_id,
            is_current = false,
            is_preferred = false
        where id = base_price.id;
      raise exception 'Negative probe failed: price/product supplier mismatch was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: price/product supplier mismatch rejected.';
    end;
  end if;

  if same_org_other_price.id is not null then
    begin
      update public.organization_material_supplier_prices
      set supersedes_price_id = same_org_other_price.id
      where id = base_price.id;
      raise exception 'Negative probe failed: cross-product predecessor was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-product predecessor rejected.';
    end;
  end if;

  if other_org_price.id is not null then
    begin
      update public.organization_material_supplier_prices
      set supersedes_price_id = other_org_price.id
      where id = base_price.id;
      raise exception 'Negative probe failed: cross-organization predecessor was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-organization predecessor rejected.';
    end;
  end if;

  begin
    update public.organization_material_supplier_prices
    set supersedes_price_id = id
    where id = base_price.id;
    raise exception 'Negative probe failed: self-referencing predecessor was accepted.';
  exception when check_violation then
    raise notice 'Negative probe passed: self-referencing predecessor rejected.';
  end;

  if same_material_other_product.id is not null then
    begin
      update public.organization_material_supplier_products
      set is_preferred = true
      where id = same_material_other_product.id;
      raise exception 'Negative probe failed: duplicate preferred product was accepted.';
    exception when unique_violation then
      raise notice 'Negative probe passed: duplicate preferred product rejected.';
    end;
  end if;

  if other_org_material_id is not null then
    begin
      insert into public.organization_material_supplier_product_assignments (
        organization_id,
        supplier_product_id,
        previous_material_id,
        new_material_id,
        reason,
        metadata
      ) values (
        base_product.organization_id,
        base_product.id,
        null,
        other_org_material_id,
        'Phase 1E negative tenant-integrity probe',
        '{"probe":true}'::jsonb
      );
      raise exception 'Negative probe failed: cross-tenant assignment material was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-tenant assignment material rejected.';
    end;
  end if;

  if other_org_product.id is not null and other_org_price.id is not null then
    probe_batch_id := gen_random_uuid();
    other_org_batch_id := gen_random_uuid();
    probe_row_id := gen_random_uuid();

    insert into public.organization_material_import_batches (
      id, organization_id, file_name, file_type, status
    ) values (
      probe_batch_id, base_price.organization_id, 'phase-1e-probe.csv', 'text/csv', 'uploaded'
    );
    insert into public.organization_material_import_batches (
      id, organization_id, file_name, file_type, status
    ) values (
      other_org_batch_id, other_org_product.organization_id, 'phase-1e-other-probe.csv', 'text/csv', 'uploaded'
    );
    insert into public.organization_material_import_rows (
      id, organization_id, import_batch_id, row_index
    ) values (
      probe_row_id, base_price.organization_id, probe_batch_id, 0
    );

    if other_org_supplier_id is not null then
      begin
        update public.organization_material_import_batches
        set supplier_id = other_org_supplier_id
        where id = probe_batch_id;
        raise exception 'Negative probe failed: cross-tenant import batch/supplier was accepted.';
      exception when foreign_key_violation then
        raise notice 'Negative probe passed: cross-tenant import batch/supplier rejected.';
      end;
    end if;

    begin
      update public.organization_material_import_rows
      set approved_supplier_product_id = other_org_product.id
      where id = probe_row_id;
      raise exception 'Negative probe failed: cross-tenant approved product was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-tenant approved product rejected.';
    end;

    begin
      update public.organization_material_import_rows
      set approved_supplier_price_id = other_org_price.id
      where id = probe_row_id;
      raise exception 'Negative probe failed: cross-tenant approved price was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-tenant approved price rejected.';
    end;

    begin
      update public.organization_material_supplier_prices
      set import_batch_id = other_org_batch_id
      where id = base_price.id;
      raise exception 'Negative probe failed: cross-tenant price/import batch was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-tenant price/import batch rejected.';
    end;

    begin
      insert into public.organization_material_import_rows (
        organization_id, import_batch_id, row_index
      ) values (
        base_price.organization_id, other_org_batch_id, 1
      );
      raise exception 'Negative probe failed: cross-tenant import row/batch was accepted.';
    exception when foreign_key_violation then
      raise notice 'Negative probe passed: cross-tenant import row/batch rejected.';
    end;

    delete from public.organization_material_import_batches
    where id in (probe_batch_id, other_org_batch_id);
  end if;
end;
$$;

commit;
