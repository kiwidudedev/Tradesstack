-- Generic organization tax policy and immutable Material Supplier Price tax snapshots.

create table public.organization_tax_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jurisdiction_code text not null,
  tax_name text not null,
  registration_status text not null default 'unknown'
    check (registration_status in ('registered', 'unregistered', 'unknown')),
  comparison_basis text not null
    check (comparison_basis in ('exclusive', 'inclusive')),
  standard_rate numeric(12,8) not null check (standard_rate >= 0 and standard_rate < 100),
  supports_inclusive_exclusive boolean not null default false,
  effective_from timestamptz not null,
  effective_to timestamptz null,
  policy_source text not null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id),
  check (effective_to is null or effective_to > effective_from),
  unique (organization_id, effective_from)
);

create index organization_tax_policies_effective_idx
  on public.organization_tax_policies (organization_id, effective_from desc);

alter table public.organization_tax_policies enable row level security;
alter table public.organization_tax_policies force row level security;
create policy "Members can view organization tax policies"
  on public.organization_tax_policies for select to authenticated
  using (public.has_org_permission(organization_id, 'materials.view'));
create policy "Organization settings managers can create tax policies"
  on public.organization_tax_policies for insert to authenticated
  with check (public.has_org_permission(organization_id, 'settings.organization.update'));
create policy "Organization settings managers can close tax policies"
  on public.organization_tax_policies for update to authenticated
  using (public.has_org_permission(organization_id, 'settings.organization.update'))
  with check (public.has_org_permission(organization_id, 'settings.organization.update'));
grant select, insert, update on public.organization_tax_policies to authenticated;
revoke delete on public.organization_tax_policies from authenticated;

create or replace function public.enforce_organization_tax_policy_interval()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.organizations where id = new.organization_id for update;
  if exists (
    select 1 from public.organization_tax_policies policy
    where policy.organization_id = new.organization_id and policy.id <> new.id
      and tstzrange(policy.effective_from, policy.effective_to, '[)')
          && tstzrange(new.effective_from, new.effective_to, '[)')
  ) then raise exception 'organization_tax_policy:effective_interval_overlap' using errcode = '23P01'; end if;
  return new;
end;
$$;
create trigger organization_tax_policies_interval_guard
before insert or update of organization_id, effective_from, effective_to
on public.organization_tax_policies for each row execute function public.enforce_organization_tax_policy_interval();
revoke all on function public.enforce_organization_tax_policy_interval() from public, anon, authenticated;

create or replace function public.reject_organization_tax_policy_fact_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.jurisdiction_code is distinct from old.jurisdiction_code
    or new.tax_name is distinct from old.tax_name
    or new.registration_status is distinct from old.registration_status
    or new.comparison_basis is distinct from old.comparison_basis
    or new.standard_rate is distinct from old.standard_rate
    or new.supports_inclusive_exclusive is distinct from old.supports_inclusive_exclusive
    or new.effective_from is distinct from old.effective_from
    or new.policy_source is distinct from old.policy_source
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or old.effective_to is not null or new.effective_to is null then
    raise exception 'organization_tax_policy:fact_immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger organization_tax_policies_immutable_facts before update
on public.organization_tax_policies for each row execute function public.reject_organization_tax_policy_fact_mutation();
revoke all on function public.reject_organization_tax_policy_fact_mutation() from public, anon, authenticated;

-- Establish only a current cutover policy. This deliberately makes no claim
-- about historical periods before the migration timestamp.
insert into public.organization_tax_policies (
  organization_id, jurisdiction_code, tax_name, registration_status,
  comparison_basis, standard_rate, supports_inclusive_exclusive,
  effective_from, policy_source
)
select
  organization.id,
  upper(coalesce(nullif(to_jsonb(organization)->>'country', ''), 'UNKNOWN')),
  case
    when upper(coalesce(to_jsonb(organization)->>'country', '')) in ('NZ', 'NEW ZEALAND', 'AU', 'AUSTRALIA') then 'GST'
    else 'Tax'
  end,
  case lower(coalesce(to_jsonb(organization)->>'tax_registration_status', ''))
    when 'registered' then 'registered'
    when 'unregistered' then 'unregistered'
    else 'unknown'
  end,
  case when lower(coalesce(to_jsonb(organization)->>'default_tax_mode', '')) like '%incl%' then 'inclusive' else 'exclusive' end,
  coalesce(nullif(to_jsonb(organization)->>'default_tax_rate', ''), '0')::numeric,
  upper(coalesce(to_jsonb(organization)->>'country', '')) in ('NZ', 'NEW ZEALAND', 'AU', 'AUSTRALIA'),
  statement_timestamp(),
  'organization_settings_cutover'
from public.organizations organization
where not exists (
  select 1 from public.organization_tax_policies policy
  where policy.organization_id = organization.id
);

alter table public.organization_material_supplier_prices
  add column source_tax_basis text not null default 'unknown'
    check (source_tax_basis in ('exclusive', 'inclusive', 'zero_rated', 'exempt', 'no_tax', 'unknown')),
  add column source_tax_rate numeric(12,8) null check (source_tax_rate is null or (source_tax_rate >= 0 and source_tax_rate < 100)),
  add column tax_jurisdiction_code text null,
  add column comparison_tax_basis text null check (comparison_tax_basis is null or comparison_tax_basis in ('exclusive', 'inclusive')),
  add column comparison_tax_rate numeric(12,8) null check (comparison_tax_rate is null or (comparison_tax_rate >= 0 and comparison_tax_rate < 100)),
  add column tax_policy_snapshot jsonb not null default '{}'::jsonb,
  add column tax_evidence jsonb not null default '{}'::jsonb;

create or replace function public.stamp_material_supplier_price_tax_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_snapshot jsonb := new.observation_metadata->'tax_snapshot';
begin
  if v_snapshot is null and new.import_row_id is not null then
    select source_payload->'approvedTaxSnapshot' into v_snapshot
    from public.organization_material_import_rows
    where organization_id = new.organization_id and id = new.import_row_id;
  end if;
  if v_snapshot is null then return new; end if;
  new.source_tax_basis := coalesce(v_snapshot->>'sourceTaxBasis', 'unknown');
  new.source_tax_rate := nullif(v_snapshot->>'sourceTaxRate', '')::numeric;
  new.tax_jurisdiction_code := nullif(v_snapshot->>'taxJurisdictionCode', '');
  new.comparison_tax_basis := nullif(v_snapshot->>'comparisonTaxBasis', '');
  new.comparison_tax_rate := nullif(v_snapshot->>'comparisonTaxRate', '')::numeric;
  new.tax_policy_snapshot := coalesce(v_snapshot->'taxPolicySnapshot', '{}'::jsonb);
  new.tax_evidence := coalesce(v_snapshot->'taxEvidence', '{}'::jsonb);
  return new;
end;
$$;
create trigger organization_material_supplier_prices_tax_snapshot
before insert on public.organization_material_supplier_prices
for each row execute function public.stamp_material_supplier_price_tax_snapshot();
revoke all on function public.stamp_material_supplier_price_tax_snapshot() from public, anon, authenticated;

create or replace function public.reject_material_supplier_price_fact_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.material_id is distinct from old.material_id
    or new.supplier_id is distinct from old.supplier_id
    or new.supplier_product_id is distinct from old.supplier_product_id
    or new.import_batch_id is distinct from old.import_batch_id
    or new.import_row_id is distinct from old.import_row_id
    or new.supersedes_price_id is distinct from old.supersedes_price_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.supplier_sku is distinct from old.supplier_sku
    or new.supplier_description is distinct from old.supplier_description
    or new.unit is distinct from old.unit or new.unit_cost is distinct from old.unit_cost
    or new.currency is distinct from old.currency or new.source is distinct from old.source
    or new.effective_from is distinct from old.effective_from
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
    or new.observation_metadata is distinct from old.observation_metadata
    or new.source_tax_basis is distinct from old.source_tax_basis
    or new.source_tax_rate is distinct from old.source_tax_rate
    or new.tax_jurisdiction_code is distinct from old.tax_jurisdiction_code
    or new.comparison_tax_basis is distinct from old.comparison_tax_basis
    or new.comparison_tax_rate is distinct from old.comparison_tax_rate
    or new.tax_policy_snapshot is distinct from old.tax_policy_snapshot
    or new.tax_evidence is distinct from old.tax_evidence then
    raise exception 'materials_phase1i:price_fact_immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.reject_material_supplier_price_fact_mutation() from public, anon, authenticated;
