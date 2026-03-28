create table if not exists public.project_quality_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  uploaded_by_user_id uuid null references auth.users (id) on delete set null,
  uploaded_by_name text not null default '',
  photo_url text not null,
  title text not null default '',
  notes text not null default '',
  trade text not null default '',
  location text not null default '',
  photo_type text not null default 'general',
  category text not null default 'Progress',
  status_tag text not null default '',
  phase_tag text null,
  has_signoff_evidence boolean not null default false,
  captured_at timestamptz not null default now(),
  linked_issue_id uuid null references public.project_quality_issues (id) on delete set null,
  linked_inspection_id uuid null references public.project_quality_inspections (id) on delete set null,
  linked_inspection_item_id uuid null references public.project_quality_inspection_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quality_photos_photo_url_not_blank check (char_length(trim(photo_url)) > 0),
  constraint project_quality_photos_photo_type_check check (photo_type in ('issue', 'inspection', 'general')),
  constraint project_quality_photos_phase_tag_check check (phase_tag is null or phase_tag in ('before', 'during', 'after'))
);

create index if not exists project_quality_photos_org_project_captured_idx
  on public.project_quality_photos (organization_id, project_id, captured_at desc);

create index if not exists project_quality_photos_org_project_type_idx
  on public.project_quality_photos (organization_id, project_id, photo_type, category, has_signoff_evidence);

create index if not exists project_quality_photos_org_project_trade_location_idx
  on public.project_quality_photos (organization_id, project_id, trade, location);

create index if not exists project_quality_photos_org_project_links_idx
  on public.project_quality_photos (organization_id, project_id, linked_issue_id, linked_inspection_id, linked_inspection_item_id);

drop trigger if exists set_project_quality_photos_updated_at on public.project_quality_photos;
create trigger set_project_quality_photos_updated_at
before update on public.project_quality_photos
for each row execute function public.set_updated_at();

alter table public.project_quality_photos enable row level security;
alter table public.project_quality_photos force row level security;

drop policy if exists "Members can view quality photos" on public.project_quality_photos;
create policy "Members can view quality photos"
on public.project_quality_photos
for select
using (public.is_member_of_organization(project_quality_photos.organization_id));

drop policy if exists "Members can create quality photos" on public.project_quality_photos;
create policy "Members can create quality photos"
on public.project_quality_photos
for insert
with check (
  project_quality_photos.created_by = auth.uid()
  and public.is_member_of_organization(project_quality_photos.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_photos.project_id
      and p.organization_id = project_quality_photos.organization_id
  )
);

drop policy if exists "Members can update quality photos" on public.project_quality_photos;
create policy "Members can update quality photos"
on public.project_quality_photos
for update
using (public.is_member_of_organization(project_quality_photos.organization_id))
with check (
  public.is_member_of_organization(project_quality_photos.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_photos.project_id
      and p.organization_id = project_quality_photos.organization_id
  )
);

drop policy if exists "Admins can delete quality photos" on public.project_quality_photos;
create policy "Admins can delete quality photos"
on public.project_quality_photos
for delete
using (public.is_admin_of_organization(project_quality_photos.organization_id));

grant select, insert, update, delete on public.project_quality_photos to authenticated;

insert into public.project_quality_photos (
  organization_id,
  project_id,
  created_by,
  uploaded_by_user_id,
  uploaded_by_name,
  photo_url,
  title,
  notes,
  trade,
  location,
  photo_type,
  category,
  status_tag,
  captured_at,
  linked_issue_id,
  created_at,
  updated_at
)
select
  p.organization_id,
  p.project_id,
  p.created_by,
  p.created_by,
  '',
  p.photo_url,
  coalesce(i.title, ''),
  '',
  coalesce(i.trade, ''),
  coalesce(i.location, ''),
  'issue',
  'Defect',
  coalesce(i.status, ''),
  p.created_at,
  p.issue_id,
  p.created_at,
  now()
from public.project_quality_issue_photos p
left join public.project_quality_issues i on i.id = p.issue_id
where not exists (
  select 1
  from public.project_quality_photos qp
  where qp.organization_id = p.organization_id
    and qp.project_id = p.project_id
    and qp.linked_issue_id = p.issue_id
    and qp.photo_url = p.photo_url
);
