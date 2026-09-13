begin;

create table public.organization_accounting_route_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid null references public.organization_projects(id) on delete cascade,
  provider text not null,
  accounting_route text not null,
  organization_cost_code_id uuid not null references public.organization_cost_codes(id) on delete restrict,
  is_active boolean not null default true,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_accounting_route_mappings_provider_check
    check (char_length(trim(provider)) > 0),
  constraint organization_accounting_route_mappings_route_check
    check (accounting_route in (
      'supplier_bill_expense',
      'payment_claim_revenue',
      'retention_receivable'
    ))
);

create unique index organization_accounting_route_mappings_active_scope_uidx
  on public.organization_accounting_route_mappings (
    organization_id,
    provider,
    accounting_route,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_active;

create index organization_accounting_route_mappings_resolution_idx
  on public.organization_accounting_route_mappings
    (organization_id, provider, accounting_route, project_id, updated_at desc)
  where is_active;

create or replace function public.validate_organization_accounting_route_mapping()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_account public.organization_cost_codes%rowtype;
  v_project_organization_id uuid;
begin
  new.provider := lower(trim(new.provider));

  select * into v_account
  from public.organization_cost_codes
  where id = new.organization_cost_code_id;

  if not found
    or v_account.organization_id <> new.organization_id
    or v_account.external_provider is distinct from new.provider then
    raise exception 'The accounting account must belong to the same organization and provider.';
  end if;

  if new.project_id is not null then
    select organization_id into v_project_organization_id
    from public.organization_projects
    where id = new.project_id;
    if v_project_organization_id is distinct from new.organization_id then
      raise exception 'The accounting route project must belong to the same organization.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger validate_organization_accounting_route_mapping_trigger
before insert or update on public.organization_accounting_route_mappings
for each row execute function public.validate_organization_accounting_route_mapping();

alter table public.organization_accounting_route_mappings enable row level security;
alter table public.organization_accounting_route_mappings force row level security;

create policy "Organization members can view named accounting mappings"
on public.organization_accounting_route_mappings
for select to authenticated
using (public.is_member_of_organization(organization_id));

revoke all on table public.organization_accounting_route_mappings from public, anon, authenticated;
grant select on table public.organization_accounting_route_mappings to authenticated;
grant select, insert, update, delete on table public.organization_accounting_route_mappings to service_role;

create or replace function public.resolve_organization_accounting_route_mapping(
  p_organization_id uuid,
  p_provider text,
  p_accounting_route text,
  p_project_id uuid default null
)
returns public.organization_accounting_route_mappings
language sql
stable
security invoker
set search_path = public
as $$
  select mapping
  from public.organization_accounting_route_mappings mapping
  where mapping.organization_id = p_organization_id
    and mapping.provider = lower(trim(p_provider))
    and mapping.accounting_route = p_accounting_route
    and mapping.is_active
    and (mapping.project_id = p_project_id or mapping.project_id is null)
  order by
    case when mapping.project_id = p_project_id then 0 else 1 end,
    mapping.updated_at desc,
    mapping.id
  limit 1
$$;

grant execute on function public.resolve_organization_accounting_route_mapping(uuid, text, text, uuid)
  to authenticated, service_role;

create or replace function public.set_organization_accounting_route_mapping(
  p_organization_id uuid,
  p_provider text,
  p_accounting_route text,
  p_organization_cost_code_id uuid,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mapping_id uuid;
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'settings.organization.update') then
    raise exception 'You do not have permission to configure accounting routes.';
  end if;

  perform 1 from public.organization_cost_codes account
  where account.id = p_organization_cost_code_id
    and account.organization_id = p_organization_id
    and account.is_active
    and account.external_provider = lower(trim(p_provider));
  if not found then
    raise exception 'Select an active account for this organization and provider.';
  end if;

  update public.organization_accounting_route_mappings
  set is_active = false, updated_at = now()
  where organization_id = p_organization_id
    and provider = lower(trim(p_provider))
    and accounting_route = p_accounting_route
    and project_id is not distinct from p_project_id
    and is_active;

  insert into public.organization_accounting_route_mappings (
    organization_id, project_id, provider, accounting_route,
    organization_cost_code_id, created_by_user_id
  ) values (
    p_organization_id, p_project_id, lower(trim(p_provider)), p_accounting_route,
    p_organization_cost_code_id, auth.uid()
  ) returning id into v_mapping_id;

  return v_mapping_id;
end;
$$;

revoke all on function public.set_organization_accounting_route_mapping(uuid, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.set_organization_accounting_route_mapping(uuid, text, text, uuid, uuid)
  to authenticated;

-- Deterministic compatibility bootstrap only. Supplier Bill expense is
-- intentionally not guessed from any historical construction category.
insert into public.organization_accounting_route_mappings (
  organization_id, project_id, provider, accounting_route,
  organization_cost_code_id, is_active, created_by_user_id, created_at, updated_at
)
select
  legacy.organization_id,
  legacy.project_id,
  legacy.provider,
  case legacy.tradesstack_cost_code
    when 600 then 'payment_claim_revenue'
    when 700 then 'retention_receivable'
  end,
  legacy.organization_cost_code_id,
  true,
  legacy.created_by_user_id,
  legacy.created_at,
  now()
from public.organization_tradesstack_accounting_mappings legacy
where legacy.is_active
  and legacy.tradesstack_cost_code in (600, 700)
on conflict do nothing;

alter table public.supplier_invoice_line_allocations
  add column accounting_route text null,
  add column accounting_route_mapping_id uuid null
    references public.organization_accounting_route_mappings(id) on delete set null,
  add column account_override_organization_cost_code_id uuid null
    references public.organization_cost_codes(id) on delete restrict,
  add constraint supplier_invoice_line_allocations_accounting_route_check
    check (accounting_route is null or accounting_route = 'supplier_bill_expense');

create index supplier_invoice_allocations_named_accounting_idx
  on public.supplier_invoice_line_allocations
    (organization_id, accounting_route, accounting_route_mapping_id)
  where accounting_route is not null;

alter table public.project_actual_cost_events
  add column accounting_route text null,
  add column accounting_route_mapping_id uuid null
    references public.organization_accounting_route_mappings(id) on delete set null,
  add constraint project_actual_cost_events_accounting_route_check
    check (accounting_route is null or accounting_route = 'supplier_bill_expense');

alter table public.supplier_invoice_commercial_line_snapshots
  add column accounting_route text null,
  add column accounting_route_mapping_id uuid null
    references public.organization_accounting_route_mappings(id) on delete restrict,
  add column organization_cost_code_id uuid null
    references public.organization_cost_codes(id) on delete restrict,
  add column account_override_organization_cost_code_id uuid null
    references public.organization_cost_codes(id) on delete restrict,
  alter column accounting_mapping_id drop not null,
  add constraint supplier_invoice_commercial_snapshot_mapping_generation_check
    check (
      (accounting_mapping_id is not null and accounting_route_mapping_id is null)
      or
      (accounting_mapping_id is null
        and accounting_route = 'supplier_bill_expense'
        and (accounting_route_mapping_id is not null
          or account_override_organization_cost_code_id = organization_cost_code_id)
        and organization_cost_code_id is not null)
    );

alter table public.organization_accounting_document_lines
  add column accounting_route text null,
  add column accounting_route_mapping_id uuid null
    references public.organization_accounting_route_mappings(id) on delete restrict,
  add column accounting_source text null,
  alter column routing_code drop not null,
  alter column accounting_mapping_id drop not null,
  add constraint organization_accounting_document_lines_mapping_generation_check
    check (
      (routing_code is not null and accounting_mapping_id is not null
        and accounting_route is null and accounting_route_mapping_id is null)
      or
      (routing_code is null and accounting_mapping_id is null
        and accounting_route is not null
        and accounting_source in ('route_mapping', 'line_override')
        and ((accounting_source = 'route_mapping' and accounting_route_mapping_id is not null)
          or (accounting_source = 'line_override' and accounting_route_mapping_id is null)))
    );

create index organization_accounting_document_lines_named_route_idx
  on public.organization_accounting_document_lines
    (organization_id, accounting_route, accounting_route_mapping_id)
  where accounting_route is not null;

-- The protected approval boundary retains its original duplicate, variance,
-- commitment, hash and idempotency checks; accounting identity is dual-read.
create or replace function public.approve_supplier_invoice_commercially(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_expected_finance_hash text,
  p_accepted_variances jsonb default '[]'::jsonb,
  p_no_po_reason text default null,
  p_no_po_explanation text default null,
  p_approval_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_hash text;
  v_approval_id uuid;
  v_line_count integer;
  v_allocation_count integer;
  v_allocated_total numeric;
  v_has_po boolean;
  v_invalid_count integer;
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'supplier_invoices.accounts_approve') then
    raise exception 'You do not have permission to commercially approve supplier invoices.';
  end if;

  select * into v_invoice
  from public.supplier_invoices
  where id = p_supplier_invoice_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Supplier invoice not found.';
  end if;

  if v_invoice.supplier_id is null then
    raise exception 'Select a supplier before commercial approval.';
  end if;
  if char_length(public.normalize_supplier_invoice_number(coalesce(v_invoice.invoice_number, ''))) = 0 then
    raise exception 'Enter an invoice number before commercial approval.';
  end if;
  if v_invoice.invoice_date is null then
    raise exception 'Enter an invoice date before commercial approval.';
  end if;

  if exists (
    select 1
    from public.supplier_invoices other
    where other.organization_id = p_organization_id
      and other.supplier_id = v_invoice.supplier_id
      and other.id <> v_invoice.id
      and public.normalize_supplier_invoice_number(other.invoice_number)
        = public.normalize_supplier_invoice_number(v_invoice.invoice_number)
  ) then
    raise exception 'Another invoice for this supplier uses the same invoice number.';
  end if;

  select count(*) into v_line_count
  from public.supplier_invoice_lines
  where supplier_invoice_id = v_invoice.id;

  if v_line_count = 0 then
    raise exception 'Add at least one invoice line before commercial approval.';
  end if;

  select count(*), coalesce(sum(a.allocated_amount), 0), bool_or(a.purchase_order_id is not null)
  into v_allocation_count, v_allocated_total, v_has_po
  from public.supplier_invoice_line_allocations a
  where a.supplier_invoice_id = v_invoice.id;

  if v_allocation_count <> v_line_count then
    raise exception 'Every invoice line must have exactly one active allocation.';
  end if;
  if abs(v_allocated_total - v_invoice.subtotal) > 0.01
    and abs(v_allocated_total - v_invoice.total) > 0.01 then
    raise exception 'Allocated amounts do not reconcile to the invoice.';
  end if;

  select count(*) into v_invalid_count
  from public.supplier_invoice_line_allocations a
  left join public.organization_tradesstack_accounting_mappings legacy_mapping
    on legacy_mapping.id = a.accounting_mapping_id
    and legacy_mapping.organization_id = p_organization_id
    and legacy_mapping.is_active = true
  left join public.organization_accounting_route_mappings route_mapping
    on route_mapping.id = a.accounting_route_mapping_id
    and route_mapping.organization_id = p_organization_id
    and route_mapping.accounting_route = 'supplier_bill_expense'
    and route_mapping.is_active = true
    and (route_mapping.project_id is null or route_mapping.project_id is not distinct from a.project_id)
  left join public.organization_cost_codes account
    on account.id = a.organization_cost_code_id
    and account.organization_id = p_organization_id
    and account.is_active = true
  left join public.organization_accounting_tax_rates t
    on t.id = a.accounting_tax_rate_id
    and t.organization_id = p_organization_id
    and t.is_active = true
  where a.supplier_invoice_id = v_invoice.id
    and (
      a.approval_status <> 'approved'
      or account.id is null
      or not (
        (a.accounting_route = 'supplier_bill_expense'
          and (
            (a.account_override_organization_cost_code_id = account.id)
            or (route_mapping.id is not null
              and route_mapping.organization_cost_code_id = account.id)
          ))
        or (a.accounting_mapping_id is not null and legacy_mapping.id is not null)
      )
      or a.tax_resolution_status = 'unresolved'
      or (
        a.tax_resolution_status = 'not_applicable'
        and exists (
          select 1 from public.supplier_invoice_lines tax_line
          where tax_line.id = a.supplier_invoice_line_id
            and tax_line.tax_amount > 0.01
        )
      )
      or (a.tax_resolution_status = 'resolved' and t.id is null)
      or (a.purchase_order_id is null and char_length(trim(coalesce(a.approval_notes, ''))) = 0)
    );

  if v_invalid_count > 0 then
    raise exception 'Every allocation must be approved with active accounting and tax mappings.';
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations a
    join public.project_purchase_orders po on po.id = a.purchase_order_id
    where a.supplier_invoice_id = v_invoice.id
      and po.supplier_id is distinct from v_invoice.supplier_id
  ) then
    raise exception 'The invoice supplier does not match one or more purchase orders.';
  end if;

  if coalesce(v_has_po, false) = false then
    if p_no_po_reason not in (
      'utilities', 'insurance', 'emergency_purchase',
      'professional_service', 'approved_overhead', 'other'
    ) then
      raise exception 'Select a valid no-PO reason.';
    end if;
    if p_no_po_reason = 'other'
      and char_length(trim(coalesce(p_no_po_explanation, ''))) = 0 then
      raise exception 'Explain the no-PO reason.';
    end if;
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations current_a
    join public.project_purchase_order_line_items po_line
      on po_line.id = current_a.purchase_order_line_item_id
    left join lateral (
      select
        coalesce(sum(snapshot.quantity), 0) as approved_quantity,
        coalesce(sum(snapshot.amount), 0) as approved_amount
      from public.supplier_invoice_commercial_line_snapshots snapshot
      join public.supplier_invoice_commercial_approvals approval
        on approval.id = snapshot.commercial_approval_id
      where snapshot.purchase_order_line_item_id = current_a.purchase_order_line_item_id
        and snapshot.supplier_invoice_id <> v_invoice.id
        and approval.status = 'approved'
    ) history on true
    left join lateral (
      select coalesce(sum(release_line.released_amount), 0) as released_amount
      from public.purchase_order_commitment_release_lines release_line
      where release_line.purchase_order_line_item_id = current_a.purchase_order_line_item_id
    ) released on true
    where current_a.supplier_invoice_id = v_invoice.id
      and (
        history.approved_quantity + coalesce(current_a.allocated_quantity, 0) > po_line.quantity + 0.001
        or history.approved_amount + released.released_amount + current_a.allocated_amount
          > po_line.total + 0.01
      )
  ) then
    raise exception 'Commercial approval is blocked because the invoice would over-invoice a purchase order line.';
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations current_a
    join public.supplier_invoice_lines invoice_line
      on invoice_line.id = current_a.supplier_invoice_line_id
    join public.project_purchase_order_line_items po_line
      on po_line.id = current_a.purchase_order_line_item_id
    where current_a.supplier_invoice_id = v_invoice.id
      and abs(invoice_line.unit_price - po_line.rate) > 0.0001
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
        where accepted ->> 'type' = 'rate_variance'
          and accepted ->> 'purchaseOrderLineItemId' = po_line.id::text
          and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
      )
  ) then
    raise exception 'Accept and explain every rate variance before commercial approval.';
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations current_a
    join public.project_purchase_order_line_items po_line
      on po_line.id = current_a.purchase_order_line_item_id
    left join lateral (
      select coalesce(sum(snapshot.quantity), 0) as approved_quantity
      from public.supplier_invoice_commercial_line_snapshots snapshot
      join public.supplier_invoice_commercial_approvals approval
        on approval.id = snapshot.commercial_approval_id
      where snapshot.purchase_order_line_item_id = current_a.purchase_order_line_item_id
        and snapshot.supplier_invoice_id <> v_invoice.id
        and approval.status = 'approved'
    ) history on true
    where current_a.supplier_invoice_id = v_invoice.id
      and coalesce(current_a.allocated_quantity, 0) > 0
      and coalesce(current_a.allocated_quantity, 0)
        < po_line.quantity - history.approved_quantity - 0.001
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
        where accepted ->> 'type' = 'quantity_variance'
          and accepted ->> 'purchaseOrderLineItemId' = po_line.id::text
          and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
      )
  ) then
    raise exception 'Accept and explain every partial quantity variance before commercial approval.';
  end if;

  if exists (
    select 1
    from public.supplier_invoice_line_allocations current_a
    join public.supplier_invoice_lines invoice_line
      on invoice_line.id = current_a.supplier_invoice_line_id
    join public.project_purchase_order_line_items po_line
      on po_line.id = current_a.purchase_order_line_item_id
    where current_a.supplier_invoice_id = v_invoice.id
      and abs(
        current_a.allocated_amount
        - round(coalesce(current_a.allocated_quantity, invoice_line.quantity, 0) * po_line.rate, 2)
      ) > 0.01
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
        where accepted ->> 'type' = 'value_variance'
          and accepted ->> 'purchaseOrderLineItemId' = po_line.id::text
          and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
      )
  ) then
    raise exception 'Accept and explain every purchase order line value variance before commercial approval.';
  end if;

  if exists (
    select 1
    from public.supplier_invoices other
    where other.organization_id = p_organization_id
      and other.supplier_id = v_invoice.supplier_id
      and other.id <> v_invoice.id
      and other.invoice_date is not distinct from v_invoice.invoice_date
      and abs(other.total - v_invoice.total) <= 0.01
      and public.normalize_supplier_invoice_number(other.invoice_number)
        <> public.normalize_supplier_invoice_number(v_invoice.invoice_number)
  )
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
    where accepted ->> 'type' = 'duplicate_invoice'
      and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0
  ) then
    raise exception 'Review and explain the likely duplicate invoice warning before commercial approval.';
  end if;

  v_hash := public.supplier_invoice_finance_version_hash(v_invoice.id);
  if v_hash is null or v_hash <> p_expected_finance_hash then
    raise exception 'The invoice changed while it was being reviewed. Refresh and review it again.';
  end if;

  perform public.invalidate_supplier_invoice_commercial_approval(
    v_invoice.id,
    'Superseded by a newer commercial approval.',
    'commercial_approval',
    auth.uid()
  );

  insert into public.supplier_invoice_commercial_approvals (
    organization_id,
    supplier_invoice_id,
    status,
    finance_version_hash,
    supplier_id,
    normalized_invoice_number,
    invoice_total,
    invoice_tax_total,
    currency,
    accepted_variances,
    no_po_reason,
    no_po_explanation,
    approval_note,
    reviewed_by
  )
  values (
    p_organization_id,
    v_invoice.id,
    'approved',
    v_hash,
    v_invoice.supplier_id,
    public.normalize_supplier_invoice_number(v_invoice.invoice_number),
    v_invoice.total,
    v_invoice.tax_total,
    v_invoice.currency,
    coalesce(p_accepted_variances, '[]'::jsonb),
    case when coalesce(v_has_po, false) then null else p_no_po_reason end,
    case when coalesce(v_has_po, false) then null else nullif(trim(p_no_po_explanation), '') end,
    coalesce(p_approval_note, ''),
    auth.uid()
  )
  returning id into v_approval_id;

  insert into public.supplier_invoice_commercial_line_snapshots (
    organization_id,
    commercial_approval_id,
    supplier_invoice_id,
    supplier_invoice_line_id,
    allocation_id,
    purchase_order_id,
    purchase_order_line_item_id,
    project_id,
    accounting_mapping_id,
    accounting_route,
    accounting_route_mapping_id,
    organization_cost_code_id,
    account_override_organization_cost_code_id,
    accounting_tax_rate_id,
    description,
    quantity,
    unit_rate,
    amount,
    tax_amount,
    tax_resolution_status
  )
  select
    p_organization_id,
    v_approval_id,
    v_invoice.id,
    l.id,
    a.id,
    a.purchase_order_id,
    a.purchase_order_line_item_id,
    a.project_id,
    a.accounting_mapping_id,
    a.accounting_route,
    a.accounting_route_mapping_id,
    a.organization_cost_code_id,
    a.account_override_organization_cost_code_id,
    a.accounting_tax_rate_id,
    l.description,
    coalesce(a.allocated_quantity, l.quantity, 0),
    l.unit_price,
    a.allocated_amount,
    l.tax_amount,
    a.tax_resolution_status
  from public.supplier_invoice_lines l
  join public.supplier_invoice_line_allocations a
    on a.supplier_invoice_line_id = l.id
    and a.supplier_invoice_id = v_invoice.id
  where l.supplier_invoice_id = v_invoice.id;

  insert into public.supplier_invoice_commercial_variances (
    organization_id,
    commercial_approval_id,
    supplier_invoice_id,
    variance_key,
    variance_type,
    severity,
    purchase_order_line_item_id,
    expected_value,
    actual_value,
    variance_amount,
    accepted_by,
    explanation
  )
  select
    p_organization_id,
    v_approval_id,
    v_invoice.id,
    accepted ->> 'key',
    accepted ->> 'type',
    'warning',
    nullif(accepted ->> 'purchaseOrderLineItemId', '')::uuid,
    accepted -> 'expectedValue',
    accepted -> 'actualValue',
    case
      when jsonb_typeof(accepted -> 'varianceAmount') = 'number'
        then (accepted ->> 'varianceAmount')::numeric
      else null
    end,
    auth.uid(),
    trim(accepted ->> 'note')
  from jsonb_array_elements(coalesce(p_accepted_variances, '[]'::jsonb)) accepted
  where char_length(trim(coalesce(accepted ->> 'key', ''))) > 0
    and char_length(trim(coalesce(accepted ->> 'type', ''))) > 0
    and char_length(trim(coalesce(accepted ->> 'note', ''))) > 0;

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
    'approved',
    'Supplier invoice commercially approved.',
    jsonb_build_object(
      'commercial_approval_id', v_approval_id,
      'finance_version_hash', v_hash,
      'accepted_variances', coalesce(p_accepted_variances, '[]'::jsonb)
    ),
    auth.uid()
  );

  return v_approval_id;
end;
$$;

revoke all on function public.approve_supplier_invoice_commercially(uuid, uuid, text, jsonb, text, text, text)
  from public, anon;
grant execute on function public.approve_supplier_invoice_commercially(uuid, uuid, text, jsonb, text, text, text)
  to authenticated;


-- Prepare immutable Xero AP snapshots from either historical numeric evidence
-- or new named Supplier Bills evidence. External AccountID/Code/TaxType output
-- and the existing queue/idempotency contract are unchanged.
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
  left join public.organization_tradesstack_accounting_mappings mapping
    on mapping.id = snapshot.accounting_mapping_id
    and mapping.organization_id = p_organization_id
    and mapping.is_active = true
  left join public.organization_accounting_route_mappings route_mapping
    on route_mapping.id = snapshot.accounting_route_mapping_id
    and route_mapping.organization_id = p_organization_id
    and route_mapping.accounting_route = snapshot.accounting_route
    and route_mapping.organization_cost_code_id = snapshot.organization_cost_code_id
    and route_mapping.is_active = true
  join public.organization_cost_codes cost_code
    on cost_code.id = coalesce(snapshot.organization_cost_code_id, mapping.organization_cost_code_id)
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
      (snapshot.accounting_mapping_id is not null and mapping.id is not null)
      or
      (snapshot.accounting_route = 'supplier_bill_expense'
        and (route_mapping.id is not null
          or snapshot.account_override_organization_cost_code_id = snapshot.organization_cost_code_id))
    )
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
                coalesce(snapshot.accounting_route, mapping.tradesstack_cost_code::text),
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
            left join public.organization_tradesstack_accounting_mappings mapping
              on mapping.id = snapshot.accounting_mapping_id
            left join public.organization_accounting_route_mappings route_mapping
              on route_mapping.id = snapshot.accounting_route_mapping_id
            join public.organization_cost_codes cost_code
              on cost_code.id = coalesce(snapshot.organization_cost_code_id, mapping.organization_cost_code_id)
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
      accounting_route,
      accounting_route_mapping_id,
      accounting_source,
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
      case when snapshot.accounting_route is null then mapping.tradesstack_cost_code else null end,
      mapping.id,
      snapshot.accounting_route,
      snapshot.accounting_route_mapping_id,
      case
        when snapshot.account_override_organization_cost_code_id is not null then 'line_override'
        else 'route_mapping'
      end,
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
    left join public.organization_tradesstack_accounting_mappings mapping
      on mapping.id = snapshot.accounting_mapping_id
    left join public.organization_accounting_route_mappings route_mapping
      on route_mapping.id = snapshot.accounting_route_mapping_id
    join public.organization_cost_codes cost_code
      on cost_code.id = coalesce(snapshot.organization_cost_code_id, mapping.organization_cost_code_id)
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

revoke all on function public.prepare_supplier_invoice_xero_bill_export(uuid, uuid)
  from public, anon;
grant execute on function public.prepare_supplier_invoice_xero_bill_export(uuid, uuid)
  to authenticated;


-- Legacy routed and new unrouted Actual Events reverse through the same exact
-- negative snapshot and idempotent correction chain.
create or replace function public.reverse_supplier_invoice_actual_cost_event(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_event_id uuid,
  p_reversal_reason text default null,
  p_reversal_note text default null
)
returns table (
  original_event_id uuid,
  reversal_event_id uuid,
  successor_allocation_id uuid,
  supplier_invoice_id uuid,
  project_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  original_event public.project_actual_cost_events%rowtype;
  reversal_event public.project_actual_cost_events%rowtype;
  source_allocation public.supplier_invoice_line_allocations%rowtype;
  successor_allocation public.supplier_invoice_line_allocations%rowtype;
  next_allocation_sequence integer;
  successor_review_status text;
  successor_review_reason text;
  normalized_reason text;
  normalized_note text;
  correction_root_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_organization_id is null then raise exception 'Organization is required.'; end if;
  if p_supplier_invoice_id is null then raise exception 'Supplier invoice is required.'; end if;
  if p_event_id is null then raise exception 'Actual cost event is required.'; end if;
  if not public.has_org_permission(p_organization_id, 'actual_costs.reverse') then
    raise exception 'You do not have permission to reverse actual costs.';
  end if;

  normalized_reason := nullif(btrim(coalesce(p_reversal_reason, '')), '');
  normalized_note := nullif(btrim(coalesce(p_reversal_note, '')), '');

  if not exists (
    select 1 from public.supplier_invoices invoice
    where invoice.id = p_supplier_invoice_id and invoice.organization_id = p_organization_id
  ) then raise exception 'Supplier invoice not found.'; end if;

  select * into original_event
  from public.project_actual_cost_events event
  where event.id = p_event_id
    and event.organization_id = p_organization_id
    and event.supplier_invoice_id = p_supplier_invoice_id
  for update;

  if not found then raise exception 'Actual cost event not found.'; end if;
  if original_event.event_type <> 'posting' then raise exception 'Only posting actual cost events can be reversed.'; end if;
  if original_event.event_status <> 'posted' then raise exception 'Only posted actual cost events can be reversed.'; end if;
  if original_event.source_type <> 'supplier_invoice' then raise exception 'Only supplier invoice actual cost events can be reversed.'; end if;
  if exists (
    select 1 from public.project_actual_cost_events reversal
    where reversal.organization_id = p_organization_id
      and reversal.event_type = 'reversal'
      and reversal.reverses_event_id = original_event.id
  ) then raise exception 'This actual cost event has already been reversed.'; end if;

  select * into source_allocation
  from public.supplier_invoice_line_allocations allocation
  where allocation.id = coalesce(original_event.source_invoice_allocation_id, original_event.supplier_invoice_line_allocation_id)
    and allocation.organization_id = p_organization_id
    and allocation.supplier_invoice_id = p_supplier_invoice_id
  for update;

  if not found then raise exception 'Source allocation not found for actual cost event.'; end if;
  if source_allocation.project_id is distinct from original_event.project_id then
    raise exception 'Source allocation project does not match the actual cost event.';
  end if;
  if source_allocation.supplier_invoice_line_id is distinct from original_event.supplier_invoice_line_id then
    raise exception 'Source allocation invoice line does not match the actual cost event.';
  end if;

  correction_root_id := coalesce(original_event.correction_root_event_id, original_event.id);

  insert into public.project_actual_cost_events (
    organization_id, supplier_invoice_id, supplier_invoice_line_id,
    supplier_invoice_line_allocation_id, purchase_order_id, purchase_order_line_item_id,
    project_id, supplier_id, cost_item_id, source_cost_item_id,
    tradesstack_cost_code, tradesstack_cost_code_label,
    financial_routing_confidence, financial_routing_source,
    organization_cost_code_id, accounting_mapping_id, accounting_route, accounting_route_mapping_id,
    amount, tax_amount, total_amount, quantity, event_date, event_status, event_type,
    posting_source, reverses_event_id, correction_root_event_id, reversal_reason, reversal_note,
    source_invoice_line_id, source_invoice_allocation_id, source_type, source_reference,
    ai_construction_intelligence, created_by_user_id
  ) values (
    original_event.organization_id, original_event.supplier_invoice_id, original_event.supplier_invoice_line_id,
    source_allocation.id, original_event.purchase_order_id, original_event.purchase_order_line_item_id,
    original_event.project_id, original_event.supplier_id, original_event.cost_item_id, original_event.source_cost_item_id,
    original_event.tradesstack_cost_code, original_event.tradesstack_cost_code_label,
    original_event.financial_routing_confidence, original_event.financial_routing_source,
    original_event.organization_cost_code_id, original_event.accounting_mapping_id,
    original_event.accounting_route, original_event.accounting_route_mapping_id,
    original_event.amount * -1, original_event.tax_amount * -1, original_event.total_amount * -1,
    case when original_event.quantity is null then null else original_event.quantity * -1 end,
    original_event.event_date, 'posted', 'reversal', original_event.posting_source,
    original_event.id, correction_root_id, normalized_reason, normalized_note,
    original_event.source_invoice_line_id, coalesce(original_event.source_invoice_allocation_id, source_allocation.id),
    original_event.source_type, original_event.source_reference,
    original_event.ai_construction_intelligence, auth.uid()
  ) returning * into reversal_event;

  update public.supplier_invoice_line_allocations set edit_state = 'reversed'
  where id = source_allocation.id;

  select coalesce(max(allocation_sequence), 0) + 1 into next_allocation_sequence
  from public.supplier_invoice_line_allocations
  where organization_id = p_organization_id
    and supplier_invoice_line_id = source_allocation.supplier_invoice_line_id
    and purchase_order_line_item_id is not distinct from source_allocation.purchase_order_line_item_id;

  successor_review_status := case
    when source_allocation.accounting_route = 'supplier_bill_expense'
      and (
        source_allocation.accounting_route_mapping_id is not null
        or source_allocation.account_override_organization_cost_code_id is not null
      ) then 'resolved'
    when source_allocation.accounting_mapping_id is not null then 'resolved'
    else 'needs_accounting_mapping'
  end;
  successor_review_reason := case
    when successor_review_status = 'needs_accounting_mapping'
      then coalesce(source_allocation.review_reason, 'missing_accounting_route')
    else source_allocation.review_reason
  end;

  insert into public.supplier_invoice_line_allocations (
    organization_id, supplier_invoice_id, supplier_invoice_line_id,
    purchase_order_id, purchase_order_line_item_id, project_id,
    allocation_group_id, supersedes_allocation_id, allocation_sequence,
    allocated_quantity, allocated_amount, matched_amount,
    cost_item_id, source_cost_item_id,
    tradesstack_cost_code, tradesstack_cost_code_label,
    financial_routing_confidence, financial_routing_source,
    organization_cost_code_id, accounting_mapping_id, accounting_route,
    accounting_route_mapping_id, account_override_organization_cost_code_id,
    accounting_resolution_status,
    accounting_tax_rate_id, tax_resolution_status,
    allocation_status, match_status, review_status, review_reason,
    approval_status, approval_notes, approval_checks_json,
    reviewed_by_user_id, reviewed_at, approved_by_user_id, approved_at,
    allocation_source, ai_suggested_purchase_order_line_item_id, ai_suggested_cost_item_id,
    ai_confidence_score, ai_reasoning_summary, accepted_ai_suggestion,
    ai_suggestion_metadata_json, ai_construction_intelligence, edit_state
  ) values (
    source_allocation.organization_id, source_allocation.supplier_invoice_id, source_allocation.supplier_invoice_line_id,
    source_allocation.purchase_order_id, source_allocation.purchase_order_line_item_id, source_allocation.project_id,
    coalesce(source_allocation.allocation_group_id, source_allocation.id), source_allocation.id, next_allocation_sequence,
    source_allocation.allocated_quantity, source_allocation.allocated_amount, source_allocation.matched_amount,
    source_allocation.cost_item_id, source_allocation.source_cost_item_id,
    source_allocation.tradesstack_cost_code, source_allocation.tradesstack_cost_code_label,
    source_allocation.financial_routing_confidence, source_allocation.financial_routing_source,
    source_allocation.organization_cost_code_id, source_allocation.accounting_mapping_id,
    source_allocation.accounting_route, source_allocation.accounting_route_mapping_id,
    source_allocation.account_override_organization_cost_code_id,
    source_allocation.accounting_resolution_status, source_allocation.accounting_tax_rate_id,
    source_allocation.tax_resolution_status, source_allocation.allocation_status,
    source_allocation.match_status, successor_review_status, successor_review_reason,
    'pending', '', source_allocation.approval_checks_json,
    null, null, null, null, source_allocation.allocation_source,
    source_allocation.ai_suggested_purchase_order_line_item_id, source_allocation.ai_suggested_cost_item_id,
    source_allocation.ai_confidence_score, source_allocation.ai_reasoning_summary,
    source_allocation.accepted_ai_suggestion, source_allocation.ai_suggestion_metadata_json,
    source_allocation.ai_construction_intelligence, 'editable'
  ) returning * into successor_allocation;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values
  (
    p_organization_id, p_supplier_invoice_id, 'actual_cost_reversed',
    case when normalized_reason is null then 'Actual cost event reversed.' else format('Actual cost event reversed: %s.', normalized_reason) end,
    jsonb_build_object('original_event_id', original_event.id, 'reversal_event_id', reversal_event.id,
      'source_allocation_id', source_allocation.id, 'reason', normalized_reason, 'note', normalized_note),
    auth.uid()
  ),
  (
    p_organization_id, p_supplier_invoice_id, 'actual_cost_correction_started',
    'Correction draft allocation created from reversed actual cost event.',
    jsonb_build_object('original_event_id', original_event.id, 'reversal_event_id', reversal_event.id,
      'source_allocation_id', source_allocation.id, 'successor_allocation_id', successor_allocation.id,
      'reason', normalized_reason, 'note', normalized_note),
    auth.uid()
  );

  return query select original_event.id, reversal_event.id, successor_allocation.id,
    p_supplier_invoice_id, original_event.project_id;
end;
$$;

grant execute on function public.reverse_supplier_invoice_actual_cost_event(uuid, uuid, uuid, text, text) to authenticated;

-- All current mirror functions may continue calling this compatibility-shaped
-- resolver during rolling deployment, but it deliberately returns no
-- classification. New mirrors therefore retain facts and lineage only.
create or replace function public.resolve_cost_item_financial_routing_defaults(
  p_organization_id uuid,
  p_project_id uuid,
  p_source_document_kind text,
  p_source_line_table text default null,
  p_origin_kind text default null,
  p_item_type text default null,
  p_category text default null,
  p_section text default null,
  p_title text default null,
  p_description text default null,
  p_amount numeric default null
)
returns table (
  tradesstack_cost_code integer,
  tradesstack_cost_code_label text,
  financial_routing_confidence numeric,
  financial_routing_source text,
  review_status text,
  review_reason text,
  accounting_mapping_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select null::integer, null::text, null::numeric, null::text,
    null::text, null::text, null::uuid
$$;

comment on function public.resolve_cost_item_financial_routing_defaults(
  uuid, uuid, text, text, text, text, text, text, text, text, numeric
) is 'Retired compatibility shape. New Cost Item mirrors persist factual lineage with null construction routing.';

-- Preserve PO quantity/value enforcement while accepting either immutable
-- legacy routing evidence or the new Supplier Bills accounting identity.
create or replace function public.enforce_commercial_snapshot_po_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_order_id uuid;
  v_ordered_quantity numeric;
  v_ordered_value numeric;
  v_approved_quantity numeric;
  v_approved_value numeric;
  v_released_value numeric;
begin
  if not exists (
    select 1
    from public.supplier_invoice_line_allocations allocation
    left join public.organization_tradesstack_accounting_mappings legacy_mapping
      on legacy_mapping.id = allocation.accounting_mapping_id
      and legacy_mapping.is_active
      and legacy_mapping.organization_id = new.organization_id
      and legacy_mapping.tradesstack_cost_code = allocation.tradesstack_cost_code
      and (legacy_mapping.project_id is null
        or legacy_mapping.project_id is not distinct from allocation.project_id)
    left join public.organization_accounting_route_mappings route_mapping
      on route_mapping.id = allocation.accounting_route_mapping_id
      and route_mapping.is_active
      and route_mapping.organization_id = new.organization_id
      and route_mapping.accounting_route = 'supplier_bill_expense'
      and route_mapping.organization_cost_code_id = allocation.organization_cost_code_id
      and (route_mapping.project_id is null
        or route_mapping.project_id is not distinct from allocation.project_id)
    where allocation.id = new.allocation_id
      and allocation.organization_id = new.organization_id
      and (
        legacy_mapping.id is not null
        or (
          allocation.accounting_route = 'supplier_bill_expense'
          and (
            route_mapping.id is not null
            or allocation.account_override_organization_cost_code_id
              = allocation.organization_cost_code_id
          )
        )
      )
  ) then
    raise exception 'The allocation accounting route and account mapping are not consistent.';
  end if;

  if new.purchase_order_line_item_id is null then
    return new;
  end if;

  select purchase_order_id, quantity, total
  into v_purchase_order_id, v_ordered_quantity, v_ordered_value
  from public.project_purchase_order_line_items
  where id = new.purchase_order_line_item_id;

  if not found then
    raise exception 'Purchase order line not found.';
  end if;

  perform 1
  from public.project_purchase_orders
  where id = v_purchase_order_id
  for update;

  select
    coalesce(sum(snapshot.quantity), 0),
    coalesce(sum(snapshot.amount), 0)
  into v_approved_quantity, v_approved_value
  from public.supplier_invoice_commercial_line_snapshots snapshot
  join public.supplier_invoice_commercial_approvals approval
    on approval.id = snapshot.commercial_approval_id
  where snapshot.purchase_order_line_item_id = new.purchase_order_line_item_id
    and approval.status = 'approved';

  select coalesce(sum(released_amount), 0)
  into v_released_value
  from public.purchase_order_commitment_release_lines
  where purchase_order_line_item_id = new.purchase_order_line_item_id;

  if v_approved_quantity + new.quantity > v_ordered_quantity + 0.001 then
    raise exception 'Commercial approval would over-invoice the purchase order line quantity.';
  end if;

  if v_approved_value + v_released_value + new.amount > v_ordered_value + 0.01 then
    raise exception 'Commercial approval would exceed the remaining purchase order line commitment.';
  end if;

  return new;
end;
$$;

commit;
