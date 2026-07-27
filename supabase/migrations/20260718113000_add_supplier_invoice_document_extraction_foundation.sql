begin;

alter table public.supplier_invoice_documents
  add column if not exists is_current boolean not null default true,
  add column if not exists superseded_at timestamptz null,
  add column if not exists superseded_by_document_id uuid null references public.supplier_invoice_documents (id) on delete set null;

with ranked_documents as (
  select
    d.id,
    row_number() over (
      partition by d.supplier_invoice_id
      order by
        case
          when i.document_file_path is not null and d.file_path = i.document_file_path then 0
          else 1
        end,
        d.created_at desc,
        d.id desc
    ) as row_rank
  from public.supplier_invoice_documents d
  left join public.supplier_invoices i
    on i.id = d.supplier_invoice_id
)
update public.supplier_invoice_documents d
set
  is_current = ranked_documents.row_rank = 1,
  superseded_at = case
    when ranked_documents.row_rank = 1 then null
    else coalesce(d.superseded_at, d.created_at)
  end
from ranked_documents
where ranked_documents.id = d.id;

create unique index if not exists supplier_invoice_documents_one_current_idx
  on public.supplier_invoice_documents (supplier_invoice_id)
  where is_current = true;

create index if not exists supplier_invoice_documents_current_lookup_idx
  on public.supplier_invoice_documents (organization_id, supplier_invoice_id, is_current, created_at desc);

create table if not exists public.supplier_invoice_document_extractions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  supplier_invoice_document_id uuid not null references public.supplier_invoice_documents (id) on delete cascade,
  status text not null default 'queued',
  requested_by uuid null references auth.users (id) on delete set null,
  schema_version text not null default 'supplier-invoice-extraction-v1',
  idempotency_key text not null,
  provider text null,
  model text null,
  attempt_number integer not null default 1,
  extracted_payload_json jsonb null,
  warnings_json jsonb not null default '[]'::jsonb,
  error_code text null,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_document_extractions_status_check
    check (status in ('queued', 'processing', 'completed', 'failed')),
  constraint supplier_invoice_document_extractions_idempotency_key_not_blank
    check (char_length(trim(idempotency_key)) > 0),
  constraint supplier_invoice_document_extractions_schema_version_not_blank
    check (char_length(trim(schema_version)) > 0),
  constraint supplier_invoice_document_extractions_attempt_number_check
    check (attempt_number >= 1),
  constraint supplier_invoice_document_extractions_payload_object_check
    check (
      extracted_payload_json is null
      or jsonb_typeof(extracted_payload_json) = 'object'
    ),
  constraint supplier_invoice_document_extractions_warnings_array_check
    check (jsonb_typeof(warnings_json) = 'array')
);

create index if not exists supplier_invoice_document_extractions_invoice_idx
  on public.supplier_invoice_document_extractions (supplier_invoice_id, created_at desc);

create index if not exists supplier_invoice_document_extractions_document_idx
  on public.supplier_invoice_document_extractions (supplier_invoice_document_id, created_at desc);

create index if not exists supplier_invoice_document_extractions_status_idx
  on public.supplier_invoice_document_extractions (organization_id, status, created_at desc);

create unique index if not exists supplier_invoice_document_extractions_document_idempotency_idx
  on public.supplier_invoice_document_extractions (supplier_invoice_document_id, idempotency_key);

create unique index if not exists supplier_invoice_document_extractions_one_active_idx
  on public.supplier_invoice_document_extractions (supplier_invoice_document_id)
  where status in ('queued', 'processing');

drop trigger if exists set_supplier_invoice_document_extractions_updated_at on public.supplier_invoice_document_extractions;
create trigger set_supplier_invoice_document_extractions_updated_at
before update on public.supplier_invoice_document_extractions
for each row execute function public.set_updated_at();

alter table public.supplier_invoice_document_extractions enable row level security;
alter table public.supplier_invoice_document_extractions force row level security;

drop policy if exists "Privileged members can view supplier invoice document extractions" on public.supplier_invoice_document_extractions;
create policy "Privileged members can view supplier invoice document extractions"
on public.supplier_invoice_document_extractions
for select
to authenticated
using (
  public.has_org_permission(supplier_invoice_document_extractions.organization_id, 'supplier_invoices.view')
);

drop policy if exists "Privileged members can create supplier invoice document extractions" on public.supplier_invoice_document_extractions;
create policy "Privileged members can create supplier invoice document extractions"
on public.supplier_invoice_document_extractions
for insert
to authenticated
with check (
  public.has_org_permission(supplier_invoice_document_extractions.organization_id, 'supplier_invoices.write')
);

drop policy if exists "Privileged members can update supplier invoice document extractions" on public.supplier_invoice_document_extractions;
create policy "Privileged members can update supplier invoice document extractions"
on public.supplier_invoice_document_extractions
for update
to authenticated
using (
  public.has_org_permission(supplier_invoice_document_extractions.organization_id, 'supplier_invoices.write')
)
with check (
  public.has_org_permission(supplier_invoice_document_extractions.organization_id, 'supplier_invoices.write')
);

grant select, insert, update on public.supplier_invoice_document_extractions to authenticated;

commit;
