begin;

create index if not exists project_claims_company_register_claim_date_idx
  on public.project_claims (
    organization_id,
    claim_date desc nulls last,
    created_at desc,
    id desc
  );

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
    'coalesce(claim.period_end, claim.claim_date) as period_key',
    'claim.claim_date as period_key'
  );

  if v_updated_definition = v_definition then
    raise exception
      'Unable to update Company Payment Claims month key to claim_date';
  end if;

  execute v_updated_definition;
end;
$migration$;

commit;
