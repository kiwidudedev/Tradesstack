begin;

alter table public.organization_accounting_documents
  add column if not exists amount_paid numeric(14,2) null,
  add column if not exists amount_due numeric(14,2) null,
  add column if not exists amount_credited numeric(14,2) null,
  add column if not exists fully_paid_at timestamptz null,
  add column if not exists provider_updated_at timestamptz null,
  add column if not exists last_status_synced_at timestamptz null,
  add column if not exists last_status_sync_error text null;

alter table public.organization_accounting_documents
  drop constraint if exists organization_accounting_documents_inbound_amounts_non_negative;

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_inbound_amounts_non_negative check (
    (amount_paid is null or amount_paid >= 0)
    and (amount_due is null or amount_due >= 0)
    and (amount_credited is null or amount_credited >= 0)
  );

alter table public.organization_accounting_documents
  drop constraint if exists organization_accounting_documents_normalized_external_status_check;

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_normalized_external_status_check check (
    normalized_external_status is null
    or normalized_external_status in (
      'draft',
      'awaiting_approval',
      'awaiting_payment',
      'partially_paid',
      'paid',
      'voided',
      'deleted',
      'unknown'
    )
  ) not valid;

alter table public.organization_accounting_documents
  validate constraint organization_accounting_documents_normalized_external_status_check;

create index if not exists organization_accounting_documents_status_poll_idx
  on public.organization_accounting_documents (
    provider,
    normalized_external_status,
    last_status_synced_at,
    updated_at
  )
  where export_status = 'exported'
    and external_document_id is not null;

create or replace function public.apply_xero_bill_status_refresh(
  p_organization_id uuid,
  p_document_id uuid,
  p_expected_tenant_id text,
  p_expected_external_document_id text,
  p_raw_external_status text,
  p_normalized_external_status text,
  p_amount_paid numeric,
  p_amount_due numeric,
  p_amount_credited numeric,
  p_fully_paid_at timestamptz,
  p_provider_updated_at timestamptz,
  p_synced_at timestamptz,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_document public.organization_accounting_documents%rowtype;
  v_changed boolean;
  v_stale boolean;
  v_message text;
begin
  select *
  into v_document
  from public.organization_accounting_documents
  where id = p_document_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Accounting document not found.';
  end if;
  if v_document.provider <> 'xero'
    or v_document.tenant_id <> trim(p_expected_tenant_id)
    or v_document.external_document_id <> trim(p_expected_external_document_id) then
    raise exception 'Accounting document provider identity does not match.';
  end if;
  if p_normalized_external_status not in (
    'draft', 'awaiting_approval', 'awaiting_payment', 'partially_paid',
    'paid', 'voided', 'deleted', 'unknown'
  ) then
    raise exception 'Normalized accounting status is invalid.';
  end if;

  v_stale := v_document.provider_updated_at is not null
    and p_provider_updated_at is not null
    and p_provider_updated_at < v_document.provider_updated_at;

  if v_stale then
    return jsonb_build_object(
      'applied', false,
      'changed', false,
      'stale', true,
      'normalizedStatus', v_document.normalized_external_status
    );
  end if;

  v_changed := v_document.raw_external_status is distinct from p_raw_external_status
    or v_document.normalized_external_status is distinct from p_normalized_external_status
    or v_document.amount_paid is distinct from p_amount_paid
    or v_document.amount_due is distinct from p_amount_due
    or v_document.amount_credited is distinct from p_amount_credited
    or v_document.fully_paid_at is distinct from p_fully_paid_at;

  update public.organization_accounting_documents
  set raw_external_status = p_raw_external_status,
      normalized_external_status = p_normalized_external_status,
      amount_paid = p_amount_paid,
      amount_due = p_amount_due,
      amount_credited = p_amount_credited,
      fully_paid_at = p_fully_paid_at,
      provider_updated_at = coalesce(p_provider_updated_at, provider_updated_at),
      last_status_synced_at = p_synced_at,
      last_synced_at = p_synced_at,
      last_status_sync_error = null,
      last_error_code = null,
      last_error_message = null,
      updated_at = p_synced_at
  where id = v_document.id;

  if v_changed then
    v_message := case p_normalized_external_status
      when 'paid' then 'Xero Bill paid.'
      when 'partially_paid' then 'Xero Bill partially paid.'
      when 'awaiting_payment' then 'Xero Bill is awaiting payment.'
      when 'awaiting_approval' then 'Xero Bill is awaiting approval.'
      when 'voided' then 'Xero Bill voided.'
      when 'deleted' then 'Xero Bill deleted.'
      else 'Xero Bill status refreshed.'
    end;

    insert into public.supplier_invoice_activity_events (
      organization_id,
      supplier_invoice_id,
      event_type,
      message,
      metadata,
      created_by
    ) values (
      v_document.organization_id,
      v_document.local_document_id,
      'xero_bill_status_refreshed',
      v_message,
      jsonb_build_object(
        'accounting_document_id', v_document.id,
        'job_id', p_job_id,
        'previous_normalized_status', v_document.normalized_external_status,
        'new_normalized_status', p_normalized_external_status,
        'previous_amount_paid', v_document.amount_paid,
        'new_amount_paid', p_amount_paid,
        'previous_amount_due', v_document.amount_due,
        'new_amount_due', p_amount_due,
        'provider_updated_at', p_provider_updated_at
      ),
      v_document.exported_by
    );
  end if;

  return jsonb_build_object(
    'applied', true,
    'changed', v_changed,
    'stale', false,
    'normalizedStatus', p_normalized_external_status
  );
end;
$$;

create or replace function public.record_xero_bill_status_sync_error(
  p_organization_id uuid,
  p_document_id uuid,
  p_safe_error text,
  p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_document public.organization_accounting_documents%rowtype;
begin
  select *
  into v_document
  from public.organization_accounting_documents
  where id = p_document_id
    and organization_id = p_organization_id
  for update;

  if not found then
    return;
  end if;

  update public.organization_accounting_documents
  set last_status_sync_error = p_safe_error,
      updated_at = now()
  where id = v_document.id;

  if v_document.last_status_sync_error is distinct from p_safe_error then
    insert into public.supplier_invoice_activity_events (
      organization_id,
      supplier_invoice_id,
      event_type,
      message,
      metadata,
      created_by
    ) values (
      v_document.organization_id,
      v_document.local_document_id,
      'xero_bill_status_refresh_failed',
      'Xero Bill status refresh failed.',
      jsonb_build_object(
        'accounting_document_id', v_document.id,
        'job_id', p_job_id
      ),
      v_document.exported_by
    );
  end if;
end;
$$;

revoke all on function public.apply_xero_bill_status_refresh(
  uuid, uuid, text, text, text, text, numeric, numeric, numeric,
  timestamptz, timestamptz, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.apply_xero_bill_status_refresh(
  uuid, uuid, text, text, text, text, numeric, numeric, numeric,
  timestamptz, timestamptz, timestamptz, uuid
) to service_role;

revoke all on function public.record_xero_bill_status_sync_error(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_xero_bill_status_sync_error(uuid, uuid, text, uuid)
  to service_role;

commit;
