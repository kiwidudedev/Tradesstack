create table if not exists public.cost_construction_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid null,
  tradesstack_cost_code text not null,
  tradesstack_cost_code_label text not null,
  accounting_mapping_id uuid null references public.organization_tradesstack_accounting_mappings (id) on delete set null,
  description text not null default '',
  supplier_id uuid null references public.organization_suppliers (id) on delete set null,
  supplier_name_snapshot text null,
  quantity numeric null,
  unit text null,
  rate numeric null,
  amount numeric null,
  document_context jsonb not null default '{}'::jsonb,
  event_payload jsonb not null default '{}'::jsonb,
  ai_construction_intelligence jsonb null,
  classification_status text not null default 'pending',
  classification_version integer not null default 1,
  ai_provider text null,
  ai_model text null,
  ai_prompt_version integer null,
  processed_at timestamptz null,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists cost_construction_intelligence_events_org_status_idx
  on public.cost_construction_intelligence_events (organization_id, classification_status, created_at desc);

create index if not exists cost_construction_intelligence_events_source_idx
  on public.cost_construction_intelligence_events (source_type, source_id, source_line_id);

create table if not exists public.cost_construction_intelligence_queue (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.cost_construction_intelligence_events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  processing_status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  claim_token text null,
  claim_expires_at timestamptz null,
  retry_after timestamptz null,
  last_error_code text null,
  last_error_message text null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists cost_construction_intelligence_queue_claim_idx
  on public.cost_construction_intelligence_queue (
    organization_id,
    processing_status,
    retry_after,
    created_at
  );

create or replace function public.enqueue_cost_construction_intelligence_event(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_inserted boolean := false;
begin
  insert into public.cost_construction_intelligence_events (
    idempotency_key,
    organization_id,
    project_id,
    source_type,
    source_id,
    source_line_id,
    tradesstack_cost_code,
    tradesstack_cost_code_label,
    accounting_mapping_id,
    description,
    supplier_id,
    supplier_name_snapshot,
    quantity,
    unit,
    rate,
    amount,
    document_context,
    event_payload,
    classification_version
  )
  values (
    p_input ->> 'idempotencyKey',
    (p_input ->> 'organizationId')::uuid,
    nullif(p_input ->> 'projectId', '')::uuid,
    p_input ->> 'sourceType',
    (p_input ->> 'sourceId')::uuid,
    nullif(p_input ->> 'sourceLineId', '')::uuid,
    p_input ->> 'tradesstackCostCode',
    p_input ->> 'tradesstackCostCodeLabel',
    nullif(p_input ->> 'accountingMappingId', '')::uuid,
    coalesce(p_input ->> 'description', ''),
    nullif(p_input ->> 'supplierId', '')::uuid,
    nullif(p_input ->> 'supplierName', ''),
    case when jsonb_typeof(p_input -> 'quantity') = 'number' then (p_input ->> 'quantity')::numeric else null end,
    nullif(p_input ->> 'unit', ''),
    case when jsonb_typeof(p_input -> 'rate') = 'number' then (p_input ->> 'rate')::numeric else null end,
    case when jsonb_typeof(p_input -> 'amount') = 'number' then (p_input ->> 'amount')::numeric else null end,
    coalesce(p_input -> 'documentContext', '{}'::jsonb),
    coalesce(p_input -> 'eventPayload', '{}'::jsonb),
    greatest(coalesce((p_input ->> 'classificationVersion')::integer, 1), 1)
  )
  on conflict (idempotency_key)
  do update set
    project_id = excluded.project_id,
    tradesstack_cost_code = excluded.tradesstack_cost_code,
    tradesstack_cost_code_label = excluded.tradesstack_cost_code_label,
    accounting_mapping_id = excluded.accounting_mapping_id,
    description = excluded.description,
    supplier_id = excluded.supplier_id,
    supplier_name_snapshot = excluded.supplier_name_snapshot,
    quantity = excluded.quantity,
    unit = excluded.unit,
    rate = excluded.rate,
    amount = excluded.amount,
    document_context = excluded.document_context,
    event_payload = excluded.event_payload,
    classification_status = 'pending',
    error_code = null,
    error_message = null,
    processed_at = null,
    updated_at = timezone('utc'::text, now())
  returning id, xmax = 0 into v_event_id, v_inserted;

  insert into public.cost_construction_intelligence_queue (
    event_id,
    organization_id,
    processing_status,
    attempt_count,
    max_attempts,
    claim_token,
    claim_expires_at,
    retry_after,
    last_error_code,
    last_error_message
  )
  values (
    v_event_id,
    (p_input ->> 'organizationId')::uuid,
    'pending',
    0,
    greatest(coalesce((p_input ->> 'maxAttempts')::integer, 5), 1),
    null,
    null,
    null,
    null,
    null
  )
  on conflict (event_id)
  do update set
    processing_status = 'pending',
    claim_token = null,
    claim_expires_at = null,
    retry_after = null,
    last_error_code = null,
    last_error_message = null,
    updated_at = timezone('utc'::text, now());

  return jsonb_build_object(
    'id', v_event_id,
    'inserted', v_inserted
  );
end;
$$;

create or replace function public.claim_cost_construction_intelligence_batch(
  p_limit integer default 25,
  p_organization_id uuid default null,
  p_worker_id text default 'cost-construction-intelligence-worker',
  p_lease_seconds integer default 600
)
returns setof public.cost_construction_intelligence_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_claim_expires_at timestamptz := v_now + make_interval(secs => greatest(p_lease_seconds, 30));
  v_token text := concat(coalesce(nullif(p_worker_id, ''), 'cost-construction-intelligence-worker'), ':', gen_random_uuid()::text);
begin
  return query
  with candidates as (
    select q.id as queue_id, q.event_id
    from public.cost_construction_intelligence_queue q
    where (p_organization_id is null or q.organization_id = p_organization_id)
      and (
        q.processing_status = 'pending'
        or (
          q.processing_status = 'retry_scheduled'
          and (q.retry_after is null or q.retry_after <= v_now)
        )
        or (
          q.processing_status = 'claimed'
          and q.claim_expires_at is not null
          and q.claim_expires_at <= v_now
        )
      )
    order by q.created_at asc
    limit greatest(p_limit, 1)
    for update skip locked
  ),
  claimed as (
    update public.cost_construction_intelligence_queue q
    set
      processing_status = 'claimed',
      attempt_count = q.attempt_count + 1,
      claim_token = v_token,
      claim_expires_at = v_claim_expires_at,
      updated_at = v_now
    from candidates
    where q.id = candidates.queue_id
    returning q.event_id, q.claim_token, q.claim_expires_at, q.attempt_count, q.max_attempts
  )
  select
    e.id,
    e.idempotency_key,
    e.organization_id,
    e.project_id,
    e.source_type,
    e.source_id,
    e.source_line_id,
    e.tradesstack_cost_code,
    e.tradesstack_cost_code_label,
    e.accounting_mapping_id,
    e.description,
    e.supplier_id,
    e.supplier_name_snapshot,
    e.quantity,
    e.unit,
    e.rate,
    e.amount,
    e.document_context,
    e.event_payload,
    e.ai_construction_intelligence,
    e.classification_status,
    e.classification_version,
    e.ai_provider,
    e.ai_model,
    e.ai_prompt_version,
    e.processed_at,
    e.error_code,
    e.error_message,
    e.created_at,
    e.updated_at
  from public.cost_construction_intelligence_events e
  join claimed c on c.event_id = e.id;
end;
$$;

create or replace function public.finalize_cost_construction_intelligence_batch(p_inputs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer := 0;
  v_completed integer := 0;
  v_retried integer := 0;
  v_dead integer := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_inputs, '[]'::jsonb))
  loop
    update public.cost_construction_intelligence_queue
    set
      processing_status = coalesce(v_item ->> 'processingStatus', processing_status),
      claim_token = null,
      claim_expires_at = null,
      retry_after = nullif(v_item ->> 'retryAfter', '')::timestamptz,
      last_error_code = nullif(v_item ->> 'errorCode', ''),
      last_error_message = nullif(v_item ->> 'errorMessage', ''),
      updated_at = timezone('utc'::text, now())
    where event_id = (v_item ->> 'eventId')::uuid
      and claim_token = coalesce(nullif(v_item ->> 'claimToken', ''), claim_token);

    if found then
      v_count := v_count + 1;
      if v_item ->> 'processingStatus' = 'completed' then
        v_completed := v_completed + 1;
      elsif v_item ->> 'processingStatus' = 'retry_scheduled' then
        v_retried := v_retried + 1;
      elsif v_item ->> 'processingStatus' = 'dead_lettered' then
        v_dead := v_dead + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'count', v_count,
    'completedCount', v_completed,
    'retriedCount', v_retried,
    'deadLetteredCount', v_dead
  );
end;
$$;
