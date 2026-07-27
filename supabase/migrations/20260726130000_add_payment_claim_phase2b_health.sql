begin;

create or replace function public.get_payment_claim_phase2b_health()
returns jsonb language sql stable security definer
set search_path = public, pg_catalog
as $$
  with expected_functions(name) as (
    values
      ('confirm_payment_claim_initial_push_phase2b'),
      ('confirm_payment_claim_initial_push_phase2b_impl'),
      ('claim_accounting_revision_attempt_phase2b'),
      ('get_payment_claim_initial_push_execution_phase2b'),
      ('complete_payment_claim_initial_push_phase2b'),
      ('record_payment_claim_initial_push_observation_phase2b')
  )
  select jsonb_build_object(
    'migrationCounts', jsonb_build_object(
      'foundation', (select count(*) from supabase_migrations.schema_migrations where version = '20260726100000'),
      'nameCorrection', (select count(*) from supabase_migrations.schema_migrations where version = '20260726110000'),
      'compatibilityCorrection', (select count(*) from supabase_migrations.schema_migrations where version = '20260726120000')
    ),
    'tables', jsonb_build_object(
      'settings', to_regclass('public.organization_accounting_phase2b_settings') is not null,
      'blobs', to_regclass('public.organization_accounting_revision_blobs') is not null
    ),
    'functions', (
      select jsonb_agg(jsonb_build_object(
        'name', e.name,
        'exists', p.oid is not null,
        'securityDefiner', coalesce(p.prosecdef, false),
        'searchPath', p.proconfig,
        'publicExecute', coalesce(has_function_privilege('public', p.oid, 'EXECUTE'), false),
        'authenticatedExecute', coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false),
        'serviceExecute', coalesce(has_function_privilege('service_role', p.oid, 'EXECUTE'), false)
      ) order by e.name)
      from expected_functions e
      left join pg_proc p on p.proname = e.name and p.pronamespace = 'public'::regnamespace
    ),
    'jobConstraint', (
      select pg_get_constraintdef(c.oid)
      from pg_constraint c
      where c.conrelid = 'public.organization_accounting_sync_jobs'::regclass
        and c.conname = 'organization_accounting_sync_jobs_job_kind_check'
    ),
    'indexes', (
      select jsonb_agg(jsonb_build_object(
        'name', c.relname, 'valid', i.indisvalid, 'ready', i.indisready
      ) order by c.relname)
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      where c.relname in (
        'organization_accounting_revision_blobs_pkey',
        'organization_accounting_sync_jobs_active_phase2b_revision_uidx'
      )
    ),
    'rollout', jsonb_build_object(
      'enabledOrganizations', (
        select count(*) from public.organization_accounting_phase2b_settings
        where initial_payment_claim_push_enabled
      ),
      'revisionBackedDocuments', (
        select count(*) from public.organization_accounting_documents
        where integration_contract = 'payment_claim_revision_v1'
      ),
      'revisionBlobs', (select count(*) from public.organization_accounting_revision_blobs),
      'phase2bJobs', (
        select count(*) from public.organization_accounting_sync_jobs
        where job_kind in (
          'xero.payment_claim.initial_push',
          'xero.payment_claim.initial_push.attachment'
        )
      )
    )
  );
$$;

revoke all on function public.get_payment_claim_phase2b_health()
from public, anon, authenticated;
grant execute on function public.get_payment_claim_phase2b_health()
to service_role;

commit;
