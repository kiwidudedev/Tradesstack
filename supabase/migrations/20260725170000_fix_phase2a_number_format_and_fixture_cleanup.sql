begin;

-- PostgreSQL lpad truncates values longer than its requested width. Preserve
-- the full sequence after eight digits while retaining zero padding below it.
create or replace function public.format_accounting_sales_invoice_number_phase2a(
  p_sequence bigint
)
returns text
language sql
immutable
strict
security invoker
set search_path = public
as $$
  select case
    when p_sequence < 1 then null
    else 'TSI-' || case
      when char_length(p_sequence::text) >= 8 then p_sequence::text
      else lpad(p_sequence::text, 8, '0')
    end
  end;
$$;

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
language plpgsql
security definer
set search_path = public
as $$
declare
  next_sequence bigint;
  reservation public.organization_accounting_number_reservations%rowtype;
begin
  if p_source_document_type = 'project_claim' then
    if not exists (
      select 1 from public.project_claims c
      where c.id = p_source_document_id
        and c.organization_id = p_organization_id
    ) then
      raise exception 'Payment Claim does not belong to the reservation organization.';
    end if;
  elsif p_source_document_type = 'retention_claim' then
    if not exists (
      select 1 from public.retention_claims c
      where c.id = p_source_document_id
        and c.organization_id = p_organization_id
    ) then
      raise exception 'Retention Claim does not belong to the reservation organization.';
    end if;
  else
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
    next_sequence,
    public.format_accounting_sales_invoice_number_phase2a(next_sequence),
    p_accounting_document_id, p_source_document_type, p_source_document_id,
    p_reason, p_reserved_by
  ) returning * into reservation;
  return reservation;
end;
$$;

create or replace function public.reject_phase2a_append_only_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(
    current_setting('app.accounting_phase2a_verification_cleanup', true), ''
  ) = 'true' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Immutable accounting evidence is append-only.'
    using errcode = '55000';
end;
$$;

create or replace function public.guard_phase2a_revision_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(
    current_setting('app.accounting_phase2a_verification_cleanup', true), ''
  ) = 'true' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
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
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(
    current_setting('app.accounting_phase2a_verification_cleanup', true), ''
  ) = 'true' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
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
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(
    current_setting('app.accounting_phase2a_verification_cleanup', true), ''
  ) = 'true' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
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
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(
    current_setting('app.accounting_phase2a_verification_cleanup', true), ''
  ) = 'true' then
    return new;
  end if;
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

create or replace function public.cleanup_phase2a_verification_fixture(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_name text;
  deleted_documents bigint;
  deleted_revisions bigint;
begin
  select o.name into organization_name
  from public.organizations o
  where o.id = p_organization_id for update;
  if organization_name is null
    or organization_name not like '__phase2a_verification__%' then
    raise exception 'Cleanup is restricted to synthetic Phase 2A verification organizations.';
  end if;
  if exists (
    select 1 from public.organization_accounting_sync_jobs j
    where j.organization_id = p_organization_id
  ) then
    raise exception 'Verification cleanup refuses organizations with production accounting jobs.';
  end if;

  perform set_config(
    'app.accounting_phase2a_verification_cleanup', 'true', true
  );
  update public.organization_accounting_documents set
    active_accounting_revision_id = null,
    current_accounting_projection_id = null,
    current_legacy_classification_id = null
  where organization_id = p_organization_id;
  delete from public.organization_accounting_projections
    where organization_id = p_organization_id;
  delete from public.organization_accounting_events
    where organization_id = p_organization_id;
  delete from public.organization_accounting_remote_observations
    where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_attachments
    where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_lines
    where organization_id = p_organization_id;
  delete from public.organization_accounting_revision_attempts
    where organization_id = p_organization_id;
  delete from public.organization_accounting_legacy_classifications
    where organization_id = p_organization_id;
  update public.organization_accounting_document_revisions set
    previous_revision_id = null,
    superseded_by_revision_id = null,
    superseded_at = null,
    lifecycle_state = case when lifecycle_state = 'superseded'
      then 'succeeded' else lifecycle_state end
  where organization_id = p_organization_id;
  delete from public.organization_accounting_document_revisions
    where organization_id = p_organization_id;
  get diagnostics deleted_revisions = row_count;
  delete from public.organization_accounting_number_reservations
    where organization_id = p_organization_id;
  delete from public.organization_accounting_number_counters
    where organization_id = p_organization_id;
  delete from public.organization_accounting_documents
    where organization_id = p_organization_id;
  get diagnostics deleted_documents = row_count;
  perform set_config(
    'app.accounting_phase2a_verification_cleanup', '', true
  );

  -- These two append-only guards are disabled only while this transaction
  -- holds an access-exclusive table lock. Other sessions cannot observe the
  -- disabled state.
  alter table public.retention_claim_allocations
    disable trigger retention_claim_allocations_immutable_guard;
  alter table public.retention_claims
    disable trigger retention_claims_immutable_guard;
  delete from public.retention_claim_allocations
    where organization_id = p_organization_id;
  delete from public.retention_claims
    where organization_id = p_organization_id;
  alter table public.retention_claim_allocations
    enable trigger retention_claim_allocations_immutable_guard;
  alter table public.retention_claims
    enable trigger retention_claims_immutable_guard;

  delete from public.project_claims
    where organization_id = p_organization_id;
  delete from public.organization_xero_connections
    where organization_id = p_organization_id;
  delete from public.organization_projects
    where organization_id = p_organization_id;
  delete from public.organization_members
    where organization_id = p_organization_id;
  delete from public.organizations where id = p_organization_id;

  return jsonb_build_object(
    'organizationId', p_organization_id,
    'organizationName', organization_name,
    'deletedDocuments', deleted_documents,
    'deletedRevisions', deleted_revisions,
    'cleaned', true
  );
end;
$$;

revoke all on function
  public.format_accounting_sales_invoice_number_phase2a(bigint),
  public.reserve_accounting_sales_invoice_number_phase2a(uuid,text,text,text,uuid,uuid,uuid,text),
  public.cleanup_phase2a_verification_fixture(uuid)
from public, anon, authenticated;
grant execute on function
  public.format_accounting_sales_invoice_number_phase2a(bigint),
  public.reserve_accounting_sales_invoice_number_phase2a(uuid,text,text,text,uuid,uuid,uuid,text),
  public.cleanup_phase2a_verification_fixture(uuid)
to service_role;

commit;
