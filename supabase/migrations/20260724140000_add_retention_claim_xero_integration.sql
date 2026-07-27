begin;

-- Phase 9 adds a create-only Xero ACCREC path for submitted Retention Claims.
-- Payment Claims, Phase 8 documents, invoices, payments and paid attribution
-- are never rewritten by this migration.

insert into public.app_permissions(permission_key, description)
values
  (
    'retention.claims.xero.view',
    'View Retention Claim Xero Sales Invoice synchronization state'
  ),
  (
    'retention.claims.xero.manage',
    'Create and retry Retention Claim Xero Sales Invoices'
  )
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions(role, permission_key, is_allowed)
select role_name, permission_key,
  case
    when permission_key = 'retention.claims.xero.view'
      then role_name in ('owner', 'admin', 'qs', 'project_manager')
    else role_name in ('owner', 'admin')
  end
from unnest(array['owner', 'admin', 'qs', 'project_manager', 'worker']) role_name
cross join unnest(array[
  'retention.claims.xero.view',
  'retention.claims.xero.manage'
]) permission_key
on conflict (role, permission_key) do update
set is_allowed = excluded.is_allowed, updated_at = now();

alter table public.organization_accounting_documents
  add column retention_claim_id uuid null
    references public.retention_claims(id) on delete restrict;

alter table public.retention_claim_allocations
  add constraint retention_claim_allocations_org_project_claim_id_unique
  unique(organization_id, project_id, retention_claim_id, id);

alter table public.organization_accounting_documents
  drop constraint organization_accounting_documents_type_check,
  drop constraint organization_accounting_documents_local_identity_shape_check;

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_type_check check (
    local_document_type in (
      'supplier_invoice',
      'project_claim',
      'retention_claim'
    )
  ),
  add constraint organization_accounting_documents_local_identity_shape_check
  check (
    (
      local_document_type = 'supplier_invoice'
      and local_document_id is not null
      and project_claim_id is null
      and retention_claim_id is null
    )
    or (
      local_document_type = 'project_claim'
      and local_document_id is null
      and project_claim_id is not null
      and retention_claim_id is null
      and current_version_id is null
    )
    or (
      local_document_type = 'retention_claim'
      and local_document_id is null
      and project_claim_id is null
      and retention_claim_id is not null
      and current_version_id is null
    )
  );

create unique index
  organization_accounting_documents_unique_retention_claim_uidx
on public.organization_accounting_documents(
  organization_id,
  provider,
  tenant_id,
  retention_claim_id
)
where local_document_type = 'retention_claim'
  and retention_claim_id is not null;

create policy
  "Retention Xero viewers can view retention accounting documents"
on public.organization_accounting_documents
for select
to authenticated
using (
  local_document_type = 'retention_claim'
  and public.has_org_permission(
    organization_id,
    'retention.claims.xero.view'
  )
  and exists (
    select 1
    from public.retention_claims claim
    where claim.id = retention_claim_id
      and claim.organization_id = organization_id
  )
);

create table public.retention_claim_accounting_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  accounting_document_id uuid not null,
  retention_document_id uuid not null,
  retention_source_evidence_hash text not null,
  retention_pdf_sha256 text not null,
  payload_sha256 text not null,
  idempotency_key text not null,
  connection_id_snapshot uuid not null
    references public.organization_xero_connections(id) on delete restrict,
  tenant_id_snapshot text not null,
  contact_id_snapshot text not null,
  invoice_number_snapshot text not null,
  reference_snapshot text not null,
  invoice_date_snapshot date not null,
  due_date_snapshot date not null,
  currency_code_snapshot text not null default 'NZD',
  line_amount_type_snapshot text not null default 'Exclusive',
  requested_status_snapshot text not null default 'AUTHORISED',
  subtotal_excl_tax_snapshot numeric(14,2) not null,
  tax_total_snapshot numeric(14,2) not null,
  total_snapshot numeric(14,2) not null,
  retention_mapping_id_snapshot uuid not null
    references public.organization_tradesstack_accounting_mappings(id)
    on delete restrict,
  organization_cost_code_id_snapshot uuid not null
    references public.organization_cost_codes(id) on delete restrict,
  xero_account_id_snapshot text not null,
  xero_account_code_snapshot text not null,
  tax_rate_id_snapshot uuid not null
    references public.organization_accounting_tax_rates(id) on delete restrict,
  xero_tax_type_snapshot text not null,
  tax_rate_basis_points_snapshot integer not null,
  payload_snapshot jsonb not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint retention_claim_accounting_snapshots_claim_fkey
    foreign key(organization_id, project_id, retention_claim_id)
    references public.retention_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_accounting_snapshots_document_fkey
    foreign key(accounting_document_id)
    references public.organization_accounting_documents(id)
    on delete restrict,
  constraint retention_claim_accounting_snapshots_retention_document_fkey
    foreign key(organization_id, project_id, retention_document_id)
    references public.retention_claim_documents(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_accounting_snapshots_claim_unique
    unique(retention_claim_id),
  constraint retention_claim_accounting_snapshots_document_unique
    unique(accounting_document_id),
  constraint retention_claim_accounting_snapshots_hashes_check check(
    retention_source_evidence_hash ~ '^[a-f0-9]{64}$'
    and retention_pdf_sha256 ~ '^[a-f0-9]{64}$'
    and payload_sha256 ~ '^[a-f0-9]{64}$'
    and idempotency_key ~ '^[a-f0-9]{64}$'
  ),
  constraint retention_claim_accounting_snapshots_tenant_check
    check(char_length(trim(tenant_id_snapshot)) > 0),
  constraint retention_claim_accounting_snapshots_text_check check(
    char_length(trim(contact_id_snapshot)) > 0
    and char_length(trim(invoice_number_snapshot)) > 0
    and char_length(trim(reference_snapshot)) > 0
    and char_length(trim(xero_account_id_snapshot)) > 0
    and char_length(trim(xero_account_code_snapshot)) > 0
    and char_length(trim(xero_tax_type_snapshot)) > 0
  ),
  constraint retention_claim_accounting_snapshots_currency_check
    check(currency_code_snapshot = 'NZD'),
  constraint retention_claim_accounting_snapshots_line_amount_check
    check(line_amount_type_snapshot = 'Exclusive'),
  constraint retention_claim_accounting_snapshots_status_check
    check(requested_status_snapshot = 'AUTHORISED'),
  constraint retention_claim_accounting_snapshots_amounts_check check(
    subtotal_excl_tax_snapshot > 0
    and tax_total_snapshot >= 0
    and total_snapshot =
      round(subtotal_excl_tax_snapshot + tax_total_snapshot, 2)
  ),
  constraint retention_claim_accounting_snapshots_tax_rate_check
    check(tax_rate_basis_points_snapshot = 1500),
  constraint retention_claim_accounting_snapshots_payload_check
    check(jsonb_typeof(payload_snapshot) = 'object')
);

create table public.retention_claim_accounting_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  accounting_snapshot_id uuid not null,
  retention_claim_allocation_id uuid not null,
  originating_payment_claim_id uuid not null,
  sequence integer not null,
  description text not null,
  line_amount_excl_tax numeric(14,2) not null,
  tax_amount numeric(14,2) not null,
  gross_amount numeric(14,2) not null,
  origin_claim_number_snapshot text not null,
  routing_code integer not null default 700,
  retention_mapping_id_snapshot uuid not null
    references public.organization_tradesstack_accounting_mappings(id)
    on delete restrict,
  organization_cost_code_id_snapshot uuid not null
    references public.organization_cost_codes(id) on delete restrict,
  xero_account_id_snapshot text not null,
  xero_account_code_snapshot text not null,
  xero_tax_type_snapshot text not null,
  created_at timestamptz not null default now(),
  constraint retention_claim_accounting_lines_snapshot_fkey
    foreign key(accounting_snapshot_id)
    references public.retention_claim_accounting_snapshots(id)
    on delete restrict,
  constraint retention_claim_accounting_lines_allocation_fkey
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
  constraint retention_claim_accounting_lines_origin_fkey
    foreign key(organization_id, project_id, originating_payment_claim_id)
    references public.project_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_accounting_lines_sequence_check
    check(sequence > 0),
  constraint retention_claim_accounting_lines_amount_check check(
    line_amount_excl_tax > 0
    and tax_amount >= 0
    and gross_amount = round(line_amount_excl_tax + tax_amount, 2)
  ),
  constraint retention_claim_accounting_lines_description_check
    check(char_length(trim(description)) > 0),
  constraint retention_claim_accounting_lines_origin_number_check
    check(char_length(trim(origin_claim_number_snapshot)) > 0),
  constraint retention_claim_accounting_lines_route_check
    check(routing_code = 700),
  constraint retention_claim_accounting_lines_external_check check(
    char_length(trim(xero_account_id_snapshot)) > 0
    and char_length(trim(xero_account_code_snapshot)) > 0
    and char_length(trim(xero_tax_type_snapshot)) > 0
  ),
  constraint retention_claim_accounting_lines_sequence_unique
    unique(accounting_snapshot_id, sequence),
  constraint retention_claim_accounting_lines_allocation_unique
    unique(accounting_snapshot_id, retention_claim_allocation_id)
);

create table public.retention_claim_accounting_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  accounting_document_id uuid not null,
  accounting_snapshot_id uuid not null,
  event_type text not null,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  correlation_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_claim_accounting_events_claim_fkey
    foreign key(organization_id, project_id, retention_claim_id)
    references public.retention_claims(organization_id, project_id, id)
    on delete restrict,
  constraint retention_claim_accounting_events_document_fkey
    foreign key(accounting_document_id)
    references public.organization_accounting_documents(id)
    on delete restrict,
  constraint retention_claim_accounting_events_snapshot_fkey
    foreign key(accounting_snapshot_id)
    references public.retention_claim_accounting_snapshots(id)
    on delete restrict,
  constraint retention_claim_accounting_events_type_check check(
    event_type in (
      'accounting_snapshot_prepared',
      'xero_sync_queued',
      'xero_invoice_created',
      'xero_sync_failed',
      'xero_attachment_queued',
      'xero_attachment_attached',
      'xero_attachment_failed'
    )
  ),
  constraint retention_claim_accounting_events_metadata_check
    check(jsonb_typeof(metadata) = 'object')
);

create index retention_claim_accounting_events_claim_idx
  on public.retention_claim_accounting_events(
    retention_claim_id, occurred_at desc, id desc
  );

alter table public.retention_claim_accounting_snapshots
  enable row level security;
alter table public.retention_claim_accounting_snapshots
  force row level security;
alter table public.retention_claim_accounting_lines enable row level security;
alter table public.retention_claim_accounting_lines force row level security;
alter table public.retention_claim_accounting_events enable row level security;
alter table public.retention_claim_accounting_events force row level security;

revoke all on public.retention_claim_accounting_snapshots
  from public, anon, authenticated;
revoke all on public.retention_claim_accounting_lines
  from public, anon, authenticated;
revoke all on public.retention_claim_accounting_events
  from public, anon, authenticated;

create or replace function public.prevent_retention_claim_accounting_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Retention Claim accounting evidence is append-only.'
    using errcode = '55000';
end;
$$;

create trigger retention_claim_accounting_snapshots_append_only
before update or delete on public.retention_claim_accounting_snapshots
for each row execute function public.prevent_retention_claim_accounting_mutation();

create trigger retention_claim_accounting_lines_append_only
before update or delete on public.retention_claim_accounting_lines
for each row execute function public.prevent_retention_claim_accounting_mutation();

create trigger retention_claim_accounting_events_append_only
before update or delete on public.retention_claim_accounting_events
for each row execute function public.prevent_retention_claim_accounting_mutation();

create or replace function private.retention_phase9_gate_enabled()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(
      current_setting('request.jwt.claim.retention_phase9_internal', true),
      ''
    ) = 'true'
    or coalesce(
      coalesce(
        nullif(current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb ->> 'retention_phase9_internal',
      'false'
    ) = 'true';
$$;

create or replace function private.retention_phase9_context(
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
  capability_enabled boolean;
  workflow_mode text;
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

  if coalesce(workflow_mode, 'legacy') <> 'observe'
     or not private.retention_phase9_gate_enabled() then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'project_mode_not_supported',
      'workflowMode', coalesce(workflow_mode, 'legacy'),
      'phase9InternalGate', private.retention_phase9_gate_enabled()
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

create or replace function public.get_retention_claim_xero_source(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  context jsonb;
  claim_row public.retention_claims%rowtype;
  source jsonb;
  source_hash text;
begin
  context := private.retention_phase9_context(
    p_retention_claim_id,
    'retention.claims.xero.manage'
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

  source := private.retention_claim_document_source(claim_row.id);
  source_hash := encode(
    extensions.digest(convert_to(source::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'actorUserId', context->>'actorUserId',
    'organizationId', claim_row.organization_id,
    'projectId', claim_row.project_id,
    'retentionSourceEvidenceHash', source_hash,
    'source', source
  );
end;
$$;

create or replace function public.get_retention_claim_xero_access(
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
begin
  context := private.retention_phase9_context(
    p_retention_claim_id,
    'retention.claims.xero.view'
  );
  return context;
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
      'xero.retention_claim.attachment'
    )
  );

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
    'xero.retention_claim.attachment'
  )
  and nullif(
    trim(request_payload ->> 'accountingDocumentId'),
    ''
  ) is not null;

create or replace function public.prepare_retention_claim_xero_sync(
  p_retention_claim_id uuid,
  p_actor_user_id uuid,
  p_connection_id uuid,
  p_tenant_id text,
  p_retention_document_id uuid,
  p_retention_source_evidence_hash text,
  p_retention_pdf_sha256 text,
  p_payload_sha256 text,
  p_idempotency_key text,
  p_contact_id text,
  p_invoice_number text,
  p_reference text,
  p_invoice_date date,
  p_due_date date,
  p_subtotal_excl_tax numeric,
  p_tax_total numeric,
  p_total numeric,
  p_retention_mapping_id uuid,
  p_organization_cost_code_id uuid,
  p_xero_account_id text,
  p_xero_account_code text,
  p_tax_rate_id uuid,
  p_xero_tax_type text,
  p_tax_rate_basis_points integer,
  p_payload_snapshot jsonb,
  p_lines jsonb,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  claim_row public.retention_claims%rowtype;
  project_row public.organization_projects%rowtype;
  retention_document_row public.retention_claim_documents%rowtype;
  connection_row public.organization_xero_connections%rowtype;
  accounting_document_row public.organization_accounting_documents%rowtype;
  accounting_snapshot_row public.retention_claim_accounting_snapshots%rowtype;
  current_source jsonb;
  current_source_hash text;
  active_job_id uuid;
  created_snapshot boolean := false;
  created_job boolean := false;
  supplied_line_count integer;
  allocation_count integer;
  supplied_subtotal numeric;
  supplied_tax numeric;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  select * into claim_row
  from public.retention_claims
  where id = p_retention_claim_id
  for update;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_found'
    );
  end if;

  if not private.retention_phase8_actor_has_permission(
    claim_row.organization_id,
    p_actor_user_id,
    'retention.claims.xero.manage'
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  if claim_row.status <> 'submitted' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'claim_not_submitted'
    );
  end if;
  if claim_row.issue_date is null or claim_row.due_date is null then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'invoice_dates_missing'
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

  select * into project_row
  from public.organization_projects
  where id = claim_row.project_id
    and organization_id = claim_row.organization_id;
  if project_row.client_id is null then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'client_missing'
    );
  end if;

  select * into connection_row
  from public.organization_xero_connections
  where id = p_connection_id
    and organization_id = claim_row.organization_id
    and status = 'connected'
    and tenant_id = p_tenant_id;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'xero_connection_invalid'
    );
  end if;

  if not exists (
    select 1
    from public.organization_external_contacts link
    join public.organization_xero_contacts contact
      on contact.organization_id = link.organization_id
     and contact.connection_id = link.accounting_connection_id
     and contact.tenant_id = link.tenant_id
     and contact.contact_id = link.external_contact_id
    where link.organization_id = claim_row.organization_id
      and link.provider = 'xero'
      and link.local_entity_type = 'client'
      and link.local_entity_id = project_row.client_id
      and link.accounting_connection_id = connection_row.id
      and link.tenant_id = connection_row.tenant_id
      and link.external_contact_id = p_contact_id
      and link.link_status = 'linked'
      and contact.contact_status not in ('ARCHIVED', 'GDPRREQUEST')
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'client_contact_invalid'
    );
  end if;

  if not exists (
    select 1
    from public.organization_tradesstack_accounting_mappings mapping
    join public.organization_cost_codes cost_code
      on cost_code.id = mapping.organization_cost_code_id
     and cost_code.organization_id = mapping.organization_id
    where mapping.id = p_retention_mapping_id
      and mapping.organization_id = claim_row.organization_id
      and mapping.provider = 'xero'
      and mapping.tradesstack_cost_code = 700
      and mapping.is_active = true
      and (
        mapping.project_id = claim_row.project_id
        or mapping.project_id is null
      )
      and cost_code.id = p_organization_cost_code_id
      and cost_code.is_active = true
      and cost_code.external_provider = 'xero'
      and cost_code.external_code = p_xero_account_code
      and cost_code.metadata->>'accountId' = p_xero_account_id
      and cost_code.metadata->>'tenantId' = p_tenant_id
      and upper(cost_code.metadata->>'class') = 'ASSET'
      and upper(cost_code.metadata->>'type') = 'CURRENT'
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'retention_mapping_invalid'
    );
  end if;

  if not exists (
    select 1
    from public.organization_accounting_tax_rates tax_rate
    where tax_rate.id = p_tax_rate_id
      and tax_rate.organization_id = claim_row.organization_id
      and tax_rate.provider = 'xero'
      and tax_rate.accounting_connection_id = connection_row.id
      and tax_rate.tenant_id = p_tenant_id
      and tax_rate.jurisdiction_code = 'NZ'
      and tax_rate.is_active = true
      and upper(tax_rate.status) = 'ACTIVE'
      and tax_rate.tax_type = p_xero_tax_type
      and round(tax_rate.effective_rate * 100)::integer =
        p_tax_rate_basis_points
      and p_tax_rate_basis_points = 1500
      and coalesce(
        (tax_rate.metadata->>'canApplyToRevenue')::boolean,
        false
      ) = true
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'tax_mapping_invalid'
    );
  end if;

  select * into retention_document_row
  from public.retention_claim_documents
  where id = p_retention_document_id
    and organization_id = claim_row.organization_id
    and project_id = claim_row.project_id
    and retention_claim_id = claim_row.id
    and source_evidence_hash = p_retention_source_evidence_hash
    and pdf_sha256 = p_retention_pdf_sha256;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'retention_document_invalid'
    );
  end if;

  current_source := private.retention_claim_document_source(claim_row.id);
  current_source_hash := encode(
    extensions.digest(convert_to(current_source::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if current_source_hash is distinct from p_retention_source_evidence_hash then
    return jsonb_build_object(
      'succeeded', false,
      'errorCode', 'stale_retention_evidence',
      'currentRetentionSourceEvidenceHash', current_source_hash
    );
  end if;

  if p_invoice_number is distinct from claim_row.claim_number
     or p_invoice_date is distinct from claim_row.issue_date
     or p_due_date is distinct from claim_row.due_date
     or round(p_subtotal_excl_tax, 2)
       is distinct from claim_row.subtotal_excl_tax
     or round(p_tax_total, 2) < 0
     or round(p_total, 2) is distinct from
       round(p_subtotal_excl_tax + p_tax_total, 2)
     or p_payload_sha256 !~ '^[a-f0-9]{64}$'
     or p_idempotency_key !~ '^[a-f0-9]{64}$'
     or p_payload_snapshot is null
     or jsonb_typeof(p_payload_snapshot) <> 'object'
     or p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'invalid_accounting_evidence'
    );
  end if;

  if p_payload_snapshot->>'Type' <> 'ACCREC'
     or p_payload_snapshot->>'InvoiceNumber' <> p_invoice_number
     or p_payload_snapshot->>'Reference' <> p_reference
     or p_payload_snapshot->>'Date' <> p_invoice_date::text
     or p_payload_snapshot->>'DueDate' <> p_due_date::text
     or p_payload_snapshot->>'CurrencyCode' <> 'NZD'
     or p_payload_snapshot->>'LineAmountTypes' <> 'Exclusive'
     or p_payload_snapshot->>'Status' <> 'AUTHORISED'
     or p_payload_snapshot#>>'{Contact,ContactID}' <> p_contact_id
     or jsonb_typeof(p_payload_snapshot->'LineItems') <> 'array'
     or jsonb_array_length(p_payload_snapshot->'LineItems')
       <> jsonb_array_length(p_lines)
     or exists (
       select 1
       from jsonb_array_elements(p_payload_snapshot->'LineItems')
         with ordinality payload_line(value, ordinal)
       full join jsonb_array_elements(p_lines)
         with ordinality evidence_line(value, ordinal)
         using(ordinal)
       where payload_line.value is null
          or evidence_line.value is null
          or payload_line.value->>'Description' <>
            evidence_line.value->>'description'
          or round((payload_line.value->>'Quantity')::numeric, 4) <> 1
          or round((payload_line.value->>'UnitAmount')::numeric, 2) <>
            round(
              (evidence_line.value->>'lineAmountExclTax')::numeric,
              2
            )
          or payload_line.value->>'AccountCode' <> p_xero_account_code
          or payload_line.value->>'TaxType' <> p_xero_tax_type
     ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'invalid_xero_payload'
    );
  end if;

  with supplied as (
    select *
    from jsonb_to_recordset(p_lines) as line(
      "allocationId" uuid,
      "originatingPaymentClaimId" uuid,
      "sequence" integer,
      "description" text,
      "lineAmountExclTax" numeric,
      "taxAmount" numeric,
      "grossAmount" numeric,
      "originClaimNumber" text
    )
  )
  select
    count(*)::integer,
    coalesce(sum(round("lineAmountExclTax", 2)), 0),
    coalesce(sum(round("taxAmount", 2)), 0)
  into supplied_line_count, supplied_subtotal, supplied_tax
  from supplied;

  select count(*)::integer into allocation_count
  from public.retention_claim_allocations allocation
  where allocation.retention_claim_id = claim_row.id;

  if supplied_line_count <> allocation_count
     or supplied_subtotal <> claim_row.subtotal_excl_tax
     or supplied_tax <> round(p_tax_total, 2)
     or exists (
       with supplied as (
         select *
         from jsonb_to_recordset(p_lines) as line(
           "allocationId" uuid,
           "originatingPaymentClaimId" uuid,
           "sequence" integer,
           "description" text,
           "lineAmountExclTax" numeric,
           "taxAmount" numeric,
           "grossAmount" numeric,
           "originClaimNumber" text
         )
       )
       select 1
       from supplied line
       left join public.retention_claim_allocations allocation
         on allocation.id = line."allocationId"
        and allocation.retention_claim_id = claim_row.id
        and allocation.originating_payment_claim_id =
          line."originatingPaymentClaimId"
        and allocation.allocation_sequence = line."sequence"
        and allocation.allocation_amount =
          round(line."lineAmountExclTax", 2)
        and allocation.origin_claim_number_snapshot =
          line."originClaimNumber"
       where allocation.id is null
          or line."lineAmountExclTax" <= 0
          or line."taxAmount" < 0
          or round(line."taxAmount", 2) <>
            round(line."lineAmountExclTax" * 0.15, 2)
          or round(line."grossAmount", 2) <>
            round(line."lineAmountExclTax" + line."taxAmount", 2)
          or nullif(trim(line."description"), '') is null
     ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'allocation_evidence_mismatch'
    );
  end if;

  select * into accounting_document_row
  from public.organization_accounting_documents
  where organization_id = claim_row.organization_id
    and provider = 'xero'
    and tenant_id = p_tenant_id
    and local_document_type = 'retention_claim'
    and retention_claim_id = claim_row.id
  for update;

  if found then
    if accounting_document_row.accounting_connection_id <> p_connection_id
       or accounting_document_row.external_document_id is not null then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'accounting_document_locked'
      );
    end if;
  else
    insert into public.organization_accounting_documents(
      organization_id,
      accounting_connection_id,
      provider,
      tenant_id,
      local_document_type,
      local_document_id,
      project_claim_id,
      retention_claim_id,
      current_version_id,
      export_status,
      currency_code
    )
    values(
      claim_row.organization_id,
      p_connection_id,
      'xero',
      p_tenant_id,
      'retention_claim',
      null,
      null,
      claim_row.id,
      null,
      'not_ready',
      'NZD'
    )
    returning * into accounting_document_row;
  end if;

  select * into accounting_snapshot_row
  from public.retention_claim_accounting_snapshots
  where retention_claim_id = claim_row.id;
  if found then
    if accounting_snapshot_row.payload_sha256 <> p_payload_sha256
       or accounting_snapshot_row.retention_source_evidence_hash <>
         p_retention_source_evidence_hash
       or accounting_snapshot_row.retention_pdf_sha256 <>
         p_retention_pdf_sha256
       or accounting_snapshot_row.accounting_document_id <>
         accounting_document_row.id then
      return jsonb_build_object(
        'succeeded', false, 'errorCode', 'accounting_snapshot_conflict'
      );
    end if;
  else
    insert into public.retention_claim_accounting_snapshots(
      organization_id,
      project_id,
      retention_claim_id,
      accounting_document_id,
      retention_document_id,
      retention_source_evidence_hash,
      retention_pdf_sha256,
      payload_sha256,
      idempotency_key,
      connection_id_snapshot,
      tenant_id_snapshot,
      contact_id_snapshot,
      invoice_number_snapshot,
      reference_snapshot,
      invoice_date_snapshot,
      due_date_snapshot,
      subtotal_excl_tax_snapshot,
      tax_total_snapshot,
      total_snapshot,
      retention_mapping_id_snapshot,
      organization_cost_code_id_snapshot,
      xero_account_id_snapshot,
      xero_account_code_snapshot,
      tax_rate_id_snapshot,
      xero_tax_type_snapshot,
      tax_rate_basis_points_snapshot,
      payload_snapshot,
      created_by
    )
    values(
      claim_row.organization_id,
      claim_row.project_id,
      claim_row.id,
      accounting_document_row.id,
      retention_document_row.id,
      p_retention_source_evidence_hash,
      p_retention_pdf_sha256,
      p_payload_sha256,
      p_idempotency_key,
      p_connection_id,
      p_tenant_id,
      p_contact_id,
      p_invoice_number,
      p_reference,
      p_invoice_date,
      p_due_date,
      round(p_subtotal_excl_tax, 2),
      round(p_tax_total, 2),
      round(p_total, 2),
      p_retention_mapping_id,
      p_organization_cost_code_id,
      p_xero_account_id,
      p_xero_account_code,
      p_tax_rate_id,
      p_xero_tax_type,
      p_tax_rate_basis_points,
      p_payload_snapshot,
      p_actor_user_id
    )
    returning * into accounting_snapshot_row;
    created_snapshot := true;

    insert into public.retention_claim_accounting_lines(
      organization_id,
      project_id,
      retention_claim_id,
      accounting_snapshot_id,
      retention_claim_allocation_id,
      originating_payment_claim_id,
      sequence,
      description,
      line_amount_excl_tax,
      tax_amount,
      gross_amount,
      origin_claim_number_snapshot,
      retention_mapping_id_snapshot,
      organization_cost_code_id_snapshot,
      xero_account_id_snapshot,
      xero_account_code_snapshot,
      xero_tax_type_snapshot
    )
    select
      claim_row.organization_id,
      claim_row.project_id,
      claim_row.id,
      accounting_snapshot_row.id,
      line."allocationId",
      line."originatingPaymentClaimId",
      line."sequence",
      trim(line."description"),
      round(line."lineAmountExclTax", 2),
      round(line."taxAmount", 2),
      round(line."grossAmount", 2),
      line."originClaimNumber",
      p_retention_mapping_id,
      p_organization_cost_code_id,
      p_xero_account_id,
      p_xero_account_code,
      p_xero_tax_type
    from jsonb_to_recordset(p_lines) as line(
      "allocationId" uuid,
      "originatingPaymentClaimId" uuid,
      "sequence" integer,
      "description" text,
      "lineAmountExclTax" numeric,
      "taxAmount" numeric,
      "grossAmount" numeric,
      "originClaimNumber" text
    )
    order by line."sequence";

    insert into public.retention_claim_accounting_events(
      organization_id,
      project_id,
      retention_claim_id,
      accounting_document_id,
      accounting_snapshot_id,
      event_type,
      actor_user_id,
      correlation_id,
      metadata
    )
    values(
      claim_row.organization_id,
      claim_row.project_id,
      claim_row.id,
      accounting_document_row.id,
      accounting_snapshot_row.id,
      'accounting_snapshot_prepared',
      p_actor_user_id,
      p_correlation_id,
      jsonb_build_object(
        'payloadSha256', p_payload_sha256,
        'retentionSourceEvidenceHash', p_retention_source_evidence_hash,
        'retentionPdfSha256', p_retention_pdf_sha256,
        'subtotalExclTax', round(p_subtotal_excl_tax, 2),
        'taxTotal', round(p_tax_total, 2),
        'total', round(p_total, 2),
        'lineCount', supplied_line_count
      )
    );
  end if;

  select job.id into active_job_id
  from public.organization_accounting_sync_jobs job
  where job.organization_id = claim_row.organization_id
    and job.provider = 'xero'
    and job.connection_id = p_connection_id
    and job.job_kind = 'xero.retention_claim.sync'
    and job.queue_state in ('pending', 'claimed', 'retry_scheduled')
    and job.request_payload->>'accountingDocumentId' =
      accounting_document_row.id::text
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
      claim_row.organization_id,
      'xero',
      p_connection_id,
      'xero.retention_claim.sync',
      case when accounting_document_row.export_status in (
        'failed', 'attention_required'
      ) then 'user_retry' else 'user_export' end,
      'pending',
      jsonb_build_object(
        'accountingDocumentId', accounting_document_row.id,
        'accountingSnapshotId', accounting_snapshot_row.id,
        'payloadSha256', p_payload_sha256
      ),
      '{}'::jsonb,
      null,
      3,
      p_actor_user_id
    )
    returning id into active_job_id;
    created_job := true;

    insert into public.retention_claim_accounting_events(
      organization_id,
      project_id,
      retention_claim_id,
      accounting_document_id,
      accounting_snapshot_id,
      event_type,
      actor_user_id,
      correlation_id,
      metadata
    )
    values(
      claim_row.organization_id,
      claim_row.project_id,
      claim_row.id,
      accounting_document_row.id,
      accounting_snapshot_row.id,
      'xero_sync_queued',
      p_actor_user_id,
      p_correlation_id,
      jsonb_build_object('jobId', active_job_id)
    );
  end if;

  update public.organization_accounting_documents
  set
    export_status = case
      when exists (
        select 1 from public.organization_accounting_sync_jobs job
        where job.id = active_job_id and job.queue_state = 'claimed'
      ) then 'exporting'
      else 'queued'
    end,
    last_error_code = null,
    last_error_message = null
  where id = accounting_document_row.id;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'createdSnapshot', created_snapshot,
    'createdJob', created_job,
    'accountingDocumentId', accounting_document_row.id,
    'accountingSnapshotId', accounting_snapshot_row.id,
    'jobId', active_job_id
  );
end;
$$;

create or replace function public.record_retention_claim_xero_event(
  p_accounting_document_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_correlation_id text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_row public.retention_claim_accounting_snapshots%rowtype;
  event_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  if p_event_type not in (
    'xero_invoice_created',
    'xero_sync_failed',
    'xero_attachment_queued',
    'xero_attachment_attached',
    'xero_attachment_failed'
  ) or p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'invalid_event'
    );
  end if;

  select * into snapshot_row
  from public.retention_claim_accounting_snapshots
  where accounting_document_id = p_accounting_document_id;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'accounting_document_not_found'
    );
  end if;

  insert into public.retention_claim_accounting_events(
    organization_id,
    project_id,
    retention_claim_id,
    accounting_document_id,
    accounting_snapshot_id,
    event_type,
    actor_user_id,
    correlation_id,
    metadata
  )
  values(
    snapshot_row.organization_id,
    snapshot_row.project_id,
    snapshot_row.retention_claim_id,
    snapshot_row.accounting_document_id,
    snapshot_row.id,
    p_event_type,
    p_actor_user_id,
    p_correlation_id,
    p_metadata
  )
  returning id into event_id;

  return jsonb_build_object(
    'succeeded', true, 'errorCode', null, 'eventId', event_id
  );
end;
$$;

create or replace function public.queue_retention_claim_xero_attachment(
  p_accounting_document_id uuid,
  p_actor_user_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.organization_accounting_documents%rowtype;
  snapshot_row public.retention_claim_accounting_snapshots%rowtype;
  active_job_id uuid;
  created_job boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  select * into document_row
  from public.organization_accounting_documents
  where id = p_accounting_document_id
    and provider = 'xero'
    and local_document_type = 'retention_claim'
  for update;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'accounting_document_not_found'
    );
  end if;

  if not private.retention_phase8_actor_has_permission(
    document_row.organization_id,
    p_actor_user_id,
    'retention.claims.xero.manage'
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'permission_denied'
    );
  end if;

  if document_row.external_document_id is null
     or document_row.export_status <> 'exported' then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'invoice_not_synchronized'
    );
  end if;

  select * into snapshot_row
  from public.retention_claim_accounting_snapshots
  where accounting_document_id = document_row.id;
  if not found then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'accounting_snapshot_missing'
    );
  end if;

  if exists (
    select 1
    from public.organization_accounting_sync_jobs job
    where job.organization_id = document_row.organization_id
      and job.provider = 'xero'
      and job.job_kind = 'xero.retention_claim.sync'
      and job.queue_state in ('pending', 'claimed', 'retry_scheduled')
      and job.request_payload->>'accountingDocumentId' =
        document_row.id::text
  ) then
    return jsonb_build_object(
      'succeeded', false, 'errorCode', 'sync_in_progress'
    );
  end if;

  select job.id into active_job_id
  from public.organization_accounting_sync_jobs job
  where job.organization_id = document_row.organization_id
    and job.provider = 'xero'
    and job.job_kind = 'xero.retention_claim.attachment'
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
      'xero.retention_claim.attachment',
      case when document_row.attachment_status = 'failed'
        then 'user_retry' else 'user_export' end,
      'pending',
      jsonb_build_object(
        'accountingDocumentId', document_row.id,
        'accountingSnapshotId', snapshot_row.id,
        'pdfSha256', snapshot_row.retention_pdf_sha256
      ),
      '{}'::jsonb,
      null,
      3,
      p_actor_user_id
    )
    returning id into active_job_id;
    created_job := true;

    update public.organization_accounting_documents
    set
      attachment_status = 'queued',
      attachment_error_code = null,
      attachment_error_message = null
    where id = document_row.id;

    insert into public.retention_claim_accounting_events(
      organization_id,
      project_id,
      retention_claim_id,
      accounting_document_id,
      accounting_snapshot_id,
      event_type,
      actor_user_id,
      correlation_id,
      metadata
    )
    values(
      snapshot_row.organization_id,
      snapshot_row.project_id,
      snapshot_row.retention_claim_id,
      document_row.id,
      snapshot_row.id,
      'xero_attachment_queued',
      p_actor_user_id,
      p_correlation_id,
      jsonb_build_object(
        'jobId', active_job_id,
        'pdfSha256', snapshot_row.retention_pdf_sha256
      )
    );
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

revoke all on function private.retention_phase9_gate_enabled()
  from public, anon, authenticated;
revoke all on function private.retention_phase9_context(uuid, text)
  from public, anon, authenticated;

revoke all on function public.get_retention_claim_xero_source(uuid)
  from public, anon;
grant execute on function public.get_retention_claim_xero_source(uuid)
  to authenticated;

revoke all on function public.get_retention_claim_xero_access(uuid)
  from public, anon;
grant execute on function public.get_retention_claim_xero_access(uuid)
  to authenticated;

revoke all on function public.prepare_retention_claim_xero_sync(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text, text, text,
  date, date, numeric, numeric, numeric, uuid, uuid, text, text, uuid,
  text, integer, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.prepare_retention_claim_xero_sync(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text, text, text,
  date, date, numeric, numeric, numeric, uuid, uuid, text, text, uuid,
  text, integer, jsonb, jsonb, text
) to service_role;

revoke all on function public.record_retention_claim_xero_event(
  uuid, text, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_retention_claim_xero_event(
  uuid, text, uuid, text, jsonb
) to service_role;

revoke all on function public.queue_retention_claim_xero_attachment(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.queue_retention_claim_xero_attachment(
  uuid, uuid, text
) to service_role;

commit;
