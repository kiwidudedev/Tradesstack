-- Make tax snapshot facts part of all public Supplier Price idempotency boundaries.

create function public.materials_validate_price_tax_idempotency(p_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb := p_input->'observation_metadata'->'tax_snapshot';
  v_existing public.organization_material_supplier_prices%rowtype;
begin
  if v_snapshot is null then return; end if;
  select * into v_existing
  from public.organization_material_supplier_prices price
  where price.organization_id = (p_input->>'organization_id')::uuid
    and (
      (p_input ? 'import_row_id' and price.import_row_id = (p_input->>'import_row_id')::uuid)
      or (not (p_input ? 'import_row_id') and price.idempotency_key = p_input->>'idempotency_key')
    )
    and (not (p_input ? 'supplier_product_id') or price.supplier_product_id = (p_input->>'supplier_product_id')::uuid)
  order by price.created_at desc limit 1;
  if v_existing.id is null then return; end if;
  if v_existing.source_tax_basis is distinct from coalesce(v_snapshot->>'sourceTaxBasis', 'unknown')
    or v_existing.source_tax_rate is distinct from nullif(v_snapshot->>'sourceTaxRate', '')::numeric
    or v_existing.tax_jurisdiction_code is distinct from nullif(v_snapshot->>'taxJurisdictionCode', '')
    or v_existing.comparison_tax_basis is distinct from nullif(v_snapshot->>'comparisonTaxBasis', '')
    or v_existing.comparison_tax_rate is distinct from nullif(v_snapshot->>'comparisonTaxRate', '')::numeric
    or v_existing.tax_policy_snapshot is distinct from coalesce(v_snapshot->'taxPolicySnapshot', '{}'::jsonb)
    or v_existing.tax_evidence is distinct from coalesce(v_snapshot->'taxEvidence', '{}'::jsonb) then
    perform public.materials_phase1f_error('idempotency_conflict');
  end if;
end;
$$;
revoke all on function public.materials_validate_price_tax_idempotency(jsonb) from public, anon, authenticated;

alter function public.add_supplier_product_price_version(jsonb)
  rename to add_supplier_product_price_version_without_tax_idempotency;
create function public.add_supplier_product_price_version(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.materials_validate_price_tax_idempotency(p_input);
  return public.add_supplier_product_price_version_without_tax_idempotency(p_input);
end;
$$;
revoke all on function public.add_supplier_product_price_version_without_tax_idempotency(jsonb) from public, anon, authenticated;
revoke all on function public.add_supplier_product_price_version(jsonb) from public, anon;
grant execute on function public.add_supplier_product_price_version(jsonb) to authenticated;

alter function public.create_supplier_product_with_initial_price(jsonb)
  rename to create_supplier_product_with_initial_price_without_tax_idempotency;
create function public.create_supplier_product_with_initial_price(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.materials_validate_price_tax_idempotency(p_input);
  return public.create_supplier_product_with_initial_price_without_tax_idempotency(p_input);
end;
$$;
revoke all on function public.create_supplier_product_with_initial_price_without_tax_idempotency(jsonb) from public, anon, authenticated;
revoke all on function public.create_supplier_product_with_initial_price(jsonb) from public, anon;
grant execute on function public.create_supplier_product_with_initial_price(jsonb) to authenticated;

alter function public.approve_material_import_row(jsonb)
  rename to approve_material_import_row_without_tax_idempotency;
create function public.approve_material_import_row(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.materials_validate_price_tax_idempotency(p_input);
  return public.approve_material_import_row_without_tax_idempotency(p_input);
end;
$$;
revoke all on function public.approve_material_import_row_without_tax_idempotency(jsonb) from public, anon, authenticated;
revoke all on function public.approve_material_import_row(jsonb) from public, anon;
grant execute on function public.approve_material_import_row(jsonb) to authenticated;

