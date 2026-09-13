-- Stage the validated tax snapshot inside the same transaction as import approval.
create or replace function public.approve_material_import_row(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb := p_input->'observation_metadata'->'tax_snapshot';
begin
  perform public.materials_validate_price_tax_idempotency(p_input);
  if v_snapshot is not null then
    update public.organization_material_import_rows
    set source_payload = pg_catalog.jsonb_set(
      coalesce(source_payload, '{}'::jsonb),
      '{approvedTaxSnapshot}', v_snapshot, true
    )
    where organization_id = (p_input->>'organization_id')::uuid
      and id = (p_input->>'import_row_id')::uuid;
  end if;
  return public.approve_material_import_row_without_tax_idempotency(p_input);
end;
$$;
revoke all on function public.approve_material_import_row(jsonb) from public, anon;
grant execute on function public.approve_material_import_row(jsonb) to authenticated;

