begin;

create table public.organization_material_supplier_product_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_product_id uuid not null,
  event_type text not null,
  reason text not null,
  previous_is_active boolean not null,
  previous_is_preferred boolean not null,
  actor_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default statement_timestamp(),
  metadata jsonb not null default '{}'::jsonb,
  constraint organization_material_supplier_product_lifecycle_events_product_fkey
    foreign key (organization_id, supplier_product_id)
    references public.organization_material_supplier_products (organization_id, id),
  constraint organization_material_supplier_product_lifecycle_events_type_check
    check (event_type in ('archived', 'restored')),
  constraint organization_material_supplier_product_lifecycle_events_reason_check
    check (char_length(btrim(reason)) > 0)
);

create index organization_material_supplier_product_lifecycle_events_product_created_idx
  on public.organization_material_supplier_product_lifecycle_events (
    organization_id,
    supplier_product_id,
    created_at desc
  );

create or replace function public.reject_material_supplier_product_lifecycle_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Supplier Product lifecycle history is append-only.' using errcode = '55000';
end;
$$;

create trigger organization_material_supplier_product_lifecycle_events_append_only
before update or delete on public.organization_material_supplier_product_lifecycle_events
for each row execute function public.reject_material_supplier_product_lifecycle_event_mutation();

alter table public.organization_material_supplier_product_lifecycle_events enable row level security;
alter table public.organization_material_supplier_product_lifecycle_events force row level security;

create policy "Members can view material supplier product lifecycle events"
on public.organization_material_supplier_product_lifecycle_events
for select to authenticated
using (public.has_org_permission(organization_id, 'materials.view'));

revoke all on public.organization_material_supplier_product_lifecycle_events from public, anon, authenticated;
grant select on public.organization_material_supplier_product_lifecycle_events to authenticated;
revoke all on function public.reject_material_supplier_product_lifecycle_event_mutation() from public, anon, authenticated;

create or replace function public.archive_material_supplier_product(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_material_id uuid := (p_input->>'material_id')::uuid;
  v_product_id uuid := (p_input->>'supplier_product_id')::uuid;
  v_reason text := nullif(pg_catalog.btrim(p_input->>'reason'), '');
  v_actor uuid;
  v_product public.organization_material_supplier_products%rowtype;
  v_archived_at timestamptz := statement_timestamp();
begin
  v_actor := public.materials_phase1f_require_writer(v_org);
  if v_reason is null then
    perform public.materials_phase1f_error('supplier_product_archive_reason_required');
  end if;

  perform 1
  from public.organization_materials
  where organization_id = v_org and id = v_material_id
  for update;
  if not found then
    perform public.materials_phase1f_error('material_not_found');
  end if;

  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = v_org and id = v_product_id
  for update;
  if not found or v_product.material_id <> v_material_id then
    perform public.materials_phase1f_error('supplier_product_not_found');
  end if;

  if not v_product.is_active or v_product.archived_at is not null then
    return pg_catalog.jsonb_build_object(
      'supplier_product_id', v_product.id,
      'material_id', v_product.material_id,
      'is_active', v_product.is_active,
      'is_preferred', v_product.is_preferred,
      'archived_at', v_product.archived_at,
      'idempotent_replay', true
    );
  end if;

  update public.organization_material_supplier_prices
  set is_preferred = false
  where organization_id = v_org
    and supplier_product_id = v_product.id
    and is_current = true
    and is_preferred = true;

  update public.organization_material_supplier_products
  set is_active = false,
      is_preferred = false,
      archived_at = v_archived_at,
      archived_by = v_actor,
      updated_by = v_actor
  where organization_id = v_org and id = v_product.id;

  insert into public.organization_material_supplier_product_lifecycle_events (
    organization_id,
    supplier_product_id,
    event_type,
    reason,
    previous_is_active,
    previous_is_preferred,
    actor_user_id,
    metadata
  ) values (
    v_org,
    v_product.id,
    'archived',
    v_reason,
    v_product.is_active,
    v_product.is_preferred,
    v_actor,
    coalesce(p_input->'metadata', '{}'::jsonb)
  );

  return pg_catalog.jsonb_build_object(
    'supplier_product_id', v_product.id,
    'material_id', v_product.material_id,
    'is_active', false,
    'is_preferred', false,
    'archived_at', v_archived_at,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.restore_material_supplier_product(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_material_id uuid := (p_input->>'material_id')::uuid;
  v_product_id uuid := (p_input->>'supplier_product_id')::uuid;
  v_reason text := coalesce(nullif(pg_catalog.btrim(p_input->>'reason'), ''), 'Restored supplier item.');
  v_actor uuid;
  v_product public.organization_material_supplier_products%rowtype;
begin
  v_actor := public.materials_phase1f_require_writer(v_org);

  perform 1
  from public.organization_materials
  where organization_id = v_org and id = v_material_id
  for update;
  if not found then
    perform public.materials_phase1f_error('material_not_found');
  end if;

  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = v_org and id = v_product_id
  for update;
  if not found or v_product.material_id <> v_material_id then
    perform public.materials_phase1f_error('supplier_product_not_found');
  end if;

  if v_product.is_active and v_product.archived_at is null then
    return pg_catalog.jsonb_build_object(
      'supplier_product_id', v_product.id,
      'material_id', v_product.material_id,
      'is_active', true,
      'is_preferred', v_product.is_preferred,
      'archived_at', null,
      'idempotent_replay', true
    );
  end if;

  if v_product.identity_status = 'confirmed' and exists (
    select 1
    from public.organization_material_supplier_products candidate
    where candidate.organization_id = v_org
      and candidate.material_id = v_product.material_id
      and candidate.supplier_id = v_product.supplier_id
      and candidate.normalized_supplier_unit = v_product.normalized_supplier_unit
      and candidate.identity_variant = v_product.identity_variant
      and candidate.identity_status = 'confirmed'
      and candidate.archived_at is null
      and candidate.id <> v_product.id
      and (
        (
          v_product.normalized_supplier_sku is not null
          and candidate.normalized_supplier_sku = v_product.normalized_supplier_sku
        )
        or (
          v_product.normalized_supplier_sku is null
          and candidate.normalized_supplier_sku is null
          and candidate.normalized_supplier_description = v_product.normalized_supplier_description
        )
      )
  ) then
    perform public.materials_phase1f_error('supplier_product_restore_identity_conflict');
  end if;

  begin
    update public.organization_material_supplier_products
    set is_active = true,
        is_preferred = false,
        archived_at = null,
        archived_by = null,
        updated_by = v_actor
    where organization_id = v_org and id = v_product.id;
  exception when unique_violation then
    perform public.materials_phase1f_error('supplier_product_restore_identity_conflict');
  end;

  insert into public.organization_material_supplier_product_lifecycle_events (
    organization_id,
    supplier_product_id,
    event_type,
    reason,
    previous_is_active,
    previous_is_preferred,
    actor_user_id,
    metadata
  ) values (
    v_org,
    v_product.id,
    'restored',
    v_reason,
    v_product.is_active,
    v_product.is_preferred,
    v_actor,
    coalesce(p_input->'metadata', '{}'::jsonb)
  );

  return pg_catalog.jsonb_build_object(
    'supplier_product_id', v_product.id,
    'material_id', v_product.material_id,
    'is_active', true,
    'is_preferred', false,
    'archived_at', null,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.archive_material_supplier_product(jsonb) from public, anon;
revoke all on function public.restore_material_supplier_product(jsonb) from public, anon;
grant execute on function public.archive_material_supplier_product(jsonb) to authenticated;
grant execute on function public.restore_material_supplier_product(jsonb) to authenticated;

comment on table public.organization_material_supplier_product_lifecycle_events is
  'Append-only audit history for Supplier Product archive and restore transitions.';
comment on function public.archive_material_supplier_product(jsonb) is
  'Soft-archives a Supplier Product while preserving immutable price, conversion, assignment, and import history.';
comment on function public.restore_material_supplier_product(jsonb) is
  'Restores an archived Supplier Product as nonpreferred after checking active identity conflicts.';

commit;
