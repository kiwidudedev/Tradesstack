begin;

do $migration$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(
    'public.confirm_payment_claim_replacement_phase2c(jsonb)'::regprocedure
  ) into v_definition;
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    E'  v_job_id uuid;\nbegin',
    E'  v_job_id uuid;\n  v_missing_confirmed boolean := false;\nbegin'
  );
  v_definition := replace(
    v_definition,
    E'  select * into v_projection from public.organization_accounting_projections',
    E'  select exists (\n'
      || E'    select 1 from public.organization_accounting_events e\n'
      || E'    where e.organization_id = v_org\n'
      || E'      and e.accounting_document_id = v_document.id\n'
      || E'      and e.accounting_revision_id = v_previous.id\n'
      || E'      and e.event_type = ''provider_missing_confirmed''\n'
      || E'  ) into v_missing_confirmed;\n\n'
      || E'  select * into v_projection from public.organization_accounting_projections'
  );
  v_definition := replace(
    v_definition,
    E'    or v_projection.normalized_invoice_status not in (''voided'', ''deleted'')',
    E'    or (\n'
      || E'      v_projection.normalized_invoice_status NOT IN (''voided'', ''deleted'')\n'
      || E'      and not v_missing_confirmed\n'
      || E'    )'
  );
  v_definition := replace(
    v_definition,
    E'''confirmationReason'', ''Previous Xero invoice voided'',',
    E'''confirmationReason'', case when v_missing_confirmed\n'
      || E'        then ''Previous Xero invoice confirmed permanently missing''\n'
      || E'        else ''Previous Xero invoice voided''\n'
      || E'      end,'
  );

  if v_definition = v_original
    or position('v_missing_confirmed boolean := false' in v_definition) = 0
    or position('provider_missing_confirmed' in v_definition) = 0
    or position('and not v_missing_confirmed' in v_definition) = 0 then
    raise exception 'Unable to safely extend Payment Claim replacement confirmation.';
  end if;

  execute v_definition;
end;
$migration$;

commit;
