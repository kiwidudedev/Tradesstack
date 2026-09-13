begin;

-- Extend the existing response-scoped QA evidence authority for app-generated
-- drawn signatures. Historical typed acknowledgements remain valid unchanged.
alter table public.project_qa_responses
  drop constraint project_qa_responses_signature_check;

alter table public.project_qa_responses
  add column signature_evidence_id uuid null,
  add column signature_artifact_sha256 text null,
  add column signature_artifact_metadata jsonb null,
  add column signature_recorded_by_name text null;

alter table public.project_qa_evidence_uploads
  drop constraint project_qa_evidence_uploads_type_check,
  add constraint project_qa_evidence_uploads_type_check check (evidence_type in ('photo','file','signature'));

alter table public.project_qa_response_evidence
  drop constraint project_qa_response_evidence_type_check,
  add column content_sha256 text null,
  add column image_width integer null,
  add column image_height integer null,
  add constraint project_qa_response_evidence_type_check check (evidence_type in ('photo','file','signature')),
  add constraint project_qa_response_evidence_hash_check check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint project_qa_response_evidence_image_dimensions_check check (
    (image_width is null and image_height is null)
    or (image_width between 1 and 4096 and image_height between 1 and 2048)
  ),
  add constraint project_qa_response_evidence_response_id_key unique (project_qa_response_id,id);

alter table public.project_qa_responses
  add constraint project_qa_responses_signature_evidence_fkey
  foreign key (id,signature_evidence_id)
  references public.project_qa_response_evidence(project_qa_response_id,id)
  on delete restrict;

create or replace function public.qa_signature_metadata_is_valid_v1(p_metadata jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  return coalesce(
    jsonb_typeof(p_metadata)='object'
    and p_metadata->>'schemaVersion'='1'
    and p_metadata->>'rendererVersion'='1'
    and p_metadata->>'mimeType'='image/png'
    and (p_metadata->>'logicalWidth')::numeric between 100 and 2000
    and (p_metadata->>'logicalHeight')::numeric between 100 and 800
    and (p_metadata->>'pixelWidth')::integer between 100 and 4096
    and (p_metadata->>'pixelHeight')::integer between 100 and 2048
    and (p_metadata->>'devicePixelRatio')::numeric between 1 and 3
    and abs((p_metadata->>'pixelWidth')::integer-round((p_metadata->>'logicalWidth')::numeric*(p_metadata->>'devicePixelRatio')::numeric))<=1
    and abs((p_metadata->>'pixelHeight')::integer-round((p_metadata->>'logicalHeight')::numeric*(p_metadata->>'devicePixelRatio')::numeric))<=1
    and (p_metadata->>'strokeCount')::integer >= 1
    and (p_metadata->>'pointCount')::integer >= 3
    and (p_metadata->>'totalDistance')::numeric >= 20
    and jsonb_typeof(p_metadata->'bounds')='object'
    and (p_metadata->'bounds'->>'width')::numeric >= 12
    and (p_metadata->'bounds'->>'height')::numeric >= 8,
    false
  );
exception when others then
  return false;
end;
$$;

alter table public.project_qa_responses
  add constraint project_qa_responses_signature_check check (
    (
      num_nonnulls(signature_signer_name,signature_method,signature_attestation,signature_signed_by,signature_signed_at,
        signature_evidence_id,signature_artifact_sha256,signature_artifact_metadata,signature_recorded_by_name)=0
    )
    or (
      field_type='signature'
      and char_length(btrim(signature_signer_name)) between 1 and 240
      and char_length(btrim(signature_attestation)) between 1 and 1000
      and signature_signed_by is not null
      and signature_signed_at is not null
      and (
        (
          signature_method='typed_acknowledgement'
          and signature_evidence_id is null
          and signature_artifact_sha256 is null
          and signature_artifact_metadata is null
          -- Null remains valid for typed rows created before this migration.
          and (signature_recorded_by_name is null or char_length(btrim(signature_recorded_by_name)) between 1 and 240)
        )
        or (
          signature_method='drawn_signature'
          and signature_evidence_id is not null
          and signature_artifact_sha256 ~ '^[a-f0-9]{64}$'
          and public.qa_signature_metadata_is_valid_v1(signature_artifact_metadata)
          and char_length(btrim(signature_recorded_by_name)) between 1 and 240
        )
      )
    )
  );

create or replace function public.qa_evidence_mime_allowed_v1(p_type text,p_mime text)
returns boolean language sql immutable set search_path='' as $$
  select case p_type
    when 'photo' then lower(p_mime) in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
    when 'signature' then lower(p_mime)='image/png'
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
declare run_row public.project_qa_runs%rowtype; response_row public.project_qa_responses%rowtype; existing public.project_qa_evidence_uploads%rowtype; new_id uuid:=gen_random_uuid(); clean_name text:=btrim(coalesce(p_original_filename,'')); clean_mime text:=lower(btrim(coalesce(p_mime_type,''))); object_path text; maximum_size bigint;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then raise exception 'Not authorized to upload QA evidence' using errcode='42501'; end if;
  select * into run_row from public.project_qa_runs where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id for update;
  if not found then raise exception 'QA Record not found' using errcode='TS404'; end if;
  if run_row.status<>'in_progress' then raise exception 'Evidence can only be added to an in-progress QA Record' using errcode='TS409'; end if;
  select * into response_row from public.project_qa_responses where organization_id=p_organization_id and project_id=p_project_id and run_id=p_run_id and id=p_response_id;
  if not found then raise exception 'QA response not found' using errcode='TS404'; end if;
  if p_evidence_type='photo' and response_row.field_type not in ('photo','inspection_check') then raise exception 'Photo evidence is not valid for this response' using errcode='TS422'; end if;
  if p_evidence_type='file' and response_row.field_type not in ('file','inspection_check') then raise exception 'File evidence is not valid for this response' using errcode='TS422'; end if;
  if p_evidence_type='signature' and response_row.field_type<>'signature' then raise exception 'Signature evidence is not valid for this response' using errcode='TS422'; end if;
  if p_purpose not in ('general','failure') then raise exception 'Invalid QA evidence purpose' using errcode='TS422'; end if;
  if char_length(clean_name) not between 1 and 250 or clean_name~'[[:cntrl:]]' or position('/' in clean_name)>0 or position(chr(92) in clean_name)>0 then raise exception 'Invalid evidence filename' using errcode='TS422'; end if;
  maximum_size:=case when p_evidence_type='signature' then 2097152 else 104857600 end;
  if p_byte_size is null or p_byte_size<1 or p_byte_size>maximum_size then
    if p_evidence_type='signature' then raise exception 'QA signature evidence must be 2 MB or smaller' using errcode='TS422';
    else raise exception 'QA evidence must be 100 MB or smaller' using errcode='TS422'; end if;
  end if;
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
  if upload_row.evidence_type='signature' then raise exception 'Signature evidence requires signature finalization' using errcode='TS422'; end if;
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

create or replace function public.finalize_drawn_project_qa_signature_v1(
  p_upload_id uuid,p_signer_name text,p_attestation text,p_sha256 text,p_metadata jsonb,p_image_width integer,p_image_height integer
) returns table(evidence_id uuid,response_lock_version integer,run_lock_version integer,signed_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare upload_row public.project_qa_evidence_uploads%rowtype; run_row public.project_qa_runs%rowtype; response_row public.project_qa_responses%rowtype; object_row storage.objects%rowtype; inserted_id uuid; actual_size bigint; actual_mime text; next_response integer; next_run integer; signed_time timestamptz:=now(); actor_name text;
begin
  select * into upload_row from public.project_qa_evidence_uploads where id=p_upload_id and initiated_by=auth.uid() for update;
  if not found or not public.can_access_qa_project(upload_row.organization_id,upload_row.project_id,'qa.inspect') then raise exception 'QA signature upload not found or access denied' using errcode='42501'; end if;
  if upload_row.status<>'pending' or upload_row.expires_at<=now() or upload_row.evidence_type<>'signature' then raise exception 'QA signature upload is not pending' using errcode='TS409'; end if;
  select * into run_row from public.project_qa_runs where id=upload_row.run_id for update;
  if run_row.status<>'in_progress' then raise exception 'Only an in-progress QA Record can be signed' using errcode='TS409'; end if;
  select * into response_row from public.project_qa_responses where id=upload_row.response_id and run_id=upload_row.run_id for update;
  if not found or response_row.field_type<>'signature' then raise exception 'Signature response not found' using errcode='TS404'; end if;
  if char_length(btrim(coalesce(p_signer_name,''))) not between 1 and 240 or char_length(btrim(coalesce(p_attestation,''))) not between 1 and 1000 then raise exception 'Signer name and acknowledgement are required' using errcode='TS422'; end if;
  if p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' or not public.qa_signature_metadata_is_valid_v1(p_metadata) then raise exception 'Invalid signature artifact metadata' using errcode='TS422'; end if;
  if p_image_width<>((p_metadata->>'pixelWidth')::integer) or p_image_height<>((p_metadata->>'pixelHeight')::integer) then raise exception 'Signature image dimensions do not match metadata' using errcode='TS422'; end if;
  select * into object_row from storage.objects where bucket_id='project-qa-evidence' and name=upload_row.storage_path;
  if not found then raise exception 'Uploaded signature object was not found' using errcode='TS409'; end if;
  actual_size:=nullif(object_row.metadata->>'size','')::bigint;
  actual_mime:=lower(btrim(coalesce(object_row.metadata->>'mimetype',object_row.metadata->>'contentType','')));
  if actual_size is distinct from upload_row.byte_size or actual_size>2097152 or actual_mime<>'image/png' then raise exception 'Uploaded signature does not match its reservation' using errcode='TS422'; end if;
  select coalesce(nullif(btrim(display_name),''),'TradesStack user') into actor_name from public.organization_members where organization_id=upload_row.organization_id and user_id=auth.uid() order by created_at limit 1;
  if actor_name is null then raise exception 'Authenticated QA actor not found' using errcode='42501'; end if;
  insert into public.project_qa_response_evidence(organization_id,project_id,project_qa_run_id,project_qa_response_id,upload_id,evidence_type,purpose,storage_path,original_filename,mime_type,byte_size,sort_order,uploaded_by,content_sha256,image_width,image_height)
  values(upload_row.organization_id,upload_row.project_id,upload_row.run_id,upload_row.response_id,upload_row.id,'signature','general',upload_row.storage_path,upload_row.original_filename,'image/png',upload_row.byte_size,
    (select count(*) from public.project_qa_response_evidence where project_qa_response_id=upload_row.response_id),auth.uid(),p_sha256,p_image_width,p_image_height)
  returning id into inserted_id;
  update public.project_qa_evidence_uploads set status='finalized',finalized_at=signed_time where id=upload_row.id;
  update public.project_qa_responses set signature_signer_name=btrim(p_signer_name),signature_method='drawn_signature',signature_attestation=btrim(p_attestation),signature_signed_by=auth.uid(),signature_signed_at=signed_time,signature_evidence_id=inserted_id,signature_artifact_sha256=p_sha256,signature_artifact_metadata=p_metadata,signature_recorded_by_name=actor_name,updated_by=auth.uid(),lock_version=lock_version+1 where id=response_row.id returning lock_version into next_response;
  update public.project_qa_runs set lock_version=lock_version+1 where id=upload_row.run_id returning lock_version into next_run;
  return query select inserted_id,next_response,next_run,signed_time;
end; $$;

create or replace function public.sign_project_qa_response_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid,p_response_id uuid,p_signer_name text,p_attestation text)
returns table(response_lock_version integer,run_lock_version integer,signed_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare response_row public.project_qa_responses%rowtype; run_status text; next_response integer; next_run integer; signed_time timestamptz:=now(); actor_name text;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then raise exception 'Not authorized to sign QA' using errcode='42501'; end if;
  select status into run_status from public.project_qa_runs where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id for update;
  if run_status<>'in_progress' then raise exception 'Only an in-progress QA Record can be signed' using errcode='TS409'; end if;
  select * into response_row from public.project_qa_responses where organization_id=p_organization_id and project_id=p_project_id and run_id=p_run_id and id=p_response_id for update;
  if not found or response_row.field_type<>'signature' then raise exception 'Signature response not found' using errcode='TS404'; end if;
  if char_length(btrim(coalesce(p_signer_name,''))) not between 1 and 240 or char_length(btrim(coalesce(p_attestation,''))) not between 1 and 1000 then raise exception 'Signer name and acknowledgement are required' using errcode='TS422'; end if;
  select coalesce(nullif(btrim(display_name),''),'TradesStack user') into actor_name from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() order by created_at limit 1;
  if actor_name is null then raise exception 'Authenticated QA actor not found' using errcode='42501'; end if;
  update public.project_qa_responses set signature_signer_name=btrim(p_signer_name),signature_method='typed_acknowledgement',signature_attestation=btrim(p_attestation),signature_signed_by=auth.uid(),signature_signed_at=signed_time,signature_evidence_id=null,signature_artifact_sha256=null,signature_artifact_metadata=null,signature_recorded_by_name=actor_name,updated_by=auth.uid(),lock_version=lock_version+1 where id=response_row.id returning lock_version into next_response;
  update public.project_qa_runs set lock_version=lock_version+1 where id=p_run_id returning lock_version into next_run;
  return query select next_response,next_run,signed_time;
end; $$;

create or replace function public.guard_project_qa_operational_evidence_immutable_v1()
returns trigger language plpgsql set search_path=public as $$
declare parent_status text;
begin
  if old.evidence_type='signature' then raise exception 'Saved QA signature evidence is immutable' using errcode='TS409'; end if;
  select status into parent_status from public.project_qa_runs where id=coalesce(new.project_qa_run_id,old.project_qa_run_id);
  if parent_status<>'in_progress' then raise exception 'Completed or cancelled QA evidence is immutable' using errcode='TS409'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

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
      when 'signature' then (
        response_row.signature_method='typed_acknowledgement' and response_row.signature_signed_at is not null and response_row.signature_signed_by is not null and nullif(btrim(response_row.signature_signer_name),'') is not null and nullif(btrim(response_row.signature_attestation),'') is not null
        or response_row.signature_method='drawn_signature' and response_row.signature_signed_at is not null and response_row.signature_signed_by is not null and nullif(btrim(response_row.signature_signer_name),'') is not null and nullif(btrim(response_row.signature_attestation),'') is not null and nullif(btrim(response_row.signature_recorded_by_name),'') is not null and response_row.signature_artifact_sha256~'^[a-f0-9]{64}$' and public.qa_signature_metadata_is_valid_v1(response_row.signature_artifact_metadata) and exists(select 1 from public.project_qa_response_evidence evidence where evidence.id=response_row.signature_evidence_id and evidence.project_qa_response_id=response_row.id and evidence.evidence_type='signature' and evidence.mime_type='image/png' and evidence.content_sha256=response_row.signature_artifact_sha256 and evidence.image_width=(response_row.signature_artifact_metadata->>'pixelWidth')::integer and evidence.image_height=(response_row.signature_artifact_metadata->>'pixelHeight')::integer)
      )
      else false end;
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
  update public.project_qa_runs as target set status='completed',completed_by=auth.uid(),completed_at=now(),lock_version=target.lock_version+1 where target.id=run_row.id returning target.completed_at,target.lock_version into next_completed,next_lock;
  return query select 'completed'::text,next_completed,next_lock;
end; $$;

revoke all on function public.qa_signature_metadata_is_valid_v1(jsonb) from public,anon,authenticated;
revoke all on function public.finalize_drawn_project_qa_signature_v1(uuid,text,text,text,jsonb,integer,integer) from public,anon;
grant execute on function public.finalize_drawn_project_qa_signature_v1(uuid,text,text,text,jsonb,integer,integer) to authenticated;

commit;
