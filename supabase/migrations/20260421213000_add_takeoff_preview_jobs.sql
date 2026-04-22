do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'takeoff_preview_status'
  ) then
    create type public.takeoff_preview_status as enum ('pending', 'processing', 'ready', 'failed');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'takeoff_render_job_status'
  ) then
    create type public.takeoff_render_job_status as enum ('pending', 'processing', 'completed', 'failed');
  end if;
end
$$;

alter table public.takeoff_pages
  add column if not exists preview_status public.takeoff_preview_status;

alter table public.takeoff_pages
  add column if not exists preview_error text null;

alter table public.takeoff_pages
  add column if not exists preview_generated_at timestamptz null;

alter table public.takeoff_pages
  add column if not exists preview_render_version text null;

alter table public.takeoff_pages
  add column if not exists preview_width_px integer null;

alter table public.takeoff_pages
  add column if not exists preview_height_px integer null;

alter table public.takeoff_pages
  add column if not exists preview_mime_type text null;

alter table public.takeoff_pages
  add column if not exists preview_bytes bigint null;

alter table public.takeoff_pages
  drop constraint if exists takeoff_pages_preview_dimensions_positive;

alter table public.takeoff_pages
  add constraint takeoff_pages_preview_dimensions_positive check (
    (preview_width_px is null or preview_width_px > 0)
    and
    (preview_height_px is null or preview_height_px > 0)
  );

alter table public.takeoff_pages
  drop constraint if exists takeoff_pages_preview_mime_type_not_blank;

alter table public.takeoff_pages
  add constraint takeoff_pages_preview_mime_type_not_blank check (
    preview_mime_type is null or char_length(trim(preview_mime_type)) > 0
  );

alter table public.takeoff_pages
  drop constraint if exists takeoff_pages_preview_bytes_nonnegative;

alter table public.takeoff_pages
  add constraint takeoff_pages_preview_bytes_nonnegative check (
    preview_bytes is null or preview_bytes >= 0
  );

update public.takeoff_pages
set
  preview_status = case
    when preview_storage_path is not null then 'ready'::public.takeoff_preview_status
    else 'pending'::public.takeoff_preview_status
  end,
  preview_error = null,
  preview_generated_at = case
    when preview_storage_path is not null then coalesce(updated_at, created_at)
    else null
  end,
  preview_render_version = case
    when preview_storage_path is not null then 'swift-pdfkit-v1'
    else null
  end,
  preview_mime_type = case
    when preview_storage_path is not null then 'image/png'
    else null
  end
where preview_status is null;

alter table public.takeoff_pages
  alter column preview_status set default 'pending'::public.takeoff_preview_status;

alter table public.takeoff_pages
  alter column preview_status set not null;

create table if not exists public.takeoff_render_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  drawing_set_id uuid not null references public.project_drawing_sets (id) on delete cascade,
  job_type text not null default 'page_preview',
  status public.takeoff_render_job_status not null default 'pending',
  attempt_count integer not null default 0,
  last_error text null,
  requested_by uuid null references auth.users (id) on delete set null,
  source_revision text null,
  render_version text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  constraint takeoff_render_jobs_job_type_not_blank check (char_length(trim(job_type)) > 0),
  constraint takeoff_render_jobs_attempt_count_nonnegative check (attempt_count >= 0),
  constraint takeoff_render_jobs_render_version_not_blank check (char_length(trim(render_version)) > 0),
  constraint takeoff_render_jobs_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists takeoff_render_jobs_status_created_idx
  on public.takeoff_render_jobs (status, created_at asc);

create index if not exists takeoff_render_jobs_project_created_idx
  on public.takeoff_render_jobs (organization_id, project_id, created_at desc);

create index if not exists takeoff_render_jobs_drawing_status_idx
  on public.takeoff_render_jobs (organization_id, drawing_set_id, status, created_at desc);

create unique index if not exists takeoff_render_jobs_pending_unique_idx
  on public.takeoff_render_jobs (organization_id, drawing_set_id, job_type, source_revision, render_version)
  where status in ('pending', 'processing');

alter table public.takeoff_render_jobs enable row level security;

drop policy if exists "Members can view takeoff render jobs" on public.takeoff_render_jobs;
create policy "Members can view takeoff render jobs"
on public.takeoff_render_jobs
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_render_jobs.project_id
      and p.organization_id = takeoff_render_jobs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can create takeoff render jobs" on public.takeoff_render_jobs;
create policy "Members can create takeoff render jobs"
on public.takeoff_render_jobs
for insert
to authenticated
with check (
  (
    requested_by is null
    or requested_by = auth.uid()
  )
  and exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_render_jobs.project_id
      and p.organization_id = takeoff_render_jobs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can update takeoff render jobs" on public.takeoff_render_jobs;
create policy "Members can update takeoff render jobs"
on public.takeoff_render_jobs
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_render_jobs.project_id
      and p.organization_id = takeoff_render_jobs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = takeoff_render_jobs.project_id
      and p.organization_id = takeoff_render_jobs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

grant select, insert, update on public.takeoff_render_jobs to authenticated;
