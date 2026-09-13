begin;

-- The source factory's named return contract is intentionally not in physical
-- commercial_items column order (the Takeoff FK was added later). A generic
-- record preserves the returned names instead of assigning positionally to the
-- table row type.
do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.publish_takeoff_commercial_purchase_order_v1(jsonb)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'item public.commercial_items%rowtype;',
    'item record;'
  );
  execute function_definition;
end;
$migration$;

commit;
