begin;

-- ============================================================
-- Phase 1: Task backend foundation
-- Strictly additive. No renames/removals. No trigger rewrites.
-- ============================================================

-- ------------------------------------------------------------
-- Extend existing shared task table
-- ------------------------------------------------------------

alter table public.project_job_todos
  add column if not exists task_type text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_by uuid null references auth.users (id) on delete set null,
  add column if not exists completed_by uuid null references auth.users (id) on delete set null,
  add column if not exists archived_by uuid null references auth.users (id) on delete set null,
  add column if not exists archived_at timestamptz null,
  add column if not exists archive_reason text null,
  add column if not exists deleted_by uuid null references auth.users (id) on delete set null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists delete_reason text null,
  add column if not exists linked_variation_id uuid null references public.project_variations (id) on delete set null,
  add column if not exists linked_purchase_order_id uuid null references public.project_purchase_orders (id) on delete set null,
  add column if not exists linked_quote_id uuid null references public.project_quotes (id) on delete set null,
  add column if not exists linked_client_id uuid null references public.organization_clients (id) on delete set null;

alter table public.project_job_todos
  drop constraint if exists project_job_todos_metadata_object_check,
  drop constraint if exists project_job_todos_task_type_check;

alter table public.project_job_todos
  add constraint project_job_todos_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  add constraint project_job_todos_task_type_check
    check (
      task_type is null
      or task_type in (
        'delivery',
        'site_check',
        'qa_check',
        'supplier_follow_up',
        'client_follow_up',
        'variation_follow_up',
        'purchase_order_follow_up',
        'material_check',
        'labour_booking',
        'health_safety',
        'admin',
        'claim',
        'defect',
        'meeting',
        'reminder',
        'installation',
        'inspection',
        'procurement',
        'coordination',
        'other'
      )
    );

create index if not exists project_job_todos_active_visibility_idx
  on public.project_job_todos (
    organization_id,
    project_id,
    status,
    assigned_user_id,
    due_at,
    updated_at desc
  )
  where deleted_at is null and archived_at is null;

create index if not exists project_job_todos_org_task_type_idx
  on public.project_job_todos (organization_id, task_type, updated_at desc)
  where task_type is not null and deleted_at is null;

create index if not exists project_job_todos_org_deleted_idx
  on public.project_job_todos (organization_id, deleted_at, updated_at desc)
  where deleted_at is not null;

create index if not exists project_job_todos_org_archived_idx
  on public.project_job_todos (organization_id, archived_at, updated_at desc)
  where archived_at is not null;

create index if not exists project_job_todos_linked_variation_idx
  on public.project_job_todos (linked_variation_id)
  where linked_variation_id is not null;

create index if not exists project_job_todos_linked_purchase_order_idx
  on public.project_job_todos (linked_purchase_order_id)
  where linked_purchase_order_id is not null;

create index if not exists project_job_todos_linked_quote_idx
  on public.project_job_todos (linked_quote_id)
  where linked_quote_id is not null;

create index if not exists project_job_todos_linked_client_idx
  on public.project_job_todos (linked_client_id)
  where linked_client_id is not null;

-- ------------------------------------------------------------
-- Task activity log
-- Inserts are intentionally reserved for Phase 2 backend RPC/functions.
-- ------------------------------------------------------------

create table if not exists public.task_activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.project_job_todos (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  event_type text not null,
  field_name text null,
  old_value jsonb null,
  new_value jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint task_activity_log_event_type_not_blank check (char_length(trim(event_type)) > 0),
  constraint task_activity_log_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint task_activity_log_old_value_valid_check check (
    old_value is null
    or jsonb_typeof(old_value) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  ),
  constraint task_activity_log_new_value_valid_check check (
    new_value is null
    or jsonb_typeof(new_value) in ('object', 'array', 'string', 'number', 'boolean', 'null')
  )
);

create index if not exists task_activity_log_task_created_idx
  on public.task_activity_log (task_id, created_at desc);

create index if not exists task_activity_log_org_project_created_idx
  on public.task_activity_log (organization_id, project_id, created_at desc);

create index if not exists task_activity_log_org_event_type_created_idx
  on public.task_activity_log (organization_id, event_type, created_at desc);

alter table public.task_activity_log enable row level security;
alter table public.task_activity_log force row level security;

drop policy if exists "Members can view task activity log" on public.task_activity_log;
create policy "Members can view task activity log"
on public.task_activity_log
for select
to authenticated
using (
  public.is_member_of_organization(task_activity_log.organization_id)
);

drop policy if exists "Members can create task activity log" on public.task_activity_log;

grant select on public.task_activity_log to authenticated;

-- ------------------------------------------------------------
-- Task comments
-- ------------------------------------------------------------

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.project_job_todos (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  comment text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users (id) on delete set null,
  constraint task_comments_comment_not_blank check (char_length(trim(comment)) > 0),
  constraint task_comments_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists task_comments_task_created_idx
  on public.task_comments (task_id, created_at asc);

create index if not exists task_comments_org_project_created_idx
  on public.task_comments (organization_id, project_id, created_at desc);

create index if not exists task_comments_org_deleted_idx
  on public.task_comments (organization_id, deleted_at, updated_at desc)
  where deleted_at is not null;

drop trigger if exists set_task_comments_updated_at on public.task_comments;
create trigger set_task_comments_updated_at
before update on public.task_comments
for each row execute function public.set_updated_at();

alter table public.task_comments enable row level security;
alter table public.task_comments force row level security;

drop policy if exists "Members can view task comments" on public.task_comments;
create policy "Members can view task comments"
on public.task_comments
for select
to authenticated
using (
  public.is_member_of_organization(task_comments.organization_id)
);

drop policy if exists "Members can create task comments" on public.task_comments;
create policy "Members can create task comments"
on public.task_comments
for insert
to authenticated
with check (
  task_comments.user_id = auth.uid()
  and public.is_member_of_organization(task_comments.organization_id)
  and exists (
    select 1
    from public.project_job_todos t
    where t.id = task_comments.task_id
      and t.organization_id = task_comments.organization_id
      and (
        task_comments.project_id is null
        or t.project_id = task_comments.project_id
      )
  )
);

drop policy if exists "Members can update their own task comments" on public.task_comments;
create policy "Members can update their own task comments"
on public.task_comments
for update
to authenticated
using (
  task_comments.user_id = auth.uid()
  and public.is_member_of_organization(task_comments.organization_id)
)
with check (
  task_comments.user_id = auth.uid()
  and public.is_member_of_organization(task_comments.organization_id)
  and exists (
    select 1
    from public.project_job_todos t
    where t.id = task_comments.task_id
      and t.organization_id = task_comments.organization_id
      and (
        task_comments.project_id is null
        or t.project_id = task_comments.project_id
      )
  )
);

grant select, insert, update on public.task_comments to authenticated;

-- ------------------------------------------------------------
-- Task attachments (new canonical metadata table)
-- Old project_job_todo_attachments remains untouched for compatibility.
-- ------------------------------------------------------------

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.project_job_todos (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete set null,
  comment_id uuid null references public.task_comments (id) on delete set null,
  uploaded_by uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  original_file_name text null,
  file_type text null,
  mime_type text not null,
  storage_bucket text not null default 'task-attachments',
  storage_path text not null,
  file_size bigint null,
  attachment_type text not null default 'other',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users (id) on delete set null,
  constraint task_attachments_file_name_not_blank check (char_length(trim(file_name)) > 0),
  constraint task_attachments_mime_type_not_blank check (char_length(trim(mime_type)) > 0),
  constraint task_attachments_storage_bucket_not_blank check (char_length(trim(storage_bucket)) > 0),
  constraint task_attachments_storage_path_not_blank check (char_length(trim(storage_path)) > 0),
  constraint task_attachments_attachment_type_check check (
    attachment_type in (
      'photo',
      'pdf',
      'document',
      'delivery_docket',
      'qa_photo',
      'site_photo',
      'variation_attachment',
      'invoice_attachment',
      'other'
    )
  ),
  constraint task_attachments_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint task_attachments_file_size_positive_check check (file_size is null or file_size >= 0)
);

create index if not exists task_attachments_task_created_idx
  on public.task_attachments (task_id, created_at desc);

create index if not exists task_attachments_comment_created_idx
  on public.task_attachments (comment_id, created_at desc)
  where comment_id is not null;

create index if not exists task_attachments_org_project_created_idx
  on public.task_attachments (organization_id, project_id, created_at desc);

create index if not exists task_attachments_org_deleted_idx
  on public.task_attachments (organization_id, deleted_at, created_at desc)
  where deleted_at is not null;

create unique index if not exists task_attachments_storage_path_uidx
  on public.task_attachments (storage_bucket, storage_path);

alter table public.task_attachments enable row level security;
alter table public.task_attachments force row level security;

drop policy if exists "Members can view task attachments" on public.task_attachments;
create policy "Members can view task attachments"
on public.task_attachments
for select
to authenticated
using (
  public.is_member_of_organization(task_attachments.organization_id)
);

drop policy if exists "Members can create task attachments" on public.task_attachments;
create policy "Members can create task attachments"
on public.task_attachments
for insert
to authenticated
with check (
  task_attachments.uploaded_by = auth.uid()
  and public.is_member_of_organization(task_attachments.organization_id)
  and exists (
    select 1
    from public.project_job_todos t
    where t.id = task_attachments.task_id
      and t.organization_id = task_attachments.organization_id
      and (
        task_attachments.project_id is null
        or t.project_id = task_attachments.project_id
      )
  )
  and (
    task_attachments.comment_id is null
    or exists (
      select 1
      from public.task_comments c
      where c.id = task_attachments.comment_id
        and c.task_id = task_attachments.task_id
        and c.organization_id = task_attachments.organization_id
    )
  )
);

drop policy if exists "Members can update task attachments" on public.task_attachments;
create policy "Members can update task attachments"
on public.task_attachments
for update
to authenticated
using (
  public.is_member_of_organization(task_attachments.organization_id)
)
with check (
  public.is_member_of_organization(task_attachments.organization_id)
  and exists (
    select 1
    from public.project_job_todos t
    where t.id = task_attachments.task_id
      and t.organization_id = task_attachments.organization_id
      and (
        task_attachments.project_id is null
        or t.project_id = task_attachments.project_id
      )
  )
  and (
    task_attachments.comment_id is null
    or exists (
      select 1
      from public.task_comments c
      where c.id = task_attachments.comment_id
        and c.task_id = task_attachments.task_id
        and c.organization_id = task_attachments.organization_id
    )
  )
);

grant select, insert, update on public.task_attachments to authenticated;

-- ------------------------------------------------------------
-- Task links
-- ------------------------------------------------------------

create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.project_job_todos (id) on delete cascade,
  linked_type text not null,
  linked_id uuid not null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint task_links_linked_type_not_blank check (char_length(trim(linked_type)) > 0),
  constraint task_links_linked_type_check check (
    linked_type in (
      'project',
      'opportunity',
      'purchase_order',
      'supplier_invoice',
      'quote',
      'variation',
      'qa_issue',
      'inspection',
      'client',
      'supplier',
      'cost_code',
      'other'
    )
  ),
  constraint task_links_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists task_links_task_created_idx
  on public.task_links (task_id, created_at desc);

create index if not exists task_links_org_type_id_idx
  on public.task_links (organization_id, linked_type, linked_id, created_at desc);

create unique index if not exists task_links_task_type_id_uidx
  on public.task_links (task_id, linked_type, linked_id);

alter table public.task_links enable row level security;
alter table public.task_links force row level security;

drop policy if exists "Members can view task links" on public.task_links;
create policy "Members can view task links"
on public.task_links
for select
to authenticated
using (
  public.is_member_of_organization(task_links.organization_id)
);

drop policy if exists "Members can create task links" on public.task_links;
create policy "Members can create task links"
on public.task_links
for insert
to authenticated
with check (
  public.is_member_of_organization(task_links.organization_id)
  and exists (
    select 1
    from public.project_job_todos t
    where t.id = task_links.task_id
      and t.organization_id = task_links.organization_id
  )
);

drop policy if exists "Members can update task links" on public.task_links;
create policy "Members can update task links"
on public.task_links
for update
to authenticated
using (
  public.is_member_of_organization(task_links.organization_id)
)
with check (
  public.is_member_of_organization(task_links.organization_id)
  and exists (
    select 1
    from public.project_job_todos t
    where t.id = task_links.task_id
      and t.organization_id = task_links.organization_id
  )
);

drop policy if exists "Members can delete task links" on public.task_links;
create policy "Members can delete task links"
on public.task_links
for delete
to authenticated
using (
  public.is_member_of_organization(task_links.organization_id)
);

grant select, insert, update, delete on public.task_links to authenticated;

-- ------------------------------------------------------------
-- Storage bucket + org-member-scoped access helper/policies
-- Expected path:
-- {organization_id}/{project_id or unscoped}/tasks/{task_id}/filename
-- ------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'task-attachments',
  'task-attachments',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_task_attachment_storage_object(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    char_length(coalesce(object_path, '')) > 0
    and array_length(string_to_array(object_path, '/'), 1) >= 5
    and split_part(object_path, '/', 3) = 'tasks'
    and char_length(trim(split_part(object_path, '/', 4))) > 0
    and split_part(object_path, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.project_job_todos t
      where t.organization_id::text = split_part(object_path, '/', 1)
        and t.id::text = split_part(object_path, '/', 4)
        and (
          split_part(object_path, '/', 2) = 'unscoped'
          or t.project_id::text = split_part(object_path, '/', 2)
        )
        and public.is_member_of_organization(t.organization_id)
    );
$$;

grant execute on function public.can_access_task_attachment_storage_object(text) to authenticated;

drop policy if exists "Members can read task attachment storage objects" on storage.objects;
create policy "Members can read task attachment storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'task-attachments'
  and public.can_access_task_attachment_storage_object(name)
);

drop policy if exists "Members can upload task attachment storage objects" on storage.objects;
create policy "Members can upload task attachment storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'task-attachments'
  and public.can_access_task_attachment_storage_object(name)
);

drop policy if exists "Members can update task attachment storage objects" on storage.objects;
create policy "Members can update task attachment storage objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'task-attachments'
  and public.can_access_task_attachment_storage_object(name)
)
with check (
  bucket_id = 'task-attachments'
  and public.can_access_task_attachment_storage_object(name)
);

drop policy if exists "Members can delete task attachment storage objects" on storage.objects;
create policy "Members can delete task attachment storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'task-attachments'
  and public.can_access_task_attachment_storage_object(name)
);

commit;
