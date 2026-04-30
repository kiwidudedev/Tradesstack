create table if not exists public.project_quality_sign_off_work_proofs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  sign_off_id uuid not null references public.project_quality_sign_offs (id) on delete cascade,
  work_proof_id uuid not null references public.project_quality_work_proofs (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint project_quality_sign_off_work_proofs_unique_link unique (sign_off_id, work_proof_id)
);

create index if not exists project_quality_sign_off_work_proofs_org_project_signoff_idx
  on public.project_quality_sign_off_work_proofs (organization_id, project_id, sign_off_id, created_at desc);

create index if not exists project_quality_sign_off_work_proofs_org_project_work_proof_idx
  on public.project_quality_sign_off_work_proofs (organization_id, project_id, work_proof_id, created_at desc);

insert into public.project_quality_sign_off_work_proofs (
  organization_id,
  project_id,
  sign_off_id,
  work_proof_id
)
select
  signoffs.organization_id,
  signoffs.project_id,
  signoffs.id,
  signoffs.linked_work_proof_id
from public.project_quality_sign_offs as signoffs
where signoffs.linked_work_proof_id is not null
on conflict (sign_off_id, work_proof_id) do nothing;

alter table public.project_quality_sign_off_work_proofs enable row level security;
alter table public.project_quality_sign_off_work_proofs force row level security;

drop policy if exists "Members can view quality sign-off work proof links" on public.project_quality_sign_off_work_proofs;
create policy "Members can view quality sign-off work proof links"
on public.project_quality_sign_off_work_proofs
for select
using (public.is_member_of_organization(project_quality_sign_off_work_proofs.organization_id));

drop policy if exists "Members can create quality sign-off work proof links" on public.project_quality_sign_off_work_proofs;
create policy "Members can create quality sign-off work proof links"
on public.project_quality_sign_off_work_proofs
for insert
with check (
  public.is_member_of_organization(project_quality_sign_off_work_proofs.organization_id)
  and exists (
    select 1
    from public.project_quality_sign_offs signoffs
    where signoffs.id = project_quality_sign_off_work_proofs.sign_off_id
      and signoffs.project_id = project_quality_sign_off_work_proofs.project_id
      and signoffs.organization_id = project_quality_sign_off_work_proofs.organization_id
  )
  and exists (
    select 1
    from public.project_quality_work_proofs proofs
    where proofs.id = project_quality_sign_off_work_proofs.work_proof_id
      and proofs.project_id = project_quality_sign_off_work_proofs.project_id
      and proofs.organization_id = project_quality_sign_off_work_proofs.organization_id
  )
);

drop policy if exists "Members can update quality sign-off work proof links" on public.project_quality_sign_off_work_proofs;
create policy "Members can update quality sign-off work proof links"
on public.project_quality_sign_off_work_proofs
for update
using (public.is_member_of_organization(project_quality_sign_off_work_proofs.organization_id))
with check (
  public.is_member_of_organization(project_quality_sign_off_work_proofs.organization_id)
  and exists (
    select 1
    from public.project_quality_sign_offs signoffs
    where signoffs.id = project_quality_sign_off_work_proofs.sign_off_id
      and signoffs.project_id = project_quality_sign_off_work_proofs.project_id
      and signoffs.organization_id = project_quality_sign_off_work_proofs.organization_id
  )
  and exists (
    select 1
    from public.project_quality_work_proofs proofs
    where proofs.id = project_quality_sign_off_work_proofs.work_proof_id
      and proofs.project_id = project_quality_sign_off_work_proofs.project_id
      and proofs.organization_id = project_quality_sign_off_work_proofs.organization_id
  )
);

drop policy if exists "Admins can delete quality sign-off work proof links" on public.project_quality_sign_off_work_proofs;
create policy "Admins can delete quality sign-off work proof links"
on public.project_quality_sign_off_work_proofs
for delete
using (public.is_admin_of_organization(project_quality_sign_off_work_proofs.organization_id));

grant select, insert, update, delete on public.project_quality_sign_off_work_proofs to authenticated;
