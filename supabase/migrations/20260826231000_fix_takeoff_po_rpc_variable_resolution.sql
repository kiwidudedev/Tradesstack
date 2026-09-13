begin;

-- PostgreSQL treats an unqualified identifier that is both a PL/pgSQL variable
-- and a column as ambiguous. Recompile the already-deployed RPC with the same
-- explicit variable-resolution policy recorded in its source migration.
do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.publish_takeoff_commercial_purchase_order_v1(jsonb)'::regprocedure)
  into function_definition;

  if position('#variable_conflict use_variable' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      E'AS $function$\n',
      E'AS $function$\n#variable_conflict use_variable\n'
    );
    execute function_definition;
  end if;
end;
$migration$;

commit;
