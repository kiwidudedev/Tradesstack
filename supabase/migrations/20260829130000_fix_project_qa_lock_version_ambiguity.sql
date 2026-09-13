begin;

create or replace function public.save_project_qa_response_v1(
  p_organization_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_response_id uuid,
  p_expected_lock_version integer,
  p_value jsonb
) returns table(response_lock_version integer,response_updated_at timestamptz,run_lock_version integer)
language plpgsql security definer set search_path=public as $$
declare
  response_row public.project_qa_responses%rowtype;
  run_row public.project_qa_runs%rowtype;
  next_lock integer;
  next_updated timestamptz;
  next_run_lock integer;
  selected_values jsonb;
  captured_options jsonb;
  selected_count integer;
  matched_count integer;
  person_name text;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then
    raise exception 'Not authorized to update QA Record' using errcode='42501';
  end if;
  select * into run_row from public.project_qa_runs run
  where run.organization_id=p_organization_id and run.project_id=p_project_id and run.id=p_run_id for update;
  if not found then raise exception 'QA Record not found' using errcode='TS404'; end if;
  if run_row.status<>'in_progress' then raise exception 'Only an in-progress QA Record can be updated' using errcode='TS409'; end if;
  select * into response_row from public.project_qa_responses response
  where response.organization_id=p_organization_id and response.project_id=p_project_id
    and response.run_id=p_run_id and response.id=p_response_id for update;
  if not found then raise exception 'QA response not found' using errcode='TS404'; end if;
  if response_row.lock_version<>p_expected_lock_version then raise exception 'This QA response changed elsewhere. Reload before retrying.' using errcode='TS409'; end if;

  if response_row.field_type in ('single_select','multi_select') then
    selected_values:=coalesce(p_value->'selectedOptionValues','[]'::jsonb);
    if jsonb_typeof(selected_values)<>'array' then raise exception 'Selected options must be an array' using errcode='TS422'; end if;
    select count(*),count(distinct value) into selected_count,matched_count from jsonb_array_elements_text(selected_values);
    if selected_count<>matched_count then raise exception 'Selected options must be unique' using errcode='TS422'; end if;
    if response_row.field_type='single_select' and selected_count>1 then raise exception 'Single Select accepts one option' using errcode='TS422'; end if;
    select coalesce(jsonb_agg(option_value order by (option_value->>'sortOrder')::integer,option_value->>'id'),'[]'::jsonb),count(*)
      into captured_options,matched_count
    from jsonb_array_elements(coalesce(response_row.field_snapshot->'options','[]'::jsonb)) option_value
    where option_value->>'value' in (select value from jsonb_array_elements_text(selected_values));
    if matched_count<>selected_count then raise exception 'A selected option is not part of this QA Record snapshot' using errcode='TS422'; end if;
  else
    captured_options:='[]'::jsonb;
  end if;

  if response_row.field_type='inspection_check' and nullif(p_value->>'inspectionResult','') is not null then
    if p_value->>'inspectionResult' not in ('pass','fail','na') then raise exception 'Invalid check result' using errcode='TS422'; end if;
    if p_value->>'inspectionResult'='na' and coalesce((response_row.field_snapshot->>'allowNa')::boolean,false)=false then
      raise exception 'N/A is not allowed for this check' using errcode='TS422';
    end if;
  end if;

  if response_row.field_type in ('number','measurement') and nullif(p_value->>'numericValue','') is not null then
    if lower(p_value->>'numericValue') in ('nan','infinity','-infinity','inf','-inf') then
      raise exception 'Numeric responses must be finite' using errcode='TS422';
    end if;
    perform (p_value->>'numericValue')::numeric;
  end if;
  if response_row.field_type='date' and nullif(p_value->>'dateValue','') is not null then perform (p_value->>'dateValue')::date; end if;

  if response_row.field_type='person' and nullif(p_value->>'personUserId','') is not null then
    select member.display_name into person_name from public.organization_members member
    where member.organization_id=p_organization_id and member.user_id=(p_value->>'personUserId')::uuid limit 1;
    if person_name is null then raise exception 'Selected person is not an organization member' using errcode='TS422'; end if;
  end if;

  update public.project_qa_responses response set
    text_value=case when response_row.field_type in ('short_text','long_text') then coalesce(p_value->>'textValue','') else null end,
    numeric_value=case when response_row.field_type in ('number','measurement') and nullif(p_value->>'numericValue','') is not null then (p_value->>'numericValue')::numeric else null end,
    boolean_value=case when response_row.field_type in ('yes_no','checkbox') and p_value ? 'booleanValue' and jsonb_typeof(p_value->'booleanValue')='boolean' then (p_value->>'booleanValue')::boolean else null end,
    date_value=case when response_row.field_type='date' and nullif(p_value->>'dateValue','') is not null then (p_value->>'dateValue')::date else null end,
    inspection_result=case when response_row.field_type='inspection_check' then nullif(p_value->>'inspectionResult','') else null end,
    selected_options=captured_options,
    person_user_id=case when response_row.field_type='person' and nullif(p_value->>'personUserId','') is not null then (p_value->>'personUserId')::uuid else null end,
    person_display_name=case when response_row.field_type='person' then person_name else null end,
    location_label=case when response_row.field_type='location' then coalesce(p_value->>'locationLabel','') else null end,
    comment=case when response_row.field_type='inspection_check' then coalesce(p_value->>'comment','') else response_row.comment end,
    updated_by=auth.uid(),lock_version=response.lock_version+1
  where response.id=response_row.id
  returning response.lock_version,response.updated_at into next_lock,next_updated;

  update public.project_qa_runs run set lock_version=run.lock_version+1
  where run.id=run_row.id returning run.lock_version into next_run_lock;
  return query select next_lock,next_updated,next_run_lock;
end; $$;

create or replace function public.complete_project_qa_run_v1(
  p_organization_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_expected_lock_version integer
) returns table(status text,completed_at timestamptz,lock_version integer)
language plpgsql security definer set search_path=public as $$
declare run_row public.project_qa_runs%rowtype; response_row public.project_qa_responses%rowtype; config jsonb; required boolean; answered boolean; min_value numeric; max_value numeric; next_completed timestamptz; next_lock integer;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then
    raise exception 'Not authorized to complete QA Record' using errcode='42501';
  end if;
  select * into run_row from public.project_qa_runs run
  where run.organization_id=p_organization_id and run.project_id=p_project_id and run.id=p_run_id for update;
  if not found then raise exception 'QA Record not found' using errcode='TS404'; end if;
  if run_row.status<>'in_progress' then raise exception 'Only an in-progress QA Record can be completed' using errcode='TS409'; end if;
  if run_row.lock_version<>p_expected_lock_version then raise exception 'This QA Record changed elsewhere. Reload before completing.' using errcode='TS409'; end if;

  for response_row in select response.* from public.project_qa_responses response
    where response.organization_id=p_organization_id and response.project_id=p_project_id and response.run_id=p_run_id
    order by response.section_sort_order,response.field_sort_order loop
    required:=coalesce((response_row.field_snapshot->>'required')::boolean,false);
    answered:=case response_row.field_type
      when 'short_text' then nullif(btrim(coalesce(response_row.text_value,'')),'') is not null
      when 'long_text' then nullif(btrim(coalesce(response_row.text_value,'')),'') is not null
      when 'number' then response_row.numeric_value is not null
      when 'measurement' then response_row.numeric_value is not null
      when 'date' then response_row.date_value is not null
      when 'yes_no' then response_row.boolean_value is not null
      when 'single_select' then jsonb_array_length(response_row.selected_options)=1
      when 'multi_select' then jsonb_array_length(response_row.selected_options)>0
      when 'checkbox' then response_row.boolean_value is true
      when 'inspection_check' then response_row.inspection_result is not null
      when 'person' then response_row.person_user_id is not null
      when 'location' then nullif(btrim(coalesce(response_row.location_label,'')),'') is not null
      else false end;
    if required and not answered then
      if response_row.field_type in ('photo','file','signature') then
        raise exception 'Required % field "%" is not supported in this QA phase',response_row.field_type,response_row.field_snapshot->>'label' using errcode='TS422';
      end if;
      raise exception 'Required QA field "%" is incomplete',response_row.field_snapshot->>'label' using errcode='TS422';
    end if;
    if response_row.field_type='inspection_check' and response_row.inspection_result='fail' then
      if coalesce((response_row.field_snapshot->>'requireCommentOnFail')::boolean,false) and nullif(btrim(response_row.comment),'') is null then
        raise exception 'Failed check "%" requires a comment',response_row.field_snapshot->>'label' using errcode='TS422';
      end if;
      if coalesce((response_row.field_snapshot->>'blockCompletionOnFail')::boolean,false) then
        raise exception 'Failed check "%" blocks QA completion',response_row.field_snapshot->>'label' using errcode='TS422';
      end if;
    end if;
    if response_row.field_type='measurement' and response_row.numeric_value is not null then
      config:=coalesce(response_row.field_snapshot->'configuration','{}'::jsonb);
      min_value:=case when nullif(config->>'minimum','') is null then null else (config->>'minimum')::numeric end;
      max_value:=case when nullif(config->>'maximum','') is null then null else (config->>'maximum')::numeric end;
      if min_value is not null and response_row.numeric_value<min_value then raise exception 'Measurement "%" is below its captured minimum',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
      if max_value is not null and response_row.numeric_value>max_value then raise exception 'Measurement "%" is above its captured maximum',response_row.field_snapshot->>'label' using errcode='TS422'; end if;
    end if;
  end loop;

  update public.project_qa_runs run set
    status='completed',completed_by=auth.uid(),completed_at=now(),lock_version=run.lock_version+1
  where run.id=run_row.id returning run.completed_at,run.lock_version into next_completed,next_lock;
  return query select 'completed'::text,next_completed,next_lock;
end; $$;

revoke all on function public.save_project_qa_response_v1(uuid,uuid,uuid,uuid,integer,jsonb),
  public.complete_project_qa_run_v1(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.save_project_qa_response_v1(uuid,uuid,uuid,uuid,integer,jsonb),
  public.complete_project_qa_run_v1(uuid,uuid,uuid,integer) to authenticated;

commit;
