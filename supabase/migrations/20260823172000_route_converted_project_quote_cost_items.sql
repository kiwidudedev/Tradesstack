-- The conversion-specific project quote mirror predated Financial Routing.
-- Preserve its authorization and baseline-lineage checks, but delegate the
-- persisted write to the canonical routed project-quote mirror.

do $$
declare
  definition text;
  insert_start integer;
  return_start integer;
begin
  select pg_get_functiondef(
    'public.upsert_project_quote_cost_items_from_opportunity(uuid,uuid,uuid)'::regprocedure
  ) into definition;

  insert_start := strpos(definition, E'\n  insert into public.cost_items (');
  return_start := strpos(definition, E'\n  return rows_written;');

  if insert_start = 0 or return_start = 0 or return_start <= insert_start then
    raise exception 'Unable to locate converted project quote Cost Item mirror write';
  end if;

  definition := overlay(
    definition
    placing E'\n  rows_written := public.upsert_cost_items_for_document(\n    ''project_quote'',\n    p_project_quote_id,\n    cost_item_revision_key\n  );'
    from insert_start
    for return_start - insert_start
  );

  execute definition;
end;
$$;
