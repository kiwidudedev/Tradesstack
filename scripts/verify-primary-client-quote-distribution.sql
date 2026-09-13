begin;

do $$
declare
  member record;
  clients uuid[];
  created record;
  primary_result record;
  tender_result record;
  revised record;
  awarded record;
  series_count integer;
  other_total numeric;
begin
  select organization_id, user_id into member
  from public.organization_members order by created_at limit 1;
  select array_agg(id order by created_at) into clients
  from (select id, created_at from public.organization_clients
    where organization_id = member.organization_id order by created_at limit 3) selected;
  if member.user_id is null or coalesce(array_length(clients, 1), 0) < 3 then
    raise exception 'Local verification requires one member and three clients';
  end if;
  perform set_config('request.jwt.claim.sub', member.user_id::text, true);

  select * into created from public.create_opportunity_workspace_with_tender_clients_v1(
    p_organization_id => member.organization_id,
    p_creation_request_id => gen_random_uuid(),
    p_name => 'Primary Quote Distribution Verification',
    p_client_id => clients[1],
    p_owner_user_id => member.user_id,
    p_location => 'Auckland',
    p_estimated_value => 337500,
    p_tender_client_ids => clients
  );
  select * into primary_result from public.initialize_primary_opportunity_quote_v1(
    member.organization_id, created.opportunity_id
  );
  update public.project_quotes set subtotal = 293478.26, gst_amount = 44021.74,
    total_quote_price = 337500
  where id = primary_result.revision_id;
  insert into public.project_quote_line_items (
    organization_id, project_id, quote_id, section, description,
    quantity, unit, rate, total, is_optional, sort_order
  ) values (
    member.organization_id, null, primary_result.revision_id, 'Item',
    'Persisted source snapshot', 1, 'Item', 293478.26, 293478.26, false, 0
  );

  perform * from public.create_missing_opportunity_client_quotes_v1(
    member.organization_id, created.opportunity_id
  );
  select count(*) into series_count from public.opportunity_quote_series
  where organization_id = member.organization_id and opportunity_id = created.opportunity_id
    and archived_at is null;
  if series_count <> 3 then raise exception 'Expected 3 Quote Series, got %', series_count; end if;

  perform * from public.create_missing_opportunity_client_quotes_v1(
    member.organization_id, created.opportunity_id
  );
  select count(*) into series_count from public.opportunity_quote_series
  where organization_id = member.organization_id and opportunity_id = created.opportunity_id
    and archived_at is null;
  if series_count <> 3 then raise exception 'Bulk distribution was not idempotent'; end if;

  update public.project_quotes set subtotal = 300000, gst_amount = 45000,
    total_quote_price = 345000
  where id = primary_result.revision_id;
  select min(quote.total_quote_price) into other_total
  from public.opportunity_quote_series series
  join public.project_quotes quote on quote.id = series.current_revision_id
  where series.organization_id = member.organization_id
    and series.opportunity_id = created.opportunity_id
    and series.recipient_client_id <> clients[1];
  if other_total <> 337500 then raise exception 'Distributed snapshots changed with Primary quote'; end if;

  select series.*, quote.id as quote_id into tender_result
  from public.opportunity_quote_series series
  join public.project_quotes quote on quote.id = series.current_revision_id
  where series.organization_id = member.organization_id
    and series.opportunity_id = created.opportunity_id
    and series.recipient_client_id = clients[2];
  update public.project_quotes set status = 'Sent' where id = tender_result.quote_id;
  select * into revised from public.create_opportunity_quote_revision_v1(
    member.organization_id, created.opportunity_id, tender_result.quote_id
  );
  if revised.revision_number <> 2 then
    raise exception 'Expected stored revision 2 (display R1), got %', revised.revision_number;
  end if;

  update public.project_quotes set status = 'Accepted' where id = revised.revision_id;
  perform public.select_opportunity_accepted_quote_revision_v1(
    member.organization_id, created.opportunity_id, revised.revision_id
  );
  select * into awarded from public.award_opportunity_by_lifecycle_v1(
    member.organization_id, created.opportunity_id, revised.revision_id,
    'primary-quote-distribution-verification'
  );
  if not exists (select 1 from public.organization_projects project
    where project.organization_id = member.organization_id and project.id = awarded.project_id
      and project.client_id = clients[2]) then
    raise exception 'Winning Project client did not match the accepted Quote Series recipient';
  end if;
  if not exists (select 1 from public.opportunity_final_projects mapping
    where mapping.organization_id = member.organization_id
      and mapping.opportunity_id = created.opportunity_id
      and mapping.accepted_quote_id = revised.revision_id) then
    raise exception 'Final Project mapping did not preserve the accepted client revision';
  end if;

  raise notice 'PASS primary %, three independent series, idempotent distribution, snapshot isolation, first client revision stored as 2/displayed R1, winning Project client and accepted authority exact', primary_result.revision_id;
end;
$$;

rollback;
