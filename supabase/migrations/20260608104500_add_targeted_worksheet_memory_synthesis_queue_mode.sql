drop function if exists public.claim_worksheet_memory_synthesis_batch(integer, uuid, text, integer);
drop function if exists public.enqueue_worksheet_memory_synthesis_queue(integer, uuid);

create or replace function public.enqueue_worksheet_memory_synthesis_queue(
  p_limit integer default 200,
  p_organization_id uuid default null,
  p_semantic_pool_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_ids jsonb := '[]'::jsonb;
begin
  with eligible_pools as (
    select
      p.id,
      p.organization_id,
      p.semantic_signature,
      p.source_revision_hash,
      p.maturity_status,
      case
        when p.maturity_status = 'durable' then 300
        when p.maturity_status = 'reinforced' then 200
        when p.maturity_status = 'ready_for_synthesis' then 100
        else 0
      end as priority
    from public.worksheet_memory_semantic_pools p
    where p.pool_status = 'active'
      and p.maturity_status in ('ready_for_synthesis', 'reinforced', 'durable')
      and (p_organization_id is null or p.organization_id = p_organization_id)
      and (p_semantic_pool_id is null or p.id = p_semantic_pool_id)
    order by
      case p.maturity_status
        when 'durable' then 3
        when 'reinforced' then 2
        when 'ready_for_synthesis' then 1
        else 0
      end desc,
      p.last_seen_at desc,
      p.updated_at desc
    limit case
      when p_semantic_pool_id is null then greatest(coalesce(p_limit, 200), 1)
      else 1
    end
  ),
  inserted as (
    insert into public.worksheet_memory_synthesis_queue (
      organization_id,
      semantic_pool_id,
      semantic_pool_signature,
      source_revision_hash,
      maturity_status,
      queue_state,
      attempt_count,
      max_attempts,
      priority,
      available_at,
      retry_after,
      claimed_at,
      claim_expires_at,
      claimed_by,
      claim_token,
      last_error_code,
      last_error_message,
      last_attempt_at,
      last_completed_at,
      updated_at
    )
    select
      e.organization_id,
      e.id,
      e.semantic_signature,
      e.source_revision_hash,
      e.maturity_status,
      'pending',
      0,
      5,
      e.priority,
      now(),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      now()
    from eligible_pools e
    on conflict (organization_id, semantic_pool_id, source_revision_hash) do nothing
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb)
  into inserted_ids
  from inserted;

  return jsonb_build_object(
    'count', jsonb_array_length(inserted_ids),
    'ids', inserted_ids
  );
end;
$$;

create or replace function public.claim_worksheet_memory_synthesis_batch(
  p_limit integer default 25,
  p_organization_id uuid default null,
  p_worker_id text default null,
  p_lease_seconds integer default 600,
  p_semantic_pool_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_rows jsonb := '[]'::jsonb;
  resolved_worker_id text;
  resolved_lease_seconds integer;
begin
  perform public.enqueue_worksheet_memory_synthesis_queue(
    p_limit := greatest(coalesce(p_limit, 25), 1) * 4,
    p_organization_id := p_organization_id,
    p_semantic_pool_id := p_semantic_pool_id
  );

  resolved_worker_id := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'worksheet-memory-synthesis-runner');
  resolved_lease_seconds := greatest(coalesce(p_lease_seconds, 600), 30);

  with candidate_rows as (
    select q.id
    from public.worksheet_memory_synthesis_queue q
    where (p_organization_id is null or q.organization_id = p_organization_id)
      and (p_semantic_pool_id is null or q.semantic_pool_id = p_semantic_pool_id)
      and q.attempt_count < q.max_attempts
      and q.available_at <= now()
      and q.queue_state in ('pending', 'claimed', 'retry_scheduled')
      and (
        q.queue_state <> 'claimed'
        or q.claim_expires_at is null
        or q.claim_expires_at <= now()
      )
    order by
      q.priority desc,
      (q.attempt_count = 0) desc,
      case when q.attempt_count = 0 then q.created_at end desc,
      case when q.attempt_count > 0 then q.available_at end asc,
      q.created_at asc
    limit case
      when p_semantic_pool_id is null then greatest(coalesce(p_limit, 25), 1)
      else 1
    end
    for update skip locked
  ),
  claimed as (
    update public.worksheet_memory_synthesis_queue q
    set
      queue_state = 'claimed',
      attempt_count = q.attempt_count + 1,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => resolved_lease_seconds),
      claimed_by = resolved_worker_id,
      claim_token = gen_random_uuid(),
      last_attempt_at = now(),
      updated_at = now()
    from candidate_rows c
    where q.id = c.id
    returning q.*
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'organizationId', c.organization_id,
      'semanticPoolId', c.semantic_pool_id,
      'semanticPoolSignature', c.semantic_pool_signature,
      'sourceRevisionHash', c.source_revision_hash,
      'maturityStatus', c.maturity_status,
      'queueState', c.queue_state,
      'attemptCount', c.attempt_count,
      'maxAttempts', c.max_attempts,
      'priority', c.priority,
      'availableAt', c.available_at,
      'retryAfter', c.retry_after,
      'claimedAt', c.claimed_at,
      'claimExpiresAt', c.claim_expires_at,
      'claimedBy', c.claimed_by,
      'claimToken', c.claim_token,
      'lastErrorCode', c.last_error_code,
      'lastErrorMessage', c.last_error_message,
      'createdAt', c.created_at,
      'updatedAt', c.updated_at
    )
    order by c.priority desc, c.created_at asc
  ), '[]'::jsonb)
  into claimed_rows
  from claimed c;

  return claimed_rows;
end;
$$;

grant execute on function public.enqueue_worksheet_memory_synthesis_queue(integer, uuid, uuid) to service_role;
grant execute on function public.claim_worksheet_memory_synthesis_batch(integer, uuid, text, integer, uuid) to service_role;
