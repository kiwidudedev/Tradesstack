begin;

-- Phase 10 adds append-only aggregate payment observations and deterministic
-- origin attribution. It never rewrites Payment Claims, Retention Claims,
-- Phase 9 accounting evidence, PDFs, or Xero invoices.

insert into public.app_permissions(permission_key, description)
values
  (
    'retention.claims.payments.view',
    'View Retention Claim payment reconciliation and origin attribution'
  ),
  (
    'retention.claims.payments.manage',
    'Record and refresh Retention Claim payment reconciliation'
  )
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions(role, permission_key, is_allowed)
select role_name, permission_key,
  case
    when permission_key = 'retention.claims.payments.view'
      then role_name in ('owner', 'admin', 'qs', 'project_manager')
    else role_name in ('owner', 'admin')
  end
from unnest(array['owner', 'admin', 'qs', 'project_manager', 'worker']) role_name
cross join unnest(array[
  'retention.claims.payments.view',
  'retention.claims.payments.manage'
]) permission_key
on conflict (role, permission_key) do update
set is_allowed = excluded.is_allowed, updated_at = now();

create table public.retention_claim_payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  reconciliation_sequence integer not null,
  source text not null,
  payment_status text not null,
  projection_applied boolean not null,
  paid_amount_excl_tax numeric(14,2) null,
  outstanding_amount_excl_tax numeric(14,2) null,
  invoice_total_gross numeric(14,2) null,
  amount_paid_gross numeric(14,2) null,
  amount_due_gross numeric(14,2) null,
  amount_credited_gross numeric(14,2) null,
  raw_provider_status text null,
  normalized_provider_status text null,
  fully_paid_at timestamptz null,
  provider_updated_at timestamptz null,
  accounting_document_id uuid null,
  accounting_snapshot_id uuid null,
  external_document_id_snapshot text null,
  expected_previous_reconciliation_id uuid null,
  attention_code text null,
  attention_message text null,
  calculation_version text not null default 'largest_remainder_v1',
  source_evidence_hash text not null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  correlation_id text null,
  reconciled_at timestamptz not null default now(),
  constraint retention_claim_payment_reconciliations_claim_fkey
    foreign key(organization_id, project_id, retention_claim_id)
    references public.retention_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_payment_reconciliations_document_fkey
    foreign key(accounting_document_id)
    references public.organization_accounting_documents(id)
    on delete restrict,
  constraint retention_claim_payment_reconciliations_snapshot_fkey
    foreign key(accounting_snapshot_id)
    references public.retention_claim_accounting_snapshots(id)
    on delete restrict,
  constraint retention_claim_payment_reconciliations_previous_fkey
    foreign key(expected_previous_reconciliation_id)
    references public.retention_claim_payment_reconciliations(id)
    on delete restrict,
  constraint retention_claim_payment_reconciliations_sequence_unique
    unique(retention_claim_id, reconciliation_sequence),
  constraint retention_claim_payment_reconciliations_source_check
    check(source in ('manual', 'xero')),
  constraint retention_claim_payment_reconciliations_status_check
    check(payment_status in (
      'unpaid', 'partially_paid', 'paid', 'attention_required'
    )),
  constraint retention_claim_payment_reconciliations_sequence_check
    check(reconciliation_sequence > 0),
  constraint retention_claim_payment_reconciliations_hash_check
    check(source_evidence_hash ~ '^[a-f0-9]{64}$'),
  constraint retention_claim_payment_reconciliations_calculation_check
    check(calculation_version = 'largest_remainder_v1'),
  constraint retention_claim_payment_reconciliations_amounts_check check(
    (paid_amount_excl_tax is null or paid_amount_excl_tax >= 0)
    and (
      outstanding_amount_excl_tax is null
      or outstanding_amount_excl_tax >= 0
    )
    and (invoice_total_gross is null or invoice_total_gross >= 0)
    and (amount_paid_gross is null or amount_paid_gross >= 0)
    and (amount_due_gross is null or amount_due_gross >= 0)
    and (amount_credited_gross is null or amount_credited_gross >= 0)
  ),
  constraint retention_claim_payment_reconciliations_projection_shape check(
    (
      projection_applied
      and payment_status in ('unpaid', 'partially_paid', 'paid')
      and paid_amount_excl_tax is not null
      and outstanding_amount_excl_tax is not null
      and attention_code is null
      and attention_message is null
    )
    or (
      not projection_applied
      and payment_status = 'attention_required'
      and paid_amount_excl_tax is null
      and outstanding_amount_excl_tax is null
      and nullif(trim(attention_code), '') is not null
      and nullif(trim(attention_message), '') is not null
    )
  ),
  constraint retention_claim_payment_reconciliations_source_shape check(
    (
      source = 'manual'
      and accounting_document_id is null
      and accounting_snapshot_id is null
      and external_document_id_snapshot is null
      and invoice_total_gross is null
      and amount_paid_gross is null
      and amount_due_gross is null
      and amount_credited_gross is null
      and raw_provider_status is null
      and normalized_provider_status is null
      and provider_updated_at is null
      and actor_user_id is not null
      and projection_applied
    )
    or (
      source = 'xero'
      and accounting_document_id is not null
      and accounting_snapshot_id is not null
      and nullif(trim(external_document_id_snapshot), '') is not null
      and invoice_total_gross is not null
      and amount_paid_gross is not null
      and amount_due_gross is not null
      and amount_credited_gross is not null
      and nullif(trim(raw_provider_status), '') is not null
      and nullif(trim(normalized_provider_status), '') is not null
    )
  )
);

create table public.retention_claim_payment_attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  payment_reconciliation_id uuid not null,
  retention_claim_allocation_id uuid not null,
  originating_payment_claim_id uuid not null,
  allocation_sequence integer not null,
  allocation_amount_snapshot numeric(14,2) not null,
  paid_amount numeric(14,2) not null,
  floor_paid_amount numeric(14,2) not null,
  residual_cent_awarded boolean not null,
  remainder_numerator numeric(30,0) not null,
  calculation_version text not null default 'largest_remainder_v1',
  created_at timestamptz not null default now(),
  constraint retention_claim_payment_attributions_reconciliation_fkey
    foreign key(payment_reconciliation_id)
    references public.retention_claim_payment_reconciliations(id)
    on delete restrict,
  constraint retention_claim_payment_attributions_allocation_fkey
    foreign key(
      organization_id,
      project_id,
      retention_claim_id,
      retention_claim_allocation_id
    )
    references public.retention_claim_allocations(
      organization_id,
      project_id,
      retention_claim_id,
      id
    )
    on delete restrict,
  constraint retention_claim_payment_attributions_origin_fkey
    foreign key(organization_id, project_id, originating_payment_claim_id)
    references public.project_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_payment_attributions_unique
    unique(payment_reconciliation_id, retention_claim_allocation_id),
  constraint retention_claim_payment_attributions_sequence_unique
    unique(payment_reconciliation_id, allocation_sequence),
  constraint retention_claim_payment_attributions_amounts_check check(
    allocation_sequence > 0
    and allocation_amount_snapshot > 0
    and paid_amount >= 0
    and paid_amount <= allocation_amount_snapshot
    and floor_paid_amount >= 0
    and floor_paid_amount <= paid_amount
    and paid_amount - floor_paid_amount in (0, 0.01)
    and (
      residual_cent_awarded =
      (paid_amount - floor_paid_amount = 0.01)
    )
    and remainder_numerator >= 0
  ),
  constraint retention_claim_payment_attributions_calculation_check
    check(calculation_version = 'largest_remainder_v1')
);

create table public.retention_claim_payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  payment_reconciliation_id uuid not null,
  event_type text not null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  correlation_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_claim_payment_events_claim_fkey
    foreign key(organization_id, project_id, retention_claim_id)
    references public.retention_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_payment_events_reconciliation_fkey
    foreign key(payment_reconciliation_id)
    references public.retention_claim_payment_reconciliations(id)
    on delete restrict,
  constraint retention_claim_payment_events_type_check
    check(event_type in (
      'manual_payment_reconciled',
      'xero_payment_reconciled',
      'payment_reconciliation_attention'
    )),
  constraint retention_claim_payment_events_metadata_check
    check(jsonb_typeof(metadata) = 'object')
);

create index retention_claim_payment_reconciliations_claim_idx
  on public.retention_claim_payment_reconciliations(
    retention_claim_id, reconciliation_sequence desc
  );
create index retention_claim_payment_attributions_origin_idx
  on public.retention_claim_payment_attributions(
    originating_payment_claim_id, created_at desc
  );
create index retention_claim_payment_events_claim_idx
  on public.retention_claim_payment_events(
    retention_claim_id, occurred_at desc, id desc
  );

alter table public.retention_claim_payment_reconciliations
  enable row level security;
alter table public.retention_claim_payment_reconciliations
  force row level security;
alter table public.retention_claim_payment_attributions
  enable row level security;
alter table public.retention_claim_payment_attributions
  force row level security;
alter table public.retention_claim_payment_events enable row level security;
alter table public.retention_claim_payment_events force row level security;

revoke all on public.retention_claim_payment_reconciliations
  from public, anon, authenticated;
revoke all on public.retention_claim_payment_attributions
  from public, anon, authenticated;
revoke all on public.retention_claim_payment_events
  from public, anon, authenticated;

create policy "Retention payment viewers can read reconciliations"
on public.retention_claim_payment_reconciliations
for select to authenticated
using (
  public.has_org_permission(
    organization_id,
    'retention.claims.payments.view'
  )
);

create policy "Retention payment viewers can read attributions"
on public.retention_claim_payment_attributions
for select to authenticated
using (
  public.has_org_permission(
    organization_id,
    'retention.claims.payments.view'
  )
);

create policy "Retention payment viewers can read payment events"
on public.retention_claim_payment_events
for select to authenticated
using (
  public.has_org_permission(
    organization_id,
    'retention.claims.payments.view'
  )
);

create or replace function public.prevent_retention_claim_payment_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Retention Claim payment evidence is append-only.'
    using errcode = '55000';
end;
$$;

create trigger retention_claim_payment_reconciliations_append_only
before update or delete on public.retention_claim_payment_reconciliations
for each row execute function public.prevent_retention_claim_payment_mutation();

create trigger retention_claim_payment_attributions_append_only
before update or delete on public.retention_claim_payment_attributions
for each row execute function public.prevent_retention_claim_payment_mutation();

create trigger retention_claim_payment_events_append_only
before update or delete on public.retention_claim_payment_events
for each row execute function public.prevent_retention_claim_payment_mutation();

create or replace function private.retention_phase10_gate_enabled()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(
      current_setting('request.jwt.claim.retention_phase10_internal', true),
      ''
    ) = 'true'
    or coalesce(
      coalesce(
        nullif(current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb ->> 'retention_phase10_internal',
      'false'
    ) = 'true';
$$;

create or replace function private.retention_phase10_context(
  p_retention_claim_id uuid,
  p_permission_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  claim_row public.retention_claims%rowtype;
begin
  if actor_id is null then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  select claim.* into claim_row
  from public.retention_claims claim
  join public.organization_members member
    on member.organization_id = claim.organization_id
   and member.user_id = actor_id
  where claim.id = p_retention_claim_id;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_found'
    );
  end if;

  if not public.has_org_permission(
    claim_row.organization_id,
    p_permission_key
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  if not exists (
    select 1 from public.organization_capabilities capability
    where capability.organization_id = claim_row.organization_id
      and capability.capability_key = 'retention_management'
      and capability.enabled = true
  ) or not exists (
    select 1 from public.project_retention_workflow_states state
    where state.organization_id = claim_row.organization_id
      and state.project_id = claim_row.project_id
      and state.mode = 'observe'
  ) or not private.retention_phase10_gate_enabled() then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'project_mode_not_supported'
    );
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'actorUserId', actor_id,
    'organizationId', claim_row.organization_id,
    'projectId', claim_row.project_id,
    'retentionClaimId', claim_row.id
  );
end;
$$;

create or replace function public.get_retention_claim_payment_state(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  context jsonb;
  claim_row public.retention_claims%rowtype;
  latest_row public.retention_claim_payment_reconciliations%rowtype;
  applied_row public.retention_claim_payment_reconciliations%rowtype;
begin
  context := private.retention_phase10_context(
    p_retention_claim_id,
    'retention.claims.payments.view'
  );
  if not coalesce((context->>'succeeded')::boolean, false) then
    return context;
  end if;

  select * into claim_row
  from public.retention_claims
  where id = p_retention_claim_id;
  if claim_row.status <> 'submitted' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_submitted'
    );
  end if;

  select * into latest_row
  from public.retention_claim_payment_reconciliations
  where retention_claim_id = claim_row.id
  order by reconciliation_sequence desc
  limit 1;

  select * into applied_row
  from public.retention_claim_payment_reconciliations
  where retention_claim_id = claim_row.id
    and projection_applied = true
  order by reconciliation_sequence desc
  limit 1;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'actorUserId', context->>'actorUserId',
    'organizationId', claim_row.organization_id,
    'projectId', claim_row.project_id,
    'retentionClaimId', claim_row.id,
    'subtotalExclTax', claim_row.subtotal_excl_tax,
    'latestReconciliation', case when latest_row.id is null then null else
      to_jsonb(latest_row) end,
    'currentAppliedReconciliation', case when applied_row.id is null then null
      else to_jsonb(applied_row) end,
    'attributions', coalesce((
      select jsonb_agg(to_jsonb(attribution)
        order by attribution.allocation_sequence)
      from public.retention_claim_payment_attributions attribution
      where attribution.payment_reconciliation_id = applied_row.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_retention_claim_payment_manage_access(
  p_retention_claim_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select private.retention_phase10_context(
    p_retention_claim_id,
    'retention.claims.payments.manage'
  );
$$;

create or replace function public.record_retention_claim_payment_reconciliation(
  p_retention_claim_id uuid,
  p_source text,
  p_actor_user_id uuid,
  p_expected_previous_reconciliation_id uuid,
  p_payment_status text,
  p_projection_applied boolean,
  p_paid_amount_excl_tax numeric,
  p_invoice_total_gross numeric,
  p_amount_paid_gross numeric,
  p_amount_due_gross numeric,
  p_amount_credited_gross numeric,
  p_raw_provider_status text,
  p_normalized_provider_status text,
  p_fully_paid_at timestamptz,
  p_provider_updated_at timestamptz,
  p_accounting_document_id uuid,
  p_accounting_snapshot_id uuid,
  p_external_document_id text,
  p_attention_code text,
  p_attention_message text,
  p_attributions jsonb,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  claim_row public.retention_claims%rowtype;
  document_row public.organization_accounting_documents%rowtype;
  snapshot_row public.retention_claim_accounting_snapshots%rowtype;
  latest_id uuid;
  next_sequence integer;
  reconciliation_id uuid;
  source_hash text;
  supplied_count integer;
  allocation_count integer;
  supplied_paid numeric;
  paid_cents bigint;
  subtotal_cents bigint;
  residual_cents bigint;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;
  if p_source not in ('manual', 'xero') then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'invalid_source'
    );
  end if;

  select * into claim_row
  from public.retention_claims
  where id = p_retention_claim_id
  for update;
  if not found or claim_row.status <> 'submitted' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_submitted'
    );
  end if;

  if not exists (
    select 1 from public.organization_capabilities capability
    where capability.organization_id = claim_row.organization_id
      and capability.capability_key = 'retention_management'
      and capability.enabled = true
  ) or not exists (
    select 1 from public.project_retention_workflow_states state
    where state.organization_id = claim_row.organization_id
      and state.project_id = claim_row.project_id
      and state.mode = 'observe'
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'project_mode_not_supported'
    );
  end if;

  if p_source = 'manual' and (
    p_actor_user_id is null
    or not private.retention_phase8_actor_has_permission(
      claim_row.organization_id,
      p_actor_user_id,
      'retention.claims.payments.manage'
    )
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  select reconciliation.id into latest_id
  from public.retention_claim_payment_reconciliations reconciliation
  where reconciliation.retention_claim_id = claim_row.id
  order by reconciliation.reconciliation_sequence desc
  limit 1;
  if latest_id is distinct from p_expected_previous_reconciliation_id then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'concurrent_reconciliation'
    );
  end if;

  select coalesce(max(reconciliation_sequence), 0) + 1
  into next_sequence
  from public.retention_claim_payment_reconciliations
  where retention_claim_id = claim_row.id;

  if p_source = 'manual' then
    if not p_projection_applied
       or p_paid_amount_excl_tax is null
       or round(p_paid_amount_excl_tax, 2) < 0
       or round(p_paid_amount_excl_tax, 2) > claim_row.subtotal_excl_tax
       or p_invoice_total_gross is not null
       or p_accounting_document_id is not null
       or p_attention_code is not null
       or p_payment_status <> (case
         when round(p_paid_amount_excl_tax, 2) = 0 then 'unpaid'
         when round(p_paid_amount_excl_tax, 2) =
           claim_row.subtotal_excl_tax then 'paid'
         else 'partially_paid'
       end) then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'invalid_manual_payment'
      );
    end if;
  else
    select * into document_row
    from public.organization_accounting_documents
    where id = p_accounting_document_id
      and organization_id = claim_row.organization_id
      and provider = 'xero'
      and local_document_type = 'retention_claim'
      and retention_claim_id = claim_row.id
      and external_document_id = p_external_document_id
    for update;
    if not found then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'accounting_document_invalid'
      );
    end if;
    select * into snapshot_row
    from public.retention_claim_accounting_snapshots
    where id = p_accounting_snapshot_id
      and accounting_document_id = document_row.id
      and retention_claim_id = claim_row.id;
    if not found then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'accounting_snapshot_invalid'
      );
    end if;
    if p_invoice_total_gross is null
       or p_amount_paid_gross is null
       or p_amount_due_gross is null
       or p_amount_credited_gross is null
       or least(
         p_invoice_total_gross,
         p_amount_paid_gross,
         p_amount_due_gross,
         p_amount_credited_gross
       ) < 0 then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'invalid_provider_payment'
      );
    end if;
    if p_projection_applied and (
      round(p_invoice_total_gross, 2) <> snapshot_row.total_snapshot
      or round(p_amount_credited_gross, 2) <> 0
      or round(p_amount_paid_gross, 2) > snapshot_row.total_snapshot
      or round(p_amount_paid_gross + p_amount_due_gross, 2) <>
        snapshot_row.total_snapshot
      or p_paid_amount_excl_tax is null
      or round(p_paid_amount_excl_tax, 2) < 0
      or round(p_paid_amount_excl_tax, 2) >
        snapshot_row.subtotal_excl_tax_snapshot
      or round(p_paid_amount_excl_tax, 2) <> round(
        p_amount_paid_gross
        * snapshot_row.subtotal_excl_tax_snapshot
        / snapshot_row.total_snapshot,
        2
      )
      or p_attention_code is not null
    ) then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'invalid_xero_projection'
      );
    end if;
    if not p_projection_applied and (
      p_payment_status <> 'attention_required'
      or p_paid_amount_excl_tax is not null
      or nullif(trim(coalesce(p_attention_code, '')), '') is null
      or nullif(trim(coalesce(p_attention_message, '')), '') is null
    ) then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'invalid_attention_state'
      );
    end if;
  end if;

  if p_projection_applied then
    if p_payment_status <> (case
      when round(p_paid_amount_excl_tax, 2) = 0 then 'unpaid'
      when round(p_paid_amount_excl_tax, 2) =
        claim_row.subtotal_excl_tax then 'paid'
      else 'partially_paid'
    end) then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'payment_status_mismatch'
      );
    end if;

    if p_attributions is null
       or jsonb_typeof(p_attributions) <> 'array' then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'invalid_attributions'
      );
    end if;

    with supplied as (
      select *
      from jsonb_to_recordset(p_attributions) as attribution(
        "allocationId" uuid,
        "originatingPaymentClaimId" uuid,
        "sequence" integer,
        "allocationAmount" numeric,
        "paidAmount" numeric,
        "floorPaidAmount" numeric,
        "residualCentAwarded" boolean,
        "remainderNumerator" numeric
      )
    )
    select count(*)::integer, coalesce(sum(round("paidAmount", 2)), 0)
    into supplied_count, supplied_paid
    from supplied;

    select count(*)::integer into allocation_count
    from public.retention_claim_allocations
    where retention_claim_id = claim_row.id;

    paid_cents := round(p_paid_amount_excl_tax * 100)::bigint;
    subtotal_cents := round(claim_row.subtotal_excl_tax * 100)::bigint;
    select paid_cents - coalesce(sum(
      (paid_cents * round(allocation.allocation_amount * 100)::bigint)
        / subtotal_cents
    ), 0)
    into residual_cents
    from public.retention_claim_allocations allocation
    where allocation.retention_claim_id = claim_row.id;

    if supplied_count <> allocation_count
       or supplied_paid <> round(p_paid_amount_excl_tax, 2)
       or exists (
         with expected as (
           select
             allocation.*,
             round(allocation.allocation_amount * 100)::bigint
               as allocation_cents,
             (
               paid_cents
               * round(allocation.allocation_amount * 100)::bigint
             ) / subtotal_cents as floor_cents,
             (
               paid_cents
               * round(allocation.allocation_amount * 100)::bigint
             ) % subtotal_cents as remainder,
             row_number() over (
               order by
                 (
                   paid_cents
                   * round(allocation.allocation_amount * 100)::bigint
                 ) % subtotal_cents desc,
                 allocation.allocation_sequence,
                 allocation.id
             ) as residual_rank
           from public.retention_claim_allocations allocation
           where allocation.retention_claim_id = claim_row.id
         ),
         supplied as (
           select *
           from jsonb_to_recordset(p_attributions) as attribution(
             "allocationId" uuid,
             "originatingPaymentClaimId" uuid,
             "sequence" integer,
             "allocationAmount" numeric,
             "paidAmount" numeric,
             "floorPaidAmount" numeric,
             "residualCentAwarded" boolean,
             "remainderNumerator" numeric
           )
         )
         select 1
         from expected
         full join supplied
           on supplied."allocationId" = expected.id
         where expected.id is null
            or supplied."allocationId" is null
            or supplied."originatingPaymentClaimId" is distinct from
              expected.originating_payment_claim_id
            or supplied."sequence" is distinct from
              expected.allocation_sequence
            or round(supplied."allocationAmount", 2) is distinct from
              expected.allocation_amount
            or round(supplied."floorPaidAmount" * 100)::bigint
              is distinct from
              expected.floor_cents
            or round(supplied."paidAmount" * 100)::bigint
              is distinct from
              expected.floor_cents
              + case when expected.residual_rank <= residual_cents
                then 1 else 0 end
            or supplied."residualCentAwarded" is distinct from
              (expected.residual_rank <= residual_cents)
            or supplied."remainderNumerator" is distinct from
              expected.remainder
       ) then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'attribution_mismatch'
      );
    end if;
  elsif p_attributions is not null
    and p_attributions <> '[]'::jsonb then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'attention_has_attributions'
    );
  end if;

  source_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'schemaVersion', 1,
    'retentionClaimId', claim_row.id,
    'sequence', next_sequence,
    'source', p_source,
    'paymentStatus', p_payment_status,
    'projectionApplied', p_projection_applied,
    'paidAmountExclTax', p_paid_amount_excl_tax,
    'invoiceTotalGross', p_invoice_total_gross,
    'amountPaidGross', p_amount_paid_gross,
    'amountDueGross', p_amount_due_gross,
    'amountCreditedGross', p_amount_credited_gross,
    'rawProviderStatus', p_raw_provider_status,
    'normalizedProviderStatus', p_normalized_provider_status,
    'fullyPaidAt', p_fully_paid_at,
    'providerUpdatedAt', p_provider_updated_at,
    'accountingDocumentId', p_accounting_document_id,
    'accountingSnapshotId', p_accounting_snapshot_id,
    'externalDocumentId', p_external_document_id,
    'expectedPreviousReconciliationId',
      p_expected_previous_reconciliation_id,
    'attentionCode', p_attention_code,
    'attentionMessage', p_attention_message,
    'actorUserId', p_actor_user_id,
    'correlationId', p_correlation_id,
    'attributions', coalesce(p_attributions, '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.retention_claim_payment_reconciliations(
    organization_id,
    project_id,
    retention_claim_id,
    reconciliation_sequence,
    source,
    payment_status,
    projection_applied,
    paid_amount_excl_tax,
    outstanding_amount_excl_tax,
    invoice_total_gross,
    amount_paid_gross,
    amount_due_gross,
    amount_credited_gross,
    raw_provider_status,
    normalized_provider_status,
    fully_paid_at,
    provider_updated_at,
    accounting_document_id,
    accounting_snapshot_id,
    external_document_id_snapshot,
    expected_previous_reconciliation_id,
    attention_code,
    attention_message,
    source_evidence_hash,
    actor_user_id,
    correlation_id
  )
  values(
    claim_row.organization_id,
    claim_row.project_id,
    claim_row.id,
    next_sequence,
    p_source,
    p_payment_status,
    p_projection_applied,
    case when p_projection_applied
      then round(p_paid_amount_excl_tax, 2) else null end,
    case when p_projection_applied
      then round(claim_row.subtotal_excl_tax - p_paid_amount_excl_tax, 2)
      else null end,
    p_invoice_total_gross,
    p_amount_paid_gross,
    p_amount_due_gross,
    p_amount_credited_gross,
    p_raw_provider_status,
    p_normalized_provider_status,
    p_fully_paid_at,
    p_provider_updated_at,
    p_accounting_document_id,
    p_accounting_snapshot_id,
    p_external_document_id,
    p_expected_previous_reconciliation_id,
    p_attention_code,
    p_attention_message,
    source_hash,
    p_actor_user_id,
    p_correlation_id
  )
  returning id into reconciliation_id;

  if p_projection_applied then
    insert into public.retention_claim_payment_attributions(
      organization_id,
      project_id,
      retention_claim_id,
      payment_reconciliation_id,
      retention_claim_allocation_id,
      originating_payment_claim_id,
      allocation_sequence,
      allocation_amount_snapshot,
      paid_amount,
      floor_paid_amount,
      residual_cent_awarded,
      remainder_numerator
    )
    select
      claim_row.organization_id,
      claim_row.project_id,
      claim_row.id,
      reconciliation_id,
      attribution."allocationId",
      attribution."originatingPaymentClaimId",
      attribution."sequence",
      round(attribution."allocationAmount", 2),
      round(attribution."paidAmount", 2),
      round(attribution."floorPaidAmount", 2),
      attribution."residualCentAwarded",
      attribution."remainderNumerator"
    from jsonb_to_recordset(p_attributions) as attribution(
      "allocationId" uuid,
      "originatingPaymentClaimId" uuid,
      "sequence" integer,
      "allocationAmount" numeric,
      "paidAmount" numeric,
      "floorPaidAmount" numeric,
      "residualCentAwarded" boolean,
      "remainderNumerator" numeric
    );
  end if;

  insert into public.retention_claim_payment_events(
    organization_id,
    project_id,
    retention_claim_id,
    payment_reconciliation_id,
    event_type,
    actor_user_id,
    correlation_id,
    metadata
  )
  values(
    claim_row.organization_id,
    claim_row.project_id,
    claim_row.id,
    reconciliation_id,
    case
      when not p_projection_applied then 'payment_reconciliation_attention'
      when p_source = 'manual' then 'manual_payment_reconciled'
      else 'xero_payment_reconciled'
    end,
    p_actor_user_id,
    p_correlation_id,
    jsonb_build_object(
      'source', p_source,
      'paymentStatus', p_payment_status,
      'projectionApplied', p_projection_applied,
      'paidAmountExclTax', p_paid_amount_excl_tax,
      'sourceEvidenceHash', source_hash
    )
  );

  if p_source = 'xero' then
    update public.organization_accounting_documents
    set
      raw_external_status = p_raw_provider_status,
      normalized_external_status = p_normalized_provider_status,
      amount_paid = round(p_amount_paid_gross, 2),
      amount_due = round(p_amount_due_gross, 2),
      amount_credited = round(p_amount_credited_gross, 2),
      fully_paid_at = p_fully_paid_at,
      provider_updated_at = coalesce(
        p_provider_updated_at,
        provider_updated_at
      ),
      last_status_synced_at = now(),
      last_status_sync_error = p_attention_message
    where id = document_row.id;
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'reconciliationId', reconciliation_id,
    'reconciliationSequence', next_sequence,
    'sourceEvidenceHash', source_hash,
    'projectionApplied', p_projection_applied
  );
end;
$$;

create or replace function public.queue_retention_claim_payment_refresh(
  p_accounting_document_id uuid,
  p_actor_user_id uuid,
  p_trigger_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.organization_accounting_documents%rowtype;
  claim_row public.retention_claims%rowtype;
  active_job_id uuid;
  created_job boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;
  if p_trigger_source not in ('manual_refresh', 'scheduled') then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'invalid_trigger_source'
    );
  end if;

  select * into document_row
  from public.organization_accounting_documents
  where id = p_accounting_document_id
    and provider = 'xero'
    and local_document_type = 'retention_claim'
    and external_document_id is not null
    and export_status = 'exported'
  for update;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'accounting_document_not_found'
    );
  end if;

  select * into claim_row
  from public.retention_claims
  where id = document_row.retention_claim_id
    and organization_id = document_row.organization_id
    and status = 'submitted';
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_submitted'
    );
  end if;

  if p_trigger_source = 'manual_refresh' and (
    p_actor_user_id is null
    or not private.retention_phase8_actor_has_permission(
      document_row.organization_id,
      p_actor_user_id,
      'retention.claims.payments.manage'
    )
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  if not exists (
    select 1 from public.organization_capabilities capability
    where capability.organization_id = document_row.organization_id
      and capability.capability_key = 'retention_management'
      and capability.enabled = true
  ) or not exists (
    select 1 from public.project_retention_workflow_states state
    where state.organization_id = document_row.organization_id
      and state.project_id = claim_row.project_id
      and state.mode = 'observe'
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'project_mode_not_supported'
    );
  end if;

  if exists (
    select 1
    from public.organization_accounting_sync_jobs job
    where job.organization_id = document_row.organization_id
      and job.provider = 'xero'
      and job.job_kind in (
        'xero.retention_claim.sync',
        'xero.retention_claim.attachment'
      )
      and job.queue_state in ('pending', 'claimed', 'retry_scheduled')
      and job.request_payload->>'accountingDocumentId' =
        document_row.id::text
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'outbound_operation_in_progress'
    );
  end if;

  select job.id into active_job_id
  from public.organization_accounting_sync_jobs job
  where job.organization_id = document_row.organization_id
    and job.provider = 'xero'
    and job.job_kind = 'xero.retention_claim.refresh'
    and job.queue_state in ('pending', 'claimed', 'retry_scheduled')
    and job.request_payload->>'accountingDocumentId' =
      document_row.id::text
  order by job.created_at desc
  limit 1;

  if active_job_id is null then
    insert into public.organization_accounting_sync_jobs(
      organization_id,
      provider,
      connection_id,
      job_kind,
      trigger_source,
      queue_state,
      request_payload,
      result_summary,
      idempotency_key,
      max_attempts,
      created_by_user_id
    )
    values(
      document_row.organization_id,
      'xero',
      document_row.accounting_connection_id,
      'xero.retention_claim.refresh',
      p_trigger_source,
      'pending',
      jsonb_build_object(
        'accountingDocumentId', document_row.id,
        'retentionClaimId', claim_row.id
      ),
      '{}'::jsonb,
      null,
      3,
      p_actor_user_id
    )
    returning id into active_job_id;
    created_job := true;
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'createdJob', created_job,
    'jobId', active_job_id,
    'accountingDocumentId', document_row.id
  );
end;
$$;

alter table public.organization_accounting_sync_jobs
  drop constraint organization_accounting_sync_jobs_job_kind_check;
alter table public.organization_accounting_sync_jobs
  add constraint organization_accounting_sync_jobs_job_kind_check check(
    job_kind in (
      'import_accounts',
      'import_tax_rates',
      'import_contacts',
      'health_check',
      'xero.bill.export',
      'xero.bill.refresh',
      'xero.sales_invoice.sync',
      'xero.sales_invoice.refresh',
      'xero.sales_invoice.attachment',
      'xero.retention_claim.sync',
      'xero.retention_claim.attachment',
      'xero.retention_claim.refresh'
    )
  );

drop index public.org_accounting_sync_jobs_active_retention_claim_doc_uidx;
create unique index
  org_accounting_sync_jobs_active_retention_claim_doc_uidx
on public.organization_accounting_sync_jobs(
  organization_id,
  provider,
  connection_id,
  (request_payload ->> 'accountingDocumentId')
)
where queue_state in ('pending', 'claimed', 'retry_scheduled')
  and job_kind in (
    'xero.retention_claim.sync',
    'xero.retention_claim.attachment',
    'xero.retention_claim.refresh'
  )
  and nullif(
    trim(request_payload ->> 'accountingDocumentId'),
    ''
  ) is not null;

-- Phase 10 activates the Paid column by projecting only the latest successful
-- append-only reconciliation for each submitted Retention Claim allocation.
create or replace function public.get_project_retention_register(
  p_project_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  eligibility jsonb;
begin
  eligibility := public.get_project_retention_eligibility(p_project_id);
  if not coalesce((eligibility->>'succeeded')::boolean, false) then
    return eligibility;
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'organizationId', eligibility->>'organizationId',
    'projectId', eligibility->>'projectId',
    'positionStateHash', eligibility->>'positionStateHash',
    'eligibilityStateHash', eligibility->>'eligibilityStateHash',
    'rows', coalesce((
      select jsonb_agg(
        origin
        || jsonb_build_object(
          'nativeClaimedAmount', coalesce(native_claims.claimed_amount, 0),
          'legacyReconciledAmount', coalesce(legacy_claims.reconciled_amount, 0),
          'remainingAmount', greatest(
            (origin->>'currentRetentionOwned')::numeric
            - coalesce(native_claims.claimed_amount, 0)
            - coalesce(legacy_claims.reconciled_amount, 0),
            0
          ),
          'paidAmount', coalesce(paid_attribution.paid_amount, 0),
          'latestRetentionClaim', latest_claim.claim,
          'scheduleNames', coalesce(schedule_names.names, '[]'::jsonb),
          'nextEligibilityDate', schedule_names.next_eligibility_date,
          'variance', variance.current_variance,
          'legacyReconciliation', legacy_case.current_case
        )
        order by
          nullif(origin->>'claimDate', '')::date nulls last,
          origin->>'claimNumber',
          origin->>'originatingPaymentClaimId'
      )
      from jsonb_array_elements(
        coalesce(eligibility->'origins', '[]'::jsonb)
      ) origin
      left join lateral (
        select round(coalesce(sum(a.allocation_amount), 0), 2)
          as claimed_amount
        from public.retention_claim_allocations a
        join public.retention_claims c on c.id = a.retention_claim_id
        where a.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and c.status = 'submitted'
      ) native_claims on true
      left join lateral (
        select round(coalesce(sum(a.allocation_amount), 0), 2)
          as reconciled_amount
        from public.retention_legacy_release_allocations a
        join public.retention_legacy_reconciliation_cases c
          on c.id = a.reconciliation_case_id
        where a.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and c.status = 'approved'
      ) legacy_claims on true
      left join lateral (
        select round(coalesce(sum(attribution.paid_amount), 0), 2)
          as paid_amount
        from public.retention_claim_payment_attributions attribution
        join public.retention_claim_payment_reconciliations reconciliation
          on reconciliation.id =
            attribution.payment_reconciliation_id
        where attribution.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and reconciliation.id = (
            select current_reconciliation.id
            from public.retention_claim_payment_reconciliations
              current_reconciliation
            where current_reconciliation.retention_claim_id =
              attribution.retention_claim_id
              and current_reconciliation.projection_applied = true
            order by current_reconciliation.reconciliation_sequence desc
            limit 1
          )
      ) paid_attribution on true
      left join lateral (
        select jsonb_build_object(
          'id', c.id,
          'claimNumber', c.claim_number,
          'status', c.status,
          'issueDate', c.issue_date,
          'allocationAmount', a.allocation_amount
        ) as claim
        from public.retention_claim_allocations a
        join public.retention_claims c on c.id = a.retention_claim_id
        where a.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and c.status <> 'cancelled_draft'
        order by coalesce(c.submitted_at, c.created_at) desc, c.id desc
        limit 1
      ) latest_claim on true
      left join lateral (
        select
          coalesce(
            jsonb_agg(s.name order by s.schedule_sequence),
            '[]'::jsonb
          ) as names,
          (
            select min(nullif(schedule->>'eligibilityDate', '')::date)
            from jsonb_array_elements(
              coalesce(origin->'schedules', '[]'::jsonb)
            ) schedule
            where not coalesce(
              (schedule->>'currentlyEligible')::boolean,
              false
            )
          ) as next_eligibility_date
        from public.project_retention_schedule_origins so
        join public.project_retention_release_schedules s
          on s.id = so.schedule_id
        where so.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
          and s.status <> 'cancelled'
      ) schedule_names on true
      left join lateral (
        select jsonb_build_object(
          'id', v.id,
          'state', v.state,
          'severity', v.severity,
          'isBlocking', v.is_blocking,
          'primaryType', v.primary_type
        ) as current_variance
        from public.retention_variances v
        where v.originating_payment_claim_id =
          (origin->>'originatingPaymentClaimId')::uuid
        limit 1
      ) variance on true
      left join lateral (
        select jsonb_build_object(
          'id', c.id,
          'caseSequence', c.case_sequence,
          'status', c.status
        ) as current_case
        from public.retention_legacy_reconciliation_cases c
        where c.project_id = p_project_id
          and c.status in ('draft', 'in_review', 'approved')
        order by c.case_sequence desc
        limit 1
      ) legacy_case on true
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.retention_phase10_gate_enabled()
  from public, anon, authenticated;
revoke all on function private.retention_phase10_context(uuid, text)
  from public, anon, authenticated;

revoke all on function public.get_retention_claim_payment_state(uuid)
  from public, anon;
grant execute on function public.get_retention_claim_payment_state(uuid)
  to authenticated;
revoke all on function public.get_retention_claim_payment_manage_access(uuid)
  from public, anon;
grant execute on function
  public.get_retention_claim_payment_manage_access(uuid)
  to authenticated;

revoke all on function public.record_retention_claim_payment_reconciliation(
  uuid, text, uuid, uuid, text, boolean, numeric, numeric, numeric, numeric,
  numeric, text, text, timestamptz, timestamptz, uuid, uuid, text, text,
  text, jsonb, text
) from public, anon, authenticated;
grant execute on function
  public.record_retention_claim_payment_reconciliation(
    uuid, text, uuid, uuid, text, boolean, numeric, numeric, numeric, numeric,
    numeric, text, text, timestamptz, timestamptz, uuid, uuid, text, text,
    text, jsonb, text
  ) to service_role;

revoke all on function public.queue_retention_claim_payment_refresh(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.queue_retention_claim_payment_refresh(
  uuid, uuid, text
) to service_role;

commit;
