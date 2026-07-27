begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Replace the escaped shorthand with a PostgreSQL-safe POSIX whitespace class.
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
    coalesce(nullif(lower(regexp_replace(trim(coalesce(i.supplier_po_reference, '')), '[[:space:]]+', ' ', 'g')), ''), ''),
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

drop index if exists public.supplier_invoices_org_po_reference_idx;
alter table public.supplier_invoices drop column supplier_po_reference_normalized;
alter table public.supplier_invoices
  add column supplier_po_reference_normalized text
  generated always as (
    nullif(lower(regexp_replace(trim(coalesce(supplier_po_reference, '')), '[[:space:]]+', ' ', 'g')), '')
  ) stored;
create index supplier_invoices_org_po_reference_idx
  on public.supplier_invoices (organization_id, supplier_po_reference_normalized)
  where supplier_po_reference_normalized is not null;

-- Wrap the applied RPCs so stabilization remains effective for existing remote databases.
alter function public.save_supplier_invoice_capture(
  uuid, uuid, text, text, date, date, text, numeric, numeric, numeric, text, text, jsonb, boolean
) rename to save_supplier_invoice_capture_phase_ab_legacy;
alter function public.save_supplier_invoice_capture_phase_ab_legacy(
  uuid, uuid, text, text, date, date, text, numeric, numeric, numeric, text, text, jsonb, boolean
) set schema private;

create function public.save_supplier_invoice_capture(
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
begin
  select m.organization_id into v_organization_id
  from public.organization_members m where m.user_id = auth.uid()
  order by m.created_at limit 1;
  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.capture') then
    raise exception 'You do not have permission to capture Supplier Invoices.';
  end if;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if nullif(v_line ->> 'costCodeId', '') is not null and not exists (
      select 1 from public.organization_cost_codes c
      where c.id = (v_line ->> 'costCodeId')::uuid and c.organization_id = v_organization_id
    ) then raise exception 'A Supplier Invoice line cost code does not belong to this organization.'; end if;
    if nullif(v_line ->> 'projectId', '') is not null and not exists (
      select 1 from public.organization_projects p
      where p.id = (v_line ->> 'projectId')::uuid and p.organization_id = v_organization_id
    ) then raise exception 'A Supplier Invoice line project does not belong to this organization.'; end if;
  end loop;
  return private.save_supplier_invoice_capture_phase_ab_legacy(
    p_invoice_id, p_supplier_id, p_invoice_number, p_supplier_po_reference,
    p_invoice_date, p_due_date, p_currency, p_subtotal, p_tax_total, p_total,
    p_notes, p_source, p_lines, p_create
  );
end;
$$;

revoke all on function private.save_supplier_invoice_capture_phase_ab_legacy(
  uuid, uuid, text, text, date, date, text, numeric, numeric, numeric, text, text, jsonb, boolean
) from public, anon, authenticated;
revoke all on function public.save_supplier_invoice_capture(
  uuid, uuid, text, text, date, date, text, numeric, numeric, numeric, text, text, jsonb, boolean
) from public, anon;
grant execute on function public.save_supplier_invoice_capture(
  uuid, uuid, text, text, date, date, text, numeric, numeric, numeric, text, text, jsonb, boolean
) to authenticated;

alter function public.submit_supplier_invoice_for_site_review(uuid, text)
  rename to submit_supplier_invoice_for_site_review_phase_ab_legacy;
alter function public.submit_supplier_invoice_for_site_review_phase_ab_legacy(uuid, text)
  set schema private;

create function public.submit_supplier_invoice_for_site_review(
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
begin
  perform pg_advisory_xact_lock(hashtextextended(p_supplier_invoice_id::text, 0));
  select m.organization_id into v_organization_id
  from public.organization_members m where m.user_id = auth.uid()
  order by m.created_at limit 1;
  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.submit_site_review') then
    raise exception 'You do not have permission to submit Supplier Invoices for site review.';
  end if;
  select s.id into v_submission_id
  from public.supplier_invoice_site_review_submissions s
  where s.organization_id = v_organization_id
    and s.supplier_invoice_id = p_supplier_invoice_id
    and s.finance_hash = p_expected_finance_hash
    and s.status in ('submitted', 'partially_reviewed', 'approved', 'disputed')
  order by s.submitted_at desc limit 1;
  if v_submission_id is not null then return v_submission_id; end if;
  return private.submit_supplier_invoice_for_site_review_phase_ab_legacy(
    p_supplier_invoice_id, p_expected_finance_hash
  );
end;
$$;

revoke all on function private.submit_supplier_invoice_for_site_review_phase_ab_legacy(uuid, text)
  from public, anon, authenticated;
revoke all on function public.submit_supplier_invoice_for_site_review(uuid, text) from public, anon;
grant execute on function public.submit_supplier_invoice_for_site_review(uuid, text) to authenticated;

alter function public.decide_supplier_invoice_site_review(uuid, text, text, jsonb, uuid[])
  rename to decide_supplier_invoice_site_review_phase_ab_legacy;
alter function public.decide_supplier_invoice_site_review_phase_ab_legacy(uuid, text, text, jsonb, uuid[])
  set schema private;

create function public.decide_supplier_invoice_site_review(
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
  v_organization_id uuid;
  v_existing_decision text;
begin
  select m.organization_id into v_organization_id
  from public.organization_members m where m.user_id = auth.uid()
  order by m.created_at limit 1;
  select d.decision into v_existing_decision
  from public.supplier_invoice_site_review_decisions d
  where d.id = p_decision_id and d.organization_id = v_organization_id
  for update;
  if v_existing_decision is null then raise exception 'Site-review decision not found.'; end if;
  if v_existing_decision <> 'pending' then
    if v_existing_decision = p_decision then return p_decision_id; end if;
    raise exception 'The site-review decision has already been recorded.';
  end if;
  return private.decide_supplier_invoice_site_review_phase_ab_legacy(
    p_decision_id, p_decision, p_note, p_accepted_variances, p_disputed_allocation_ids
  );
end;
$$;

revoke all on function private.decide_supplier_invoice_site_review_phase_ab_legacy(uuid, text, text, jsonb, uuid[])
  from public, anon, authenticated;
revoke all on function public.decide_supplier_invoice_site_review(uuid, text, text, jsonb, uuid[])
  from public, anon;
grant execute on function public.decide_supplier_invoice_site_review(uuid, text, text, jsonb, uuid[])
  to authenticated;

alter function public.record_supplier_invoice_accounts_approval(uuid, uuid, text, text)
  rename to record_supplier_invoice_accounts_approval_phase_ab_legacy;
alter function public.record_supplier_invoice_accounts_approval_phase_ab_legacy(uuid, uuid, text, text)
  set schema private;

create function public.record_supplier_invoice_accounts_approval(
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
begin
  perform pg_advisory_xact_lock(hashtextextended(p_supplier_invoice_id::text, 1));
  select m.organization_id into v_organization_id
  from public.organization_members m where m.user_id = auth.uid()
  order by m.created_at limit 1;
  if v_organization_id is null
    or not public.has_org_permission(v_organization_id, 'supplier_invoices.accounts_approve') then
    raise exception 'You do not have permission to perform final Accounts approval.';
  end if;
  select a.id into v_approval_id
  from public.supplier_invoice_accounts_approvals a
  where a.organization_id = v_organization_id
    and a.supplier_invoice_id = p_supplier_invoice_id
    and a.finance_hash = p_expected_finance_hash
    and a.site_review_submission_id is not distinct from p_site_review_submission_id
    and a.status = 'approved'
  order by a.created_at desc limit 1;
  if v_approval_id is not null then return v_approval_id; end if;
  return private.record_supplier_invoice_accounts_approval_phase_ab_legacy(
    p_supplier_invoice_id, p_site_review_submission_id, p_expected_finance_hash, p_approval_note
  );
end;
$$;

revoke all on function private.record_supplier_invoice_accounts_approval_phase_ab_legacy(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.record_supplier_invoice_accounts_approval(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.record_supplier_invoice_accounts_approval(uuid, uuid, text, text)
  to authenticated;

alter function public.approve_supplier_invoice_commercially(uuid, uuid, text, jsonb, text, text, text)
  rename to approve_supplier_invoice_commercially_phase_ab_legacy;
alter function public.approve_supplier_invoice_commercially_phase_ab_legacy(uuid, uuid, text, jsonb, text, text, text)
  set schema private;

create function public.approve_supplier_invoice_commercially(
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
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'supplier_invoices.accounts_approve') then
    raise exception 'You do not have permission to commercially approve Supplier Invoices.';
  end if;
  return private.approve_supplier_invoice_commercially_phase_ab_legacy(
    p_organization_id, p_supplier_invoice_id, p_expected_finance_hash,
    p_accepted_variances, p_no_po_reason, p_no_po_explanation, p_approval_note
  );
end;
$$;

revoke all on function private.approve_supplier_invoice_commercially_phase_ab_legacy(uuid, uuid, text, jsonb, text, text, text)
  from public, anon, authenticated;
revoke all on function public.approve_supplier_invoice_commercially(uuid, uuid, text, jsonb, text, text, text)
  from public, anon;
grant execute on function public.approve_supplier_invoice_commercially(uuid, uuid, text, jsonb, text, text, text)
  to authenticated;

alter function public.reject_supplier_invoice_commercially(uuid, uuid, text)
  rename to reject_supplier_invoice_commercially_phase_ab_legacy;
alter function public.reject_supplier_invoice_commercially_phase_ab_legacy(uuid, uuid, text)
  set schema private;

create function public.reject_supplier_invoice_commercially(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.has_org_permission(p_organization_id, 'supplier_invoices.accounts_approve') then
    raise exception 'You do not have permission to commercially reject Supplier Invoices.';
  end if;
  return private.reject_supplier_invoice_commercially_phase_ab_legacy(
    p_organization_id, p_supplier_invoice_id, p_reason
  );
end;
$$;

revoke all on function private.reject_supplier_invoice_commercially_phase_ab_legacy(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.reject_supplier_invoice_commercially(uuid, uuid, text) from public, anon;
grant execute on function public.reject_supplier_invoice_commercially(uuid, uuid, text) to authenticated;

create or replace function public.can_view_supplier_invoice_workflow(
  p_organization_id uuid,
  p_supplier_invoice_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and (
        m.role in ('owner', 'admin')
        or (
          m.role in ('qs', 'project_manager')
          and public.has_org_permission(p_organization_id, 'supplier_invoices.view')
          and exists (
            select 1
            from public.supplier_invoice_line_allocations a
            join public.project_members pm
              on pm.organization_id = p_organization_id
             and pm.project_id = a.project_id
             and pm.organization_member_id = m.id
             and pm.is_active
            where a.organization_id = p_organization_id
              and a.supplier_invoice_id = p_supplier_invoice_id
          )
        )
      )
  );
$$;

revoke all on function public.can_view_supplier_invoice_workflow(uuid, uuid) from public, anon;
grant execute on function public.can_view_supplier_invoice_workflow(uuid, uuid) to authenticated;

drop policy if exists "Privileged members can view supplier invoices" on public.supplier_invoices;
create policy "Privileged members can view supplier invoices" on public.supplier_invoices
for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, id));

drop policy if exists "Privileged members can view supplier invoice lines" on public.supplier_invoice_lines;
create policy "Privileged members can view supplier invoice lines" on public.supplier_invoice_lines
for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Privileged members can view supplier invoice documents" on public.supplier_invoice_documents;
create policy "Privileged members can view supplier invoice documents" on public.supplier_invoice_documents
for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Privileged members can view supplier invoice purchase order matches"
  on public.supplier_invoice_purchase_order_matches;
create policy "Privileged members can view supplier invoice purchase order matches"
on public.supplier_invoice_purchase_order_matches for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Privileged members can view supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;
create policy "Privileged members can view supplier invoice line allocations"
on public.supplier_invoice_line_allocations for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Privileged members can view supplier invoice activity events"
  on public.supplier_invoice_activity_events;
create policy "Privileged members can view supplier invoice activity events"
on public.supplier_invoice_activity_events for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Supplier invoice viewers can view site submissions"
  on public.supplier_invoice_site_review_submissions;
create policy "Supplier invoice viewers can view site submissions"
on public.supplier_invoice_site_review_submissions for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Supplier invoice viewers can view site decisions"
  on public.supplier_invoice_site_review_decisions;
create policy "Supplier invoice viewers can view site decisions"
on public.supplier_invoice_site_review_decisions for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Supplier invoice viewers can view accounts approvals"
  on public.supplier_invoice_accounts_approvals;
create policy "Supplier invoice viewers can view accounts approvals"
on public.supplier_invoice_accounts_approvals for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Members can view supplier invoice commercial approvals"
  on public.supplier_invoice_commercial_approvals;
create policy "Members can view supplier invoice commercial approvals"
on public.supplier_invoice_commercial_approvals for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Members can view supplier invoice commercial snapshots"
  on public.supplier_invoice_commercial_line_snapshots;
create policy "Members can view supplier invoice commercial snapshots"
on public.supplier_invoice_commercial_line_snapshots for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

drop policy if exists "Members can view supplier invoice commercial variances"
  on public.supplier_invoice_commercial_variances;
create policy "Members can view supplier invoice commercial variances"
on public.supplier_invoice_commercial_variances for select to authenticated
using (public.can_view_supplier_invoice_workflow(organization_id, supplier_invoice_id));

-- Legacy grants remain for server actions, but direct authenticated writes now require the Accounts permission.
drop policy if exists "Privileged members can create supplier invoices" on public.supplier_invoices;
create policy "Privileged members can create supplier invoices" on public.supplier_invoices
for insert to authenticated
with check (created_by = auth.uid() and public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can update supplier invoices" on public.supplier_invoices;
create policy "Privileged members can update supplier invoices" on public.supplier_invoices
for update to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.capture'))
with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can delete supplier invoices" on public.supplier_invoices;
create policy "Privileged members can delete supplier invoices" on public.supplier_invoices
for delete to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.capture'));

drop policy if exists "Privileged members can create supplier invoice lines" on public.supplier_invoice_lines;
create policy "Privileged members can create supplier invoice lines" on public.supplier_invoice_lines
for insert to authenticated with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can update supplier invoice lines" on public.supplier_invoice_lines;
create policy "Privileged members can update supplier invoice lines" on public.supplier_invoice_lines
for update to authenticated using (public.has_org_permission(organization_id, 'supplier_invoices.capture'))
with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can delete supplier invoice lines" on public.supplier_invoice_lines;
create policy "Privileged members can delete supplier invoice lines" on public.supplier_invoice_lines
for delete to authenticated using (public.has_org_permission(organization_id, 'supplier_invoices.capture'));

drop policy if exists "Privileged members can create supplier invoice documents" on public.supplier_invoice_documents;
create policy "Privileged members can create supplier invoice documents" on public.supplier_invoice_documents
for insert to authenticated with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can delete supplier invoice documents" on public.supplier_invoice_documents;
create policy "Privileged members can delete supplier invoice documents" on public.supplier_invoice_documents
for delete to authenticated using (public.has_org_permission(organization_id, 'supplier_invoices.capture'));

drop policy if exists "Privileged members can create supplier invoice purchase order matches"
  on public.supplier_invoice_purchase_order_matches;
create policy "Privileged members can create supplier invoice purchase order matches"
on public.supplier_invoice_purchase_order_matches for insert to authenticated
with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can update supplier invoice purchase order matches"
  on public.supplier_invoice_purchase_order_matches;
create policy "Privileged members can update supplier invoice purchase order matches"
on public.supplier_invoice_purchase_order_matches for update to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.capture'))
with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can delete supplier invoice purchase order matches"
  on public.supplier_invoice_purchase_order_matches;
create policy "Privileged members can delete supplier invoice purchase order matches"
on public.supplier_invoice_purchase_order_matches for delete to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.capture'));

drop policy if exists "Privileged members can create supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;
create policy "Privileged members can create supplier invoice line allocations"
on public.supplier_invoice_line_allocations for insert to authenticated
with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can update supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;
create policy "Privileged members can update supplier invoice line allocations"
on public.supplier_invoice_line_allocations for update to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.capture'))
with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));
drop policy if exists "Privileged members can delete supplier invoice line allocations"
  on public.supplier_invoice_line_allocations;
create policy "Privileged members can delete supplier invoice line allocations"
on public.supplier_invoice_line_allocations for delete to authenticated
using (public.has_org_permission(organization_id, 'supplier_invoices.capture'));

drop policy if exists "Privileged members can create supplier invoice activity events"
  on public.supplier_invoice_activity_events;
create policy "Privileged members can create supplier invoice activity events"
on public.supplier_invoice_activity_events for insert to authenticated
with check (public.has_org_permission(organization_id, 'supplier_invoices.capture'));

drop policy if exists "Privileged reviewers can create project actual cost events"
  on public.project_actual_cost_events;
create policy "Privileged reviewers can create project actual cost events"
on public.project_actual_cost_events for insert to authenticated
with check (public.has_org_permission(organization_id, 'supplier_invoices.accounts_approve'));

create or replace function public.can_access_supplier_invoice_document_storage_object(
  object_path text,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.supplier_invoices si
    where char_length(coalesce(object_path, '')) > 0
      and array_length(string_to_array(object_path, '/'), 1) >= 4
      and split_part(object_path, '/', 1) = si.organization_id::text
      and split_part(object_path, '/', 2) = 'supplier-invoices'
      and split_part(object_path, '/', 3) = si.id::text
      and case
        when p_permission_key = 'supplier_invoices.view'
          then public.can_view_supplier_invoice_workflow(si.organization_id, si.id)
        else public.has_org_permission(si.organization_id, 'supplier_invoices.capture')
      end
  );
$$;

commit;
