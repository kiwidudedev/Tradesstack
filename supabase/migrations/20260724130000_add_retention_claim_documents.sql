begin;

-- Phase 8 creates immutable Retention Claim PDF evidence. It reads submitted
-- Retention Claim snapshots and never writes Payment Claims, invoices, Xero
-- records, payments, or existing reconciliation evidence.

insert into public.app_permissions(permission_key, description)
values (
  'retention.claims.documents.generate',
  'Generate immutable PDF documents for submitted Retention Claims'
)
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions(role, permission_key, is_allowed)
select role_name, 'retention.claims.documents.generate', role_name in ('owner', 'admin')
from unnest(array['owner', 'admin', 'qs', 'project_manager', 'worker']) role_name
on conflict (role, permission_key) do update
set is_allowed = excluded.is_allowed, updated_at = now();

create table public.retention_claim_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  document_kind text not null default 'submitted_claim_pdf',
  document_version integer not null default 1,
  source_evidence_hash text not null,
  pdf_sha256 text not null,
  file_name text not null,
  storage_bucket text not null default 'retention-claim-documents',
  storage_path text not null,
  byte_length bigint not null,
  render_model_snapshot jsonb not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint retention_claim_documents_claim_fkey
    foreign key(organization_id, project_id, retention_claim_id)
    references public.retention_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_documents_identity_unique
    unique(organization_id, project_id, id),
  constraint retention_claim_documents_claim_version_unique
    unique(retention_claim_id, document_kind, document_version),
  constraint retention_claim_documents_kind_check
    check(document_kind = 'submitted_claim_pdf'),
  constraint retention_claim_documents_version_check
    check(document_version = 1),
  constraint retention_claim_documents_hashes_check check(
    source_evidence_hash ~ '^[a-f0-9]{64}$'
    and pdf_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint retention_claim_documents_file_name_check
    check(char_length(trim(file_name)) between 1 and 250),
  constraint retention_claim_documents_bucket_check
    check(storage_bucket = 'retention-claim-documents'),
  constraint retention_claim_documents_path_check
    check(char_length(storage_path) between 1 and 1000),
  constraint retention_claim_documents_byte_length_check
    check(byte_length > 0),
  constraint retention_claim_documents_render_model_check
    check(jsonb_typeof(render_model_snapshot) = 'object')
);

create index retention_claim_documents_project_created_idx
  on public.retention_claim_documents(project_id, created_at desc, id desc);

create table public.retention_claim_document_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  retention_claim_document_id uuid not null,
  event_type text not null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  source_evidence_hash text not null,
  pdf_sha256 text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_claim_document_events_document_fkey
    foreign key(organization_id, project_id, retention_claim_document_id)
    references public.retention_claim_documents(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_document_events_claim_fkey
    foreign key(organization_id, project_id, retention_claim_id)
    references public.retention_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_document_events_type_check
    check(event_type = 'document_generated'),
  constraint retention_claim_document_events_hashes_check check(
    source_evidence_hash ~ '^[a-f0-9]{64}$'
    and pdf_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint retention_claim_document_events_metadata_check
    check(jsonb_typeof(metadata) = 'object')
);

create index retention_claim_document_events_claim_occurred_idx
  on public.retention_claim_document_events(
    retention_claim_id, occurred_at desc, id desc
  );

alter table public.retention_claim_documents enable row level security;
alter table public.retention_claim_documents force row level security;
alter table public.retention_claim_document_events enable row level security;
alter table public.retention_claim_document_events force row level security;

revoke all on public.retention_claim_documents from public, anon, authenticated;
revoke all on public.retention_claim_document_events from public, anon, authenticated;

create or replace function public.prevent_retention_claim_document_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Retention Claim document evidence is append-only.'
    using errcode = '55000';
end;
$$;

create trigger retention_claim_documents_append_only
before update or delete on public.retention_claim_documents
for each row execute function public.prevent_retention_claim_document_mutation();

create or replace function public.prevent_retention_claim_document_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Retention Claim document events are append-only.'
    using errcode = '55000';
end;
$$;

create trigger retention_claim_document_events_append_only
before update or delete on public.retention_claim_document_events
for each row execute function public.prevent_retention_claim_document_event_mutation();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'retention-claim-documents',
  'retention-claim-documents',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.retention_phase8_gate_enabled()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(
      current_setting('request.jwt.claim.retention_phase8_internal', true),
      ''
    ) = 'true'
    or coalesce(
      coalesce(
        nullif(current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb ->> 'retention_phase8_internal',
      'false'
    ) = 'true';
$$;

create or replace function private.retention_phase8_context(
  p_project_id uuid,
  p_permission_key text,
  p_require_internal_gate boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  context_organization_id uuid;
  capability_enabled boolean;
  workflow_mode text;
begin
  if actor_id is null then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  select project.organization_id
  into context_organization_id
  from public.organization_projects project
  join public.organization_members member
    on member.organization_id = project.organization_id
   and member.user_id = actor_id
  where project.id = p_project_id;

  if context_organization_id is null then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'document_not_found'
    );
  end if;

  if not public.has_org_permission(context_organization_id, p_permission_key) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  select coalesce(capability.enabled, false)
  into capability_enabled
  from public.organization_capabilities capability
  where capability.organization_id = context_organization_id
    and capability.capability_key = 'retention_management';

  if not coalesce(capability_enabled, false) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'capability_disabled'
    );
  end if;

  select coalesce(state.mode, 'legacy')
  into workflow_mode
  from public.project_retention_workflow_states state
  where state.organization_id = context_organization_id
    and state.project_id = p_project_id;

  if coalesce(workflow_mode, 'legacy') <> 'observe'
     or (
       p_require_internal_gate
       and not private.retention_phase8_gate_enabled()
     ) then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'project_mode_not_supported',
      'workflowMode', coalesce(workflow_mode, 'legacy'),
      'phase8InternalGate', private.retention_phase8_gate_enabled()
    );
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'organizationId', context_organization_id,
    'projectId', p_project_id,
    'actorUserId', actor_id,
    'workflowMode', workflow_mode
  );
end;
$$;

create or replace function private.retention_claim_document_source(
  p_retention_claim_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'claim', jsonb_build_object(
      'id', claim.id,
      'organizationId', claim.organization_id,
      'projectId', claim.project_id,
      'claimNumber', claim.claim_number,
      'title', claim.title,
      'reference', claim.reference,
      'issueDate', claim.issue_date,
      'dueDate', claim.due_date,
      'status', claim.status,
      'subtotalExclTax', claim.subtotal_excl_tax,
      'submissionStateHash', claim.submission_state_hash,
      'submissionEligibilityStateHash',
        claim.submission_eligibility_state_hash,
      'submittedBy', claim.submitted_by,
      'submittedAt', claim.submitted_at
    ),
    'allocations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', allocation.id,
          'allocationSequence', allocation.allocation_sequence,
          'originatingPaymentClaimId',
            allocation.originating_payment_claim_id,
          'allocationAmount', allocation.allocation_amount,
          'originClaimNumberSnapshot',
            allocation.origin_claim_number_snapshot,
          'originClaimDateSnapshot', allocation.origin_claim_date_snapshot,
          'originClaimStatusSnapshot',
            allocation.origin_claim_status_snapshot,
          'originRetentionOwnedSnapshot',
            allocation.draft_origin_retention_owned,
          'retentionMethodSnapshot',
            allocation.retention_method_snapshot,
          'retentionRateSnapshot', allocation.retention_rate_snapshot,
          'retentionWithheldSnapshot',
            allocation.retention_withheld_snapshot,
          'retentionReleasedSnapshot',
            allocation.retention_released_snapshot,
          'retentionBalanceSnapshot',
            allocation.retention_balance_snapshot,
          'existingSubmittedAllocationBefore',
            allocation.existing_submitted_allocation_before,
          'remainingAfterAllocation',
            allocation.remaining_after_allocation,
          'projectStateHashSnapshot',
            allocation.project_state_hash_snapshot,
          'originStateHashSnapshot',
            allocation.origin_state_hash_snapshot,
          'eligibilityStateHashSnapshot',
            allocation.eligibility_state_hash_snapshot,
          'eligibilityScheduleIdsSnapshot',
            to_jsonb(allocation.eligibility_schedule_ids_snapshot),
          'submittedAt', allocation.submitted_at
        )
        order by allocation.allocation_sequence, allocation.id
      )
      from public.retention_claim_allocations allocation
      where allocation.retention_claim_id = claim.id
    ), '[]'::jsonb)
  )
  from public.retention_claims claim
  where claim.id = p_retention_claim_id
    and claim.status = 'submitted';
$$;

create or replace function private.retention_phase8_actor_has_permission(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when bool_or(coalesce(override.is_allowed, false)) then true
    when bool_or(override.is_allowed = false) then false
    else coalesce(bool_or(role_permission.is_allowed), false)
  end
  from public.organization_members member
  left join public.member_permission_overrides override
    on override.organization_member_id = member.id
   and override.permission_key = p_permission_key
  left join public.role_permissions role_permission
    on role_permission.role = member.role
   and role_permission.permission_key = p_permission_key
  where member.organization_id = p_organization_id
    and member.user_id = p_actor_user_id;
$$;

create or replace function public.get_retention_claim_document_source(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  claim_row public.retention_claims%rowtype;
  context jsonb;
  source jsonb;
  source_hash text;
begin
  select * into claim_row
  from public.retention_claims
  where id = p_retention_claim_id;

  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'document_not_found'
    );
  end if;

  context := private.retention_phase8_context(
    claim_row.project_id,
    'retention.claims.documents.generate',
    true
  );
  if not coalesce((context->>'succeeded')::boolean, false) then
    return context;
  end if;

  if claim_row.status <> 'submitted' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_submitted'
    );
  end if;

  source := private.retention_claim_document_source(claim_row.id);
  source_hash := encode(
    extensions.digest(convert_to(source::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'actorUserId', context->>'actorUserId',
    'sourceEvidenceHash', source_hash,
    'source', source
  );
end;
$$;

create or replace function public.record_retention_claim_document(
  p_retention_claim_id uuid,
  p_source_evidence_hash text,
  p_pdf_sha256 text,
  p_file_name text,
  p_storage_path text,
  p_byte_length bigint,
  p_render_model_snapshot jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  claim_row public.retention_claims%rowtype;
  source jsonb;
  expected_source_hash text;
  expected_storage_path text;
  document_row public.retention_claim_documents%rowtype;
  inserted boolean := false;
  capability_enabled boolean;
  workflow_mode text;
begin
  select * into claim_row
  from public.retention_claims
  where id = p_retention_claim_id;

  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'document_not_found'
    );
  end if;

  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  if not private.retention_phase8_actor_has_permission(
    claim_row.organization_id,
    p_actor_user_id,
    'retention.claims.documents.generate'
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  select coalesce(capability.enabled, false)
  into capability_enabled
  from public.organization_capabilities capability
  where capability.organization_id = claim_row.organization_id
    and capability.capability_key = 'retention_management';
  if not coalesce(capability_enabled, false) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'capability_disabled'
    );
  end if;

  select coalesce(state.mode, 'legacy')
  into workflow_mode
  from public.project_retention_workflow_states state
  where state.organization_id = claim_row.organization_id
    and state.project_id = claim_row.project_id;
  if coalesce(workflow_mode, 'legacy') <> 'observe' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'project_mode_not_supported',
      'workflowMode', coalesce(workflow_mode, 'legacy')
    );
  end if;

  if claim_row.status <> 'submitted' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_submitted'
    );
  end if;

  source := private.retention_claim_document_source(claim_row.id);
  expected_source_hash := encode(
    extensions.digest(convert_to(source::text, 'UTF8'), 'sha256'),
    'hex'
  );
  expected_storage_path := concat(
    claim_row.organization_id, '/',
    claim_row.project_id, '/',
    claim_row.id, '/',
    expected_source_hash, '.pdf'
  );

  if p_source_evidence_hash is distinct from expected_source_hash then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'stale_document_source',
      'currentSourceEvidenceHash', expected_source_hash
    );
  end if;

  if p_pdf_sha256 is null
     or p_pdf_sha256 !~ '^[a-f0-9]{64}$'
     or p_byte_length is null
     or p_byte_length <= 0
     or p_byte_length > 10485760
     or nullif(trim(coalesce(p_file_name, '')), '') is null
     or char_length(p_file_name) > 250
     or p_storage_path is distinct from expected_storage_path
     or p_render_model_snapshot is null
     or jsonb_typeof(p_render_model_snapshot) <> 'object' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'invalid_document_evidence'
    );
  end if;

  begin
    insert into public.retention_claim_documents(
      organization_id,
      project_id,
      retention_claim_id,
      source_evidence_hash,
      pdf_sha256,
      file_name,
      storage_path,
      byte_length,
      render_model_snapshot,
      created_by
    )
    values (
      claim_row.organization_id,
      claim_row.project_id,
      claim_row.id,
      expected_source_hash,
      p_pdf_sha256,
      trim(p_file_name),
      expected_storage_path,
      p_byte_length,
      p_render_model_snapshot,
      p_actor_user_id
    )
    returning * into document_row;
    inserted := true;
  exception when unique_violation then
    select * into document_row
    from public.retention_claim_documents
    where retention_claim_id = claim_row.id
      and document_kind = 'submitted_claim_pdf'
      and document_version = 1;
  end;

  if document_row.id is null
     or document_row.source_evidence_hash <> expected_source_hash
     or document_row.pdf_sha256 <> p_pdf_sha256
     or document_row.storage_path <> expected_storage_path
     or document_row.byte_length <> p_byte_length then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'document_conflict'
    );
  end if;

  if inserted then
    insert into public.retention_claim_document_events(
      organization_id,
      project_id,
      retention_claim_id,
      retention_claim_document_id,
      event_type,
      actor_user_id,
      source_evidence_hash,
      pdf_sha256,
      metadata
    )
    values (
      document_row.organization_id,
      document_row.project_id,
      document_row.retention_claim_id,
      document_row.id,
      'document_generated',
      p_actor_user_id,
      document_row.source_evidence_hash,
      document_row.pdf_sha256,
      jsonb_build_object(
        'documentKind', document_row.document_kind,
        'documentVersion', document_row.document_version,
        'fileName', document_row.file_name,
        'byteLength', document_row.byte_length
      )
    );
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'created', inserted,
    'reused', not inserted,
    'document', to_jsonb(document_row)
  );
end;
$$;

create or replace function public.get_retention_claim_document(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claim_row public.retention_claims%rowtype;
  context jsonb;
  document_row public.retention_claim_documents%rowtype;
begin
  select * into claim_row
  from public.retention_claims
  where id = p_retention_claim_id;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'document_not_found'
    );
  end if;

  context := private.retention_phase8_context(
    claim_row.project_id,
    'retention.view',
    false
  );
  if not coalesce((context->>'succeeded')::boolean, false) then
    return context;
  end if;

  select * into document_row
  from public.retention_claim_documents
  where retention_claim_id = claim_row.id
    and document_kind = 'submitted_claim_pdf'
    and document_version = 1;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'document',
      case when document_row.id is null then null
      else to_jsonb(document_row) end
  );
end;
$$;

revoke all on function private.retention_phase8_gate_enabled()
  from public, anon, authenticated;
revoke all on function private.retention_phase8_context(uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function private.retention_claim_document_source(uuid)
  from public, anon, authenticated;
revoke all on function private.retention_phase8_actor_has_permission(
  uuid, uuid, text
) from public, anon, authenticated;

revoke all on function public.get_retention_claim_document_source(uuid)
  from public, anon;
grant execute on function public.get_retention_claim_document_source(uuid)
  to authenticated;

revoke all on function public.record_retention_claim_document(
  uuid, text, text, text, text, bigint, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.record_retention_claim_document(
  uuid, text, text, text, text, bigint, jsonb, uuid
) to service_role;

revoke all on function public.get_retention_claim_document(uuid)
  from public, anon;
grant execute on function public.get_retention_claim_document(uuid)
  to authenticated;

commit;
