begin;

-- Service-only destructive-guard probe. Every attempted mutation is enclosed
-- in a PL/pgSQL subtransaction and is rolled back whether it is rejected or
-- unexpectedly succeeds. No customer or Xero payload data is returned.

create or replace function public.probe_accounting_phase2a_immutability(
  p_revision_id uuid,
  p_line_id uuid,
  p_attachment_id uuid,
  p_attempt_id uuid,
  p_event_id uuid,
  p_observation_id uuid,
  p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  revision public.organization_accounting_document_revisions%rowtype;
  result jsonb := '{}'::jsonb;
  passed boolean;
  detail text;
begin
  select * into revision
  from public.organization_accounting_document_revisions
  where id = p_revision_id;
  if not found then raise exception 'Probe revision not found.'; end if;

  begin
    update public.organization_accounting_document_revisions
    set payload_hash = repeat('f', 64) where id = p_revision_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'revisionUpdateRejected', passed, 'revisionUpdateEvidence', detail
  );

  begin
    delete from public.organization_accounting_document_revisions where id = p_revision_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'revisionDeleteRejected', passed, 'revisionDeleteEvidence', detail
  );

  begin
    update public.organization_accounting_revision_lines
    set description = description || ' changed' where id = p_line_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'lineUpdateRejected', passed, 'lineUpdateEvidence', detail
  );

  begin
    delete from public.organization_accounting_revision_lines where id = p_line_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'lineDeleteRejected', passed, 'lineDeleteEvidence', detail
  );

  begin
    update public.organization_accounting_revision_attachments
    set filename = filename || '.replaced' where id = p_attachment_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'attachmentEvidenceUpdateRejected', passed,
    'attachmentUpdateEvidence', detail
  );

  begin
    delete from public.organization_accounting_revision_attachments
    where id = p_attachment_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'attachmentDeleteRejected', passed, 'attachmentDeleteEvidence', detail
  );

  begin
    update public.organization_accounting_revision_attempts
    set response_evidence = jsonb_build_object('rewritten', true)
    where id = p_attempt_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'completedAttemptUpdateRejected', passed, 'attemptUpdateEvidence', detail
  );

  begin
    update public.organization_accounting_events
    set event_evidence = jsonb_build_object('rewritten', true) where id = p_event_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'eventUpdateRejected', passed, 'eventUpdateEvidence', detail
  );

  begin
    delete from public.organization_accounting_events where id = p_event_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'eventDeleteRejected', passed, 'eventDeleteEvidence', detail
  );

  begin
    update public.organization_accounting_remote_observations
    set content_hash = repeat('e', 64) where id = p_observation_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'observationUpdateRejected', passed, 'observationUpdateEvidence', detail
  );

  begin
    delete from public.organization_accounting_remote_observations
    where id = p_observation_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'observationDeleteRejected', passed, 'observationDeleteEvidence', detail
  );

  begin
    update public.organization_accounting_number_reservations
    set tenant_id = tenant_id || '-reassigned' where id = p_reservation_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'reservationReassignmentRejected', passed,
    'reservationUpdateEvidence', detail
  );

  begin
    update public.organization_accounting_documents
    set active_accounting_revision_id = null
    where id = revision.accounting_document_id;
    raise exception 'probe_mutation_succeeded';
  exception when others then
    passed := sqlerrm <> 'probe_mutation_succeeded'; detail := sqlstate || ':' || sqlerrm;
  end;
  result := result || jsonb_build_object(
    'directPointerUpdateRejected', passed, 'pointerUpdateEvidence', detail
  );

  return result;
end;
$$;

revoke all on function
  public.probe_accounting_phase2a_immutability(uuid,uuid,uuid,uuid,uuid,uuid,uuid)
from public, anon, authenticated;
grant execute on function
  public.probe_accounting_phase2a_immutability(uuid,uuid,uuid,uuid,uuid,uuid,uuid)
to service_role;

commit;
