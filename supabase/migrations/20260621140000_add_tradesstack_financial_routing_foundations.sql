create table if not exists public.tradesstack_financial_routing_codes (
  code integer primary key,
  label text not null,
  description text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tradesstack_financial_routing_codes_code_check check (code in (100, 200, 300, 400, 500, 600, 700, 800)),
  constraint tradesstack_financial_routing_codes_label_not_blank check (char_length(trim(label)) > 0)
);

insert into public.tradesstack_financial_routing_codes (code, label, description)
values
  (100, 'Materials', 'TradesStack financial routing code for materials.'),
  (200, 'Labour', 'TradesStack financial routing code for labour.'),
  (300, 'Subcontractors', 'TradesStack financial routing code for subcontractors.'),
  (400, 'Plant & Equipment', 'TradesStack financial routing code for plant and equipment.'),
  (500, 'Overheads', 'TradesStack financial routing code for overheads.'),
  (600, 'Payment Claims', 'TradesStack financial routing code for payment claims.'),
  (700, 'Retentions', 'TradesStack financial routing code for retentions.'),
  (800, 'Others', 'TradesStack financial routing code for other and ambiguous items.')
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description,
  is_active = true,
  updated_at = now();

create table if not exists public.organization_tradesstack_accounting_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  tradesstack_cost_code integer not null references public.tradesstack_financial_routing_codes (code),
  organization_cost_code_id uuid not null references public.organization_cost_codes (id) on delete cascade,
  project_id uuid null references public.organization_projects (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid null references auth.users (id) on delete set null,
  constraint organization_tradesstack_accounting_mappings_provider_not_blank check (char_length(trim(provider)) > 0)
);

create unique index if not exists organization_tradesstack_accounting_mappings_active_scope_uidx
on public.organization_tradesstack_accounting_mappings (organization_id, provider, tradesstack_cost_code, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
where is_active = true;

alter table public.cost_items
  add column if not exists tradesstack_cost_code integer null references public.tradesstack_financial_routing_codes (code),
  add column if not exists tradesstack_cost_code_label text null,
  add column if not exists financial_routing_confidence numeric null,
  add column if not exists financial_routing_source text null,
  add column if not exists accounting_mapping_id uuid null references public.organization_tradesstack_accounting_mappings (id) on delete set null,
  add column if not exists review_status text null,
  add column if not exists review_reason text null,
  add column if not exists ai_construction_intelligence jsonb not null default '{}'::jsonb;

alter table public.organization_materials
  add column if not exists tradesstack_cost_code integer null references public.tradesstack_financial_routing_codes (code),
  add column if not exists tradesstack_cost_code_label text null,
  add column if not exists financial_routing_confidence numeric null,
  add column if not exists financial_routing_source text null,
  add column if not exists accounting_mapping_id uuid null references public.organization_tradesstack_accounting_mappings (id) on delete set null,
  add column if not exists review_status text null,
  add column if not exists review_reason text null,
  add column if not exists ai_construction_intelligence jsonb not null default '{}'::jsonb;

alter table public.organization_material_import_rows
  add column if not exists classified_tradesstack_cost_code integer null references public.tradesstack_financial_routing_codes (code),
  add column if not exists classified_tradesstack_cost_code_label text null,
  add column if not exists classified_accounting_mapping_id uuid null references public.organization_tradesstack_accounting_mappings (id) on delete set null,
  add column if not exists classified_review_status text null,
  add column if not exists classified_review_reason text null,
  add column if not exists classified_ai_construction_intelligence jsonb not null default '{}'::jsonb;

alter table public.supplier_invoice_line_allocations
  add column if not exists tradesstack_cost_code integer null references public.tradesstack_financial_routing_codes (code),
  add column if not exists tradesstack_cost_code_label text null,
  add column if not exists accounting_mapping_id uuid null references public.organization_tradesstack_accounting_mappings (id) on delete set null,
  add column if not exists review_reason text null,
  add column if not exists ai_construction_intelligence jsonb not null default '{}'::jsonb;

alter table public.project_actual_cost_events
  add column if not exists tradesstack_cost_code integer null references public.tradesstack_financial_routing_codes (code),
  add column if not exists tradesstack_cost_code_label text null,
  add column if not exists accounting_mapping_id uuid null references public.organization_tradesstack_accounting_mappings (id) on delete set null,
  add column if not exists ai_construction_intelligence jsonb not null default '{}'::jsonb;
