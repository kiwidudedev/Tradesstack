create table if not exists public.project_job_todo_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  todo_id uuid not null references public.project_job_todos (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  file_url text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_job_todo_attachments_file_name_not_blank check (char_length(trim(file_name)) > 0),
  constraint project_job_todo_attachments_file_url_not_blank check (char_length(trim(file_url)) > 0),
  constraint project_job_todo_attachments_mime_type_check check (mime_type = 'application/pdf')
);

create index if not exists project_job_todo_attachments_todo_idx
  on public.project_job_todo_attachments (todo_id, created_at desc);

create index if not exists project_job_todo_attachments_project_idx
  on public.project_job_todo_attachments (organization_id, project_id, created_at desc);

drop trigger if exists set_project_job_todo_attachments_updated_at on public.project_job_todo_attachments;
create trigger set_project_job_todo_attachments_updated_at
before update on public.project_job_todo_attachments
for each row execute function public.set_updated_at();

alter table public.project_job_todo_attachments enable row level security;
alter table public.project_job_todo_attachments force row level security;

drop policy if exists "Members can view job todo attachments" on public.project_job_todo_attachments;
create policy "Members can view job todo attachments"
on public.project_job_todo_attachments
for select
using (public.is_member_of_organization(project_job_todo_attachments.organization_id));

drop policy if exists "Members can create job todo attachments" on public.project_job_todo_attachments;
create policy "Members can create job todo attachments"
on public.project_job_todo_attachments
for insert
with check (
  public.is_member_of_organization(project_job_todo_attachments.organization_id)
  and exists (
    select 1
    from public.project_job_todos t
    where t.id = project_job_todo_attachments.todo_id
      and t.project_id = project_job_todo_attachments.project_id
      and t.organization_id = project_job_todo_attachments.organization_id
  )
);

drop policy if exists "Members can update job todo attachments" on public.project_job_todo_attachments;
create policy "Members can update job todo attachments"
on public.project_job_todo_attachments
for update
using (public.is_member_of_organization(project_job_todo_attachments.organization_id))
with check (
  public.is_member_of_organization(project_job_todo_attachments.organization_id)
  and exists (
    select 1
    from public.project_job_todos t
    where t.id = project_job_todo_attachments.todo_id
      and t.project_id = project_job_todo_attachments.project_id
      and t.organization_id = project_job_todo_attachments.organization_id
  )
);

drop policy if exists "Admins can delete job todo attachments" on public.project_job_todo_attachments;
create policy "Admins can delete job todo attachments"
on public.project_job_todo_attachments
for delete
using (public.is_admin_of_organization(project_job_todo_attachments.organization_id));

grant select, insert, update, delete on public.project_job_todo_attachments to authenticated;
