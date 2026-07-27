begin;

alter table public.organizations
  add column if not exists tax_registration_status text not null default 'unknown';

alter table public.organizations
  drop constraint if exists organizations_tax_registration_status_check;
alter table public.organizations
  add constraint organizations_tax_registration_status_check
  check (tax_registration_status in ('registered', 'unregistered', 'unknown'));

update public.organizations organization
set tax_registration_status = 'registered'
where tax_registration_status = 'unknown'
  and nullif(trim(to_jsonb(organization) ->> 'gst_number'), '') is not null;

alter table public.organization_accounting_tax_rates
  add column if not exists accounting_connection_id uuid null
    references public.organization_xero_connections (id) on delete cascade,
  add column if not exists tenant_id text null,
  add column if not exists jurisdiction_code text null,
  add column if not exists can_apply_to_expenses boolean not null default false,
  add column if not exists synced_at timestamptz null;

alter table public.organization_accounting_tax_rates
  drop constraint if exists organization_accounting_tax_rates_jurisdiction_check;
alter table public.organization_accounting_tax_rates
  add constraint organization_accounting_tax_rates_jurisdiction_check
  check (jurisdiction_code is null or jurisdiction_code in ('NZ', 'AU', 'unsupported'));

create index if not exists organization_accounting_tax_rates_current_tenant_idx
  on public.organization_accounting_tax_rates
  (organization_id, accounting_connection_id, tenant_id, jurisdiction_code, is_active)
  where can_apply_to_expenses = true;

alter table public.organization_suppliers
  drop constraint if exists organization_suppliers_default_tax_rate_fkey;
alter table public.organization_suppliers
  add constraint organization_suppliers_default_tax_rate_fkey
  foreign key (default_tax_rate_id)
  references public.organization_accounting_tax_rates (id)
  on delete set null
  not valid;

alter table public.supplier_invoices
  add column if not exists tax_amount_mode text not null default 'unknown',
  add column if not exists tax_evidence_json jsonb not null default '{}'::jsonb;
alter table public.supplier_invoices
  drop constraint if exists supplier_invoices_tax_amount_mode_check;
alter table public.supplier_invoices
  add constraint supplier_invoices_tax_amount_mode_check
  check (tax_amount_mode in ('exclusive', 'inclusive', 'no_tax', 'unknown'));

create or replace function public.normalize_supported_tax_jurisdiction(p_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(regexp_replace(trim(coalesce(p_country, '')), '\s+', ' ', 'g'))
    when 'NZ' then 'NZ'
    when 'NZL' then 'NZ'
    when 'NEW ZEALAND' then 'NZ'
    when 'AU' then 'AU'
    when 'AUS' then 'AU'
    when 'AUSTRALIA' then 'AU'
    else 'unsupported'
  end;
$$;

revoke all on function public.normalize_supported_tax_jurisdiction(text) from public, anon;
grant execute on function public.normalize_supported_tax_jurisdiction(text) to authenticated, service_role;

-- This is a provenance-only schema backfill. Do not invalidate Supplier Invoice
-- workflow state (or trip immutable Xero-export locks) for existing tax-rate rows.
alter table public.organization_accounting_tax_rates
  disable trigger invalidate_role_workflow_from_tax_mapping_change;

update public.organization_accounting_tax_rates rate
set accounting_connection_id = connection.id,
    tenant_id = connection.tenant_id,
    jurisdiction_code = public.normalize_supported_tax_jurisdiction(to_jsonb(organization) ->> 'country'),
    can_apply_to_expenses = coalesce((rate.metadata ->> 'canApplyToExpenses')::boolean, false),
    synced_at = coalesce(rate.updated_at, now())
from public.organization_xero_connections connection,
     public.organizations organization
where rate.organization_id = organization.id
  and connection.organization_id = rate.organization_id
  and connection.status = 'connected'
  and rate.provider = 'xero';

alter table public.organization_accounting_tax_rates
  enable trigger invalidate_role_workflow_from_tax_mapping_change;

create or replace function public.stamp_xero_tax_rate_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.organization_xero_connections%rowtype;
  v_country text;
begin
  if new.provider <> 'xero' then
    raise exception 'Unsupported accounting tax-rate provider.';
  end if;

  select * into v_connection
  from public.organization_xero_connections
  where organization_id = new.organization_id
    and status = 'connected'
    and tenant_id is not null;

  if not found then
    raise exception 'A connected Xero tenant is required before synchronizing tax rates.';
  end if;

  select to_jsonb(organization) ->> 'country' into v_country
  from public.organizations organization where id = new.organization_id;
  new.accounting_connection_id := v_connection.id;
  new.tenant_id := v_connection.tenant_id;
  new.jurisdiction_code := public.normalize_supported_tax_jurisdiction(v_country);
  new.can_apply_to_expenses := coalesce((new.metadata ->> 'canApplyToExpenses')::boolean, false);
  new.is_active := upper(coalesce(new.status, '')) = 'ACTIVE';
  new.synced_at := now();
  return new;
end;
$$;

revoke all on function public.stamp_xero_tax_rate_provenance() from public, anon, authenticated;
grant execute on function public.stamp_xero_tax_rate_provenance() to service_role;

drop trigger if exists stamp_xero_tax_rate_provenance on public.organization_accounting_tax_rates;
create trigger stamp_xero_tax_rate_provenance
before insert or update of provider, status, metadata, accounting_connection_id, tenant_id, jurisdiction_code
on public.organization_accounting_tax_rates
for each row execute function public.stamp_xero_tax_rate_provenance();

create or replace function public.validate_supplier_default_tax_rate_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.default_tax_rate_id is null then return new; end if;
  if not exists (
    select 1
    from public.organization_accounting_tax_rates rate
    join public.organization_xero_connections connection
      on connection.id = rate.accounting_connection_id
      and connection.organization_id = new.organization_id
      and connection.tenant_id = rate.tenant_id
      and connection.status = 'connected'
    where rate.id = new.default_tax_rate_id
      and rate.organization_id = new.organization_id
      and rate.provider = 'xero'
      and rate.is_active = true
      and upper(coalesce(rate.status, '')) = 'ACTIVE'
      and rate.can_apply_to_expenses = true
  ) then
    raise exception 'Supplier default tax treatment must belong to the current Xero tenant.';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_supplier_default_tax_rate_scope() from public, anon, authenticated;
grant execute on function public.validate_supplier_default_tax_rate_scope() to service_role;

drop trigger if exists validate_supplier_default_tax_rate_scope on public.organization_suppliers;
create trigger validate_supplier_default_tax_rate_scope
before insert or update of default_tax_rate_id on public.organization_suppliers
for each row execute function public.validate_supplier_default_tax_rate_scope();

create or replace function public.validate_supplier_invoice_allocation_tax_rate_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jurisdiction text;
begin
  if new.tax_resolution_status <> 'resolved' then return new; end if;
  if new.accounting_tax_rate_id is null then
    raise exception 'A resolved allocation requires a tax treatment.';
  end if;
  select public.normalize_supported_tax_jurisdiction(to_jsonb(organization) ->> 'country')
    into v_jurisdiction from public.organizations organization where id = new.organization_id;
  if not exists (
    select 1
    from public.organization_accounting_tax_rates rate
    join public.organization_xero_connections connection
      on connection.id = rate.accounting_connection_id
      and connection.organization_id = new.organization_id
      and connection.tenant_id = rate.tenant_id
      and connection.status = 'connected'
    where rate.id = new.accounting_tax_rate_id
      and rate.organization_id = new.organization_id
      and rate.provider = 'xero'
      and rate.tenant_id is not null
      and rate.jurisdiction_code = v_jurisdiction
      and rate.is_active = true
      and upper(coalesce(rate.status, '')) = 'ACTIVE'
      and rate.can_apply_to_expenses = true
  ) then
    raise exception 'Allocation tax treatment must belong to the current Xero tenant and jurisdiction.';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_supplier_invoice_allocation_tax_rate_scope() from public, anon, authenticated;
grant execute on function public.validate_supplier_invoice_allocation_tax_rate_scope() to service_role;

drop trigger if exists validate_supplier_invoice_allocation_tax_rate_scope
  on public.supplier_invoice_line_allocations;
create trigger validate_supplier_invoice_allocation_tax_rate_scope
before insert or update of accounting_tax_rate_id, tax_resolution_status
on public.supplier_invoice_line_allocations
for each row execute function public.validate_supplier_invoice_allocation_tax_rate_scope();

create or replace function public.update_organization_tax_registration_status(
  p_organization_id uuid,
  p_tax_registration_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_tax_registration_status, '')));
begin
  if not public.has_org_permission(p_organization_id, 'settings.organization.update') then
    raise exception 'You do not have permission to update organization settings.';
  end if;
  if v_status not in ('registered', 'unregistered', 'unknown') then
    raise exception 'Select a valid tax-registration status.';
  end if;
  update public.organizations
  set tax_registration_status = v_status, updated_at = now()
  where id = p_organization_id;
  if not found then raise exception 'Organization not found.'; end if;
  return v_status;
end;
$$;

revoke all on function public.update_organization_tax_registration_status(uuid, text) from public, anon;
grant execute on function public.update_organization_tax_registration_status(uuid, text) to authenticated;

create or replace function public.save_supplier_invoice_capture(
  p_invoice_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_supplier_po_reference text,
  p_invoice_date date,
  p_due_date date,
  p_currency text,
  p_subtotal numeric,
  p_tax_total numeric,
  p_total numeric,
  p_notes text,
  p_source text,
  p_lines jsonb default '[]'::jsonb,
  p_create boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_jurisdiction text;
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_tax_amount_mode text := 'unknown';
  v_line_amount_total numeric := 0;
  v_line_tax_total numeric := 0;
  v_line jsonb;
  v_line_id uuid;
  v_keep_line_ids uuid[] := '{}';
begin
  select m.organization_id into v_organization_id
  from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at limit 1;

  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.capture') then
    raise exception 'You do not have permission to capture Supplier Invoices.';
  end if;
  select public.normalize_supported_tax_jurisdiction(to_jsonb(organization) ->> 'country')
    into v_jurisdiction from public.organizations organization where id = v_organization_id;
  if (v_jurisdiction = 'NZ' and v_currency <> 'NZD')
    or (v_jurisdiction = 'AU' and v_currency <> 'AUD')
    or v_jurisdiction = 'unsupported' then
    raise exception 'Supplier Invoice currency must match the supported organization jurisdiction.';
  end if;
  if p_invoice_id is null then raise exception 'Supplier Invoice ID is required.'; end if;
  if p_supplier_id is null or not exists (
    select 1 from public.organization_suppliers s
    where s.id = p_supplier_id and s.organization_id = v_organization_id
  ) then raise exception 'Select a valid Supplier.'; end if;
  if char_length(trim(coalesce(p_invoice_number, ''))) = 0 then raise exception 'Enter an invoice number.'; end if;
  if p_invoice_date is null then raise exception 'Enter an invoice date.'; end if;
  if p_due_date is not null and p_due_date < p_invoice_date then raise exception 'Due date cannot be before the invoice date.'; end if;
  if p_subtotal < 0 or p_tax_total < 0 or p_total < 0
    or abs((p_subtotal + p_tax_total) - p_total) > 0.01 then
    raise exception 'Invoice subtotal, tax and total do not reconcile.';
  end if;
  if p_supplier_po_reference is not null and char_length(trim(p_supplier_po_reference)) > 120 then
    raise exception 'Supplier PO reference must be 120 characters or fewer.';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Supplier Invoice lines must be an array.';
  end if;

  select
    coalesce(sum(coalesce((value ->> 'lineTotal')::numeric, 0)), 0),
    coalesce(sum(coalesce((value ->> 'taxAmount')::numeric, 0)), 0)
  into v_line_amount_total, v_line_tax_total
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb));
  v_tax_amount_mode := case
    when p_tax_total <= 0.01 then 'no_tax'
    when abs(v_line_amount_total - p_subtotal) <= 0.01 then 'exclusive'
    when abs(v_line_amount_total - p_total) <= 0.01 then 'inclusive'
    else 'unknown'
  end;

  if exists (
    select 1 from public.supplier_invoices duplicate
    where duplicate.organization_id = v_organization_id
      and duplicate.supplier_id = p_supplier_id
      and public.normalize_supplier_invoice_number(duplicate.invoice_number)
        = public.normalize_supplier_invoice_number(p_invoice_number)
      and duplicate.id <> p_invoice_id
  ) then raise exception 'A Supplier Invoice with this invoice number already exists for the Supplier.'; end if;

  if p_create then
    insert into public.supplier_invoices (
      id, organization_id, supplier_id, invoice_number, supplier_po_reference,
      invoice_date, due_date, currency, subtotal, tax_total, total, tax_amount_mode, tax_evidence_json, notes,
      status, source, created_by
    ) values (
      p_invoice_id, v_organization_id, p_supplier_id, trim(p_invoice_number),
      nullif(trim(coalesce(p_supplier_po_reference, '')), ''), p_invoice_date,
      p_due_date, v_currency, p_subtotal, p_tax_total, p_total, v_tax_amount_mode,
      jsonb_build_object('headerTaxSource', case when p_source = 'upload' then 'document_header' else 'manual' end,
        'amountMode', v_tax_amount_mode, 'lineTaxPreserved', v_line_tax_total > 0),
      trim(coalesce(p_notes, '')), 'Captured',
      case when p_source = 'upload' then 'upload' else 'manual' end, auth.uid()
    );
  else
    if exists (
      select 1 from public.organization_accounting_documents d
      where d.organization_id = v_organization_id and d.local_document_id = p_invoice_id
        and d.export_status in ('queued', 'exporting', 'exported', 'attention_required')
    ) then raise exception 'This Supplier Invoice is locked by its Xero export state.'; end if;
    update public.supplier_invoices
    set supplier_id = p_supplier_id, invoice_number = trim(p_invoice_number),
        supplier_po_reference = nullif(trim(coalesce(p_supplier_po_reference, '')), ''),
        invoice_date = p_invoice_date, due_date = p_due_date, currency = v_currency,
        subtotal = p_subtotal, tax_total = p_tax_total, total = p_total,
        tax_amount_mode = v_tax_amount_mode,
        tax_evidence_json = jsonb_build_object(
          'headerTaxSource', case when p_source = 'upload' then 'document_header' else 'manual' end,
          'amountMode', v_tax_amount_mode, 'lineTaxPreserved', v_line_tax_total > 0),
        notes = trim(coalesce(p_notes, ''))
    where id = p_invoice_id and organization_id = v_organization_id;
    if not found then raise exception 'Supplier Invoice not found.'; end if;
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_id := coalesce(nullif(v_line ->> 'id', '')::uuid, gen_random_uuid());
    if exists (
      select 1 from public.supplier_invoice_lines l where l.id = v_line_id
        and (l.supplier_invoice_id <> p_invoice_id or l.organization_id <> v_organization_id)
    ) then raise exception 'A Supplier Invoice line does not belong to this invoice.'; end if;
    if char_length(trim(coalesce(v_line ->> 'description', ''))) = 0 then
      raise exception 'Every Supplier Invoice line requires a description.';
    end if;
    if nullif(v_line ->> 'costCodeId', '') is not null and not exists (
      select 1 from public.organization_cost_codes c
      where c.id = (v_line ->> 'costCodeId')::uuid and c.organization_id = v_organization_id
    ) then raise exception 'A Supplier Invoice line cost code does not belong to this organization.'; end if;
    if nullif(v_line ->> 'projectId', '') is not null and not exists (
      select 1 from public.organization_projects p
      where p.id = (v_line ->> 'projectId')::uuid and p.organization_id = v_organization_id
    ) then raise exception 'A Supplier Invoice line project does not belong to this organization.'; end if;
    if coalesce((v_line ->> 'quantity')::numeric, 0) < 0
      or coalesce((v_line ->> 'unitPrice')::numeric, 0) < 0
      or coalesce((v_line ->> 'lineTotal')::numeric, 0) < 0
      or coalesce((v_line ->> 'taxAmount')::numeric, 0) < 0 then
      raise exception 'Supplier Invoice line values cannot be negative.';
    end if;

    insert into public.supplier_invoice_lines (
      id, organization_id, supplier_invoice_id, description, supplier_item_code,
      quantity, unit_price, line_total, tax_amount, cost_code_id, project_id, sort_order, source_metadata_json
    ) values (
      v_line_id, v_organization_id, p_invoice_id, trim(v_line ->> 'description'),
      nullif(trim(coalesce(v_line ->> 'supplierItemCode', '')), ''),
      coalesce((v_line ->> 'quantity')::numeric, 0), coalesce((v_line ->> 'unitPrice')::numeric, 0),
      coalesce((v_line ->> 'lineTotal')::numeric, 0), coalesce((v_line ->> 'taxAmount')::numeric, 0),
      nullif(v_line ->> 'costCodeId', '')::uuid, nullif(v_line ->> 'projectId', '')::uuid,
      coalesce((v_line ->> 'sortOrder')::integer, cardinality(v_keep_line_ids)),
      jsonb_build_object(
        'taxEvidenceSource', coalesce(nullif(v_line ->> 'taxEvidenceSource', ''), 'unknown'),
        'grossLineTotal', nullif(v_line ->> 'grossLineTotal', '')::numeric,
        'taxAmountMode', v_tax_amount_mode
      )
    )
    on conflict (id) do update set
      description = excluded.description, supplier_item_code = excluded.supplier_item_code,
      quantity = excluded.quantity, unit_price = excluded.unit_price,
      line_total = excluded.line_total, tax_amount = excluded.tax_amount,
      cost_code_id = excluded.cost_code_id, project_id = excluded.project_id,
      sort_order = excluded.sort_order,
      source_metadata_json = coalesce(public.supplier_invoice_lines.source_metadata_json, '{}'::jsonb)
        || excluded.source_metadata_json;
    v_keep_line_ids := array_append(v_keep_line_ids, v_line_id);
  end loop;

  if not p_create then
    delete from public.supplier_invoice_lines l
    where l.organization_id = v_organization_id and l.supplier_invoice_id = p_invoice_id
      and not (l.id = any(v_keep_line_ids));
  end if;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values (
    v_organization_id, p_invoice_id,
    case when p_create then 'invoice_created' else 'invoice_updated' end,
    case when p_create then 'Supplier Invoice captured by Accounts.' else 'Supplier Invoice capture details updated.' end,
    jsonb_build_object(
      'supplier_po_reference', nullif(trim(coalesce(p_supplier_po_reference, '')), ''),
      'line_count', jsonb_array_length(coalesce(p_lines, '[]'::jsonb)),
      'tax_amount_mode', v_tax_amount_mode,
      'currency', v_currency
    ), auth.uid()
  );
  return p_invoice_id;
end;
$$;

alter table public.organization_accounting_document_versions
  drop constraint if exists organization_accounting_document_versions_currency_check;
alter table public.organization_accounting_document_versions
  add constraint organization_accounting_document_versions_currency_check
  check (currency_code_snapshot in ('NZD', 'AUD'));

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.prepare_supplier_invoice_xero_bill_export(uuid,uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition,
    'if upper(trim(v_invoice.currency)) <> ''NZD'' then',
    'if upper(trim(v_invoice.currency)) not in (''NZD'', ''AUD'') then');
  v_definition := replace(v_definition,
    'Phase 3A supports NZD Supplier Invoices only.',
    'Supplier Invoice currency must be NZD or AUD.');
  v_definition := replace(v_definition,
    E'  v_line_amount_type := case\n    when v_invoice.tax_total <= 0.01 then ''NoTax''\n    else ''Exclusive''\n  end;',
    E'  v_line_amount_type := case v_invoice.tax_amount_mode\n    when ''inclusive'' then ''Inclusive''\n    when ''no_tax'' then ''NoTax''\n    else ''Exclusive''\n  end;');
  v_definition := replace(v_definition,
    E'    ''NZD''\n  )',
    E'    upper(trim(v_invoice.currency))\n  )');
  v_definition := replace(v_definition,
    E'      ''NZD'',\n      v_invoice.subtotal',
    E'      upper(trim(v_invoice.currency)),\n      v_invoice.subtotal');
  v_definition := replace(v_definition,
    E'      (snapshot.tax_resolution_status = ''not_applicable'' and snapshot.accounting_tax_rate_id is null)\n      or (\n        snapshot.tax_resolution_status = ''resolved''',
    E'      snapshot.tax_resolution_status = ''resolved''');
  v_definition := replace(v_definition,
    E'        and nullif(trim(tax_rate.tax_type), '''') is not null\n      )\n    );',
    E'        and nullif(trim(tax_rate.tax_type), '''') is not null\n    );');
  v_definition := replace(v_definition,
    E'                case\n                  when snapshot.tax_resolution_status = ''not_applicable'' then ''NONE''\n                  else tax_rate.tax_type\n                end',
    '                tax_rate.tax_type');
  v_definition := replace(v_definition,
    E'      case\n        when snapshot.tax_resolution_status = ''not_applicable'' then ''NONE''\n        else trim(tax_rate.tax_type)\n      end,',
    E'      trim(tax_rate.tax_type),');
  execute v_definition;
end;
$migration$;

create or replace function public.repair_supplier_invoice_allocation_tax(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_expected_finance_hash text,
  p_resolutions jsonb,
  p_resolver_version text,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_current_hash text;
  v_item jsonb;
  v_scanned integer := 0;
  v_resolved integer := 0;
  v_already integer := 0;
  v_locked integer := 0;
  v_exported integer := 0;
  v_review integer := 0;
begin
  if not public.has_org_permission(p_organization_id, 'supplier_invoices.accounts_approve') then
    raise exception 'You do not have permission to repair Supplier Invoice GST.';
  end if;
  select * into v_invoice from public.supplier_invoices
  where id = p_supplier_invoice_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Supplier Invoice not found.'; end if;
  v_current_hash := public.supplier_invoice_finance_version_hash(p_supplier_invoice_id);
  if v_current_hash is null or v_current_hash <> p_expected_finance_hash then
    raise exception 'The Supplier Invoice changed before GST repair. Refresh and run the dry-run again.';
  end if;
  if exists (
    select 1 from public.organization_accounting_documents d
    where d.organization_id = p_organization_id
      and d.local_document_type = 'supplier_invoice'
      and d.local_document_id = p_supplier_invoice_id
      and d.export_status in ('queued', 'exporting', 'exported', 'attention_required')
  ) then
    v_exported := 1;
    return jsonb_build_object('scanned', 0, 'automaticallyResolved', 0, 'alreadyResolved', 0,
      'accountsReviewRequired', 0, 'locked', 0, 'exported', v_exported, 'dryRun', p_dry_run);
  end if;
  if jsonb_typeof(coalesce(p_resolutions, '[]'::jsonb)) <> 'array' then
    raise exception 'GST repair resolutions must be an array.';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_resolutions, '[]'::jsonb)) loop
    v_scanned := v_scanned + 1;
    if coalesce(v_item ->> 'status', '') <> 'resolved' then
      v_review := v_review + 1;
      continue;
    end if;
    if exists (
      select 1 from public.supplier_invoice_line_allocations a
      where a.organization_id = p_organization_id
        and a.supplier_invoice_id = p_supplier_invoice_id
        and a.supplier_invoice_line_id = (v_item ->> 'lineId')::uuid
        and a.tax_resolution_status in ('resolved', 'not_applicable')
    ) then
      v_already := v_already + 1;
      continue;
    end if;
    if exists (
      select 1 from public.project_actual_cost_events e
      where e.organization_id = p_organization_id
        and e.supplier_invoice_id = p_supplier_invoice_id
        and e.source_invoice_line_id = (v_item ->> 'lineId')::uuid
        and e.event_status = 'active'
    ) then
      v_locked := v_locked + 1;
      continue;
    end if;
    v_resolved := v_resolved + 1;
    if not p_dry_run then
      update public.supplier_invoice_line_allocations
      set accounting_tax_rate_id = (v_item ->> 'accountingTaxRateId')::uuid,
          tax_resolution_status = 'resolved',
          approval_status = 'pending',
          reviewed_by_user_id = null,
          reviewed_at = null,
          updated_at = now()
      where organization_id = p_organization_id
        and supplier_invoice_id = p_supplier_invoice_id
        and supplier_invoice_line_id = (v_item ->> 'lineId')::uuid
        and tax_resolution_status = 'unresolved';
    end if;
  end loop;
  if not p_dry_run and v_resolved > 0 then
    perform public.invalidate_supplier_invoice_commercial_approval(
      p_supplier_invoice_id, 'GST treatment repaired.', 'supplier_invoice_tax_repair', auth.uid());
    perform public.invalidate_supplier_invoice_role_workflow(
      p_supplier_invoice_id, 'GST treatment repaired.');
    insert into public.supplier_invoice_activity_events (
      organization_id, supplier_invoice_id, event_type, message, metadata, created_by
    ) values (
      p_organization_id, p_supplier_invoice_id, 'supplier_invoice_tax_repaired',
      'Supplier Invoice GST treatments were resolved automatically.',
      jsonb_build_object('resolved_count', v_resolved, 'resolver_version', p_resolver_version,
        'previous_finance_hash', v_current_hash), auth.uid()
    );
  end if;
  return jsonb_build_object(
    'scanned', v_scanned, 'automaticallyResolved', v_resolved,
    'alreadyResolved', v_already, 'accountsReviewRequired', v_review,
    'locked', v_locked, 'exported', v_exported, 'dryRun', p_dry_run
  );
end;
$$;

revoke all on function public.repair_supplier_invoice_allocation_tax(uuid, uuid, text, jsonb, text, boolean)
  from public, anon;
grant execute on function public.repair_supplier_invoice_allocation_tax(uuid, uuid, text, jsonb, text, boolean)
  to authenticated, service_role;

commit;
