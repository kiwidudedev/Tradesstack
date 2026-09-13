-- Run only against a disposable local database after all migrations. Rolls back all fixtures.
begin;
do $$
declare
  actor uuid := gen_random_uuid(); org uuid := gen_random_uuid();
  batch uuid := gen_random_uuid(); run uuid := gen_random_uuid(); job uuid := gen_random_uuid();
  older_batch uuid := gen_random_uuid(); older_run uuid := gen_random_uuid(); older_job uuid := gen_random_uuid();
  row_id uuid := gen_random_uuid(); qa_id uuid := gen_random_uuid();
  claimed public.organization_material_import_jobs%rowtype;
  qa public.project_qa_evidence_cleanup_jobs%rowtype;
  retention public.material_source_cleanup_jobs%rowtype;
  outcome text; n integer; rejected boolean := false; rpc_signature text; user_role text;
begin
  foreach rpc_signature in array array[
    'public.claim_project_qa_cleanup_jobs_v1(integer)',
    'public.finish_project_qa_cleanup_job_v1(uuid,uuid,boolean)',
    'public.claim_material_import_job_v2(text,integer,uuid)',
    'public.finalize_material_import_job_v2(uuid,uuid,text,jsonb,jsonb,jsonb,integer)',
    'public.claim_material_source_cleanup_v1(integer)',
    'public.finish_material_source_cleanup_v1(uuid,uuid,boolean)'
  ] loop
    foreach user_role in array array['anon','authenticated'] loop
      if has_function_privilege(user_role,rpc_signature,'execute') then raise exception 'Worker RPC exposed to user role'; end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.claim_material_source_cleanup_v1(1);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Internal service-role check failed'; end if;
  rejected:=false;
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into auth.users(id,email,raw_user_meta_data) values(actor,'local-readiness@example.test','{"organization_name":"Local fixture"}');
  select id into strict org from public.organizations where created_by=actor;
  insert into public.organization_material_import_batches(id,organization_id,file_name,file_type)
    values(batch,org,'test.csv','text/csv'),(older_batch,org,'older.csv','text/csv');
  insert into public.organization_material_import_runs(id,organization_id,import_batch_id)
    values(run,org,batch),(older_run,org,older_batch);
  insert into public.organization_material_import_jobs(id,organization_id,import_batch_id,run_id,run_after)
    values(job,org,batch,run,now()),(older_job,org,older_batch,older_run,now()-interval '1 day');
  select * into claimed from public.claim_material_import_job_v2('local-test',120,job);
  if claimed.id is distinct from job then raise exception 'Targeted claim selected another job'; end if;
  select count(*) into n from public.claim_material_import_job_v2('overlap-test',120,job);
  if n<>0 then raise exception 'Overlapping claim acquired leased job'; end if;
  insert into public.organization_material_import_rows(id,organization_id,import_batch_id,extracted_name)
    values(row_id,org,batch,'original pending row');
  begin
    perform public.finalize_material_import_job_v2(job,gen_random_uuid(),'completed','[]','{}','{}',0);
  exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'Stale lease accepted'; end if;
  rejected:=false;
  begin
    perform public.finalize_material_import_job_v2(job,null,'completed','[]','{}','{}',0);
  exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'Missing lease accepted'; end if;
  rejected:=false;
  begin
    perform public.finalize_material_import_job_v2(job,claimed.lease_token,'completed','[{"row_index":null}]','{}','{}',0);
  exception when not_null_violation then rejected:=true; end;
  if not rejected or not exists(select 1 from public.organization_material_import_rows where id=row_id) then
    raise exception 'Failed publication did not preserve old rows atomically';
  end if;
  outcome:=public.finalize_material_import_job_v2(job,claimed.lease_token,'completed',
    '[{"extracted_name":"new pending row"}]','{"extraction_method":"csv"}','{"duration_ms":1}',0);
  if outcome<>'completed' or exists(select 1 from public.organization_material_import_rows where id=row_id)
    or not exists(select 1 from public.organization_material_import_rows where import_batch_id=batch and extracted_name='new pending row')
    or not exists(select 1 from public.organization_material_import_jobs where id=job and state='completed' and lease_token is null) then
    raise exception 'Atomic publication failed';
  end if;
  insert into public.project_qa_evidence_cleanup_jobs(id,storage_path,reason,created_at)
    values(qa_id,'local-regression-path','removed',now()-interval '2 hours');
  select * into qa from public.claim_project_qa_cleanup_jobs_v1(1);
  if qa.id is distinct from qa_id or qa.attempt_count<>1 then raise exception 'QA claim failed'; end if;
  select count(*) into n from public.claim_project_qa_cleanup_jobs_v1(1);
  if n<>0 then raise exception 'QA overlap acquired same job'; end if;
  perform public.finish_project_qa_cleanup_job_v1(qa.id,qa.lease_token,false);
  select count(*) into n from public.claim_project_qa_cleanup_jobs_v1(1);
  if n<>0 then raise exception 'QA retry has no backoff'; end if;
  update public.project_qa_evidence_cleanup_jobs set attempt_count=4,next_attempt_at=now() where id=qa_id;
  select * into qa from public.claim_project_qa_cleanup_jobs_v1(1);
  perform public.finish_project_qa_cleanup_job_v1(qa.id,qa.lease_token,false);
  if not exists(select 1 from public.project_qa_evidence_cleanup_jobs where id=qa_id and dead_lettered_at is not null) then
    raise exception 'QA failure limit did not dead-letter';
  end if;
  insert into public.project_qa_evidence_cleanup_jobs(storage_path,reason) values('grace-period-path','removed');
  select count(*) into n from public.claim_project_qa_cleanup_jobs_v1(100);
  if n<>0 then raise exception 'QA grace period bypassed'; end if;
  update public.organization_material_import_batches set storage_path='local-material-source',source_retention_until=now()-interval '1 day' where id=batch;
  select * into retention from public.claim_material_source_cleanup_v1(25);
  if retention.batch_id is distinct from batch then raise exception 'Retention claim failed'; end if;
  select count(*) into n from public.claim_material_source_cleanup_v1(25);
  if n<>0 then raise exception 'Retention overlap acquired same job'; end if;
  rejected:=false;
  begin
    update public.organization_material_import_jobs set state='queued' where id=job;
  exception when object_not_in_prerequisite_state then rejected:=true; end;
  if not rejected then raise exception 'Retention allowed source reprocessing'; end if;
  perform public.finish_material_source_cleanup_v1(retention.id,retention.lease_token,false);
  if not exists(select 1 from public.organization_material_import_batches where id=batch and storage_path='local-material-source') then raise exception 'Failed deletion lost source metadata'; end if;
  select count(*) into n from public.claim_material_source_cleanup_v1(25);
  if n<>0 then raise exception 'Retention has no retry backoff'; end if;
  update public.material_source_cleanup_jobs set next_attempt_at=now() where id=retention.id;
  select * into retention from public.claim_material_source_cleanup_v1(25);
  perform public.finish_material_source_cleanup_v1(retention.id,retention.lease_token,true);
  if not exists(select 1 from public.organization_material_import_batches where id=batch and storage_path is null and source_deleted_at is not null) then raise exception 'Successful retention did not finalize metadata'; end if;
end; $$;
rollback;
