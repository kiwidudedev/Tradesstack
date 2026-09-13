-- Forward procedure fixes combine stricter target behavior with repository safeguards.

begin;

-- Preserve repository contract: private.decide_supplier_invoice_site_review_phase_ab_legacy(uuid,text,text,jsonb,uuid[])

CREATE OR REPLACE FUNCTION private.decide_supplier_invoice_site_review_phase_ab_legacy(p_decision_id uuid, p_decision text, p_note text, p_accepted_variances jsonb DEFAULT '[]'::jsonb, p_disputed_allocation_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS uuid
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

-- Preserve repository contract: private.record_supplier_invoice_accounts_approval_phase_ab_legacy(uuid,uuid,text,text)

CREATE OR REPLACE FUNCTION private.record_supplier_invoice_accounts_approval_phase_ab_legacy(p_supplier_invoice_id uuid, p_site_review_submission_id uuid, p_expected_finance_hash text, p_approval_note text DEFAULT ''::text) RETURNS uuid
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

-- Preserve repository contract: private.save_supplier_invoice_capture_phase_ab_legacy(uuid,uuid,text,text,date,date,text,pg_catalog.numeric,pg_catalog.numeric,pg_catalog.numeric,text,text,jsonb,pg_catalog.bool)

CREATE OR REPLACE FUNCTION private.save_supplier_invoice_capture_phase_ab_legacy(p_invoice_id uuid, p_supplier_id uuid, p_invoice_number text, p_supplier_po_reference text, p_invoice_date date, p_due_date date, p_currency text, p_subtotal numeric, p_tax_total numeric, p_total numeric, p_notes text, p_source text, p_lines jsonb DEFAULT '[]'::jsonb, p_create boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

-- Preserve repository contract: private.submit_supplier_invoice_for_site_review_phase_ab_legacy(uuid,text)

CREATE OR REPLACE FUNCTION private.submit_supplier_invoice_for_site_review_phase_ab_legacy(p_supplier_invoice_id uuid, p_expected_finance_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

-- Preserve repository contract: public.create_takeoff_commercial_item(jsonb)

CREATE OR REPLACE FUNCTION public.create_takeoff_commercial_item(p_input jsonb) RETURNS TABLE(id uuid, organization_id uuid, opportunity_id uuid, project_id uuid, source_type text, source_workbook_id uuid, source_worksheet_id uuid, source_sheet_id uuid, source_takeoff_measurement_id uuid, source_range text, source_signature text, source_version integer, source_status text, stale_reason_code text, last_source_checked_at timestamp with time zone, last_source_changed_at timestamp with time zone, description text, quantity numeric, unit text, rate numeric, total numeric, snapshot_json jsonb, source_link_json jsonb, ucl_classification text, ucl_validation_status text, created_by uuid, updated_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_variable
declare
  actor_user_id uuid := auth.uid();
  org_id uuid := nullif(p_input->>'organizationId', '')::uuid;
  opp_id uuid := nullif(p_input->>'opportunityId', '')::uuid;
  commercial_project_id uuid := nullif(p_input->>'projectId', '')::uuid;
  data_project_id uuid := nullif(p_input->>'dataProjectId', '')::uuid;
  measurement_id uuid := nullif(p_input->>'measurementId', '')::uuid;
  commercial_description text := btrim(coalesce(p_input->>'description', ''));
  commercial_rate numeric := round(coalesce(nullif(p_input->>'rate', '')::numeric, 0), 2);
  measurement public.takeoff_measurements%rowtype;
  inserted_row public.commercial_items%rowtype;
  commercial_quantity numeric;
  signature text;
  snapshot jsonb;
  source_link jsonb;
  resolved_owner_type text;
  resolved_owner_slug text;
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  if org_id is null or opp_id is null or data_project_id is null or measurement_id is null then
    raise exception 'organizationId, opportunityId, dataProjectId, and measurementId are required' using errcode = 'TS422';
  end if;
  if commercial_description = '' then raise exception 'Description is required' using errcode = 'TS422'; end if;
  if commercial_rate < 0 then raise exception 'Rate must be non-negative' using errcode = 'TS422'; end if;
  if not public.has_org_permission(org_id, 'leads.opportunities.write') then
    raise exception 'Not authorized to capture Takeoff commercial items for this organization';
  end if;
  if not exists (
    select 1 from public.organization_opportunities o
    where o.organization_id = org_id and o.id = opp_id
      and o.workspace_project_id = data_project_id
  ) then
    raise exception 'Takeoff data Project does not belong to the Opportunity lineage';
  end if;
  if commercial_project_id is not null and not exists (
    select 1 from public.organization_projects p
    where p.organization_id = org_id and p.id = commercial_project_id and p.source_opportunity_id = opp_id
  ) then raise exception 'Commercial Project does not belong to the Opportunity'; end if;
  if commercial_project_id is not null then
    select 'project', p.slug into resolved_owner_type, resolved_owner_slug
    from public.organization_projects p
    where p.organization_id = org_id and p.id = commercial_project_id;
  else
    select 'opportunity', o.slug into resolved_owner_type, resolved_owner_slug
    from public.organization_opportunities o
    where o.organization_id = org_id and o.id = opp_id;
  end if;

  select m.* into measurement from public.takeoff_measurements m
  where m.organization_id = org_id and m.project_id = data_project_id and m.id = measurement_id
    and m.status = 'active' and m.measurement_kind in ('line', 'area', 'count')
    and exists (select 1 from public.project_drawing_sets ds where ds.id = m.drawing_set_id and ds.organization_id = org_id and ds.project_id = data_project_id)
    and exists (select 1 from public.takeoff_pages page where page.id = m.page_id and page.organization_id = org_id and page.project_id = data_project_id and page.drawing_set_id = m.drawing_set_id);
  if not found then raise exception 'Active committed measurement was not found for the authorized Takeoff Project' using errcode = 'TS404'; end if;

  commercial_quantity := round(case when measurement.measurement_kind = 'count'
    then coalesce(measurement.count_value, measurement.display_value)
    else measurement.display_value end, 3);
  if commercial_quantity is null or commercial_quantity < 0 then
    raise exception 'Measurement does not have a valid committed display quantity' using errcode = 'TS422';
  end if;
  if nullif(btrim(coalesce(measurement.display_unit, '')), '') is null then
    raise exception 'Measurement does not have a committed display unit' using errcode = 'TS422';
  end if;

  snapshot := jsonb_build_object(
    'version', 1, 'sourceType', 'takeoff_measurement',
    'measurementId', measurement.id, 'measurementVersion', measurement.version,
    'measurementUpdatedAt', measurement.updated_at, 'measurementKind', measurement.measurement_kind,
    'drawingSetId', measurement.drawing_set_id, 'pageId', measurement.page_id,
    'measurementName', measurement.name, 'measurementDescription', measurement.description,
    'displayQuantity', commercial_quantity, 'displayUnit', measurement.display_unit,
    'commercialDescription', commercial_description, 'commercialQuantity', commercial_quantity,
    'commercialRate', commercial_rate, 'commercialTotal', round(commercial_quantity * commercial_rate, 2)
  );
  signature := md5(snapshot::text);
  source_link := jsonb_build_object(
    'sourceType', 'takeoff_measurement', 'measurementId', measurement.id,
    'measurementVersion', measurement.version, 'drawingSetId', measurement.drawing_set_id,
    'measurementUpdatedAt', measurement.updated_at, 'pageId', measurement.page_id,
    'ownerType', resolved_owner_type, 'ownerSlug', resolved_owner_slug,
    'opportunityId', opp_id, 'projectId', commercial_project_id,
    'dataProjectId', data_project_id, 'capturedAt', timezone('utc', now())
  );

  select item.* into inserted_row from public.commercial_items item
  where item.organization_id = org_id and item.opportunity_id = opp_id
    and item.source_type = 'takeoff_measurement'
    and item.source_takeoff_measurement_id = measurement.id
    and item.source_signature = signature
  order by item.created_at desc limit 1;

  if not found then
    insert into public.commercial_items (
      organization_id, opportunity_id, project_id, source_type,
      source_takeoff_measurement_id, source_signature, source_version, source_status,
      last_source_checked_at, description, quantity, unit, rate, total,
      snapshot_json, source_link_json, locked_metadata_json,
      ucl_validation_status, created_by, updated_by
    ) values (
      org_id, opp_id, commercial_project_id, 'takeoff_measurement',
      measurement.id, signature, measurement.version, 'current', timezone('utc', now()),
      commercial_description, commercial_quantity, measurement.display_unit, commercial_rate,
      round(commercial_quantity * commercial_rate, 2), snapshot, source_link, '{}'::jsonb,
      'not_reviewed', actor_user_id, actor_user_id
    ) returning * into inserted_row;
  end if;

  return query select inserted_row.id, inserted_row.organization_id, inserted_row.opportunity_id,
    inserted_row.project_id, inserted_row.source_type, inserted_row.source_workbook_id,
    inserted_row.source_worksheet_id, inserted_row.source_sheet_id,
    inserted_row.source_takeoff_measurement_id, inserted_row.source_range,
    inserted_row.source_signature, inserted_row.source_version, inserted_row.source_status,
    inserted_row.stale_reason_code, inserted_row.last_source_checked_at,
    inserted_row.last_source_changed_at, inserted_row.description, inserted_row.quantity,
    inserted_row.unit, inserted_row.rate, inserted_row.total, inserted_row.snapshot_json,
    inserted_row.source_link_json, inserted_row.ucl_classification,
    inserted_row.ucl_validation_status, inserted_row.created_by, inserted_row.updated_by,
    inserted_row.created_at, inserted_row.updated_at;
end;
$$;

-- Preserve repository contract: public.delete_opportunity_pricing_workbook_sheet(uuid,uuid,uuid,uuid,uuid,uuid)

CREATE OR REPLACE FUNCTION public.delete_opportunity_pricing_workbook_sheet(p_organization_id uuid, p_opportunity_id uuid, p_workbook_id uuid, p_sheet_id uuid, p_user_id uuid, p_next_sheet_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_deleted_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_next_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_remaining_count integer;
begin
  select *
  into v_deleted_sheet
  from public.opportunity_pricing_workbook_sheets
  where id = p_sheet_id
    and workbook_id = p_workbook_id
    and organization_id = p_organization_id
    and opportunity_id = p_opportunity_id;

  if not found then
    raise exception 'Worksheet page not found.';
  end if;

  select count(*)
  into v_remaining_count
  from public.opportunity_pricing_workbook_sheets
  where workbook_id = p_workbook_id
    and organization_id = p_organization_id
    and opportunity_id = p_opportunity_id;

  if v_remaining_count <= 1 then
    raise exception 'You must keep at least one worksheet page.';
  end if;

  delete from public.opportunity_pricing_workbook_sheets
  where id = v_deleted_sheet.id;

  if p_next_sheet_id is not null then
    select *
    into v_next_sheet
    from public.opportunity_pricing_workbook_sheets
    where id = p_next_sheet_id
      and workbook_id = p_workbook_id
      and organization_id = p_organization_id
      and opportunity_id = p_opportunity_id;
  end if;

  if v_deleted_sheet.is_default then
    if v_next_sheet.id is null then
      select *
      into v_next_sheet
      from public.opportunity_pricing_workbook_sheets
      where workbook_id = p_workbook_id
        and organization_id = p_organization_id
        and opportunity_id = p_opportunity_id
      order by sheet_order asc, created_at asc
      limit 1;
    end if;

    update public.opportunity_pricing_workbook_sheets
    set
      is_default = (id = v_next_sheet.id),
      updated_by = p_user_id
    where workbook_id = p_workbook_id
      and organization_id = p_organization_id
      and opportunity_id = p_opportunity_id
      and (is_default = true or id = v_next_sheet.id);

    if v_next_sheet.id is not null then
      update public.opportunity_pricing_worksheets
      set
        name = v_next_sheet.name,
        worksheet_data = v_next_sheet.worksheet_data,
        pricing_summary = v_next_sheet.pricing_summary,
        extracted_pricing_data = v_next_sheet.extracted_pricing_data,
        version = v_next_sheet.version,
        updated_by = p_user_id
      where id = p_workbook_id
        and organization_id = p_organization_id
        and opportunity_id = p_opportunity_id
        and archived_at is null;
    end if;
  end if;

  return jsonb_build_object(
    'deletedSheetId', v_deleted_sheet.id,
    'nextSheetId', coalesce(v_next_sheet.id, p_next_sheet_id)
  );
end;
$$;

-- Preserve repository contract: public.get_accounting_sync_completion_evidence(uuid,uuid)

CREATE OR REPLACE FUNCTION public.get_accounting_sync_completion_evidence(p_organization_id uuid, p_job_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_job public.organization_accounting_sync_jobs%rowtype;
  v_document public.organization_accounting_documents%rowtype;
  v_revision public.organization_accounting_document_revisions%rowtype;
  v_attempt public.organization_accounting_revision_attempts%rowtype;
  v_observation public.organization_accounting_remote_observations%rowtype;
  v_projection public.organization_accounting_projections%rowtype;
  v_proposal public.organization_accounting_push_proposals%rowtype;
  v_source_matches boolean := false;
  v_revision_id uuid;
  v_document_id uuid;
  v_attempt_id uuid;
begin
  if p_organization_id is null or p_job_id is null then
    return null;
  end if;

  select *
  into v_job
  from public.organization_accounting_sync_jobs
  where organization_id = p_organization_id
    and id = p_job_id;

  if not found then
    return null;
  end if;

  v_revision_id := nullif(v_job.request_payload ->> 'accountingRevisionId', '')::uuid;
  v_document_id := nullif(v_job.request_payload ->> 'accountingDocumentId', '')::uuid;
  v_attempt_id := nullif(v_job.request_payload ->> 'attemptId', '')::uuid;

  if v_revision_id is not null then
    select *
    into v_revision
    from public.organization_accounting_document_revisions
    where organization_id = p_organization_id
      and id = v_revision_id;
    if found then
      v_document_id := v_revision.accounting_document_id;
    end if;
  end if;

  if v_document_id is null then
    return null;
  end if;

  select *
  into v_document
  from public.organization_accounting_documents
  where organization_id = p_organization_id
    and id = v_document_id;
  if not found then
    return null;
  end if;

  if v_revision_id is null then
    v_revision_id := v_document.active_accounting_revision_id;
    if v_revision_id is not null then
      select *
      into v_revision
      from public.organization_accounting_document_revisions
      where organization_id = p_organization_id
        and id = v_revision_id;
    end if;
  end if;

  if v_revision.id is null
    or v_document.active_accounting_revision_id is distinct from v_revision.id
    or v_revision.lifecycle_state <> 'succeeded'
    or v_revision.external_document_id is null
  then
    return null;
  end if;

  if v_attempt_id is not null then
    select *
    into v_attempt
    from public.organization_accounting_revision_attempts
    where organization_id = p_organization_id
      and id = v_attempt_id
      and accounting_revision_id = v_revision.id;
  else
    select *
    into v_attempt
    from public.organization_accounting_revision_attempts
    where organization_id = p_organization_id
      and accounting_revision_id = v_revision.id
      and attempt_intent in ('create', 'update', 'replace')
    order by attempt_sequence desc, id desc
    limit 1;
  end if;

  if v_attempt.id is null or v_attempt.queue_state <> 'succeeded' then
    return null;
  end if;

  select *
  into v_proposal
  from public.organization_accounting_push_proposals
  where organization_id = p_organization_id
    and source_document_type = v_revision.source_document_type
    and source_document_id = v_revision.source_document_id
    and preview_hash = v_revision.confirmation_preview_hash
  order by created_at desc, id desc
  limit 1;

  if v_proposal.id is not null then
    if v_revision.source_document_type = 'project_claim' then
      select claim.updated_at =
        v_proposal.source_optimistic_revision::timestamptz
      into v_source_matches
      from public.project_claims claim
      where claim.organization_id = p_organization_id
        and claim.id = v_revision.source_document_id;
    elsif v_revision.source_document_type = 'retention_claim' then
      select claim.submitted_at =
        v_proposal.source_optimistic_revision::timestamptz
      into v_source_matches
      from public.retention_claims claim
      where claim.organization_id = p_organization_id
        and claim.id = v_revision.source_document_id;
    end if;
  end if;

  select *
  into v_observation
  from public.organization_accounting_remote_observations
  where organization_id = p_organization_id
    and accounting_document_id = v_document.id
    and accounting_revision_id = v_revision.id
    and external_document_id = v_revision.external_document_id
  order by observed_at desc, id desc
  limit 1;

  select *
  into v_projection
  from public.organization_accounting_projections
  where organization_id = p_organization_id
    and accounting_document_id = v_document.id
    and accounting_revision_id = v_revision.id
    and remote_observation_id = v_observation.id;

  if v_observation.id is null
    or v_projection.id is null
    or v_projection.divergent
    or v_observation.content_hash is distinct from v_revision.provider_content_hash
    or v_observation.tenant_id is distinct from v_revision.tenant_id
    or v_observation.external_document_id is distinct from v_revision.external_document_id
  then
    return null;
  end if;

  return jsonb_build_object(
    'organizationId', v_job.organization_id,
    'projectId', v_revision.project_id,
    'claimId', v_revision.source_document_id,
    'sourceDocumentType', v_revision.source_document_type,
    'accountingDocumentId', v_document.id,
    'activeRevisionId', v_revision.id,
    'observationId', v_observation.id,
    'projectionId', v_projection.id,
    'attemptId', v_attempt.id,
    'jobId', v_job.id,
    'invoiceId', v_revision.external_document_id,
    'invoiceNumber', v_revision.external_document_number,
    'operation', v_revision.revision_intent,
    'providerStatus', coalesce(v_observation.raw_status, v_revision.requested_provider_status),
    'subtotalMinor', v_revision.subtotal_minor,
    'taxMinor', v_revision.tax_minor,
    'totalMinor', v_revision.total_minor,
    'paidMinor', coalesce(v_projection.amount_paid_minor, 0),
    'creditedMinor', coalesce(v_projection.amount_credited_minor, 0),
    'outstandingMinor', coalesce(v_projection.amount_due_minor, v_revision.total_minor),
    'observedAt', v_observation.observed_at,
    'completedAt', v_attempt.completed_at,
    'sourceMatches', coalesce(v_source_matches, false),
    'document', to_jsonb(v_document),
    'revision', to_jsonb(v_revision),
    'observation', to_jsonb(v_observation),
    'projection', to_jsonb(v_projection)
  );
end;
$$;

-- Preserve repository contract: public.has_permission(text)

CREATE OR REPLACE FUNCTION public.has_permission(p_permission_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  current_member_id uuid;
  current_role text;
  override_value boolean;
  role_default boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  if p_permission_key is null or btrim(p_permission_key) = '' then
    return false;
  end if;

  select m.id, m.role
  into current_member_id, current_role
  from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;

  if current_member_id is null then
    return false;
  end if;

  if p_permission_key in ('settings.users_permissions.manage') then
    return current_role = 'owner';
  end if;

  select o.is_allowed
  into override_value
  from public.member_permission_overrides o
  where o.organization_member_id = current_member_id
    and o.permission_key = p_permission_key
  limit 1;

  if found then
    return coalesce(override_value, false);
  end if;

  select rp.is_allowed
  into role_default
  from public.role_permissions rp
  where rp.role = current_role
    and rp.permission_key = p_permission_key
  limit 1;

  return coalesce(role_default, false);
end;
$$;

-- Preserve repository contract: public.is_admin_of_organization(uuid)

CREATE OR REPLACE FUNCTION public.is_admin_of_organization(target_organization_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- Preserve target contract: public.log_organization_invite_audit()

CREATE OR REPLACE FUNCTION "public"."log_organization_invite_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  event_name text;
  payload jsonb;
begin
  if tg_op = 'INSERT' then
    event_name := 'created';
    payload := jsonb_build_object(
      'invited_email', new.invited_email,
      'role', new.role,
      'status', new.status,
      'expires_at', new.expires_at
    );

    insert into public.organization_invite_audit_logs (organization_id, invite_id, actor_user_id, event_type, details)
    values (new.organization_id, new.id, auth.uid(), event_name, payload);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.role is distinct from new.role then
      event_name := 'role_changed';
    elsif old.expires_at is distinct from new.expires_at and new.status = 'pending' then
      event_name := 'resent';
    elsif old.status is distinct from new.status then
      event_name := 'status_changed';
    else
      event_name := 'updated';
    end if;

    payload := jsonb_build_object(
      'from', jsonb_build_object('role', old.role, 'status', old.status, 'expires_at', old.expires_at),
      'to', jsonb_build_object('role', new.role, 'status', new.status, 'expires_at', new.expires_at),
      'invited_email', new.invited_email
    );

    insert into public.organization_invite_audit_logs (organization_id, invite_id, actor_user_id, event_type, details)
    values (new.organization_id, new.id, auth.uid(), event_name, payload);
    return new;
  elsif tg_op = 'DELETE' then
    event_name := 'deleted';
    payload := jsonb_build_object(
      'deleted_invite_id', old.id,
      'invited_email', old.invited_email,
      'role', old.role,
      'status', old.status
    );

    -- critical fix
    insert into public.organization_invite_audit_logs (organization_id, invite_id, actor_user_id, event_type, details)
    values (old.organization_id, null, auth.uid(), event_name, payload);

    return old;
  end if;

  return null;
end;
$$;

-- Preserve target contract: public.resolve_cost_item_document_context(text,uuid)

CREATE OR REPLACE FUNCTION "public"."resolve_cost_item_document_context"("p_document_kind" "text", "p_document_id" "uuid") RETURNS TABLE("organization_id" "uuid", "project_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_document_kind = 'opportunity_quote' then
    return query
    select o.organization_id, o.workspace_project_id
    from public.opportunity_quotes q
    join public.organization_opportunities o
      on o.id = q.opportunity_id
     and o.organization_id = q.organization_id
    where q.id = p_document_id
      and o.workspace_project_id is not null
      and public.has_org_permission(o.organization_id, 'leads.opportunities.write');
    return;
  end if;

  if p_document_kind = 'project_quote' then
    return query
    select q.organization_id, q.project_id
    from public.project_quotes q
    where q.id = p_document_id
      and public.has_org_permission(q.organization_id, 'quotes.write');
    return;
  end if;

  if p_document_kind = 'project_variation' then
    return query
    select v.organization_id, v.project_id
    from public.project_variations v
    where v.id = p_document_id
      and public.has_org_permission(v.organization_id, 'variations.write');
    return;
  end if;

  if p_document_kind = 'project_purchase_order' then
    return query
    select po.organization_id, po.project_id
    from public.project_purchase_orders po
    where po.id = p_document_id
      and public.has_org_permission(po.organization_id, 'purchase_orders.write');
    return;
  end if;

  if p_document_kind = 'project_claim' then
    return query
    select c.organization_id, c.project_id
    from public.project_claims c
    where c.id = p_document_id
      and public.is_member_of_organization(c.organization_id);
    return;
  end if;

  raise exception 'Unsupported CostItem document kind: %', p_document_kind;
end;
$$;

-- Preserve repository contract: public.sync_organization_tax_policy_version()

CREATE OR REPLACE FUNCTION public.sync_organization_tax_policy_version() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_now timestamptz := statement_timestamp();
  v_country text := upper(coalesce(nullif((to_jsonb(new)->>'country'), ''), 'UNKNOWN'));
  v_rate numeric := coalesce(nullif(to_jsonb(new)->>'default_tax_rate', '')::numeric, 0);
  v_basis text := case when lower(coalesce((to_jsonb(new)->>'default_tax_mode'), '')) like '%incl%' then 'inclusive' else 'exclusive' end;
  v_registration text := case lower(coalesce((to_jsonb(new)->>'tax_registration_status'), '')) when 'registered' then 'registered' when 'unregistered' then 'unregistered' else 'unknown' end;
begin
  if (to_jsonb(new)->>'country') is not distinct from (to_jsonb(old)->>'country')
    and (to_jsonb(new)->>'default_tax_mode') is not distinct from (to_jsonb(old)->>'default_tax_mode')
    and nullif(to_jsonb(new)->>'default_tax_rate', '')::numeric is not distinct from nullif(to_jsonb(old)->>'default_tax_rate', '')::numeric
    and (to_jsonb(new)->>'tax_registration_status') is not distinct from (to_jsonb(old)->>'tax_registration_status') then return new; end if;
  update public.organization_tax_policies set effective_to = v_now
  where organization_id = new.id and effective_to is null;
  insert into public.organization_tax_policies (
    organization_id, jurisdiction_code, tax_name, registration_status,
    comparison_basis, standard_rate, supports_inclusive_exclusive,
    effective_from, policy_source, created_by
  ) values (
    new.id, v_country,
    case when v_country in ('NZ', 'NEW ZEALAND', 'AU', 'AUSTRALIA') then 'GST' else 'Tax' end,
    v_registration, v_basis, v_rate,
    v_country in ('NZ', 'NEW ZEALAND', 'AU', 'AUSTRALIA'),
    v_now, 'organization_settings', auth.uid()
  );
  return new;
end;
$$;

-- Preserve target contract: public.sync_project_job_todo_completion_fields()

CREATE OR REPLACE FUNCTION "public"."sync_project_job_todo_completion_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := case when new.is_completed then 'Done' else 'To Do' end;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status = old.status and new.is_completed is distinct from old.is_completed then
    if new.is_completed then
      new.status := 'Done';
    elsif old.status in ('Done', 'Archived', 'Complete') then
      new.status := 'To Do';
    end if;
  end if;

  new.is_completed := new.status in ('Done', 'Archived', 'Complete');

  if new.is_completed then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists "set_project_po_assignments_updated_at" on public.project_purchase_order_assignments;

CREATE OR REPLACE TRIGGER "set_project_po_assignments_updated_at" BEFORE UPDATE ON "public"."project_purchase_order_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();

drop trigger if exists "validate_project_purchase_order_assignment_trigger" on public.project_purchase_order_assignments;

CREATE OR REPLACE TRIGGER "validate_project_purchase_order_assignment_trigger" BEFORE INSERT OR UPDATE ON "public"."project_purchase_order_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_project_purchase_order_assignment"();

drop trigger if exists organizations_sync_tax_policy_version on public.organizations;

CREATE TRIGGER organizations_sync_tax_policy_version AFTER UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.sync_organization_tax_policy_version();

commit;
