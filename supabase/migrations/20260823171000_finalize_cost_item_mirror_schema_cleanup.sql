-- Finish the Cost Item mirror cleanup by recompiling current functions whose
-- PL/pgSQL bodies are parsed lazily. The legacy columns were already removed;
-- these definitions must therefore contain neither their target columns nor
-- the two placeholder values that previously populated them.

do $$
declare
  function_name text;
  definition text;
  rewritten text;
begin
  foreach function_name in array array[
    'sync_purchase_order_line_cost_item(uuid)',
    'upsert_cost_items_for_project_purchase_order(uuid,text)',
    'upsert_project_quote_cost_items_from_opportunity(uuid,uuid,uuid)'
  ]
  loop
    select pg_get_functiondef(to_regprocedure('public.' || function_name)) into definition;
    if definition is null then
      raise exception 'Missing current Cost Item mirror function: %', function_name;
    end if;

    rewritten := regexp_replace(
      definition,
      E'\\n([[:space:]]*)cost_code,\\n[[:space:]]*cost_type,',
      '',
      'g'
    );
    rewritten := regexp_replace(
      rewritten,
      E'(\\n[[:space:]]*null,\\n[[:space:]]*null,)\\n[[:space:]]*'''',\\n[[:space:]]*'''',',
      E'\\1',
      'g'
    );

    if rewritten ~ E'\\n[[:space:]]*cost_code,\\n[[:space:]]*cost_type,'
      or rewritten ~ E'(\\n[[:space:]]*null,\\n[[:space:]]*null,)\\n[[:space:]]*'''',\\n[[:space:]]*'''',' then
      raise exception 'Unable to finish legacy mirror cleanup for %', function_name;
    end if;

    execute rewritten;
  end loop;
end;
$$;
