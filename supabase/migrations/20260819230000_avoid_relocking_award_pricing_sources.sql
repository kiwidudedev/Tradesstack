begin;

do $$
declare
  function_definition text;
  patched_definition text;
  target_signature regprocedure := 'public.ensure_opportunity_project_pricing_workbooks_v1(uuid,uuid,uuid,uuid)'::regprocedure;
begin
  select pg_get_functiondef(target_signature) into function_definition;
  patched_definition := replace(
    function_definition,
    'and source.clone_kind is null and source.archived_at is null;

  return query select resolved_source_count, resolved_reused_count, resolved_created_count;',
    'and source.clone_kind is null and source.archived_at is null
    and source.award_locked_at is null;

  return query select resolved_source_count, resolved_reused_count, resolved_created_count;'
  );

  if patched_definition = function_definition and position(
    'and source.clone_kind is null and source.archived_at is null
    and source.award_locked_at is null;

  return query select resolved_source_count, resolved_reused_count, resolved_created_count;'
    in function_definition
  ) = 0 then
    raise exception 'Could not locate the source-lock update boundary in %', target_signature;
  end if;

  execute patched_definition;
end;
$$;

commit;
