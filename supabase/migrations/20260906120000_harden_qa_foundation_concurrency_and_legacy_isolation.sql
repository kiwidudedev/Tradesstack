begin;

-- Keep one canonical project-membership rule for both QA engines. QA-specific
-- permissions remain an additional requirement in can_access_qa_project.
create or replace function public.can_access_project_member_v1(
  p_organization_id uuid,
  p_project_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_projects project
    where project.organization_id = p_organization_id
      and project.id = p_project_id
  ) and (
    public.is_owner_of_organization(p_organization_id)
    or exists (
      select 1
      from public.project_members project_member
      join public.organization_members organization_member
        on organization_member.id = project_member.organization_member_id
      where project_member.organization_id = p_organization_id
        and project_member.project_id = p_project_id
        and project_member.is_active = true
        and organization_member.user_id = auth.uid()
    )
    or (
      public.is_member_of_organization(p_organization_id)
      and not exists (
        select 1
        from public.project_members project_member
        where project_member.organization_id = p_organization_id
          and project_member.project_id = p_project_id
          and project_member.is_active = true
      )
    )
  );
$$;

revoke all on function public.can_access_project_member_v1(uuid, uuid) from public, anon;
grant execute on function public.can_access_project_member_v1(uuid, uuid) to authenticated;

create or replace function public.can_access_qa_project(
  p_organization_id uuid,
  p_project_id uuid,
  p_permission_key text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_permission(p_organization_id, p_permission_key)
    and public.can_access_project_member_v1(p_organization_id, p_project_id);
$$;

-- Definition saves are transactionally protected by a parent-row lock. The
-- old implementations remain private implementation details, so no caller can
-- bypass the expected-version boundary.
alter function public.save_qa_template_definition_v1(uuid, uuid, text, text, text, jsonb)
  rename to save_qa_template_definition_internal_v1;
revoke all on function public.save_qa_template_definition_internal_v1(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;

create function public.save_qa_template_definition_v1(
  p_organization_id uuid,
  p_template_id uuid,
  p_name text,
  p_description text,
  p_status text,
  p_sections jsonb,
  p_expected_version integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  template_row public.qa_templates%rowtype;
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'qa.templates.write')
  then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into template_row
  from public.qa_templates template
  where template.organization_id = p_organization_id
    and template.id = p_template_id
  for update;

  if not found then
    raise exception 'QA template not found' using errcode = 'TS404';
  end if;
  if template_row.status = 'archived' then
    raise exception 'Archived QA template is read-only' using errcode = 'TS409';
  end if;
  if template_row.definition_version is distinct from p_expected_version then
    raise exception E'This QA definition has been updated by someone else.\n\nReload the latest version before saving your changes.' using errcode = 'TS409';
  end if;

  return public.save_qa_template_definition_internal_v1(
    p_organization_id, p_template_id, p_name, p_description, p_status, p_sections
  );
end;
$$;

drop function public.save_project_qa_definition_v1(uuid, uuid, uuid, text, text, text, jsonb);

create function public.save_project_qa_definition_v1(
  p_organization_id uuid,
  p_project_id uuid,
  p_project_qa_id uuid,
  p_name text,
  p_description text,
  p_status text,
  p_sections jsonb,
  p_expected_version integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  qa_row public.project_qas%rowtype;
begin
  if auth.uid() is null
    or not public.can_access_qa_project(p_organization_id, p_project_id, 'qa.write')
  then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into qa_row
  from public.project_qas project_qa
  where project_qa.organization_id = p_organization_id
    and project_qa.project_id = p_project_id
    and project_qa.id = p_project_qa_id
  for update;

  if not found then
    raise exception 'Project QA not found' using errcode = 'TS404';
  end if;
  if qa_row.status = 'archived' then
    raise exception 'Archived Project QA is read-only' using errcode = 'TS409';
  end if;
  if qa_row.status <> p_status then
    raise exception 'Use the explicit Project QA lifecycle action to change status' using errcode = 'TS409';
  end if;
  if qa_row.definition_version is distinct from p_expected_version then
    raise exception E'This QA definition has been updated by someone else.\n\nReload the latest version before saving your changes.' using errcode = 'TS409';
  end if;

  return public.save_project_qa_definition_internal_v1(
    p_organization_id, p_project_id, p_project_qa_id, p_name,
    p_description, p_status, p_sections
  );
end;
$$;

revoke all on function public.save_qa_template_definition_v1(uuid, uuid, text, text, text, jsonb, integer),
  public.save_project_qa_definition_v1(uuid, uuid, uuid, text, text, text, jsonb, integer)
  from public, anon;
grant execute on function public.save_qa_template_definition_v1(uuid, uuid, text, text, text, jsonb, integer),
  public.save_project_qa_definition_v1(uuid, uuid, uuid, text, text, text, jsonb, integer)
  to authenticated;

-- Cancellation now uses the same authoritative run lock as response saves and
-- completion. The conditional update is the atomic compare-and-swap.
drop function public.cancel_project_qa_run_v1(uuid, uuid, uuid);

create function public.cancel_project_qa_run_v1(
  p_organization_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_expected_lock_version integer
) returns table(status text, cancelled_at timestamptz, lock_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_time timestamptz := now();
  next_lock integer;
begin
  if auth.uid() is null
    or not public.can_access_qa_project(p_organization_id, p_project_id, 'qa.inspect')
  then
    raise exception 'Not authorized to cancel QA' using errcode = '42501';
  end if;

  update public.project_qa_runs as target
  set status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = next_time,
      lock_version = target.lock_version + 1
  where target.organization_id = p_organization_id
    and target.project_id = p_project_id
    and target.id = p_run_id
    and target.status = 'in_progress'
    and target.lock_version = p_expected_lock_version
  returning target.lock_version into next_lock;

  if next_lock is null then
    if exists (
      select 1 from public.project_qa_runs run
      where run.organization_id = p_organization_id
        and run.project_id = p_project_id
        and run.id = p_run_id
        and run.status = 'in_progress'
    ) then
      raise exception 'This QA Record has changed since you opened it. Reload the latest record before cancelling.' using errcode = 'TS409';
    end if;
    raise exception 'Only an in-progress QA Record can be cancelled' using errcode = 'TS409';
  end if;

  return query select 'cancelled'::text, next_time, next_lock;
end;
$$;

revoke all on function public.cancel_project_qa_run_v1(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.cancel_project_qa_run_v1(uuid, uuid, uuid, integer) to authenticated;

-- Replace same-organization legacy policies with project-scoped policies.
do $$
declare
  target_table text;
  policy_row record;
begin
  foreach target_table in array array[
    'project_quality_issues', 'project_quality_issue_photos',
    'project_quality_issue_comments', 'project_quality_issue_activity',
    'project_quality_inspections', 'project_quality_inspection_items',
    'project_quality_inspection_activity', 'project_quality_photos',
    'project_quality_work_proofs', 'project_quality_work_proof_checklist_items',
    'project_quality_sign_offs', 'project_quality_sign_off_work_proofs',
    'project_quality_signoff_activity'
  ] loop
    for policy_row in
      select policyname from pg_policies where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy %I on public.%I', policy_row.policyname, target_table);
    end loop;

    execute format(
      'create policy legacy_qa_project_select on public.%I for select to authenticated using (public.can_access_qa_project(organization_id, project_id, ''qa.view''))',
      target_table
    );
    execute format(
      'create policy legacy_qa_project_insert on public.%I for insert to authenticated with check (public.can_access_qa_project(organization_id, project_id, ''qa.inspect''))',
      target_table
    );
    execute format(
      'create policy legacy_qa_project_delete on public.%I for delete to authenticated using (public.is_admin_of_organization(organization_id) and public.can_access_qa_project(organization_id, project_id, ''qa.view''))',
      target_table
    );
  end loop;

  foreach target_table in array array[
    'project_quality_issues', 'project_quality_issue_photos',
    'project_quality_issue_comments', 'project_quality_inspections',
    'project_quality_inspection_items', 'project_quality_photos',
    'project_quality_work_proofs', 'project_quality_sign_offs'
  ] loop
    execute format('drop policy legacy_qa_project_insert on public.%I', target_table);
    execute format(
      'create policy legacy_qa_project_insert on public.%I for insert to authenticated with check (created_by = auth.uid() and public.can_access_qa_project(organization_id, project_id, ''qa.inspect''))',
      target_table
    );
  end loop;

  foreach target_table in array array[
    'project_quality_issues', 'project_quality_inspections',
    'project_quality_inspection_items', 'project_quality_photos',
    'project_quality_work_proofs', 'project_quality_work_proof_checklist_items',
    'project_quality_sign_offs', 'project_quality_sign_off_work_proofs'
  ] loop
    execute format(
      'create policy legacy_qa_project_update on public.%I for update to authenticated using (public.can_access_qa_project(organization_id, project_id, ''qa.inspect'')) with check (public.can_access_qa_project(organization_id, project_id, ''qa.inspect''))',
      target_table
    );
  end loop;
end;
$$;

-- Preserve the wider Tasks permission model while enforcing the same project
-- membership boundary for project_job_todos.
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'project_job_todos'
  loop
    execute format('drop policy %I on public.project_job_todos', policy_row.policyname);
  end loop;
end;
$$;

create policy project_todos_project_select on public.project_job_todos
for select to authenticated
using (public.can_access_project_member_v1(organization_id, project_id));

create policy project_todos_project_insert on public.project_job_todos
for insert to authenticated
with check (
  project_job_todos.created_by = auth.uid()
  and public.can_access_project_member_v1(project_job_todos.organization_id, project_job_todos.project_id)
  and (
    project_job_todos.opportunity_id is null
    or exists (
      select 1 from public.organization_opportunities opportunity
      where opportunity.id = project_job_todos.opportunity_id
        and opportunity.organization_id = project_job_todos.organization_id
        and opportunity.workspace_project_id = project_job_todos.project_id
    )
  )
);

create policy project_todos_project_update on public.project_job_todos
for update to authenticated
using (public.can_access_project_member_v1(project_job_todos.organization_id, project_job_todos.project_id))
with check (
  public.can_access_project_member_v1(project_job_todos.organization_id, project_job_todos.project_id)
  and (
    project_job_todos.opportunity_id is null
    or exists (
      select 1 from public.organization_opportunities opportunity
      where opportunity.id = project_job_todos.opportunity_id
        and opportunity.organization_id = project_job_todos.organization_id
        and opportunity.workspace_project_id = project_job_todos.project_id
    )
  )
);

create policy project_todos_project_delete on public.project_job_todos
for delete to authenticated
using (
  public.is_admin_of_organization(organization_id)
  and public.can_access_project_member_v1(organization_id, project_id)
);

-- Enforce tenant/project identity on every new or changed legacy relationship.
-- NOT VALID preserves old rows for a non-destructive forward rollout while
-- still enforcing the constraints for all subsequent writes.
create unique index if not exists organization_projects_id_org_legacy_qa_uidx
  on public.organization_projects(id, organization_id);
create unique index if not exists project_quality_issues_id_scope_uidx
  on public.project_quality_issues(id, organization_id, project_id);
create unique index if not exists project_quality_inspections_id_scope_uidx
  on public.project_quality_inspections(id, organization_id, project_id);
create unique index if not exists project_quality_inspection_items_id_scope_uidx
  on public.project_quality_inspection_items(id, organization_id, project_id);
create unique index if not exists project_quality_work_proofs_id_scope_uidx
  on public.project_quality_work_proofs(id, organization_id, project_id);
create unique index if not exists project_quality_sign_offs_id_scope_uidx
  on public.project_quality_sign_offs(id, organization_id, project_id);

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'project_quality_issues', 'project_quality_issue_photos',
    'project_quality_issue_comments', 'project_quality_issue_activity',
    'project_quality_inspections', 'project_quality_inspection_items',
    'project_quality_inspection_activity', 'project_quality_photos',
    'project_quality_work_proofs', 'project_quality_work_proof_checklist_items',
    'project_quality_sign_offs', 'project_quality_sign_off_work_proofs',
    'project_quality_signoff_activity', 'project_job_todos'
  ] loop
    execute format(
      'alter table public.%I add constraint %I foreign key (project_id, organization_id) references public.organization_projects(id, organization_id) not valid',
      target_table, target_table || '_project_org_scope_fkey'
    );
  end loop;
end;
$$;

alter table public.project_quality_issue_photos
  add constraint project_quality_issue_photos_issue_scope_fkey
  foreign key (issue_id, organization_id, project_id)
  references public.project_quality_issues(id, organization_id, project_id) not valid;
alter table public.project_quality_issue_comments
  add constraint project_quality_issue_comments_issue_scope_fkey
  foreign key (issue_id, organization_id, project_id)
  references public.project_quality_issues(id, organization_id, project_id) not valid;
alter table public.project_quality_issue_activity
  add constraint project_quality_issue_activity_issue_scope_fkey
  foreign key (issue_id, organization_id, project_id)
  references public.project_quality_issues(id, organization_id, project_id) not valid;
alter table public.project_quality_inspection_items
  add constraint project_quality_inspection_items_inspection_scope_fkey
  foreign key (inspection_id, organization_id, project_id)
  references public.project_quality_inspections(id, organization_id, project_id) not valid;
alter table public.project_quality_inspection_activity
  add constraint project_quality_inspection_activity_inspection_scope_fkey
  foreign key (inspection_id, organization_id, project_id)
  references public.project_quality_inspections(id, organization_id, project_id) not valid;
alter table public.project_quality_inspection_activity
  add constraint project_quality_inspection_activity_item_scope_fkey
  foreign key (inspection_item_id, organization_id, project_id)
  references public.project_quality_inspection_items(id, organization_id, project_id) not valid;
alter table public.project_quality_work_proof_checklist_items
  add constraint project_quality_work_proof_items_parent_scope_fkey
  foreign key (work_proof_id, organization_id, project_id)
  references public.project_quality_work_proofs(id, organization_id, project_id) not valid;
alter table public.project_quality_sign_off_work_proofs
  add constraint project_quality_signoff_links_signoff_scope_fkey
  foreign key (sign_off_id, organization_id, project_id)
  references public.project_quality_sign_offs(id, organization_id, project_id) not valid;
alter table public.project_quality_sign_off_work_proofs
  add constraint project_quality_signoff_links_proof_scope_fkey
  foreign key (work_proof_id, organization_id, project_id)
  references public.project_quality_work_proofs(id, organization_id, project_id) not valid;
alter table public.project_quality_signoff_activity
  add constraint project_quality_signoff_activity_parent_scope_fkey
  foreign key (signoff_id, organization_id, project_id)
  references public.project_quality_sign_offs(id, organization_id, project_id) not valid;

alter table public.project_quality_photos
  add constraint project_quality_photos_issue_scope_fkey
  foreign key (linked_issue_id, organization_id, project_id)
  references public.project_quality_issues(id, organization_id, project_id) not valid;
alter table public.project_quality_photos
  add constraint project_quality_photos_inspection_scope_fkey
  foreign key (linked_inspection_id, organization_id, project_id)
  references public.project_quality_inspections(id, organization_id, project_id) not valid;
alter table public.project_quality_photos
  add constraint project_quality_photos_item_scope_fkey
  foreign key (linked_inspection_item_id, organization_id, project_id)
  references public.project_quality_inspection_items(id, organization_id, project_id) not valid;
alter table public.project_quality_photos
  add constraint project_quality_photos_proof_scope_fkey
  foreign key (linked_work_proof_id, organization_id, project_id)
  references public.project_quality_work_proofs(id, organization_id, project_id) not valid;
alter table public.project_quality_issues
  add constraint project_quality_issues_proof_scope_fkey
  foreign key (linked_work_proof_id, organization_id, project_id)
  references public.project_quality_work_proofs(id, organization_id, project_id) not valid;
alter table public.project_quality_sign_offs
  add constraint project_quality_signoffs_inspection_scope_fkey
  foreign key (linked_inspection_id, organization_id, project_id)
  references public.project_quality_inspections(id, organization_id, project_id) not valid;
alter table public.project_quality_sign_offs
  add constraint project_quality_signoffs_issue_scope_fkey
  foreign key (linked_issue_id, organization_id, project_id)
  references public.project_quality_issues(id, organization_id, project_id) not valid;
alter table public.project_quality_sign_offs
  add constraint project_quality_signoffs_proof_scope_fkey
  foreign key (linked_work_proof_id, organization_id, project_id)
  references public.project_quality_work_proofs(id, organization_id, project_id) not valid;
alter table public.project_job_todos
  add constraint project_job_todos_issue_scope_fkey
  foreign key (linked_issue_id, organization_id, project_id)
  references public.project_quality_issues(id, organization_id, project_id) not valid;
alter table public.project_job_todos
  add constraint project_job_todos_item_scope_fkey
  foreign key (linked_inspection_item_id, organization_id, project_id)
  references public.project_quality_inspection_items(id, organization_id, project_id) not valid;

-- Storage authorization follows the same canonical project membership helper.
create or replace function public.can_access_project_quality_photo_storage_object(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select char_length(coalesce(object_path, '')) > 0
    and array_length(string_to_array(object_path, '/'), 1) >= 5
    and split_part(object_path, '/', 1) ~* '^[0-9a-f-]{36}$'
    and split_part(object_path, '/', 2) ~* '^[0-9a-f-]{36}$'
    and public.can_access_project_member_v1(
      split_part(object_path, '/', 1)::uuid,
      split_part(object_path, '/', 2)::uuid
    );
$$;

create or replace function public.can_access_task_attachment_storage_object(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select char_length(coalesce(object_path, '')) > 0
    and array_length(string_to_array(object_path, '/'), 1) >= 5
    and split_part(object_path, '/', 3) = 'tasks'
    and split_part(object_path, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.project_job_todos task
      where task.organization_id::text = split_part(object_path, '/', 1)
        and task.id::text = split_part(object_path, '/', 4)
        and (split_part(object_path, '/', 2) = 'unscoped' or task.project_id::text = split_part(object_path, '/', 2))
        and public.can_access_project_member_v1(task.organization_id, task.project_id)
    );
$$;

commit;
