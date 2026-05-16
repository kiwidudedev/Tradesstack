begin;

alter table if exists public.supplier_invoice_lines
  add column if not exists line_uid uuid,
  add column if not exists source_row_number integer null,
  add column if not exists raw_line_text text null,
  add column if not exists normalized_line_text text null,
  add column if not exists supplier_item_code text null,
  add column if not exists supplier_description text null,
  add column if not exists ocr_confidence numeric null,
  add column if not exists import_source text not null default 'manual',
  add column if not exists source_metadata_json jsonb not null default '{}'::jsonb;

update public.supplier_invoice_lines
set line_uid = gen_random_uuid()
where line_uid is null;

alter table if exists public.supplier_invoice_lines
  alter column line_uid set default gen_random_uuid(),
  alter column line_uid set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_invoice_lines_ocr_confidence_range_check'
  ) then
    alter table public.supplier_invoice_lines
      add constraint supplier_invoice_lines_ocr_confidence_range_check
      check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_invoice_lines_import_source_check'
  ) then
    alter table public.supplier_invoice_lines
      add constraint supplier_invoice_lines_import_source_check
      check (import_source in ('manual', 'ocr', 'csv', 'api', 'system'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_invoice_lines_source_metadata_object_check'
  ) then
    alter table public.supplier_invoice_lines
      add constraint supplier_invoice_lines_source_metadata_object_check
      check (jsonb_typeof(source_metadata_json) = 'object');
  end if;
end $$;

create unique index if not exists supplier_invoice_lines_invoice_line_uid_uidx
  on public.supplier_invoice_lines (supplier_invoice_id, line_uid);

create index if not exists supplier_invoice_lines_invoice_source_row_idx
  on public.supplier_invoice_lines (supplier_invoice_id, source_row_number)
  where source_row_number is not null;

create index if not exists supplier_invoice_lines_supplier_item_code_idx
  on public.supplier_invoice_lines (organization_id, supplier_item_code)
  where supplier_item_code is not null;

create index if not exists supplier_invoice_lines_normalized_text_idx
  on public.supplier_invoice_lines (organization_id, normalized_line_text)
  where normalized_line_text is not null;

create table if not exists public.supplier_invoice_line_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  supplier_invoice_line_id uuid not null references public.supplier_invoice_lines (id) on delete cascade,
  purchase_order_id uuid null references public.project_purchase_orders (id) on delete set null,
  purchase_order_line_item_id uuid null references public.project_purchase_order_line_items (id) on delete set null,
  project_id uuid null references public.organization_projects (id) on delete set null,
  allocation_sequence integer not null default 1,
  allocated_quantity numeric(14,3) null,
  allocated_amount numeric(14,2) not null default 0,
  matched_amount numeric(14,2) not null default 0,
  cost_item_id uuid null references public.cost_items (id) on delete set null,
  source_cost_item_id uuid null references public.cost_items (id) on delete set null,
  work_type text null,
  cost_type text null,
  internal_cost_code text null,
  classification_status text not null default 'pending',
  organization_cost_code_id uuid null references public.organization_cost_codes (id) on delete set null,
  accounting_resolution_status text not null default 'pending',
  allocation_status text not null default 'unmatched',
  match_status text not null default 'suggested',
  review_status text not null default 'pending',
  approval_status text not null default 'pending',
  approval_notes text not null default '',
  approval_checks_json jsonb not null default '{}'::jsonb,
  reviewed_by_user_id uuid null references auth.users (id) on delete set null,
  reviewed_at timestamptz null,
  approved_by_user_id uuid null references auth.users (id) on delete set null,
  approved_at timestamptz null,
  allocation_source text not null default 'manual',
  ai_suggested_purchase_order_line_item_id uuid null references public.project_purchase_order_line_items (id) on delete set null,
  ai_suggested_cost_item_id uuid null references public.cost_items (id) on delete set null,
  ai_confidence_score numeric null,
  ai_reasoning_summary text null,
  accepted_ai_suggestion boolean not null default false,
  ai_suggestion_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_line_allocations_sequence_check
    check (allocation_sequence > 0),
  constraint supplier_invoice_line_allocations_allocated_quantity_check
    check (allocated_quantity is null or allocated_quantity >= 0),
  constraint supplier_invoice_line_allocations_allocated_amount_check
    check (allocated_amount >= 0),
  constraint supplier_invoice_line_allocations_matched_amount_check
    check (matched_amount >= 0),
  constraint supplier_invoice_line_allocations_classification_status_check
    check (classification_status in ('pending', 'inherited', 'manual', 'needs_review')),
  constraint supplier_invoice_line_allocations_accounting_resolution_status_check
    check (accounting_resolution_status in ('pending', 'resolved', 'fallback', 'unresolved', 'classification_review_required')),
  constraint supplier_invoice_line_allocations_allocation_status_check
    check (allocation_status in ('unmatched', 'suggested', 'matched', 'partially_matched', 'split', 'disputed')),
  constraint supplier_invoice_line_allocations_match_status_check
    check (match_status in ('suggested', 'accepted', 'rejected', 'adjusted')),
  constraint supplier_invoice_line_allocations_review_status_check
    check (review_status in ('pending', 'reviewed', 'needs_cost_review', 'needs_accounting_review', 'disputed')),
  constraint supplier_invoice_line_allocations_approval_status_check
    check (approval_status in ('pending', 'approved', 'disputed')),
  constraint supplier_invoice_line_allocations_allocation_source_check
    check (allocation_source in ('manual', 'ai_suggested', 'imported', 'system')),
  constraint supplier_invoice_line_allocations_ai_confidence_range_check
    check (ai_confidence_score is null or (ai_confidence_score >= 0 and ai_confidence_score <= 1)),
  constraint supplier_invoice_line_allocations_approval_checks_object_check
    check (jsonb_typeof(approval_checks_json) = 'object'),
  constraint supplier_invoice_line_allocations_ai_metadata_object_check
    check (jsonb_typeof(ai_suggestion_metadata_json) = 'object')
);

create unique index if not exists supplier_invoice_line_allocations_line_po_sequence_uidx
  on public.supplier_invoice_line_allocations (supplier_invoice_line_id, purchase_order_line_item_id, allocation_sequence);

create index if not exists supplier_invoice_line_allocations_invoice_idx
  on public.supplier_invoice_line_allocations (supplier_invoice_id, created_at desc);

create index if not exists supplier_invoice_line_allocations_invoice_line_idx
  on public.supplier_invoice_line_allocations (supplier_invoice_line_id, created_at desc);

create index if not exists supplier_invoice_line_allocations_po_line_idx
  on public.supplier_invoice_line_allocations (purchase_order_line_item_id, created_at desc)
  where purchase_order_line_item_id is not null;

create index if not exists supplier_invoice_line_allocations_project_idx
  on public.supplier_invoice_line_allocations (organization_id, project_id, created_at desc)
  where project_id is not null;

create index if not exists supplier_invoice_line_allocations_cost_item_idx
  on public.supplier_invoice_line_allocations (cost_item_id)
  where cost_item_id is not null;

create index if not exists supplier_invoice_line_allocations_source_cost_item_idx
  on public.supplier_invoice_line_allocations (source_cost_item_id)
  where source_cost_item_id is not null;

create index if not exists supplier_invoice_line_allocations_org_cost_code_idx
  on public.supplier_invoice_line_allocations (organization_cost_code_id)
  where organization_cost_code_id is not null;

create index if not exists supplier_invoice_line_allocations_review_idx
  on public.supplier_invoice_line_allocations (organization_id, review_status, approval_status, created_at desc);

drop trigger if exists set_supplier_invoice_line_allocations_updated_at
  on public.supplier_invoice_line_allocations;
create trigger set_supplier_invoice_line_allocations_updated_at
before update on public.supplier_invoice_line_allocations
for each row execute function public.set_updated_at();

create or replace function public.prepare_supplier_invoice_line_allocation_review_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.approval_notes := coalesce(new.approval_notes, '');
  new.approval_checks_json := coalesce(new.approval_checks_json, '{}'::jsonb);
  new.ai_suggestion_metadata_json := coalesce(new.ai_suggestion_metadata_json, '{}'::jsonb);

  if new.review_status in ('reviewed', 'needs_cost_review', 'needs_accounting_review', 'disputed')
    and not public.has_org_permission(new.organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to review supplier invoice line allocations.';
  end if;

  if new.approval_status in ('approved', 'disputed')
    and not public.has_org_permission(new.organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to approve supplier invoice line allocations.';
  end if;

  if new.approval_status = 'pending' then
    new.approved_by_user_id := null;
    new.approved_at := null;
  elsif new.approved_at is null then
    new.approved_at := now();
  end if;

  if new.review_status = 'pending' then
    new.reviewed_by_user_id := null;
    new.reviewed_at := null;
  elsif new.reviewed_at is null then
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_supplier_invoice_line_allocation_review_transition
  on public.supplier_invoice_line_allocations;
create trigger prepare_supplier_invoice_line_allocation_review_transition
before insert or update on public.supplier_invoice_line_allocations
for each row execute function public.prepare_supplier_invoice_line_allocation_review_transition();

create table if not exists public.project_actual_cost_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid null references public.supplier_invoices (id) on delete set null,
  supplier_invoice_line_id uuid null references public.supplier_invoice_lines (id) on delete set null,
  supplier_invoice_line_allocation_id uuid null references public.supplier_invoice_line_allocations (id) on delete set null,
  purchase_order_id uuid null references public.project_purchase_orders (id) on delete set null,
  purchase_order_line_item_id uuid null references public.project_purchase_order_line_items (id) on delete set null,
  project_id uuid not null references public.organization_projects (id) on delete cascade,
  supplier_id uuid null references public.organization_suppliers (id) on delete set null,
  cost_item_id uuid null references public.cost_items (id) on delete set null,
  source_cost_item_id uuid null references public.cost_items (id) on delete set null,
  work_type text null,
  cost_type text null,
  internal_cost_code text null,
  organization_cost_code_id uuid null references public.organization_cost_codes (id) on delete set null,
  amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  quantity numeric(14,3) null,
  event_date date not null,
  event_status text not null default 'posted',
  posting_source text not null default 'supplier_invoice_allocation',
  source_invoice_line_id uuid null references public.supplier_invoice_lines (id) on delete set null,
  source_invoice_allocation_id uuid null references public.supplier_invoice_line_allocations (id) on delete set null,
  source_type text not null default 'supplier_invoice',
  source_reference text not null default '',
  created_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_actual_cost_events_amount_check
    check (amount >= 0),
  constraint project_actual_cost_events_tax_amount_check
    check (tax_amount >= 0),
  constraint project_actual_cost_events_total_amount_check
    check (total_amount >= 0),
  constraint project_actual_cost_events_quantity_check
    check (quantity is null or quantity >= 0),
  constraint project_actual_cost_events_event_status_check
    check (event_status in ('pending', 'posted', 'reversed')),
  constraint project_actual_cost_events_posting_source_check
    check (posting_source in ('supplier_invoice_allocation', 'manual_adjustment', 'system')),
  constraint project_actual_cost_events_source_type_check
    check (source_type in ('supplier_invoice', 'manual_adjustment', 'system'))
);

create unique index if not exists project_actual_cost_events_allocation_uidx
  on public.project_actual_cost_events (supplier_invoice_line_allocation_id)
  where supplier_invoice_line_allocation_id is not null;

create index if not exists project_actual_cost_events_project_event_date_idx
  on public.project_actual_cost_events (organization_id, project_id, event_date desc);

create index if not exists project_actual_cost_events_cost_item_idx
  on public.project_actual_cost_events (cost_item_id)
  where cost_item_id is not null;

create index if not exists project_actual_cost_events_source_cost_item_idx
  on public.project_actual_cost_events (source_cost_item_id)
  where source_cost_item_id is not null;

create index if not exists project_actual_cost_events_supplier_idx
  on public.project_actual_cost_events (supplier_id, event_date desc)
  where supplier_id is not null;

create index if not exists project_actual_cost_events_org_cost_code_idx
  on public.project_actual_cost_events (organization_cost_code_id)
  where organization_cost_code_id is not null;

create index if not exists project_actual_cost_events_invoice_idx
  on public.project_actual_cost_events (supplier_invoice_id, created_at desc)
  where supplier_invoice_id is not null;

create table if not exists public.supplier_invoice_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  supplier_invoice_line_id uuid not null references public.supplier_invoice_lines (id) on delete cascade,
  supplier_invoice_line_allocation_id uuid null references public.supplier_invoice_line_allocations (id) on delete set null,
  suggestion_type text not null,
  provider text null,
  model text null,
  prompt_version text null,
  input_fingerprint text null,
  output_json jsonb not null default '{}'::jsonb,
  confidence_score numeric null,
  reasoning_summary text null,
  accepted_by_user_id uuid null references auth.users (id) on delete set null,
  accepted_at timestamptz null,
  rejected_by_user_id uuid null references auth.users (id) on delete set null,
  rejected_at timestamptz null,
  final_outcome_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint supplier_invoice_ai_suggestions_type_check
    check (suggestion_type in ('po_line_match', 'cost_item_match', 'classification', 'accounting_code', 'duplicate_invoice', 'overbilling_flag', 'variance_explanation')),
  constraint supplier_invoice_ai_suggestions_confidence_range_check
    check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  constraint supplier_invoice_ai_suggestions_output_object_check
    check (jsonb_typeof(output_json) = 'object'),
  constraint supplier_invoice_ai_suggestions_final_outcome_object_check
    check (jsonb_typeof(final_outcome_json) = 'object')
);

create index if not exists supplier_invoice_ai_suggestions_invoice_line_idx
  on public.supplier_invoice_ai_suggestions (supplier_invoice_line_id, created_at desc);

create index if not exists supplier_invoice_ai_suggestions_invoice_idx
  on public.supplier_invoice_ai_suggestions (supplier_invoice_id, created_at desc);

create index if not exists supplier_invoice_ai_suggestions_allocation_idx
  on public.supplier_invoice_ai_suggestions (supplier_invoice_line_allocation_id, created_at desc)
  where supplier_invoice_line_allocation_id is not null;

create index if not exists supplier_invoice_ai_suggestions_type_idx
  on public.supplier_invoice_ai_suggestions (organization_id, suggestion_type, created_at desc);

alter table public.supplier_invoice_line_allocations enable row level security;
alter table public.supplier_invoice_line_allocations force row level security;
alter table public.project_actual_cost_events enable row level security;
alter table public.project_actual_cost_events force row level security;
alter table public.supplier_invoice_ai_suggestions enable row level security;
alter table public.supplier_invoice_ai_suggestions force row level security;

drop policy if exists "Privileged members can view supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;
create policy "Privileged members can view supplier invoice line allocations"
on public.supplier_invoice_line_allocations
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged members can create supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;
create policy "Privileged members can create supplier invoice line allocations"
on public.supplier_invoice_line_allocations
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can update supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;
create policy "Privileged members can update supplier invoice line allocations"
on public.supplier_invoice_line_allocations
for update
to authenticated
using (
  public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.write')
)
with check (
  public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can delete supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;
create policy "Privileged members can delete supplier invoice line allocations"
on public.supplier_invoice_line_allocations
for delete
to authenticated
using (
  public.has_org_permission(supplier_invoice_line_allocations.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can view project actual cost events"
  on public.project_actual_cost_events;
create policy "Privileged members can view project actual cost events"
on public.project_actual_cost_events
for select
to authenticated
using (
  public.has_org_permission(project_actual_cost_events.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged reviewers can create project actual cost events"
  on public.project_actual_cost_events;
create policy "Privileged reviewers can create project actual cost events"
on public.project_actual_cost_events
for insert
to authenticated
with check (
  public.has_org_permission(project_actual_cost_events.organization_id, 'supplier_invoices.review')
);

drop policy if exists "Privileged members can view supplier invoice ai suggestions"
  on public.supplier_invoice_ai_suggestions;
create policy "Privileged members can view supplier invoice ai suggestions"
on public.supplier_invoice_ai_suggestions
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_ai_suggestions.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged members can create supplier invoice ai suggestions"
  on public.supplier_invoice_ai_suggestions;
create policy "Privileged members can create supplier invoice ai suggestions"
on public.supplier_invoice_ai_suggestions
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_ai_suggestions.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can update supplier invoice ai suggestions"
  on public.supplier_invoice_ai_suggestions;
create policy "Privileged members can update supplier invoice ai suggestions"
on public.supplier_invoice_ai_suggestions
for update
to authenticated
using (
  public.has_org_permission(supplier_invoice_ai_suggestions.organization_id, 'supplier_invoices.write')
)
with check (
  public.has_org_permission(supplier_invoice_ai_suggestions.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can delete supplier invoice ai suggestions"
  on public.supplier_invoice_ai_suggestions;
create policy "Privileged members can delete supplier invoice ai suggestions"
on public.supplier_invoice_ai_suggestions
for delete
to authenticated
using (
  public.has_org_permission(supplier_invoice_ai_suggestions.organization_id, 'supplier_invoices.write')
);

grant select, insert, update, delete on public.supplier_invoice_line_allocations to authenticated;
grant select, insert on public.project_actual_cost_events to authenticated;
grant select, insert, update, delete on public.supplier_invoice_ai_suggestions to authenticated;

commit;
