create table if not exists public.project_trade_pack_page_index (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  source_drawing_set_id uuid references public.project_drawing_sets (id) on delete set null,
  generated_drawing_set_id uuid references public.project_drawing_sets (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete cascade,
  source_document_name text not null,
  trade_id text not null,
  trade_label text not null,
  page_number integer not null,
  include_in_pack boolean not null default false,
  confidence numeric(5,4) not null default 0,
  classifier text not null,
  prefilter_pass boolean not null default false,
  is_support_sheet boolean not null default false,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_trade_pack_page_index_source_name_not_blank check (char_length(trim(source_document_name)) > 0),
  constraint project_trade_pack_page_index_trade_id_not_blank check (char_length(trim(trade_id)) > 0),
  constraint project_trade_pack_page_index_trade_label_not_blank check (char_length(trim(trade_label)) > 0),
  constraint project_trade_pack_page_index_page_number_positive check (page_number > 0),
  constraint project_trade_pack_page_index_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint project_trade_pack_page_index_classifier_valid check (
    classifier in ('vlm', 'fallback-rules', 'rules-only')
  )
);

create index if not exists project_trade_pack_page_index_project_trade_idx
on public.project_trade_pack_page_index (project_id, trade_id, created_at desc);

create index if not exists project_trade_pack_page_index_run_idx
on public.project_trade_pack_page_index (run_id, page_number);

create index if not exists project_trade_pack_page_index_source_set_idx
on public.project_trade_pack_page_index (source_drawing_set_id, created_at desc);

drop trigger if exists set_project_trade_pack_page_index_updated_at on public.project_trade_pack_page_index;
create trigger set_project_trade_pack_page_index_updated_at
before update on public.project_trade_pack_page_index
for each row
execute function public.set_updated_at();

alter table public.project_trade_pack_page_index enable row level security;

drop policy if exists "Members can view project trade pack page index" on public.project_trade_pack_page_index;
create policy "Members can view project trade pack page index"
on public.project_trade_pack_page_index
for select
using (
  exists (
    select 1
    from public.organization_projects p
    where p.id = project_trade_pack_page_index.project_id
      and p.organization_id = project_trade_pack_page_index.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

drop policy if exists "Members can insert project trade pack page index" on public.project_trade_pack_page_index;
create policy "Members can insert project trade pack page index"
on public.project_trade_pack_page_index
for insert
with check (
  project_trade_pack_page_index.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_trade_pack_page_index.project_id
      and p.organization_id = project_trade_pack_page_index.organization_id
      and public.is_member_of_organization(p.organization_id)
  )
);

grant select, insert on public.project_trade_pack_page_index to authenticated;
