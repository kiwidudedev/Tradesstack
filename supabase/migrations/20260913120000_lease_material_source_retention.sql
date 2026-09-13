begin;
create table public.material_source_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique references public.organization_material_import_batches(id) on delete restrict,
  storage_path text not null,
  created_at timestamptz not null default now(),
  lease_token uuid, lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz, dead_lettered_at timestamptz,
  last_error text
);
alter table public.material_source_cleanup_jobs enable row level security;
alter table public.material_source_cleanup_jobs force row level security;
revoke all on public.material_source_cleanup_jobs from public,anon,authenticated;
grant all on public.material_source_cleanup_jobs to service_role;

-- Serialize new/retried processing with retention reservation on the parent batch.
create function public.guard_material_job_source_retention_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare source_path text;
begin
  if new.state in ('queued','processing') then
    select storage_path into source_path from public.organization_material_import_batches
      where id=new.import_batch_id and organization_id=new.organization_id for update;
    if exists(select 1 from public.material_source_cleanup_jobs where batch_id=new.import_batch_id) then
      raise exception 'Import source is reserved for retention cleanup' using errcode='55000';
    end if;
  end if;
  return new;
end; $$;
create trigger material_import_job_source_retention
before insert or update of state on public.organization_material_import_jobs
for each row execute function public.guard_material_job_source_retention_v1();
revoke all on function public.guard_material_job_source_retention_v1() from public,anon,authenticated;

create function public.claim_material_source_cleanup_v1(p_limit integer default 25)
returns setof public.material_source_cleanup_jobs language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501'; end if;
  insert into public.material_source_cleanup_jobs(batch_id,storage_path)
  select b.id,b.storage_path from public.organization_material_import_batches b
  where b.storage_path is not null and b.source_deleted_at is null and b.source_retention_until<=now()
    and not exists(select 1 from public.material_source_cleanup_jobs c where c.batch_id=b.id)
    and b.status in ('ready_for_review','partially_approved','approved','failed','cancelled')
    and not exists(select 1 from public.organization_material_import_jobs j where j.import_batch_id=b.id and j.state in ('queued','processing'))
  order by b.source_retention_until,b.id limit greatest(1,least(coalesce(p_limit,25),100))
  for update of b skip locked on conflict(batch_id) do nothing;
  update public.material_source_cleanup_jobs set dead_lettered_at=now(),last_error='Cleanup retry limit reached.'
    where completed_at is null and dead_lettered_at is null and attempt_count>=5 and (lease_expires_at is null or lease_expires_at<now());
  return query with candidates as (
    select id from public.material_source_cleanup_jobs
    where completed_at is null and dead_lettered_at is null and next_attempt_at<=now()
      and (lease_expires_at is null or lease_expires_at<now())
    order by next_attempt_at,created_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  ) update public.material_source_cleanup_jobs j set lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',attempt_count=j.attempt_count+1
    from candidates c where j.id=c.id returning j.*;
end; $$;

create function public.finish_material_source_cleanup_v1(p_job_id uuid,p_lease_token uuid,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
declare j public.material_source_cleanup_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501'; end if;
  select * into j from public.material_source_cleanup_jobs where id=p_job_id for update;
  if not found or p_lease_token is null or j.lease_expires_at is null or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=now() or j.completed_at is not null then
    raise exception 'Retention lease lost' using errcode='40001';
  end if;
  if p_success then
    update public.organization_material_import_batches set storage_path=null,source_deleted_at=now()
      where id=j.batch_id and storage_path=j.storage_path;
    if not found then raise exception 'Retention source path changed' using errcode='40001'; end if;
  end if;
  update public.material_source_cleanup_jobs set completed_at=case when p_success then now() else null end,
    dead_lettered_at=case when not p_success and attempt_count>=5 then now() else null end,
    next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempt_count,7)))::integer),
    last_error=case when p_success then null else 'Storage retention cleanup failed.' end,
    lease_token=null,lease_expires_at=null where id=j.id;
end; $$;
revoke all on function public.claim_material_source_cleanup_v1(integer),public.finish_material_source_cleanup_v1(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_material_source_cleanup_v1(integer),public.finish_material_source_cleanup_v1(uuid,uuid,boolean) to service_role;
commit;
