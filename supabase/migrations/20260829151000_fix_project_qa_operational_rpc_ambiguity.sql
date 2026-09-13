begin;

-- PL/pgSQL output-column names share a namespace with unqualified table columns.
-- Qualify the three runtime statements identified by the linked-schema linter.
create or replace function public.cancel_project_qa_run_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid)
returns table(status text,cancelled_at timestamptz,lock_version integer)
language plpgsql security definer set search_path=public as $$
declare next_time timestamptz:=now(); next_lock integer;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then raise exception 'Not authorized to cancel QA' using errcode='42501'; end if;
  update public.project_qa_runs as target set status='cancelled',cancelled_by=auth.uid(),cancelled_at=next_time,lock_version=target.lock_version+1
  where target.organization_id=p_organization_id and target.project_id=p_project_id and target.id=p_run_id and target.status='in_progress' returning target.lock_version into next_lock;
  if next_lock is null then raise exception 'Only an in-progress QA Record can be cancelled' using errcode='TS409'; end if;
  return query select 'cancelled'::text,next_time,next_lock;
end; $$;

create or replace function public.signoff_project_qa_run_v1(p_organization_id uuid,p_project_id uuid,p_run_id uuid,p_signer_name text,p_attestation text)
returns table(signoff_id uuid,signed_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare run_status text; inserted_id uuid; next_time timestamptz:=now();
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.signoff') then raise exception 'Not authorized to sign off QA' using errcode='42501'; end if;
  select run.status into run_status from public.project_qa_runs run where run.organization_id=p_organization_id and run.project_id=p_project_id and run.id=p_run_id;
  if run_status<>'completed' then raise exception 'Only a completed QA Record can be signed off' using errcode='TS409'; end if;
  if char_length(btrim(coalesce(p_signer_name,''))) not between 1 and 240 or char_length(btrim(coalesce(p_attestation,''))) not between 1 and 1000 then raise exception 'Sign-off name and acknowledgement are required' using errcode='TS422'; end if;
  insert into public.project_qa_signoffs(organization_id,project_id,run_id,signer_name,attestation,signed_by,signed_at)
  values(p_organization_id,p_project_id,p_run_id,btrim(p_signer_name),btrim(p_attestation),auth.uid(),next_time)
  on conflict(run_id) do nothing returning id into inserted_id;
  if inserted_id is null then select signoff.id,signoff.signed_at into inserted_id,next_time from public.project_qa_signoffs signoff where signoff.run_id=p_run_id; end if;
  return query select inserted_id,next_time;
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
  update public.project_qa_runs as target set status='completed',completed_by=auth.uid(),completed_at=now(),lock_version=target.lock_version+1 where target.id=run_row.id returning target.completed_at,target.lock_version into next_completed,next_lock;
  return query select 'completed'::text,next_completed,next_lock;
end; $$;

commit;
