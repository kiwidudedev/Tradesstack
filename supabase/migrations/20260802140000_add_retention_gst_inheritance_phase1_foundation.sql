begin;

-- Phase 1 is an additive, dormant evidence foundation. Existing Retention
-- proposal, confirmation, queue, worker and Xero paths do not call these
-- objects and continue to use the version-one contracts unchanged.

create table public.organization_retention_tax_classifications_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.organization_projects(id) on delete restrict,
  originating_payment_claim_id uuid not null references public.project_claims(id) on delete restrict,
  xero_connection_id uuid not null
    references public.organization_xero_connections(id) on delete restrict,
  tenant_id text not null,
  currency_code text not null,
  tax_type text not null,
  effective_rate_basis_points integer not null,
  tax_rate_snapshot_id text null,
  tax_rate_name_snapshot text null,
  origin_retained_amount_minor bigint not null,
  origin_retained_tax_minor bigint not null,
  origin_retained_total_minor bigint not null,
  evidence_kind text not null,
  evidence_reference text not null,
  classification_reason text not null,
  evidence_snapshot jsonb not null,
  evidence_hash text not null,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  schema_version integer not null default 2,
  classification_sequence integer not null,
  supersedes_classification_id uuid null
    references public.organization_retention_tax_classifications_v2(id)
    on delete restrict,
  created_at timestamptz not null default now(),
  constraint retention_tax_classification_v2_origin_amount_check check (
    origin_retained_amount_minor <> 0
    and (
      origin_retained_tax_minor = 0
      or sign(origin_retained_amount_minor) = sign(origin_retained_tax_minor)
    )
    and origin_retained_total_minor =
      origin_retained_amount_minor + origin_retained_tax_minor
  ),
  constraint retention_tax_classification_v2_rate_check
    check (effective_rate_basis_points >= 0),
  constraint retention_tax_classification_v2_evidence_kind_check check (
    evidence_kind in ('submission_snapshot', 'reviewed_classification')
  ),
  constraint retention_tax_classification_v2_text_check check (
    char_length(trim(tenant_id)) > 0
    and char_length(trim(currency_code)) = 3
    and currency_code = upper(currency_code)
    and char_length(trim(tax_type)) > 0
    and tax_type = upper(tax_type)
    and char_length(trim(evidence_reference)) > 0
    and char_length(trim(classification_reason)) > 0
  ),
  constraint retention_tax_classification_v2_evidence_check check (
    jsonb_typeof(evidence_snapshot) = 'object'
    and nullif(trim(evidence_snapshot->>'accountCode'), '') is not null
    and evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint retention_tax_classification_v2_version_check check (
    schema_version = 2 and classification_sequence > 0
  ),
  constraint retention_tax_classification_v2_supersedes_unique
    unique (supersedes_classification_id),
  constraint retention_tax_classification_v2_sequence_unique
    unique (originating_payment_claim_id, classification_sequence),
  constraint retention_tax_classification_v2_org_id_unique
    unique (organization_id, id)
);

create unique index retention_tax_classification_v2_one_root_uidx
  on public.organization_retention_tax_classifications_v2(
    organization_id, project_id, originating_payment_claim_id
  ) where supersedes_classification_id is null;

create index retention_tax_classification_v2_origin_idx
  on public.organization_retention_tax_classifications_v2(
    organization_id, project_id, originating_payment_claim_id,
    classification_sequence desc
  );

create index retention_tax_classification_v2_connection_idx
  on public.organization_retention_tax_classifications_v2(
    organization_id, xero_connection_id, tenant_id
  );

create table public.organization_retention_release_allocation_ledger_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.organization_projects(id) on delete restrict,
  retention_claim_id uuid not null references public.retention_claims(id) on delete restrict,
  xero_connection_id uuid not null
    references public.organization_xero_connections(id) on delete restrict,
  tenant_id text not null,
  currency_code text not null,
  retention_accounting_document_id uuid not null
    references public.organization_accounting_documents(id) on delete restrict,
  retention_accounting_revision_id uuid not null
    references public.organization_accounting_document_revisions(id) on delete restrict,
  retention_accounting_revision_line_id uuid not null
    references public.organization_accounting_revision_lines(id) on delete restrict,
  originating_payment_claim_id uuid not null
    references public.project_claims(id) on delete restrict,
  origin_accounting_document_id uuid null
    references public.organization_accounting_documents(id) on delete restrict,
  origin_accounting_revision_id uuid null
    references public.organization_accounting_document_revisions(id) on delete restrict,
  origin_accounting_revision_line_id uuid null
    references public.organization_accounting_revision_lines(id) on delete restrict,
  legacy_tax_classification_id uuid null
    references public.organization_retention_tax_classifications_v2(id)
    on delete restrict,
  allocation_id uuid not null,
  allocation_sequence integer not null,
  evidence_kind text not null,
  tax_type text not null,
  tax_rate_snapshot_id text null,
  tax_rate_name_snapshot text null,
  effective_rate_basis_points integer not null,
  origin_account_code_snapshot text not null,
  origin_account_id_snapshot text null,
  origin_retained_amount_minor bigint not null,
  origin_retained_tax_minor bigint not null,
  origin_retained_total_minor bigint not null,
  released_amount_minor bigint not null,
  released_tax_minor bigint not null,
  released_total_minor bigint not null,
  reservation_state text not null,
  reservation_root_id uuid not null,
  reservation_sequence integer not null,
  supersedes_ledger_id uuid null
    references public.organization_retention_release_allocation_ledger_v2(id)
    on delete restrict,
  replacement_root_accounting_document_id uuid not null
    references public.organization_accounting_documents(id) on delete restrict,
  predecessor_retention_revision_id uuid null
    references public.organization_accounting_document_revisions(id)
    on delete restrict,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  system_actor text null,
  evidence_snapshot jsonb not null,
  evidence_hash text not null,
  schema_version integer not null default 2,
  created_at timestamptz not null default now(),
  constraint retention_release_ledger_v2_origin_amount_check check (
    origin_retained_amount_minor <> 0
    and (
      origin_retained_tax_minor = 0
      or sign(origin_retained_amount_minor) = sign(origin_retained_tax_minor)
    )
    and origin_retained_total_minor =
      origin_retained_amount_minor + origin_retained_tax_minor
  ),
  constraint retention_release_ledger_v2_release_amount_check check (
    released_amount_minor <> 0
    and (
      released_tax_minor = 0
      or sign(released_amount_minor) = sign(released_tax_minor)
    )
    and released_total_minor = released_amount_minor + released_tax_minor
    and abs(released_amount_minor) <= abs(origin_retained_amount_minor)
    and abs(released_tax_minor) <= abs(origin_retained_tax_minor)
  ),
  constraint retention_release_ledger_v2_rate_check
    check (effective_rate_basis_points >= 0),
  constraint retention_release_ledger_v2_evidence_kind_check check (
    evidence_kind in (
      'immutable_revision', 'exact_legacy_adoption',
      'submission_snapshot', 'reviewed_classification'
    )
  ),
  constraint retention_release_ledger_v2_modern_evidence_check check (
    (
      evidence_kind in ('immutable_revision', 'exact_legacy_adoption')
      and origin_accounting_document_id is not null
      and origin_accounting_revision_id is not null
      and origin_accounting_revision_line_id is not null
      and legacy_tax_classification_id is null
    )
    or (
      evidence_kind in ('submission_snapshot', 'reviewed_classification')
      and legacy_tax_classification_id is not null
    )
  ),
  constraint retention_release_ledger_v2_state_check check (
    reservation_state in (
      'pending', 'reserved', 'completed', 'cancelled', 'superseded'
    )
  ),
  constraint retention_release_ledger_v2_text_check check (
    char_length(trim(tenant_id)) > 0
    and char_length(trim(currency_code)) = 3
    and currency_code = upper(currency_code)
    and char_length(trim(tax_type)) > 0
    and tax_type = upper(tax_type)
    and char_length(trim(origin_account_code_snapshot)) > 0
  ),
  constraint retention_release_ledger_v2_actor_check check (
    (actor_user_id is not null and system_actor is null)
    or (actor_user_id is null and nullif(trim(system_actor), '') is not null)
  ),
  constraint retention_release_ledger_v2_evidence_check check (
    jsonb_typeof(evidence_snapshot) = 'object'
    and evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint retention_release_ledger_v2_version_check check (
    schema_version = 2
    and allocation_sequence > 0
    and reservation_sequence > 0
  ),
  constraint retention_release_ledger_v2_supersedes_unique
    unique (supersedes_ledger_id),
  constraint retention_release_ledger_v2_root_sequence_unique
    unique (reservation_root_id, reservation_sequence),
  constraint retention_release_ledger_v2_revision_allocation_state_unique
    unique (
      retention_accounting_revision_id, allocation_id,
      reservation_sequence
    ),
  constraint retention_release_ledger_v2_org_id_unique
    unique (organization_id, id)
);

create index retention_release_ledger_v2_origin_line_idx
  on public.organization_retention_release_allocation_ledger_v2(
    origin_accounting_revision_line_id, created_at, id
  ) where origin_accounting_revision_line_id is not null;

create index retention_release_ledger_v2_origin_claim_idx
  on public.organization_retention_release_allocation_ledger_v2(
    organization_id, project_id, originating_payment_claim_id,
    reservation_state, created_at, id
  );

create index retention_release_ledger_v2_retention_revision_idx
  on public.organization_retention_release_allocation_ledger_v2(
    retention_accounting_revision_id, allocation_sequence, created_at, id
  );

create index retention_release_ledger_v2_active_reservation_idx
  on public.organization_retention_release_allocation_ledger_v2(
    organization_id, originating_payment_claim_id, reservation_state,
    created_at, id
  ) where reservation_state in ('pending', 'reserved');

create index retention_release_ledger_v2_supersession_idx
  on public.organization_retention_release_allocation_ledger_v2(
    supersedes_ledger_id
  ) where supersedes_ledger_id is not null;

create or replace function private.validate_retention_tax_classification_v2()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_previous public.organization_retention_tax_classifications_v2%rowtype;
begin
  if not exists (
    select 1 from public.organization_projects project
    where project.id = new.project_id
      and project.organization_id = new.organization_id
  ) or not exists (
    select 1 from public.project_claims claim
    where claim.id = new.originating_payment_claim_id
      and claim.organization_id = new.organization_id
      and claim.project_id = new.project_id
  ) or not exists (
    select 1 from public.organization_xero_connections connection
    where connection.id = new.xero_connection_id
      and connection.organization_id = new.organization_id
      and connection.tenant_id = new.tenant_id
  ) then
    raise exception 'Retention tax classification scope is inconsistent.'
      using errcode = '23514';
  end if;

  if new.supersedes_classification_id is null then
    if new.classification_sequence <> 1 then
      raise exception 'Initial Retention tax classification sequence must be one.'
        using errcode = '23514';
    end if;
  else
    select * into v_previous
    from public.organization_retention_tax_classifications_v2
    where id = new.supersedes_classification_id
    for update;
    if not found
      or v_previous.organization_id <> new.organization_id
      or v_previous.project_id <> new.project_id
      or v_previous.originating_payment_claim_id <>
        new.originating_payment_claim_id
      or v_previous.classification_sequence + 1 <>
        new.classification_sequence then
      raise exception 'Retention tax classification supersession is invalid.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_retention_release_ledger_v2()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_previous public.organization_retention_release_allocation_ledger_v2%rowtype;
  v_existing_amount bigint;
  v_existing_tax bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(new.originating_payment_claim_id::text, 2814)
  );

  if not exists (
    select 1 from public.organization_projects project
    where project.id = new.project_id
      and project.organization_id = new.organization_id
  ) or not exists (
    select 1 from public.retention_claims claim
    where claim.id = new.retention_claim_id
      and claim.organization_id = new.organization_id
      and claim.project_id = new.project_id
  ) or not exists (
    select 1 from public.project_claims claim
    where claim.id = new.originating_payment_claim_id
      and claim.organization_id = new.organization_id
      and claim.project_id = new.project_id
  ) or not exists (
    select 1 from public.organization_xero_connections connection
    where connection.id = new.xero_connection_id
      and connection.organization_id = new.organization_id
      and connection.tenant_id = new.tenant_id
  ) then
    raise exception 'Retention release allocation scope is inconsistent.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.organization_accounting_documents document
    join public.organization_accounting_document_revisions revision
      on revision.id = new.retention_accounting_revision_id
     and revision.accounting_document_id = document.id
     and revision.organization_id = new.organization_id
     and revision.project_id = new.project_id
     and revision.connection_id = new.xero_connection_id
     and revision.tenant_id = new.tenant_id
    join public.organization_accounting_revision_lines line
      on line.id = new.retention_accounting_revision_line_id
     and line.organization_id = new.organization_id
     and line.accounting_revision_id = revision.id
     and line.line_kind = 'retention'
     and line.originating_payment_claim_id =
       new.originating_payment_claim_id
     and line.line_amount_minor = new.released_amount_minor
     and line.tax_minor = new.released_tax_minor
     and line.total_minor = new.released_total_minor
     and line.tax_snapshot->>'taxType' = new.tax_type
    where document.id = new.retention_accounting_document_id
      and document.organization_id = new.organization_id
      and document.retention_claim_id = new.retention_claim_id
      and document.local_document_type = 'retention_claim'
      and document.provider = 'xero'
  ) then
    raise exception 'Retention release accounting evidence is inconsistent.'
      using errcode = '23514';
  end if;

  if new.evidence_kind in ('immutable_revision', 'exact_legacy_adoption') then
    if not exists (
      select 1
      from public.organization_accounting_documents document
      join public.organization_accounting_document_revisions revision
        on revision.id = new.origin_accounting_revision_id
       and revision.accounting_document_id = document.id
       and revision.organization_id = new.organization_id
       and revision.project_id = new.project_id
       and revision.connection_id = new.xero_connection_id
       and revision.tenant_id = new.tenant_id
      join public.organization_accounting_revision_lines line
        on line.id = new.origin_accounting_revision_line_id
       and line.organization_id = new.organization_id
       and line.accounting_revision_id = revision.id
       and line.line_kind = 'retention'
       and line.originating_payment_claim_id =
         new.originating_payment_claim_id
       and line.line_amount_minor = new.origin_retained_amount_minor
       and line.tax_minor = new.origin_retained_tax_minor
       and line.total_minor = new.origin_retained_total_minor
       and line.tax_snapshot->>'taxType' = new.tax_type
       and line.account_snapshot->>'accountCode' =
         new.origin_account_code_snapshot
      where document.id = new.origin_accounting_document_id
        and document.organization_id = new.organization_id
        and document.project_claim_id = new.originating_payment_claim_id
        and document.local_document_type = 'project_claim'
        and document.provider = 'xero'
        and (
          (
            new.evidence_kind = 'immutable_revision'
            and revision.revision_intent <> 'legacy_import'
          )
          or (
            new.evidence_kind = 'exact_legacy_adoption'
            and revision.revision_intent = 'legacy_import'
          )
        )
        and coalesce(revision.tax_snapshot->>'effectiveRate', '')
          ~ '^[0-9]+(?:\.[0-9]+)?$'
        and round(
          (revision.tax_snapshot->>'effectiveRate')::numeric * 100
        )::integer = new.effective_rate_basis_points
    ) then
      raise exception 'Origin Retention accounting evidence is inconsistent.'
        using errcode = '23514';
    end if;
  elsif not exists (
    select 1
    from public.organization_retention_tax_classifications_v2 classification
    where classification.id = new.legacy_tax_classification_id
      and classification.organization_id = new.organization_id
      and classification.project_id = new.project_id
      and classification.originating_payment_claim_id =
        new.originating_payment_claim_id
      and classification.xero_connection_id = new.xero_connection_id
      and classification.tenant_id = new.tenant_id
      and classification.currency_code = new.currency_code
      and classification.tax_type = new.tax_type
      and classification.effective_rate_basis_points =
        new.effective_rate_basis_points
      and classification.evidence_kind = new.evidence_kind
      and classification.tax_rate_snapshot_id is not distinct from
        new.tax_rate_snapshot_id
      and classification.origin_retained_amount_minor =
        new.origin_retained_amount_minor
      and classification.origin_retained_tax_minor =
        new.origin_retained_tax_minor
      and classification.origin_retained_total_minor =
        new.origin_retained_total_minor
  ) then
    raise exception 'Reviewed Retention tax classification is inconsistent.'
      using errcode = '23514';
  end if;

  if new.supersedes_ledger_id is null then
    if new.reservation_sequence <> 1
      or new.reservation_root_id <> new.id then
      raise exception 'Initial Retention release reservation identity is invalid.'
        using errcode = '23514';
    end if;
  else
    select * into v_previous
    from public.organization_retention_release_allocation_ledger_v2
    where id = new.supersedes_ledger_id
    for update;
    if not found
      or v_previous.organization_id <> new.organization_id
      or v_previous.project_id <> new.project_id
      or v_previous.originating_payment_claim_id <>
        new.originating_payment_claim_id
      or v_previous.allocation_id <> new.allocation_id
      or v_previous.reservation_root_id <> new.reservation_root_id
      or v_previous.reservation_sequence + 1 <> new.reservation_sequence then
      raise exception 'Retention release reservation supersession is invalid.'
        using errcode = '23514';
    end if;
  end if;

  if new.reservation_state in ('pending', 'reserved', 'completed') then
    select
      coalesce(sum(abs(existing.released_amount_minor)), 0),
      coalesce(sum(abs(existing.released_tax_minor)), 0)
    into v_existing_amount, v_existing_tax
    from public.organization_retention_release_allocation_ledger_v2 existing
    where existing.organization_id = new.organization_id
      and existing.project_id = new.project_id
      and existing.originating_payment_claim_id =
        new.originating_payment_claim_id
      and existing.reservation_state in ('pending', 'reserved', 'completed')
      and existing.id is distinct from new.supersedes_ledger_id
      and not exists (
        select 1
        from public.organization_retention_release_allocation_ledger_v2 successor
        where successor.supersedes_ledger_id = existing.id
      );

    if v_existing_amount + abs(new.released_amount_minor) >
        abs(new.origin_retained_amount_minor)
      or v_existing_tax + abs(new.released_tax_minor) >
        abs(new.origin_retained_tax_minor) then
      raise exception 'Retention release reservation exceeds origin capacity.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_retention_tax_classification_v2
before insert on public.organization_retention_tax_classifications_v2
for each row execute function private.validate_retention_tax_classification_v2();

create trigger reject_retention_tax_classification_v2_mutation
before update or delete on public.organization_retention_tax_classifications_v2
for each row execute function public.reject_phase2a_append_only_mutation();

create trigger validate_retention_release_ledger_v2
before insert on public.organization_retention_release_allocation_ledger_v2
for each row execute function private.validate_retention_release_ledger_v2();

create trigger reject_retention_release_ledger_v2_mutation
before update or delete on public.organization_retention_release_allocation_ledger_v2
for each row execute function public.reject_phase2a_append_only_mutation();

create or replace function private.master_retention_claim_source_v2(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions
as $$
declare
  v_v1 jsonb;
  v_allocation jsonb;
  v_origin_id uuid;
  v_origin public.project_claims%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_line public.organization_accounting_revision_lines%rowtype;
  v_classification public.organization_retention_tax_classifications_v2%rowtype;
  v_document_count integer;
  v_line_count integer;
  v_classification_count integer;
  v_tax_rate_count integer;
  v_blocker text;
  v_evidence_kind text;
  v_connection_id uuid;
  v_tenant_id text;
  v_currency_code text;
  v_tax_type text;
  v_tax_rate_snapshot_id text;
  v_tax_rate_name_snapshot text;
  v_effective_rate_basis_points integer;
  v_origin_amount bigint;
  v_origin_tax bigint;
  v_origin_total bigint;
  v_account_code text;
  v_account_id text;
  v_released_amount bigint;
  v_released_tax bigint;
  v_reserved_amount bigint;
  v_reserved_tax bigint;
  v_evidence jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  v_v1 := private.master_retention_claim_source(p_retention_claim_id);
  if v_v1 is null then
    return null;
  end if;

  for v_allocation in
    select value from jsonb_array_elements(v_v1->'allocations')
  loop
    v_origin_id := (v_allocation->>'originatingPaymentClaimId')::uuid;
    select * into v_origin from public.project_claims where id = v_origin_id;
    v_blocker := null;
    v_evidence_kind := null;
    v_document := null;
    v_revision := null;
    v_line := null;
    v_classification := null;
    v_connection_id := null;
    v_tenant_id := null;
    v_currency_code := null;
    v_tax_type := null;
    v_tax_rate_snapshot_id := null;
    v_tax_rate_name_snapshot := null;
    v_effective_rate_basis_points := null;
    v_origin_amount := null;
    v_origin_tax := null;
    v_origin_total := null;
    v_account_code := null;
    v_account_id := null;

    select count(*)::integer into v_document_count
    from public.organization_accounting_documents document
    join public.organization_accounting_document_revisions revision
      on revision.id = document.active_accounting_revision_id
     and revision.organization_id = document.organization_id
     and revision.accounting_document_id = document.id
     and revision.lifecycle_state = 'succeeded'
     and revision.source_document_type = 'project_claim'
     and revision.source_document_id = v_origin_id
    where document.organization_id = v_origin.organization_id
      and document.project_claim_id = v_origin_id
      and document.local_document_type = 'project_claim'
      and document.provider = 'xero'
      and document.integration_contract = 'payment_claim_revision_v1';

    if v_document_count > 1 then
      v_blocker := 'origin_revision_ambiguous';
    elsif v_document_count = 1 then
      select document.*
      into v_document
      from public.organization_accounting_documents document
      join public.organization_accounting_document_revisions revision
        on revision.id = document.active_accounting_revision_id
       and revision.organization_id = document.organization_id
       and revision.accounting_document_id = document.id
       and revision.lifecycle_state = 'succeeded'
       and revision.source_document_type = 'project_claim'
       and revision.source_document_id = v_origin_id
      where document.organization_id = v_origin.organization_id
        and document.project_claim_id = v_origin_id
        and document.local_document_type = 'project_claim'
        and document.provider = 'xero'
        and document.integration_contract = 'payment_claim_revision_v1'
      limit 1;

      select revision.* into v_revision
      from public.organization_accounting_document_revisions revision
      where revision.id = v_document.active_accounting_revision_id
        and revision.organization_id = v_document.organization_id
        and revision.accounting_document_id = v_document.id
        and revision.lifecycle_state = 'succeeded';

      select count(*)::integer into v_line_count
      from public.organization_accounting_revision_lines line
      where line.organization_id = v_origin.organization_id
        and line.accounting_revision_id = v_revision.id
        and line.line_kind = 'retention'
        and line.originating_payment_claim_id = v_origin_id;

      if v_line_count = 0 then
        v_blocker := 'origin_retention_line_missing';
      elsif v_line_count > 1 then
        v_blocker := 'origin_retention_line_ambiguous';
      else
        select * into v_line
        from public.organization_accounting_revision_lines line
        where line.organization_id = v_origin.organization_id
          and line.accounting_revision_id = v_revision.id
          and line.line_kind = 'retention'
          and line.originating_payment_claim_id = v_origin_id;

        v_evidence_kind := case
          when v_revision.revision_intent = 'legacy_import'
            then 'exact_legacy_adoption'
          else 'immutable_revision'
        end;
        v_connection_id := v_revision.connection_id;
        v_tenant_id := v_revision.tenant_id;
        v_currency_code := v_revision.currency_code;
        v_tax_type := nullif(trim(v_line.tax_snapshot->>'taxType'), '');
        v_tax_rate_snapshot_id := nullif(
          trim(v_revision.tax_snapshot->>'taxRateId'), ''
        );
        v_tax_rate_name_snapshot := coalesce(
          nullif(trim(v_revision.tax_snapshot->>'name'), ''),
          nullif(trim(v_revision.tax_snapshot->>'taxRateName'), '')
        );
        if coalesce(v_revision.tax_snapshot->>'effectiveRate', '')
          ~ '^[0-9]+(?:\.[0-9]+)?$' then
          v_effective_rate_basis_points := round(
            (v_revision.tax_snapshot->>'effectiveRate')::numeric * 100
          )::integer;
        end if;
        v_origin_amount := v_line.line_amount_minor;
        v_origin_tax := v_line.tax_minor;
        v_origin_total := v_line.total_minor;
        v_account_code := nullif(
          trim(v_line.account_snapshot->>'accountCode'), ''
        );
        v_account_id := nullif(
          trim(v_revision.routing_snapshot#>>'{retention,accountId}'), ''
        );

        if v_line.line_amount_minor >= 0
          or v_line.total_minor <>
            v_line.line_amount_minor + v_line.tax_minor
          or (
            v_line.tax_minor <> 0
            and sign(v_line.line_amount_minor) <> sign(v_line.tax_minor)
          )
          or v_account_code is null
          or coalesce(v_revision.routing_snapshot#>>'{retention,route}', '')
            <> '700'
          or nullif(trim(
            v_revision.routing_snapshot#>>'{retention,accountCode}'
          ), '') is distinct from v_account_code then
          v_blocker := 'origin_retention_line_invalid';
        elsif abs(v_line.line_amount_minor) <>
          round((v_allocation->>'allocationAmount')::numeric * 100)::bigint then
          v_blocker := 'origin_amount_mismatch';
        elsif v_tax_type is null
          or v_effective_rate_basis_points is null then
          v_blocker := 'origin_tax_evidence_missing';
        end if;
      end if;
    else
      select count(*)::integer into v_classification_count
      from public.organization_retention_tax_classifications_v2 classification
      where classification.organization_id = v_origin.organization_id
        and classification.project_id = v_origin.project_id
        and classification.originating_payment_claim_id = v_origin_id
        and not exists (
          select 1
          from public.organization_retention_tax_classifications_v2 successor
          where successor.supersedes_classification_id = classification.id
        );

      if v_classification_count > 1 then
        v_blocker := 'legacy_tax_classification_ambiguous';
      elsif v_classification_count = 0 then
        v_blocker := 'origin_revision_missing';
      else
        select * into v_classification
        from public.organization_retention_tax_classifications_v2 classification
        where classification.organization_id = v_origin.organization_id
          and classification.project_id = v_origin.project_id
          and classification.originating_payment_claim_id = v_origin_id
          and not exists (
            select 1
            from public.organization_retention_tax_classifications_v2 successor
            where successor.supersedes_classification_id = classification.id
          );
        v_evidence_kind := v_classification.evidence_kind;
        v_connection_id := v_classification.xero_connection_id;
        v_tenant_id := v_classification.tenant_id;
        v_currency_code := v_classification.currency_code;
        v_tax_type := v_classification.tax_type;
        v_tax_rate_snapshot_id := v_classification.tax_rate_snapshot_id;
        v_tax_rate_name_snapshot := v_classification.tax_rate_name_snapshot;
        v_effective_rate_basis_points :=
          v_classification.effective_rate_basis_points;
        v_origin_amount := v_classification.origin_retained_amount_minor;
        v_origin_tax := v_classification.origin_retained_tax_minor;
        v_origin_total := v_classification.origin_retained_total_minor;
        v_account_code := nullif(
          trim(v_classification.evidence_snapshot->>'accountCode'), ''
        );
        v_account_id := nullif(
          trim(v_classification.evidence_snapshot->>'accountId'), ''
        );
        if abs(v_origin_amount) <>
          round((v_allocation->>'allocationAmount')::numeric * 100)::bigint then
          v_blocker := 'origin_amount_mismatch';
        end if;
      end if;
    end if;

    if v_blocker is null then
      select count(*)::integer into v_tax_rate_count
      from public.organization_accounting_tax_rates tax_rate
      where tax_rate.organization_id = v_origin.organization_id
        and tax_rate.provider = 'xero'
        and tax_rate.accounting_connection_id = v_connection_id
        and tax_rate.tenant_id = v_tenant_id
        and tax_rate.is_active
        and upper(tax_rate.status) = 'ACTIVE'
        and upper(tax_rate.tax_type) = upper(v_tax_type);
      if v_tax_rate_count = 0 then
        v_blocker := 'origin_tax_type_unavailable';
      elsif v_tax_rate_count > 1 then
        v_blocker := 'origin_tax_identity_ambiguous';
      end if;
    end if;

    select
      coalesce(sum(abs(ledger.released_amount_minor)) filter (
        where ledger.reservation_state = 'completed'
      ), 0),
      coalesce(sum(abs(ledger.released_tax_minor)) filter (
        where ledger.reservation_state = 'completed'
      ), 0),
      coalesce(sum(abs(ledger.released_amount_minor)) filter (
        where ledger.reservation_state in ('pending', 'reserved')
      ), 0),
      coalesce(sum(abs(ledger.released_tax_minor)) filter (
        where ledger.reservation_state in ('pending', 'reserved')
      ), 0)
    into v_released_amount, v_released_tax, v_reserved_amount, v_reserved_tax
    from public.organization_retention_release_allocation_ledger_v2 ledger
    where ledger.organization_id = v_origin.organization_id
      and ledger.project_id = v_origin.project_id
      and ledger.originating_payment_claim_id = v_origin_id
      and not exists (
        select 1
        from public.organization_retention_release_allocation_ledger_v2 successor
        where successor.supersedes_ledger_id = ledger.id
      );

    v_evidence := jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 2,
      'status', case when v_blocker is null then 'resolved' else 'blocked' end,
      'blockerCode', v_blocker,
      'originatingPaymentClaimId', v_origin_id,
      'effectiveOriginAccountingDocumentId', v_document.id,
      'effectiveOriginRevisionId', v_revision.id,
      'originRevisionSequence', v_revision.revision_sequence,
      'originRetentionRevisionLineId', v_line.id,
      'originProviderInvoiceId', v_revision.external_document_id,
      'originPredecessorRevisionId', v_revision.previous_revision_id,
      'replacementRootAccountingDocumentId', v_document.id,
      'legacyTaxClassificationId', v_classification.id,
      'evidenceKind', v_evidence_kind,
      'originAmountMinor', v_origin_amount,
      'originTaxMinor', v_origin_tax,
      'originTotalMinor', v_origin_total,
      'taxType', v_tax_type,
      'taxRateSnapshotId', v_tax_rate_snapshot_id,
      'taxRateNameSnapshot', v_tax_rate_name_snapshot,
      'effectiveRateBasisPoints', v_effective_rate_basis_points,
      'originAccountCodeSnapshot', v_account_code,
      'originAccountIdSnapshot', v_account_id,
      'currencyCode', v_currency_code,
      'xeroConnectionId', v_connection_id,
      'tenantId', v_tenant_id,
      'releasedToDateAmountMinor', v_released_amount,
      'releasedToDateTaxMinor', v_released_tax,
      'reservedAmountMinor', v_reserved_amount,
      'reservedTaxMinor', v_reserved_tax
    ));
    v_evidence := v_evidence || jsonb_build_object(
      'evidenceHash', encode(digest(convert_to(
        v_evidence::text, 'UTF8'
      ), 'sha256'), 'hex')
    );
    v_result := v_result || jsonb_build_array(v_allocation || v_evidence);
  end loop;

  return jsonb_build_object(
    'schemaVersion', 2,
    'readOnly', true,
    'claim', v_v1->'claim',
    'allocations', v_result
  );
end;
$$;

alter table public.organization_retention_tax_classifications_v2
  enable row level security;
alter table public.organization_retention_tax_classifications_v2
  force row level security;
alter table public.organization_retention_release_allocation_ledger_v2
  enable row level security;
alter table public.organization_retention_release_allocation_ledger_v2
  force row level security;

create policy "Retention accounting viewers can read v2 tax classifications"
on public.organization_retention_tax_classifications_v2
for select to authenticated
using (
  public.has_org_permission(organization_id, 'retention.claims.xero.view')
  and exists (
    select 1 from public.organization_projects project
    where project.id =
      organization_retention_tax_classifications_v2.project_id
      and project.organization_id =
        organization_retention_tax_classifications_v2.organization_id
  )
);

create policy "Retention accounting viewers can read v2 release evidence"
on public.organization_retention_release_allocation_ledger_v2
for select to authenticated
using (
  public.has_org_permission(organization_id, 'retention.claims.xero.view')
  and exists (
    select 1 from public.organization_projects project
    where project.id =
      organization_retention_release_allocation_ledger_v2.project_id
      and project.organization_id =
        organization_retention_release_allocation_ledger_v2.organization_id
  )
);

revoke all on
  public.organization_retention_tax_classifications_v2,
  public.organization_retention_release_allocation_ledger_v2
from public, anon, authenticated, service_role;

grant select on
  public.organization_retention_tax_classifications_v2,
  public.organization_retention_release_allocation_ledger_v2
to authenticated;

grant select, insert on
  public.organization_retention_tax_classifications_v2,
  public.organization_retention_release_allocation_ledger_v2
to service_role;

revoke all on function
  private.validate_retention_tax_classification_v2(),
  private.validate_retention_release_ledger_v2(),
  private.master_retention_claim_source_v2(uuid)
from public, anon, authenticated;

grant execute on function private.master_retention_claim_source_v2(uuid)
to service_role;

commit;
