begin;

create or replace function public.claim_material_import_job_v2(
  p_worker_id text,
  p_lease_seconds integer default 120,
  p_job_id uuid default null
)
returns setof public.organization_material_import_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.organization_material_import_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  select * into v_job
  from public.organization_material_import_jobs
  where (
      state = 'queued'
      or (state = 'processing' and lease_expires_at < now())
    )
    and (p_job_id is null or id = p_job_id)
    and run_after <= now()
    and cancel_requested_at is null
    and attempt_count < max_attempts
  order by run_after asc, created_at asc
  for update skip locked
  limit 1;

  if not found then return; end if;

  update public.organization_material_import_jobs
  set state = 'processing',
      attempt_count = attempt_count + 1,
      lease_owner = p_worker_id,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))),
      heartbeat_at = now()
  where id = v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.claim_material_import_job_v2(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_material_import_job_v2(text, integer, uuid) to service_role;

-- Publish review rows and terminal/retry metadata in one lease-fenced transaction.
create function public.finalize_material_import_job_v2(
  p_job_id uuid, p_lease_token uuid, p_outcome text,
  p_rows jsonb, p_batch jsonb, p_run jsonb, p_retry_seconds integer default 0
) returns text language plpgsql security definer set search_path = '' as $$
declare
  j public.organization_material_import_jobs%rowtype;
  outcome text := p_outcome;
  payload jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501'; end if;
  select * into j from public.organization_material_import_jobs where id=p_job_id for update;
  if not found or p_lease_token is null or j.lease_expires_at is null or j.state<>'processing' or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=now() then
    raise exception 'Material import lease lost' using errcode='40001';
  end if;
  if j.cancel_requested_at is not null then outcome := 'cancelled'; end if;
  if outcome is null or outcome not in ('completed','failed','queued','cancelled') then raise exception 'Invalid job outcome'; end if;
  perform 1 from public.organization_material_import_batches where id=j.import_batch_id and organization_id=j.organization_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if outcome='completed' then
    if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>20000 then raise exception 'Invalid review rows'; end if;
    delete from public.organization_material_import_rows
      where organization_id=j.organization_id and import_batch_id=j.import_batch_id and status='pending_review';
    for payload in select value from jsonb_array_elements(p_rows) loop
      insert into public.organization_material_import_rows
      select (jsonb_populate_record(null::public.organization_material_import_rows,
        jsonb_build_object('id',gen_random_uuid(),'row_index',0,'action','pending','source_payload','{}'::jsonb,
          'classified_needs_review',false,'classified_ai_construction_intelligence','{}'::jsonb)
        || payload || jsonb_build_object('organization_id',j.organization_id,'import_batch_id',j.import_batch_id,
          'status','pending_review','created_at',now(),'updated_at',now()))).*;
    end loop;
    update public.organization_material_import_batches set status='ready_for_review',rows_extracted=jsonb_array_length(p_rows),
      extraction_method=p_batch->>'extraction_method',extraction_summary=coalesce(p_batch->'extraction_summary','{}'::jsonb)
      where id=j.import_batch_id and organization_id=j.organization_id;
  elsif outcome in ('failed','cancelled') then
    update public.organization_material_import_batches set status=outcome,
      extraction_summary=case when outcome='failed' then coalesce(p_batch->'extraction_summary','{}'::jsonb) else extraction_summary end
      where id=j.import_batch_id and organization_id=j.organization_id;
  end if;
  update public.organization_material_import_runs set
    status=case when outcome='completed' and coalesce((p_run->>'partial')::boolean,false) then 'partial' else outcome end,
    model=p_run->>'model',prompt_version=p_run->>'prompt_version',
    request_ids=coalesce(p_run->'request_ids','[]'::jsonb),usage_json=coalesce(p_run->'usage_json','{}'::jsonb),
    chunk_manifest=coalesce(p_run->'chunk_manifest','{}'::jsonb),partial=coalesce((p_run->>'partial')::boolean,false),
    error_code=p_run->>'error_code',error_message=p_run->>'error_message',
    completed_at=case when outcome='queued' then null else now() end,
    duration_ms=(p_run->>'duration_ms')::integer
    where id=j.run_id and organization_id=j.organization_id;
  if not found then raise exception 'Import run not found'; end if;
  update public.organization_material_import_jobs set state=outcome,
    run_after=case when outcome='queued' then now()+make_interval(secs=>greatest(15,least(coalesce(p_retry_seconds,15),3600))) else run_after end,
    lease_owner=null,lease_token=null,lease_expires_at=null,
    last_error_code=p_run->>'error_code',last_error_message=p_run->>'error_message'
    where id=j.id;
  return outcome;
end; $$;
revoke all on function public.finalize_material_import_job_v2(uuid,uuid,text,jsonb,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.finalize_material_import_job_v2(uuid,uuid,text,jsonb,jsonb,jsonb,integer) to service_role;
commit;
