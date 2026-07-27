begin;

-- Automatic rolling Retention Claims are an additive Draft projection.
-- Payment Claims remain authoritative for retention ownership and submitted
-- Retention Claim allocations remain the immutable financial authority.

alter table public.retention_claims
  add column if not exists draft_kind text not null default 'manual';

alter table public.retention_claims
  drop constraint if exists retention_claims_draft_kind_check;
alter table public.retention_claims
  add constraint retention_claims_draft_kind_check
  check (draft_kind in ('manual', 'automatic_rolling'));

create unique index if not exists retention_claims_one_active_automatic_draft_idx
  on public.retention_claims (organization_id, project_id)
  where status = 'draft' and draft_kind = 'automatic_rolling';

create or replace function public.protect_retention_claim_draft_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.draft_kind is distinct from old.draft_kind then
    raise exception 'Retention Claim Draft kind is immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger retention_claims_draft_kind_immutable
before update on public.retention_claims
for each row execute function public.protect_retention_claim_draft_kind();

create table public.retention_rolling_draft_origins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  retention_claim_id uuid not null,
  originating_payment_claim_id uuid not null,
  origin_sequence integer not null,
  latest_origin_state_hash text not null,
  latest_origin_updated_at timestamptz not null,
  latest_retention_owned numeric(14,2) not null,
  first_confirmed_at timestamptz not null default now(),
  last_refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_rolling_draft_origins_parent_fkey
    foreign key (organization_id, project_id, retention_claim_id)
    references public.retention_claims (organization_id, project_id, id)
    on delete restrict,
  constraint retention_rolling_draft_origins_origin_fkey
    foreign key (organization_id, project_id, originating_payment_claim_id)
    references public.project_claims (organization_id, project_id, id)
    on delete restrict,
  constraint retention_rolling_draft_origins_unique
    unique (retention_claim_id, originating_payment_claim_id),
  constraint retention_rolling_draft_origins_sequence_unique
    unique (retention_claim_id, origin_sequence)
    deferrable initially immediate,
  constraint retention_rolling_draft_origins_sequence_positive
    check (origin_sequence > 0),
  constraint retention_rolling_draft_origins_hash_shape
    check (latest_origin_state_hash ~ '^[a-f0-9]{64}$'),
  constraint retention_rolling_draft_origins_owned_nonnegative
    check (latest_retention_owned >= 0)
);

create index retention_rolling_draft_origins_project_idx
  on public.retention_rolling_draft_origins
    (organization_id, project_id, retention_claim_id, origin_sequence);

create table public.retention_rolling_draft_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  project_id uuid not null,
  originating_payment_claim_id uuid not null,
  operation text not null,
  status text not null default 'pending',
  correlation_id text not null,
  retry_count integer not null default 0,
  next_attempt_at timestamptz null,
  last_error_class text null,
  last_error_message text null,
  target_retention_claim_id uuid null references public.retention_claims (id) on delete restrict,
  requested_by uuid null references auth.users (id) on delete restrict,
  requested_at timestamptz not null default now(),
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_rolling_draft_jobs_project_fkey
    foreign key (organization_id, project_id)
    references public.organization_projects (organization_id, id)
    on delete restrict,
  constraint retention_rolling_draft_jobs_origin_fkey
    foreign key (organization_id, project_id, originating_payment_claim_id)
    references public.project_claims (organization_id, project_id, id)
    on delete restrict,
  constraint retention_rolling_draft_jobs_origin_unique
    unique (originating_payment_claim_id),
  constraint retention_rolling_draft_jobs_operation_check
    check (operation in ('confirmed', 'refresh')),
  constraint retention_rolling_draft_jobs_status_check
    check (status in ('pending', 'processing', 'retry_scheduled', 'succeeded', 'dead_lettered')),
  constraint retention_rolling_draft_jobs_retry_nonnegative
    check (retry_count >= 0)
);

create index retention_rolling_draft_jobs_claimable_idx
  on public.retention_rolling_draft_jobs
    (status, next_attempt_at, requested_at, id);

create table public.retention_rolling_draft_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  project_id uuid not null references public.organization_projects (id) on delete restrict,
  originating_payment_claim_id uuid not null references public.project_claims (id) on delete restrict,
  retention_claim_id uuid null references public.retention_claims (id) on delete restrict,
  operation text not null,
  result text not null,
  retry_count integer not null default 0,
  correlation_id text not null,
  error_classification text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint retention_rolling_draft_events_operation_check
    check (operation in ('confirmed', 'refresh')),
  constraint retention_rolling_draft_events_result_check
    check (result in ('draft_created', 'origin_added', 'origin_refreshed', 'no_change', 'gate_closed', 'failed')),
  constraint retention_rolling_draft_events_retry_nonnegative
    check (retry_count >= 0)
);

create index retention_rolling_draft_events_origin_idx
  on public.retention_rolling_draft_events
    (organization_id, project_id, originating_payment_claim_id, occurred_at desc);

alter table public.retention_rolling_draft_origins enable row level security;
alter table public.retention_rolling_draft_origins force row level security;
alter table public.retention_rolling_draft_jobs enable row level security;
alter table public.retention_rolling_draft_jobs force row level security;
alter table public.retention_rolling_draft_events enable row level security;
alter table public.retention_rolling_draft_events force row level security;

create policy "Retention viewers can read rolling Draft origins"
on public.retention_rolling_draft_origins
for select to authenticated
using (public.has_org_permission(organization_id, 'retention.view'));

create policy "Retention viewers can read rolling Draft events"
on public.retention_rolling_draft_events
for select to authenticated
using (public.has_org_permission(organization_id, 'retention.view'));

revoke all on public.retention_rolling_draft_origins from public, anon, authenticated;
revoke all on public.retention_rolling_draft_jobs from public, anon, authenticated;
revoke all on public.retention_rolling_draft_events from public, anon, authenticated;
grant select on public.retention_rolling_draft_origins to authenticated;
grant select on public.retention_rolling_draft_events to authenticated;
grant select, insert, update on public.retention_rolling_draft_origins to service_role;
grant select, insert, update on public.retention_rolling_draft_jobs to service_role;
grant select, insert on public.retention_rolling_draft_events to service_role;

create or replace function public.prevent_retention_rolling_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Retention rolling Draft events are append-only.'
    using errcode = '55000';
end;
$$;

create trigger retention_rolling_draft_events_append_only
before update or delete on public.retention_rolling_draft_events
for each row execute function public.prevent_retention_rolling_event_mutation();

create or replace function public.protect_retention_rolling_origin_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_status text;
begin
  select claim.status into parent_status
  from public.retention_claims claim
  where claim.id = coalesce(new.retention_claim_id, old.retention_claim_id);

  if parent_status is distinct from 'draft' then
    raise exception 'Automatic Retention origin membership is immutable outside Draft.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Automatic Retention origin membership cannot be deleted.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.project_id <> old.project_id
    or new.retention_claim_id <> old.retention_claim_id
    or new.originating_payment_claim_id <> old.originating_payment_claim_id
    or new.created_at <> old.created_at
  ) then
    raise exception 'Automatic Retention origin identity is immutable.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger retention_rolling_draft_origins_guard
before insert or update or delete on public.retention_rolling_draft_origins
for each row execute function public.protect_retention_rolling_origin_mutation();

create or replace function private.retention_rolling_record_event(
  p_organization_id uuid,
  p_project_id uuid,
  p_originating_payment_claim_id uuid,
  p_retention_claim_id uuid,
  p_operation text,
  p_result text,
  p_retry_count integer,
  p_correlation_id text,
  p_error_classification text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.retention_rolling_draft_events (
    organization_id, project_id, originating_payment_claim_id,
    retention_claim_id, operation, result, retry_count, correlation_id,
    error_classification, metadata
  )
  values (
    p_organization_id, p_project_id, p_originating_payment_claim_id,
    p_retention_claim_id, p_operation, p_result, p_retry_count,
    p_correlation_id, p_error_classification, coalesce(p_metadata, '{}'::jsonb)
  );
$$;

create or replace function private.maintain_retention_rolling_draft(
  p_originating_payment_claim_id uuid,
  p_operation text,
  p_correlation_id text,
  p_retry_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  origin public.project_claims%rowtype;
  rolling_claim public.retention_claims%rowtype;
  existing_origin public.retention_rolling_draft_origins%rowtype;
  actor_user_id uuid;
  position jsonb;
  origin_hash text;
  inserted_origin boolean := false;
  draft_created boolean := false;
  changed boolean := false;
  next_sequence integer;
begin
  select * into origin
  from public.project_claims claim
  where claim.id = p_originating_payment_claim_id
  for update;

  if not found
    or origin.status not in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
    or round(coalesce(origin.retention_withheld_amount, 0), 2) <= 0 then
    return jsonb_build_object('succeeded', true, 'changed', false, 'result', 'no_change');
  end if;

  if not exists (
    select 1
    from public.organization_capabilities capability
    join public.project_retention_workflow_states workflow
      on workflow.organization_id = capability.organization_id
     and workflow.project_id = origin.project_id
    where capability.organization_id = origin.organization_id
      and capability.capability_key = 'retention_management'
      and capability.enabled
      and workflow.mode = 'observe'
  ) then
    perform private.retention_rolling_record_event(
      origin.organization_id, origin.project_id, origin.id, null,
      p_operation, 'gate_closed', p_retry_count, p_correlation_id
    );
    return jsonb_build_object('succeeded', true, 'changed', false, 'result', 'gate_closed');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(origin.project_id::text || ':automatic_retention_draft', 7)
  );

  select claim.* into rolling_claim
  from public.retention_claims claim
  where claim.organization_id = origin.organization_id
    and claim.project_id = origin.project_id
    and claim.status = 'draft'
    and claim.draft_kind = 'automatic_rolling'
  for update;

  if rolling_claim.id is null and p_operation = 'refresh' then
    return jsonb_build_object('succeeded', true, 'changed', false, 'result', 'no_change');
  end if;

  actor_user_id := coalesce(origin.created_by, auth.uid());
  if actor_user_id is null then
    select member.user_id into actor_user_id
    from public.organization_members member
    where member.organization_id = origin.organization_id
    order by
      case member.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      member.created_at,
      member.id
    limit 1;
  end if;
  if actor_user_id is null then
    raise exception 'No organization actor is available for the automatic Retention Draft.';
  end if;

  position := public.get_project_retention_position_summary(origin.project_id);
  origin_hash := private.retention_claim_origin_state_hash(origin.id);

  if rolling_claim.id is null then
    insert into public.retention_claims (
      organization_id, project_id, claim_number, title, status,
      last_position_state_hash, created_by, draft_kind
    )
    values (
      origin.organization_id,
      origin.project_id,
      private.generate_retention_claim_number(origin.organization_id, origin.project_id),
      'Retention Claim',
      'draft',
      position ->> 'stateHash',
      actor_user_id,
      'automatic_rolling'
    )
    returning * into rolling_claim;
    draft_created := true;

    perform private.record_retention_claim_event(
      rolling_claim.organization_id,
      rolling_claim.project_id,
      rolling_claim.id,
      'claim_created',
      null,
      'draft',
      actor_user_id,
      'Automatic rolling Retention Claim Draft created.',
      p_correlation_id,
      jsonb_build_object('automaticRolling', true, 'originatingPaymentClaimId', origin.id)
    );
  end if;

  select * into existing_origin
  from public.retention_rolling_draft_origins candidate
  where candidate.retention_claim_id = rolling_claim.id
    and candidate.originating_payment_claim_id = origin.id
  for update;

  if existing_origin.id is null then
    select coalesce(max(candidate.origin_sequence), 0) + 1
    into next_sequence
    from public.retention_rolling_draft_origins candidate
    where candidate.retention_claim_id = rolling_claim.id;

    insert into public.retention_rolling_draft_origins (
      organization_id, project_id, retention_claim_id,
      originating_payment_claim_id, origin_sequence,
      latest_origin_state_hash, latest_origin_updated_at,
      latest_retention_owned
    )
    values (
      origin.organization_id, origin.project_id, rolling_claim.id,
      origin.id, next_sequence, origin_hash, origin.updated_at,
      round(greatest(origin.retention_withheld_amount, 0), 2)
    );
    inserted_origin := true;
    changed := true;
  elsif existing_origin.latest_origin_state_hash is distinct from origin_hash
    or existing_origin.latest_retention_owned is distinct from
      round(greatest(origin.retention_withheld_amount, 0), 2) then
    update public.retention_rolling_draft_origins candidate
    set
      latest_origin_state_hash = origin_hash,
      latest_origin_updated_at = origin.updated_at,
      latest_retention_owned = round(greatest(origin.retention_withheld_amount, 0), 2),
      last_refreshed_at = now(),
      updated_at = now()
    where candidate.id = existing_origin.id;
    changed := true;
  end if;

  if changed then
    set constraints retention_rolling_draft_origins_sequence_unique deferred;
    with ordered as (
      select
        candidate.id,
        row_number() over (
          order by source.claim_date asc nulls last,
                   source.created_at asc,
                   source.id asc
        )::integer as sequence
      from public.retention_rolling_draft_origins candidate
      join public.project_claims source
        on source.id = candidate.originating_payment_claim_id
      where candidate.retention_claim_id = rolling_claim.id
    )
    update public.retention_rolling_draft_origins candidate
    set origin_sequence = ordered.sequence
    from ordered
    where candidate.id = ordered.id
      and candidate.origin_sequence is distinct from ordered.sequence;

    update public.retention_claims claim
    set
      last_position_state_hash = position ->> 'stateHash',
      draft_revision = claim.draft_revision + 1,
      updated_at = now()
    where claim.id = rolling_claim.id;
  end if;

  perform private.retention_rolling_record_event(
    origin.organization_id,
    origin.project_id,
    origin.id,
    rolling_claim.id,
    p_operation,
    case
      when draft_created then 'draft_created'
      when inserted_origin then 'origin_added'
      when changed then 'origin_refreshed'
      else 'no_change'
    end,
    p_retry_count,
    p_correlation_id,
    null,
    jsonb_build_object(
      'claimNumber', rolling_claim.claim_number,
      'retentionOwned', round(greatest(origin.retention_withheld_amount, 0), 2)
    )
  );

  return jsonb_build_object(
    'succeeded', true,
    'changed', changed or draft_created,
    'result', case
      when draft_created then 'draft_created'
      when inserted_origin then 'origin_added'
      when changed then 'origin_refreshed'
      else 'no_change'
    end,
    'retentionClaimId', rolling_claim.id,
    'claimNumber', rolling_claim.claim_number
  );
end;
$$;

create or replace function private.enqueue_retention_rolling_draft(
  p_originating_payment_claim_id uuid,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  origin public.project_claims%rowtype;
  job public.retention_rolling_draft_jobs%rowtype;
  result jsonb;
  correlation_id text := gen_random_uuid()::text;
begin
  select * into origin
  from public.project_claims
  where id = p_originating_payment_claim_id;
  if not found then return; end if;

  insert into public.retention_rolling_draft_jobs (
    organization_id, project_id, originating_payment_claim_id,
    operation, status, correlation_id, requested_by
  )
  values (
    origin.organization_id, origin.project_id, origin.id,
    p_operation, 'pending', correlation_id, auth.uid()
  )
  on conflict (originating_payment_claim_id)
  do update set
    operation = case
      when excluded.operation = 'confirmed' then 'confirmed'
      else public.retention_rolling_draft_jobs.operation
    end,
    status = 'pending',
    correlation_id = excluded.correlation_id,
    requested_by = coalesce(excluded.requested_by, public.retention_rolling_draft_jobs.requested_by),
    requested_at = now(),
    next_attempt_at = null,
    last_error_class = null,
    last_error_message = null,
    processed_at = null,
    updated_at = now()
  returning * into job;

  begin
    result := private.maintain_retention_rolling_draft(
      origin.id, job.operation, job.correlation_id, job.retry_count
    );
    update public.retention_rolling_draft_jobs
    set
      status = 'succeeded',
      target_retention_claim_id =
        nullif(result ->> 'retentionClaimId', '')::uuid,
      processed_at = now(),
      updated_at = now()
    where id = job.id;
  exception when others then
    update public.retention_rolling_draft_jobs
    set
      status = 'retry_scheduled',
      retry_count = retry_count + 1,
      next_attempt_at = now() + interval '1 minute',
      last_error_class = sqlstate,
      last_error_message = left(sqlerrm, 1000),
      updated_at = now()
    where id = job.id;
  end;
end;
$$;

create or replace function public.enqueue_retention_rolling_draft_after_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  operation text;
begin
  if new.status not in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
    or round(coalesce(new.retention_withheld_amount, 0), 2) <= 0 then
    return new;
  end if;

  operation := case
    when old.status not in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
      then 'confirmed'
    else 'refresh'
  end;

  perform private.enqueue_retention_rolling_draft(new.id, operation);
  return new;
exception when others then
  -- Retention projection is optional to Payment Claim confirmation.
  -- A failure cannot roll back the authoritative Payment Claim transition.
  raise warning 'Retention rolling Draft enqueue failed for Payment Claim %: %',
    new.id, sqlerrm;
  return new;
end;
$$;

create trigger project_claims_retention_rolling_draft_projection
after update of status, claim_date, retention_withheld_amount,
  retention_released_amount, retention_held_to_date,
  retention_released_to_date, retention_balance
on public.project_claims
for each row execute function public.enqueue_retention_rolling_draft_after_claim();

create or replace function public.process_retention_rolling_draft_jobs(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.retention_rolling_draft_jobs%rowtype;
  result jsonb;
  processed integer := 0;
  succeeded integer := 0;
  failed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role is required.';
  end if;

  for job in
    select queue.*
    from public.retention_rolling_draft_jobs queue
    where queue.status in ('pending', 'retry_scheduled')
      and (queue.next_attempt_at is null or queue.next_attempt_at <= now())
    order by queue.requested_at, queue.id
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  loop
    processed := processed + 1;
    update public.retention_rolling_draft_jobs
    set status = 'processing', updated_at = now()
    where id = job.id;

    begin
      result := private.maintain_retention_rolling_draft(
        job.originating_payment_claim_id,
        job.operation,
        job.correlation_id,
        job.retry_count
      );
      update public.retention_rolling_draft_jobs
      set
        status = 'succeeded',
        target_retention_claim_id =
          nullif(result ->> 'retentionClaimId', '')::uuid,
        processed_at = now(),
        next_attempt_at = null,
        last_error_class = null,
        last_error_message = null,
        updated_at = now()
      where id = job.id;
      succeeded := succeeded + 1;
    exception when others then
      update public.retention_rolling_draft_jobs
      set
        status = case when retry_count + 1 >= 8 then 'dead_lettered' else 'retry_scheduled' end,
        retry_count = retry_count + 1,
        next_attempt_at = case
          when retry_count + 1 >= 8 then null
          else now() + make_interval(secs => least(3600, 30 * (2 ^ least(retry_count, 7))::integer))
        end,
        last_error_class = sqlstate,
        last_error_message = left(sqlerrm, 1000),
        updated_at = now()
      where id = job.id;
      perform private.retention_rolling_record_event(
        job.organization_id, job.project_id, job.originating_payment_claim_id,
        job.target_retention_claim_id, job.operation, 'failed',
        job.retry_count + 1, job.correlation_id, sqlstate,
        jsonb_build_object('message', left(sqlerrm, 500))
      );
      failed := failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'processed', processed,
    'succeeded', succeeded,
    'failed', failed
  );
end;
$$;

create or replace function public.get_retention_rolling_draft_origins(
  p_retention_claim_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  claim public.retention_claims%rowtype;
  context jsonb;
  eligibility jsonb;
begin
  select * into claim from public.retention_claims where id = p_retention_claim_id;
  if not found then
    return jsonb_build_object('succeeded', false, 'errorCode', 'claim_not_found', 'origins', '[]'::jsonb);
  end if;

  context := private.retention_claim_operation_context(claim.project_id, 'retention.view', false);
  if not coalesce((context ->> 'succeeded')::boolean, false) then
    return context || jsonb_build_object('origins', '[]'::jsonb);
  end if;

  eligibility := public.get_project_retention_eligibility(claim.project_id);
  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'automaticRolling', claim.draft_kind = 'automatic_rolling',
    'origins', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', candidate.id,
          'originatingPaymentClaimId', candidate.originating_payment_claim_id,
          'originSequence', candidate.origin_sequence,
          'latestOriginStateHash', candidate.latest_origin_state_hash,
          'latestRetentionOwned', candidate.latest_retention_owned,
          'originStateStale',
            candidate.latest_origin_state_hash is distinct from
              private.retention_claim_origin_state_hash(candidate.originating_payment_claim_id),
          'claimNumber', origin ->> 'claimNumber',
          'claimDate', origin ->> 'claimDate',
          'currentRetentionOwned', coalesce((origin ->> 'currentRetentionOwned')::numeric, 0),
          'currentEligibleRetention', coalesce((origin ->> 'currentEligibleRetention')::numeric, 0),
          'committedRetention', coalesce((origin ->> 'committedRetention')::numeric, 0),
          'availableRetention', coalesce((origin ->> 'availableRetention')::numeric, 0),
          'allocationId', allocation.id,
          'allocationAmount', allocation.allocation_amount
        )
        order by candidate.origin_sequence
      )
      from public.retention_rolling_draft_origins candidate
      left join lateral (
        select value as origin
        from jsonb_array_elements(coalesce(eligibility -> 'origins', '[]'::jsonb))
        where value ->> 'originatingPaymentClaimId' = candidate.originating_payment_claim_id::text
      ) eligible_origin on true
      left join public.retention_claim_allocations allocation
        on allocation.retention_claim_id = candidate.retention_claim_id
       and allocation.originating_payment_claim_id = candidate.originating_payment_claim_id
      where candidate.retention_claim_id = claim.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_project_rolling_retention_claim(
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  context jsonb;
  claim public.retention_claims%rowtype;
begin
  context := private.retention_claim_operation_context(p_project_id, 'retention.view', false);
  if not coalesce((context ->> 'succeeded')::boolean, false) then
    return context;
  end if;

  select * into claim
  from public.retention_claims
  where organization_id = (context ->> 'organizationId')::uuid
    and project_id = p_project_id
    and status = 'draft'
    and draft_kind = 'automatic_rolling'
  order by created_at desc, id desc
  limit 1;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claim', case when claim.id is null then null else private.retention_claim_header_json(claim.id) end,
    'originCount', case when claim.id is null then 0 else (
      select count(*) from public.retention_rolling_draft_origins where retention_claim_id = claim.id
    ) end,
    'availableAmount', case when claim.id is null then 0 else coalesce((
      select round(sum(coalesce((origin ->> 'availableRetention')::numeric, 0)), 2)
      from public.retention_rolling_draft_origins candidate
      left join lateral (
        select value as origin
        from jsonb_array_elements(
          coalesce(public.get_project_retention_eligibility(p_project_id) -> 'origins', '[]'::jsonb)
        )
        where value ->> 'originatingPaymentClaimId' = candidate.originating_payment_claim_id::text
      ) eligible_origin on true
      where candidate.retention_claim_id = claim.id
    ), 0) end
  );
end;
$$;

create or replace function public.get_project_retention_claim_history(
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  context jsonb;
begin
  context := private.retention_claim_operation_context(
    p_project_id,
    'retention.view',
    false
  );
  if not coalesce((context ->> 'succeeded')::boolean, false) then
    return context || jsonb_build_object('claims', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'succeeded', true,
    'errorCode', null,
    'claims', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'claim', private.retention_claim_header_json(claim.id),
          'paidAmount', coalesce(payment.paid_amount_excl_tax, 0),
          'outstandingAmount',
            greatest(
              claim.subtotal_excl_tax
              - coalesce(payment.paid_amount_excl_tax, 0),
              0
            )
        )
        order by claim.created_at desc, claim.id desc
      )
      from public.retention_claims claim
      left join lateral (
        select reconciliation.paid_amount_excl_tax
        from public.retention_claim_payment_reconciliations reconciliation
        where reconciliation.retention_claim_id = claim.id
          and reconciliation.projection_applied
        order by reconciliation.reconciliation_sequence desc
        limit 1
      ) payment on true
      where claim.organization_id = (context ->> 'organizationId')::uuid
        and claim.project_id = p_project_id
        and not (
          claim.status = 'draft'
          and claim.draft_kind = 'automatic_rolling'
        )
    ), '[]'::jsonb)
  );
end;
$$;

-- Existing submitted positive-retention Payment Claims are projected only for
-- projects whose approved Retention capability is already enabled in observe.
insert into public.retention_rolling_draft_jobs (
  organization_id, project_id, originating_payment_claim_id,
  operation, status, correlation_id, requested_by
)
select
  claim.organization_id,
  claim.project_id,
  claim.id,
  'confirmed',
  'pending',
  gen_random_uuid()::text,
  claim.created_by
from public.project_claims claim
join public.organization_capabilities capability
  on capability.organization_id = claim.organization_id
 and capability.capability_key = 'retention_management'
 and capability.enabled
join public.project_retention_workflow_states workflow
  on workflow.organization_id = claim.organization_id
 and workflow.project_id = claim.project_id
 and workflow.mode = 'observe'
where claim.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')
  and round(coalesce(claim.retention_withheld_amount, 0), 2) > 0
on conflict (originating_payment_claim_id) do nothing;

do $$
declare
  queued record;
  result jsonb;
begin
  for queued in
    select * from public.retention_rolling_draft_jobs where status = 'pending'
    order by requested_at, id
  loop
    begin
      result := private.maintain_retention_rolling_draft(
        queued.originating_payment_claim_id,
        queued.operation,
        queued.correlation_id,
        queued.retry_count
      );
      update public.retention_rolling_draft_jobs
      set
        status = 'succeeded',
        target_retention_claim_id = nullif(result ->> 'retentionClaimId', '')::uuid,
        processed_at = now(),
        updated_at = now()
      where id = queued.id;
    exception when others then
      update public.retention_rolling_draft_jobs
      set
        status = 'retry_scheduled',
        retry_count = retry_count + 1,
        next_attempt_at = now() + interval '1 minute',
        last_error_class = sqlstate,
        last_error_message = left(sqlerrm, 1000),
        updated_at = now()
      where id = queued.id;
    end;
  end loop;
end;
$$;

revoke all on function public.process_retention_rolling_draft_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.process_retention_rolling_draft_jobs(integer)
  to service_role;

revoke all on function public.get_retention_rolling_draft_origins(uuid)
  from public, anon;
grant execute on function public.get_retention_rolling_draft_origins(uuid)
  to authenticated;

revoke all on function public.get_project_rolling_retention_claim(uuid)
  from public, anon;
grant execute on function public.get_project_rolling_retention_claim(uuid)
  to authenticated;

revoke all on function public.get_project_retention_claim_history(uuid)
  from public, anon;
grant execute on function public.get_project_retention_claim_history(uuid)
  to authenticated;

revoke all on function public.enqueue_retention_rolling_draft_after_claim()
  from public, anon, authenticated;
revoke all on function private.enqueue_retention_rolling_draft(uuid, text)
  from public, anon, authenticated;
revoke all on function private.maintain_retention_rolling_draft(uuid, text, text, integer)
  from public, anon, authenticated;

commit;
