begin;

create or replace function public.publish_worksheet_commercial_quote_v1(p_input jsonb)
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
  resolved_quote_id uuid := nullif(p_input->>'quoteId', '')::uuid;
  resolved_request_key text := nullif(p_input->>'requestKey', '');
  existing_request public.worksheet_quote_publication_requests%rowtype;
  destination_quote public.project_quotes%rowtype;
  saved_row record;
  link jsonb;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if resolved_organization_id is null or resolved_request_key is null then
    raise exception 'organizationId and requestKey are required';
  end if;
  if not public.has_org_permission(resolved_organization_id, 'quotes.write') then
    raise exception 'Not authorized for this organization';
  end if;

  select request.* into existing_request
  from public.worksheet_quote_publication_requests request
  where request.organization_id = resolved_organization_id
    and request.request_key = resolved_request_key;

  if found then
    return query
    select quote.id, quote.updated_at, quote.subtotal, quote.optional_subtotal,
      quote.gst_amount, quote.total_quote_price, quote.status,
      quote.originating_opportunity_id, quote.project_id
    from public.project_quotes quote
    where quote.organization_id = resolved_organization_id
      and quote.id = existing_request.quote_id;
    return;
  end if;

  -- The picker is not an authorization boundary. Lock the submitted revision
  -- and its active series head so a concurrent revision cannot make this target
  -- historical between validation and save.
  if resolved_quote_id is not null then
    if resolved_opportunity_id is null then
      raise exception 'originatingOpportunityId is required for an existing quote destination'
        using errcode = 'TS422';
    end if;

    select quote.* into destination_quote
    from public.project_quotes quote
    join public.opportunity_quote_series series
      on series.organization_id = quote.organization_id
     and series.id = quote.quote_series_id
    where quote.organization_id = resolved_organization_id
      and quote.id = resolved_quote_id
      and quote.originating_opportunity_id = resolved_opportunity_id
      and quote.revision_kind = 'tender'
      and quote.status = 'Draft'
      and quote.award_locked_at is null
      and series.opportunity_id = resolved_opportunity_id
      and series.recipient_client_id is not null
      and series.current_revision_id = quote.id
      and series.archived_at is null
    for update of quote, series;

    if not found then
      raise exception 'Selected quote is not the current mutable Draft revision for this Opportunity'
        using errcode = 'TS409';
    end if;
  end if;

  select * into saved_row
  from public.save_commercial_quote_draft(
    p_organization_id => resolved_organization_id,
    p_originating_opportunity_id => resolved_opportunity_id,
    p_project_id => nullif(p_input->>'projectId', '')::uuid,
    p_quote_id => resolved_quote_id,
    p_expected_updated_at => nullif(p_input->>'expectedUpdatedAt', '')::timestamptz,
    p_quote_title => coalesce(p_input->>'quoteTitle', ''),
    p_quote_number => coalesce(p_input->>'quoteNumber', ''),
    p_client_name => coalesce(p_input->>'clientName', ''),
    p_company_name => coalesce(p_input->>'companyName', ''),
    p_contact_person => coalesce(p_input->>'contactPerson', ''),
    p_client_email => coalesce(p_input->>'clientEmail', ''),
    p_client_phone => coalesce(p_input->>'clientPhone', ''),
    p_site_address => coalesce(p_input->>'siteAddress', ''),
    p_project_name => coalesce(p_input->>'projectName', ''),
    p_quote_date => nullif(p_input->>'quoteDate', '')::date,
    p_expiry_date => nullif(p_input->>'expiryDate', '')::date,
    p_status => coalesce(p_input->>'status', 'Draft'),
    p_optional_items_notes => coalesce(p_input->>'optionalItemsNotes', ''),
    p_scope_exclusions => coalesce(p_input->>'scopeExclusions', ''),
    p_assumptions => coalesce(p_input->>'assumptions', ''),
    p_scope_notes => coalesce(p_input->>'scopeNotes', ''),
    p_margin_percent => coalesce(nullif(p_input->>'marginPercent', '')::numeric, 0),
    p_discount_amount => coalesce(nullif(p_input->>'discountAmount', '')::numeric, 0),
    p_contingency_amount => coalesce(nullif(p_input->>'contingencyAmount', '')::numeric, 0),
    p_gst_percent => coalesce(nullif(p_input->>'gstPercent', '')::numeric, 0),
    p_validity_period => coalesce(p_input->>'validityPeriod', ''),
    p_payment_terms => coalesce(p_input->>'paymentTerms', ''),
    p_retention_percent_default => coalesce(nullif(p_input->>'retentionPercentDefault', '')::numeric, 0),
    p_lead_time => coalesce(p_input->>'leadTime', ''),
    p_terms_inclusions => coalesce(p_input->>'termsInclusions', ''),
    p_terms_exclusions => coalesce(p_input->>'termsExclusions', ''),
    p_clarifications => coalesce(p_input->>'clarifications', ''),
    p_acceptance_notes => coalesce(p_input->>'acceptanceNotes', ''),
    p_line_items => coalesce(p_input->'lineItems', '[]'::jsonb)
  );

  perform public.repair_project_quote_source_opportunity_lineage(
    resolved_organization_id,
    saved_row.id
  );

  for link in
    select value from jsonb_array_elements(coalesce(p_input->'commercialItemLinks', '[]'::jsonb))
  loop
    perform public.link_commercial_item_to_quote_line(jsonb_build_object(
      'organizationId', resolved_organization_id,
      'commercialItemId', link->>'commercialItemId',
      'quoteId', saved_row.id,
      'quoteLineId', link->>'quoteLineId',
      'linkRole', 'source',
      'snapshotAtLinkJson', coalesce(link->'snapshotAtLinkJson', '{}'::jsonb)
    ));
  end loop;

  perform public.validate_and_record_quote_publication_v1(
    resolved_organization_id,
    saved_row.id
  );

  insert into public.worksheet_quote_publication_requests (
    organization_id,
    request_key,
    quote_id,
    created_by
  ) values (
    resolved_organization_id,
    resolved_request_key,
    saved_row.id,
    actor_user_id
  );

  return query
  select quote.id, quote.updated_at, quote.subtotal, quote.optional_subtotal,
    quote.gst_amount, quote.total_quote_price, quote.status,
    quote.originating_opportunity_id, quote.project_id
  from public.project_quotes quote
  where quote.organization_id = resolved_organization_id
    and quote.id = saved_row.id;
end;
$$;

revoke execute on function public.publish_worksheet_commercial_quote_v1(jsonb) from public, anon;
grant execute on function public.publish_worksheet_commercial_quote_v1(jsonb) to authenticated;

commit;
