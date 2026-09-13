begin;

create table public.organization_material_supplier_product_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_product_id uuid not null,
  supplier_unit text not null,
  normalized_supplier_unit text generated always as (
    lower(regexp_replace(btrim(supplier_unit), '\s+', ' ', 'g'))
  ) stored,
  material_unit text not null,
  normalized_material_unit text generated always as (
    lower(regexp_replace(btrim(material_unit), '\s+', ' ', 'g'))
  ) stored,
  supplier_quantity numeric(18, 6) not null,
  material_quantity numeric(18, 6) not null,
  source text not null,
  contract_version text not null,
  proposal_metadata jsonb not null default '{}'::jsonb,
  source_import_row_id uuid null,
  confirmed_by uuid not null references auth.users (id),
  confirmed_at timestamptz not null default statement_timestamp(),
  effective_from timestamptz not null default statement_timestamp(),
  effective_to timestamptz null,
  supersedes_conversion_id uuid null,
  created_at timestamptz not null default statement_timestamp(),
  constraint organization_material_supplier_product_unit_conversions_org_id_key
    unique (organization_id, id),
  constraint organization_material_supplier_product_unit_conversions_product_fkey
    foreign key (organization_id, supplier_product_id)
    references public.organization_material_supplier_products (organization_id, id),
  constraint organization_material_supplier_product_unit_conversions_import_row_fkey
    foreign key (organization_id, source_import_row_id)
    references public.organization_material_import_rows (organization_id, id),
  constraint organization_material_supplier_product_unit_conversions_supersedes_fkey
    foreign key (organization_id, supersedes_conversion_id)
    references public.organization_material_supplier_product_unit_conversions (organization_id, id),
  constraint organization_material_supplier_product_unit_conversions_supplier_unit_check
    check (char_length(btrim(supplier_unit)) > 0),
  constraint organization_material_supplier_product_unit_conversions_material_unit_check
    check (char_length(btrim(material_unit)) > 0),
  constraint organization_material_supplier_product_unit_conversions_quantities_check
    check (supplier_quantity > 0 and material_quantity > 0),
  constraint organization_material_supplier_product_unit_conversions_source_check
    check (source in ('user_confirmed_ai', 'user_confirmed_manual')),
  constraint organization_material_supplier_product_unit_conversions_contract_check
    check (char_length(btrim(contract_version)) > 0),
  constraint organization_material_supplier_product_unit_conversions_window_check
    check (effective_to is null or effective_to > effective_from)
);

create index organization_material_supplier_product_unit_conversions_lookup_idx
  on public.organization_material_supplier_product_unit_conversions (
    organization_id, supplier_product_id, normalized_material_unit, effective_from desc
  );

create unique index organization_material_supplier_product_unit_conversions_current_key
  on public.organization_material_supplier_product_unit_conversions (
    organization_id, supplier_product_id, normalized_supplier_unit, normalized_material_unit
  ) where effective_to is null;

alter table public.organization_material_import_rows
  add column approved_unit_conversion_id uuid null;

alter table public.organization_material_import_rows
  add constraint organization_material_import_rows_approved_unit_conversion_fkey
  foreign key (organization_id, approved_unit_conversion_id)
  references public.organization_material_supplier_product_unit_conversions (organization_id, id);

create index organization_material_import_rows_approved_unit_conversion_idx
  on public.organization_material_import_rows (organization_id, approved_unit_conversion_id)
  where approved_unit_conversion_id is not null;

create or replace function public.enforce_material_supplier_product_unit_conversion_interval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.organization_material_supplier_products
  where organization_id = new.organization_id and id = new.supplier_product_id
  for update;
  if not found then
    raise exception 'materials_unit_conversion:supplier_product_not_found' using errcode = '23503';
  end if;
  if exists (
    select 1
    from public.organization_material_supplier_product_unit_conversions conversion
    where conversion.organization_id = new.organization_id
      and conversion.supplier_product_id = new.supplier_product_id
      and conversion.normalized_supplier_unit = lower(regexp_replace(btrim(new.supplier_unit), '\s+', ' ', 'g'))
      and conversion.normalized_material_unit = lower(regexp_replace(btrim(new.material_unit), '\s+', ' ', 'g'))
      and conversion.id <> new.id
      and tstzrange(conversion.effective_from, conversion.effective_to, '[)')
          && tstzrange(new.effective_from, new.effective_to, '[)')
  ) then
    raise exception 'materials_unit_conversion:effective_interval_overlap' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger organization_material_supplier_product_unit_conversions_interval_guard
before insert or update of organization_id, supplier_product_id, supplier_unit, material_unit, effective_from, effective_to
on public.organization_material_supplier_product_unit_conversions
for each row execute function public.enforce_material_supplier_product_unit_conversion_interval();

create or replace function public.reject_material_supplier_product_unit_conversion_fact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.supplier_product_id is distinct from old.supplier_product_id
    or new.supplier_unit is distinct from old.supplier_unit
    or new.material_unit is distinct from old.material_unit
    or new.supplier_quantity is distinct from old.supplier_quantity
    or new.material_quantity is distinct from old.material_quantity
    or new.source is distinct from old.source
    or new.contract_version is distinct from old.contract_version
    or new.proposal_metadata is distinct from old.proposal_metadata
    or new.source_import_row_id is distinct from old.source_import_row_id
    or new.confirmed_by is distinct from old.confirmed_by
    or new.confirmed_at is distinct from old.confirmed_at
    or new.effective_from is distinct from old.effective_from
    or new.supersedes_conversion_id is distinct from old.supersedes_conversion_id
    or new.created_at is distinct from old.created_at then
    raise exception 'materials_unit_conversion:fact_immutable' using errcode = '55000';
  end if;
  if old.effective_to is not null or new.effective_to is null then
    raise exception 'materials_unit_conversion:only_open_interval_may_be_closed' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger organization_material_supplier_product_unit_conversions_immutable_facts
before update on public.organization_material_supplier_product_unit_conversions
for each row execute function public.reject_material_supplier_product_unit_conversion_fact_mutation();

alter table public.organization_material_supplier_product_unit_conversions enable row level security;
alter table public.organization_material_supplier_product_unit_conversions force row level security;

create policy "Members can view material supplier product unit conversions"
on public.organization_material_supplier_product_unit_conversions
for select to authenticated
using (public.has_org_permission(organization_id, 'materials.view'));

grant select on public.organization_material_supplier_product_unit_conversions to authenticated;
revoke insert, update, delete on public.organization_material_supplier_product_unit_conversions from authenticated;
revoke all on function public.enforce_material_supplier_product_unit_conversion_interval() from public, anon, authenticated;
revoke all on function public.reject_material_supplier_product_unit_conversion_fact_mutation() from public, anon, authenticated;

alter function public.approve_material_import_row(jsonb)
  rename to approve_material_import_row_without_unit_conversion;
revoke all on function public.approve_material_import_row_without_unit_conversion(jsonb) from public, anon, authenticated;

create function public.approve_material_import_row(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_actor uuid;
  v_result jsonb;
  v_row public.organization_material_import_rows%rowtype;
  v_material public.organization_materials%rowtype;
  v_product public.organization_material_supplier_products%rowtype;
  v_price public.organization_material_supplier_prices%rowtype;
  v_conversion_input jsonb := p_input->'unit_conversion';
  v_current public.organization_material_supplier_product_unit_conversions%rowtype;
  v_conversion public.organization_material_supplier_product_unit_conversions%rowtype;
  v_supplier_quantity numeric;
  v_material_quantity numeric;
  v_expected_cost numeric;
  v_effective_from timestamptz := statement_timestamp();
begin
  v_actor := public.materials_phase1f_require_writer(v_org);
  v_result := public.approve_material_import_row_without_unit_conversion(p_input);

  select * into v_row
  from public.organization_material_import_rows
  where organization_id = v_org and id = (p_input->>'import_row_id')::uuid
  for update;

  if v_conversion_input is null then
    return v_result || pg_catalog.jsonb_build_object('unit_conversion_id', v_row.approved_unit_conversion_id);
  end if;
  if (v_result->>'idempotent_replay')::boolean and v_row.approved_unit_conversion_id is null then
    perform public.materials_phase1f_error('idempotency_conflict');
  end if;
  if v_row.approved_unit_conversion_id is not null then
    return v_result || pg_catalog.jsonb_build_object(
      'unit_conversion_id', v_row.approved_unit_conversion_id,
      'reused_conversion', true
    );
  end if;

  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = v_org and id = (v_result->>'supplier_product_id')::uuid
  for update;
  select * into v_material
  from public.organization_materials
  where organization_id = v_org and id = (v_result->>'material_id')::uuid;
  select * into v_price
  from public.organization_material_supplier_prices
  where organization_id = v_org and id = (v_result->>'price_id')::uuid;

  v_supplier_quantity := (v_conversion_input->>'supplier_quantity')::numeric;
  v_material_quantity := (v_conversion_input->>'material_quantity')::numeric;
  if v_supplier_quantity is null or v_supplier_quantity <= 0
    or v_material_quantity is null or v_material_quantity <= 0 then
    perform public.materials_phase1f_error('invalid_unit_conversion');
  end if;
  if lower(regexp_replace(btrim(v_conversion_input->>'supplier_unit'), '\s+', ' ', 'g'))
      <> v_product.normalized_supplier_unit
    or lower(regexp_replace(btrim(v_conversion_input->>'material_unit'), '\s+', ' ', 'g'))
      <> lower(regexp_replace(btrim(v_material.default_unit), '\s+', ' ', 'g')) then
    perform public.materials_phase1f_error('invalid_unit_conversion');
  end if;
  v_expected_cost := v_price.unit_cost * v_supplier_quantity / v_material_quantity;
  if abs(v_expected_cost - (v_conversion_input->>'converted_unit_cost')::numeric)
      > greatest(0.000001, abs(v_expected_cost) * 0.0001) then
    perform public.materials_phase1f_error('invalid_unit_conversion');
  end if;

  select * into v_current
  from public.organization_material_supplier_product_unit_conversions
  where organization_id = v_org
    and supplier_product_id = v_product.id
    and normalized_supplier_unit = v_product.normalized_supplier_unit
    and normalized_material_unit = lower(regexp_replace(btrim(v_material.default_unit), '\s+', ' ', 'g'))
    and effective_to is null
  for update;

  if v_current.id is not null
    and v_current.supplier_quantity = v_supplier_quantity
    and v_current.material_quantity = v_material_quantity then
    v_conversion := v_current;
  else
    if v_current.id is not null then
      update public.organization_material_supplier_product_unit_conversions
      set effective_to = v_effective_from
      where organization_id = v_org and id = v_current.id;
    end if;
    insert into public.organization_material_supplier_product_unit_conversions (
      organization_id, supplier_product_id, supplier_unit, material_unit,
      supplier_quantity, material_quantity, source, contract_version,
      proposal_metadata, source_import_row_id, confirmed_by, confirmed_at,
      effective_from, supersedes_conversion_id
    ) values (
      v_org, v_product.id, v_product.supplier_unit, v_material.default_unit,
      v_supplier_quantity, v_material_quantity,
      coalesce(v_conversion_input->>'source', 'user_confirmed_ai'),
      coalesce(v_conversion_input->>'contract_version', 'material_unit_conversion_v1'),
      coalesce(v_conversion_input->'proposal_metadata', '{}'::jsonb),
      v_row.id, v_actor, v_effective_from, v_effective_from, v_current.id
    ) returning * into v_conversion;
  end if;

  update public.organization_material_import_rows
  set approved_unit_conversion_id = v_conversion.id
  where organization_id = v_org and id = v_row.id;

  return v_result || pg_catalog.jsonb_build_object(
    'unit_conversion_id', v_conversion.id,
    'reused_conversion', v_conversion.id = v_current.id
  );
end;
$$;

revoke all on function public.approve_material_import_row(jsonb) from public, anon;
grant execute on function public.approve_material_import_row(jsonb) to authenticated;

comment on table public.organization_material_supplier_product_unit_conversions is
  'Versioned, user-confirmed supplier-product-specific unit relationships. Source Supplier Prices remain immutable.';

commit;
