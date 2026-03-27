create table if not exists public.project_time_sheet_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  worker_user_id uuid not null references auth.users (id) on delete cascade,
  worker_member_id uuid null references public.organization_members (id) on delete set null,
  worker_name text not null,
  company_name text not null default '',
  trade_name text not null default '',
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz null,
  clock_in_latitude numeric(10,7) null,
  clock_in_longitude numeric(10,7) null,
  clock_in_accuracy_meters numeric(10,2) null,
  clock_out_latitude numeric(10,7) null,
  clock_out_longitude numeric(10,7) null,
  clock_out_accuracy_meters numeric(10,2) null,
  warning_8h5_at timestamptz null,
  auto_clocked_out boolean not null default false,
  auto_clocked_out_at timestamptz null,
  total_hours numeric(10,2) null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_time_sheet_entries_worker_name_not_blank check (char_length(trim(worker_name)) > 0),
  constraint project_time_sheet_entries_total_hours_check check (total_hours is null or (total_hours >= 0 and total_hours <= 24)),
  constraint project_time_sheet_entries_clock_in_latitude_range check (clock_in_latitude is null or (clock_in_latitude >= -90 and clock_in_latitude <= 90)),
  constraint project_time_sheet_entries_clock_in_longitude_range check (clock_in_longitude is null or (clock_in_longitude >= -180 and clock_in_longitude <= 180)),
  constraint project_time_sheet_entries_clock_out_latitude_range check (clock_out_latitude is null or (clock_out_latitude >= -90 and clock_out_latitude <= 90)),
  constraint project_time_sheet_entries_clock_out_longitude_range check (clock_out_longitude is null or (clock_out_longitude >= -180 and clock_out_longitude <= 180))
);

create index if not exists project_time_sheet_entries_org_idx
  on public.project_time_sheet_entries (organization_id);
create index if not exists project_time_sheet_entries_project_clock_in_idx
  on public.project_time_sheet_entries (project_id, clock_in_at desc);
create index if not exists project_time_sheet_entries_active_idx
  on public.project_time_sheet_entries (project_id, clock_out_at, worker_user_id);

drop trigger if exists set_project_time_sheet_entries_updated_at on public.project_time_sheet_entries;
create trigger set_project_time_sheet_entries_updated_at
before update on public.project_time_sheet_entries
for each row execute function public.set_updated_at();

create table if not exists public.project_time_sheet_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  entry_id uuid null references public.project_time_sheet_entries (id) on delete set null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  worker_name text not null default '',
  event_type text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint project_time_sheet_events_event_type_check check (
    event_type in ('clock_in', 'clock_out', 'warning_8h5', 'auto_clock_out', 'manual_edit')
  )
);

create index if not exists project_time_sheet_events_project_created_idx
  on public.project_time_sheet_events (project_id, created_at desc);
create index if not exists project_time_sheet_events_org_idx
  on public.project_time_sheet_events (organization_id, created_at desc);

alter table public.project_time_sheet_entries enable row level security;
alter table public.project_time_sheet_entries force row level security;
alter table public.project_time_sheet_events enable row level security;
alter table public.project_time_sheet_events force row level security;

drop policy if exists "Members can view time sheet entries" on public.project_time_sheet_entries;
create policy "Members can view time sheet entries"
on public.project_time_sheet_entries
for select
using (public.is_member_of_organization(project_time_sheet_entries.organization_id));

drop policy if exists "Members can create time sheet entries" on public.project_time_sheet_entries;
create policy "Members can create time sheet entries"
on public.project_time_sheet_entries
for insert
with check (
  project_time_sheet_entries.created_by = auth.uid()
  and public.is_member_of_organization(project_time_sheet_entries.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_time_sheet_entries.project_id
      and p.organization_id = project_time_sheet_entries.organization_id
  )
  and (
    public.is_admin_of_organization(project_time_sheet_entries.organization_id)
    or project_time_sheet_entries.worker_user_id = auth.uid()
  )
);

drop policy if exists "Members can update time sheet entries" on public.project_time_sheet_entries;
create policy "Members can update time sheet entries"
on public.project_time_sheet_entries
for update
using (
  public.is_member_of_organization(project_time_sheet_entries.organization_id)
  and (
    public.is_admin_of_organization(project_time_sheet_entries.organization_id)
    or project_time_sheet_entries.worker_user_id = auth.uid()
  )
)
with check (
  public.is_member_of_organization(project_time_sheet_entries.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_time_sheet_entries.project_id
      and p.organization_id = project_time_sheet_entries.organization_id
  )
  and (
    public.is_admin_of_organization(project_time_sheet_entries.organization_id)
    or project_time_sheet_entries.worker_user_id = auth.uid()
  )
);

drop policy if exists "Admins can delete time sheet entries" on public.project_time_sheet_entries;
create policy "Admins can delete time sheet entries"
on public.project_time_sheet_entries
for delete
using (public.is_admin_of_organization(project_time_sheet_entries.organization_id));

drop policy if exists "Members can view time sheet events" on public.project_time_sheet_events;
create policy "Members can view time sheet events"
on public.project_time_sheet_events
for select
using (public.is_member_of_organization(project_time_sheet_events.organization_id));

drop policy if exists "Members can create time sheet events" on public.project_time_sheet_events;
create policy "Members can create time sheet events"
on public.project_time_sheet_events
for insert
with check (
  public.is_member_of_organization(project_time_sheet_events.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_time_sheet_events.project_id
      and p.organization_id = project_time_sheet_events.organization_id
  )
);

drop policy if exists "Admins can delete time sheet events" on public.project_time_sheet_events;
create policy "Admins can delete time sheet events"
on public.project_time_sheet_events
for delete
using (public.is_admin_of_organization(project_time_sheet_events.organization_id));

grant select, insert, update, delete on public.project_time_sheet_entries to authenticated;
grant select, insert, delete on public.project_time_sheet_events to authenticated;
