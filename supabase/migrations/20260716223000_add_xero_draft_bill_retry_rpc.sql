begin;

create or replace function public.retry_supplier_invoice_xero_bill_export(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.organization_accounting_documents%rowtype;
  v_job public.organization_accounting_sync_jobs%rowtype;
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'accounting.ap_bills.retry') then
    raise exception 'You do not have permission to retry this Xero export.';
  end if;

  select * into v_document
  from public.organization_accounting_documents
  where organization_id = p_organization_id
    and local_document_type = 'supplier_invoice'
    and local_document_id = p_supplier_invoice_id
    and export_status = 'failed'
    and current_version_id is not null
  for update;
  if not found then
    raise exception 'Only a proven pre-request Xero export failure can be retried.';
  end if;

  select * into v_job
  from public.organization_accounting_sync_jobs
  where organization_id = p_organization_id
    and provider = 'xero'
    and job_kind = 'xero.bill.export'
    and request_payload ->> 'documentVersionId' = v_document.current_version_id::text
    and queue_state = 'dead_lettered'
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'The failed Xero Bill job is not available for retry.';
  end if;

  update public.organization_accounting_sync_jobs
  set queue_state = 'pending',
      trigger_source = 'user_retry',
      attempt_count = 0,
      available_at = now(),
      retry_after = null,
      claimed_at = null,
      claimed_by = null,
      claim_expires_at = null,
      last_completed_at = null,
      last_error = null,
      result_summary = '{}'::jsonb,
      created_by_user_id = auth.uid()
  where id = v_job.id;

  update public.organization_accounting_documents
  set export_status = 'queued',
      last_error_code = null,
      last_error_message = null
  where id = v_document.id;

  update public.organization_accounting_document_versions
  set status = 'queued',
      request_started_at = null
  where id = v_document.current_version_id
    and status = 'failed';
  if not found then
    raise exception 'The failed Xero Bill version is not available for retry.';
  end if;

  insert into public.supplier_invoice_activity_events (
    organization_id,
    supplier_invoice_id,
    event_type,
    message,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    p_supplier_invoice_id,
    'xero_export_retry_requested',
    'Draft Xero Bill export retry requested.',
    jsonb_build_object(
      'accounting_document_id', v_document.id,
      'accounting_document_version_id', v_document.current_version_id,
      'job_id', v_job.id
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'documentId', v_document.id,
    'versionId', v_document.current_version_id,
    'jobId', v_job.id,
    'status', 'queued'
  );
end;
$$;

grant execute on function public.retry_supplier_invoice_xero_bill_export(uuid, uuid)
  to authenticated;

commit;
