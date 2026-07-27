begin;

alter table public.supplier_invoices
  add column if not exists supplier_po_reference text null,
  add column if not exists supplier_po_reference_normalized text
    generated always as (
      nullif(lower(regexp_replace(trim(coalesce(supplier_po_reference, '')), '[[:space:]]+', ' ', 'g')), '')
    ) stored;

alter table public.supplier_invoices
  add constraint supplier_invoices_supplier_po_reference_length_check
  check (supplier_po_reference is null or char_length(trim(supplier_po_reference)) between 1 and 120)
  not valid;

alter table public.supplier_invoices
  validate constraint supplier_invoices_supplier_po_reference_length_check;

create index if not exists supplier_invoices_org_po_reference_idx
  on public.supplier_invoices (organization_id, supplier_po_reference_normalized)
  where supplier_po_reference_normalized is not null;

create table public.supplier_invoice_site_review_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  finance_hash text not null,
  status text not null default 'submitted',
  submitted_by uuid not null references auth.users (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  invalidated_at timestamptz null,
  invalidation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_site_review_submissions_hash_check
    check (char_length(trim(finance_hash)) > 0),
  constraint supplier_invoice_site_review_submissions_status_check
    check (status in ('submitted', 'partially_reviewed', 'approved', 'disputed', 'invalidated', 'cancelled')),
  constraint supplier_invoice_site_review_submissions_invalidation_check
    check (
      (status = 'invalidated' and invalidated_at is not null and invalidation_reason is not null)
      or status <> 'invalidated'
    )
);

create unique index supplier_invoice_site_review_submissions_active_uidx
  on public.supplier_invoice_site_review_submissions (supplier_invoice_id)
  where status in ('submitted', 'partially_reviewed', 'approved', 'disputed');

create index supplier_invoice_site_review_submissions_org_status_idx
  on public.supplier_invoice_site_review_submissions (organization_id, status, submitted_at desc);

create table public.supplier_invoice_site_review_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  submission_id uuid not null references public.supplier_invoice_site_review_submissions (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  purchase_order_id uuid not null references public.project_purchase_orders (id) on delete restrict,
  project_id uuid not null references public.organization_projects (id) on delete restrict,
  allocated_amount_snapshot numeric(14,2) not null,
  allocation_ids_snapshot uuid[] not null default '{}',
  decision text not null default 'pending',
  reviewer_id uuid null references auth.users (id) on delete set null,
  reviewed_at timestamptz null,
  note text not null default '',
  accepted_variances jsonb not null default '[]'::jsonb,
  disputed_allocation_ids uuid[] not null default '{}',
  invalidated_at timestamptz null,
  invalidation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_site_review_decisions_amount_check check (allocated_amount_snapshot >= 0),
  constraint supplier_invoice_site_review_decisions_status_check
    check (decision in ('pending', 'approved', 'disputed', 'invalidated')),
  constraint supplier_invoice_site_review_decisions_variances_array_check
    check (jsonb_typeof(accepted_variances) = 'array'),
  constraint supplier_invoice_site_review_decisions_reviewer_check
    check (
      (decision = 'pending' and reviewer_id is null and reviewed_at is null)
      or (decision in ('approved', 'disputed') and reviewer_id is not null and reviewed_at is not null)
      or decision = 'invalidated'
    ),
  constraint supplier_invoice_site_review_decisions_unique_po unique (submission_id, purchase_order_id)
);

create index supplier_invoice_site_review_decisions_po_status_idx
  on public.supplier_invoice_site_review_decisions (organization_id, purchase_order_id, decision, created_at desc);

create index supplier_invoice_site_review_decisions_invoice_idx
  on public.supplier_invoice_site_review_decisions (supplier_invoice_id, created_at desc);

create table public.supplier_invoice_accounts_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  site_review_submission_id uuid null references public.supplier_invoice_site_review_submissions (id) on delete restrict,
  finance_hash text not null,
  status text not null,
  approved_by uuid null references auth.users (id) on delete set null,
  approved_at timestamptz null,
  approval_note text not null default '',
  invalidated_at timestamptz null,
  invalidation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_accounts_approvals_hash_check check (char_length(trim(finance_hash)) > 0),
  constraint supplier_invoice_accounts_approvals_status_check
    check (status in ('not_ready', 'approved', 'rejected', 'invalidated')),
  constraint supplier_invoice_accounts_approvals_decision_check
    check (
      (status = 'approved' and approved_by is not null and approved_at is not null)
      or status <> 'approved'
    ),
  constraint supplier_invoice_accounts_approvals_invalidation_check
    check (
      (status = 'invalidated' and invalidated_at is not null and invalidation_reason is not null)
      or status <> 'invalidated'
    )
);

create unique index supplier_invoice_accounts_approvals_active_uidx
  on public.supplier_invoice_accounts_approvals (supplier_invoice_id)
  where status = 'approved';

create index supplier_invoice_accounts_approvals_org_invoice_idx
  on public.supplier_invoice_accounts_approvals (organization_id, supplier_invoice_id, created_at desc);

alter table public.supplier_invoice_site_review_submissions enable row level security;
alter table public.supplier_invoice_site_review_submissions force row level security;
alter table public.supplier_invoice_site_review_decisions enable row level security;
alter table public.supplier_invoice_site_review_decisions force row level security;
alter table public.supplier_invoice_accounts_approvals enable row level security;
alter table public.supplier_invoice_accounts_approvals force row level security;

create policy "Supplier invoice viewers can view site submissions"
on public.supplier_invoice_site_review_submissions for select to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.view'));

create policy "Supplier invoice viewers can view site decisions"
on public.supplier_invoice_site_review_decisions for select to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.view'));

create policy "Supplier invoice viewers can view accounts approvals"
on public.supplier_invoice_accounts_approvals for select to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.view'));

grant select on public.supplier_invoice_site_review_submissions to authenticated;
grant select on public.supplier_invoice_site_review_decisions to authenticated;
grant select on public.supplier_invoice_accounts_approvals to authenticated;
revoke insert, update, delete on public.supplier_invoice_site_review_submissions from authenticated;
revoke insert, update, delete on public.supplier_invoice_site_review_decisions from authenticated;
revoke insert, update, delete on public.supplier_invoice_accounts_approvals from authenticated;
grant select, insert, update, delete on public.supplier_invoice_site_review_submissions to service_role;
grant select, insert, update, delete on public.supplier_invoice_site_review_decisions to service_role;
grant select, insert, update, delete on public.supplier_invoice_accounts_approvals to service_role;

insert into public.app_permissions (permission_key, description)
values
  ('supplier_invoices.capture', 'Capture and edit Supplier Invoices'),
  ('supplier_invoices.submit_site_review', 'Submit captured Supplier Invoices for site review'),
  ('supplier_invoices.site_review', 'Approve or dispute Supplier Invoice costs for relevant projects'),
  ('supplier_invoices.accounts_approve', 'Perform final Accounts approval for Xero readiness')
on conflict (permission_key) do update set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'supplier_invoices.capture', true),
  ('admin', 'supplier_invoices.capture', true),
  ('qs', 'supplier_invoices.capture', false),
  ('project_manager', 'supplier_invoices.capture', false),
  ('worker', 'supplier_invoices.capture', false),
  ('owner', 'supplier_invoices.submit_site_review', true),
  ('admin', 'supplier_invoices.submit_site_review', true),
  ('qs', 'supplier_invoices.submit_site_review', false),
  ('project_manager', 'supplier_invoices.submit_site_review', false),
  ('worker', 'supplier_invoices.submit_site_review', false),
  ('owner', 'supplier_invoices.site_review', true),
  ('admin', 'supplier_invoices.site_review', true),
  ('qs', 'supplier_invoices.site_review', true),
  ('project_manager', 'supplier_invoices.site_review', true),
  ('worker', 'supplier_invoices.site_review', false),
  ('owner', 'supplier_invoices.accounts_approve', true),
  ('admin', 'supplier_invoices.accounts_approve', true),
  ('qs', 'supplier_invoices.accounts_approve', false),
  ('project_manager', 'supplier_invoices.accounts_approve', false),
  ('worker', 'supplier_invoices.accounts_approve', false)
on conflict (role, permission_key) do update
set is_allowed = excluded.is_allowed, updated_at = now();

create or replace function public.invalidate_supplier_invoice_role_workflow(
  p_supplier_invoice_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Finance-critical data changed.'), 500);
begin
  update public.supplier_invoice_site_review_submissions
  set status = 'invalidated', invalidated_at = now(), invalidation_reason = v_reason
  where supplier_invoice_id = p_supplier_invoice_id
    and status in ('submitted', 'partially_reviewed', 'approved', 'disputed');

  update public.supplier_invoice_site_review_decisions
  set decision = 'invalidated', invalidated_at = now(), invalidation_reason = v_reason
  where supplier_invoice_id = p_supplier_invoice_id
    and decision in ('pending', 'approved', 'disputed');

  update public.supplier_invoice_accounts_approvals
  set status = 'invalidated', invalidated_at = now(), invalidation_reason = v_reason
  where supplier_invoice_id = p_supplier_invoice_id and status = 'approved';
end;
$$;

revoke all on function public.invalidate_supplier_invoice_role_workflow(uuid, text) from public, anon, authenticated;
grant execute on function public.invalidate_supplier_invoice_role_workflow(uuid, text) to service_role;

create or replace function public.invalidate_role_workflow_from_invoice_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.supplier_id is distinct from old.supplier_id
    or new.invoice_number is distinct from old.invoice_number
    or new.supplier_po_reference is distinct from old.supplier_po_reference
    or new.invoice_date is distinct from old.invoice_date
    or new.due_date is distinct from old.due_date
    or new.currency is distinct from old.currency
    or new.subtotal is distinct from old.subtotal
    or new.tax_total is distinct from old.tax_total
    or new.total is distinct from old.total then
    perform public.invalidate_supplier_invoice_role_workflow(new.id, 'Supplier Invoice header changed.');
  end if;
  return new;
end;
$$;

create trigger invalidate_role_workflow_from_invoice_change
after update on public.supplier_invoices
for each row execute function public.invalidate_role_workflow_from_invoice_change();

create or replace function public.invalidate_role_workflow_from_invoice_child_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_invoice_id uuid;
begin
  v_invoice_id := case when tg_op = 'DELETE' then old.supplier_invoice_id else new.supplier_invoice_id end;
  if current_setting('tradesstack.site_review_decision', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  perform public.invalidate_supplier_invoice_role_workflow(v_invoice_id, tg_table_name || ' changed.');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger invalidate_role_workflow_from_invoice_line_change
after insert or update or delete on public.supplier_invoice_lines
for each row execute function public.invalidate_role_workflow_from_invoice_child_change();

create trigger invalidate_role_workflow_from_allocation_change
after insert or update or delete on public.supplier_invoice_line_allocations
for each row execute function public.invalidate_role_workflow_from_invoice_child_change();

create trigger invalidate_role_workflow_from_po_match_change
after insert or update or delete on public.supplier_invoice_purchase_order_matches
for each row execute function public.invalidate_role_workflow_from_invoice_child_change();

create or replace function public.invalidate_role_workflow_from_po_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_invoice_id uuid;
begin
  if new.supplier_id is not distinct from old.supplier_id
    and new.status is not distinct from old.status
    and new.total_purchase_order_price is not distinct from old.total_purchase_order_price then
    return new;
  end if;
  for v_invoice_id in select distinct a.supplier_invoice_id
    from public.supplier_invoice_line_allocations a where a.purchase_order_id = new.id loop
    perform public.invalidate_supplier_invoice_role_workflow(v_invoice_id, 'Matched Purchase Order changed.');
  end loop;
  return new;
end;
$$;

create trigger invalidate_role_workflow_from_po_change
after update on public.project_purchase_orders
for each row execute function public.invalidate_role_workflow_from_po_change();

create or replace function public.invalidate_role_workflow_from_po_line_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_invoice_id uuid; v_line_id uuid;
begin
  if tg_op = 'UPDATE' and new.description is not distinct from old.description
    and new.quantity is not distinct from old.quantity
    and new.rate is not distinct from old.rate
    and new.total is not distinct from old.total then return new; end if;
  v_line_id := case when tg_op = 'DELETE' then old.id else new.id end;
  for v_invoice_id in select distinct a.supplier_invoice_id
    from public.supplier_invoice_line_allocations a
    where a.purchase_order_line_item_id = v_line_id loop
    perform public.invalidate_supplier_invoice_role_workflow(v_invoice_id, 'Matched Purchase Order line changed.');
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger invalidate_role_workflow_from_po_line_change
after update or delete on public.project_purchase_order_line_items
for each row execute function public.invalidate_role_workflow_from_po_line_change();

create or replace function public.invalidate_role_workflow_from_mapping_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_invoice_id uuid; v_mapping_id uuid;
begin
  v_mapping_id := case when tg_op = 'DELETE' then old.id else new.id end;
  for v_invoice_id in select distinct a.supplier_invoice_id
    from public.supplier_invoice_line_allocations a
    where (tg_table_name = 'organization_tradesstack_accounting_mappings'
      and a.accounting_mapping_id = v_mapping_id)
      or (tg_table_name = 'organization_accounting_tax_rates'
        and a.accounting_tax_rate_id = v_mapping_id) loop
    perform public.invalidate_supplier_invoice_role_workflow(v_invoice_id, tg_table_name || ' changed.');
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger invalidate_role_workflow_from_accounting_mapping_change
after update or delete on public.organization_tradesstack_accounting_mappings
for each row execute function public.invalidate_role_workflow_from_mapping_change();

create trigger invalidate_role_workflow_from_tax_mapping_change
after update or delete on public.organization_accounting_tax_rates
for each row execute function public.invalidate_role_workflow_from_mapping_change();

create or replace function public.supplier_invoice_finance_version_hash(p_invoice_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select encode(extensions.digest(concat_ws('|',
    i.id::text,
    coalesce(i.supplier_id::text, ''),
    public.normalize_supplier_invoice_number(coalesce(i.invoice_number, '')),
    coalesce(i.supplier_po_reference_normalized, ''),
    coalesce(i.invoice_date::text, ''), coalesce(i.due_date::text, ''),
    coalesce(i.currency, ''), coalesce(i.subtotal::text, ''),
    coalesce(i.tax_total::text, ''), coalesce(i.total::text, ''),
    coalesce((select string_agg(concat_ws(':', l.id::text, l.description, l.quantity::text,
      l.unit_price::text, l.line_total::text, l.tax_amount::text, l.sort_order::text),
      ',' order by l.sort_order, l.id) from public.supplier_invoice_lines l
      where l.supplier_invoice_id = i.id), ''),
    coalesce((select string_agg(concat_ws(':', a.id::text,
      coalesce(a.purchase_order_id::text, ''), coalesce(a.purchase_order_line_item_id::text, ''),
      coalesce(a.project_id::text, ''), coalesce(a.allocated_quantity::text, ''),
      a.allocated_amount::text, coalesce(a.accounting_mapping_id::text, ''),
      coalesce(a.accounting_tax_rate_id::text, ''), a.tax_resolution_status),
      ',' order by a.supplier_invoice_line_id, a.allocation_sequence, a.id)
      from public.supplier_invoice_line_allocations a where a.supplier_invoice_id = i.id), ''),
    coalesce((select string_agg(concat_ws(':', po.id::text, coalesce(po.supplier_id::text, ''),
      po.status, po.total_purchase_order_price::text, po_line.id::text, po_line.description,
      po_line.quantity::text, po_line.rate::text, po_line.total::text), ',' order by po.id, po_line.id)
      from public.supplier_invoice_line_allocations a
      join public.project_purchase_orders po on po.id = a.purchase_order_id
      join public.project_purchase_order_line_items po_line on po_line.id = a.purchase_order_line_item_id
      where a.supplier_invoice_id = i.id), '')
  ), 'sha256'), 'hex')
  from public.supplier_invoices i where i.id = p_invoice_id;
$$;

grant execute on function public.supplier_invoice_finance_version_hash(uuid) to authenticated;

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
  v_line jsonb;
  v_line_id uuid;
  v_keep_line_ids uuid[] := '{}';
begin
  select m.organization_id into v_organization_id
  from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1;

  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.capture') then
    raise exception 'You do not have permission to capture Supplier Invoices.';
  end if;
  if p_invoice_id is null then raise exception 'Supplier Invoice ID is required.'; end if;
  if p_supplier_id is null or not exists (
    select 1 from public.organization_suppliers s
    where s.id = p_supplier_id and s.organization_id = v_organization_id
  ) then raise exception 'Select a valid Supplier.'; end if;
  if char_length(trim(coalesce(p_invoice_number, ''))) = 0 then
    raise exception 'Enter an invoice number.';
  end if;
  if p_invoice_date is null then raise exception 'Enter an invoice date.'; end if;
  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'Due date cannot be before the invoice date.';
  end if;
  if upper(trim(coalesce(p_currency, ''))) <> 'NZD' then
    raise exception 'Supplier Invoice currency must be NZD.';
  end if;
  if p_subtotal < 0 or p_tax_total < 0 or p_total < 0
    or abs((p_subtotal + p_tax_total) - p_total) > 0.01 then
    raise exception 'Invoice subtotal, tax and total do not reconcile.';
  end if;
  if p_supplier_po_reference is not null
    and char_length(trim(p_supplier_po_reference)) > 120 then
    raise exception 'Supplier PO reference must be 120 characters or fewer.';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Supplier Invoice lines must be an array.';
  end if;

  if exists (
    select 1 from public.supplier_invoices duplicate
    where duplicate.organization_id = v_organization_id
      and duplicate.supplier_id = p_supplier_id
      and public.normalize_supplier_invoice_number(duplicate.invoice_number)
        = public.normalize_supplier_invoice_number(p_invoice_number)
      and duplicate.id <> p_invoice_id
  ) then raise exception 'A Supplier Invoice with this invoice number already exists for the Supplier.';
  end if;

  if p_create then
    insert into public.supplier_invoices (
      id, organization_id, supplier_id, invoice_number, supplier_po_reference,
      invoice_date, due_date, currency, subtotal, tax_total, total, notes,
      status, source, created_by
    ) values (
      p_invoice_id, v_organization_id, p_supplier_id, trim(p_invoice_number),
      nullif(trim(coalesce(p_supplier_po_reference, '')), ''), p_invoice_date,
      p_due_date, 'NZD', p_subtotal, p_tax_total, p_total, trim(coalesce(p_notes, '')),
      'Captured', case when p_source = 'upload' then 'upload' else 'manual' end, auth.uid()
    );
  else
    if exists (
      select 1 from public.organization_accounting_documents d
      where d.organization_id = v_organization_id
        and d.local_document_id = p_invoice_id
        and d.export_status in ('queued', 'exporting', 'exported', 'attention_required')
    ) then raise exception 'This Supplier Invoice is locked by its Xero export state.';
    end if;
    update public.supplier_invoices
    set supplier_id = p_supplier_id,
        invoice_number = trim(p_invoice_number),
        supplier_po_reference = nullif(trim(coalesce(p_supplier_po_reference, '')), ''),
        invoice_date = p_invoice_date,
        due_date = p_due_date,
        currency = 'NZD', subtotal = p_subtotal, tax_total = p_tax_total,
        total = p_total, notes = trim(coalesce(p_notes, ''))
    where id = p_invoice_id and organization_id = v_organization_id;
    if not found then raise exception 'Supplier Invoice not found.'; end if;
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_id := coalesce(nullif(v_line ->> 'id', '')::uuid, gen_random_uuid());
    if exists (
      select 1 from public.supplier_invoice_lines l
      where l.id = v_line_id
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
      id, organization_id, supplier_invoice_id, description, quantity, unit_price,
      line_total, tax_amount, cost_code_id, project_id, sort_order
    ) values (
      v_line_id, v_organization_id, p_invoice_id, trim(v_line ->> 'description'),
      coalesce((v_line ->> 'quantity')::numeric, 0),
      coalesce((v_line ->> 'unitPrice')::numeric, 0),
      coalesce((v_line ->> 'lineTotal')::numeric, 0),
      coalesce((v_line ->> 'taxAmount')::numeric, 0),
      nullif(v_line ->> 'costCodeId', '')::uuid,
      nullif(v_line ->> 'projectId', '')::uuid,
      coalesce((v_line ->> 'sortOrder')::integer, cardinality(v_keep_line_ids))
    )
    on conflict (id) do update set
      description = excluded.description, quantity = excluded.quantity,
      unit_price = excluded.unit_price, line_total = excluded.line_total,
      tax_amount = excluded.tax_amount, cost_code_id = excluded.cost_code_id,
      project_id = excluded.project_id, sort_order = excluded.sort_order;
    v_keep_line_ids := array_append(v_keep_line_ids, v_line_id);
  end loop;

  if not p_create then
    delete from public.supplier_invoice_lines l
    where l.organization_id = v_organization_id
      and l.supplier_invoice_id = p_invoice_id
      and not (l.id = any(v_keep_line_ids));
  end if;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values (
    v_organization_id, p_invoice_id,
    case when p_create then 'invoice_created' else 'invoice_updated' end,
    case when p_create then 'Supplier Invoice captured by Accounts.' else 'Supplier Invoice capture details updated.' end,
    jsonb_build_object('supplier_po_reference', nullif(trim(coalesce(p_supplier_po_reference, '')), ''),
      'line_count', jsonb_array_length(coalesce(p_lines, '[]'::jsonb))), auth.uid()
  );
  return p_invoice_id;
end;
$$;

revoke all on function public.save_supplier_invoice_capture(
  uuid, uuid, text, text, date, date, text, numeric, numeric, numeric, text, text, jsonb, boolean
) from public, anon;
grant execute on function public.save_supplier_invoice_capture(
  uuid, uuid, text, text, date, date, text, numeric, numeric, numeric, text, text, jsonb, boolean
) to authenticated;

create or replace function public.set_supplier_invoice_purchase_order_match(
  p_supplier_invoice_id uuid,
  p_purchase_order_id uuid,
  p_remove boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_invoice public.supplier_invoices%rowtype;
  v_purchase_order public.project_purchase_orders%rowtype;
  v_match_id uuid;
begin
  select m.organization_id into v_organization_id
  from public.organization_members m where m.user_id = auth.uid()
  order by m.created_at limit 1;
  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.capture') then
    raise exception 'You do not have permission to match Supplier Invoices.';
  end if;
  select * into v_invoice from public.supplier_invoices
  where id = p_supplier_invoice_id and organization_id = v_organization_id for update;
  select * into v_purchase_order from public.project_purchase_orders
  where id = p_purchase_order_id and organization_id = v_organization_id for update;
  if v_invoice.id is null or v_purchase_order.id is null then
    raise exception 'Supplier Invoice or Purchase Order not found.';
  end if;
  if not p_remove and (v_invoice.supplier_id is null
    or v_purchase_order.supplier_id is distinct from v_invoice.supplier_id) then
    raise exception 'Purchase Order Supplier mismatch. Correct the Supplier before matching.';
  end if;
  if not p_remove and lower(v_purchase_order.status) = 'cancelled' then
    raise exception 'Cancelled Purchase Orders cannot be matched.';
  end if;

  if p_remove then
    update public.supplier_invoice_purchase_order_matches
    set match_status = 'rejected'
    where organization_id = v_organization_id
      and supplier_invoice_id = p_supplier_invoice_id
      and purchase_order_id = p_purchase_order_id
    returning id into v_match_id;
    if v_match_id is null then raise exception 'Purchase Order match not found.'; end if;
  else
    insert into public.supplier_invoice_purchase_order_matches (
      organization_id, supplier_invoice_id, purchase_order_id, matched_amount,
      match_status, confidence_score, match_basis, created_by
    ) values (
      v_organization_id, p_supplier_invoice_id, p_purchase_order_id, 0,
      'accepted', null, 'manual', auth.uid()
    )
    on conflict (supplier_invoice_id, purchase_order_id) do update
    set match_status = 'accepted', match_basis = 'manual', confidence_score = null
    returning id into v_match_id;
  end if;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values (
    v_organization_id, p_supplier_invoice_id,
    case when p_remove then 'po_match_removed' else 'po_match_confirmed' end,
    case when p_remove then 'Purchase Order match removed by Accounts.' else 'Purchase Order match confirmed by Accounts.' end,
    jsonb_build_object('purchase_order_id', p_purchase_order_id, 'match_id', v_match_id), auth.uid()
  );
  return v_match_id;
end;
$$;

revoke all on function public.set_supplier_invoice_purchase_order_match(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_supplier_invoice_purchase_order_match(uuid, uuid, boolean) to authenticated;

create or replace function public.submit_supplier_invoice_for_site_review(
  p_supplier_invoice_id uuid,
  p_expected_finance_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_submission_id uuid;
  v_hash text;
  v_invoice public.supplier_invoices%rowtype;
begin
  select m.organization_id into v_organization_id
  from public.organization_members m where m.user_id = auth.uid()
  order by m.created_at limit 1;
  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.submit_site_review') then
    raise exception 'You do not have permission to submit Supplier Invoices for site review.';
  end if;
  select * into v_invoice from public.supplier_invoices
  where id = p_supplier_invoice_id and organization_id = v_organization_id for update;
  if not found then raise exception 'Supplier Invoice not found.'; end if;
  if exists (select 1 from public.organization_accounting_documents d
    where d.organization_id = v_organization_id and d.local_document_id = p_supplier_invoice_id
      and d.export_status in ('queued', 'exporting', 'exported', 'attention_required')) then
    raise exception 'This Supplier Invoice is locked by its Xero export state.';
  end if;
  if v_invoice.supplier_id is null or char_length(trim(v_invoice.invoice_number)) = 0
    or v_invoice.invoice_date is null then
    raise exception 'Complete the Supplier, invoice number and invoice date before site review.';
  end if;
  if not exists (select 1 from public.supplier_invoice_lines l where l.supplier_invoice_id = p_supplier_invoice_id) then
    raise exception 'Add at least one Supplier Invoice line before site review.';
  end if;
  if exists (
    select 1 from public.supplier_invoice_lines l
    left join public.supplier_invoice_line_allocations a
      on a.supplier_invoice_line_id = l.id and a.supplier_invoice_id = l.supplier_invoice_id
    where l.supplier_invoice_id = p_supplier_invoice_id
    group by l.id having count(a.id) <> 1
  ) then raise exception 'Allocate every Supplier Invoice line before site review.'; end if;
  if exists (select 1 from public.supplier_invoice_line_allocations a
    where a.supplier_invoice_id = p_supplier_invoice_id
      and (a.purchase_order_id is null or a.purchase_order_line_item_id is null)) then
    raise exception 'Use the explicit no-PO Accounts workflow for invoices without Purchase Orders.';
  end if;
  if not exists (select 1 from public.supplier_invoice_line_allocations a
    where a.supplier_invoice_id = p_supplier_invoice_id and a.purchase_order_id is not null) then
    raise exception 'Match and allocate at least one Purchase Order before site review.';
  end if;
  if exists (
    select 1 from public.supplier_invoice_line_allocations a
    join public.project_purchase_orders po on po.id = a.purchase_order_id
    where a.supplier_invoice_id = p_supplier_invoice_id
      and (po.organization_id <> v_organization_id or po.supplier_id is distinct from v_invoice.supplier_id
        or lower(po.status) = 'cancelled')
  ) then raise exception 'A matched Purchase Order has a Supplier mismatch or is cancelled.'; end if;
  if exists (select 1 from public.supplier_invoice_line_allocations a
    where a.supplier_invoice_id = p_supplier_invoice_id
      and (a.accounting_mapping_id is null
        or (a.tax_resolution_status = 'resolved' and a.accounting_tax_rate_id is null)
        or a.accounting_resolution_status <> 'resolved')) then
    raise exception 'Resolve routing, accounting and tax coding before site review.';
  end if;
  if abs((select coalesce(sum(a.allocated_amount), 0) from public.supplier_invoice_line_allocations a
    where a.supplier_invoice_id = p_supplier_invoice_id) - v_invoice.subtotal) > 0.01
    and abs((select coalesce(sum(a.allocated_amount), 0) from public.supplier_invoice_line_allocations a
    where a.supplier_invoice_id = p_supplier_invoice_id) - v_invoice.total) > 0.01 then
    raise exception 'Allocated amounts do not reconcile to the Supplier Invoice.';
  end if;
  v_hash := public.supplier_invoice_finance_version_hash(p_supplier_invoice_id);
  if v_hash is null or v_hash <> p_expected_finance_hash then
    raise exception 'Supplier Invoice finance data changed. Refresh and submit again.';
  end if;
  select s.id into v_submission_id
  from public.supplier_invoice_site_review_submissions s
  where s.organization_id = v_organization_id
    and s.supplier_invoice_id = p_supplier_invoice_id
    and s.finance_hash = v_hash
    and s.status in ('submitted', 'partially_reviewed', 'approved', 'disputed')
  order by s.submitted_at desc limit 1;
  if v_submission_id is not null then return v_submission_id; end if;

  perform public.invalidate_supplier_invoice_role_workflow(p_supplier_invoice_id, 'Superseded by a new site-review submission.');
  insert into public.supplier_invoice_site_review_submissions (
    organization_id, supplier_invoice_id, finance_hash, submitted_by
  ) values (v_organization_id, p_supplier_invoice_id, v_hash, auth.uid())
  returning id into v_submission_id;

  insert into public.supplier_invoice_site_review_decisions (
    organization_id, submission_id, supplier_invoice_id, purchase_order_id,
    project_id, allocated_amount_snapshot, allocation_ids_snapshot
  )
  select v_organization_id, v_submission_id, p_supplier_invoice_id,
    a.purchase_order_id, po.project_id, sum(a.allocated_amount), array_agg(a.id order by a.id)
  from public.supplier_invoice_line_allocations a
  join public.project_purchase_orders po on po.id = a.purchase_order_id
  where a.supplier_invoice_id = p_supplier_invoice_id
  group by a.purchase_order_id, po.project_id;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values (v_organization_id, p_supplier_invoice_id, 'site_review_submitted',
    'Supplier Invoice submitted for site approval.',
    jsonb_build_object('submission_id', v_submission_id, 'finance_hash', v_hash), auth.uid());
  return v_submission_id;
end;
$$;

revoke all on function public.submit_supplier_invoice_for_site_review(uuid, text) from public, anon;
grant execute on function public.submit_supplier_invoice_for_site_review(uuid, text) to authenticated;

create or replace function public.decide_supplier_invoice_site_review(
  p_decision_id uuid,
  p_decision text,
  p_note text,
  p_accepted_variances jsonb default '[]'::jsonb,
  p_disputed_allocation_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.organization_members%rowtype;
  v_decision public.supplier_invoice_site_review_decisions%rowtype;
  v_submission public.supplier_invoice_site_review_submissions%rowtype;
  v_pending integer;
  v_approved integer;
  v_disputed integer;
begin
  select * into v_member from public.organization_members where user_id = auth.uid()
  order by created_at limit 1;
  select * into v_decision from public.supplier_invoice_site_review_decisions
  where id = p_decision_id and organization_id = v_member.organization_id for update;
  if not found then raise exception 'Site-review decision not found.'; end if;
  if v_decision.decision <> 'pending' then
    if v_decision.decision = p_decision then return v_decision.id; end if;
    raise exception 'The site-review decision has already been recorded.';
  end if;
  if not public.has_org_permission(v_member.organization_id, 'supplier_invoices.site_review') then
    raise exception 'You do not have permission to perform site review.';
  end if;
  if v_member.role not in ('owner', 'admin') and not exists (
    select 1 from public.project_members pm where pm.organization_id = v_member.organization_id
      and pm.project_id = v_decision.project_id and pm.organization_member_id = v_member.id and pm.is_active
  ) then raise exception 'You may only review Supplier Invoice costs for your assigned projects.'; end if;
  select * into v_submission from public.supplier_invoice_site_review_submissions
  where id = v_decision.submission_id and status in ('submitted', 'partially_reviewed', 'approved', 'disputed') for update;
  if not found or v_submission.finance_hash <> public.supplier_invoice_finance_version_hash(v_decision.supplier_invoice_id) then
    raise exception 'The site-review submission is no longer current.';
  end if;
  if p_decision not in ('approved', 'disputed') then raise exception 'Choose approved or disputed.'; end if;
  if p_decision = 'disputed' and char_length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Add a dispute reason.';
  end if;
  if jsonb_typeof(coalesce(p_accepted_variances, '[]'::jsonb)) <> 'array' then
    raise exception 'Accepted variances must be an array.';
  end if;

  perform set_config('tradesstack.site_review_decision', 'on', true);
  update public.supplier_invoice_line_allocations
  set approval_status = p_decision,
      review_status = case when p_decision = 'approved' then 'resolved' else 'disputed' end,
      approval_notes = trim(coalesce(p_note, '')),
      reviewed_by_user_id = auth.uid(), reviewed_at = now(),
      approved_by_user_id = auth.uid(), approved_at = now()
  where organization_id = v_member.organization_id
    and id = any(v_decision.allocation_ids_snapshot);

  update public.supplier_invoice_site_review_decisions
  set decision = p_decision, reviewer_id = auth.uid(), reviewed_at = now(),
      note = trim(coalesce(p_note, '')), accepted_variances = coalesce(p_accepted_variances, '[]'::jsonb),
      disputed_allocation_ids = case when p_decision = 'disputed' then coalesce(p_disputed_allocation_ids, '{}') else '{}' end
  where id = p_decision_id;

  select count(*) filter (where decision = 'pending'), count(*) filter (where decision = 'approved'),
    count(*) filter (where decision = 'disputed')
  into v_pending, v_approved, v_disputed
  from public.supplier_invoice_site_review_decisions where submission_id = v_submission.id;
  update public.supplier_invoice_site_review_submissions
  set status = case when v_disputed > 0 then 'disputed' when v_pending = 0 then 'approved'
    when v_approved > 0 then 'partially_reviewed' else 'submitted' end
  where id = v_submission.id;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values (v_member.organization_id, v_decision.supplier_invoice_id,
    case when p_decision = 'approved' then 'site_review_approved' else 'site_review_disputed' end,
    case when p_decision = 'approved' then 'Purchase Order costs approved by site review.' else 'Purchase Order costs disputed during site review.' end,
    jsonb_build_object('submission_id', v_submission.id, 'purchase_order_id', v_decision.purchase_order_id,
      'allocated_amount', v_decision.allocated_amount_snapshot), auth.uid());
  return p_decision_id;
end;
$$;

revoke all on function public.decide_supplier_invoice_site_review(uuid, text, text, jsonb, uuid[]) from public, anon;
grant execute on function public.decide_supplier_invoice_site_review(uuid, text, text, jsonb, uuid[]) to authenticated;

create or replace function public.record_supplier_invoice_accounts_approval(
  p_supplier_invoice_id uuid,
  p_site_review_submission_id uuid,
  p_expected_finance_hash text,
  p_approval_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_approval_id uuid;
  v_hash text;
begin
  select m.organization_id into v_organization_id from public.organization_members m
  where m.user_id = auth.uid() order by m.created_at limit 1;
  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.accounts_approve') then
    raise exception 'You do not have permission to perform final Accounts approval.';
  end if;
  perform 1 from public.supplier_invoices i where i.id = p_supplier_invoice_id
    and i.organization_id = v_organization_id for update;
  if not found then raise exception 'Supplier Invoice not found.'; end if;
  v_hash := public.supplier_invoice_finance_version_hash(p_supplier_invoice_id);
  if v_hash is null or v_hash <> p_expected_finance_hash then
    raise exception 'Supplier Invoice finance data changed. Refresh and approve again.';
  end if;
  if p_site_review_submission_id is not null then
    if not exists (select 1 from public.supplier_invoice_site_review_submissions s
      where s.id = p_site_review_submission_id and s.organization_id = v_organization_id
        and s.supplier_invoice_id = p_supplier_invoice_id and s.finance_hash = v_hash and s.status = 'approved') then
      raise exception 'Every Purchase Order requires a current approved site-review decision.';
    end if;
  elsif exists (select 1 from public.supplier_invoice_line_allocations a
    where a.supplier_invoice_id = p_supplier_invoice_id and a.purchase_order_id is not null) then
    raise exception 'Matched Purchase Orders require site approval.';
  end if;
  if not exists (select 1 from public.supplier_invoice_commercial_approvals a
    where a.supplier_invoice_id = p_supplier_invoice_id and a.finance_version_hash = v_hash and a.status = 'approved') then
    raise exception 'A current commercial approval is required before final Accounts approval.';
  end if;
  select a.id into v_approval_id
  from public.supplier_invoice_accounts_approvals a
  where a.organization_id = v_organization_id
    and a.supplier_invoice_id = p_supplier_invoice_id
    and a.finance_hash = v_hash
    and a.site_review_submission_id is not distinct from p_site_review_submission_id
    and a.status = 'approved'
  order by a.created_at desc limit 1;
  if v_approval_id is not null then return v_approval_id; end if;
  update public.supplier_invoice_accounts_approvals
  set status = 'invalidated', invalidated_at = now(),
      invalidation_reason = 'Superseded by a newer Accounts approval.'
  where supplier_invoice_id = p_supplier_invoice_id and status = 'approved';
  insert into public.supplier_invoice_accounts_approvals (
    organization_id, supplier_invoice_id, site_review_submission_id, finance_hash,
    status, approved_by, approved_at, approval_note
  ) values (v_organization_id, p_supplier_invoice_id, p_site_review_submission_id,
    v_hash, 'approved', auth.uid(), now(), trim(coalesce(p_approval_note, '')))
  returning id into v_approval_id;
  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values (v_organization_id, p_supplier_invoice_id, 'accounts_approved',
    'Supplier Invoice approved by Accounts for Xero readiness.',
    jsonb_build_object('accounts_approval_id', v_approval_id, 'finance_hash', v_hash), auth.uid());
  return v_approval_id;
end;
$$;

revoke all on function public.record_supplier_invoice_accounts_approval(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_supplier_invoice_accounts_approval(uuid, uuid, text, text) to authenticated;

commit;
