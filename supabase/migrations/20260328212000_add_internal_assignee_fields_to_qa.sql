alter table public.project_quality_inspections
  add column if not exists assignee_user_id uuid null references auth.users (id) on delete set null;

create index if not exists project_quality_inspections_assignee_user_idx
  on public.project_quality_inspections (organization_id, project_id, assignee_user_id);

alter table public.project_quality_sign_offs
  add column if not exists assignee_user_id uuid null references auth.users (id) on delete set null;

create index if not exists project_quality_sign_offs_assignee_user_idx
  on public.project_quality_sign_offs (organization_id, project_id, assignee_user_id);

alter table public.project_quality_photos
  add column if not exists assigned_user_id uuid null references auth.users (id) on delete set null,
  add column if not exists assigned_user_name text not null default '';

create index if not exists project_quality_photos_assigned_user_idx
  on public.project_quality_photos (organization_id, project_id, assigned_user_id, captured_at desc);
