create table if not exists public.worksheet_pricing_pattern_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  requested_organization_id uuid null references public.organizations (id) on delete set null,
  input_limit_count integer not null check (input_limit_count > 0),
  input_batch_size integer not null check (input_batch_size > 0),
  fetched_event_count integer not null default 0 check (fetched_event_count >= 0),
  pools_built integer not null default 0 check (pools_built >= 0),
  proposals_returned integer not null default 0 check (proposals_returned >= 0),
  accepted_by_gate_count integer not null default 0 check (accepted_by_gate_count >= 0),
  rejected_by_gate_count integer not null default 0 check (rejected_by_gate_count >= 0),
  no_pattern_count integer not null default 0 check (no_pattern_count >= 0),
  family_distribution jsonb not null default '{}'::jsonb check (jsonb_typeof(family_distribution) = 'object'),
  strength_distribution jsonb not null default '{}'::jsonb check (jsonb_typeof(strength_distribution) = 'object'),
  rejection_reasons jsonb not null default '{}'::jsonb check (jsonb_typeof(rejection_reasons) = 'object'),
  provider text not null,
  model text not null,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists worksheet_pricing_pattern_shadow_runs_org_created_idx
  on public.worksheet_pricing_pattern_shadow_runs (requested_organization_id, created_at desc);

create table if not exists public.worksheet_pricing_pattern_shadow_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.worksheet_pricing_pattern_shadow_runs (id) on delete cascade,
  batch_id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  gate_status text not null check (gate_status in ('accepted', 'rejected', 'no_pattern')),
  proposal_kind text not null check (proposal_kind in ('pattern', 'no_pattern')),
  pattern_family text null,
  pattern_type text null,
  title text null,
  summary text null,
  retrieval_guidance text null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  proposed_strength text null check (proposed_strength in ('weak', 'reinforced', 'durable')),
  scope jsonb not null default '{}'::jsonb check (jsonb_typeof(scope) = 'object'),
  pattern_value jsonb not null default '{}'::jsonb check (jsonb_typeof(pattern_value) = 'object'),
  supporting_evidence_event_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(supporting_evidence_event_ids) = 'array'),
  contradictory_evidence_event_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(contradictory_evidence_event_ids) = 'array'),
  ignored_evidence_event_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(ignored_evidence_event_ids) = 'array'),
  evidence_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_summary) = 'object'),
  contradiction_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(contradiction_summary) = 'object'),
  validation jsonb not null default '{}'::jsonb check (jsonb_typeof(validation) = 'object'),
  rejection_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(rejection_reasons) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists worksheet_pricing_pattern_shadow_proposals_run_idx
  on public.worksheet_pricing_pattern_shadow_proposals (run_id, created_at desc);

create index if not exists worksheet_pricing_pattern_shadow_proposals_org_family_idx
  on public.worksheet_pricing_pattern_shadow_proposals (organization_id, pattern_family, created_at desc);

alter table public.worksheet_pricing_pattern_shadow_runs enable row level security;
alter table public.worksheet_pricing_pattern_shadow_runs force row level security;
alter table public.worksheet_pricing_pattern_shadow_proposals enable row level security;
alter table public.worksheet_pricing_pattern_shadow_proposals force row level security;

revoke all on public.worksheet_pricing_pattern_shadow_runs from public, anon, authenticated;
revoke all on public.worksheet_pricing_pattern_shadow_proposals from public, anon, authenticated;

grant select, insert on public.worksheet_pricing_pattern_shadow_runs to service_role;
grant select, insert on public.worksheet_pricing_pattern_shadow_proposals to service_role;
