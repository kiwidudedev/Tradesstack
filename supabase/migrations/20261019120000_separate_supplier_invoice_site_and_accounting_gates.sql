-- Separate operational site review from accounting/finance readiness.
--
-- Site review verifies what the site team can actually verify: supplier,
-- invoice/PO relationship, received quantities, allocated amounts and
-- commercial variances. It must not depend on Xero (or any other accounting
-- provider) being connected or on accounting coding being complete.
--
-- Accounting routing, account coding and tax treatment are enforced at Accounts
-- approval (public.record_supplier_invoice_accounts_approval) and again at
-- provider export, where they are genuinely required.
--
-- A site-review submission keeps the full finance hash for historical evidence
-- and adds an operational hash that excludes accounting-only allocation fields.
-- Later accounting coding therefore no longer invalidates an operational
-- approval, while changes to the operational facts still do.
--
-- Legacy accounting_mapping_id allocations remain accepted for historical
-- invoices; current named routes and explicit line account overrides are
-- accepted alongside them.

begin;

alter table public.supplier_invoice_site_review_submissions
  add column if not exists operational_hash text null;

alter table public.supplier_invoice_site_review_submissions
  drop constraint if exists supplier_invoice_site_review_submissions_operational_hash_check;
alter table public.supplier_invoice_site_review_submissions
  add constraint supplier_invoice_site_review_submissions_operational_hash_check
  check (operational_hash is null or char_length(trim(operational_hash)) > 0);

-- The full finance hash now includes every current accounting coding field so
-- that a later route/account/tax change invalidates Accounts approval and the
-- commercial snapshots. Operational site review uses the separate operational
-- hash below and is unaffected by these accounting-only fields.
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
      a.allocated_amount::text,
      coalesce(a.accounting_mapping_id::text, ''),
      coalesce(a.accounting_route, ''),
      coalesce(a.accounting_route_mapping_id::text, ''),
      coalesce(a.organization_cost_code_id::text, ''),
      coalesce(a.account_override_organization_cost_code_id::text, ''),
      coalesce(a.accounting_resolution_status, ''),
      coalesce(a.accounting_tax_rate_id::text, ''),
      a.tax_resolution_status),
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

-- Same operational facts as supplier_invoice_finance_version_hash, without the
-- accounting-only allocation fields (accounting_mapping_id,
-- accounting_tax_rate_id, tax_resolution_status).
create or replace function public.supplier_invoice_operational_version_hash(p_invoice_id uuid)
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
      a.allocated_amount::text, coalesce(a.allocation_status, ''),
      coalesce(a.edit_state, '')),
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

grant execute on function public.supplier_invoice_operational_version_hash(uuid) to authenticated;

-- Public submission wrapper: idempotency now compares the operational hash.
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
    and coalesce(s.operational_hash, s.finance_hash) = p_expected_finance_hash
    and s.status in ('submitted', 'partially_reviewed', 'approved', 'disputed')
  order by s.submitted_at desc limit 1;
  if v_submission_id is not null then return v_submission_id; end if;
  return private.submit_supplier_invoice_for_site_review_phase_ab_legacy(
    p_supplier_invoice_id, p_expected_finance_hash
  );
end;
$$;

-- Operational submission: no accounting route, mapping, tax rate or tax
-- treatment requirement. Genuine operational blockers remain enforced.
CREATE OR REPLACE FUNCTION private.submit_supplier_invoice_for_site_review_phase_ab_legacy(
  p_supplier_invoice_id uuid,
  p_expected_finance_hash text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_organization_id uuid;
  v_submission_id uuid;
  v_finance_hash text;
  v_operational_hash text;
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
  if abs((select coalesce(sum(a.allocated_amount), 0) from public.supplier_invoice_line_allocations a
    where a.supplier_invoice_id = p_supplier_invoice_id) - v_invoice.subtotal) > 0.01
    and abs((select coalesce(sum(a.allocated_amount), 0) from public.supplier_invoice_line_allocations a
    where a.supplier_invoice_id = p_supplier_invoice_id) - v_invoice.total) > 0.01 then
    raise exception 'Allocated amounts do not reconcile to the Supplier Invoice.';
  end if;
  v_finance_hash := public.supplier_invoice_finance_version_hash(p_supplier_invoice_id);
  v_operational_hash := public.supplier_invoice_operational_version_hash(p_supplier_invoice_id);
  if v_operational_hash is null or v_operational_hash <> p_expected_finance_hash then
    raise exception 'Supplier Invoice finance data changed. Refresh and submit again.';
  end if;
  select s.id into v_submission_id
  from public.supplier_invoice_site_review_submissions s
  where s.organization_id = v_organization_id
    and s.supplier_invoice_id = p_supplier_invoice_id
    and coalesce(s.operational_hash, s.finance_hash) = v_operational_hash
    and s.status in ('submitted', 'partially_reviewed', 'approved', 'disputed')
  order by s.submitted_at desc limit 1;
  if v_submission_id is not null then return v_submission_id; end if;

  perform public.invalidate_supplier_invoice_role_workflow(p_supplier_invoice_id, 'Superseded by a new site-review submission.');
  insert into public.supplier_invoice_site_review_submissions (
    organization_id, supplier_invoice_id, finance_hash, operational_hash, submitted_by
  ) values (v_organization_id, p_supplier_invoice_id, v_finance_hash, v_operational_hash, auth.uid())
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
    jsonb_build_object('submission_id', v_submission_id, 'finance_hash', v_finance_hash,
      'operational_hash', v_operational_hash), auth.uid());
  return v_submission_id;
end;
$$;

-- PO-level decision path: validate against the operational hash.
CREATE OR REPLACE FUNCTION private.decide_supplier_invoice_site_review_phase_ab_legacy(
  p_decision_id uuid,
  p_decision text,
  p_note text,
  p_accepted_variances jsonb DEFAULT '[]'::jsonb,
  p_disputed_allocation_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  if not found or coalesce(v_submission.operational_hash, v_submission.finance_hash)
      <> public.supplier_invoice_operational_version_hash(v_decision.supplier_invoice_id) then
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

-- Allocation-aware decision path used by the Team Approval UI.
create or replace function public.decide_supplier_invoice_site_review(
  p_decision_id uuid,
  p_allocation_id uuid,
  p_decision text,
  p_note text,
  p_accepted_variances jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.organization_members%rowtype;
  v_parent public.supplier_invoice_site_review_decisions%rowtype;
  v_submission public.supplier_invoice_site_review_submissions%rowtype;
  v_allocation public.supplier_invoice_line_allocations%rowtype;
  v_parent_pending integer;
  v_parent_approved integer;
  v_parent_disputed integer;
  v_submission_pending integer;
  v_submission_approved integer;
  v_submission_disputed integer;
  v_parent_status text;
  v_submission_status text;
begin
  if p_decision not in ('approved', 'disputed') then
    raise exception 'Choose approved or disputed.';
  end if;
  if p_decision = 'disputed' and char_length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Add a decline comment.';
  end if;
  if jsonb_typeof(coalesce(p_accepted_variances, '[]'::jsonb)) <> 'array' then
    raise exception 'Accepted variances must be an array.';
  end if;

  select * into v_member
  from public.organization_members
  where user_id = auth.uid()
  order by created_at
  limit 1;
  if v_member.id is null
    or not public.has_org_permission(v_member.organization_id, 'supplier_invoices.site_review') then
    raise exception 'You do not have permission to perform site review.';
  end if;

  -- Serialize independent line decisions belonging to the same PO aggregate.
  perform pg_advisory_xact_lock(hashtextextended(p_decision_id::text, 2));

  select * into v_parent
  from public.supplier_invoice_site_review_decisions
  where id = p_decision_id
    and organization_id = v_member.organization_id
    and decision in ('pending', 'approved', 'disputed')
  for update;
  if not found then
    raise exception 'Site-review decision not found or no longer current.';
  end if;

  select * into v_submission
  from public.supplier_invoice_site_review_submissions
  where id = v_parent.submission_id
    and organization_id = v_member.organization_id
    and status in ('submitted', 'partially_reviewed', 'approved', 'disputed')
  for update;
  if not found
    or coalesce(v_submission.operational_hash, v_submission.finance_hash)
      <> public.supplier_invoice_operational_version_hash(v_parent.supplier_invoice_id) then
    raise exception 'The site-review submission is no longer current.';
  end if;

  select * into v_allocation
  from public.supplier_invoice_line_allocations
  where id = p_allocation_id
    and organization_id = v_member.organization_id
  for update;
  if not found
    or not (p_allocation_id = any(v_parent.allocation_ids_snapshot))
    or v_allocation.supplier_invoice_id <> v_parent.supplier_invoice_id
    or v_allocation.purchase_order_id is distinct from v_parent.purchase_order_id
    or v_allocation.project_id is distinct from v_parent.project_id
    or v_allocation.purchase_order_line_item_id is null then
    raise exception 'The allocation does not belong to this current Team Approval request.';
  end if;

  if not exists (
    select 1
    from public.supplier_invoices invoice
    join public.project_purchase_orders purchase_order
      on purchase_order.id = v_allocation.purchase_order_id
     and purchase_order.organization_id = invoice.organization_id
    join public.project_purchase_order_line_items purchase_order_line
      on purchase_order_line.id = v_allocation.purchase_order_line_item_id
     and purchase_order_line.purchase_order_id = purchase_order.id
     and purchase_order_line.organization_id = invoice.organization_id
    join public.supplier_invoice_purchase_order_matches purchase_order_match
      on purchase_order_match.supplier_invoice_id = invoice.id
     and purchase_order_match.purchase_order_id = purchase_order.id
     and purchase_order_match.organization_id = invoice.organization_id
     and purchase_order_match.match_status in ('accepted', 'adjusted')
    where invoice.id = v_parent.supplier_invoice_id
      and invoice.organization_id = v_member.organization_id
      and purchase_order.supplier_id is not distinct from invoice.supplier_id
      and lower(purchase_order.status) <> 'cancelled'
  ) then
    raise exception 'The allocation Purchase Order relationship is no longer valid.';
  end if;

  if v_member.role not in ('owner', 'admin') and not exists (
    select 1
    from public.project_members project_member
    where project_member.organization_id = v_member.organization_id
      and project_member.project_id = v_parent.project_id
      and project_member.organization_member_id = v_member.id
      and project_member.is_active
  ) then
    raise exception 'You may only review Supplier Invoice costs for your assigned projects.';
  end if;

  if v_allocation.approval_status <> 'pending' then
    if v_allocation.approval_status = p_decision
      and v_allocation.approval_checks_json ->> 'siteReviewSubmissionId' = v_submission.id::text then
      return p_decision_id;
    end if;
    raise exception 'This Supplier Invoice line has already been reviewed.';
  end if;

  perform set_config('tradesstack.site_review_decision', 'on', true);
  update public.supplier_invoice_line_allocations
  set approval_status = p_decision,
      review_status = case when p_decision = 'approved' then 'resolved' else 'disputed' end,
      approval_notes = trim(coalesce(p_note, '')),
      approval_checks_json = jsonb_build_object(
        'acceptedVariances', case when p_decision = 'approved' then coalesce(p_accepted_variances, '[]'::jsonb) else '[]'::jsonb end,
        'siteReviewSubmissionId', v_submission.id,
        'siteReviewDecisionId', v_parent.id,
        'financeHash', v_submission.finance_hash
      ),
      reviewed_by_user_id = auth.uid(),
      reviewed_at = now(),
      approved_by_user_id = case when p_decision = 'approved' then auth.uid() else null end,
      approved_at = case when p_decision = 'approved' then now() else null end
  where id = p_allocation_id;

  select
    count(*) filter (where allocation.approval_status = 'pending'),
    count(*) filter (where allocation.approval_status = 'approved'),
    count(*) filter (where allocation.approval_status = 'disputed')
  into v_parent_pending, v_parent_approved, v_parent_disputed
  from unnest(v_parent.allocation_ids_snapshot) allocation_id
  join public.supplier_invoice_line_allocations allocation on allocation.id = allocation_id;

  v_parent_status := case
    when v_parent_disputed > 0 then 'disputed'
    when v_parent_pending = 0 and v_parent_approved > 0 then 'approved'
    else 'pending'
  end;

  update public.supplier_invoice_site_review_decisions
  set decision = v_parent_status,
      reviewer_id = case when v_parent_status = 'pending' then null else auth.uid() end,
      reviewed_at = case when v_parent_status = 'pending' then null else now() end,
      note = case when v_parent_status = 'pending' then '' else trim(coalesce(p_note, '')) end,
      accepted_variances = case
        when v_parent_status = 'approved' then coalesce((
          select jsonb_agg(accepted_variance.value)
          from unnest(v_parent.allocation_ids_snapshot) reviewed_allocation_id
          join public.supplier_invoice_line_allocations reviewed_allocation
            on reviewed_allocation.id = reviewed_allocation_id
          cross join lateral jsonb_array_elements(
            coalesce(reviewed_allocation.approval_checks_json -> 'acceptedVariances', '[]'::jsonb)
          ) accepted_variance(value)
        ), '[]'::jsonb)
        else '[]'::jsonb
      end,
      disputed_allocation_ids = coalesce((
        select array_agg(reviewed_allocation.id order by reviewed_allocation.id)
        from unnest(v_parent.allocation_ids_snapshot) reviewed_allocation_id
        join public.supplier_invoice_line_allocations reviewed_allocation
          on reviewed_allocation.id = reviewed_allocation_id
        where reviewed_allocation.approval_status = 'disputed'
      ), '{}'),
      updated_at = now()
  where id = v_parent.id;

  select
    count(*) filter (where allocation.approval_status = 'pending'),
    count(*) filter (where allocation.approval_status = 'approved'),
    count(*) filter (where allocation.approval_status = 'disputed')
  into v_submission_pending, v_submission_approved, v_submission_disputed
  from (
    select distinct unnest(parent.allocation_ids_snapshot) as allocation_id
    from public.supplier_invoice_site_review_decisions parent
    where parent.submission_id = v_submission.id
  ) submitted
  join public.supplier_invoice_line_allocations allocation on allocation.id = submitted.allocation_id;

  v_submission_status := case
    when v_submission_disputed > 0 then 'disputed'
    when v_submission_pending = 0 and v_submission_approved > 0 then 'approved'
    when v_submission_approved > 0 then 'partially_reviewed'
    else 'submitted'
  end;
  update public.supplier_invoice_site_review_submissions
  set status = v_submission_status,
      updated_at = now()
  where id = v_submission.id;

  insert into public.supplier_invoice_activity_events (
    organization_id, supplier_invoice_id, event_type, message, metadata, created_by
  ) values (
    v_member.organization_id,
    v_parent.supplier_invoice_id,
    case when p_decision = 'approved' then 'site_review_line_approved' else 'site_review_line_disputed' end,
    case when p_decision = 'approved'
      then 'Supplier Invoice line approved by the project team.'
      else 'Supplier Invoice line declined by the project team.'
    end,
    jsonb_build_object(
      'submission_id', v_submission.id,
      'site_review_decision_id', v_parent.id,
      'allocation_id', p_allocation_id,
      'supplier_invoice_line_id', v_allocation.supplier_invoice_line_id,
      'purchase_order_id', v_allocation.purchase_order_id,
      'purchase_order_line_item_id', v_allocation.purchase_order_line_item_id,
      'project_id', v_allocation.project_id,
      'decision', p_decision,
      'comment', trim(coalesce(p_note, '')),
      'accepted_variances', case when p_decision = 'approved' then coalesce(p_accepted_variances, '[]'::jsonb) else '[]'::jsonb end,
      'finance_hash', v_submission.finance_hash
    ),
    auth.uid()
  );

  return p_decision_id;
end;
$$;

-- Accounts approval keeps the full finance hash for accounting lineage, but the
-- site-review decision it depends on is validated with the operational hash so
-- post-review accounting coding does not invalidate the site approval. This is
-- also the authoritative database gate for accounting coding and tax.
CREATE OR REPLACE FUNCTION private.record_supplier_invoice_accounts_approval_phase_ab_legacy(
  p_supplier_invoice_id uuid,
  p_site_review_submission_id uuid,
  p_expected_finance_hash text,
  p_approval_note text DEFAULT ''::text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
        and s.supplier_invoice_id = p_supplier_invoice_id
        and coalesce(s.operational_hash, s.finance_hash)
          = public.supplier_invoice_operational_version_hash(p_supplier_invoice_id)
        and s.status = 'approved') then
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

  -- Accounting coding: named route, explicit line account override, or legacy
  -- mapping. The account must be current and belong to this organization.
  if exists (
    select 1
    from public.supplier_invoice_line_allocations a
    left join public.organization_tradesstack_accounting_mappings legacy_mapping
      on legacy_mapping.id = a.accounting_mapping_id
     and legacy_mapping.organization_id = v_organization_id
     and legacy_mapping.is_active = true
     and (legacy_mapping.project_id is null or legacy_mapping.project_id is not distinct from a.project_id)
    left join public.organization_accounting_route_mappings route_mapping
      on route_mapping.id = a.accounting_route_mapping_id
     and route_mapping.organization_id = v_organization_id
     and route_mapping.accounting_route = 'supplier_bill_expense'
     and route_mapping.is_active = true
     and (route_mapping.project_id is null or route_mapping.project_id is not distinct from a.project_id)
    left join public.organization_cost_codes account
      on account.id = a.organization_cost_code_id
     and account.organization_id = v_organization_id
     and account.is_active = true
    where a.supplier_invoice_id = p_supplier_invoice_id
      and (
        account.id is null
        or not (
          (a.accounting_route = 'supplier_bill_expense'
            and (
              (a.account_override_organization_cost_code_id = account.id)
              or (route_mapping.id is not null
                and route_mapping.organization_cost_code_id = account.id)
            ))
          or (a.accounting_mapping_id is not null
            and legacy_mapping.id is not null
            and legacy_mapping.organization_cost_code_id = account.id
            and a.tradesstack_cost_code is not null
            and legacy_mapping.tradesstack_cost_code = a.tradesstack_cost_code)
        )
      )
  ) then
    raise exception 'Every allocation requires a current Supplier Bills account or explicit line account before Accounts approval.';
  end if;

  -- Tax treatment: not applicable (and no invoice tax), or resolved with a
  -- current active tax rate. Unresolved tax blocks Accounts approval.
  if exists (
    select 1
    from public.supplier_invoice_line_allocations a
    join public.supplier_invoice_lines l
      on l.id = a.supplier_invoice_line_id
     and l.supplier_invoice_id = a.supplier_invoice_id
    where a.supplier_invoice_id = p_supplier_invoice_id
      and (
        a.tax_resolution_status = 'unresolved'
        or (a.tax_resolution_status = 'not_applicable' and l.tax_amount > 0.01)
        or (a.tax_resolution_status = 'resolved'
          and (a.accounting_tax_rate_id is null
            or not exists (
              select 1 from public.organization_accounting_tax_rates t
              where t.id = a.accounting_tax_rate_id
                and t.organization_id = v_organization_id
                and t.is_active = true
            )))
      )
  ) then
    raise exception 'Every allocation requires a current tax treatment before Accounts approval.';
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

-- Accounting-only allocation updates (routing, mapping, tax, review/approval
-- bookkeeping) no longer invalidate an operational site-review decision.
create or replace function public.invalidate_role_workflow_from_invoice_child_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_invoice_id uuid;
begin
  v_invoice_id := case when tg_op = 'DELETE' then old.supplier_invoice_id else new.supplier_invoice_id end;
  if current_setting('tradesstack.site_review_decision', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'supplier_invoice_line_allocations' and tg_op = 'UPDATE' then
    if new.supplier_invoice_id is not distinct from old.supplier_invoice_id
      and new.supplier_invoice_line_id is not distinct from old.supplier_invoice_line_id
      and new.purchase_order_id is not distinct from old.purchase_order_id
      and new.purchase_order_line_item_id is not distinct from old.purchase_order_line_item_id
      and new.project_id is not distinct from old.project_id
      and new.allocation_group_id is not distinct from old.allocation_group_id
      and new.supersedes_allocation_id is not distinct from old.supersedes_allocation_id
      and new.allocation_sequence is not distinct from old.allocation_sequence
      and new.allocated_quantity is not distinct from old.allocated_quantity
      and new.allocated_amount is not distinct from old.allocated_amount
      and new.matched_amount is not distinct from old.matched_amount
      and new.cost_item_id is not distinct from old.cost_item_id
      and new.source_cost_item_id is not distinct from old.source_cost_item_id
      and new.allocation_status is not distinct from old.allocation_status
      and new.edit_state is not distinct from old.edit_state then
      return new;
    end if;
  end if;
  perform public.invalidate_supplier_invoice_role_workflow(v_invoice_id, tg_table_name || ' changed.');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Accounting mapping/tax rate changes must not invalidate operational site
-- review. Commercial approval invalidation is handled by the dedicated
-- accounting-mapping triggers, and Accounts approval staleness is detected by
-- the full finance hash comparison.
create or replace function public.invalidate_role_workflow_from_mapping_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- GST auto-repair is an accounting-stage action. It may be invoked by users
-- who can review/commercially approve invoices (the same users who may set tax
-- through the allocation coding action), not only by final accounts approvers.
-- It invalidates commercial approval so the commercial snapshots are rebuilt,
-- but it must not invalidate an operational site-review decision.
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
  if not public.has_org_permission(p_organization_id, 'supplier_invoices.review') then
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

comment on function public.supplier_invoice_operational_version_hash(uuid) is
  'Operational finance version used by site review; excludes accounting-only allocation coding and tax fields.';
comment on column public.supplier_invoice_site_review_submissions.operational_hash is
  'Operational version at submission time; accounting coding changes do not invalidate site review.';

commit;
