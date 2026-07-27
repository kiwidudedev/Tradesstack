create table if not exists public.learning_review_run_records (
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid not null references public.learning_review_runs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  container_type text not null,
  source_table text not null,
  source_id uuid not null,
  source_updated_at timestamptz not null,
  source_project_id uuid null references public.organization_projects (id) on delete set null,
  source_opportunity_id uuid null references public.organization_opportunities (id) on delete set null,
  source_supplier_id uuid null references public.organization_suppliers (id) on delete set null,
  record_hash text not null,
  record_strength text not null default 'normal',
  created_at timestamptz not null default now(),
  constraint learning_review_run_records_container_type_not_blank check (char_length(trim(container_type)) > 0),
  constraint learning_review_run_records_source_table_not_blank check (char_length(trim(source_table)) > 0),
  constraint learning_review_run_records_record_hash_not_blank check (char_length(trim(record_hash)) > 0),
  constraint learning_review_run_records_record_strength_check check (
    record_strength in ('weak', 'normal', 'strong')
  )
);

create unique index if not exists learning_review_run_records_run_table_source_uidx
  on public.learning_review_run_records (review_run_id, source_table, source_id);

create index if not exists learning_review_run_records_org_container_updated_idx
  on public.learning_review_run_records (organization_id, container_type, source_updated_at desc);

create index if not exists learning_review_run_records_run_created_idx
  on public.learning_review_run_records (review_run_id, created_at asc);

alter table public.learning_review_run_records enable row level security;
alter table public.learning_review_run_records force row level security;

grant select, insert on public.learning_review_run_records to service_role;
