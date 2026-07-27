begin;

alter table public.organization_accounting_sync_jobs
  drop constraint if exists organization_accounting_sync_jobs_job_kind_check;

alter table public.organization_accounting_sync_jobs
  add constraint organization_accounting_sync_jobs_job_kind_check check (
    job_kind in (
      'import_accounts',
      'import_tax_rates',
      'import_contacts',
      'health_check',
      'xero.bill.export',
      'xero.bill.refresh'
    )
  );

alter table public.organization_accounting_sync_jobs
  drop constraint if exists organization_accounting_sync_jobs_trigger_source_check;

alter table public.organization_accounting_sync_jobs
  add constraint organization_accounting_sync_jobs_trigger_source_check check (
    trigger_source in (
      'oauth_callback',
      'tenant_selection',
      'manual_refresh',
      'scheduled',
      'health_poll',
      'user_export',
      'user_retry'
    )
  );

drop index if exists public.organization_accounting_sync_jobs_active_scope_uidx;

create unique index organization_accounting_sync_jobs_active_reference_scope_uidx
  on public.organization_accounting_sync_jobs (organization_id, provider, job_kind)
  where queue_state in ('pending', 'claimed', 'retry_scheduled')
    and job_kind in ('import_accounts', 'import_tax_rates', 'import_contacts', 'health_check');

create unique index organization_accounting_sync_jobs_active_document_scope_uidx
  on public.organization_accounting_sync_jobs (
    organization_id,
    provider,
    job_kind,
    connection_id,
    (request_payload ->> 'documentVersionId')
  )
  where queue_state in ('pending', 'claimed', 'retry_scheduled')
    and job_kind in ('xero.bill.export', 'xero.bill.refresh');

create table public.organization_accounting_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  accounting_connection_id uuid not null references public.organization_xero_connections (id) on delete restrict,
  provider text not null,
  tenant_id text not null,
  local_document_type text not null,
  local_document_id uuid not null references public.supplier_invoices (id) on delete restrict,
  current_version_id uuid null,
  external_document_id text null,
  external_document_number text null,
  raw_external_status text null,
  normalized_external_status text null,
  export_status text not null default 'not_ready',
  amount_exported numeric(14,2) null,
  tax_exported numeric(14,2) null,
  currency_code text null,
  exported_by uuid null references auth.users (id) on delete set null,
  exported_at timestamptz null,
  last_synced_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_accounting_documents_provider_check check (provider = 'xero'),
  constraint organization_accounting_documents_type_check check (local_document_type = 'supplier_invoice'),
  constraint organization_accounting_documents_tenant_not_blank check (char_length(trim(tenant_id)) > 0),
  constraint organization_accounting_documents_export_status_check check (
    export_status in (
      'not_ready', 'queued', 'exporting', 'exported', 'failed',
      'attention_required', 'cancelled'
    )
  ),
  constraint organization_accounting_documents_external_identity_check check (
    external_document_id is null or char_length(trim(external_document_id)) > 0
  ),
  constraint organization_accounting_documents_unique_local
    unique (organization_id, provider, tenant_id, local_document_type, local_document_id)
);

create index organization_accounting_documents_org_status_idx
  on public.organization_accounting_documents (organization_id, export_status, updated_at desc);

create unique index organization_accounting_documents_unique_external_uidx
  on public.organization_accounting_documents (provider, tenant_id, external_document_id)
  where external_document_id is not null;

create table public.organization_accounting_document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.organization_accounting_documents (id) on delete restrict,
  commercial_approval_id uuid not null
    references public.supplier_invoice_commercial_approvals (id) on delete restrict,
  finance_hash text not null,
  content_hash text not null,
  idempotency_key text not null,
  requested_external_status text not null default 'DRAFT',
  contact_id_snapshot text not null,
  contact_name_snapshot text not null,
  supplier_link_id uuid not null references public.organization_external_contacts (id) on delete restrict,
  connection_id_snapshot uuid not null references public.organization_xero_connections (id) on delete restrict,
  tenant_id_snapshot text not null,
  invoice_number_snapshot text not null,
  invoice_date_snapshot date not null,
  due_date_snapshot date not null,
  currency_code_snapshot text not null,
  subtotal_snapshot numeric(14,2) not null,
  tax_total_snapshot numeric(14,2) not null,
  total_snapshot numeric(14,2) not null,
  line_amount_type_snapshot text not null,
  po_numbers_snapshot text[] not null default '{}'::text[],
  readiness_snapshot jsonb not null,
  status text not null default 'prepared',
  request_started_at timestamptz null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint organization_accounting_document_versions_hash_not_blank check (
    char_length(trim(finance_hash)) > 0 and char_length(trim(content_hash)) > 0
  ),
  constraint organization_accounting_document_versions_idempotency_not_blank
    check (char_length(trim(idempotency_key)) > 0),
  constraint organization_accounting_document_versions_requested_status_check
    check (requested_external_status = 'DRAFT'),
  constraint organization_accounting_document_versions_currency_check
    check (currency_code_snapshot = 'NZD'),
  constraint organization_accounting_document_versions_line_amount_type_check
    check (line_amount_type_snapshot in ('Exclusive', 'Inclusive', 'NoTax')),
  constraint organization_accounting_document_versions_readiness_object_check
    check (jsonb_typeof(readiness_snapshot) = 'object'),
  constraint organization_accounting_document_versions_status_check check (
    status in (
      'prepared', 'queued', 'exporting', 'exported', 'failed',
      'attention_required', 'cancelled'
    )
  ),
  constraint organization_accounting_document_versions_unique_approval
    unique (commercial_approval_id),
  constraint organization_accounting_document_versions_unique_hash
    unique (document_id, finance_hash),
  constraint organization_accounting_document_versions_unique_idempotency
    unique (idempotency_key)
);

alter table public.organization_accounting_documents
  add constraint organization_accounting_documents_current_version_fkey
  foreign key (current_version_id)
  references public.organization_accounting_document_versions (id)
  on delete restrict;

create index organization_accounting_document_versions_document_created_idx
  on public.organization_accounting_document_versions (document_id, created_at desc);

create table public.organization_accounting_document_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version_id uuid not null references public.organization_accounting_document_versions (id) on delete restrict,
  commercial_line_snapshot_id uuid not null
    references public.supplier_invoice_commercial_line_snapshots (id) on delete restrict,
  source_invoice_line_id uuid null references public.supplier_invoice_lines (id) on delete set null,
  source_allocation_id uuid null references public.supplier_invoice_line_allocations (id) on delete set null,
  sequence integer not null,
  description text not null,
  quantity numeric(14,3) not null,
  unit_amount numeric(14,4) not null,
  line_amount numeric(14,2) not null,
  tax_amount numeric(14,2) not null,
  gross_amount numeric(14,2) not null,
  routing_code integer not null references public.tradesstack_financial_routing_codes (code),
  accounting_mapping_id uuid not null
    references public.organization_tradesstack_accounting_mappings (id) on delete restrict,
  organization_cost_code_id uuid not null references public.organization_cost_codes (id) on delete restrict,
  xero_account_id text not null,
  xero_account_code text not null,
  xero_tax_type text not null,
  project_id uuid null references public.organization_projects (id) on delete restrict,
  purchase_order_id uuid null references public.project_purchase_orders (id) on delete restrict,
  purchase_order_line_item_id uuid null
    references public.project_purchase_order_line_items (id) on delete restrict,
  purchase_order_number_snapshot text null,
  created_at timestamptz not null default now(),
  constraint organization_accounting_document_lines_sequence_check check (sequence > 0),
  constraint organization_accounting_document_lines_quantity_check check (quantity >= 0),
  constraint organization_accounting_document_lines_amount_check check (
    line_amount >= 0 and tax_amount >= 0 and gross_amount >= 0
  ),
  constraint organization_accounting_document_lines_description_not_blank
    check (char_length(trim(description)) > 0),
  constraint organization_accounting_document_lines_external_values_not_blank check (
    char_length(trim(xero_account_id)) > 0
    and char_length(trim(xero_account_code)) > 0
    and char_length(trim(xero_tax_type)) > 0
  ),
  constraint organization_accounting_document_lines_unique_sequence unique (version_id, sequence),
  constraint organization_accounting_document_lines_unique_source
    unique (version_id, commercial_line_snapshot_id)
);

create index organization_accounting_document_lines_version_idx
  on public.organization_accounting_document_lines (version_id, sequence);

drop trigger if exists set_organization_accounting_documents_updated_at
  on public.organization_accounting_documents;
create trigger set_organization_accounting_documents_updated_at
before update on public.organization_accounting_documents
for each row execute function public.set_updated_at();

create or replace function public.guard_immutable_accounting_version_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Accounting export snapshots are immutable.';
  end if;
  if (to_jsonb(new) - array['status', 'request_started_at'])
    is distinct from
    (to_jsonb(old) - array['status', 'request_started_at']) then
    raise exception 'Accounting export snapshot content is immutable.';
  end if;
  return new;
end;
$$;

create or replace function public.reject_immutable_accounting_snapshot_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Accounting export snapshots are immutable.';
end;
$$;

create trigger reject_accounting_document_version_update
before update or delete on public.organization_accounting_document_versions
for each row execute function public.guard_immutable_accounting_version_change();

create trigger reject_accounting_document_line_update
before update or delete on public.organization_accounting_document_lines
for each row execute function public.reject_immutable_accounting_snapshot_change();

alter table public.organization_accounting_documents enable row level security;
alter table public.organization_accounting_documents force row level security;
alter table public.organization_accounting_document_versions enable row level security;
alter table public.organization_accounting_document_versions force row level security;
alter table public.organization_accounting_document_lines enable row level security;
alter table public.organization_accounting_document_lines force row level security;

create policy "AP bill viewers can view organization accounting documents"
on public.organization_accounting_documents
for select to authenticated
using (
  public.has_org_permission(
    organization_accounting_documents.organization_id,
    'accounting.ap_bills.view'
  )
  and exists (
    select 1
    from public.supplier_invoices invoice
    where invoice.id = organization_accounting_documents.local_document_id
      and invoice.organization_id = organization_accounting_documents.organization_id
  )
);

create policy "AP bill viewers can view organization accounting versions"
on public.organization_accounting_document_versions
for select to authenticated
using (public.has_org_permission(organization_id, 'accounting.ap_bills.view'));

create policy "AP bill viewers can view organization accounting lines"
on public.organization_accounting_document_lines
for select to authenticated
using (public.has_org_permission(organization_id, 'accounting.ap_bills.view'));

revoke insert, update, delete on public.organization_accounting_documents from authenticated;
revoke insert, update, delete on public.organization_accounting_document_versions from authenticated;
revoke insert, update, delete on public.organization_accounting_document_lines from authenticated;
revoke insert, update, delete on public.organization_accounting_sync_jobs from authenticated;
grant select on public.organization_accounting_documents to authenticated;
grant select on public.organization_accounting_document_versions to authenticated;
grant select on public.organization_accounting_document_lines to authenticated;
grant select, insert, update, delete on public.organization_accounting_documents to service_role;
grant select, insert, update, delete on public.organization_accounting_document_versions to service_role;
grant select, insert, update, delete on public.organization_accounting_document_lines to service_role;

insert into public.app_permissions (permission_key, description)
values
  ('accounting.ap_bills.view', 'View Supplier Invoice Xero Bill export state'),
  ('accounting.ap_bills.export', 'Queue approved Supplier Invoices as Draft Xero Bills'),
  ('accounting.ap_bills.retry', 'Retry failed Draft Xero Bill exports')
on conflict (permission_key) do update set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'accounting.ap_bills.view', true),
  ('owner', 'accounting.ap_bills.export', true),
  ('owner', 'accounting.ap_bills.retry', true),
  ('admin', 'accounting.ap_bills.view', true),
  ('admin', 'accounting.ap_bills.export', true),
  ('admin', 'accounting.ap_bills.retry', true),
  ('qs', 'accounting.ap_bills.view', true),
  ('qs', 'accounting.ap_bills.export', false),
  ('qs', 'accounting.ap_bills.retry', false),
  ('project_manager', 'accounting.ap_bills.view', true),
  ('project_manager', 'accounting.ap_bills.export', false),
  ('project_manager', 'accounting.ap_bills.retry', false),
  ('worker', 'accounting.ap_bills.view', false),
  ('worker', 'accounting.ap_bills.export', false),
  ('worker', 'accounting.ap_bills.retry', false)
on conflict (role, permission_key) do update
set is_allowed = excluded.is_allowed, updated_at = now();

create or replace function public.prepare_supplier_invoice_xero_bill_export(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_approval public.supplier_invoice_commercial_approvals%rowtype;
  v_connection public.organization_xero_connections%rowtype;
  v_link public.organization_external_contacts%rowtype;
  v_contact public.organization_xero_contacts%rowtype;
  v_document_id uuid;
  v_version_id uuid;
  v_job_id uuid;
  v_finance_hash text;
  v_content_hash text;
  v_idempotency_key text;
  v_line_count integer;
  v_line_net numeric(14,2);
  v_line_tax numeric(14,2);
  v_po_numbers text[];
  v_line_amount_type text;
  v_existing_status text;
  v_document_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if not public.has_org_permission(p_organization_id, 'accounting.ap_bills.export') then
    raise exception 'You do not have permission to export Supplier Invoices to Xero.';
  end if;

  select * into v_invoice
  from public.supplier_invoices
  where id = p_supplier_invoice_id
    and organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Supplier invoice not found.';
  end if;

  select * into v_approval
  from public.supplier_invoice_commercial_approvals
  where supplier_invoice_id = v_invoice.id
    and organization_id = p_organization_id
    and status = 'approved'
  for update;
  if not found then
    raise exception 'An active commercial approval is required before Xero export.';
  end if;

  v_finance_hash := public.supplier_invoice_finance_version_hash(v_invoice.id);
  if v_finance_hash is null or v_finance_hash <> v_approval.finance_version_hash then
    raise exception 'The commercial approval no longer matches the current invoice finance version.';
  end if;
  if v_invoice.supplier_id is null then
    raise exception 'Select a supplier before Xero export.';
  end if;
  if char_length(trim(v_invoice.invoice_number)) = 0 then
    raise exception 'Enter an invoice number before Xero export.';
  end if;
  if v_invoice.invoice_date is null or v_invoice.due_date is null then
    raise exception 'Invoice and due dates are required before Xero export.';
  end if;
  if upper(trim(v_invoice.currency)) <> 'NZD' then
    raise exception 'Phase 3A supports NZD Supplier Invoices only.';
  end if;
  if abs((v_invoice.subtotal + v_invoice.tax_total) - v_invoice.total) > 0.01 then
    raise exception 'Invoice totals do not reconcile for Xero export.';
  end if;

  select * into v_connection
  from public.organization_xero_connections
  where organization_id = p_organization_id
    and status = 'connected'
    and tenant_id is not null
  for update;
  if not found
    or v_connection.last_health_status is distinct from 'healthy' then
    raise exception 'A healthy Xero connection is required before export.';
  end if;
  if not ('accounting.transactions' = any(v_connection.scope)) then
    raise exception 'Reconnect Xero to grant accounting.transactions before exporting Bills.';
  end if;

  select * into v_link
  from public.organization_external_contacts
  where organization_id = p_organization_id
    and accounting_connection_id = v_connection.id
    and provider = 'xero'
    and local_entity_type = 'supplier'
    and local_entity_id = v_invoice.supplier_id
    and tenant_id = v_connection.tenant_id
    and link_status = 'linked';
  if not found then
    raise exception 'The Supplier must be linked to an active Xero Contact before export.';
  end if;

  select * into v_contact
  from public.organization_xero_contacts
  where organization_id = p_organization_id
    and connection_id = v_connection.id
    and tenant_id = v_connection.tenant_id
    and contact_id = v_link.external_contact_id
    and coalesce(contact_status, 'ACTIVE') = 'ACTIVE';
  if not found then
    raise exception 'The linked Xero Contact is missing, archived, or belongs to another tenant.';
  end if;

  select
    count(*),
    coalesce(sum(snapshot.amount), 0),
    coalesce(sum(snapshot.tax_amount), 0),
    array_agg(distinct po.purchase_order_number order by po.purchase_order_number)
      filter (where po.purchase_order_number is not null)
  into v_line_count, v_line_net, v_line_tax, v_po_numbers
  from public.supplier_invoice_commercial_line_snapshots snapshot
  join public.organization_tradesstack_accounting_mappings mapping
    on mapping.id = snapshot.accounting_mapping_id
    and mapping.organization_id = p_organization_id
    and mapping.is_active = true
  join public.organization_cost_codes cost_code
    on cost_code.id = mapping.organization_cost_code_id
    and cost_code.organization_id = p_organization_id
    and cost_code.is_active = true
    and cost_code.external_provider = 'xero'
    and nullif(trim(cost_code.metadata ->> 'accountId'), '') is not null
    and nullif(trim(cost_code.external_code), '') is not null
    and coalesce(cost_code.metadata ->> 'tenantId', v_connection.tenant_id) = v_connection.tenant_id
  left join public.organization_accounting_tax_rates tax_rate
    on tax_rate.id = snapshot.accounting_tax_rate_id
    and tax_rate.organization_id = p_organization_id
    and tax_rate.provider = 'xero'
    and tax_rate.is_active = true
  left join public.project_purchase_orders po on po.id = snapshot.purchase_order_id
  where snapshot.organization_id = p_organization_id
    and snapshot.commercial_approval_id = v_approval.id
    and (
      (snapshot.tax_resolution_status = 'not_applicable' and snapshot.accounting_tax_rate_id is null)
      or (
        snapshot.tax_resolution_status = 'resolved'
        and tax_rate.id is not null
        and nullif(trim(tax_rate.tax_type), '') is not null
      )
    );

  if v_line_count = 0 then
    raise exception 'The commercial approval has no Xero-ready line snapshots.';
  end if;
  if v_line_count <> (
    select count(*)
    from public.supplier_invoice_commercial_line_snapshots
    where commercial_approval_id = v_approval.id
  ) then
    raise exception 'Every approved commercial line requires an active Xero AccountID, AccountCode, and TaxType.';
  end if;
  if abs(v_line_net - v_invoice.subtotal) > 0.01
    or abs(v_line_tax - v_invoice.tax_total) > 0.01 then
    raise exception 'The approved commercial lines do not reconcile to the invoice totals.';
  end if;

  v_line_amount_type := case
    when v_invoice.tax_total <= 0.01 then 'NoTax'
    else 'Exclusive'
  end;
  v_po_numbers := coalesce(v_po_numbers, '{}'::text[]);
  v_idempotency_key := encode(
    extensions.digest(
      concat_ws(
        ':',
        p_organization_id::text,
        v_connection.id::text,
        v_connection.tenant_id,
        v_invoice.id::text,
        v_approval.id::text
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.organization_accounting_documents (
    organization_id,
    accounting_connection_id,
    provider,
    tenant_id,
    local_document_type,
    local_document_id,
    export_status,
    currency_code
  )
  values (
    p_organization_id,
    v_connection.id,
    'xero',
    v_connection.tenant_id,
    'supplier_invoice',
    v_invoice.id,
    'not_ready',
    'NZD'
  )
  on conflict (organization_id, provider, tenant_id, local_document_type, local_document_id)
  do update set accounting_connection_id = excluded.accounting_connection_id
  returning id, export_status into v_document_id, v_document_status;

  if v_document_status in ('queued', 'exporting', 'exported', 'attention_required') then
    raise exception 'This Supplier Invoice already has an active, exported, or uncertain Xero Bill operation.';
  end if;

  select id, status into v_version_id, v_existing_status
  from public.organization_accounting_document_versions
  where commercial_approval_id = v_approval.id;

  if v_version_id is null then
    v_content_hash := encode(
      extensions.digest(
        concat_ws(
          '|',
          v_finance_hash,
          v_link.external_contact_id,
          v_connection.id::text,
          v_connection.tenant_id,
          v_invoice.invoice_number,
          v_invoice.invoice_date::text,
          v_invoice.due_date::text,
          v_invoice.currency,
          v_invoice.subtotal::text,
          v_invoice.tax_total::text,
          v_invoice.total::text,
          array_to_string(v_po_numbers, ','),
          coalesce((
            select string_agg(
              concat_ws(
                ':',
                snapshot.id::text,
                snapshot.description,
                snapshot.quantity::text,
                snapshot.unit_rate::text,
                snapshot.amount::text,
                snapshot.tax_amount::text,
                mapping.tradesstack_cost_code::text,
                cost_code.metadata ->> 'accountId',
                cost_code.external_code,
                case
                  when snapshot.tax_resolution_status = 'not_applicable' then 'NONE'
                  else tax_rate.tax_type
                end
              ),
              ',' order by invoice_line.sort_order, snapshot.id
            )
            from public.supplier_invoice_commercial_line_snapshots snapshot
            left join public.supplier_invoice_lines invoice_line
              on invoice_line.id = snapshot.supplier_invoice_line_id
            join public.organization_tradesstack_accounting_mappings mapping
              on mapping.id = snapshot.accounting_mapping_id
            join public.organization_cost_codes cost_code
              on cost_code.id = mapping.organization_cost_code_id
            left join public.organization_accounting_tax_rates tax_rate
              on tax_rate.id = snapshot.accounting_tax_rate_id
            where snapshot.commercial_approval_id = v_approval.id
          ), '')
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.organization_accounting_document_versions (
      organization_id,
      document_id,
      commercial_approval_id,
      finance_hash,
      content_hash,
      idempotency_key,
      requested_external_status,
      contact_id_snapshot,
      contact_name_snapshot,
      supplier_link_id,
      connection_id_snapshot,
      tenant_id_snapshot,
      invoice_number_snapshot,
      invoice_date_snapshot,
      due_date_snapshot,
      currency_code_snapshot,
      subtotal_snapshot,
      tax_total_snapshot,
      total_snapshot,
      line_amount_type_snapshot,
      po_numbers_snapshot,
      readiness_snapshot,
      status,
      created_by
    )
    values (
      p_organization_id,
      v_document_id,
      v_approval.id,
      v_finance_hash,
      v_content_hash,
      v_idempotency_key,
      'DRAFT',
      v_link.external_contact_id,
      coalesce(nullif(trim(v_link.external_contact_name), ''), v_contact.name),
      v_link.id,
      v_connection.id,
      v_connection.tenant_id,
      trim(v_invoice.invoice_number),
      v_invoice.invoice_date,
      v_invoice.due_date,
      'NZD',
      v_invoice.subtotal,
      v_invoice.tax_total,
      v_invoice.total,
      v_line_amount_type,
      v_po_numbers,
      jsonb_build_object(
        'ready', true,
        'financeHash', v_finance_hash,
        'commercialApprovalId', v_approval.id,
        'supplierLinkId', v_link.id,
        'connectionId', v_connection.id,
        'tenantId', v_connection.tenant_id,
        'lineCount', v_line_count
      ),
      'prepared',
      auth.uid()
    )
    returning id into v_version_id;

    insert into public.organization_accounting_document_lines (
      organization_id,
      version_id,
      commercial_line_snapshot_id,
      source_invoice_line_id,
      source_allocation_id,
      sequence,
      description,
      quantity,
      unit_amount,
      line_amount,
      tax_amount,
      gross_amount,
      routing_code,
      accounting_mapping_id,
      organization_cost_code_id,
      xero_account_id,
      xero_account_code,
      xero_tax_type,
      project_id,
      purchase_order_id,
      purchase_order_line_item_id,
      purchase_order_number_snapshot
    )
    select
      p_organization_id,
      v_version_id,
      snapshot.id,
      snapshot.supplier_invoice_line_id,
      snapshot.allocation_id,
      row_number() over (order by invoice_line.sort_order, snapshot.id),
      trim(snapshot.description),
      snapshot.quantity,
      snapshot.unit_rate,
      snapshot.amount,
      snapshot.tax_amount,
      snapshot.amount + snapshot.tax_amount,
      mapping.tradesstack_cost_code,
      mapping.id,
      cost_code.id,
      trim(cost_code.metadata ->> 'accountId'),
      trim(cost_code.external_code),
      case
        when snapshot.tax_resolution_status = 'not_applicable' then 'NONE'
        else trim(tax_rate.tax_type)
      end,
      snapshot.project_id,
      snapshot.purchase_order_id,
      snapshot.purchase_order_line_item_id,
      po.purchase_order_number
    from public.supplier_invoice_commercial_line_snapshots snapshot
    left join public.supplier_invoice_lines invoice_line
      on invoice_line.id = snapshot.supplier_invoice_line_id
    join public.organization_tradesstack_accounting_mappings mapping
      on mapping.id = snapshot.accounting_mapping_id
    join public.organization_cost_codes cost_code
      on cost_code.id = mapping.organization_cost_code_id
    left join public.organization_accounting_tax_rates tax_rate
      on tax_rate.id = snapshot.accounting_tax_rate_id
    left join public.project_purchase_orders po on po.id = snapshot.purchase_order_id
    where snapshot.commercial_approval_id = v_approval.id
    order by invoice_line.sort_order, snapshot.id;
  end if;

  select id into v_job_id
  from public.organization_accounting_sync_jobs
  where organization_id = p_organization_id
    and provider = 'xero'
    and connection_id = v_connection.id
    and job_kind = 'xero.bill.export'
    and request_payload ->> 'documentVersionId' = v_version_id::text
    and queue_state in ('pending', 'claimed', 'retry_scheduled')
  order by created_at desc
  limit 1;

  if v_existing_status = 'exported' then
    return jsonb_build_object(
      'documentId', v_document_id,
      'versionId', v_version_id,
      'jobId', v_job_id,
      'status', 'exported',
      'reused', true
    );
  end if;

  if v_job_id is null then
    select id into v_job_id
    from public.organization_accounting_sync_jobs
    where organization_id = p_organization_id
      and provider = 'xero'
      and connection_id = v_connection.id
      and job_kind = 'xero.bill.export'
      and request_payload ->> 'documentVersionId' = v_version_id::text
    order by created_at desc
    limit 1;
    if v_job_id is not null then
      update public.organization_accounting_sync_jobs
      set queue_state = 'pending',
          trigger_source = 'user_retry',
          result_summary = '{}'::jsonb,
          attempt_count = 0,
          available_at = now(),
          retry_after = null,
          claimed_at = null,
          claimed_by = null,
          claim_expires_at = null,
          last_completed_at = null,
          last_error = null,
          created_by_user_id = auth.uid()
      where id = v_job_id
        and queue_state = 'completed'
        and coalesce((result_summary ->> 'cancelled')::boolean, false) = true;
      if not found then
        raise exception 'The prior Xero Bill operation cannot be retried automatically.';
      end if;
    else
      insert into public.organization_accounting_sync_jobs (
        organization_id,
        provider,
        connection_id,
        job_kind,
        trigger_source,
        queue_state,
        request_payload,
        result_summary,
        idempotency_key,
        max_attempts,
        created_by_user_id
      )
      values (
        p_organization_id,
        'xero',
        v_connection.id,
        'xero.bill.export',
        'user_export',
        'pending',
        jsonb_build_object(
          'documentId', v_document_id,
          'documentVersionId', v_version_id,
          'supplierInvoiceId', v_invoice.id
        ),
        '{}'::jsonb,
        'xero.bill.export:' || v_idempotency_key,
        3,
        auth.uid()
      )
      returning id into v_job_id;
    end if;
  end if;

  update public.organization_accounting_documents
  set current_version_id = v_version_id,
      export_status = 'queued',
      last_error_code = null,
      last_error_message = null
  where id = v_document_id;

  update public.organization_accounting_document_versions
  set status = 'queued'
  where id = v_version_id;

  insert into public.supplier_invoice_activity_events (
    organization_id,
    supplier_invoice_id,
    event_type,
    message,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    v_invoice.id,
    'xero_export_queued',
    'Draft Xero Bill export queued.',
    jsonb_build_object(
      'accounting_document_id', v_document_id,
      'accounting_document_version_id', v_version_id,
      'job_id', v_job_id
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'documentId', v_document_id,
    'versionId', v_version_id,
    'jobId', v_job_id,
    'status', 'queued',
    'reused', v_existing_status is not null
  );
end;
$$;

create or replace function public.cancel_supplier_invoice_xero_bill_export(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.organization_accounting_documents%rowtype;
  v_job_id uuid;
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'accounting.ap_bills.export') then
    raise exception 'You do not have permission to cancel this Xero export.';
  end if;

  select * into v_document
  from public.organization_accounting_documents
  where organization_id = p_organization_id
    and local_document_type = 'supplier_invoice'
    and local_document_id = p_supplier_invoice_id
    and export_status = 'queued'
  for update;
  if not found then
    raise exception 'Only a queued Xero export can be cancelled.';
  end if;

  update public.organization_accounting_sync_jobs
  set queue_state = 'completed',
      result_summary = jsonb_build_object('cancelled', true),
      last_completed_at = now(),
      last_error = null
  where organization_id = p_organization_id
    and job_kind = 'xero.bill.export'
    and request_payload ->> 'documentVersionId' = v_document.current_version_id::text
    and queue_state = 'pending'
  returning id into v_job_id;
  if v_job_id is null then
    raise exception 'The Xero export has already been claimed and cannot be cancelled.';
  end if;

  update public.organization_accounting_documents
  set export_status = 'cancelled'
  where id = v_document.id;
  update public.organization_accounting_document_versions
  set status = 'cancelled'
  where id = v_document.current_version_id;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  )
  values (
    p_organization_id,
    p_supplier_invoice_id,
    'xero_export_cancelled',
    'Queued Draft Xero Bill export cancelled.',
    jsonb_build_object('accounting_document_id', v_document.id, 'job_id', v_job_id),
    auth.uid()
  );

  return jsonb_build_object('documentId', v_document.id, 'jobId', v_job_id, 'status', 'cancelled');
end;
$$;

create or replace function public.guard_supplier_invoice_xero_export_edit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  if tg_table_name = 'supplier_invoices' then
    v_invoice_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_invoice_id := case
      when tg_op = 'DELETE' then old.supplier_invoice_id
      else new.supplier_invoice_id
    end;
  end if;

  if exists (
    select 1
    from public.organization_accounting_documents document
    where document.local_document_type = 'supplier_invoice'
      and document.local_document_id = v_invoice_id
      and document.export_status in ('queued', 'exporting', 'exported', 'attention_required')
  ) then
    raise exception 'This Supplier Invoice is locked because its Xero Bill export is queued or complete.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_supplier_invoice_xero_export_edit
before update or delete on public.supplier_invoices
for each row execute function public.guard_supplier_invoice_xero_export_edit();

create trigger guard_supplier_invoice_line_xero_export_edit
before insert or update or delete on public.supplier_invoice_lines
for each row execute function public.guard_supplier_invoice_xero_export_edit();

create trigger guard_supplier_invoice_allocation_xero_export_edit
before insert or update or delete on public.supplier_invoice_line_allocations
for each row execute function public.guard_supplier_invoice_xero_export_edit();

create trigger guard_supplier_invoice_commercial_approval_xero_export_edit
before insert or update or delete on public.supplier_invoice_commercial_approvals
for each row execute function public.guard_supplier_invoice_xero_export_edit();

grant execute on function public.prepare_supplier_invoice_xero_bill_export(uuid, uuid)
  to authenticated;
grant execute on function public.cancel_supplier_invoice_xero_bill_export(uuid, uuid)
  to authenticated;
revoke all on function public.reject_immutable_accounting_snapshot_change() from public;
revoke all on function public.guard_immutable_accounting_version_change() from public;

commit;
