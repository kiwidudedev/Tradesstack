begin;

-- Supplier Prices remain valid source observations when tax evidence is
-- incomplete, but every new incomplete observation must be deliberate.
create or replace function public.materials_validate_price_tax_review_state(p_input jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb := p_input #> '{observation_metadata,tax_snapshot}';
  v_review jsonb := p_input #> '{observation_metadata,tax_review}';
  v_basis text := v_snapshot->>'sourceTaxBasis';
  v_source_rate numeric := nullif(v_snapshot->>'sourceTaxRate', '')::numeric;
  v_comparison_rate numeric := nullif(v_snapshot->>'comparisonTaxRate', '')::numeric;
  v_complete boolean;
begin
  v_complete := v_snapshot is not null
    and v_basis in ('exclusive', 'inclusive', 'zero_rated', 'exempt', 'no_tax')
    and nullif(pg_catalog.btrim(v_snapshot->>'taxJurisdictionCode'), '') is not null
    and v_snapshot->>'comparisonTaxBasis' in ('exclusive', 'inclusive')
    and v_comparison_rate is not null
    and v_snapshot #>> '{taxPolicySnapshot,supportsInclusiveExclusive}' = 'true'
    and nullif(pg_catalog.btrim(v_snapshot #>> '{taxPolicySnapshot,policyId}'), '') is not null
    and v_snapshot #>> '{taxPolicySnapshot,jurisdictionCode}' = v_snapshot->>'taxJurisdictionCode'
    and v_snapshot #>> '{taxPolicySnapshot,comparisonBasis}' = v_snapshot->>'comparisonTaxBasis'
    and nullif(v_snapshot #>> '{taxPolicySnapshot,standardRate}', '')::numeric = v_comparison_rate
    and not (
      v_basis in ('exclusive', 'inclusive')
      and v_source_rate is not null
      and pg_catalog.abs(v_source_rate - v_comparison_rate) > 0.0001
    );

  if v_complete then
    if v_review is not null and coalesce(v_review->>'status', 'complete') <> 'complete' then
      perform public.materials_phase1f_error('tax_review_state_conflict');
    end if;
    return;
  end if;

  if v_review->>'status' <> 'needs_review'
    or coalesce((v_review->>'acknowledged')::boolean, false) is not true
    or nullif(pg_catalog.btrim(v_review->>'reason'), '') is null then
    perform public.materials_phase1f_error('incomplete_tax_review_acknowledgement_required');
  end if;
end;
$$;
revoke all on function public.materials_validate_price_tax_review_state(jsonb) from public, anon, authenticated;

-- Re-wrap every public Supplier Price writer. The delegated implementations
-- retain their existing permission, idempotency, and transaction boundaries.
create or replace function public.add_supplier_product_price_version(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.materials_validate_price_tax_review_state(p_input);
  perform public.materials_validate_price_tax_idempotency(p_input);
  return public.add_supplier_product_price_version_without_tax_idempotency(p_input);
end;
$$;

create or replace function public.create_supplier_product_with_initial_price(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.materials_validate_price_tax_review_state(p_input);
  perform public.materials_validate_price_tax_idempotency(p_input);
  return public.create_supplier_product_with_initial_price_without_tax_idempotency(p_input);
end;
$$;

create or replace function public.approve_material_import_row(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb := p_input #> '{observation_metadata,tax_snapshot}';
begin
  perform public.materials_validate_price_tax_review_state(p_input);
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

revoke all on function public.add_supplier_product_price_version(jsonb) from public, anon;
revoke all on function public.create_supplier_product_with_initial_price(jsonb) from public, anon;
revoke all on function public.approve_material_import_row(jsonb) from public, anon;
grant execute on function public.add_supplier_product_price_version(jsonb) to authenticated;
grant execute on function public.create_supplier_product_with_initial_price(jsonb) to authenticated;
grant execute on function public.approve_material_import_row(jsonb) to authenticated;

alter table public.organization_tax_policies
  add constraint organization_tax_policies_organization_id_id_key unique (organization_id, id);

create table public.organization_material_supplier_price_tax_correction_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  supplier_product_id uuid not null,
  previous_supplier_price_id uuid not null,
  new_supplier_price_id uuid not null,
  event_type text not null default 'tax_evidence_confirmed'
    check (event_type = 'tax_evidence_confirmed'),
  reason text not null check (char_length(pg_catalog.btrim(reason)) >= 8),
  evidence_source text not null check (evidence_source in ('user_confirmed', 'document_and_user_confirmed')),
  policy_id uuid not null,
  effective_from timestamptz not null,
  actor_user_id uuid not null references auth.users (id),
  idempotency_key text not null check (char_length(pg_catalog.btrim(idempotency_key)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint material_price_tax_correction_product_fkey foreign key (organization_id, supplier_product_id)
    references public.organization_material_supplier_products (organization_id, id),
  constraint material_price_tax_correction_previous_price_fkey foreign key (organization_id, previous_supplier_price_id)
    references public.organization_material_supplier_prices (organization_id, id),
  constraint material_price_tax_correction_new_price_fkey foreign key (organization_id, new_supplier_price_id)
    references public.organization_material_supplier_prices (organization_id, id),
  constraint material_price_tax_correction_policy_fkey foreign key (organization_id, policy_id)
    references public.organization_tax_policies (organization_id, id),
  unique (organization_id, idempotency_key),
  unique (organization_id, new_supplier_price_id),
  constraint material_price_tax_correction_organization_fkey foreign key (organization_id)
    references public.organizations (id) on delete cascade
);

create index organization_material_price_tax_corrections_product_created_idx
  on public.organization_material_supplier_price_tax_correction_events
  (organization_id, supplier_product_id, created_at desc);

create or replace function public.reject_material_price_tax_correction_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Material Supplier Price tax correction history is append-only.' using errcode = '55000';
end;
$$;
create trigger organization_material_price_tax_corrections_append_only
before update or delete on public.organization_material_supplier_price_tax_correction_events
for each row execute function public.reject_material_price_tax_correction_event_mutation();

alter table public.organization_material_supplier_price_tax_correction_events enable row level security;
alter table public.organization_material_supplier_price_tax_correction_events force row level security;
create policy "Members can view Material Supplier Price tax correction events"
on public.organization_material_supplier_price_tax_correction_events
for select to authenticated
using (public.has_org_permission(organization_id, 'materials.view'));
revoke all on public.organization_material_supplier_price_tax_correction_events from public, anon, authenticated;
grant select on public.organization_material_supplier_price_tax_correction_events to authenticated;
revoke all on function public.reject_material_price_tax_correction_event_mutation() from public, anon, authenticated;

create or replace function public.confirm_supplier_price_tax_evidence(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_actor uuid;
  v_previous public.organization_material_supplier_prices%rowtype;
  v_policy public.organization_tax_policies%rowtype;
  v_existing public.organization_material_supplier_price_tax_correction_events%rowtype;
  v_effective_from timestamptz := (p_input->>'effective_from')::timestamptz;
  v_reason text := nullif(pg_catalog.btrim(p_input->>'reason'), '');
  v_key text := nullif(pg_catalog.btrim(p_input->>'idempotency_key'), '');
  v_basis text := coalesce(nullif(p_input->>'source_tax_basis', ''), 'unknown');
  v_source_rate numeric := nullif(p_input->>'source_tax_rate', '')::numeric;
  v_snapshot jsonb;
  v_metadata jsonb;
  v_result jsonb;
  v_new_price_id uuid;
begin
  v_actor := public.materials_phase1f_require_writer(v_org);
  if v_reason is null or char_length(v_reason) < 8 then
    perform public.materials_phase1f_error('tax_correction_reason_required');
  end if;
  if v_key is null then
    perform public.materials_phase1f_error('idempotency_key_required');
  end if;
  if v_effective_from is null or v_effective_from > statement_timestamp() + interval '1 second' then
    perform public.materials_phase1f_error('invalid_tax_correction_effective_date');
  end if;

  select * into v_existing
  from public.organization_material_supplier_price_tax_correction_events
  where organization_id = v_org and idempotency_key = v_key;
  if found then
    if v_existing.previous_supplier_price_id is distinct from (p_input->>'previous_supplier_price_id')::uuid
      or v_existing.policy_id is distinct from (p_input->>'policy_id')::uuid
      or v_existing.effective_from is distinct from v_effective_from
      or v_existing.reason is distinct from v_reason then
      perform public.materials_phase1f_error('idempotency_conflict');
    end if;
    return pg_catalog.jsonb_build_object(
      'supplier_product_id', v_existing.supplier_product_id,
      'price_id', v_existing.new_supplier_price_id,
      'supersedes_price_id', v_existing.previous_supplier_price_id,
      'correction_event_id', v_existing.id,
      'idempotent_replay', true
    );
  end if;

  select * into v_previous
  from public.organization_material_supplier_prices
  where organization_id = v_org
    and id = (p_input->>'previous_supplier_price_id')::uuid
  for update;
  if not found then perform public.materials_phase1f_error('supplier_price_not_found'); end if;
  if not v_previous.is_current then perform public.materials_phase1f_error('stale_supplier_price'); end if;
  if v_previous.supplier_product_id is null then perform public.materials_phase1f_error('supplier_product_not_found'); end if;
  if v_effective_from <= v_previous.effective_from then
    perform public.materials_phase1f_error('invalid_tax_correction_effective_date');
  end if;
  if v_basis not in ('exclusive', 'inclusive', 'zero_rated', 'exempt', 'no_tax') then
    perform public.materials_phase1f_error('confirmed_source_tax_basis_required');
  end if;

  select * into v_policy
  from public.organization_tax_policies
  where organization_id = v_org
    and id = (p_input->>'policy_id')::uuid
    and effective_from <= v_effective_from
    and (effective_to is null or effective_to > v_effective_from)
  for share;
  if not found then perform public.materials_phase1f_error('stale_tax_policy'); end if;
  if not v_policy.supports_inclusive_exclusive then
    perform public.materials_phase1f_error('unsupported_tax_jurisdiction');
  end if;
  if v_basis in ('exclusive', 'inclusive') and v_source_rate is not null
    and pg_catalog.abs(v_source_rate - v_policy.standard_rate) > 0.0001 then
    perform public.materials_phase1f_error('tax_rate_conflict');
  end if;

  v_snapshot := pg_catalog.jsonb_build_object(
    'sourceTaxBasis', v_basis,
    'sourceTaxRate', case when v_basis in ('zero_rated', 'no_tax') then 0 else v_source_rate end,
    'taxJurisdictionCode', v_policy.jurisdiction_code,
    'comparisonTaxBasis', v_policy.comparison_basis,
    'comparisonTaxRate', v_policy.standard_rate,
    'taxPolicySnapshot', pg_catalog.jsonb_build_object(
      'policyId', v_policy.id,
      'jurisdictionCode', v_policy.jurisdiction_code,
      'taxName', v_policy.tax_name,
      'registrationStatus', v_policy.registration_status,
      'comparisonBasis', v_policy.comparison_basis,
      'standardRate', v_policy.standard_rate,
      'supportsInclusiveExclusive', v_policy.supports_inclusive_exclusive,
      'effectiveFrom', v_policy.effective_from,
      'effectiveTo', v_policy.effective_to,
      'policySource', v_policy.policy_source
    ),
    'taxEvidence', coalesce(v_previous.tax_evidence, '{}'::jsonb) || pg_catalog.jsonb_build_object(
      'confirmationSource', 'user_confirmed',
      'actorUserId', v_actor,
      'confirmedAt', statement_timestamp(),
      'correctionReason', v_reason,
      'previousSupplierPriceId', v_previous.id
    )
  );
  v_metadata := pg_catalog.jsonb_build_object(
    'tax_snapshot', v_snapshot,
    'tax_review', pg_catalog.jsonb_build_object(
      'status', 'complete',
      'acknowledged', true,
      'reason', v_reason,
      'actorUserId', v_actor,
      'reviewedAt', statement_timestamp(),
      'previousSupplierPriceId', v_previous.id
    ),
    'tax_correction', pg_catalog.jsonb_build_object(
      'previousSupplierPriceId', v_previous.id,
      'policyId', v_policy.id,
      'effectiveFrom', v_effective_from,
      'reason', v_reason
    )
  );
  perform public.materials_validate_price_tax_review_state(
    pg_catalog.jsonb_build_object('observation_metadata', v_metadata)
  );

  v_result := public.materials_phase1f_add_price_internal(
    v_org, v_previous.supplier_product_id, v_previous.unit_cost, v_previous.currency,
    v_effective_from, true, v_previous.source, 'tax-correction:' || v_key,
    v_previous.import_batch_id, v_previous.import_row_id, v_metadata
  );
  v_new_price_id := (v_result->>'price_id')::uuid;

  insert into public.organization_material_supplier_price_tax_correction_events (
    organization_id, supplier_product_id, previous_supplier_price_id,
    new_supplier_price_id, reason, evidence_source, policy_id, effective_from,
    actor_user_id, idempotency_key, metadata
  ) values (
    v_org, v_previous.supplier_product_id, v_previous.id, v_new_price_id,
    v_reason,
    case when coalesce(v_previous.tax_evidence, '{}'::jsonb) <> '{}'::jsonb
      then 'document_and_user_confirmed' else 'user_confirmed' end,
    v_policy.id, v_effective_from, v_actor, v_key,
    pg_catalog.jsonb_build_object(
      'source', v_previous.source,
      'importBatchId', v_previous.import_batch_id,
      'importRowId', v_previous.import_row_id,
      'sourceTaxBasisBefore', v_previous.source_tax_basis,
      'sourceTaxBasisAfter', v_basis
    )
  ) returning id into v_existing.id;

  return v_result || pg_catalog.jsonb_build_object(
    'correction_event_id', v_existing.id,
    'policy_id', v_policy.id
  );
end;
$$;
revoke all on function public.confirm_supplier_price_tax_evidence(jsonb) from public, anon;
grant execute on function public.confirm_supplier_price_tax_evidence(jsonb) to authenticated;

commit;
