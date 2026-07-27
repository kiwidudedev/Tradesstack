begin;

-- Preserve the existing PO-level RPC for compatibility. The allocation-aware
-- overload is the controlled write boundary for the Team Approval UI.
create function public.decide_supplier_invoice_site_review(
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
    or v_submission.finance_hash <> public.supplier_invoice_finance_version_hash(v_parent.supplier_invoice_id) then
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

revoke all on function public.decide_supplier_invoice_site_review(uuid, uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.decide_supplier_invoice_site_review(uuid, uuid, text, text, jsonb)
  to authenticated;

-- Reset only the review projection for allocations captured by the invalidated
-- finance version. Activity events remain immutable history.
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
  v_allocation_ids uuid[];
begin
  select coalesce(array_agg(distinct allocation_id), '{}')
  into v_allocation_ids
  from public.supplier_invoice_site_review_decisions decision
  cross join lateral unnest(decision.allocation_ids_snapshot) allocation_id
  where decision.supplier_invoice_id = p_supplier_invoice_id
    and decision.decision in ('pending', 'approved', 'disputed');

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

  if cardinality(v_allocation_ids) > 0 then
    perform set_config('tradesstack.site_review_decision', 'on', true);
    update public.supplier_invoice_line_allocations
    set approval_status = 'pending',
        review_status = 'pending',
        approval_notes = '',
        approval_checks_json = '{}'::jsonb,
        reviewed_by_user_id = null,
        reviewed_at = null,
        approved_by_user_id = null,
        approved_at = null
    where supplier_invoice_id = p_supplier_invoice_id
      and id = any(v_allocation_ids);
  end if;
end;
$$;

revoke all on function public.invalidate_supplier_invoice_role_workflow(uuid, text)
  from public, anon, authenticated;
grant execute on function public.invalidate_supplier_invoice_role_workflow(uuid, text)
  to service_role;

commit;
