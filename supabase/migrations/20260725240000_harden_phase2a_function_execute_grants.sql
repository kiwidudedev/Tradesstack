begin;

revoke all on function
  public.reject_phase2a_append_only_mutation(),
  public.guard_phase2a_revision_mutation(),
  public.guard_phase2a_attachment_mutation(),
  public.guard_phase2a_attempt_mutation(),
  public.guard_phase2a_document_pointer_mutation()
from public, anon, authenticated, service_role;

create or replace function public.get_phase2a_function_security_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', p.proname,
        'arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
        'securityDefiner', p.prosecdef,
        'configuration', p.proconfig,
        'acl', p.proacl::text,
        'publicExecute', pg_catalog.acldefault('f', p.proowner)
          <@ coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      )
      order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::jsonb
  )
  from pg_catalog.pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname like '%phase2a%';
$$;

revoke all on function public.get_phase2a_function_security_health()
from public, anon, authenticated;
grant execute on function public.get_phase2a_function_security_health()
to service_role;

commit;
