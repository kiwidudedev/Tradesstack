do $migration$
declare
  function_signature regprocedure :=
    to_regprocedure('public.prepare_supplier_invoice_xero_bill_export(uuid,uuid)');
  function_definition text;
begin
  if function_signature is null then
    raise exception 'prepare_supplier_invoice_xero_bill_export(uuid, uuid) does not exist';
  end if;

  select pg_get_functiondef(function_signature)
  into function_definition;

  if position('accounting.invoices' in function_definition) > 0
     and position('accounting.transactions' in function_definition) = 0 then
    return;
  end if;

  if position('accounting.transactions' in function_definition) = 0 then
    raise exception 'Expected legacy Xero transaction scope check was not found';
  end if;

  function_definition := replace(
    function_definition,
    'accounting.transactions',
    'accounting.invoices'
  );
  function_definition := replace(
    function_definition,
    'Reconnect Xero to grant accounting.invoices before exporting Bills.',
    'Reconnect Xero to grant invoice and Bill access.'
  );

  execute function_definition;
end;
$migration$;
