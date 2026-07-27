begin;

-- Forward-only Phase 2A post-deployment hardening. This remains dormant and
-- does not route any production claim or Xero path through the new foundation.

create or replace function public.enforce_phase2a_revision_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  document public.organization_accounting_documents%rowtype;
  previous_revision public.organization_accounting_document_revisions%rowtype;
  reservation public.organization_accounting_number_reservations%rowtype;
  resolved_project_id uuid;
begin
  select * into document
  from public.organization_accounting_documents d
  where d.id = new.accounting_document_id;
  if not found
    or document.organization_id <> new.organization_id
    or document.provider <> new.provider
    or document.tenant_id <> new.tenant_id
    or document.accounting_connection_id <> new.connection_id
    or document.local_document_type <> new.source_document_type
    or coalesce(
      document.project_claim_id,
      document.retention_claim_id,
      document.local_document_id
    ) <> new.source_document_id then
    raise exception 'Accounting revision identity does not match its stable document.'
      using errcode = '23514';
  end if;

  if new.source_document_type = 'project_claim' then
    select c.project_id into resolved_project_id
    from public.project_claims c
    where c.id = new.source_document_id
      and c.organization_id = new.organization_id;
  elsif new.source_document_type = 'retention_claim' then
    select c.project_id into resolved_project_id
    from public.retention_claims c
    where c.id = new.source_document_id
      and c.organization_id = new.organization_id;
  end if;
  if new.source_document_type in ('project_claim', 'retention_claim')
    and (resolved_project_id is null or new.project_id is distinct from resolved_project_id)
  then
    raise exception 'Accounting revision project does not match its source claim.'
      using errcode = '23514';
  end if;

  if new.revision_sequence = 1 then
    if new.previous_revision_id is not null then
      raise exception 'First accounting revision cannot have a predecessor.'
        using errcode = '23514';
    end if;
  else
    select * into previous_revision
    from public.organization_accounting_document_revisions r
    where r.id = new.previous_revision_id;
    if not found
      or previous_revision.accounting_document_id <> new.accounting_document_id
      or previous_revision.organization_id <> new.organization_id
      or previous_revision.revision_sequence <> new.revision_sequence - 1 then
      raise exception 'Accounting revision predecessor must be the prior revision of the same document.'
        using errcode = '23514';
    end if;
  end if;

  if new.source_document_type in ('project_claim', 'retention_claim') then
    select * into reservation
    from public.organization_accounting_number_reservations n
    where n.id = new.number_reservation_id;
    if not found
      or reservation.organization_id <> new.organization_id
      or reservation.provider <> new.provider
      or reservation.tenant_id <> new.tenant_id
      or reservation.accounting_document_id <> new.accounting_document_id
      or reservation.source_document_type <> new.source_document_type
      or reservation.source_document_id <> new.source_document_id
      or reservation.formatted_number <> new.external_document_number then
      raise exception 'Accounting revision number reservation does not match its tenant and document.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_accounting_revision_identity
  on public.organization_accounting_document_revisions;
create trigger enforce_accounting_revision_identity
before insert on public.organization_accounting_document_revisions
for each row execute function public.enforce_phase2a_revision_identity();

create or replace function public.reserve_accounting_sales_invoice_number_phase2a(
  p_organization_id uuid,
  p_provider text,
  p_tenant_id text,
  p_source_document_type text,
  p_source_document_id uuid,
  p_accounting_document_id uuid,
  p_reserved_by uuid,
  p_reason text
)
returns public.organization_accounting_number_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  next_sequence bigint;
  reservation public.organization_accounting_number_reservations%rowtype;
begin
  if p_source_document_type = 'project_claim' then
    if not exists (
      select 1 from public.project_claims c
      where c.id = p_source_document_id
        and c.organization_id = p_organization_id
    ) then
      raise exception 'Payment Claim does not belong to the reservation organization.';
    end if;
  elsif p_source_document_type = 'retention_claim' then
    if not exists (
      select 1 from public.retention_claims c
      where c.id = p_source_document_id
        and c.organization_id = p_organization_id
    ) then
      raise exception 'Retention Claim does not belong to the reservation organization.';
    end if;
  else
    raise exception 'Only Payment Claims and Retention Claims share the sales-invoice sequence.';
  end if;

  if p_accounting_document_id is not null and not exists (
    select 1 from public.organization_accounting_documents d
    where d.id = p_accounting_document_id
      and d.organization_id = p_organization_id
      and d.provider = p_provider
      and d.tenant_id = p_tenant_id
      and d.local_document_type = p_source_document_type
      and coalesce(d.project_claim_id, d.retention_claim_id) = p_source_document_id
  ) then
    raise exception 'Accounting document identity does not match the reservation scope.';
  end if;

  insert into public.organization_accounting_number_counters(
    organization_id, provider, tenant_id, document_class, last_sequence
  ) values (
    p_organization_id, p_provider, trim(p_tenant_id), 'sales_invoice', 1
  )
  on conflict (organization_id, provider, tenant_id, document_class)
  do update set
    last_sequence = organization_accounting_number_counters.last_sequence + 1,
    updated_at = now()
  returning last_sequence into next_sequence;

  insert into public.organization_accounting_number_reservations(
    organization_id, provider, tenant_id, document_class, sequence_number,
    formatted_number, accounting_document_id, source_document_type,
    source_document_id, reservation_reason, reserved_by
  ) values (
    p_organization_id, p_provider, trim(p_tenant_id), 'sales_invoice',
    next_sequence, 'TSI-' || lpad(next_sequence::text, 8, '0'),
    p_accounting_document_id, p_source_document_type, p_source_document_id,
    p_reason, p_reserved_by
  ) returning * into reservation;
  return reservation;
end;
$$;

create or replace function public.activate_successful_accounting_revision_phase2a(
  p_revision_id uuid,
  p_external_document_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  revision public.organization_accounting_document_revisions%rowtype;
  successful_attempt public.organization_accounting_revision_attempts%rowtype;
  prior_id uuid;
begin
  select * into revision
  from public.organization_accounting_document_revisions
  where id = p_revision_id for update;
  if not found then raise exception 'Accounting revision not found.'; end if;
  if revision.lifecycle_state = 'superseded' then
    raise exception 'A superseded accounting revision cannot become active.';
  end if;

  select * into successful_attempt
  from public.organization_accounting_revision_attempts a
  where a.accounting_revision_id = revision.id
    and a.attempt_intent in ('create', 'update', 'amend', 'credit', 'void', 'replace')
  order by a.attempt_sequence desc
  limit 1;
  if not found or successful_attempt.queue_state <> 'succeeded' then
    raise exception 'Only the latest successful invoice attempt can activate a revision.';
  end if;
  if nullif(trim(p_external_document_id), '') is null then
    raise exception 'A successful provider document identity is required.';
  end if;

  select active_accounting_revision_id into prior_id
  from public.organization_accounting_documents
  where id = revision.accounting_document_id
    and organization_id = revision.organization_id
  for update;
  if not found then raise exception 'Stable accounting document not found.'; end if;

  perform set_config('app.accounting_phase2a_lifecycle_write', 'true', true);
  if prior_id is not null and prior_id <> revision.id then
    update public.organization_accounting_document_revisions set
      lifecycle_state = 'superseded',
      superseded_at = now(),
      superseded_by_revision_id = revision.id,
      updated_at = now()
    where id = prior_id
      and organization_id = revision.organization_id
      and accounting_document_id = revision.accounting_document_id
      and lifecycle_state = 'succeeded';
    if not found then
      raise exception 'Current active revision is not a successful revision of this document.';
    end if;
  end if;
  update public.organization_accounting_document_revisions set
    lifecycle_state = 'succeeded',
    external_document_id = trim(p_external_document_id),
    succeeded_at = coalesce(succeeded_at, now()),
    activated_at = coalesce(activated_at, now()),
    updated_at = now()
  where id = revision.id;
  perform set_config('app.accounting_phase2a_lifecycle_write', '', true);

  perform set_config('app.accounting_phase2a_pointer_write', 'true', true);
  update public.organization_accounting_documents
  set active_accounting_revision_id = revision.id
  where id = revision.accounting_document_id
    and organization_id = revision.organization_id;
  perform set_config('app.accounting_phase2a_pointer_write', '', true);
  return true;
end;
$$;

create or replace function public.record_accounting_remote_observation_phase2a(
  p_input jsonb
)
returns public.organization_accounting_remote_observations
language plpgsql
security definer
set search_path = public
as $$
declare
  revision public.organization_accounting_document_revisions%rowtype;
  observation public.organization_accounting_remote_observations%rowtype;
  projection public.organization_accounting_projections%rowtype;
  is_divergent boolean;
begin
  select r.* into revision
  from public.organization_accounting_document_revisions r
  join public.organization_accounting_documents d
    on d.id = r.accounting_document_id
    and d.organization_id = r.organization_id
  where r.id = (p_input->>'accountingRevisionId')::uuid
    and r.organization_id = (p_input->>'organizationId')::uuid
    and d.active_accounting_revision_id = r.id;
  if not found then
    raise exception 'Remote observation revision is not active for its accounting document.';
  end if;
  if revision.lifecycle_state <> 'succeeded'
    or revision.accounting_document_id <> (p_input->>'accountingDocumentId')::uuid
    or revision.provider <> p_input->>'provider'
    or revision.tenant_id <> p_input->>'tenantId'
    or revision.external_document_id <> p_input->>'externalDocumentId' then
    raise exception 'Remote observation does not match the bound successful revision.';
  end if;

  is_divergent :=
    (p_input->>'contentHash') is distinct from revision.provider_content_hash;
  insert into public.organization_accounting_remote_observations(
    organization_id, accounting_document_id, accounting_revision_id,
    provider, tenant_id, external_document_id, provider_updated_at,
    raw_status, normalized_status, content_hash, settlement_hash,
    raw_observation
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    revision.provider, revision.tenant_id, revision.external_document_id,
    nullif(p_input->>'providerUpdatedAt', '')::timestamptz,
    p_input->>'rawStatus', p_input->>'normalizedStatus',
    p_input->>'contentHash', p_input->>'settlementHash',
    p_input->'rawObservation'
  ) returning * into observation;

  insert into public.organization_accounting_projections(
    organization_id, accounting_document_id, accounting_revision_id,
    remote_observation_id, raw_provider_status, normalized_invoice_status,
    normalized_payment_status, amount_paid_minor, amount_due_minor,
    amount_credited_minor, divergent, divergence_reasons,
    observed_content_hash, projected_at, updated_at
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    observation.id, p_input->>'rawStatus', p_input->>'normalizedInvoiceStatus',
    p_input->>'normalizedPaymentStatus',
    nullif(p_input->>'amountPaidMinor', '')::bigint,
    nullif(p_input->>'amountDueMinor', '')::bigint,
    nullif(p_input->>'amountCreditedMinor', '')::bigint,
    is_divergent,
    case when is_divergent then
      jsonb_build_array('remote_content_differs_from_export_revision')
    else '[]'::jsonb end,
    observation.content_hash, observation.observed_at, now()
  )
  on conflict (accounting_document_id) do update set
    accounting_revision_id = excluded.accounting_revision_id,
    remote_observation_id = excluded.remote_observation_id,
    raw_provider_status = excluded.raw_provider_status,
    normalized_invoice_status = excluded.normalized_invoice_status,
    normalized_payment_status = excluded.normalized_payment_status,
    amount_paid_minor = excluded.amount_paid_minor,
    amount_due_minor = excluded.amount_due_minor,
    amount_credited_minor = excluded.amount_credited_minor,
    divergent = excluded.divergent,
    divergence_reasons = excluded.divergence_reasons,
    observed_content_hash = excluded.observed_content_hash,
    projected_at = excluded.projected_at,
    updated_at = now()
  returning * into projection;

  perform set_config('app.accounting_phase2a_pointer_write', 'true', true);
  update public.organization_accounting_documents set
    current_accounting_projection_id = projection.id
  where id = revision.accounting_document_id
    and organization_id = revision.organization_id;
  perform set_config('app.accounting_phase2a_pointer_write', '', true);

  insert into public.organization_accounting_events(
    organization_id, accounting_document_id, accounting_revision_id,
    event_type, correlation_id, event_evidence
  ) values (
    revision.organization_id, revision.accounting_document_id, revision.id,
    case when is_divergent then 'remote_divergence_observed'
      else 'remote_status_observed' end,
    p_input->>'correlationId',
    jsonb_build_object(
      'remoteObservationId', observation.id,
      'projectionId', projection.id,
      'contentHash', observation.content_hash,
      'settlementHash', observation.settlement_hash,
      'divergent', is_divergent
    )
  );
  return observation;
end;
$$;

-- Service-only post-deployment diagnostic. It exposes catalog metadata only,
-- never row payloads, OAuth state, tokens, or Xero connection secrets.
create or replace function public.get_accounting_phase2a_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with expected_tables(name) as (
    values
      ('organization_accounting_number_counters'),
      ('organization_accounting_number_reservations'),
      ('organization_accounting_document_revisions'),
      ('organization_accounting_revision_lines'),
      ('organization_accounting_revision_attachments'),
      ('organization_accounting_revision_attempts'),
      ('organization_accounting_events'),
      ('organization_accounting_remote_observations'),
      ('organization_accounting_projections'),
      ('organization_accounting_legacy_classifications')
  ),
  table_state as (
    select e.name, c.oid is not null as exists,
      coalesce(c.relrowsecurity, false) as rls_enabled,
      coalesce(c.relforcerowsecurity, false) as rls_forced
    from expected_tables e
    left join pg_catalog.pg_class c
      on c.relname = e.name
      and c.relnamespace = 'public'::regnamespace
  ),
  function_state as (
    select p.proname as name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
      p.prosecdef as security_definer,
      p.proconfig as configuration,
      p.proacl::text as acl
    from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (
        p.proname like '%accounting%phase2a%'
        or p.proname like '%phase2a%accounting%'
      )
  ),
  trigger_state as (
    select c.relname as table_name, t.tgname as trigger_name,
      t.tgenabled::text as enabled
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace
      and not t.tgisinternal
      and (
        c.relname like 'organization_accounting_%'
        or t.tgname like '%accounting%'
      )
  ),
  index_state as (
    select c.relname as table_name, i.relname as index_name,
      x.indisvalid as valid, x.indisready as ready,
      pg_catalog.pg_get_indexdef(i.oid) as definition
    from pg_catalog.pg_index x
    join pg_catalog.pg_class i on i.oid = x.indexrelid
    join pg_catalog.pg_class c on c.oid = x.indrelid
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (select name from expected_tables)
  ),
  policy_state as (
    select schemaname, tablename, policyname, cmd, roles
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (select name from expected_tables)
  ),
  grant_state as (
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (select name from expected_tables)
      and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  )
  select jsonb_build_object(
    'postgresVersion', current_setting('server_version'),
    'migrationCount', (
      select count(*) from supabase_migrations.schema_migrations
      where version = '20260725130000'
    ),
    'hardeningMigrationCount', (
      select count(*) from supabase_migrations.schema_migrations
      where version = '20260725140000'
    ),
    'tables', (select jsonb_agg(to_jsonb(t) order by name) from table_state t),
    'functions', (select jsonb_agg(to_jsonb(f) order by name, arguments) from function_state f),
    'triggers', (select jsonb_agg(to_jsonb(t) order by table_name, trigger_name) from trigger_state t),
    'indexes', (select jsonb_agg(to_jsonb(i) order by table_name, index_name) from index_state i),
    'policies', (select jsonb_agg(to_jsonb(p) order by tablename, policyname) from policy_state p),
    'grants', coalesce(
      (select jsonb_agg(to_jsonb(g) order by table_name, grantee, privilege_type)
       from grant_state g),
      '[]'::jsonb
    ),
    'foundationRows', jsonb_build_object(
      'revisions', (select count(*) from public.organization_accounting_document_revisions),
      'reservations', (select count(*) from public.organization_accounting_number_reservations),
      'attempts', (select count(*) from public.organization_accounting_revision_attempts),
      'events', (select count(*) from public.organization_accounting_events),
      'observations', (select count(*) from public.organization_accounting_remote_observations)
    ),
    'existingDocumentPointers', jsonb_build_object(
      'activeRevisionPointers', (
        select count(*) from public.organization_accounting_documents
        where active_accounting_revision_id is not null
      ),
      'projectionPointers', (
        select count(*) from public.organization_accounting_documents
        where current_accounting_projection_id is not null
      ),
      'legacyClassificationPointers', (
        select count(*) from public.organization_accounting_documents
        where current_legacy_classification_id is not null
      )
    ),
    'syncJobKinds', (
      select pg_catalog.pg_get_constraintdef(c.oid)
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.organization_accounting_sync_jobs'::regclass
        and c.conname = 'organization_accounting_sync_jobs_job_kind_check'
    )
  );
$$;

revoke all on function public.enforce_phase2a_revision_identity()
  from public, anon, authenticated, service_role;
revoke all on function
  public.reserve_accounting_sales_invoice_number_phase2a(uuid,text,text,text,uuid,uuid,uuid,text),
  public.activate_successful_accounting_revision_phase2a(uuid,text),
  public.record_accounting_remote_observation_phase2a(jsonb),
  public.get_accounting_phase2a_health()
from public, anon, authenticated;
grant execute on function
  public.reserve_accounting_sales_invoice_number_phase2a(uuid,text,text,text,uuid,uuid,uuid,text),
  public.activate_successful_accounting_revision_phase2a(uuid,text),
  public.record_accounting_remote_observation_phase2a(jsonb),
  public.get_accounting_phase2a_health()
to service_role;

commit;
