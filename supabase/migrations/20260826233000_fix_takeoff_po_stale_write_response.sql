begin;

-- 40001 is retryable at the database/proxy layer and can repeatedly replay a
-- deterministically stale request. Return the application's conflict code so
-- the caller can refresh immediately without any write being attempted.
do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.publish_takeoff_commercial_purchase_order_v1(jsonb)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'raise exception ''This Purchase Order was updated by another user. Refresh and try again.'' using errcode = ''40001'';',
    'raise exception ''This Purchase Order was updated by another user. Refresh and try again.'' using errcode = ''TS409'';'
  );
  execute function_definition;
end;
$migration$;

commit;
