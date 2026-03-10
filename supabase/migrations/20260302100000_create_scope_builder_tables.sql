create table if not exists public.trade_packs (
  id uuid primary key references public.project_drawing_sets (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  trade_id text not null,
  trade_label text not null,
  pdf_url text not null,
  page_index_json jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_packs_trade_id_not_blank check (char_length(trim(trade_id)) > 0),
  constraint trade_packs_trade_label_not_blank check (char_length(trim(trade_label)) > 0),
  constraint trade_packs_pdf_url_not_blank check (char_length(trim(pdf_url)) > 0),
  constraint trade_packs_page_index_json_array check (jsonb_typeof(page_index_json) = 'array')
);

create index if not exists trade_packs_project_created_idx
on public.trade_packs (project_id, created_at desc);

create index if not exists trade_packs_trade_project_idx
on public.trade_packs (trade_id, project_id);

drop trigger if exists set_trade_packs_updated_at on public.trade_packs;
create trigger set_trade_packs_updated_at
before update on public.trade_packs
for each row
execute function public.set_updated_at();

alter table public.trade_packs enable row level security;

drop policy if exists "Members can view trade packs" on public.trade_packs;
create policy "Members can view trade packs"
on public.trade_packs
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = trade_packs.project_id
      and p.organization_id = trade_packs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can insert trade packs" on public.trade_packs;
create policy "Members can insert trade packs"
on public.trade_packs
for insert
with check (
  trade_packs.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = trade_packs.project_id
      and p.organization_id = trade_packs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can update trade packs" on public.trade_packs;
create policy "Members can update trade packs"
on public.trade_packs
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = trade_packs.project_id
      and p.organization_id = trade_packs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = trade_packs.project_id
      and p.organization_id = trade_packs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

grant select, insert, update on public.trade_packs to authenticated;

create table if not exists public.scope_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  trade_pack_id uuid not null references public.trade_packs (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued',
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scope_runs_status_valid check (status in ('queued', 'running', 'complete', 'failed')),
  constraint scope_runs_result_json_object check (jsonb_typeof(result_json) = 'object')
);

create index if not exists scope_runs_trade_pack_created_idx
on public.scope_runs (trade_pack_id, created_at desc);

create index if not exists scope_runs_project_status_created_idx
on public.scope_runs (project_id, status, created_at desc);

drop trigger if exists set_scope_runs_updated_at on public.scope_runs;
create trigger set_scope_runs_updated_at
before update on public.scope_runs
for each row
execute function public.set_updated_at();

alter table public.scope_runs enable row level security;

drop policy if exists "Members can view scope runs" on public.scope_runs;
create policy "Members can view scope runs"
on public.scope_runs
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = scope_runs.project_id
      and p.organization_id = scope_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can insert scope runs" on public.scope_runs;
create policy "Members can insert scope runs"
on public.scope_runs
for insert
with check (
  scope_runs.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = scope_runs.project_id
      and p.organization_id = scope_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can update scope runs" on public.scope_runs;
create policy "Members can update scope runs"
on public.scope_runs
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = scope_runs.project_id
      and p.organization_id = scope_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = scope_runs.project_id
      and p.organization_id = scope_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

grant select, insert, update on public.scope_runs to authenticated;
