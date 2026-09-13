begin;

-- QA evidence is deliberately isolated from the shared Files write boundary.
-- Inspectors receive narrow, response-scoped upload reservations without files.write.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'project-qa-evidence','project-qa-evidence',false,104857600,
  array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/pdf','text/plain','text/csv','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

alter table public.project_qa_responses
  add constraint project_qa_responses_org_project_run_id_key
  unique (organization_id,project_id,run_id,id),
  add column signature_signer_name text null,
  add column signature_method text null,
  add column signature_attestation text null,
  add column signature_signed_by uuid null references auth.users(id) on delete set null,
  add column signature_signed_at timestamptz null,
  add constraint project_qa_responses_signature_check check (
    num_nonnulls(signature_signer_name,signature_method,signature_attestation,signature_signed_by,signature_signed_at)=0
    or (
      num_nonnulls(signature_signer_name,signature_method,signature_attestation,signature_signed_by,signature_signed_at)=5
      and
      field_type='signature'
      and char_length(btrim(signature_signer_name)) between 1 and 240
      and signature_method='typed_acknowledgement'
      and char_length(btrim(signature_attestation)) between 1 and 1000
      and signature_signed_by is not null
      and signature_signed_at is not null
    )
  );

create table public.project_qa_evidence_uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  run_id uuid not null,
  response_id uuid not null,
  evidence_type text not null,
  purpose text not null default 'general',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null,
  status text not null default 'pending',
  idempotency_key uuid not null,
  initiated_by uuid not null references auth.users(id) on delete restrict,
  initiated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  finalized_at timestamptz null,
  abandoned_at timestamptz null,
  constraint project_qa_evidence_uploads_response_fkey
    foreign key (organization_id,project_id,run_id,response_id)
    references public.project_qa_responses(organization_id,project_id,run_id,id) on delete restrict,
  constraint project_qa_evidence_uploads_type_check check (evidence_type in ('photo','file')),
  constraint project_qa_evidence_uploads_purpose_check check (purpose in ('general','failure')),
  constraint project_qa_evidence_uploads_status_check check (status in ('pending','finalized','abandoned')),
  constraint project_qa_evidence_uploads_size_check check (byte_size between 1 and 104857600),
  constraint project_qa_evidence_uploads_name_check check (char_length(btrim(original_filename)) between 1 and 250),
  constraint project_qa_evidence_uploads_path_check check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+$'),
  constraint project_qa_evidence_uploads_actor_key unique (initiated_by,idempotency_key),
  constraint project_qa_evidence_uploads_state_check check (
    (status='pending' and finalized_at is null and abandoned_at is null)
    or (status='finalized' and finalized_at is not null and abandoned_at is null)
    or (status='abandoned' and finalized_at is null and abandoned_at is not null)
  )
);

create table public.project_qa_response_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  project_qa_run_id uuid not null,
  project_qa_response_id uuid not null,
  upload_id uuid not null unique references public.project_qa_evidence_uploads(id) on delete restrict,
  evidence_type text not null,
  purpose text not null default 'general',
  document_id uuid null,
  document_version_id uuid null,
  storage_bucket text not null default 'project-qa-evidence',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null,
  caption text not null default '',
  sort_order integer not null default 0,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint project_qa_response_evidence_response_fkey
    foreign key (organization_id,project_id,project_qa_run_id,project_qa_response_id)
    references public.project_qa_responses(organization_id,project_id,run_id,id) on delete restrict,
  constraint project_qa_response_evidence_type_check check (evidence_type in ('photo','file')),
  constraint project_qa_response_evidence_purpose_check check (purpose in ('general','failure')),
  constraint project_qa_response_evidence_size_check check (byte_size between 1 and 104857600),
  constraint project_qa_response_evidence_sort_check check (sort_order>=0),
  constraint project_qa_response_evidence_caption_check check (char_length(caption)<=1000)
);

create table public.project_qa_hold_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  run_id uuid not null,
  response_id uuid not null,
  status text not null,
  comment text not null default '',
  released_by uuid not null references auth.users(id) on delete restrict,
  released_at timestamptz not null default now(),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_qa_hold_releases_response_fkey
    foreign key (organization_id,project_id,run_id,response_id)
    references public.project_qa_responses(organization_id,project_id,run_id,id) on delete restrict,
  constraint project_qa_hold_releases_response_key unique (response_id),
  constraint project_qa_hold_releases_status_check check (status in ('released','rejected')),
  constraint project_qa_hold_releases_revision_check check (revision>0)
);

create table public.project_qa_signoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  run_id uuid not null,
  signer_name text not null,
  attestation text not null,
  signed_by uuid not null references auth.users(id) on delete restrict,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint project_qa_signoffs_run_fkey foreign key (organization_id,project_id,run_id)
    references public.project_qa_runs(organization_id,project_id,id) on delete restrict,
  constraint project_qa_signoffs_run_key unique (run_id),
  constraint project_qa_signoffs_name_check check (char_length(btrim(signer_name)) between 1 and 240),
  constraint project_qa_signoffs_attestation_check check (char_length(btrim(attestation)) between 1 and 1000)
);

create table public.project_qa_evidence_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null default 'project-qa-evidence',
  storage_path text not null unique,
  reason text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  attempt_count integer not null default 0,
  last_error text null,
  constraint project_qa_evidence_cleanup_reason_check check (reason in ('abandoned','expired','removed')),
  constraint project_qa_evidence_cleanup_attempt_check check (attempt_count>=0)
);

create index project_qa_evidence_response_idx on public.project_qa_response_evidence
  (organization_id,project_id,project_qa_run_id,project_qa_response_id,sort_order,uploaded_at);
create index project_qa_evidence_upload_expiry_idx on public.project_qa_evidence_uploads(expires_at,id) where status='pending';
create index project_qa_hold_release_run_idx on public.project_qa_hold_releases(organization_id,project_id,run_id,status);
create index project_qa_evidence_cleanup_pending_idx on public.project_qa_evidence_cleanup_jobs(created_at,id) where completed_at is null;

alter table public.project_qa_evidence_uploads enable row level security;
alter table public.project_qa_evidence_uploads force row level security;
alter table public.project_qa_response_evidence enable row level security;
alter table public.project_qa_response_evidence force row level security;
alter table public.project_qa_hold_releases enable row level security;
alter table public.project_qa_hold_releases force row level security;
alter table public.project_qa_signoffs enable row level security;
alter table public.project_qa_signoffs force row level security;
alter table public.project_qa_evidence_cleanup_jobs enable row level security;
alter table public.project_qa_evidence_cleanup_jobs force row level security;

create policy project_qa_evidence_uploads_select on public.project_qa_evidence_uploads for select to authenticated
  using (initiated_by=auth.uid() and public.can_access_qa_project(organization_id,project_id,'qa.inspect'));
create policy project_qa_response_evidence_select on public.project_qa_response_evidence for select to authenticated
  using (public.can_access_qa_project(organization_id,project_id,'qa.view'));
create policy project_qa_hold_releases_select on public.project_qa_hold_releases for select to authenticated
  using (public.can_access_qa_project(organization_id,project_id,'qa.view'));
create policy project_qa_signoffs_select on public.project_qa_signoffs for select to authenticated
  using (public.can_access_qa_project(organization_id,project_id,'qa.view'));

revoke all on public.project_qa_evidence_uploads,public.project_qa_response_evidence,public.project_qa_hold_releases,public.project_qa_signoffs,public.project_qa_evidence_cleanup_jobs from public,anon,authenticated;
grant select on public.project_qa_evidence_uploads,public.project_qa_response_evidence,public.project_qa_hold_releases,public.project_qa_signoffs to authenticated;

create or replace function public.qa_evidence_mime_allowed_v1(p_type text,p_mime text)
returns boolean language sql immutable set search_path='' as $$
  select case p_type
    when 'photo' then lower(p_mime) in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
    when 'file' then lower(p_mime) in (
      'image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','text/plain','text/csv',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) else false end;
$$;

create or replace function public.initiate_project_qa_evidence_upload_v1(
  p_organization_id uuid,p_project_id uuid,p_run_id uuid,p_response_id uuid,
  p_evidence_type text,p_purpose text,p_original_filename text,p_mime_type text,p_byte_size bigint,p_idempotency_key uuid
) returns table(upload_id uuid,storage_path text,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare run_row public.project_qa_runs%rowtype; response_row public.project_qa_responses%rowtype; existing public.project_qa_evidence_uploads%rowtype; new_id uuid:=gen_random_uuid(); clean_name text:=btrim(coalesce(p_original_filename,'')); clean_mime text:=lower(btrim(coalesce(p_mime_type,''))); object_path text;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then raise exception 'Not authorized to upload QA evidence' using errcode='42501'; end if;
  select * into run_row from public.project_qa_runs where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id for update;
  if not found then raise exception 'QA Record not found' using errcode='TS404'; end if;
  if run_row.status<>'in_progress' then raise exception 'Evidence can only be added to an in-progress QA Record' using errcode='TS409'; end if;
  select * into response_row from public.project_qa_responses where organization_id=p_organization_id and project_id=p_project_id and run_id=p_run_id and id=p_response_id;
  if not found then raise exception 'QA response not found' using errcode='TS404'; end if;
  if p_evidence_type='photo' and response_row.field_type not in ('photo','inspection_check') then raise exception 'Photo evidence is not valid for this response' using errcode='TS422'; end if;
  if p_evidence_type='file' and response_row.field_type not in ('file','inspection_check') then raise exception 'File evidence is not valid for this response' using errcode='TS422'; end if;
  if p_purpose not in ('general','failure') then raise exception 'Invalid QA evidence purpose' using errcode='TS422'; end if;
  if char_length(clean_name) not between 1 and 250 or clean_name~'[[:cntrl:]]' or clean_name~E'[/\\]' then raise exception 'Invalid evidence filename' using errcode='TS422'; end if;
  if p_byte_size is null or p_byte_size<1 or p_byte_size>104857600 then raise exception 'QA evidence must be between 1 byte and 100 MB' using errcode='TS422'; end if;
  if not public.qa_evidence_mime_allowed_v1(p_evidence_type,clean_mime) then raise exception 'Unsupported QA evidence file type' using errcode='TS422'; end if;
  select * into existing from public.project_qa_evidence_uploads where initiated_by=auth.uid() and idempotency_key=p_idempotency_key;
  if found then
    if existing.run_id<>p_run_id or existing.response_id<>p_response_id or existing.evidence_type<>p_evidence_type or existing.original_filename<>clean_name or existing.mime_type<>clean_mime or existing.byte_size<>p_byte_size then raise exception 'Upload idempotency key conflict' using errcode='TS409'; end if;
    return query select existing.id,existing.storage_path,existing.expires_at; return;
  end if;
  object_path:=p_organization_id::text||'/'||p_project_id::text||'/'||p_run_id::text||'/'||p_response_id::text||'/'||new_id::text;
  insert into public.project_qa_evidence_uploads(id,organization_id,project_id,run_id,response_id,evidence_type,purpose,storage_path,original_filename,mime_type,byte_size,idempotency_key,initiated_by)
  values(new_id,p_organization_id,p_project_id,p_run_id,p_response_id,p_evidence_type,p_purpose,object_path,clean_name,clean_mime,p_byte_size,p_idempotency_key,auth.uid()) returning project_qa_evidence_uploads.expires_at into expires_at;
  return query select new_id,object_path,expires_at;
end; $$;

create or replace function public.finalize_project_qa_evidence_upload_v1(p_upload_id uuid)
returns table(evidence_id uuid,run_lock_version integer)
language plpgsql security definer set search_path=public as $$
declare upload_row public.project_qa_evidence_uploads%rowtype; run_row public.project_qa_runs%rowtype; object_row storage.objects%rowtype; inserted_id uuid; actual_size bigint; actual_mime text; next_lock integer;
begin
  select * into upload_row from public.project_qa_evidence_uploads where id=p_upload_id and initiated_by=auth.uid() for update;
  if not found or not public.can_access_qa_project(upload_row.organization_id,upload_row.project_id,'qa.inspect') then raise exception 'QA evidence upload not found or access denied' using errcode='42501'; end if;
  if upload_row.status='finalized' then select id into inserted_id from public.project_qa_response_evidence where upload_id=upload_row.id; select lock_version into next_lock from public.project_qa_runs where id=upload_row.run_id; return query select inserted_id,next_lock; return; end if;
  if upload_row.status<>'pending' or upload_row.expires_at<=now() then raise exception 'QA evidence upload is no longer pending' using errcode='TS409'; end if;
  select * into run_row from public.project_qa_runs where id=upload_row.run_id for update;
  if run_row.status<>'in_progress' then raise exception 'Evidence can only be finalized for an in-progress QA Record' using errcode='TS409'; end if;
  select * into object_row from storage.objects where bucket_id='project-qa-evidence' and name=upload_row.storage_path;
  if not found then raise exception 'Uploaded evidence object was not found' using errcode='TS409'; end if;
  actual_size:=nullif(object_row.metadata->>'size','')::bigint;
  actual_mime:=lower(btrim(coalesce(object_row.metadata->>'mimetype',object_row.metadata->>'contentType','')));
  if actual_size is distinct from upload_row.byte_size or actual_mime<>upload_row.mime_type then raise exception 'Uploaded evidence does not match its reservation' using errcode='TS422'; end if;
  insert into public.project_qa_response_evidence(organization_id,project_id,project_qa_run_id,project_qa_response_id,upload_id,evidence_type,purpose,storage_path,original_filename,mime_type,byte_size,sort_order,uploaded_by)
  values(upload_row.organization_id,upload_row.project_id,upload_row.run_id,upload_row.response_id,upload_row.id,upload_row.evidence_type,upload_row.purpose,upload_row.storage_path,upload_row.original_filename,upload_row.mime_type,upload_row.byte_size,
    (select count(*) from public.project_qa_response_evidence where project_qa_response_id=upload_row.response_id),auth.uid()) returning id into inserted_id;
  update public.project_qa_evidence_uploads set status='finalized',finalized_at=now() where id=upload_row.id;
  update public.project_qa_runs set lock_version=lock_version+1 where id=upload_row.run_id returning lock_version into next_lock;
  return query select inserted_id,next_lock;
end; $$;

create or replace function public.abandon_project_qa_evidence_upload_v1(p_upload_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare object_path text;
begin
  update public.project_qa_evidence_uploads set status='abandoned',abandoned_at=now()
  where id=p_upload_id and initiated_by=auth.uid() and status='pending'
    and public.can_access_qa_project(organization_id,project_id,'qa.inspect') returning storage_path into object_path;
  if object_path is null then raise exception 'Pending QA upload not found' using errcode='TS404'; end if;
  insert into public.project_qa_evidence_cleanup_jobs(storage_path,reason) values(object_path,'abandoned') on conflict(storage_path) do nothing;
  return object_path;
end; $$;

create or replace function public.remove_project_qa_evidence_v1(p_evidence_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare evidence_row public.project_qa_response_evidence%rowtype; run_status text;
begin
  select * into evidence_row from public.project_qa_response_evidence where id=p_evidence_id for update;
  if not found or evidence_row.uploaded_by<>auth.uid() or not public.can_access_qa_project(evidence_row.organization_id,evidence_row.project_id,'qa.inspect') then raise exception 'QA evidence not found or access denied' using errcode='42501'; end if;
  select status into run_status from public.project_qa_runs where id=evidence_row.project_qa_run_id for update;
  if run_status<>'in_progress' then raise exception 'Completed or cancelled QA evidence is immutable' using errcode='TS409'; end if;
  insert into public.project_qa_evidence_cleanup_jobs(storage_path,reason) values(evidence_row.storage_path,'removed') on conflict(storage_path) do nothing;
  delete from public.project_qa_response_evidence where id=evidence_row.id;
  update public.project_qa_runs set lock_version=lock_version+1 where id=evidence_row.project_qa_run_id;
  return evidence_row.storage_path;
end; $$;

create or replace function public.guard_project_qa_operational_evidence_immutable_v1()
returns trigger language plpgsql set search_path=public as $$
declare parent_status text;
begin
  select status into parent_status from public.project_qa_runs where id=coalesce(new.project_qa_run_id,old.project_qa_run_id);
  if parent_status<>'in_progress' then raise exception 'Completed or cancelled QA evidence is immutable' using errcode='TS409'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger guard_project_qa_operational_evidence_immutable_v1 before update or delete on public.project_qa_response_evidence for each row execute function public.guard_project_qa_operational_evidence_immutable_v1();

create or replace function public.guard_project_qa_operational_hold_immutable_v1()
returns trigger language plpgsql set search_path=public as $$
declare parent_status text;
begin
  select status into parent_status from public.project_qa_runs where id=coalesce(new.run_id,old.run_id);
  if parent_status<>'in_progress' then raise exception 'Completed or cancelled Hold Point decisions are immutable' using errcode='TS409'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger guard_project_qa_operational_hold_immutable_v1 before update or delete on public.project_qa_hold_releases for each row execute function public.guard_project_qa_operational_hold_immutable_v1();

create or replace function public.queue_expired_project_qa_evidence_uploads_v1()
returns integer language plpgsql security definer set search_path=public as $$
declare queued integer;
begin
  with expired as (
    update public.project_qa_evidence_uploads set status='abandoned',abandoned_at=now()
    where status='pending' and expires_at<=now()
    returning storage_path
  ), inserted as (
    insert into public.project_qa_evidence_cleanup_jobs(storage_path,reason)
    select storage_path,'expired' from expired on conflict(storage_path) do nothing returning 1
  ) select count(*) into queued from inserted;
  return queued;
end; $$;

create or replace function public.sign_project_qa_response_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid,p_response_id uuid,p_signer_name text,p_attestation text)
returns table(response_lock_version integer,run_lock_version integer,signed_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare response_row public.project_qa_responses%rowtype; run_status text; next_response integer; next_run integer; signed_time timestamptz:=now();
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then raise exception 'Not authorized to sign QA' using errcode='42501'; end if;
  select status into run_status from public.project_qa_runs where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id for update;
  if run_status<>'in_progress' then raise exception 'Only an in-progress QA Record can be signed' using errcode='TS409'; end if;
  select * into response_row from public.project_qa_responses where organization_id=p_organization_id and project_id=p_project_id and run_id=p_run_id and id=p_response_id for update;
  if not found or response_row.field_type<>'signature' then raise exception 'Signature response not found' using errcode='TS404'; end if;
  if char_length(btrim(coalesce(p_signer_name,''))) not between 1 and 240 or char_length(btrim(coalesce(p_attestation,''))) not between 1 and 1000 then raise exception 'Signer name and acknowledgement are required' using errcode='TS422'; end if;
  update public.project_qa_responses set signature_signer_name=btrim(p_signer_name),signature_method='typed_acknowledgement',signature_attestation=btrim(p_attestation),signature_signed_by=auth.uid(),signature_signed_at=signed_time,updated_by=auth.uid(),lock_version=lock_version+1 where id=response_row.id returning lock_version into next_response;
  update public.project_qa_runs set lock_version=lock_version+1 where id=p_run_id returning lock_version into next_run;
  return query select next_response,next_run,signed_time;
end; $$;

create or replace function public.set_project_qa_hold_release_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid,p_response_id uuid,p_status text,p_comment text default '')
returns table(release_status text,released_at timestamptz,run_lock_version integer)
language plpgsql security definer set search_path=public as $$
declare response_row public.project_qa_responses%rowtype; run_status text; next_time timestamptz:=now(); next_lock integer;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.verify') then raise exception 'Not authorized to verify QA' using errcode='42501'; end if;
  if p_status not in ('released','rejected') then raise exception 'Invalid Hold Point decision' using errcode='TS422'; end if;
  select status into run_status from public.project_qa_runs where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id for update;
  if run_status<>'in_progress' then raise exception 'Hold Points can only be decided while QA is in progress' using errcode='TS409'; end if;
  select * into response_row from public.project_qa_responses where run_id=p_run_id and id=p_response_id for update;
  if not found or response_row.field_type<>'inspection_check' or coalesce((response_row.field_snapshot->'configuration'->>'holdPointEnabled')::boolean,false)=false or response_row.inspection_result is null then raise exception 'Completed Hold Point response not found' using errcode='TS422'; end if;
  insert into public.project_qa_hold_releases(organization_id,project_id,run_id,response_id,status,comment,released_by,released_at)
  values(p_organization_id,p_project_id,p_run_id,p_response_id,p_status,left(btrim(coalesce(p_comment,'')),1000),auth.uid(),next_time)
  on conflict(response_id) do update set status=excluded.status,comment=excluded.comment,released_by=excluded.released_by,released_at=excluded.released_at,revision=project_qa_hold_releases.revision+1,updated_at=now();
  update public.project_qa_runs set lock_version=lock_version+1 where id=p_run_id returning lock_version into next_lock;
  return query select p_status,next_time,next_lock;
end; $$;

create or replace function public.cancel_project_qa_run_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid)
returns table(status text,cancelled_at timestamptz,lock_version integer)
language plpgsql security definer set search_path=public as $$
declare next_time timestamptz:=now(); next_lock integer;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then raise exception 'Not authorized to cancel QA' using errcode='42501'; end if;
  update public.project_qa_runs set status='cancelled',cancelled_by=auth.uid(),cancelled_at=next_time,lock_version=lock_version+1
  where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id and status='in_progress' returning project_qa_runs.lock_version into next_lock;
  if next_lock is null then raise exception 'Only an in-progress QA Record can be cancelled' using errcode='TS409'; end if;
  return query select 'cancelled'::text,next_time,next_lock;
end; $$;

create or replace function public.signoff_project_qa_run_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid,p_signer_name text,p_attestation text)
returns table(signoff_id uuid,signed_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare run_status text; inserted_id uuid; next_time timestamptz:=now();
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.signoff') then raise exception 'Not authorized to sign off QA' using errcode='42501'; end if;
  select status into run_status from public.project_qa_runs where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id;
  if run_status<>'completed' then raise exception 'Only a completed QA Record can be signed off' using errcode='TS409'; end if;
  if char_length(btrim(coalesce(p_signer_name,''))) not between 1 and 240 or char_length(btrim(coalesce(p_attestation,''))) not between 1 and 1000 then raise exception 'Sign-off name and acknowledgement are required' using errcode='TS422'; end if;
  insert into public.project_qa_signoffs(organization_id,project_id,run_id,signer_name,attestation,signed_by,signed_at)
  values(p_organization_id,p_project_id,p_run_id,btrim(p_signer_name),btrim(p_attestation),auth.uid(),next_time)
  on conflict(run_id) do nothing returning id into inserted_id;
  if inserted_id is null then select id,signed_at into inserted_id,next_time from public.project_qa_signoffs where run_id=p_run_id; end if;
  return query select inserted_id,next_time;
end; $$;

create or replace function public.get_project_qa_run_lock_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
declare result integer;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then raise exception 'Not authorized' using errcode='42501'; end if;
  select lock_version into result from public.project_qa_runs where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id;
  if result is null then raise exception 'QA Record not found' using errcode='TS404'; end if;
  return result;
end; $$;

create or replace function public.list_project_qa_runs_v1(p_organization_id uuid,p_project_id uuid,p_project_qa_id uuid)
returns table(id uuid,status text,title text,location_label text,started_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,lock_version integer,answered_count bigint,response_count bigint)
language sql stable security definer set search_path=public as $$
  select run.id,run.status,run.title,run.location_label,run.started_at,run.completed_at,run.cancelled_at,run.lock_version,
    count(response.id) filter(where case response.field_type
      when 'short_text' then nullif(btrim(response.text_value),'') is not null when 'long_text' then nullif(btrim(response.text_value),'') is not null
      when 'number' then response.numeric_value is not null when 'measurement' then response.numeric_value is not null when 'date' then response.date_value is not null
      when 'yes_no' then response.boolean_value is not null when 'single_select' then jsonb_array_length(response.selected_options)=1
      when 'multi_select' then jsonb_array_length(response.selected_options)>0 when 'checkbox' then response.boolean_value is true
      when 'inspection_check' then response.inspection_result is not null when 'person' then nullif(btrim(response.person_display_name),'') is not null
      when 'location' then nullif(btrim(response.location_label),'') is not null when 'product_material' then nullif(btrim(response.product_material_value->>'productName'),'') is not null
      when 'photo' then exists(select 1 from public.project_qa_response_evidence evidence where evidence.project_qa_response_id=response.id and evidence.evidence_type='photo')
      when 'file' then exists(select 1 from public.project_qa_response_evidence evidence where evidence.project_qa_response_id=response.id and evidence.evidence_type='file')
      when 'signature' then response.signature_signed_at is not null else false end) as answered_count,
    count(response.id) as response_count
  from public.project_qa_runs run left join public.project_qa_responses response on response.run_id=run.id
  where run.organization_id=p_organization_id and run.project_id=p_project_id and run.project_qa_id=p_project_qa_id
    and public.can_access_qa_project(p_organization_id,p_project_id,'qa.view')
  group by run.id order by run.started_at desc limit 200;
$$;

drop function public.list_project_qa_run_summaries_v1(uuid,uuid);
create function public.list_project_qa_run_summaries_v1(p_organization_id uuid,p_project_id uuid)
returns table(project_qa_id uuid,in_progress_count bigint,completed_count bigint,cancelled_count bigint)
language sql stable security definer set search_path=public as $$
  select run.project_qa_id,
    count(*) filter(where run.status='in_progress') as in_progress_count,
    count(*) filter(where run.status='completed') as completed_count,
    count(*) filter(where run.status='cancelled') as cancelled_count
  from public.project_qa_runs run
  where run.organization_id=p_organization_id and run.project_id=p_project_id
    and public.can_access_qa_project(p_organization_id,p_project_id,'qa.view')
  group by run.project_qa_id;
$$;

-- Operational authoring guard. Historical snapshots retain legacy flags, while
-- new Ready transitions and new runs cannot inherit an invisible completion blocker.
create or replace function public.guard_project_qa_operational_definition_v1()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='active' and old.status='draft' then
    if exists(select 1 from public.project_qa_fields field where field.organization_id=new.organization_id and field.project_id=new.project_id and field.project_qa_id=new.id and field.block_completion_on_fail) then raise exception 'Disable the legacy Block Completion on Fail setting before making this QA Ready' using errcode='TS422'; end if;
    if exists(select 1 from public.project_qa_fields field where field.organization_id=new.organization_id and field.project_id=new.project_id and field.project_qa_id=new.id and field.field_type='photo' and field.required and field.minimum_photos<1) then raise exception 'Required Photo fields need at least one photo' using errcode='TS422'; end if;
    if exists(select 1 from public.project_qa_fields field where field.organization_id=new.organization_id and field.project_id=new.project_id and field.project_qa_id=new.id and field.field_type='measurement' and ((nullif(field.configuration->>'target','') is null)<>(nullif(field.configuration->>'tolerance','') is null))) then raise exception 'Measurement Target and Tolerance must be configured together' using errcode='TS422'; end if;
  end if;
  return new;
end; $$;
create trigger guard_project_qa_operational_definition_v1 before update of status on public.project_qas for each row execute function public.guard_project_qa_operational_definition_v1();

create or replace function public.guard_project_qa_run_operational_definition_v1()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.project_qa_fields field where field.organization_id=new.organization_id and field.project_id=new.project_id and field.project_qa_id=new.project_qa_id and field.block_completion_on_fail) then raise exception 'This Ready QA contains a legacy completion blocker. Edit it before starting a new QA Record.' using errcode='TS422'; end if;
  return new;
end; $$;
create trigger guard_project_qa_run_operational_definition_v1 before insert on public.project_qa_runs for each row execute function public.guard_project_qa_run_operational_definition_v1();

create or replace function public.complete_project_qa_run_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid,p_expected_lock_version integer)
returns table(status text,completed_at timestamptz,lock_version integer)
language plpgsql security definer set search_path=public as $$
declare run_row public.project_qa_runs%rowtype; response_row public.project_qa_responses%rowtype; config jsonb; required boolean; answered boolean; comment_rule text; min_value numeric; max_value numeric; target_value numeric; tolerance_value numeric; evidence_count integer; minimum_evidence integer; next_completed timestamptz; next_lock integer;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then raise exception 'Not authorized to complete QA Record' using errcode='42501'; end if;
  select * into run_row from public.project_qa_runs where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id for update;
  if not found then raise exception 'QA Record not found' using errcode='TS404'; end if;
  if run_row.status<>'in_progress' then raise exception 'Only an in-progress QA Record can be completed' using errcode='TS409'; end if;
  if run_row.lock_version<>p_expected_lock_version then raise exception 'This QA Record changed elsewhere. Reload before completing.' using errcode='TS409'; end if;
  if exists(select 1 from public.project_qa_evidence_uploads upload where upload.run_id=p_run_id and upload.status='pending' and upload.expires_at>now()) then raise exception 'Wait for pending QA evidence uploads to finish' using errcode='TS409'; end if;
  for response_row in select * from public.project_qa_responses where organization_id=p_organization_id and project_id=p_project_id and run_id=p_run_id order by section_sort_order,field_sort_order loop
    required:=coalesce((response_row.field_snapshot->>'required')::boolean,false);
    select count(*) into evidence_count from public.project_qa_response_evidence where project_qa_response_id=response_row.id;
    minimum_evidence:=greatest(coalesce((response_row.field_snapshot->>'minimumPhotos')::integer,0),1);
    answered:=case response_row.field_type
      when 'short_text' then nullif(btrim(coalesce(response_row.text_value,'')),'') is not null when 'long_text' then nullif(btrim(coalesce(response_row.text_value,'')),'') is not null
      when 'number' then response_row.numeric_value is not null when 'measurement' then response_row.numeric_value is not null when 'date' then response_row.date_value is not null
      when 'yes_no' then response_row.boolean_value is not null when 'single_select' then jsonb_array_length(response_row.selected_options)=1 when 'multi_select' then jsonb_array_length(response_row.selected_options)>0
      when 'checkbox' then response_row.boolean_value is true when 'inspection_check' then response_row.inspection_result is not null
      when 'person' then nullif(btrim(coalesce(response_row.person_display_name,'')),'') is not null when 'location' then nullif(btrim(coalesce(response_row.location_label,'')),'') is not null
      when 'product_material' then response_row.product_material_value is not null and nullif(btrim(response_row.product_material_value->>'productName'),'') is not null
      when 'photo' then (select count(*) from public.project_qa_response_evidence where project_qa_response_id=response_row.id and evidence_type='photo')>=minimum_evidence
      when 'file' then (select count(*) from public.project_qa_response_evidence where project_qa_response_id=response_row.id and evidence_type='file')>=1
      when 'signature' then response_row.signature_signed_at is not null and nullif(btrim(response_row.signature_signer_name),'') is not null else false end;
    if required and not answered then raise exception 'Required QA field "%" is incomplete',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
    if response_row.field_type='inspection_check' then
      config:=coalesce(response_row.field_snapshot->'configuration','{}'::jsonb);
      comment_rule:=case when config->>'commentRule' in ('optional','required','required_on_fail') then config->>'commentRule' when coalesce((response_row.field_snapshot->>'requireCommentOnFail')::boolean,false) then 'required_on_fail' else 'optional' end;
      if comment_rule='required' and nullif(btrim(response_row.comment),'') is null then raise exception 'Check "%" requires a comment',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
      if response_row.inspection_result='fail' and comment_rule='required_on_fail' and nullif(btrim(response_row.comment),'') is null then raise exception 'Failed check "%" requires a comment',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
      select count(*) into evidence_count from public.project_qa_response_evidence where project_qa_response_id=response_row.id and evidence_type='photo';
      if coalesce((response_row.field_snapshot->>'photoRequired')::boolean,false) and evidence_count<minimum_evidence then raise exception 'Check "%" requires at least % photo(s)',response_row.field_snapshot->>'label',minimum_evidence using errcode='TS422'; end if;
      if response_row.inspection_result='fail' and coalesce((response_row.field_snapshot->>'requirePhotoOnFail')::boolean,false) and evidence_count<minimum_evidence then raise exception 'Failed check "%" requires at least % photo(s)',response_row.field_snapshot->>'label',minimum_evidence using errcode='TS422'; end if;
      if coalesce((response_row.field_snapshot->>'fileRequired')::boolean,false) and not exists(select 1 from public.project_qa_response_evidence where project_qa_response_id=response_row.id and evidence_type='file') then raise exception 'Check "%" requires a supporting file',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
      if coalesce((config->>'holdPointEnabled')::boolean,false) and not exists(select 1 from public.project_qa_hold_releases release where release.response_id=response_row.id and release.status='released') then raise exception 'Hold Point "%" must be released before completion',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
    end if;
    if response_row.field_type='measurement' and response_row.numeric_value is not null then
      config:=coalesce(response_row.field_snapshot->'configuration','{}'::jsonb); min_value:=nullif(config->>'minimum','')::numeric; max_value:=nullif(config->>'maximum','')::numeric; target_value:=nullif(config->>'target','')::numeric; tolerance_value:=nullif(config->>'tolerance','')::numeric;
      if min_value is not null and response_row.numeric_value<min_value then raise exception 'Measurement "%" is below its captured minimum',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
      if max_value is not null and response_row.numeric_value>max_value then raise exception 'Measurement "%" is above its captured maximum',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
      if min_value is null and max_value is null and target_value is not null and tolerance_value is not null and (response_row.numeric_value<target_value-tolerance_value or response_row.numeric_value>target_value+tolerance_value) then raise exception 'Measurement "%" is outside its captured target tolerance',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
    end if;
  end loop;
  update public.project_qa_runs set status='completed',completed_by=auth.uid(),completed_at=now(),lock_version=lock_version+1 where id=run_row.id returning project_qa_runs.completed_at,project_qa_runs.lock_version into next_completed,next_lock;
  return query select 'completed'::text,next_completed,next_lock;
end; $$;

revoke all on function public.qa_evidence_mime_allowed_v1(text,text),public.queue_expired_project_qa_evidence_uploads_v1() from public,anon,authenticated;
grant execute on function public.queue_expired_project_qa_evidence_uploads_v1() to service_role;
revoke all on function public.initiate_project_qa_evidence_upload_v1(uuid,uuid,uuid,uuid,text,text,text,text,bigint,uuid),public.finalize_project_qa_evidence_upload_v1(uuid),public.abandon_project_qa_evidence_upload_v1(uuid),public.remove_project_qa_evidence_v1(uuid),public.sign_project_qa_response_v1(uuid,uuid,uuid,uuid,text,text),public.set_project_qa_hold_release_v1(uuid,uuid,uuid,uuid,text,text),public.cancel_project_qa_run_v1(uuid,uuid,uuid),public.signoff_project_qa_run_v1(uuid,uuid,uuid,text,text),public.get_project_qa_run_lock_v1(uuid,uuid,uuid),public.list_project_qa_runs_v1(uuid,uuid,uuid),public.list_project_qa_run_summaries_v1(uuid,uuid) from public,anon;
grant execute on function public.initiate_project_qa_evidence_upload_v1(uuid,uuid,uuid,uuid,text,text,text,text,bigint,uuid),public.finalize_project_qa_evidence_upload_v1(uuid),public.abandon_project_qa_evidence_upload_v1(uuid),public.remove_project_qa_evidence_v1(uuid),public.sign_project_qa_response_v1(uuid,uuid,uuid,uuid,text,text),public.set_project_qa_hold_release_v1(uuid,uuid,uuid,uuid,text,text),public.cancel_project_qa_run_v1(uuid,uuid,uuid),public.signoff_project_qa_run_v1(uuid,uuid,uuid,text,text),public.get_project_qa_run_lock_v1(uuid,uuid,uuid),public.list_project_qa_runs_v1(uuid,uuid,uuid),public.list_project_qa_run_summaries_v1(uuid,uuid) to authenticated;

commit;
