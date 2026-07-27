begin;

-- Phase 2A is an additive, dormant accounting evidence foundation. Nothing in
-- this migration is called by the current Xero routes, workers, polling, or UI.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_accounting_documents_org_id_unique'
      and conrelid = 'public.organization_accounting_documents'::regclass
  ) then
    alter table public.organization_accounting_documents
      add constraint organization_accounting_documents_org_id_unique
      unique (organization_id, id);
  end if;
end;
$$;

create table public.organization_accounting_number_counters (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null,
  tenant_id text not null,
  document_class text not null,
  last_sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider, tenant_id, document_class),
  constraint accounting_number_counter_provider_check
    check (char_length(trim(provider)) > 0),
  constraint accounting_number_counter_tenant_check
    check (char_length(trim(tenant_id)) > 0),
  constraint accounting_number_counter_class_check
    check (document_class = 'sales_invoice'),
  constraint accounting_number_counter_sequence_check check (last_sequence >= 0)
);

create table public.organization_accounting_number_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null,
  tenant_id text not null,
  document_class text not null,
  sequence_number bigint not null,
  formatted_number text not null,
  accounting_document_id uuid null,
  source_document_type text not null,
  source_document_id uuid not null,
  reservation_reason text not null,
  reserved_by uuid not null references auth.users(id) on delete restrict,
  reserved_at timestamptz not null default now(),
  constraint accounting_number_reservation_document_fkey
    foreign key (organization_id, accounting_document_id)
    references public.organization_accounting_documents(organization_id, id)
    on delete restrict,
  constraint accounting_number_reservation_class_check
    check (document_class = 'sales_invoice'),
  constraint accounting_number_reservation_source_check
    check (source_document_type in ('project_claim', 'retention_claim')),
  constraint accounting_number_reservation_sequence_check check (sequence_number > 0),
  constraint accounting_number_reservation_number_check
    check (formatted_number ~ '^TSI-[0-9]{8,}$'),
  constraint accounting_number_reservation_text_check check (
    char_length(trim(provider)) > 0
    and char_length(trim(tenant_id)) > 0
    and char_length(trim(reservation_reason)) > 0
  ),
  constraint accounting_number_reservation_sequence_unique
    unique (organization_id, provider, tenant_id, document_class, sequence_number),
  constraint accounting_number_reservation_formatted_unique
    unique (organization_id, provider, tenant_id, formatted_number)
);

create table public.organization_accounting_document_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid null,
  accounting_document_id uuid not null,
  revision_sequence bigint not null,
  source_document_type text not null,
  source_document_id uuid not null,
  revision_intent text not null,
  resolution_strategy text not null,
  previous_revision_id uuid null,
  provider text not null,
  connection_id uuid not null
    references public.organization_xero_connections(id) on delete restrict,
  tenant_id text not null,
  number_reservation_id uuid null
    references public.organization_accounting_number_reservations(id) on delete restrict,
  external_document_id text null,
  external_document_number text not null,
  commercial_snapshot jsonb not null,
  contact_snapshot jsonb not null,
  routing_snapshot jsonb not null,
  tax_snapshot jsonb not null,
  attachment_snapshot jsonb not null,
  payload_snapshot jsonb not null,
  canonical_schema_version text not null,
  source_evidence_hash text not null,
  commercial_hash text not null,
  lines_hash text not null,
  payload_hash text not null,
  provider_content_hash text not null,
  pdf_hash text null,
  currency_code text not null,
  provider_document_type text not null,
  requested_provider_status text not null,
  line_amount_type text not null,
  subtotal_minor bigint not null,
  tax_minor bigint not null,
  total_minor bigint not null,
  confirmation_preview_hash text not null,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null,
  confirmation_reason text null,
  lifecycle_state text not null default 'confirmed',
  succeeded_at timestamptz null,
  activated_at timestamptz null,
  superseded_at timestamptz null,
  superseded_by_revision_id uuid null,
  failure_code text null,
  failure_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_revision_document_fkey
    foreign key (organization_id, accounting_document_id)
    references public.organization_accounting_documents(organization_id, id)
    on delete restrict,
  constraint accounting_revision_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects(organization_id, id)
    on delete restrict,
  constraint accounting_revision_previous_fkey
    foreign key (previous_revision_id)
    references public.organization_accounting_document_revisions(id)
    on delete restrict,
  constraint accounting_revision_superseded_by_fkey
    foreign key (superseded_by_revision_id)
    references public.organization_accounting_document_revisions(id)
    on delete restrict,
  constraint accounting_revision_sequence_unique
    unique (accounting_document_id, revision_sequence),
  constraint accounting_revision_org_id_unique unique (organization_id, id),
  constraint accounting_revision_hash_unique
    unique (accounting_document_id, source_evidence_hash),
  constraint accounting_revision_sequence_check check (revision_sequence > 0),
  constraint accounting_revision_source_check
    check (source_document_type in ('supplier_invoice', 'project_claim', 'retention_claim')),
  constraint accounting_revision_intent_check check (
    revision_intent in (
      'initial_push', 'direct_update', 'amendment', 'credit',
      'void_and_replace', 'replacement', 'legacy_import'
    )
  ),
  constraint accounting_revision_resolution_check check (
    resolution_strategy in (
      'new_document', 'update_existing', 'amendment', 'credit',
      'void_and_replace', 'replacement', 'legacy_preservation'
    )
  ),
  constraint accounting_revision_snapshot_objects_check check (
    jsonb_typeof(commercial_snapshot) = 'object'
    and jsonb_typeof(contact_snapshot) = 'object'
    and jsonb_typeof(routing_snapshot) = 'object'
    and jsonb_typeof(tax_snapshot) = 'object'
    and jsonb_typeof(attachment_snapshot) = 'object'
    and jsonb_typeof(payload_snapshot) = 'object'
  ),
  constraint accounting_revision_hashes_check check (
    source_evidence_hash ~ '^[a-f0-9]{64}$'
    and commercial_hash ~ '^[a-f0-9]{64}$'
    and lines_hash ~ '^[a-f0-9]{64}$'
    and payload_hash ~ '^[a-f0-9]{64}$'
    and provider_content_hash ~ '^[a-f0-9]{64}$'
    and (pdf_hash is null or pdf_hash ~ '^[a-f0-9]{64}$')
    and confirmation_preview_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint accounting_revision_provider_contract_check check (
    provider <> 'xero'
    or (
      provider_document_type = 'ACCREC'
      and requested_provider_status = 'AUTHORISED'
    )
  ),
  constraint accounting_revision_text_check check (
    char_length(trim(provider)) > 0
    and char_length(trim(tenant_id)) > 0
    and char_length(trim(external_document_number)) > 0
    and char_length(trim(canonical_schema_version)) > 0
    and char_length(trim(currency_code)) = 3
    and char_length(trim(line_amount_type)) > 0
  ),
  constraint accounting_revision_amounts_check check (
    subtotal_minor >= 0
    and tax_minor >= 0
    and total_minor = subtotal_minor + tax_minor
  ),
  constraint accounting_revision_lifecycle_check check (
    lifecycle_state in (
      'confirmed', 'queued', 'processing', 'succeeded',
      'failed', 'attention_required', 'superseded'
    )
  ),
  constraint accounting_revision_confirmation_check check (
    confirmed_at <= created_at
    and (confirmation_reason is null or char_length(trim(confirmation_reason)) > 0)
  ),
  constraint accounting_revision_success_shape_check check (
    (lifecycle_state in ('succeeded', 'superseded') and succeeded_at is not null)
    or (lifecycle_state not in ('succeeded', 'superseded'))
  ),
  constraint accounting_revision_supersession_shape_check check (
    (
      lifecycle_state = 'superseded'
      and superseded_at is not null
      and superseded_by_revision_id is not null
    )
    or (
      lifecycle_state <> 'superseded'
      and superseded_at is null
      and superseded_by_revision_id is null
    )
  )
);

create table public.organization_accounting_revision_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_revision_id uuid not null
    references public.organization_accounting_document_revisions(id) on delete restrict,
  sequence integer not null,
  line_kind text not null,
  source_line_type text not null,
  source_line_id uuid null,
  originating_payment_claim_id uuid null,
  description text not null,
  quantity numeric(20,6) not null,
  unit_amount_minor bigint not null,
  line_amount_minor bigint not null,
  tax_minor bigint not null,
  total_minor bigint not null,
  account_snapshot jsonb not null,
  tax_snapshot jsonb not null,
  tracking_snapshot jsonb not null,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint accounting_revision_line_sequence_unique
    unique (accounting_revision_id, sequence),
  constraint accounting_revision_line_sequence_check check (sequence > 0),
  constraint accounting_revision_line_kind_check
    check (line_kind in ('claim', 'retention', 'adjustment', 'credit')),
  constraint accounting_revision_line_source_check
    check (char_length(trim(source_line_type)) > 0),
  constraint accounting_revision_line_amounts_check check (
    quantity >= 0
    and line_amount_minor >= 0
    and tax_minor >= 0
    and total_minor = line_amount_minor + tax_minor
  ),
  constraint accounting_revision_line_text_check
    check (char_length(trim(description)) > 0),
  constraint accounting_revision_line_snapshots_check check (
    jsonb_typeof(account_snapshot) = 'object'
    and jsonb_typeof(tax_snapshot) = 'object'
    and jsonb_typeof(tracking_snapshot) = 'object'
    and jsonb_typeof(source_snapshot) = 'object'
  )
);

create table public.organization_accounting_revision_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_revision_id uuid not null
    references public.organization_accounting_document_revisions(id) on delete restrict,
  attachment_sequence integer not null,
  attachment_kind text not null,
  source_document_id uuid null,
  filename text not null,
  content_type text not null,
  byte_size bigint not null,
  content_sha256 text not null,
  storage_bucket text not null,
  storage_path text not null,
  upload_state text not null default 'pending',
  provider_attachment_id text null,
  uploaded_at timestamptz null,
  failure_code text null,
  failure_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_revision_attachment_sequence_unique
    unique (accounting_revision_id, attachment_sequence),
  constraint accounting_revision_attachment_sequence_check
    check (attachment_sequence > 0),
  constraint accounting_revision_attachment_kind_check
    check (attachment_kind in ('claim_pdf', 'supporting_document')),
  constraint accounting_revision_attachment_hash_check
    check (content_sha256 ~ '^[a-f0-9]{64}$'),
  constraint accounting_revision_attachment_size_check check (byte_size >= 0),
  constraint accounting_revision_attachment_state_check
    check (upload_state in ('pending', 'uploading', 'uploaded', 'failed')),
  constraint accounting_revision_attachment_result_shape_check check (
    (
      upload_state = 'uploaded'
      and nullif(trim(provider_attachment_id), '') is not null
      and uploaded_at is not null
      and failure_code is null
      and failure_message is null
    )
    or (
      upload_state = 'failed'
      and nullif(trim(failure_code), '') is not null
      and uploaded_at is null
    )
    or (
      upload_state in ('pending', 'uploading')
      and provider_attachment_id is null
      and uploaded_at is null
      and failure_code is null
      and failure_message is null
    )
  ),
  constraint accounting_revision_attachment_text_check check (
    char_length(trim(filename)) > 0
    and char_length(trim(content_type)) > 0
    and char_length(trim(storage_bucket)) > 0
    and char_length(trim(storage_path)) > 0
  )
);

create table public.organization_accounting_revision_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_revision_id uuid not null
    references public.organization_accounting_document_revisions(id) on delete restrict,
  attempt_sequence integer not null,
  attempt_intent text not null,
  queue_state text not null default 'queued',
  idempotency_key text not null,
  request_evidence jsonb not null,
  response_evidence jsonb null,
  worker_id text null,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  heartbeat_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  outcome_code text null,
  outcome_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_revision_attempt_sequence_unique
    unique (accounting_revision_id, attempt_sequence),
  constraint accounting_revision_attempt_idempotency_unique unique (idempotency_key),
  constraint accounting_revision_attempt_sequence_check check (attempt_sequence > 0),
  constraint accounting_revision_attempt_intent_check check (
    attempt_intent in ('create', 'update', 'amend', 'credit', 'void', 'replace', 'attach')
  ),
  constraint accounting_revision_attempt_state_check check (
    queue_state in ('queued', 'claimed', 'succeeded', 'failed', 'attention_required')
  ),
  constraint accounting_revision_attempt_request_check
    check (jsonb_typeof(request_evidence) = 'object'),
  constraint accounting_revision_attempt_response_check
    check (response_evidence is null or jsonb_typeof(response_evidence) = 'object'),
  constraint accounting_revision_attempt_lease_shape_check check (
    (
      queue_state = 'claimed'
      and nullif(trim(worker_id), '') is not null
      and lease_token is not null
      and lease_expires_at is not null
      and started_at is not null
    )
    or queue_state <> 'claimed'
  ),
  constraint accounting_revision_attempt_terminal_shape_check check (
    (
      queue_state in ('succeeded', 'failed', 'attention_required')
      and completed_at is not null
      and response_evidence is not null
      and nullif(trim(outcome_code), '') is not null
    )
    or (
      queue_state not in ('succeeded', 'failed', 'attention_required')
      and completed_at is null
    )
  )
);

create unique index accounting_revision_attempt_one_active_uidx
  on public.organization_accounting_revision_attempts(
    accounting_revision_id, attempt_intent
  )
  where queue_state in ('queued', 'claimed');

create table public.organization_accounting_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_document_id uuid not null
    references public.organization_accounting_documents(id) on delete restrict,
  accounting_revision_id uuid null
    references public.organization_accounting_document_revisions(id) on delete restrict,
  accounting_attempt_id uuid null
    references public.organization_accounting_revision_attempts(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  correlation_id text null,
  event_evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint accounting_event_type_check check (char_length(trim(event_type)) > 0),
  constraint accounting_event_evidence_check
    check (jsonb_typeof(event_evidence) = 'object')
);

create table public.organization_accounting_remote_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_document_id uuid not null
    references public.organization_accounting_documents(id) on delete restrict,
  accounting_revision_id uuid not null
    references public.organization_accounting_document_revisions(id) on delete restrict,
  provider text not null,
  tenant_id text not null,
  external_document_id text not null,
  observed_at timestamptz not null default now(),
  provider_updated_at timestamptz null,
  raw_status text null,
  normalized_status text null,
  content_hash text not null,
  settlement_hash text not null,
  raw_observation jsonb not null,
  constraint accounting_remote_observation_hashes_check check (
    content_hash ~ '^[a-f0-9]{64}$'
    and settlement_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint accounting_remote_observation_text_check check (
    char_length(trim(provider)) > 0
    and char_length(trim(tenant_id)) > 0
    and char_length(trim(external_document_id)) > 0
  ),
  constraint accounting_remote_observation_object_check
    check (jsonb_typeof(raw_observation) = 'object')
);

create table public.organization_accounting_projections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_document_id uuid not null
    references public.organization_accounting_documents(id) on delete restrict,
  accounting_revision_id uuid not null
    references public.organization_accounting_document_revisions(id) on delete restrict,
  remote_observation_id uuid null
    references public.organization_accounting_remote_observations(id) on delete restrict,
  raw_provider_status text null,
  normalized_invoice_status text null,
  normalized_payment_status text null,
  amount_paid_minor bigint null,
  amount_due_minor bigint null,
  amount_credited_minor bigint null,
  divergent boolean not null default false,
  divergence_reasons jsonb not null default '[]'::jsonb,
  observed_content_hash text null,
  projected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_projection_document_unique unique (accounting_document_id),
  constraint accounting_projection_amounts_check check (
    (amount_paid_minor is null or amount_paid_minor >= 0)
    and (amount_due_minor is null or amount_due_minor >= 0)
    and (amount_credited_minor is null or amount_credited_minor >= 0)
  ),
  constraint accounting_projection_divergence_check
    check (jsonb_typeof(divergence_reasons) = 'array'),
  constraint accounting_projection_hash_check
    check (observed_content_hash is null or observed_content_hash ~ '^[a-f0-9]{64}$')
);

create table public.organization_accounting_legacy_classifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  accounting_document_id uuid not null
    references public.organization_accounting_documents(id) on delete restrict,
  classification_sequence integer not null,
  classification text not null,
  evidence_snapshot jsonb not null,
  evidence_hash text not null,
  classified_by uuid not null references auth.users(id) on delete restrict,
  classified_at timestamptz not null default now(),
  constraint accounting_legacy_classification_sequence_unique
    unique (accounting_document_id, classification_sequence),
  constraint accounting_legacy_classification_check check (
    classification in (
      'unclassified', 'authoritative_match', 'ambiguous_match',
      'historical_only', 'requires_manual_review'
    )
  ),
  constraint accounting_legacy_classification_evidence_check
    check (jsonb_typeof(evidence_snapshot) = 'object'),
  constraint accounting_legacy_classification_hash_check
    check (evidence_hash ~ '^[a-f0-9]{64}$')
);

alter table public.organization_accounting_revision_attempts
  add constraint accounting_revision_attempt_org_id_unique
    unique (organization_id, id);
alter table public.organization_accounting_remote_observations
  add constraint accounting_remote_observation_org_id_unique
    unique (organization_id, id);
alter table public.organization_accounting_projections
  add constraint accounting_projection_org_id_unique unique (organization_id, id);
alter table public.organization_accounting_legacy_classifications
  add constraint accounting_legacy_classification_org_id_unique
    unique (organization_id, id);

alter table public.organization_accounting_revision_lines
  add constraint accounting_revision_lines_org_revision_fkey
  foreign key (organization_id, accounting_revision_id)
  references public.organization_accounting_document_revisions(organization_id, id)
  on delete restrict;
alter table public.organization_accounting_revision_attachments
  add constraint accounting_revision_attachments_org_revision_fkey
  foreign key (organization_id, accounting_revision_id)
  references public.organization_accounting_document_revisions(organization_id, id)
  on delete restrict;
alter table public.organization_accounting_revision_attempts
  add constraint accounting_revision_attempts_org_revision_fkey
  foreign key (organization_id, accounting_revision_id)
  references public.organization_accounting_document_revisions(organization_id, id)
  on delete restrict;
alter table public.organization_accounting_events
  add constraint accounting_events_org_document_fkey
    foreign key (organization_id, accounting_document_id)
    references public.organization_accounting_documents(organization_id, id)
    on delete restrict,
  add constraint accounting_events_org_revision_fkey
    foreign key (organization_id, accounting_revision_id)
    references public.organization_accounting_document_revisions(organization_id, id)
    on delete restrict,
  add constraint accounting_events_org_attempt_fkey
    foreign key (organization_id, accounting_attempt_id)
    references public.organization_accounting_revision_attempts(organization_id, id)
    on delete restrict;
alter table public.organization_accounting_remote_observations
  add constraint accounting_observations_org_document_fkey
    foreign key (organization_id, accounting_document_id)
    references public.organization_accounting_documents(organization_id, id)
    on delete restrict,
  add constraint accounting_observations_org_revision_fkey
    foreign key (organization_id, accounting_revision_id)
    references public.organization_accounting_document_revisions(organization_id, id)
    on delete restrict;
alter table public.organization_accounting_projections
  add constraint accounting_projections_org_document_fkey
    foreign key (organization_id, accounting_document_id)
    references public.organization_accounting_documents(organization_id, id)
    on delete restrict,
  add constraint accounting_projections_org_revision_fkey
    foreign key (organization_id, accounting_revision_id)
    references public.organization_accounting_document_revisions(organization_id, id)
    on delete restrict,
  add constraint accounting_projections_org_observation_fkey
    foreign key (organization_id, remote_observation_id)
    references public.organization_accounting_remote_observations(organization_id, id)
    on delete restrict;
alter table public.organization_accounting_legacy_classifications
  add constraint accounting_legacy_classification_org_document_fkey
  foreign key (organization_id, accounting_document_id)
  references public.organization_accounting_documents(organization_id, id)
  on delete restrict;

alter table public.organization_accounting_documents
  add column active_accounting_revision_id uuid null,
  add column current_accounting_projection_id uuid null,
  add column current_legacy_classification_id uuid null;

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_active_revision_fkey
    foreign key (active_accounting_revision_id)
    references public.organization_accounting_document_revisions(id)
    on delete restrict,
  add constraint organization_accounting_documents_projection_fkey
    foreign key (current_accounting_projection_id)
    references public.organization_accounting_projections(id)
    on delete restrict,
  add constraint organization_accounting_documents_legacy_classification_fkey
    foreign key (current_legacy_classification_id)
    references public.organization_accounting_legacy_classifications(id)
    on delete restrict;
alter table public.organization_accounting_documents
  add constraint accounting_documents_org_active_revision_fkey
    foreign key (organization_id, active_accounting_revision_id)
    references public.organization_accounting_document_revisions(organization_id, id)
    on delete restrict,
  add constraint accounting_documents_org_projection_fkey
    foreign key (organization_id, current_accounting_projection_id)
    references public.organization_accounting_projections(organization_id, id)
    on delete restrict,
  add constraint accounting_documents_org_legacy_classification_fkey
    foreign key (organization_id, current_legacy_classification_id)
    references public.organization_accounting_legacy_classifications(organization_id, id)
    on delete restrict;

create index accounting_revisions_document_created_idx
  on public.organization_accounting_document_revisions(
    accounting_document_id, revision_sequence desc
  );
create index accounting_revisions_external_idx
  on public.organization_accounting_document_revisions(
    provider, tenant_id, external_document_id
  ) where external_document_id is not null;
create index accounting_attempts_queue_idx
  on public.organization_accounting_revision_attempts(queue_state, created_at, id);
create index accounting_events_document_idx
  on public.organization_accounting_events(accounting_document_id, occurred_at desc, id desc);
create index accounting_observations_revision_idx
  on public.organization_accounting_remote_observations(
    accounting_revision_id, observed_at desc, id desc
  );

create or replace function public.reject_phase2a_append_only_mutation()
returns trigger language plpgsql set search_path = public
as $$
begin
  raise exception 'Immutable accounting evidence is append-only.'
    using errcode = '55000';
end;
$$;

create or replace function public.guard_phase2a_revision_mutation()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Confirmed accounting revisions cannot be deleted.'
      using errcode = '55000';
  end if;
  if coalesce(current_setting('app.accounting_phase2a_lifecycle_write', true), '') <> 'true' then
    raise exception 'Accounting revision lifecycle changes require a controlled function.'
      using errcode = '55000';
  end if;
  if (to_jsonb(new) - array[
      'lifecycle_state', 'external_document_id', 'succeeded_at', 'activated_at',
      'superseded_at', 'superseded_by_revision_id', 'failure_code',
      'failure_message', 'updated_at'
    ]) is distinct from
    (to_jsonb(old) - array[
      'lifecycle_state', 'external_document_id', 'succeeded_at', 'activated_at',
      'superseded_at', 'superseded_by_revision_id', 'failure_code',
      'failure_message', 'updated_at'
    ]) then
    raise exception 'Confirmed accounting revision evidence is immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.guard_phase2a_attachment_mutation()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Accounting attachment evidence cannot be deleted.'
      using errcode = '55000';
  end if;
  if coalesce(current_setting('app.accounting_phase2a_attachment_write', true), '') <> 'true' then
    raise exception 'Accounting attachment state requires a controlled function.'
      using errcode = '55000';
  end if;
  if (to_jsonb(new) - array[
      'upload_state', 'provider_attachment_id', 'uploaded_at',
      'failure_code', 'failure_message', 'updated_at'
    ]) is distinct from
    (to_jsonb(old) - array[
      'upload_state', 'provider_attachment_id', 'uploaded_at',
      'failure_code', 'failure_message', 'updated_at'
    ]) then
    raise exception 'Accounting attachment metadata is immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.guard_phase2a_attempt_mutation()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Accounting attempts cannot be deleted.' using errcode = '55000';
  end if;
  if coalesce(current_setting('app.accounting_phase2a_lease_write', true), '') <> 'true' then
    raise exception 'Accounting attempts require lease-token functions.'
      using errcode = '55000';
  end if;
  if old.queue_state in ('succeeded', 'failed', 'attention_required')
    and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'Completed accounting attempt evidence is immutable.'
      using errcode = '55000';
  end if;
  if (to_jsonb(new) - array[
      'queue_state', 'response_evidence', 'worker_id', 'lease_token',
      'lease_expires_at', 'heartbeat_at', 'started_at', 'completed_at',
      'outcome_code', 'outcome_message', 'updated_at'
    ]) is distinct from
    (to_jsonb(old) - array[
      'queue_state', 'response_evidence', 'worker_id', 'lease_token',
      'lease_expires_at', 'heartbeat_at', 'started_at', 'completed_at',
      'outcome_code', 'outcome_message', 'updated_at'
    ]) then
    raise exception 'Accounting attempt identity and request evidence are immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.guard_phase2a_document_pointer_mutation()
returns trigger language plpgsql set search_path = public
as $$
begin
  if (
    new.active_accounting_revision_id is distinct from old.active_accounting_revision_id
    or new.current_accounting_projection_id
      is distinct from old.current_accounting_projection_id
    or new.current_legacy_classification_id
      is distinct from old.current_legacy_classification_id
  ) and coalesce(
    current_setting('app.accounting_phase2a_pointer_write', true), ''
  ) <> 'true' then
    raise exception 'Accounting evidence pointers require a controlled function.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger guard_accounting_document_phase2a_pointer_mutation
before update on public.organization_accounting_documents
for each row execute function public.guard_phase2a_document_pointer_mutation();
create trigger reject_accounting_number_reservation_mutation
before update or delete on public.organization_accounting_number_reservations
for each row execute function public.reject_phase2a_append_only_mutation();
create trigger guard_accounting_revision_mutation
before update or delete on public.organization_accounting_document_revisions
for each row execute function public.guard_phase2a_revision_mutation();
create trigger reject_accounting_revision_line_mutation
before update or delete on public.organization_accounting_revision_lines
for each row execute function public.reject_phase2a_append_only_mutation();
create trigger guard_accounting_revision_attachment_mutation
before update or delete on public.organization_accounting_revision_attachments
for each row execute function public.guard_phase2a_attachment_mutation();
create trigger guard_accounting_revision_attempt_mutation
before update or delete on public.organization_accounting_revision_attempts
for each row execute function public.guard_phase2a_attempt_mutation();
create trigger reject_accounting_event_mutation
before update or delete on public.organization_accounting_events
for each row execute function public.reject_phase2a_append_only_mutation();
create trigger reject_accounting_observation_mutation
before update or delete on public.organization_accounting_remote_observations
for each row execute function public.reject_phase2a_append_only_mutation();
create trigger reject_accounting_legacy_classification_mutation
before update or delete on public.organization_accounting_legacy_classifications
for each row execute function public.reject_phase2a_append_only_mutation();

create or replace function public.reserve_accounting_sales_invoice_number_phase2a(
  p_organization_id uuid,
  p_provider text,
  p_tenant_id text,
  p_source_document_type text,
  p_source_document_id uuid,
  p_accounting_document_id uuid,
  p_reserved_by uuid,
  p_reason text
)
returns public.organization_accounting_number_reservations
language plpgsql security definer set search_path = public
as $$
declare
  next_sequence bigint;
  reservation public.organization_accounting_number_reservations%rowtype;
begin
  if p_source_document_type not in ('project_claim', 'retention_claim') then
    raise exception 'Only Payment Claims and Retention Claims share the sales-invoice sequence.';
  end if;
  if p_accounting_document_id is not null and not exists (
    select 1 from public.organization_accounting_documents d
    where d.id = p_accounting_document_id
      and d.organization_id = p_organization_id
      and d.provider = p_provider
      and d.tenant_id = p_tenant_id
      and d.local_document_type = p_source_document_type
      and coalesce(d.project_claim_id, d.retention_claim_id) = p_source_document_id
  ) then
    raise exception 'Accounting document identity does not match the reservation scope.';
  end if;

  insert into public.organization_accounting_number_counters(
    organization_id, provider, tenant_id, document_class, last_sequence
  ) values (
    p_organization_id, p_provider, trim(p_tenant_id), 'sales_invoice', 1
  )
  on conflict (organization_id, provider, tenant_id, document_class)
  do update set
    last_sequence = organization_accounting_number_counters.last_sequence + 1,
    updated_at = now()
  returning last_sequence into next_sequence;

  insert into public.organization_accounting_number_reservations(
    organization_id, provider, tenant_id, document_class, sequence_number,
    formatted_number, accounting_document_id, source_document_type,
    source_document_id, reservation_reason, reserved_by
  ) values (
    p_organization_id, p_provider, trim(p_tenant_id), 'sales_invoice',
    next_sequence, 'TSI-' || lpad(next_sequence::text, 8, '0'),
    p_accounting_document_id, p_source_document_type, p_source_document_id,
    p_reason, p_reserved_by
  ) returning * into reservation;
  return reservation;
end;
$$;

create or replace function public.persist_confirmed_accounting_revision_phase2a(
  p_input jsonb
)
returns public.organization_accounting_document_revisions
language plpgsql security definer set search_path = public
as $$
declare
  document public.organization_accounting_documents%rowtype;
  reservation public.organization_accounting_number_reservations%rowtype;
  previous_revision public.organization_accounting_document_revisions%rowtype;
  revision public.organization_accounting_document_revisions%rowtype;
  line jsonb;
  attachment jsonb;
  next_sequence bigint;
  line_subtotal bigint := 0;
  line_tax bigint := 0;
begin
  select * into document
  from public.organization_accounting_documents
  where id = (p_input->>'accountingDocumentId')::uuid
    and organization_id = (p_input->>'organizationId')::uuid
  for update;
  if not found then raise exception 'Accounting document not found in organization.'; end if;
  if document.provider <> p_input->>'provider'
    or document.tenant_id <> p_input->>'tenantId'
    or document.accounting_connection_id <> (p_input->>'connectionId')::uuid
    or document.local_document_type <> p_input->>'sourceDocumentType'
    or coalesce(document.project_claim_id, document.retention_claim_id, document.local_document_id)
      <> (p_input->>'sourceDocumentId')::uuid then
    raise exception 'Confirmed accounting identity does not match the stable document.';
  end if;

  next_sequence := coalesce((
    select max(r.revision_sequence) + 1
    from public.organization_accounting_document_revisions r
    where r.accounting_document_id = document.id
  ), 1);

  if next_sequence = 1 and nullif(p_input->>'previousRevisionId', '') is not null then
    raise exception 'The first accounting revision cannot have a predecessor.';
  elsif next_sequence > 1 then
    select * into previous_revision
    from public.organization_accounting_document_revisions
    where id = (p_input->>'previousRevisionId')::uuid
      and accounting_document_id = document.id;
    if not found or previous_revision.revision_sequence <> next_sequence - 1 then
      raise exception 'Accounting revision predecessor is not the prior document revision.';
    end if;
  end if;

  if document.local_document_type in ('project_claim', 'retention_claim') then
    select * into reservation
    from public.organization_accounting_number_reservations n
    where n.id = (p_input->>'numberReservationId')::uuid
      and n.organization_id = document.organization_id
      and n.provider = document.provider
      and n.tenant_id = document.tenant_id
      and n.accounting_document_id = document.id
      and n.source_document_type = document.local_document_type
      and n.source_document_id =
        coalesce(document.project_claim_id, document.retention_claim_id);
    if not found or reservation.formatted_number <> p_input->>'externalDocumentNumber' then
      raise exception 'Confirmed sales-invoice number is not the reserved tenant number.';
    end if;
  end if;

  if jsonb_typeof(p_input->'lines') <> 'array'
    or jsonb_array_length(p_input->'lines') = 0 then
    raise exception 'A confirmed accounting revision requires line evidence.';
  end if;
  for line in select value from jsonb_array_elements(p_input->'lines')
  loop
    line_subtotal := line_subtotal + (line->>'lineAmountMinor')::bigint;
    line_tax := line_tax + (line->>'taxMinor')::bigint;
  end loop;
  if line_subtotal <> (p_input->>'subtotalMinor')::bigint
    or line_tax <> (p_input->>'taxMinor')::bigint
    or line_subtotal + line_tax <> (p_input->>'totalMinor')::bigint then
    raise exception 'Confirmed accounting line totals do not reconcile.';
  end if;

  insert into public.organization_accounting_document_revisions(
    organization_id, project_id, accounting_document_id, revision_sequence,
    source_document_type, source_document_id, revision_intent,
    resolution_strategy, previous_revision_id, provider, connection_id,
    tenant_id, number_reservation_id, external_document_number,
    commercial_snapshot, contact_snapshot, routing_snapshot, tax_snapshot,
    attachment_snapshot, payload_snapshot, canonical_schema_version,
    source_evidence_hash, commercial_hash, lines_hash, payload_hash,
    provider_content_hash, pdf_hash,
    currency_code, provider_document_type, requested_provider_status,
    line_amount_type, subtotal_minor, tax_minor, total_minor,
    confirmation_preview_hash, confirmed_by, confirmed_at, confirmation_reason
  ) values (
    document.organization_id,
    nullif(p_input->>'projectId', '')::uuid,
    document.id,
    next_sequence,
    document.local_document_type,
    coalesce(document.project_claim_id, document.retention_claim_id, document.local_document_id),
    p_input->>'revisionIntent',
    p_input->>'resolutionStrategy',
    nullif(p_input->>'previousRevisionId', '')::uuid,
    document.provider,
    (p_input->>'connectionId')::uuid,
    document.tenant_id,
    nullif(p_input->>'numberReservationId', '')::uuid,
    p_input->>'externalDocumentNumber',
    p_input->'commercialSnapshot',
    p_input->'contactSnapshot',
    p_input->'routingSnapshot',
    p_input->'taxSnapshot',
    p_input->'attachmentSnapshot',
    p_input->'payloadSnapshot',
    p_input->>'canonicalSchemaVersion',
    p_input->>'sourceEvidenceHash',
    p_input->>'commercialHash',
    p_input->>'linesHash',
    p_input->>'payloadHash',
    p_input->>'providerContentHash',
    nullif(p_input->>'pdfHash', ''),
    p_input->>'currencyCode',
    p_input->>'providerDocumentType',
    p_input->>'requestedProviderStatus',
    p_input->>'lineAmountType',
    (p_input->>'subtotalMinor')::bigint,
    (p_input->>'taxMinor')::bigint,
    (p_input->>'totalMinor')::bigint,
    p_input->>'confirmationPreviewHash',
    (p_input->>'confirmedBy')::uuid,
    coalesce((p_input->>'confirmedAt')::timestamptz, now()),
    nullif(p_input->>'confirmationReason', '')
  ) returning * into revision;

  for line in select value from jsonb_array_elements(p_input->'lines')
  loop
    insert into public.organization_accounting_revision_lines(
      organization_id, accounting_revision_id, sequence, line_kind,
      source_line_type, source_line_id, originating_payment_claim_id,
      description, quantity, unit_amount_minor, line_amount_minor, tax_minor,
      total_minor, account_snapshot, tax_snapshot, tracking_snapshot,
      source_snapshot
    ) values (
      revision.organization_id, revision.id, (line->>'sequence')::integer,
      line->>'lineKind', line->>'sourceLineType',
      nullif(line->>'sourceLineId', '')::uuid,
      nullif(line->>'originatingPaymentClaimId', '')::uuid,
      line->>'description', (line->>'quantity')::numeric,
      (line->>'unitAmountMinor')::bigint, (line->>'lineAmountMinor')::bigint,
      (line->>'taxMinor')::bigint, (line->>'totalMinor')::bigint,
      line->'accountSnapshot', line->'taxSnapshot',
      coalesce(line->'trackingSnapshot', '{}'::jsonb),
      line->'sourceSnapshot'
    );
  end loop;

  for attachment in
    select value from jsonb_array_elements(coalesce(p_input->'attachments', '[]'::jsonb))
  loop
    insert into public.organization_accounting_revision_attachments(
      organization_id, accounting_revision_id, attachment_sequence,
      attachment_kind, source_document_id, filename, content_type, byte_size,
      content_sha256, storage_bucket, storage_path
    ) values (
      revision.organization_id, revision.id,
      (attachment->>'sequence')::integer, attachment->>'kind',
      nullif(attachment->>'sourceDocumentId', '')::uuid,
      attachment->>'filename', attachment->>'contentType',
      (attachment->>'byteSize')::bigint, attachment->>'contentSha256',
      attachment->>'storageBucket', attachment->>'storagePath'
    );
  end loop;

  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, actor_user_id, correlation_id, event_evidence
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    'revision_confirmed', revision.confirmed_by, p_input->>'correlationId',
    jsonb_build_object(
      'revisionSequence', revision.revision_sequence,
      'confirmationPreviewHash', revision.confirmation_preview_hash,
      'sourceEvidenceHash', revision.source_evidence_hash
    )
  );
  return revision;
end;
$$;

create or replace function public.create_accounting_revision_attempt_phase2a(
  p_revision_id uuid,
  p_attempt_intent text,
  p_idempotency_key text,
  p_request_evidence jsonb
)
returns public.organization_accounting_revision_attempts
language plpgsql security definer set search_path = public
as $$
declare
  revision public.organization_accounting_document_revisions%rowtype;
  attempt public.organization_accounting_revision_attempts%rowtype;
begin
  select * into revision
  from public.organization_accounting_document_revisions where id = p_revision_id;
  if not found then raise exception 'Accounting revision not found.'; end if;

  insert into public.organization_accounting_revision_attempts(
    organization_id, accounting_revision_id, attempt_sequence, attempt_intent,
    idempotency_key, request_evidence
  ) values (
    revision.organization_id, revision.id,
    coalesce((
      select max(a.attempt_sequence) + 1
      from public.organization_accounting_revision_attempts a
      where a.accounting_revision_id = revision.id
    ), 1),
    p_attempt_intent, p_idempotency_key, p_request_evidence
  )
  on conflict (idempotency_key) do nothing
  returning * into attempt;
  if attempt.id is null then
    select * into attempt
    from public.organization_accounting_revision_attempts
    where idempotency_key = p_idempotency_key;
    if attempt.accounting_revision_id <> revision.id
      or attempt.attempt_intent <> p_attempt_intent
      or attempt.request_evidence is distinct from p_request_evidence then
      raise exception 'Accounting attempt idempotency key was reused with different evidence.';
    end if;
  end if;
  return attempt;
end;
$$;

create or replace function public.claim_next_accounting_revision_attempt_phase2a(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns public.organization_accounting_revision_attempts
language plpgsql security definer set search_path = public
as $$
declare attempt public.organization_accounting_revision_attempts%rowtype;
begin
  if nullif(trim(p_worker_id), '') is null or p_lease_seconds not between 10 and 900 then
    raise exception 'Invalid accounting attempt lease request.';
  end if;
  select * into attempt
  from public.organization_accounting_revision_attempts a
  where a.queue_state = 'queued'
     or (a.queue_state = 'claimed' and a.lease_expires_at < now())
  order by a.created_at, a.id
  for update skip locked
  limit 1;
  if not found then return null; end if;

  perform set_config('app.accounting_phase2a_lease_write', 'true', true);
  update public.organization_accounting_revision_attempts set
    queue_state = 'claimed',
    worker_id = trim(p_worker_id),
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    heartbeat_at = now(),
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = attempt.id returning * into attempt;
  perform set_config('app.accounting_phase2a_lease_write', '', true);
  return attempt;
end;
$$;

create or replace function public.heartbeat_accounting_revision_attempt_phase2a(
  p_attempt_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 60
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare changed integer;
begin
  if p_lease_seconds not between 10 and 900 then
    raise exception 'Invalid accounting attempt lease duration.';
  end if;
  perform set_config('app.accounting_phase2a_lease_write', 'true', true);
  update public.organization_accounting_revision_attempts set
    heartbeat_at = now(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  where id = p_attempt_id
    and queue_state = 'claimed'
    and worker_id = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at >= now();
  get diagnostics changed = row_count;
  perform set_config('app.accounting_phase2a_lease_write', '', true);
  return changed = 1;
end;
$$;

create or replace function public.finalize_accounting_revision_attempt_phase2a(
  p_attempt_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_terminal_state text,
  p_outcome_code text,
  p_outcome_message text,
  p_response_evidence jsonb
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare changed integer;
begin
  if p_terminal_state not in ('succeeded', 'failed', 'attention_required') then
    raise exception 'Invalid terminal accounting attempt state.';
  end if;
  perform set_config('app.accounting_phase2a_lease_write', 'true', true);
  update public.organization_accounting_revision_attempts set
    queue_state = p_terminal_state,
    response_evidence = p_response_evidence,
    completed_at = now(),
    outcome_code = p_outcome_code,
    outcome_message = p_outcome_message,
    updated_at = now()
  where id = p_attempt_id
    and queue_state = 'claimed'
    and worker_id = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at >= now();
  get diagnostics changed = row_count;
  perform set_config('app.accounting_phase2a_lease_write', '', true);
  if changed = 1 then return true; end if;
  return exists (
    select 1
    from public.organization_accounting_revision_attempts a
    where a.id = p_attempt_id
      and a.worker_id = p_worker_id
      and a.lease_token = p_lease_token
      and a.queue_state = p_terminal_state
      and a.outcome_code = p_outcome_code
      and a.response_evidence = p_response_evidence
  );
end;
$$;

create or replace function public.activate_successful_accounting_revision_phase2a(
  p_revision_id uuid,
  p_external_document_id text
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  revision public.organization_accounting_document_revisions%rowtype;
  prior_id uuid;
begin
  select * into revision
  from public.organization_accounting_document_revisions
  where id = p_revision_id for update;
  if not found then raise exception 'Accounting revision not found.'; end if;
  if not exists (
    select 1 from public.organization_accounting_revision_attempts a
    where a.accounting_revision_id = revision.id
      and a.queue_state = 'succeeded'
  ) then
    raise exception 'Only a successfully evidenced revision can become active.';
  end if;
  if nullif(trim(p_external_document_id), '') is null then
    raise exception 'A successful provider document identity is required.';
  end if;

  select active_accounting_revision_id into prior_id
  from public.organization_accounting_documents
  where id = revision.accounting_document_id for update;

  perform set_config('app.accounting_phase2a_lifecycle_write', 'true', true);
  if prior_id is not null and prior_id <> revision.id then
    update public.organization_accounting_document_revisions set
      lifecycle_state = 'superseded',
      superseded_at = now(),
      superseded_by_revision_id = revision.id,
      updated_at = now()
    where id = prior_id and lifecycle_state = 'succeeded';
  end if;
  update public.organization_accounting_document_revisions set
    lifecycle_state = 'succeeded',
    external_document_id = trim(p_external_document_id),
    succeeded_at = coalesce(succeeded_at, now()),
    activated_at = coalesce(activated_at, now()),
    updated_at = now()
  where id = revision.id;
  perform set_config('app.accounting_phase2a_lifecycle_write', '', true);

  perform set_config('app.accounting_phase2a_pointer_write', 'true', true);
  update public.organization_accounting_documents
  set active_accounting_revision_id = revision.id
  where id = revision.accounting_document_id;
  perform set_config('app.accounting_phase2a_pointer_write', '', true);
  return true;
end;
$$;

create or replace function public.transition_accounting_revision_lifecycle_phase2a(
  p_revision_id uuid,
  p_target_state text,
  p_failure_code text default null,
  p_failure_message text default null
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare revision public.organization_accounting_document_revisions%rowtype;
begin
  select * into revision
  from public.organization_accounting_document_revisions
  where id = p_revision_id for update;
  if not found then raise exception 'Accounting revision not found.'; end if;
  if not (
    (revision.lifecycle_state = 'confirmed' and p_target_state = 'queued')
    or (revision.lifecycle_state = 'queued' and p_target_state in ('processing', 'failed'))
    or (revision.lifecycle_state = 'processing'
      and p_target_state in ('failed', 'attention_required'))
    or (revision.lifecycle_state in ('failed', 'attention_required')
      and p_target_state = 'queued')
  ) then
    raise exception 'Invalid controlled accounting revision lifecycle transition.';
  end if;
  if p_target_state in ('failed', 'attention_required')
    and nullif(trim(p_failure_code), '') is null then
    raise exception 'Failed accounting lifecycle evidence requires a failure code.';
  end if;

  perform set_config('app.accounting_phase2a_lifecycle_write', 'true', true);
  update public.organization_accounting_document_revisions set
    lifecycle_state = p_target_state,
    failure_code = case when p_target_state in ('failed', 'attention_required')
      then p_failure_code else null end,
    failure_message = case when p_target_state in ('failed', 'attention_required')
      then p_failure_message else null end,
    updated_at = now()
  where id = revision.id;
  perform set_config('app.accounting_phase2a_lifecycle_write', '', true);

  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, event_evidence
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    'revision_lifecycle_transitioned',
    jsonb_build_object(
      'previousState', revision.lifecycle_state,
      'newState', p_target_state,
      'failureCode', p_failure_code
    )
  );
  return true;
end;
$$;

create or replace function public.transition_accounting_attachment_phase2a(
  p_attachment_id uuid,
  p_target_state text,
  p_provider_attachment_id text default null,
  p_failure_code text default null,
  p_failure_message text default null
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare attachment public.organization_accounting_revision_attachments%rowtype;
begin
  select * into attachment
  from public.organization_accounting_revision_attachments
  where id = p_attachment_id for update;
  if not found then raise exception 'Accounting attachment not found.'; end if;
  if not (
    (attachment.upload_state = 'pending' and p_target_state = 'uploading')
    or (attachment.upload_state = 'uploading' and p_target_state in ('uploaded', 'failed'))
    or (attachment.upload_state = 'failed' and p_target_state = 'uploading')
  ) then
    raise exception 'Invalid controlled accounting attachment transition.';
  end if;

  perform set_config('app.accounting_phase2a_attachment_write', 'true', true);
  update public.organization_accounting_revision_attachments set
    upload_state = p_target_state,
    provider_attachment_id = case when p_target_state = 'uploaded'
      then p_provider_attachment_id else null end,
    uploaded_at = case when p_target_state = 'uploaded' then now() else null end,
    failure_code = case when p_target_state = 'failed' then p_failure_code else null end,
    failure_message = case when p_target_state = 'failed' then p_failure_message else null end,
    updated_at = now()
  where id = attachment.id;
  perform set_config('app.accounting_phase2a_attachment_write', '', true);
  return true;
end;
$$;

create or replace function public.record_accounting_remote_observation_phase2a(
  p_input jsonb
)
returns public.organization_accounting_remote_observations
language plpgsql security definer set search_path = public
as $$
declare
  revision public.organization_accounting_document_revisions%rowtype;
  observation public.organization_accounting_remote_observations%rowtype;
  projection public.organization_accounting_projections%rowtype;
  is_divergent boolean;
begin
  select * into revision
  from public.organization_accounting_document_revisions
  where id = (p_input->>'accountingRevisionId')::uuid
    and organization_id = (p_input->>'organizationId')::uuid;
  if not found then raise exception 'Accounting revision not found in organization.'; end if;
  if revision.lifecycle_state not in ('succeeded', 'superseded')
    or revision.accounting_document_id <> (p_input->>'accountingDocumentId')::uuid
    or revision.provider <> p_input->>'provider'
    or revision.tenant_id <> p_input->>'tenantId'
    or revision.external_document_id <> p_input->>'externalDocumentId' then
    raise exception 'Remote observation does not match the bound successful revision.';
  end if;

  is_divergent :=
    (p_input->>'contentHash') is distinct from revision.provider_content_hash;
  insert into public.organization_accounting_remote_observations(
    organization_id, accounting_document_id, accounting_revision_id,
    provider, tenant_id, external_document_id, provider_updated_at,
    raw_status, normalized_status, content_hash, settlement_hash,
    raw_observation
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    revision.provider, revision.tenant_id, revision.external_document_id,
    nullif(p_input->>'providerUpdatedAt', '')::timestamptz,
    p_input->>'rawStatus', p_input->>'normalizedStatus',
    p_input->>'contentHash', p_input->>'settlementHash',
    p_input->'rawObservation'
  ) returning * into observation;

  insert into public.organization_accounting_projections(
    organization_id, accounting_document_id, accounting_revision_id,
    remote_observation_id, raw_provider_status, normalized_invoice_status,
    normalized_payment_status, amount_paid_minor, amount_due_minor,
    amount_credited_minor, divergent, divergence_reasons,
    observed_content_hash, projected_at, updated_at
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    observation.id, p_input->>'rawStatus', p_input->>'normalizedInvoiceStatus',
    p_input->>'normalizedPaymentStatus',
    nullif(p_input->>'amountPaidMinor', '')::bigint,
    nullif(p_input->>'amountDueMinor', '')::bigint,
    nullif(p_input->>'amountCreditedMinor', '')::bigint,
    is_divergent,
    case when is_divergent then
      jsonb_build_array('remote_content_differs_from_export_revision')
    else '[]'::jsonb end,
    observation.content_hash, observation.observed_at, now()
  )
  on conflict (accounting_document_id) do update set
    accounting_revision_id = excluded.accounting_revision_id,
    remote_observation_id = excluded.remote_observation_id,
    raw_provider_status = excluded.raw_provider_status,
    normalized_invoice_status = excluded.normalized_invoice_status,
    normalized_payment_status = excluded.normalized_payment_status,
    amount_paid_minor = excluded.amount_paid_minor,
    amount_due_minor = excluded.amount_due_minor,
    amount_credited_minor = excluded.amount_credited_minor,
    divergent = excluded.divergent,
    divergence_reasons = excluded.divergence_reasons,
    observed_content_hash = excluded.observed_content_hash,
    projected_at = excluded.projected_at,
    updated_at = now()
  returning * into projection;

  perform set_config('app.accounting_phase2a_pointer_write', 'true', true);
  update public.organization_accounting_documents set
    current_accounting_projection_id = projection.id
  where id = revision.accounting_document_id;
  perform set_config('app.accounting_phase2a_pointer_write', '', true);

  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, correlation_id, event_evidence
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    case when is_divergent then 'remote_divergence_observed'
      else 'remote_status_observed' end,
    p_input->>'correlationId',
    jsonb_build_object(
      'remoteObservationId', observation.id,
      'projectionId', projection.id,
      'contentHash', observation.content_hash,
      'settlementHash', observation.settlement_hash,
      'divergent', is_divergent
    )
  );
  return observation;
end;
$$;

create or replace function public.evaluate_retention_ownership_phase2a(
  p_organization_id uuid,
  p_project_id uuid,
  p_proposals jsonb default '[]'::jsonb
)
returns jsonb language plpgsql stable security definer
set search_path = public, private
as $$
declare
  eligibility jsonb;
  position jsonb;
  origin jsonb;
  proposal jsonb;
  origins jsonb := '[]'::jsonb;
  origin_id uuid;
  current_owned bigint;
  proposed_owned bigint;
  native_submitted bigint;
  approved_legacy bigint;
  draft_committed bigint;
  exported bigint;
  paid bigint;
  schedule_eligible bigint;
  proposed_release bigint;
  reasons jsonb;
  unresolved_legacy boolean;
begin
  if jsonb_typeof(p_proposals) <> 'array' then
    raise exception 'Retention ownership proposals must be a JSON array.';
  end if;
  if not exists (
    select 1 from public.organization_projects p
    where p.id = p_project_id and p.organization_id = p_organization_id
  ) then
    raise exception 'Project does not belong to the organization.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_proposals) x
    where not exists (
      select 1 from public.project_claims c
      where c.id = (x->>'originId')::uuid
        and c.project_id = p_project_id
        and c.organization_id = p_organization_id
    )
  ) then
    raise exception 'A proposed retention origin is outside the organization project.';
  end if;

  eligibility := private.retention_eligibility_state(p_project_id);
  position := public.get_project_retention_position_summary(p_project_id);
  unresolved_legacy := coalesce(
    (position->>'legacyReconciliationRequired')::boolean, false
  );

  for origin in
    select value from jsonb_array_elements(coalesce(eligibility->'origins', '[]'::jsonb))
  loop
    origin_id := (origin->>'originatingPaymentClaimId')::uuid;
    select value into proposal
    from jsonb_array_elements(p_proposals)
    where value->>'originId' = origin_id::text
    limit 1;

    current_owned := round(coalesce((origin->>'currentRetentionOwned')::numeric, 0) * 100);
    proposed_owned := round(
      coalesce((proposal->>'proposedOwnedMinor')::numeric, current_owned)
    );
    proposed_release := round(
      coalesce((proposal->>'proposedReleaseMinor')::numeric, 0)
    );
    approved_legacy := round(
      coalesce((origin->>'legacyCommittedRetention')::numeric, 0) * 100
    );
    schedule_eligible := round(
      coalesce((origin->>'currentEligibleRetention')::numeric, 0) * 100
    );

    select round(coalesce(sum(a.allocation_amount), 0) * 100)::bigint
    into native_submitted
    from public.retention_claim_allocations a
    join public.retention_claims c on c.id = a.retention_claim_id
    where a.originating_payment_claim_id = origin_id
      and c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.status = 'submitted';

    select round(coalesce(sum(a.allocation_amount), 0) * 100)::bigint
    into draft_committed
    from public.retention_claim_allocations a
    join public.retention_claims c on c.id = a.retention_claim_id
    where a.originating_payment_claim_id = origin_id
      and c.organization_id = p_organization_id
      and c.project_id = p_project_id
      and c.status = 'draft';

    select round(coalesce(sum(l.line_amount_excl_tax), 0) * 100)::bigint
    into exported
    from public.retention_claim_accounting_lines l
    join public.retention_claim_accounting_snapshots s
      on s.id = l.accounting_snapshot_id
    join public.organization_accounting_documents d
      on d.id = s.accounting_document_id
    where l.originating_payment_claim_id = origin_id
      and l.organization_id = p_organization_id
      and l.project_id = p_project_id
      and d.export_status = 'exported';

    select round(coalesce(sum(a.paid_amount), 0) * 100)::bigint
    into paid
    from public.retention_claim_payment_attributions a
    join public.retention_claim_payment_reconciliations r
      on r.id = a.payment_reconciliation_id
    where a.originating_payment_claim_id = origin_id
      and a.organization_id = p_organization_id
      and a.project_id = p_project_id
      and r.id = (
        select latest.id
        from public.retention_claim_payment_reconciliations latest
        where latest.retention_claim_id = r.retention_claim_id
        order by latest.reconciliation_sequence desc
        limit 1
      );

    reasons := '[]'::jsonb;
    if unresolved_legacy then reasons := reasons || '"unresolved_legacy_retention"'::jsonb; end if;
    if proposed_owned > current_owned then
      reasons := reasons || '"proposed_ownership_exceeds_current"'::jsonb;
    end if;
    if native_submitted + approved_legacy > proposed_owned then
      reasons := reasons || '"committed_retention_exceeds_proposed_ownership"'::jsonb;
    end if;
    if proposed_release > 0 and native_submitted + approved_legacy > 0 then
      reasons := reasons || '"duplicate_release_path"'::jsonb;
    end if;
    if exported > native_submitted then
      reasons := reasons || '"exported_retention_exceeds_native_commitment"'::jsonb;
    end if;
    if paid > exported then
      reasons := reasons || '"paid_retention_exceeds_exported_retention"'::jsonb;
    end if;

    origins := origins || jsonb_build_array(jsonb_build_object(
      'originId', origin_id,
      'currentOwnedMinor', current_owned,
      'proposedOwnedMinor', proposed_owned,
      'nativeSubmittedMinor', native_submitted,
      'approvedLegacyMinor', approved_legacy,
      'draftCommittedMinor', draft_committed,
      'exportedMinor', exported,
      'paidMinor', paid,
      'scheduleEligibleMinor', schedule_eligible,
      'proposedReleaseMinor', proposed_release,
      'unresolvedLegacy', unresolved_legacy,
      'blockingReasons', reasons,
      'valid', jsonb_array_length(reasons) = 0
    ));
  end loop;

  return jsonb_build_object(
    'organizationId', p_organization_id,
    'projectId', p_project_id,
    'readOnly', true,
    'origins', origins,
    'valid', not exists (
      select 1 from jsonb_array_elements(origins) x
      where not coalesce((x->>'valid')::boolean, false)
    )
  );
end;
$$;

alter table public.organization_accounting_number_counters enable row level security;
alter table public.organization_accounting_number_counters force row level security;
alter table public.organization_accounting_number_reservations enable row level security;
alter table public.organization_accounting_number_reservations force row level security;
alter table public.organization_accounting_document_revisions enable row level security;
alter table public.organization_accounting_document_revisions force row level security;
alter table public.organization_accounting_revision_lines enable row level security;
alter table public.organization_accounting_revision_lines force row level security;
alter table public.organization_accounting_revision_attachments enable row level security;
alter table public.organization_accounting_revision_attachments force row level security;
alter table public.organization_accounting_revision_attempts enable row level security;
alter table public.organization_accounting_revision_attempts force row level security;
alter table public.organization_accounting_events enable row level security;
alter table public.organization_accounting_events force row level security;
alter table public.organization_accounting_remote_observations enable row level security;
alter table public.organization_accounting_remote_observations force row level security;
alter table public.organization_accounting_projections enable row level security;
alter table public.organization_accounting_projections force row level security;
alter table public.organization_accounting_legacy_classifications enable row level security;
alter table public.organization_accounting_legacy_classifications force row level security;

revoke all on
  public.organization_accounting_number_counters,
  public.organization_accounting_number_reservations,
  public.organization_accounting_document_revisions,
  public.organization_accounting_revision_lines,
  public.organization_accounting_revision_attachments,
  public.organization_accounting_revision_attempts,
  public.organization_accounting_events,
  public.organization_accounting_remote_observations,
  public.organization_accounting_projections,
  public.organization_accounting_legacy_classifications
from public, anon, authenticated, service_role;

grant select on
  public.organization_accounting_document_revisions,
  public.organization_accounting_revision_lines,
  public.organization_accounting_revision_attachments,
  public.organization_accounting_revision_attempts,
  public.organization_accounting_events,
  public.organization_accounting_remote_observations,
  public.organization_accounting_projections,
  public.organization_accounting_legacy_classifications
to authenticated;

create policy "Accounting viewers can read immutable revisions"
on public.organization_accounting_document_revisions for select to authenticated
using (
  public.has_org_permission(organization_id, 'accounting.sales_invoices.view')
  or public.has_org_permission(organization_id, 'retention.claims.xero.view')
  or public.has_org_permission(organization_id, 'accounting.ap_bills.view')
);
create policy "Accounting viewers can read immutable lines"
on public.organization_accounting_revision_lines for select to authenticated
using (
  public.has_org_permission(organization_id, 'accounting.sales_invoices.view')
  or public.has_org_permission(organization_id, 'retention.claims.xero.view')
  or public.has_org_permission(organization_id, 'accounting.ap_bills.view')
);
create policy "Accounting viewers can read immutable attachments"
on public.organization_accounting_revision_attachments for select to authenticated
using (
  public.has_org_permission(organization_id, 'accounting.sales_invoices.view')
  or public.has_org_permission(organization_id, 'retention.claims.xero.view')
  or public.has_org_permission(organization_id, 'accounting.ap_bills.view')
);
create policy "Accounting viewers can read attempts"
on public.organization_accounting_revision_attempts for select to authenticated
using (
  public.has_org_permission(organization_id, 'accounting.sales_invoices.view')
  or public.has_org_permission(organization_id, 'retention.claims.xero.view')
  or public.has_org_permission(organization_id, 'accounting.ap_bills.view')
);
create policy "Accounting viewers can read events"
on public.organization_accounting_events for select to authenticated
using (
  public.has_org_permission(organization_id, 'accounting.sales_invoices.view')
  or public.has_org_permission(organization_id, 'retention.claims.xero.view')
  or public.has_org_permission(organization_id, 'accounting.ap_bills.view')
);
create policy "Accounting viewers can read observations"
on public.organization_accounting_remote_observations for select to authenticated
using (
  public.has_org_permission(organization_id, 'accounting.sales_invoices.view')
  or public.has_org_permission(organization_id, 'retention.claims.xero.view')
  or public.has_org_permission(organization_id, 'accounting.ap_bills.view')
);
create policy "Accounting viewers can read projections"
on public.organization_accounting_projections for select to authenticated
using (
  public.has_org_permission(organization_id, 'accounting.sales_invoices.view')
  or public.has_org_permission(organization_id, 'retention.claims.xero.view')
  or public.has_org_permission(organization_id, 'accounting.ap_bills.view')
);
create policy "Accounting viewers can read legacy classifications"
on public.organization_accounting_legacy_classifications for select to authenticated
using (
  public.has_org_permission(organization_id, 'accounting.sales_invoices.view')
  or public.has_org_permission(organization_id, 'retention.claims.xero.view')
  or public.has_org_permission(organization_id, 'accounting.ap_bills.view')
);

revoke all on function
  public.reserve_accounting_sales_invoice_number_phase2a(uuid,text,text,text,uuid,uuid,uuid,text),
  public.persist_confirmed_accounting_revision_phase2a(jsonb),
  public.create_accounting_revision_attempt_phase2a(uuid,text,text,jsonb),
  public.claim_next_accounting_revision_attempt_phase2a(text,integer),
  public.heartbeat_accounting_revision_attempt_phase2a(uuid,text,uuid,integer),
  public.finalize_accounting_revision_attempt_phase2a(uuid,text,uuid,text,text,text,jsonb),
  public.activate_successful_accounting_revision_phase2a(uuid,text),
  public.transition_accounting_revision_lifecycle_phase2a(uuid,text,text,text),
  public.transition_accounting_attachment_phase2a(uuid,text,text,text,text),
  public.record_accounting_remote_observation_phase2a(jsonb),
  public.evaluate_retention_ownership_phase2a(uuid,uuid,jsonb)
from public, anon, authenticated;

grant execute on function
  public.reserve_accounting_sales_invoice_number_phase2a(uuid,text,text,text,uuid,uuid,uuid,text),
  public.persist_confirmed_accounting_revision_phase2a(jsonb),
  public.create_accounting_revision_attempt_phase2a(uuid,text,text,jsonb),
  public.claim_next_accounting_revision_attempt_phase2a(text,integer),
  public.heartbeat_accounting_revision_attempt_phase2a(uuid,text,uuid,integer),
  public.finalize_accounting_revision_attempt_phase2a(uuid,text,uuid,text,text,text,jsonb),
  public.activate_successful_accounting_revision_phase2a(uuid,text),
  public.transition_accounting_revision_lifecycle_phase2a(uuid,text,text,text),
  public.transition_accounting_attachment_phase2a(uuid,text,text,text,text),
  public.record_accounting_remote_observation_phase2a(jsonb),
  public.evaluate_retention_ownership_phase2a(uuid,uuid,jsonb)
to service_role;

commit;
