begin;

alter table public.project_qa_evidence_cleanup_jobs
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column dead_lettered_at timestamptz;

create function public.claim_project_qa_cleanup_jobs_v1(p_limit integer default 25)
returns setof public.project_qa_evidence_cleanup_jobs
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501'; end if;
  update public.project_qa_evidence_cleanup_jobs set dead_lettered_at=now(),last_error='Cleanup retry limit reached.'
    where completed_at is null and dead_lettered_at is null and attempt_count>=5 and (lease_expires_at is null or lease_expires_at<now());
  return query
  with candidates as (
    select j.id from public.project_qa_evidence_cleanup_jobs j
    where j.completed_at is null and j.dead_lettered_at is null
      and j.next_attempt_at <= now() and j.created_at <= now() - interval '1 hour'
      and (j.lease_expires_at is null or j.lease_expires_at < now())
      and j.storage_bucket = 'project-qa-evidence'
      and not exists (select 1 from public.project_qa_response_evidence e where e.storage_path=j.storage_path)
      and not exists (select 1 from public.project_qa_evidence_uploads u where u.storage_path=j.storage_path and u.status='pending')
    order by j.next_attempt_at,j.created_at,j.id
    for update of j skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.project_qa_evidence_cleanup_jobs j
  set lease_token=gen_random_uuid(), lease_expires_at=now()+interval '5 minutes', attempt_count=j.attempt_count+1
  from candidates c where j.id=c.id returning j.*;
end; $$;

create function public.finish_project_qa_cleanup_job_v1(p_job_id uuid,p_lease_token uuid,p_success boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501'; end if;
  update public.project_qa_evidence_cleanup_jobs
  set completed_at=case when p_success then now() else null end,
      last_error=case when p_success then null else 'Storage cleanup failed.' end,
      dead_lettered_at=case when not p_success and attempt_count>=5 then now() else null end,
      next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempt_count,7)))::integer),
      lease_token=null,lease_expires_at=null
  where id=p_job_id and lease_token=p_lease_token and lease_expires_at>now() and completed_at is null;
  if not found then raise exception 'Cleanup lease lost' using errcode='40001'; end if;
end; $$;
revoke all on function public.claim_project_qa_cleanup_jobs_v1(integer),public.finish_project_qa_cleanup_job_v1(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_project_qa_cleanup_jobs_v1(integer),public.finish_project_qa_cleanup_job_v1(uuid,uuid,boolean) to service_role;
commit;
