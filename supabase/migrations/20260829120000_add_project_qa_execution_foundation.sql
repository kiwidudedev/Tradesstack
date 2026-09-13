begin;

create table public.project_qa_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  project_qa_id uuid not null,
  project_qa_definition_version integer not null,
  definition_snapshot_schema_version integer not null default 1,
  definition_snapshot jsonb not null,
  definition_snapshot_hash text not null,
  status text not null default 'in_progress',
  title text not null default '',
  location_label text not null default '',
  started_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_by uuid null references auth.users(id) on delete restrict,
  completed_at timestamptz null,
  cancelled_by uuid null references auth.users(id) on delete restrict,
  cancelled_at timestamptz null,
  lock_version integer not null default 1,
  start_idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_qa_runs_parent_fkey foreign key (organization_id, project_id, project_qa_id)
    references public.project_qas(organization_id, project_id, id) on delete restrict,
  constraint project_qa_runs_org_project_id_key unique (organization_id, project_id, id),
  constraint project_qa_runs_status_check check (status in ('in_progress','completed','cancelled')),
  constraint project_qa_runs_definition_version_check check (project_qa_definition_version > 0),
  constraint project_qa_runs_snapshot_schema_check check (definition_snapshot_schema_version > 0 and jsonb_typeof(definition_snapshot) = 'object'),
  constraint project_qa_runs_snapshot_hash_check check (definition_snapshot_hash ~ '^[a-f0-9]{64}$'),
  constraint project_qa_runs_lock_version_check check (lock_version > 0),
  constraint project_qa_runs_completion_check check (
    (status = 'completed' and completed_by is not null and completed_at is not null and cancelled_by is null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_by is not null and cancelled_at is not null and completed_by is null and completed_at is null)
    or (status = 'in_progress' and completed_by is null and completed_at is null and cancelled_by is null and cancelled_at is null)
  ),
  constraint project_qa_runs_start_idempotency_key unique (organization_id, started_by, start_idempotency_key)
);

create table public.project_qa_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  run_id uuid not null,
  captured_section_id uuid not null,
  captured_field_id uuid not null,
  section_sort_order integer not null,
  field_sort_order integer not null,
  field_type text not null,
  field_snapshot jsonb not null,
  text_value text null,
  numeric_value numeric null,
  boolean_value boolean null,
  date_value date null,
  inspection_result text null,
  selected_options jsonb not null default '[]'::jsonb,
  person_user_id uuid null references auth.users(id) on delete set null,
  person_display_name text null,
  location_label text null,
  comment text not null default '',
  lock_version integer not null default 1,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_qa_responses_run_fkey foreign key (organization_id, project_id, run_id)
    references public.project_qa_runs(organization_id, project_id, id) on delete restrict,
  constraint project_qa_responses_run_field_key unique (run_id, captured_field_id),
  constraint project_qa_responses_type_check check (field_type in ('short_text','long_text','number','measurement','date','yes_no','single_select','multi_select','checkbox','inspection_check','photo','file','person','location','signature')),
  constraint project_qa_responses_result_check check (inspection_result is null or inspection_result in ('pass','fail','na')),
  constraint project_qa_responses_options_check check (jsonb_typeof(selected_options) = 'array'),
  constraint project_qa_responses_snapshot_check check (jsonb_typeof(field_snapshot) = 'object'),
  constraint project_qa_responses_sort_check check (section_sort_order >= 0 and field_sort_order >= 0),
  constraint project_qa_responses_lock_version_check check (lock_version > 0)
);

create index project_qa_runs_project_qa_status_idx
  on public.project_qa_runs(organization_id, project_id, project_qa_id, status, started_at desc);
create index project_qa_runs_project_status_idx
  on public.project_qa_runs(organization_id, project_id, status, updated_at desc);
create index project_qa_responses_run_order_idx
  on public.project_qa_responses(organization_id, project_id, run_id, section_sort_order, field_sort_order);

create trigger set_project_qa_runs_updated_at
before update on public.project_qa_runs
for each row execute function public.set_updated_at();

create trigger set_project_qa_responses_updated_at
before update on public.project_qa_responses
for each row execute function public.set_updated_at();

create or replace function public.guard_project_qa_run_immutable_v1()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.status in ('completed','cancelled') then
    raise exception 'Completed or cancelled QA Records are immutable' using errcode='TS409';
  end if;
  if new.organization_id <> old.organization_id
    or new.project_id <> old.project_id
    or new.project_qa_id <> old.project_qa_id
    or new.project_qa_definition_version <> old.project_qa_definition_version
    or new.definition_snapshot_schema_version <> old.definition_snapshot_schema_version
    or new.definition_snapshot <> old.definition_snapshot
    or new.definition_snapshot_hash <> old.definition_snapshot_hash
    or new.started_by <> old.started_by
    or new.started_at <> old.started_at
    or new.start_idempotency_key <> old.start_idempotency_key
    or new.created_at <> old.created_at then
    raise exception 'QA Record identity and definition snapshot are immutable' using errcode='TS409';
  end if;
  return new;
end; $$;

create trigger guard_project_qa_run_immutable_v1
before update on public.project_qa_runs
for each row execute function public.guard_project_qa_run_immutable_v1();

create or replace function public.guard_project_qa_response_immutable_v1()
returns trigger language plpgsql set search_path=public as $$
declare run_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'QA responses cannot be deleted' using errcode='TS409';
  end if;
  select status into run_status from public.project_qa_runs where id=old.run_id;
  if run_status is distinct from 'in_progress' then
    raise exception 'Only in-progress QA Records can be updated' using errcode='TS409';
  end if;
  if new.organization_id <> old.organization_id
    or new.project_id <> old.project_id
    or new.run_id <> old.run_id
    or new.captured_section_id <> old.captured_section_id
    or new.captured_field_id <> old.captured_field_id
    or new.section_sort_order <> old.section_sort_order
    or new.field_sort_order <> old.field_sort_order
    or new.field_type <> old.field_type
    or new.field_snapshot <> old.field_snapshot
    or new.created_at <> old.created_at then
    raise exception 'QA response identity and field snapshot are immutable' using errcode='TS409';
  end if;
  return new;
end; $$;

create trigger guard_project_qa_response_immutable_v1
before update or delete on public.project_qa_responses
for each row execute function public.guard_project_qa_response_immutable_v1();

alter table public.project_qa_runs enable row level security;
alter table public.project_qa_runs force row level security;
alter table public.project_qa_responses enable row level security;
alter table public.project_qa_responses force row level security;

create policy project_qa_runs_select on public.project_qa_runs
for select to authenticated
using (public.can_access_qa_project(organization_id,project_id,'qa.view'));

create policy project_qa_responses_select on public.project_qa_responses
for select to authenticated
using (public.can_access_qa_project(organization_id,project_id,'qa.view'));

revoke all on public.project_qa_runs, public.project_qa_responses from public, anon, authenticated;
grant select on public.project_qa_runs, public.project_qa_responses to authenticated;

create or replace function public.make_project_qa_ready_v1(
  p_organization_id uuid,
  p_project_id uuid,
  p_project_qa_id uuid
) returns integer language plpgsql security definer set search_path=public as $$
declare qa_row public.project_qas%rowtype; section_count integer; field_count integer; current_sections jsonb;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.write') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into qa_row from public.project_qas
  where organization_id=p_organization_id and project_id=p_project_id and id=p_project_qa_id for update;
  if not found then raise exception 'Project QA not found' using errcode='TS404'; end if;
  if qa_row.status <> 'draft' then raise exception 'Only a Draft Project QA can be made Ready' using errcode='TS409'; end if;
  select count(*) into section_count from public.project_qa_sections
    where organization_id=p_organization_id and project_id=p_project_id and project_qa_id=p_project_qa_id;
  select count(*) into field_count from public.project_qa_fields
    where organization_id=p_organization_id and project_id=p_project_id and project_qa_id=p_project_qa_id;
  if section_count = 0 and field_count = 0 then
    raise exception E'Cannot make this QA ready yet.\n- Add at least one section.\n- Add at least one QA field.' using errcode='TS422';
  elsif section_count = 0 then
    raise exception E'Cannot make this QA ready yet.\n- Add at least one section.' using errcode='TS422';
  elsif field_count = 0 then
    raise exception E'Cannot make this QA ready yet.\n- Add at least one QA field.' using errcode='TS422';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'title',s.title,
    'fields',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'fieldType',f.field_type,'label',f.label,'minimumPhotos',f.minimum_photos,
      'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'value',o.value))
        from public.project_qa_field_options o
        where o.organization_id=p_organization_id and o.project_id=p_project_id
          and o.project_qa_id=p_project_qa_id and o.field_id=f.id),'[]'::jsonb)
    ) order by f.sort_order,f.id) from public.project_qa_fields f
      where f.organization_id=p_organization_id and f.project_id=p_project_id
        and f.project_qa_id=p_project_qa_id and f.section_id=s.id),'[]'::jsonb)
  ) order by s.sort_order,s.id),'[]'::jsonb) into current_sections
  from public.project_qa_sections s
  where s.organization_id=p_organization_id and s.project_id=p_project_id and s.project_qa_id=p_project_qa_id;
  perform public.qa_assert_definition(current_sections);
  if exists (
    select 1 from public.project_qa_fields f
    where f.organization_id=p_organization_id and f.project_id=p_project_id and f.project_qa_id=p_project_qa_id
      and f.field_type='measurement' and (
        (f.configuration ? 'minimum' and f.configuration->'minimum'<>'null'::jsonb and jsonb_typeof(f.configuration->'minimum')<>'number')
        or (f.configuration ? 'maximum' and f.configuration->'maximum'<>'null'::jsonb and jsonb_typeof(f.configuration->'maximum')<>'number')
        or (f.configuration ? 'tolerance' and f.configuration->'tolerance'<>'null'::jsonb and jsonb_typeof(f.configuration->'tolerance')<>'number')
        or (jsonb_typeof(f.configuration->'minimum')='number' and jsonb_typeof(f.configuration->'maximum')='number'
          and (f.configuration->>'minimum')::numeric>(f.configuration->>'maximum')::numeric)
        or (jsonb_typeof(f.configuration->'tolerance')='number' and (f.configuration->>'tolerance')::numeric<0)
      )
  ) then
    raise exception E'Cannot make this QA ready yet.\n- Correct invalid measurement limits.' using errcode='TS422';
  end if;
  update public.project_qas set status='active',archived_at=null,updated_by=auth.uid()
  where organization_id=p_organization_id and project_id=p_project_id and id=p_project_qa_id;
  return qa_row.definition_version;
end; $$;

-- The original definition RPC accepted a caller-supplied status. Keep Ready definitions
-- editable, while making Make Ready the only Draft -> Ready command boundary.
alter function public.save_project_qa_definition_v1(uuid,uuid,uuid,text,text,text,jsonb)
  rename to save_project_qa_definition_internal_v1;
revoke all on function public.save_project_qa_definition_internal_v1(uuid,uuid,uuid,text,text,text,jsonb)
  from public,anon,authenticated;

create function public.save_project_qa_definition_v1(
  p_organization_id uuid,p_project_id uuid,p_project_qa_id uuid,p_name text,
  p_description text,p_status text,p_sections jsonb
) returns integer language plpgsql security definer set search_path=public as $$
declare current_status text;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.write') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select status into current_status from public.project_qas
  where organization_id=p_organization_id and project_id=p_project_id and id=p_project_qa_id for update;
  if current_status is null then raise exception 'Project QA not found' using errcode='TS404'; end if;
  if current_status='archived' then raise exception 'Archived Project QA is read-only' using errcode='TS409'; end if;
  if p_status<>current_status then
    raise exception 'Use the explicit Project QA lifecycle action to change status' using errcode='TS409';
  end if;
  return public.save_project_qa_definition_internal_v1(
    p_organization_id,p_project_id,p_project_qa_id,p_name,p_description,p_status,p_sections
  );
end; $$;

create or replace function public.start_project_qa_run_v1(
  p_organization_id uuid,
  p_project_id uuid,
  p_project_qa_id uuid,
  p_start_idempotency_key uuid,
  p_title text default '',
  p_location_label text default ''
) returns table(run_id uuid, created boolean) language plpgsql security definer set search_path=public as $$
declare
  qa_row public.project_qas%rowtype;
  snapshot jsonb;
  snapshot_hash text;
  inserted_id uuid;
  existing_row public.project_qa_runs%rowtype;
  field_count integer;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.inspect') then
    raise exception 'Not authorized to Start QA' using errcode='42501';
  end if;
  if p_start_idempotency_key is null then raise exception 'Start idempotency key is required' using errcode='TS422'; end if;

  select * into existing_row from public.project_qa_runs
  where organization_id=p_organization_id and started_by=auth.uid() and start_idempotency_key=p_start_idempotency_key;
  if found then
    if existing_row.project_id<>p_project_id or existing_row.project_qa_id<>p_project_qa_id then
      raise exception 'Start idempotency key was already used for another QA Record' using errcode='TS409';
    end if;
    return query select existing_row.id,false;
    return;
  end if;

  select * into qa_row from public.project_qas
  where organization_id=p_organization_id and project_id=p_project_id and id=p_project_qa_id for share;
  if not found then raise exception 'Project QA not found' using errcode='TS404'; end if;
  if qa_row.status <> 'active' then raise exception 'Only a Ready Project QA can be started' using errcode='TS409'; end if;

  select count(*) into field_count from public.project_qa_fields
  where organization_id=p_organization_id and project_id=p_project_id and project_qa_id=p_project_qa_id;
  if field_count=0 then raise exception 'Ready Project QA has no executable fields' using errcode='TS422'; end if;

  select jsonb_build_object(
    'schemaVersion',1,
    'projectQaId',qa_row.id,
    'name',qa_row.name,
    'description',qa_row.description,
    'status',qa_row.status,
    'definitionVersion',qa_row.definition_version,
    'sourceTemplateId',qa_row.source_template_id,
    'sourceTemplateName',qa_row.source_template_name,
    'sourceTemplateVersion',qa_row.source_template_version,
    'copiedAt',qa_row.copied_at,
    'sections',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'title',s.title,'description',s.description,'sortOrder',s.sort_order,
        'fields',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',f.id,'sectionId',f.section_id,'fieldType',f.field_type,'label',f.label,
            'description',f.description,'instructions',f.instructions,'required',f.required,
            'allowNa',f.allow_na,'requirement',f.requirement,'acceptanceCriteria',f.acceptance_criteria,
            'referenceText',f.reference_text,'photoRequired',f.photo_required,'minimumPhotos',f.minimum_photos,
            'fileRequired',f.file_required,'requireCommentOnFail',f.require_comment_on_fail,
            'requirePhotoOnFail',f.require_photo_on_fail,'createIssueOnFail',f.create_issue_on_fail,
            'requireRectificationOnFail',f.require_rectification_on_fail,'blockCompletionOnFail',f.block_completion_on_fail,
            'requireSupervisorReviewOnFail',f.require_supervisor_review_on_fail,'aiReviewEnabled',f.ai_review_enabled,
            'aiReviewInstruction',f.ai_review_instruction,'includeInReport',f.include_in_report,
            'configuration',f.configuration,'configurationSchemaVersion',f.configuration_schema_version,
            'sortOrder',f.sort_order,
            'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'value',o.value,'sortOrder',o.sort_order) order by o.sort_order,o.id)
              from public.project_qa_field_options o where o.organization_id=p_organization_id and o.project_id=p_project_id and o.project_qa_id=p_project_qa_id and o.field_id=f.id),'[]'::jsonb)
          ) order by f.sort_order,f.id)
          from public.project_qa_fields f where f.organization_id=p_organization_id and f.project_id=p_project_id and f.project_qa_id=p_project_qa_id and f.section_id=s.id
        ),'[]'::jsonb)
      ) order by s.sort_order,s.id)
      from public.project_qa_sections s where s.organization_id=p_organization_id and s.project_id=p_project_id and s.project_qa_id=p_project_qa_id
    ),'[]'::jsonb)
  ) into snapshot;
  snapshot_hash:=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');

  insert into public.project_qa_runs(
    organization_id,project_id,project_qa_id,project_qa_definition_version,
    definition_snapshot_schema_version,definition_snapshot,definition_snapshot_hash,status,
    title,location_label,started_by,start_idempotency_key
  ) values (
    p_organization_id,p_project_id,p_project_qa_id,qa_row.definition_version,
    1,snapshot,snapshot_hash,'in_progress',left(btrim(coalesce(p_title,'')),240),left(btrim(coalesce(p_location_label,'')),240),auth.uid(),p_start_idempotency_key
  ) on conflict (organization_id,started_by,start_idempotency_key) do nothing returning id into inserted_id;

  if inserted_id is null then
    select * into existing_row from public.project_qa_runs
    where organization_id=p_organization_id and started_by=auth.uid() and start_idempotency_key=p_start_idempotency_key;
    if existing_row.project_id<>p_project_id or existing_row.project_qa_id<>p_project_qa_id then
      raise exception 'Start idempotency key was already used for another QA Record' using errcode='TS409';
    end if;
    return query select existing_row.id,false;
    return;
  end if;

  insert into public.project_qa_responses(
    organization_id,project_id,run_id,captured_section_id,captured_field_id,
    section_sort_order,field_sort_order,field_type,field_snapshot,updated_by
  )
  select p_organization_id,p_project_id,inserted_id,s.id,f.id,s.sort_order,f.sort_order,f.field_type,
    jsonb_build_object(
      'id',f.id,'sectionId',f.section_id,'fieldType',f.field_type,'label',f.label,
      'description',f.description,'instructions',f.instructions,'required',f.required,'allowNa',f.allow_na,
      'requirement',f.requirement,'acceptanceCriteria',f.acceptance_criteria,'referenceText',f.reference_text,
      'photoRequired',f.photo_required,'minimumPhotos',f.minimum_photos,'fileRequired',f.file_required,
      'requireCommentOnFail',f.require_comment_on_fail,'requirePhotoOnFail',f.require_photo_on_fail,
      'createIssueOnFail',f.create_issue_on_fail,'requireRectificationOnFail',f.require_rectification_on_fail,
      'blockCompletionOnFail',f.block_completion_on_fail,'requireSupervisorReviewOnFail',f.require_supervisor_review_on_fail,
      'aiReviewEnabled',f.ai_review_enabled,'aiReviewInstruction',f.ai_review_instruction,
      'includeInReport',f.include_in_report,'configuration',f.configuration,
      'configurationSchemaVersion',f.configuration_schema_version,'sortOrder',f.sort_order,
      'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'value',o.value,'sortOrder',o.sort_order) order by o.sort_order,o.id)
        from public.project_qa_field_options o where o.organization_id=p_organization_id and o.project_id=p_project_id and o.project_qa_id=p_project_qa_id and o.field_id=f.id),'[]'::jsonb)
    ),auth.uid()
  from public.project_qa_sections s join public.project_qa_fields f on f.organization_id=s.organization_id and f.project_id=s.project_id and f.project_qa_id=s.project_qa_id and f.section_id=s.id
  where s.organization_id=p_organization_id and s.project_id=p_project_id and s.project_qa_id=p_project_qa_id
  order by s.sort_order,s.id,f.sort_order,f.id;

  return query select inserted_id,true;
end; $$;

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
  select * into run_row from public.project_qa_runs
  where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id for update;
  if not found then raise exception 'QA Record not found' using errcode='TS404'; end if;
  if run_row.status<>'in_progress' then raise exception 'Only an in-progress QA Record can be updated' using errcode='TS409'; end if;
  select * into response_row from public.project_qa_responses
  where organization_id=p_organization_id and project_id=p_project_id and run_id=p_run_id and id=p_response_id for update;
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
    select display_name into person_name from public.organization_members
    where organization_id=p_organization_id and user_id=(p_value->>'personUserId')::uuid limit 1;
    if person_name is null then raise exception 'Selected person is not an organization member' using errcode='TS422'; end if;
  end if;

  update public.project_qa_responses set
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
    updated_by=auth.uid(),lock_version=lock_version+1
  where id=response_row.id returning lock_version,updated_at into next_lock,next_updated;

  update public.project_qa_runs set lock_version=lock_version+1 where id=run_row.id returning lock_version into next_run_lock;
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
  select * into run_row from public.project_qa_runs
  where organization_id=p_organization_id and project_id=p_project_id and id=p_run_id for update;
  if not found then raise exception 'QA Record not found' using errcode='TS404'; end if;
  if run_row.status<>'in_progress' then raise exception 'Only an in-progress QA Record can be completed' using errcode='TS409'; end if;
  if run_row.lock_version<>p_expected_lock_version then raise exception 'This QA Record changed elsewhere. Reload before completing.' using errcode='TS409'; end if;

  for response_row in select * from public.project_qa_responses
    where organization_id=p_organization_id and project_id=p_project_id and run_id=p_run_id
    order by section_sort_order,field_sort_order loop
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

  update public.project_qa_runs set status='completed',completed_by=auth.uid(),completed_at=now(),lock_version=lock_version+1
  where id=run_row.id returning project_qa_runs.completed_at,project_qa_runs.lock_version into next_completed,next_lock;
  return query select 'completed'::text,next_completed,next_lock;
end; $$;

create or replace function public.list_project_qa_run_summaries_v1(p_organization_id uuid,p_project_id uuid)
returns table(project_qa_id uuid,in_progress_count bigint,completed_count bigint)
language sql stable security definer set search_path=public as $$
  select run.project_qa_id,
    count(*) filter(where run.status='in_progress') as in_progress_count,
    count(*) filter(where run.status='completed') as completed_count
  from public.project_qa_runs run
  where run.organization_id=p_organization_id and run.project_id=p_project_id
    and public.can_access_qa_project(p_organization_id,p_project_id,'qa.view')
  group by run.project_qa_id;
$$;

revoke all on function public.make_project_qa_ready_v1(uuid,uuid,uuid), public.save_project_qa_definition_v1(uuid,uuid,uuid,text,text,text,jsonb), public.start_project_qa_run_v1(uuid,uuid,uuid,uuid,text,text), public.save_project_qa_response_v1(uuid,uuid,uuid,uuid,integer,jsonb), public.complete_project_qa_run_v1(uuid,uuid,uuid,integer), public.list_project_qa_run_summaries_v1(uuid,uuid) from public,anon;
grant execute on function public.make_project_qa_ready_v1(uuid,uuid,uuid), public.save_project_qa_definition_v1(uuid,uuid,uuid,text,text,text,jsonb), public.start_project_qa_run_v1(uuid,uuid,uuid,uuid,text,text), public.save_project_qa_response_v1(uuid,uuid,uuid,uuid,integer,jsonb), public.complete_project_qa_run_v1(uuid,uuid,uuid,integer), public.list_project_qa_run_summaries_v1(uuid,uuid) to authenticated;

commit;
