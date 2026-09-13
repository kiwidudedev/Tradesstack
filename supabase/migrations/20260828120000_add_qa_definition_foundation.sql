begin;

insert into public.app_permissions (permission_key, description)
values
  ('qa.templates.view', 'View organization QA templates'),
  ('qa.templates.write', 'Create and manage organization QA templates'),
  ('qa.view', 'View Project QA definitions'),
  ('qa.write', 'Create and manage Project QA definitions'),
  ('qa.inspect', 'Complete QA inspections'),
  ('qa.verify', 'Verify QA inspections and issues'),
  ('qa.signoff', 'Sign off completed QA inspections')
on conflict (permission_key) do update set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner','qa.templates.view',true), ('admin','qa.templates.view',true), ('qs','qa.templates.view',true), ('project_manager','qa.templates.view',true), ('worker','qa.templates.view',false),
  ('owner','qa.templates.write',true), ('admin','qa.templates.write',true), ('qs','qa.templates.write',false), ('project_manager','qa.templates.write',true), ('worker','qa.templates.write',false),
  ('owner','qa.view',true), ('admin','qa.view',true), ('qs','qa.view',true), ('project_manager','qa.view',true), ('worker','qa.view',true),
  ('owner','qa.write',true), ('admin','qa.write',true), ('qs','qa.write',true), ('project_manager','qa.write',true), ('worker','qa.write',false),
  ('owner','qa.inspect',true), ('admin','qa.inspect',true), ('qs','qa.inspect',true), ('project_manager','qa.inspect',true), ('worker','qa.inspect',true),
  ('owner','qa.verify',true), ('admin','qa.verify',true), ('qs','qa.verify',false), ('project_manager','qa.verify',true), ('worker','qa.verify',false),
  ('owner','qa.signoff',true), ('admin','qa.signoff',true), ('qs','qa.signoff',false), ('project_manager','qa.signoff',true), ('worker','qa.signoff',false)
on conflict (role, permission_key) do update set is_allowed = excluded.is_allowed, updated_at = now();

create table public.qa_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'draft',
  definition_version integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint qa_templates_org_id_id_key unique (organization_id, id),
  constraint qa_templates_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint qa_templates_status_check check (status in ('draft','active','archived')),
  constraint qa_templates_version_check check (definition_version > 0),
  constraint qa_templates_archive_check check ((status = 'archived') = (archived_at is not null))
);

create table public.qa_template_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null,
  title text not null,
  description text not null default '',
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qa_template_sections_parent_fkey foreign key (organization_id, template_id)
    references public.qa_templates(organization_id, id) on delete cascade,
  constraint qa_template_sections_org_template_id_key unique (organization_id, template_id, id),
  constraint qa_template_sections_title_check check (char_length(btrim(title)) between 1 and 160),
  constraint qa_template_sections_sort_check check (sort_order >= 0),
  constraint qa_template_sections_sort_unique unique (template_id, sort_order)
);

create table public.qa_template_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null,
  section_id uuid not null,
  field_type text not null,
  label text not null,
  description text not null default '',
  instructions text not null default '',
  required boolean not null default false,
  allow_na boolean not null default false,
  requirement text not null default '',
  acceptance_criteria text not null default '',
  reference_text text not null default '',
  photo_required boolean not null default false,
  minimum_photos integer not null default 0,
  file_required boolean not null default false,
  require_comment_on_fail boolean not null default false,
  require_photo_on_fail boolean not null default false,
  create_issue_on_fail boolean not null default false,
  require_rectification_on_fail boolean not null default false,
  block_completion_on_fail boolean not null default false,
  require_supervisor_review_on_fail boolean not null default false,
  ai_review_enabled boolean not null default false,
  ai_review_instruction text not null default '',
  include_in_report boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  configuration_schema_version integer not null default 1,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qa_template_fields_parent_fkey foreign key (organization_id, template_id, section_id)
    references public.qa_template_sections(organization_id, template_id, id) on delete cascade,
  constraint qa_template_fields_org_template_id_key unique (organization_id, template_id, id),
  constraint qa_template_fields_type_check check (field_type in ('short_text','long_text','number','measurement','date','yes_no','single_select','multi_select','checkbox','inspection_check','photo','file','person','location','signature')),
  constraint qa_template_fields_label_check check (char_length(btrim(label)) between 1 and 240),
  constraint qa_template_fields_photos_check check (minimum_photos >= 0 and minimum_photos <= 50),
  constraint qa_template_fields_config_check check (jsonb_typeof(configuration) = 'object' and configuration_schema_version > 0),
  constraint qa_template_fields_sort_check check (sort_order >= 0),
  constraint qa_template_fields_sort_unique unique (section_id, sort_order)
);

create table public.qa_template_field_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null,
  field_id uuid not null,
  label text not null,
  value text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qa_template_field_options_parent_fkey foreign key (organization_id, template_id, field_id)
    references public.qa_template_fields(organization_id, template_id, id) on delete cascade,
  constraint qa_template_field_options_label_check check (char_length(btrim(label)) between 1 and 160),
  constraint qa_template_field_options_value_check check (char_length(btrim(value)) between 1 and 160),
  constraint qa_template_field_options_sort_check check (sort_order >= 0),
  constraint qa_template_field_options_sort_unique unique (field_id, sort_order),
  constraint qa_template_field_options_value_unique unique (field_id, value)
);

create table public.project_qas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null,
  description text not null default '',
  status text not null default 'draft',
  definition_version integer not null default 1,
  source_template_id uuid null,
  source_template_name text null,
  source_template_version integer null,
  copied_at timestamptz null,
  copied_by uuid null references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint project_qas_project_fkey foreign key (organization_id, project_id)
    references public.organization_projects(organization_id, id) on delete cascade,
  constraint project_qas_source_fkey foreign key (organization_id, source_template_id)
    references public.qa_templates(organization_id, id) on delete restrict,
  constraint project_qas_org_project_id_key unique (organization_id, project_id, id),
  constraint project_qas_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint project_qas_status_check check (status in ('draft','active','archived')),
  constraint project_qas_version_check check (definition_version > 0),
  constraint project_qas_archive_check check ((status = 'archived') = (archived_at is not null)),
  constraint project_qas_lineage_check check (
    (source_template_name is null and source_template_version is null and copied_at is null and copied_by is null)
    or (source_template_name is not null and source_template_version is not null and copied_at is not null and copied_by is not null)
  )
);

create table public.project_qa_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  project_qa_id uuid not null,
  title text not null,
  description text not null default '',
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_qa_sections_parent_fkey foreign key (organization_id, project_id, project_qa_id)
    references public.project_qas(organization_id, project_id, id) on delete cascade,
  constraint project_qa_sections_org_project_qa_id_key unique (organization_id, project_id, project_qa_id, id),
  constraint project_qa_sections_title_check check (char_length(btrim(title)) between 1 and 160),
  constraint project_qa_sections_sort_check check (sort_order >= 0),
  constraint project_qa_sections_sort_unique unique (project_qa_id, sort_order)
);

create table public.project_qa_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  project_qa_id uuid not null,
  section_id uuid not null,
  field_type text not null,
  label text not null,
  description text not null default '',
  instructions text not null default '',
  required boolean not null default false,
  allow_na boolean not null default false,
  requirement text not null default '',
  acceptance_criteria text not null default '',
  reference_text text not null default '',
  photo_required boolean not null default false,
  minimum_photos integer not null default 0,
  file_required boolean not null default false,
  require_comment_on_fail boolean not null default false,
  require_photo_on_fail boolean not null default false,
  create_issue_on_fail boolean not null default false,
  require_rectification_on_fail boolean not null default false,
  block_completion_on_fail boolean not null default false,
  require_supervisor_review_on_fail boolean not null default false,
  ai_review_enabled boolean not null default false,
  ai_review_instruction text not null default '',
  include_in_report boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  configuration_schema_version integer not null default 1,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_qa_fields_parent_fkey foreign key (organization_id, project_id, project_qa_id, section_id)
    references public.project_qa_sections(organization_id, project_id, project_qa_id, id) on delete cascade,
  constraint project_qa_fields_org_project_qa_id_key unique (organization_id, project_id, project_qa_id, id),
  constraint project_qa_fields_type_check check (field_type in ('short_text','long_text','number','measurement','date','yes_no','single_select','multi_select','checkbox','inspection_check','photo','file','person','location','signature')),
  constraint project_qa_fields_label_check check (char_length(btrim(label)) between 1 and 240),
  constraint project_qa_fields_photos_check check (minimum_photos >= 0 and minimum_photos <= 50),
  constraint project_qa_fields_config_check check (jsonb_typeof(configuration) = 'object' and configuration_schema_version > 0),
  constraint project_qa_fields_sort_check check (sort_order >= 0),
  constraint project_qa_fields_sort_unique unique (section_id, sort_order)
);

create table public.project_qa_field_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  project_qa_id uuid not null,
  field_id uuid not null,
  label text not null,
  value text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_qa_field_options_parent_fkey foreign key (organization_id, project_id, project_qa_id, field_id)
    references public.project_qa_fields(organization_id, project_id, project_qa_id, id) on delete cascade,
  constraint project_qa_field_options_label_check check (char_length(btrim(label)) between 1 and 160),
  constraint project_qa_field_options_value_check check (char_length(btrim(value)) between 1 and 160),
  constraint project_qa_field_options_sort_check check (sort_order >= 0),
  constraint project_qa_field_options_sort_unique unique (field_id, sort_order),
  constraint project_qa_field_options_value_unique unique (field_id, value)
);

create index qa_templates_org_status_updated_idx on public.qa_templates(organization_id, status, updated_at desc);
create index qa_template_sections_parent_idx on public.qa_template_sections(organization_id, template_id, sort_order);
create index qa_template_fields_parent_idx on public.qa_template_fields(organization_id, template_id, section_id, sort_order);
create index qa_template_options_parent_idx on public.qa_template_field_options(organization_id, template_id, field_id, sort_order);
create index project_qas_org_project_status_idx on public.project_qas(organization_id, project_id, status, updated_at desc);
create index project_qas_source_template_idx on public.project_qas(organization_id, source_template_id) where source_template_id is not null;
create index project_qa_sections_parent_idx on public.project_qa_sections(organization_id, project_id, project_qa_id, sort_order);
create index project_qa_fields_parent_idx on public.project_qa_fields(organization_id, project_id, project_qa_id, section_id, sort_order);
create index project_qa_options_parent_idx on public.project_qa_field_options(organization_id, project_id, project_qa_id, field_id, sort_order);

create trigger set_qa_templates_updated_at before update on public.qa_templates for each row execute function public.set_updated_at();
create trigger set_qa_template_sections_updated_at before update on public.qa_template_sections for each row execute function public.set_updated_at();
create trigger set_qa_template_fields_updated_at before update on public.qa_template_fields for each row execute function public.set_updated_at();
create trigger set_qa_template_options_updated_at before update on public.qa_template_field_options for each row execute function public.set_updated_at();
create trigger set_project_qas_updated_at before update on public.project_qas for each row execute function public.set_updated_at();
create trigger set_project_qa_sections_updated_at before update on public.project_qa_sections for each row execute function public.set_updated_at();
create trigger set_project_qa_fields_updated_at before update on public.project_qa_fields for each row execute function public.set_updated_at();
create trigger set_project_qa_options_updated_at before update on public.project_qa_field_options for each row execute function public.set_updated_at();

create or replace function public.can_access_qa_project(p_organization_id uuid, p_project_id uuid, p_permission_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_org_permission(p_organization_id, p_permission_key)
    and exists (select 1 from public.organization_projects p where p.organization_id = p_organization_id and p.id = p_project_id)
    and (
      public.is_owner_of_organization(p_organization_id)
      or exists (
        select 1 from public.project_members pm
        join public.organization_members om on om.id = pm.organization_member_id
        where pm.organization_id = p_organization_id and pm.project_id = p_project_id
          and pm.is_active = true and om.user_id = auth.uid()
      )
      or not exists (
        select 1 from public.project_members pm
        where pm.organization_id = p_organization_id and pm.project_id = p_project_id and pm.is_active = true
      )
    );
$$;
grant execute on function public.can_access_qa_project(uuid,uuid,text) to authenticated;

alter table public.qa_templates enable row level security; alter table public.qa_templates force row level security;
alter table public.qa_template_sections enable row level security; alter table public.qa_template_sections force row level security;
alter table public.qa_template_fields enable row level security; alter table public.qa_template_fields force row level security;
alter table public.qa_template_field_options enable row level security; alter table public.qa_template_field_options force row level security;
alter table public.project_qas enable row level security; alter table public.project_qas force row level security;
alter table public.project_qa_sections enable row level security; alter table public.project_qa_sections force row level security;
alter table public.project_qa_fields enable row level security; alter table public.project_qa_fields force row level security;
alter table public.project_qa_field_options enable row level security; alter table public.project_qa_field_options force row level security;

create policy qa_templates_select on public.qa_templates for select to authenticated using (public.has_org_permission(organization_id,'qa.templates.view'));
create policy qa_template_sections_select on public.qa_template_sections for select to authenticated using (public.has_org_permission(organization_id,'qa.templates.view'));
create policy qa_template_fields_select on public.qa_template_fields for select to authenticated using (public.has_org_permission(organization_id,'qa.templates.view'));
create policy qa_template_options_select on public.qa_template_field_options for select to authenticated using (public.has_org_permission(organization_id,'qa.templates.view'));
create policy project_qas_select on public.project_qas for select to authenticated using (public.can_access_qa_project(organization_id,project_id,'qa.view'));
create policy project_qa_sections_select on public.project_qa_sections for select to authenticated using (public.can_access_qa_project(organization_id,project_id,'qa.view'));
create policy project_qa_fields_select on public.project_qa_fields for select to authenticated using (public.can_access_qa_project(organization_id,project_id,'qa.view'));
create policy project_qa_options_select on public.project_qa_field_options for select to authenticated using (public.can_access_qa_project(organization_id,project_id,'qa.view'));

revoke all on public.qa_templates, public.qa_template_sections, public.qa_template_fields, public.qa_template_field_options from public, anon, authenticated;
revoke all on public.project_qas, public.project_qa_sections, public.project_qa_fields, public.project_qa_field_options from public, anon, authenticated;
grant select on public.qa_templates, public.qa_template_sections, public.qa_template_fields, public.qa_template_field_options to authenticated;
grant select on public.project_qas, public.project_qa_sections, public.project_qa_fields, public.project_qa_field_options to authenticated;

create or replace function public.qa_assert_definition(p_sections jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare s jsonb; f jsonb; o jsonb; seen_sections uuid[] := '{}'; seen_fields uuid[] := '{}';
begin
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then raise exception 'QA sections must be an array' using errcode='TS422'; end if;
  for s in select value from jsonb_array_elements(p_sections) loop
    if nullif(btrim(s->>'title'),'') is null or (s->>'id')::uuid = any(seen_sections) then raise exception 'Invalid or duplicate QA section' using errcode='TS422'; end if;
    seen_sections := array_append(seen_sections,(s->>'id')::uuid);
    if jsonb_typeof(coalesce(s->'fields','[]'::jsonb)) <> 'array' then raise exception 'QA fields must be an array' using errcode='TS422'; end if;
    for f in select value from jsonb_array_elements(coalesce(s->'fields','[]'::jsonb)) loop
      if nullif(btrim(f->>'label'),'') is null or (f->>'id')::uuid = any(seen_fields) then raise exception 'Invalid or duplicate QA field' using errcode='TS422'; end if;
      if f->>'fieldType' not in ('short_text','long_text','number','measurement','date','yes_no','single_select','multi_select','checkbox','inspection_check','photo','file','person','location','signature') then raise exception 'Invalid QA field type' using errcode='TS422'; end if;
      if coalesce((f->>'minimumPhotos')::integer,0) < 0 or coalesce((f->>'minimumPhotos')::integer,0) > 50 then raise exception 'Invalid minimum photo count' using errcode='TS422'; end if;
      seen_fields := array_append(seen_fields,(f->>'id')::uuid);
      if f->>'fieldType' in ('single_select','multi_select') then
        if jsonb_array_length(coalesce(f->'options','[]'::jsonb)) = 0 then raise exception 'Select fields require an option' using errcode='TS422'; end if;
        for o in select value from jsonb_array_elements(coalesce(f->'options','[]'::jsonb)) loop
          if nullif(btrim(o->>'label'),'') is null or nullif(btrim(o->>'value'),'') is null then raise exception 'Invalid QA option' using errcode='TS422'; end if;
        end loop;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.create_qa_template_v1(p_organization_id uuid, p_name text, p_description text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid;
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id,'qa.templates.write') then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 160 then raise exception 'Template name is required' using errcode='TS422'; end if;
  insert into public.qa_templates(organization_id,name,description,created_by,updated_by)
  values(p_organization_id,btrim(p_name),coalesce(p_description,''),auth.uid(),auth.uid()) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.save_qa_template_definition_v1(p_organization_id uuid, p_template_id uuid, p_name text, p_description text, p_status text, p_sections jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare s jsonb; f jsonb; o jsonb; next_version integer;
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id,'qa.templates.write') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status not in ('draft','active') then raise exception 'Invalid editable template status' using errcode='TS422'; end if;
  perform public.qa_assert_definition(p_sections);
  update public.qa_templates set name=btrim(p_name), description=coalesce(p_description,''), status=p_status, archived_at=null,
    updated_by=auth.uid(), definition_version=definition_version+1
  where organization_id=p_organization_id and id=p_template_id and status <> 'archived'
  returning definition_version into next_version;
  if next_version is null then raise exception 'QA template not found or archived' using errcode='TS404'; end if;
  delete from public.qa_template_sections where organization_id=p_organization_id and template_id=p_template_id;
  for s in select value from jsonb_array_elements(p_sections) loop
    insert into public.qa_template_sections(id,organization_id,template_id,title,description,sort_order)
    values((s->>'id')::uuid,p_organization_id,p_template_id,btrim(s->>'title'),coalesce(s->>'description',''),coalesce((s->>'sortOrder')::integer,0));
    for f in select value from jsonb_array_elements(coalesce(s->'fields','[]'::jsonb)) loop
      insert into public.qa_template_fields(id,organization_id,template_id,section_id,field_type,label,description,instructions,required,allow_na,requirement,acceptance_criteria,reference_text,photo_required,minimum_photos,file_required,require_comment_on_fail,require_photo_on_fail,create_issue_on_fail,require_rectification_on_fail,block_completion_on_fail,require_supervisor_review_on_fail,ai_review_enabled,ai_review_instruction,include_in_report,configuration,configuration_schema_version,sort_order)
      values((f->>'id')::uuid,p_organization_id,p_template_id,(s->>'id')::uuid,f->>'fieldType',btrim(f->>'label'),coalesce(f->>'description',''),coalesce(f->>'instructions',''),coalesce((f->>'required')::boolean,false),coalesce((f->>'allowNa')::boolean,false),coalesce(f->>'requirement',''),coalesce(f->>'acceptanceCriteria',''),coalesce(f->>'referenceText',''),coalesce((f->>'photoRequired')::boolean,false),coalesce((f->>'minimumPhotos')::integer,0),coalesce((f->>'fileRequired')::boolean,false),coalesce((f->>'requireCommentOnFail')::boolean,false),coalesce((f->>'requirePhotoOnFail')::boolean,false),coalesce((f->>'createIssueOnFail')::boolean,false),coalesce((f->>'requireRectificationOnFail')::boolean,false),coalesce((f->>'blockCompletionOnFail')::boolean,false),coalesce((f->>'requireSupervisorReviewOnFail')::boolean,false),coalesce((f->>'aiReviewEnabled')::boolean,false),coalesce(f->>'aiReviewInstruction',''),coalesce((f->>'includeInReport')::boolean,true),coalesce(f->'configuration','{}'::jsonb),coalesce((f->>'configurationSchemaVersion')::integer,1),coalesce((f->>'sortOrder')::integer,0));
      for o in select value from jsonb_array_elements(coalesce(f->'options','[]'::jsonb)) loop
        insert into public.qa_template_field_options(id,organization_id,template_id,field_id,label,value,sort_order)
        values((o->>'id')::uuid,p_organization_id,p_template_id,(f->>'id')::uuid,btrim(o->>'label'),btrim(o->>'value'),coalesce((o->>'sortOrder')::integer,0));
      end loop;
    end loop;
  end loop;
  return next_version;
end; $$;

create or replace function public.set_qa_template_lifecycle_v1(p_organization_id uuid,p_template_id uuid,p_action text)
returns text language plpgsql security definer set search_path=public as $$
declare next_status text;
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id,'qa.templates.write') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_action='archive' then
    update public.qa_templates set status='archived',archived_at=now(),updated_by=auth.uid() where organization_id=p_organization_id and id=p_template_id returning status into next_status;
  elsif p_action='delete' then
    delete from public.qa_templates t where t.organization_id=p_organization_id and t.id=p_template_id and t.status='draft'
      and not exists(select 1 from public.project_qas q where q.organization_id=p_organization_id and q.source_template_id=t.id)
      returning 'deleted' into next_status;
  else raise exception 'Invalid lifecycle action' using errcode='TS422'; end if;
  if next_status is null then raise exception 'Template cannot be changed' using errcode='TS409'; end if;
  return next_status;
end; $$;

create or replace function public.duplicate_qa_template_v1(p_organization_id uuid,p_template_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare source public.qa_templates%rowtype; result_id uuid; s record; f record; o record; new_section uuid; new_field uuid; section_map jsonb := '{}'::jsonb; field_map jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id,'qa.templates.write') then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into source from public.qa_templates where organization_id=p_organization_id and id=p_template_id;
  if not found then raise exception 'QA template not found' using errcode='TS404'; end if;
  insert into public.qa_templates(organization_id,name,description,status,created_by,updated_by)
  values(p_organization_id,left(source.name || ' copy',160),source.description,'draft',auth.uid(),auth.uid()) returning id into result_id;
  for s in select * from public.qa_template_sections where organization_id=p_organization_id and template_id=source.id order by sort_order loop
    new_section:=gen_random_uuid(); section_map:=section_map||jsonb_build_object(s.id::text,new_section::text);
    insert into public.qa_template_sections(id,organization_id,template_id,title,description,sort_order) values(new_section,p_organization_id,result_id,s.title,s.description,s.sort_order);
  end loop;
  for f in select * from public.qa_template_fields where organization_id=p_organization_id and template_id=source.id order by section_id,sort_order loop
    new_field:=gen_random_uuid(); field_map:=field_map||jsonb_build_object(f.id::text,new_field::text);
    insert into public.qa_template_fields(id,organization_id,template_id,section_id,field_type,label,description,instructions,required,allow_na,requirement,acceptance_criteria,reference_text,photo_required,minimum_photos,file_required,require_comment_on_fail,require_photo_on_fail,create_issue_on_fail,require_rectification_on_fail,block_completion_on_fail,require_supervisor_review_on_fail,ai_review_enabled,ai_review_instruction,include_in_report,configuration,configuration_schema_version,sort_order)
    values(new_field,p_organization_id,result_id,(section_map->>f.section_id::text)::uuid,f.field_type,f.label,f.description,f.instructions,f.required,f.allow_na,f.requirement,f.acceptance_criteria,f.reference_text,f.photo_required,f.minimum_photos,f.file_required,f.require_comment_on_fail,f.require_photo_on_fail,f.create_issue_on_fail,f.require_rectification_on_fail,f.block_completion_on_fail,f.require_supervisor_review_on_fail,f.ai_review_enabled,f.ai_review_instruction,f.include_in_report,f.configuration,f.configuration_schema_version,f.sort_order);
  end loop;
  for o in select * from public.qa_template_field_options where organization_id=p_organization_id and template_id=source.id order by field_id,sort_order loop
    insert into public.qa_template_field_options(organization_id,template_id,field_id,label,value,sort_order) values(p_organization_id,result_id,(field_map->>o.field_id::text)::uuid,o.label,o.value,o.sort_order);
  end loop;
  return result_id;
end; $$;

create or replace function public.create_blank_project_qa_v1(p_organization_id uuid,p_project_id uuid,p_name text,p_description text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare result_id uuid;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.write') then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 160 then raise exception 'QA name is required' using errcode='TS422'; end if;
  insert into public.project_qas(organization_id,project_id,name,description,created_by,updated_by)
  values(p_organization_id,p_project_id,btrim(p_name),coalesce(p_description,''),auth.uid(),auth.uid()) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.create_project_qa_from_template_v1(p_organization_id uuid,p_project_id uuid,p_template_id uuid,p_name text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare source public.qa_templates%rowtype; result_id uuid; s record; f record; o record; new_section uuid; new_field uuid; section_map jsonb := '{}'::jsonb; field_map jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.write') or not public.has_org_permission(p_organization_id,'qa.templates.view') then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into source from public.qa_templates where organization_id=p_organization_id and id=p_template_id and status='active';
  if not found then raise exception 'Active QA template not found' using errcode='TS404'; end if;
  insert into public.project_qas(organization_id,project_id,name,description,source_template_id,source_template_name,source_template_version,copied_at,copied_by,created_by,updated_by)
  values(p_organization_id,p_project_id,coalesce(nullif(btrim(p_name),''),source.name),source.description,source.id,source.name,source.definition_version,now(),auth.uid(),auth.uid(),auth.uid()) returning id into result_id;
  for s in select * from public.qa_template_sections where organization_id=p_organization_id and template_id=source.id order by sort_order loop
    new_section := gen_random_uuid(); section_map := section_map || jsonb_build_object(s.id::text,new_section::text);
    insert into public.project_qa_sections(id,organization_id,project_id,project_qa_id,title,description,sort_order) values(new_section,p_organization_id,p_project_id,result_id,s.title,s.description,s.sort_order);
  end loop;
  for f in select * from public.qa_template_fields where organization_id=p_organization_id and template_id=source.id order by section_id,sort_order loop
    new_field := gen_random_uuid(); field_map := field_map || jsonb_build_object(f.id::text,new_field::text);
    insert into public.project_qa_fields(id,organization_id,project_id,project_qa_id,section_id,field_type,label,description,instructions,required,allow_na,requirement,acceptance_criteria,reference_text,photo_required,minimum_photos,file_required,require_comment_on_fail,require_photo_on_fail,create_issue_on_fail,require_rectification_on_fail,block_completion_on_fail,require_supervisor_review_on_fail,ai_review_enabled,ai_review_instruction,include_in_report,configuration,configuration_schema_version,sort_order)
    values(new_field,p_organization_id,p_project_id,result_id,(section_map->>f.section_id::text)::uuid,f.field_type,f.label,f.description,f.instructions,f.required,f.allow_na,f.requirement,f.acceptance_criteria,f.reference_text,f.photo_required,f.minimum_photos,f.file_required,f.require_comment_on_fail,f.require_photo_on_fail,f.create_issue_on_fail,f.require_rectification_on_fail,f.block_completion_on_fail,f.require_supervisor_review_on_fail,f.ai_review_enabled,f.ai_review_instruction,f.include_in_report,f.configuration,f.configuration_schema_version,f.sort_order);
  end loop;
  for o in select * from public.qa_template_field_options where organization_id=p_organization_id and template_id=source.id order by field_id,sort_order loop
    insert into public.project_qa_field_options(organization_id,project_id,project_qa_id,field_id,label,value,sort_order)
    values(p_organization_id,p_project_id,result_id,(field_map->>o.field_id::text)::uuid,o.label,o.value,o.sort_order);
  end loop;
  return result_id;
end; $$;

create or replace function public.save_project_qa_definition_v1(p_organization_id uuid,p_project_id uuid,p_project_qa_id uuid,p_name text,p_description text,p_status text,p_sections jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare s jsonb; f jsonb; o jsonb; next_version integer;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.write') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status not in ('draft','active') then raise exception 'Invalid editable Project QA status' using errcode='TS422'; end if;
  perform public.qa_assert_definition(p_sections);
  update public.project_qas set name=btrim(p_name),description=coalesce(p_description,''),status=p_status,archived_at=null,updated_by=auth.uid(),definition_version=definition_version+1
  where organization_id=p_organization_id and project_id=p_project_id and id=p_project_qa_id and status<>'archived' returning definition_version into next_version;
  if next_version is null then raise exception 'Project QA not found or archived' using errcode='TS404'; end if;
  delete from public.project_qa_sections where organization_id=p_organization_id and project_id=p_project_id and project_qa_id=p_project_qa_id;
  for s in select value from jsonb_array_elements(p_sections) loop
    insert into public.project_qa_sections(id,organization_id,project_id,project_qa_id,title,description,sort_order) values((s->>'id')::uuid,p_organization_id,p_project_id,p_project_qa_id,btrim(s->>'title'),coalesce(s->>'description',''),coalesce((s->>'sortOrder')::integer,0));
    for f in select value from jsonb_array_elements(coalesce(s->'fields','[]'::jsonb)) loop
      insert into public.project_qa_fields(id,organization_id,project_id,project_qa_id,section_id,field_type,label,description,instructions,required,allow_na,requirement,acceptance_criteria,reference_text,photo_required,minimum_photos,file_required,require_comment_on_fail,require_photo_on_fail,create_issue_on_fail,require_rectification_on_fail,block_completion_on_fail,require_supervisor_review_on_fail,ai_review_enabled,ai_review_instruction,include_in_report,configuration,configuration_schema_version,sort_order)
      values((f->>'id')::uuid,p_organization_id,p_project_id,p_project_qa_id,(s->>'id')::uuid,f->>'fieldType',btrim(f->>'label'),coalesce(f->>'description',''),coalesce(f->>'instructions',''),coalesce((f->>'required')::boolean,false),coalesce((f->>'allowNa')::boolean,false),coalesce(f->>'requirement',''),coalesce(f->>'acceptanceCriteria',''),coalesce(f->>'referenceText',''),coalesce((f->>'photoRequired')::boolean,false),coalesce((f->>'minimumPhotos')::integer,0),coalesce((f->>'fileRequired')::boolean,false),coalesce((f->>'requireCommentOnFail')::boolean,false),coalesce((f->>'requirePhotoOnFail')::boolean,false),coalesce((f->>'createIssueOnFail')::boolean,false),coalesce((f->>'requireRectificationOnFail')::boolean,false),coalesce((f->>'blockCompletionOnFail')::boolean,false),coalesce((f->>'requireSupervisorReviewOnFail')::boolean,false),coalesce((f->>'aiReviewEnabled')::boolean,false),coalesce(f->>'aiReviewInstruction',''),coalesce((f->>'includeInReport')::boolean,true),coalesce(f->'configuration','{}'::jsonb),coalesce((f->>'configurationSchemaVersion')::integer,1),coalesce((f->>'sortOrder')::integer,0));
      for o in select value from jsonb_array_elements(coalesce(f->'options','[]'::jsonb)) loop
        insert into public.project_qa_field_options(id,organization_id,project_id,project_qa_id,field_id,label,value,sort_order) values((o->>'id')::uuid,p_organization_id,p_project_id,p_project_qa_id,(f->>'id')::uuid,btrim(o->>'label'),btrim(o->>'value'),coalesce((o->>'sortOrder')::integer,0));
      end loop;
    end loop;
  end loop;
  return next_version;
end; $$;

create or replace function public.set_project_qa_lifecycle_v1(p_organization_id uuid,p_project_id uuid,p_project_qa_id uuid,p_action text)
returns text language plpgsql security definer set search_path=public as $$
declare next_status text;
begin
  if auth.uid() is null or not public.can_access_qa_project(p_organization_id,p_project_id,'qa.write') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_action='archive' then
    update public.project_qas set status='archived',archived_at=now(),updated_by=auth.uid()
      where organization_id=p_organization_id and project_id=p_project_id and id=p_project_qa_id and status<>'archived'
      returning status into next_status;
  elsif p_action='delete' then
    delete from public.project_qas where organization_id=p_organization_id and project_id=p_project_id and id=p_project_qa_id and status='draft'
      returning 'deleted' into next_status;
  else raise exception 'Invalid lifecycle action' using errcode='TS422'; end if;
  if next_status is null then raise exception 'Project QA cannot be changed' using errcode='TS409'; end if;
  return next_status;
end; $$;

revoke all on function public.create_qa_template_v1(uuid,text,text), public.save_qa_template_definition_v1(uuid,uuid,text,text,text,jsonb), public.set_qa_template_lifecycle_v1(uuid,uuid,text), public.duplicate_qa_template_v1(uuid,uuid), public.create_blank_project_qa_v1(uuid,uuid,text,text), public.create_project_qa_from_template_v1(uuid,uuid,uuid,text), public.save_project_qa_definition_v1(uuid,uuid,uuid,text,text,text,jsonb), public.set_project_qa_lifecycle_v1(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.create_qa_template_v1(uuid,text,text), public.save_qa_template_definition_v1(uuid,uuid,text,text,text,jsonb), public.set_qa_template_lifecycle_v1(uuid,uuid,text), public.duplicate_qa_template_v1(uuid,uuid), public.create_blank_project_qa_v1(uuid,uuid,text,text), public.create_project_qa_from_template_v1(uuid,uuid,uuid,text), public.save_project_qa_definition_v1(uuid,uuid,uuid,text,text,text,jsonb), public.set_project_qa_lifecycle_v1(uuid,uuid,uuid,text) to authenticated;

commit;
