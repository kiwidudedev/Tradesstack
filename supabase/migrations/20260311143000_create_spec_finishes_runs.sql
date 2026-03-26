create table if not exists public.spec_finishes_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  trade_id text not null default '',
  trade_label text not null default '',
  created_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued',
  source_document_name text not null default '',
  extracted_page_count integer not null default 0,
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spec_finishes_runs_status_valid check (status in ('queued', 'running', 'complete', 'failed')),
  constraint spec_finishes_runs_trade_id_not_blank check (char_length(trim(trade_id)) > 0),
  constraint spec_finishes_runs_trade_label_not_blank check (char_length(trim(trade_label)) > 0),
  constraint spec_finishes_runs_source_document_name_not_blank check (char_length(trim(source_document_name)) > 0),
  constraint spec_finishes_runs_extracted_page_count_non_negative check (extracted_page_count >= 0),
  constraint spec_finishes_runs_result_json_object check (jsonb_typeof(result_json) = 'object')
);

alter table if exists public.spec_finishes_runs
  add column if not exists trade_id text;

alter table if exists public.spec_finishes_runs
  add column if not exists trade_label text;

update public.spec_finishes_runs
set
  trade_id = coalesce(nullif(trim(trade_id), ''), 'unknown'),
  trade_label = coalesce(nullif(trim(trade_label), ''), nullif(trim(result_json->>'tradeLabel'), ''), 'Unknown trade')
where trade_id is null
   or trade_label is null
   or trim(trade_id) = ''
   or trim(trade_label) = '';

alter table if exists public.spec_finishes_runs
  alter column trade_id set default 'unknown';

alter table if exists public.spec_finishes_runs
  alter column trade_label set default 'Unknown trade';

alter table if exists public.spec_finishes_runs
  alter column trade_id set not null;

alter table if exists public.spec_finishes_runs
  alter column trade_label set not null;

create index if not exists spec_finishes_runs_project_status_created_idx
on public.spec_finishes_runs (project_id, status, created_at desc);

create index if not exists spec_finishes_runs_project_trade_status_created_idx
on public.spec_finishes_runs (project_id, trade_id, status, created_at desc);

create index if not exists spec_finishes_runs_org_project_created_idx
on public.spec_finishes_runs (organization_id, project_id, created_at desc);

drop trigger if exists set_spec_finishes_runs_updated_at on public.spec_finishes_runs;
create trigger set_spec_finishes_runs_updated_at
before update on public.spec_finishes_runs
for each row
execute function public.set_updated_at();

alter table public.spec_finishes_runs enable row level security;
alter table public.spec_finishes_runs force row level security;

create or replace function public.can_run_spec_finishes_once(
  p_organization_id uuid,
  p_project_id uuid,
  p_trade_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if not public.is_member_of_organization(p_organization_id) then
    return false;
  end if;

  return not exists (
    select 1
    from public.spec_finishes_runs s
    where s.organization_id = p_organization_id
      and s.project_id = p_project_id
      and s.trade_id = p_trade_id
      and s.status = 'complete'
  );
end;
$$;

grant execute on function public.can_run_spec_finishes_once(uuid, uuid, text) to authenticated;

drop policy if exists "Members can view spec finishes runs" on public.spec_finishes_runs;
create policy "Members can view spec finishes runs"
on public.spec_finishes_runs
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = spec_finishes_runs.project_id
      and p.organization_id = spec_finishes_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can insert spec finishes runs" on public.spec_finishes_runs;
create policy "Members can insert spec finishes runs"
on public.spec_finishes_runs
for insert
with check (
  spec_finishes_runs.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = spec_finishes_runs.project_id
      and p.organization_id = spec_finishes_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
  and public.can_run_spec_finishes_once(
    spec_finishes_runs.organization_id,
    spec_finishes_runs.project_id,
    spec_finishes_runs.trade_id
  )
);

drop policy if exists "Members can update spec finishes runs" on public.spec_finishes_runs;
create policy "Members can update spec finishes runs"
on public.spec_finishes_runs
for update
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = spec_finishes_runs.project_id
      and p.organization_id = spec_finishes_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.organization_projects p
    where p.id = spec_finishes_runs.project_id
      and p.organization_id = spec_finishes_runs.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

grant select, insert, update on public.spec_finishes_runs to authenticated;
