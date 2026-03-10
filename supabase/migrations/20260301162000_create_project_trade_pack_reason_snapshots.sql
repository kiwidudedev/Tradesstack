create table if not exists public.project_trade_pack_reason_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  generated_drawing_set_id uuid not null references public.project_drawing_sets (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  source_document_name text not null,
  trade_id text not null,
  trade_label text not null,
  matched_pages integer not null default 0,
  total_pages integer not null default 0,
  support_pages integer not null default 0,
  average_confidence numeric(5,4) not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_trade_pack_reason_snapshots_source_name_not_blank check (char_length(trim(source_document_name)) > 0),
  constraint project_trade_pack_reason_snapshots_trade_id_not_blank check (char_length(trim(trade_id)) > 0),
  constraint project_trade_pack_reason_snapshots_trade_label_not_blank check (char_length(trim(trade_label)) > 0),
  constraint project_trade_pack_reason_snapshots_matched_pages_non_negative check (matched_pages >= 0),
  constraint project_trade_pack_reason_snapshots_total_pages_positive check (total_pages > 0),
  constraint project_trade_pack_reason_snapshots_support_pages_non_negative check (support_pages >= 0),
  constraint project_trade_pack_reason_snapshots_support_pages_not_over_total check (support_pages <= total_pages),
  constraint project_trade_pack_reason_snapshots_average_confidence_range check (
    average_confidence >= 0 and average_confidence <= 1
  ),
  constraint project_trade_pack_reason_snapshots_reasons_array check (jsonb_typeof(reasons) = 'array')
);

create unique index if not exists project_trade_pack_reason_snapshots_generated_set_uidx
on public.project_trade_pack_reason_snapshots (generated_drawing_set_id);

create index if not exists project_trade_pack_reason_snapshots_project_created_idx
on public.project_trade_pack_reason_snapshots (project_id, created_at desc);

drop trigger if exists set_project_trade_pack_reason_snapshots_updated_at on public.project_trade_pack_reason_snapshots;
create trigger set_project_trade_pack_reason_snapshots_updated_at
before update on public.project_trade_pack_reason_snapshots
for each row
execute function public.set_updated_at();

alter table public.project_trade_pack_reason_snapshots enable row level security;

drop policy if exists "Members can view trade pack reason snapshots" on public.project_trade_pack_reason_snapshots;
create policy "Members can view trade pack reason snapshots"
on public.project_trade_pack_reason_snapshots
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = project_trade_pack_reason_snapshots.project_id
      and p.organization_id = project_trade_pack_reason_snapshots.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can insert trade pack reason snapshots" on public.project_trade_pack_reason_snapshots;
create policy "Members can insert trade pack reason snapshots"
on public.project_trade_pack_reason_snapshots
for insert
with check (
  project_trade_pack_reason_snapshots.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_trade_pack_reason_snapshots.project_id
      and p.organization_id = project_trade_pack_reason_snapshots.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

grant select, insert on public.project_trade_pack_reason_snapshots to authenticated;
