create or replace function public.record_xero_bill_snapshot_prepared_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  accounting_document public.organization_accounting_documents%rowtype;
begin
  select *
  into accounting_document
  from public.organization_accounting_documents
  where id = new.document_id;

  if accounting_document.local_document_type = 'supplier_invoice'
     and accounting_document.provider = 'xero' then
    insert into public.supplier_invoice_activity_events (
      organization_id,
      supplier_invoice_id,
      event_type,
      message,
      metadata,
      created_by
    )
    values (
      new.organization_id,
      accounting_document.local_document_id,
      'xero_export_prepared',
      'Immutable Draft Xero Bill export snapshot prepared.',
      jsonb_build_object(
        'accounting_document_id', accounting_document.id,
        'accounting_document_version_id', new.id,
        'idempotency_key', new.idempotency_key
      ),
      new.created_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists record_xero_bill_snapshot_prepared_activity
on public.organization_accounting_document_versions;

create trigger record_xero_bill_snapshot_prepared_activity
after insert on public.organization_accounting_document_versions
for each row
execute function public.record_xero_bill_snapshot_prepared_activity();

revoke all on function public.record_xero_bill_snapshot_prepared_activity() from public;
revoke all on function public.record_xero_bill_snapshot_prepared_activity() from anon;
revoke all on function public.record_xero_bill_snapshot_prepared_activity() from authenticated;
grant execute on function public.record_xero_bill_snapshot_prepared_activity() to service_role;
