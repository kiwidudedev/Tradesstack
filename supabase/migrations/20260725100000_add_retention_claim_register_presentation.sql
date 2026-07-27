begin;

-- Add the minimum project-level presentation facts needed by the embedded
-- Retention Claims register. This remains a stable, read-only projection over
-- existing immutable Retention and accounting evidence.
create or replace function public.get_project_retention_claim_history(
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  context jsonb;
  can_view_xero boolean := false;
begin
  context := private.retention_claim_operation_context(
    p_project_id,
    'retention.view',
    false
  );
  if not coalesce((context ->> 'succeeded')::boolean, false) then
    return context || jsonb_build_object(
      'xeroVisible', false,
      'claims', '[]'::jsonb
    );
  end if;

  can_view_xero := public.has_org_permission(
    (context ->> 'organizationId')::uuid,
    'retention.claims.xero.view'
  );

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'xeroVisible', can_view_xero,
    'claims', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'claim', private.retention_claim_header_json(claim.id),
          'originCount', coalesce(origins.origin_count, 0),
          'paidAmount', coalesce(payment.paid_amount_excl_tax, 0),
          'outstandingAmount',
            greatest(
              claim.subtotal_excl_tax
              - coalesce(payment.paid_amount_excl_tax, 0),
              0
            ),
          'xeroStatus',
            case when can_view_xero then accounting.export_status else null end
        )
        order by claim.created_at desc, claim.id desc
      )
      from public.retention_claims claim
      left join lateral (
        select count(distinct represented.originating_payment_claim_id)
          as origin_count
        from (
          select allocation.originating_payment_claim_id
          from public.retention_claim_allocations allocation
          where allocation.retention_claim_id = claim.id
          union all
          select candidate.originating_payment_claim_id
          from public.retention_rolling_draft_origins candidate
          where candidate.retention_claim_id = claim.id
        ) represented
      ) origins on true
      left join lateral (
        select reconciliation.paid_amount_excl_tax
        from public.retention_claim_payment_reconciliations reconciliation
        where reconciliation.retention_claim_id = claim.id
          and reconciliation.projection_applied
        order by reconciliation.reconciliation_sequence desc
        limit 1
      ) payment on true
      left join lateral (
        select document.export_status
        from public.organization_accounting_documents document
        where can_view_xero
          and document.organization_id = claim.organization_id
          and document.local_document_type = 'retention_claim'
          and document.retention_claim_id = claim.id
        order by document.updated_at desc, document.id desc
        limit 1
      ) accounting on true
      where claim.organization_id = (context ->> 'organizationId')::uuid
        and claim.project_id = p_project_id
        and not (
          claim.status = 'draft'
          and claim.draft_kind = 'automatic_rolling'
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_project_retention_claim_history(uuid)
  from public, anon;
grant execute on function public.get_project_retention_claim_history(uuid)
  to authenticated;

commit;
