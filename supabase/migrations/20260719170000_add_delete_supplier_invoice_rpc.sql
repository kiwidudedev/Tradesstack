begin;

create or replace function public.delete_supplier_invoice(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_member public.organization_members%rowtype;
  v_invoice public.supplier_invoices%rowtype;
  v_accounting_document public.organization_accounting_documents%rowtype;
  v_storage_paths text[] := '{}'::text[];
begin
  if auth.uid() is null then
    raise exception 'You do not have permission to delete this Supplier Invoice.';
  end if;

  select *
  into v_member
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = auth.uid()
  order by created_at
  limit 1;

  if not found
    or v_member.role not in ('owner', 'admin')
    or not public.has_org_permission(p_organization_id, 'supplier_invoices.capture') then
    raise exception 'You do not have permission to delete this Supplier Invoice.';
  end if;

  select *
  into v_invoice
  from public.supplier_invoices
  where id = p_supplier_invoice_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'This Supplier Invoice has already been deleted or no longer exists.';
  end if;

  if exists (
    select 1
    from public.project_actual_cost_events e
    where e.organization_id = p_organization_id
      and e.supplier_invoice_id = p_supplier_invoice_id
      and e.event_status = 'posted'
  ) then
    raise exception 'This invoice cannot be deleted because it has posted actual costs. Reverse those costs before deleting the invoice.';
  end if;

  select *
  into v_accounting_document
  from public.organization_accounting_documents d
  where d.organization_id = p_organization_id
    and d.local_document_type = 'supplier_invoice'
    and d.local_document_id = p_supplier_invoice_id
  order by d.created_at desc
  limit 1
  for update;

  if found then
    if coalesce(v_accounting_document.amount_paid, 0) > 0
      or v_accounting_document.fully_paid_at is not null
      or coalesce(v_accounting_document.normalized_external_status, '') in ('partially_paid', 'paid') then
      raise exception 'This Supplier Invoice cannot be deleted because a payment has been recorded against its Xero Bill.';
    end if;

    if v_accounting_document.external_document_id is not null
      or coalesce(v_accounting_document.export_status, '') in ('exported', 'attention_required')
      or coalesce(v_accounting_document.normalized_external_status, '') <> '' then
      raise exception 'This Supplier Invoice cannot be deleted because it has already been exported to Xero.';
    end if;

    raise exception 'This Supplier Invoice cannot be deleted because its Xero Bill export is queued or complete.';
  end if;

  select coalesce(array_agg(distinct d.file_path) filter (where char_length(trim(coalesce(d.file_path, ''))) > 0), '{}'::text[])
  into v_storage_paths
  from public.supplier_invoice_documents d
  where d.organization_id = p_organization_id
    and d.supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_site_review_decisions
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_accounts_approvals
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_site_review_submissions
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_commercial_variances
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_commercial_line_snapshots
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_commercial_approvals
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_approval_steps
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_activity_events
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_document_extractions
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_purchase_order_matches
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_line_allocations
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_documents
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoice_lines
  where organization_id = p_organization_id
    and supplier_invoice_id = p_supplier_invoice_id;

  delete from public.supplier_invoices
  where organization_id = p_organization_id
    and id = p_supplier_invoice_id;

  if not found then
    raise exception 'The Supplier Invoice could not be deleted. No records were removed.';
  end if;

  return jsonb_build_object(
    'deletedInvoiceId', p_supplier_invoice_id,
    'storagePaths', to_jsonb(v_storage_paths)
  );
end;
$$;

revoke all on function public.delete_supplier_invoice(uuid, uuid) from public, anon;
grant execute on function public.delete_supplier_invoice(uuid, uuid) to authenticated;
grant execute on function public.delete_supplier_invoice(uuid, uuid) to service_role;

commit;
