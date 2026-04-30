create table if not exists public.project_quality_work_proofs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  trade_type text not null default '',
  work_category text not null default '',
  area text not null default '',
  note text not null default '',
  status text not null default 'draft',
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quality_work_proofs_status_check
    check (status in ('draft', 'completed', 'linked_to_signoff'))
);

create index if not exists project_quality_work_proofs_org_project_created_idx
  on public.project_quality_work_proofs (organization_id, project_id, created_at desc);

create index if not exists project_quality_work_proofs_org_project_status_idx
  on public.project_quality_work_proofs (organization_id, project_id, status, completed_at desc);

drop trigger if exists set_project_quality_work_proofs_updated_at on public.project_quality_work_proofs;
create trigger set_project_quality_work_proofs_updated_at
before update on public.project_quality_work_proofs
for each row execute function public.set_updated_at();

create table if not exists public.project_quality_work_proof_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  work_proof_id uuid not null references public.project_quality_work_proofs (id) on delete cascade,
  label text not null,
  checked boolean not null default false,
  checked_by uuid null references auth.users (id) on delete set null,
  checked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_quality_work_proof_checklist_items_label_not_blank check (char_length(trim(label)) > 0)
);

create index if not exists project_quality_work_proof_checklist_items_org_project_idx
  on public.project_quality_work_proof_checklist_items (organization_id, project_id, work_proof_id, created_at asc);

drop trigger if exists set_project_quality_work_proof_checklist_items_updated_at on public.project_quality_work_proof_checklist_items;
create trigger set_project_quality_work_proof_checklist_items_updated_at
before update on public.project_quality_work_proof_checklist_items
for each row execute function public.set_updated_at();

alter table public.project_quality_photos
  add column if not exists linked_work_proof_id uuid null references public.project_quality_work_proofs (id) on delete set null,
  add column if not exists trade_type text null,
  add column if not exists work_category text null,
  add column if not exists area text null;

alter table public.project_quality_issues
  add column if not exists linked_work_proof_id uuid null references public.project_quality_work_proofs (id) on delete set null,
  add column if not exists trade_type text null,
  add column if not exists work_category text null,
  add column if not exists area text null,
  add column if not exists closed_at timestamptz null;

alter table public.project_quality_sign_offs
  add column if not exists linked_work_proof_id uuid null references public.project_quality_work_proofs (id) on delete set null,
  add column if not exists trade_type text null,
  add column if not exists work_category text null,
  add column if not exists area text null,
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by_user_id uuid null references auth.users (id) on delete set null;

create index if not exists project_quality_photos_linked_work_proof_idx
  on public.project_quality_photos (organization_id, project_id, linked_work_proof_id)
  where linked_work_proof_id is not null;

create index if not exists project_quality_issues_linked_work_proof_idx
  on public.project_quality_issues (organization_id, project_id, linked_work_proof_id)
  where linked_work_proof_id is not null;

create index if not exists project_quality_sign_offs_linked_work_proof_idx
  on public.project_quality_sign_offs (organization_id, project_id, linked_work_proof_id)
  where linked_work_proof_id is not null;

alter table public.project_quality_photos
  drop constraint if exists project_quality_photos_photo_type_check;

alter table public.project_quality_photos
  add constraint project_quality_photos_photo_type_check
  check (photo_type in ('issue', 'inspection', 'general', 'work_proof'));

update public.project_quality_photos
set
  trade_type = coalesce(trade_type, nullif(trade, '')),
  work_category = coalesce(work_category, nullif(category, '')),
  area = coalesce(area, nullif(location, ''))
where trade_type is null
   or work_category is null
   or area is null;

update public.project_quality_issues
set
  trade_type = coalesce(trade_type, nullif(trade, '')),
  area = coalesce(area, nullif(location, '')),
  closed_at = case
    when status in ('Complete', 'Verified') then coalesce(closed_at, updated_at, created_at, now())
    else closed_at
  end
where trade_type is null
   or area is null
   or closed_at is null;

update public.project_quality_sign_offs
set
  trade_type = coalesce(trade_type, nullif(trade, '')),
  area = coalesce(area, nullif(location, '')),
  approved_at = case
    when status = 'Signed' then coalesce(approved_at, signed_at, updated_at, created_at, now())
    else approved_at
  end,
  approved_by_user_id = coalesce(approved_by_user_id, signed_by_user_id)
where trade_type is null
   or area is null
   or approved_at is null
   or approved_by_user_id is null;

create or replace function public.sync_project_quality_issue_closed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('Complete', 'Verified') then
    if tg_op = 'INSERT' or old.status is distinct from new.status or new.closed_at is null then
      new.closed_at := coalesce(new.closed_at, now());
    end if;
  elsif tg_op <> 'INSERT' and new.status is distinct from old.status then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_project_quality_issue_closed_at on public.project_quality_issues;
create trigger sync_project_quality_issue_closed_at
before insert or update of status on public.project_quality_issues
for each row execute function public.sync_project_quality_issue_closed_at();

create or replace function public.sync_project_quality_signoff_approval_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Signed' then
    new.approved_at := coalesce(new.approved_at, new.signed_at, now());
    new.approved_by_user_id := coalesce(new.approved_by_user_id, new.signed_by_user_id);
  elsif tg_op <> 'INSERT' and new.status is distinct from old.status then
    new.approved_at := null;
    new.approved_by_user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_project_quality_signoff_approval_fields on public.project_quality_sign_offs;
create trigger sync_project_quality_signoff_approval_fields
before insert or update of status on public.project_quality_sign_offs
for each row execute function public.sync_project_quality_signoff_approval_fields();

create or replace function public.sync_project_quality_work_proof_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('completed', 'linked_to_signoff') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif tg_op <> 'INSERT' and new.status is distinct from old.status then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_project_quality_work_proof_completed_at on public.project_quality_work_proofs;
create trigger sync_project_quality_work_proof_completed_at
before insert or update of status on public.project_quality_work_proofs
for each row execute function public.sync_project_quality_work_proof_completed_at();

alter table public.project_quality_work_proofs enable row level security;
alter table public.project_quality_work_proofs force row level security;
alter table public.project_quality_work_proof_checklist_items enable row level security;
alter table public.project_quality_work_proof_checklist_items force row level security;

drop policy if exists "Members can view quality work proofs" on public.project_quality_work_proofs;
create policy "Members can view quality work proofs"
on public.project_quality_work_proofs
for select
using (public.is_member_of_organization(project_quality_work_proofs.organization_id));

drop policy if exists "Members can create quality work proofs" on public.project_quality_work_proofs;
create policy "Members can create quality work proofs"
on public.project_quality_work_proofs
for insert
with check (
  project_quality_work_proofs.created_by = auth.uid()
  and public.is_member_of_organization(project_quality_work_proofs.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_work_proofs.project_id
      and p.organization_id = project_quality_work_proofs.organization_id
  )
);

drop policy if exists "Members can update quality work proofs" on public.project_quality_work_proofs;
create policy "Members can update quality work proofs"
on public.project_quality_work_proofs
for update
using (public.is_member_of_organization(project_quality_work_proofs.organization_id))
with check (
  public.is_member_of_organization(project_quality_work_proofs.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_quality_work_proofs.project_id
      and p.organization_id = project_quality_work_proofs.organization_id
  )
);

drop policy if exists "Admins can delete quality work proofs" on public.project_quality_work_proofs;
create policy "Admins can delete quality work proofs"
on public.project_quality_work_proofs
for delete
using (public.is_admin_of_organization(project_quality_work_proofs.organization_id));

drop policy if exists "Members can view quality work proof checklist items" on public.project_quality_work_proof_checklist_items;
create policy "Members can view quality work proof checklist items"
on public.project_quality_work_proof_checklist_items
for select
using (public.is_member_of_organization(project_quality_work_proof_checklist_items.organization_id));

drop policy if exists "Members can create quality work proof checklist items" on public.project_quality_work_proof_checklist_items;
create policy "Members can create quality work proof checklist items"
on public.project_quality_work_proof_checklist_items
for insert
with check (
  public.is_member_of_organization(project_quality_work_proof_checklist_items.organization_id)
  and exists (
    select 1
    from public.project_quality_work_proofs wp
    where wp.id = project_quality_work_proof_checklist_items.work_proof_id
      and wp.project_id = project_quality_work_proof_checklist_items.project_id
      and wp.organization_id = project_quality_work_proof_checklist_items.organization_id
  )
);

drop policy if exists "Members can update quality work proof checklist items" on public.project_quality_work_proof_checklist_items;
create policy "Members can update quality work proof checklist items"
on public.project_quality_work_proof_checklist_items
for update
using (public.is_member_of_organization(project_quality_work_proof_checklist_items.organization_id))
with check (
  public.is_member_of_organization(project_quality_work_proof_checklist_items.organization_id)
  and exists (
    select 1
    from public.project_quality_work_proofs wp
    where wp.id = project_quality_work_proof_checklist_items.work_proof_id
      and wp.project_id = project_quality_work_proof_checklist_items.project_id
      and wp.organization_id = project_quality_work_proof_checklist_items.organization_id
  )
);

drop policy if exists "Admins can delete quality work proof checklist items" on public.project_quality_work_proof_checklist_items;
create policy "Admins can delete quality work proof checklist items"
on public.project_quality_work_proof_checklist_items
for delete
using (public.is_admin_of_organization(project_quality_work_proof_checklist_items.organization_id));

grant select, insert, update, delete on public.project_quality_work_proofs to authenticated;
grant select, insert, update, delete on public.project_quality_work_proof_checklist_items to authenticated;
