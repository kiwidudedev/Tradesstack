create table if not exists public.project_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  claim_number text not null,
  claim_title text not null,
  claim_type text not null default 'Progress',
  status text not null default 'Draft',
  claim_date date null,
  due_date date null,
  period_start date null,
  period_end date null,
  percent_complete numeric(7,3) not null default 0,
  claim_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  linked_quote_value numeric(14,2) not null default 0,
  linked_approved_variations numeric(14,2) not null default 0,
  previous_claims_total numeric(14,2) not null default 0,
  revised_contract_value numeric(14,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_claims_number_not_blank check (char_length(trim(claim_number)) > 0),
  constraint project_claims_title_not_blank check (char_length(trim(claim_title)) > 0),
  constraint project_claims_type_check check (claim_type in ('Progress', 'Deposit', 'Final')),
  constraint project_claims_status_check check (status in ('Draft', 'Submitted', 'Unpaid', 'Paid', 'Overdue', 'Cancelled')),
  constraint project_claims_unique_number_per_project unique (project_id, claim_number)
);

create index if not exists project_claims_org_idx
  on public.project_claims (organization_id);
create index if not exists project_claims_project_idx
  on public.project_claims (project_id, claim_date desc, created_at desc);
create index if not exists project_claims_status_idx
  on public.project_claims (organization_id, status, due_date);

drop trigger if exists set_project_claims_updated_at on public.project_claims;
create trigger set_project_claims_updated_at
before update on public.project_claims
for each row execute function public.set_updated_at();

alter table public.project_claims enable row level security;
alter table public.project_claims force row level security;

drop policy if exists "Members can view project claims" on public.project_claims;
create policy "Members can view project claims"
on public.project_claims
for select
using (public.is_member_of_organization(project_claims.organization_id));

drop policy if exists "Members can create project claims" on public.project_claims;
create policy "Members can create project claims"
on public.project_claims
for insert
with check (
  project_claims.created_by = auth.uid()
  and public.is_member_of_organization(project_claims.organization_id)
);

drop policy if exists "Members can update project claims" on public.project_claims;
create policy "Members can update project claims"
on public.project_claims
for update
using (public.is_member_of_organization(project_claims.organization_id))
with check (public.is_member_of_organization(project_claims.organization_id));

drop policy if exists "Admins can delete project claims" on public.project_claims;
create policy "Admins can delete project claims"
on public.project_claims
for delete
using (public.is_admin_of_organization(project_claims.organization_id));

grant select, insert, update, delete on public.project_claims to authenticated;
