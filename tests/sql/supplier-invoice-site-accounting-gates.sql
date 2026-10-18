-- Disposable local fixtures only. No production/provider calls; every fixture rolls back.
--
-- Proves the staged supplier invoice workflow:
--   1. operational site review is possible with no accounting provider,
--      accounting route, account coding or tax treatment configured;
--   2. genuine operational blockers still reject submission;
--   3. accounting coding changes do not invalidate an approved site review;
--   4. Accounts approval remains blocked until required accounting coding and
--      tax treatment are configured, then succeeds;
--   5. cross-organization submission is denied and repeated submission is safe.
begin;

do $test$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  org uuid;
  other_org uuid;
  project uuid := gen_random_uuid();
  supplier uuid := gen_random_uuid();
  po uuid := gen_random_uuid();
  po_line uuid := gen_random_uuid();
  invoice uuid := gen_random_uuid();
  line uuid := gen_random_uuid();
  allocation uuid := gen_random_uuid();
  submission uuid;
  submission_again uuid;
  decision_id uuid;
  op_hash text;
  fin_hash text;
  op_hash_after_coding text;
  fin_hash_after_coding text;
  blocked boolean;
  cost_code uuid := gen_random_uuid();
  route_mapping uuid := gen_random_uuid();
  approval uuid;
  unallocated_invoice uuid := gen_random_uuid();
  unallocated_line uuid := gen_random_uuid();
  cross_org_invoice uuid := gen_random_uuid();
  cross_org_line uuid := gen_random_uuid();
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_id,'gate-owner@example.test','{"organization_name":"Gate fixture"}'),
    (other_id,'gate-other@example.test','{"organization_name":"Other gate fixture"}');
  select id into strict org from public.organizations where created_by=owner_id;
  select id into strict other_org from public.organizations where created_by=other_id;

  insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code)
    values(project,org,owner_id,'Gate project','gate-project','GATE');
  insert into public.organization_suppliers(id,organization_id,created_by,name)
    values(supplier,org,owner_id,'Gate supplier');
  insert into public.project_purchase_orders(id,organization_id,project_id,created_by,purchase_order_title,purchase_order_number,origin,supplier_id,status,total_purchase_order_price)
    values(po,org,project,owner_id,'Gate PO','GATE-PO-1','General Purchase',supplier,'Approved',110);
  insert into public.project_purchase_order_line_items(id,organization_id,project_id,purchase_order_id,description,quantity,unit,rate,total,sort_order,line_uid)
    values(po_line,org,project,po,'Gate line',1,'ea',110,110,0,gen_random_uuid());

  insert into public.supplier_invoices(id,organization_id,supplier_id,invoice_number,invoice_date,subtotal,total,status,source,created_by,notes)
    values(invoice,org,supplier,'GATE-INV-1',current_date,110,110,'Captured','manual',owner_id,'Operational gate fixture');
  insert into public.supplier_invoice_lines(id,organization_id,supplier_invoice_id,description,quantity,unit_price,line_total,tax_amount,sort_order)
    values(line,org,invoice,'Gate line',1,110,110,0,0);
  insert into public.supplier_invoice_line_allocations(
    id,organization_id,supplier_invoice_id,supplier_invoice_line_id,purchase_order_id,purchase_order_line_item_id,project_id,
    allocated_quantity,allocated_amount,matched_amount,cost_item_id,allocation_group_id,allocation_status,match_status,
    accounting_resolution_status,review_status,tax_resolution_status,approval_status
  ) values (
    allocation,org,invoice,line,po,po_line,project,
    1,110,110,null,gen_random_uuid(),'matched','accepted',
    'needs_accounting_setup','needs_accounting_mapping','unresolved','pending'
  );
  insert into public.supplier_invoice_purchase_order_matches(
    organization_id,supplier_invoice_id,purchase_order_id,matched_amount,match_status,match_basis,created_by
  ) values (org,invoice,po,110,'accepted','manual',owner_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  op_hash := public.supplier_invoice_operational_version_hash(invoice);
  fin_hash := public.supplier_invoice_finance_version_hash(invoice);
  if op_hash is null or fin_hash is null then
    raise exception 'Expected both operational and finance hashes';
  end if;
  if op_hash = fin_hash then
    raise exception 'Operational hash must exclude accounting-only allocation fields';
  end if;

  -- 1. Site review succeeds with no accounting configuration at all.
  submission := public.submit_supplier_invoice_for_site_review(invoice, op_hash);
  if submission is null then raise exception 'Operational site submission failed'; end if;
  if not exists (
    select 1 from public.supplier_invoice_site_review_submissions s
    where s.id = submission and s.status = 'submitted'
      and s.operational_hash = op_hash and s.finance_hash = fin_hash
  ) then
    raise exception 'Site submission did not persist the operational and finance hashes';
  end if;
  if (select count(*) from public.supplier_invoice_site_review_decisions d where d.submission_id = submission) <> 1 then
    raise exception 'Expected exactly one site-review decision for the matched PO';
  end if;

  -- 5. Repeated submission is idempotent.
  submission_again := public.submit_supplier_invoice_for_site_review(invoice, op_hash);
  if submission_again is distinct from submission then
    raise exception 'Repeated operational submission was not idempotent';
  end if;

  -- 2. Missing allocation remains an operational blocker.
  insert into public.supplier_invoices(id,organization_id,supplier_id,invoice_number,invoice_date,subtotal,total,status,source,created_by)
    values(unallocated_invoice,org,supplier,'GATE-INV-2',current_date,50,50,'Captured','manual',owner_id);
  insert into public.supplier_invoice_lines(id,organization_id,supplier_invoice_id,description,quantity,unit_price,line_total,tax_amount,sort_order)
    values(unallocated_line,org,unallocated_invoice,'Unallocated line',1,50,50,0,0);
  blocked := false;
  begin
    perform public.submit_supplier_invoice_for_site_review(
      unallocated_invoice, public.supplier_invoice_operational_version_hash(unallocated_invoice)
    );
  exception when others then
    if position('Allocate every Supplier Invoice line' in sqlerrm) > 0 then blocked := true; else raise; end if;
  end;
  if not blocked then raise exception 'Unallocated invoice was not rejected'; end if;

  -- Approve the site review.
  select d.id into decision_id
  from public.supplier_invoice_site_review_decisions d
  where d.submission_id = submission and d.purchase_order_id = po;
  perform public.decide_supplier_invoice_site_review(decision_id, allocation, 'approved', 'Site verified');
  if not exists (
    select 1 from public.supplier_invoice_site_review_submissions s
    where s.id = submission and s.status = 'approved'
  ) then
    raise exception 'Approved site decision did not approve the submission';
  end if;
  if not exists (
    select 1 from public.supplier_invoice_line_allocations a
    where a.id = allocation and a.approval_status = 'approved'
  ) then
    raise exception 'Approved site decision did not approve the allocation';
  end if;

  -- 3. Accounting coding after site approval must not invalidate site review.
  update public.supplier_invoice_line_allocations
  set accounting_route = 'supplier_bill_expense',
      accounting_resolution_status = 'needs_accounting_setup',
      accounting_mapping_id = null
  where id = allocation;
  op_hash_after_coding := public.supplier_invoice_operational_version_hash(invoice);
  fin_hash_after_coding := public.supplier_invoice_finance_version_hash(invoice);
  if op_hash_after_coding <> op_hash then
    raise exception 'Accounting-only coding changed the operational hash';
  end if;
  if fin_hash_after_coding = fin_hash then
    raise exception 'Accounting coding did not change the full finance hash';
  end if;
  if not exists (
    select 1 from public.supplier_invoice_site_review_submissions s
    where s.id = submission and s.status = 'approved'
  ) then
    raise exception 'Accounting coding invalidated the approved site review';
  end if;
  if not exists (
    select 1 from public.supplier_invoice_site_review_decisions d
    where d.id = decision_id and d.decision = 'approved'
  ) then
    raise exception 'Accounting coding invalidated the approved site-review decision';
  end if;
  perform public.decide_supplier_invoice_site_review(decision_id, allocation, 'approved', 'Site verified');
  if not exists (
    select 1 from public.supplier_invoice_site_review_submissions s
    where s.id = submission and s.status = 'approved'
  ) then
    raise exception 'Site decision revalidation failed after accounting coding';
  end if;

  -- 4. Accounts approval is blocked while accounting coding is incomplete.
  execute 'reset role';
  insert into public.supplier_invoice_commercial_approvals(
    organization_id,supplier_invoice_id,status,finance_version_hash,supplier_id,normalized_invoice_number,
    invoice_total,invoice_tax_total,currency,reviewed_by
  ) values (
    org,invoice,'approved',fin_hash_after_coding,supplier,'gate-inv-1',110,0,'NZD',owner_id
  );
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  blocked := false;
  begin
    perform public.record_supplier_invoice_accounts_approval(invoice, submission, fin_hash_after_coding, '');
  exception when others then
    if position('Supplier Bills account' in sqlerrm) > 0 then blocked := true; else raise; end if;
  end;
  if not blocked then raise exception 'Accounts approval accepted missing accounting coding'; end if;

  -- Configure a named Supplier Bills route and a no-tax treatment, then approve.
  execute 'reset role';
  insert into public.organization_cost_codes(id,organization_id,created_by,code,name,external_provider,external_code,is_active)
    values(cost_code,org,owner_id,'GATE-EXP','Gate expense','xero','EXP-100',true);
  insert into public.organization_accounting_route_mappings(id,organization_id,provider,accounting_route,organization_cost_code_id,is_active,created_by_user_id)
    values(route_mapping,org,'xero','supplier_bill_expense',cost_code,true,owner_id);
  update public.supplier_invoice_line_allocations
  set organization_cost_code_id = cost_code,
      accounting_route_mapping_id = route_mapping,
      accounting_route = 'supplier_bill_expense',
      accounting_resolution_status = 'resolved',
      accounting_tax_rate_id = null,
      tax_resolution_status = 'not_applicable'
  where id = allocation;
  update public.supplier_invoice_commercial_approvals
  set finance_version_hash = public.supplier_invoice_finance_version_hash(invoice),
      status = 'approved',
      invalidated_at = null,
      invalidation_reason = null
  where supplier_invoice_id = invoice;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  approval := public.record_supplier_invoice_accounts_approval(
    invoice, submission, public.supplier_invoice_finance_version_hash(invoice), 'Accounts verified'
  );
  if approval is null then raise exception 'Accounts approval failed with valid named-route coding'; end if;
  if not exists (
    select 1 from public.supplier_invoice_accounts_approvals a
    where a.id = approval and a.status = 'approved'
  ) then
    raise exception 'Accounts approval was not persisted';
  end if;

  -- 5. Cross-organization submission is denied.
  execute 'reset role';
  insert into public.supplier_invoices(id,organization_id,supplier_id,invoice_number,invoice_date,subtotal,total,status,source,created_by)
    values(cross_org_invoice,other_org,supplier,'GATE-XORG-1',current_date,10,10,'Captured','manual',other_id);
  insert into public.supplier_invoice_lines(id,organization_id,supplier_invoice_id,description,quantity,unit_price,line_total,tax_amount,sort_order)
    values(cross_org_line,other_org,cross_org_invoice,'Other org line',1,10,10,0,0);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  blocked := false;
  begin
    perform public.submit_supplier_invoice_for_site_review(
      cross_org_invoice, public.supplier_invoice_operational_version_hash(cross_org_invoice)
    );
  exception when others then
    if position('Supplier Invoice not found' in sqlerrm) > 0 then blocked := true; else raise; end if;
  end;
  if not blocked then raise exception 'Cross-organization operational submission was accepted'; end if;

  execute 'reset role';
end $test$;

rollback;
