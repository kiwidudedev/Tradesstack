begin;

do $migration$
declare
  v_function regprocedure :=
    'public.get_company_payment_claims_register(uuid,text,text,uuid,uuid,text,text,text,text,boolean,boolean,boolean,text,text,integer,integer)'::regprocedure;
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(v_function::oid)
  into v_definition;

  v_updated_definition := replace(
    v_definition,
    'where claim.organization_id = p_organization_id',
    'where claim.organization_id = p_organization_id
      and claim.status <> ''Draft'''
  );

  if v_updated_definition = v_definition then
    raise exception
      'Unable to exclude Draft claims from the Company Payment Claims register';
  end if;

  execute v_updated_definition;
end;
$migration$;

commit;
