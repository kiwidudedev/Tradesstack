create or replace function public.apply_xero_sales_invoice_payment_to_claim(
  p_organization_id uuid,
  p_document_id uuid,
  p_project_claim_id uuid,
  p_accounting_connection_id uuid,
  p_tenant_id text,
  p_external_document_id text,
  p_expected_claim_updated_at timestamptz,
  p_raw_external_status text,
  p_normalized_external_status text,
  p_amount_paid numeric,
  p_amount_due numeric,
  p_amount_credited numeric,
  p_fully_paid_at timestamptz,
  p_provider_updated_at timestamptz,
  p_status_synced_at timestamptz,
  p_attention_message text,
  p_projected_claim_status text,
  p_projected_paid_amount numeric
)
returns table (
  document_id uuid,
  claim_id uuid,
  claim_status text,
  claim_paid_amount numeric,
  claim_projection_applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.organization_accounting_documents%rowtype;
  v_claim public.project_claims%rowtype;
  v_apply_claim_projection boolean := false;
begin
  select d.*
  into v_document
  from public.organization_accounting_documents d
  where d.id = p_document_id
    and d.organization_id = p_organization_id
    and d.provider = 'xero'
    and d.local_document_type = 'project_claim'
    and d.project_claim_id = p_project_claim_id
    and d.accounting_connection_id = p_accounting_connection_id
    and d.tenant_id = p_tenant_id
    and d.external_document_id = p_external_document_id
  for update;

  if not found then
    raise exception 'The accounting document identity changed during status refresh.' using errcode = '40001';
  end if;

  select c.*
  into v_claim
  from public.project_claims c
  where c.id = p_project_claim_id
    and c.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'The linked Payment Claim identity is invalid.' using errcode = '40001';
  end if;

  if p_expected_claim_updated_at is not null
    and v_claim.updated_at is distinct from p_expected_claim_updated_at then
    raise exception 'The Payment Claim changed while Xero payment status was refreshing.' using errcode = '40001';
  end if;

  if p_amount_paid < 0 or p_amount_due < 0 or p_amount_credited < 0 then
    raise exception 'Xero payment values must be non-negative.';
  end if;

  update public.organization_accounting_documents d
  set
    raw_external_status = p_raw_external_status,
    normalized_external_status = p_normalized_external_status,
    amount_paid = round(p_amount_paid, 2),
    amount_due = round(p_amount_due, 2),
    amount_credited = round(p_amount_credited, 2),
    fully_paid_at = p_fully_paid_at,
    provider_updated_at = coalesce(p_provider_updated_at, d.provider_updated_at),
    last_status_synced_at = p_status_synced_at,
    last_status_sync_error = p_attention_message
  where d.id = v_document.id;

  v_apply_claim_projection :=
    p_attention_message is null
    and v_claim.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
    and p_projected_claim_status in ('Unpaid', 'Paid', 'Overdue')
    and p_projected_paid_amount is not null
    and p_projected_paid_amount >= 0;

  if v_apply_claim_projection then
    update public.project_claims c
    set
      status = p_projected_claim_status,
      paid_amount = round(p_projected_paid_amount, 2)
    where c.id = v_claim.id
      and c.organization_id = p_organization_id
      and c.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue');

    select c.* into v_claim
    from public.project_claims c
    where c.id = p_project_claim_id
      and c.organization_id = p_organization_id;
  end if;

  return query
  select
    v_document.id,
    v_claim.id,
    v_claim.status,
    v_claim.paid_amount,
    v_apply_claim_projection;
end;
$$;

revoke all on function public.apply_xero_sales_invoice_payment_to_claim(
  uuid, uuid, uuid, uuid, text, text, timestamptz, text, text, numeric, numeric,
  numeric, timestamptz, timestamptz, timestamptz, text, text, numeric
) from public, anon, authenticated;

grant execute on function public.apply_xero_sales_invoice_payment_to_claim(
  uuid, uuid, uuid, uuid, text, text, timestamptz, text, text, numeric, numeric,
  numeric, timestamptz, timestamptz, timestamptz, text, text, numeric
) to service_role;
