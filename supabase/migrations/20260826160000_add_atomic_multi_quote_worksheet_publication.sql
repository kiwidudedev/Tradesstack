begin;

create or replace function public.publish_worksheet_commercial_quotes_v1(p_input jsonb)
returns table (
  id uuid,
  updated_at timestamptz,
  subtotal numeric,
  optional_subtotal numeric,
  gst_amount numeric,
  total_quote_price numeric,
  status text,
  originating_opportunity_id uuid,
  project_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  resolved_organization_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  resolved_opportunity_id uuid := nullif(p_input->>'originatingOpportunityId', '')::uuid;
  destinations jsonb := coalesce(p_input->'destinations', '[]'::jsonb);
  destination jsonb;
  replay_request public.worksheet_quote_publication_requests%rowtype;
  locked_quote_id uuid;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if resolved_organization_id is null or resolved_opportunity_id is null then
    raise exception 'organizationId and originatingOpportunityId are required'
      using errcode = 'TS422';
  end if;
  if not public.has_org_permission(resolved_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;
  if jsonb_typeof(destinations) <> 'array' or jsonb_array_length(destinations) = 0 then
    raise exception 'At least one Quote destination is required'
      using errcode = 'TS422';
  end if;
  if jsonb_array_length(destinations) > 50 then
    raise exception 'No more than 50 Quote destinations may be published at once'
      using errcode = 'TS422';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(destinations) item
    group by item->>'quoteId'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(destinations) item
    group by item->>'requestKey'
    having count(*) > 1
  ) then
    raise exception 'Quote destinations and request keys must be unique'
      using errcode = 'TS422';
  end if;

  -- Validate and lock every fresh destination before the first mutation. The
  -- canonical quote-id order prevents two overlapping requests from acquiring
  -- the same Quote/series locks in different orders.
  for destination in
    select item.value
    from jsonb_array_elements(destinations) item
    order by item.value->>'quoteId'
  loop
    if nullif(destination->>'quoteId', '') is null
      or nullif(destination->>'requestKey', '') is null
      or nullif(destination->>'expectedUpdatedAt', '') is null
      or nullif(destination->>'organizationId', '')::uuid is distinct from resolved_organization_id
      or nullif(destination->>'originatingOpportunityId', '')::uuid is distinct from resolved_opportunity_id
    then
      raise exception 'Every destination requires matching organization, Opportunity, Quote, request key, and expected version'
        using errcode = 'TS422';
    end if;

    select request.* into replay_request
    from public.worksheet_quote_publication_requests request
    where request.organization_id = resolved_organization_id
      and request.request_key = destination->>'requestKey';

    if found then
      if replay_request.quote_id is distinct from (destination->>'quoteId')::uuid then
        raise exception 'Publication request key belongs to a different Quote destination'
          using errcode = 'TS409';
      end if;
      continue;
    end if;

    locked_quote_id := null;
    select quote.id into locked_quote_id
    from public.project_quotes quote
    join public.opportunity_quote_series series
      on series.organization_id = quote.organization_id
     and series.id = quote.quote_series_id
    where quote.organization_id = resolved_organization_id
      and quote.id = (destination->>'quoteId')::uuid
      and quote.originating_opportunity_id = resolved_opportunity_id
      and quote.revision_kind = 'tender'
      and quote.status = 'Draft'
      and quote.award_locked_at is null
      and quote.updated_at = (destination->>'expectedUpdatedAt')::timestamptz
      and series.opportunity_id = resolved_opportunity_id
      and series.recipient_client_id is not null
      and series.current_revision_id = quote.id
      and series.archived_at is null
    for update of quote, series;

    if locked_quote_id is null then
      raise exception 'A selected Quote is no longer a current mutable Draft at the expected version'
        using errcode = 'TS409';
    end if;
  end loop;

  -- Each call retains destination-scoped idempotency and concurrency checks,
  -- while the enclosing function makes the complete destination set atomic.
  for destination in
    select item.value
    from jsonb_array_elements(destinations) item
    order by item.value->>'quoteId'
  loop
    return query
    select published.*
    from public.publish_worksheet_commercial_quote_v1(destination) published;
  end loop;
end;
$$;

revoke execute on function public.publish_worksheet_commercial_quotes_v1(jsonb) from public, anon;
grant execute on function public.publish_worksheet_commercial_quotes_v1(jsonb) to authenticated;

commit;
