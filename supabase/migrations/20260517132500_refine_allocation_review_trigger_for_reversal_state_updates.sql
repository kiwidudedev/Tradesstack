create or replace function public.prepare_supplier_invoice_line_allocation_review_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  review_fields_changed boolean := false;
begin
  new.approval_notes := coalesce(new.approval_notes, '');
  new.approval_checks_json := coalesce(new.approval_checks_json, '{}'::jsonb);
  new.ai_suggestion_metadata_json := coalesce(new.ai_suggestion_metadata_json, '{}'::jsonb);

  if tg_op = 'INSERT' then
    review_fields_changed := true;
  else
    review_fields_changed := (
      new.review_status is distinct from old.review_status
      or new.approval_status is distinct from old.approval_status
      or new.approval_notes is distinct from old.approval_notes
      or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
      or new.reviewed_at is distinct from old.reviewed_at
      or new.approved_by_user_id is distinct from old.approved_by_user_id
      or new.approved_at is distinct from old.approved_at
      or new.approval_checks_json is distinct from old.approval_checks_json
    );
  end if;

  if review_fields_changed
    and new.review_status in ('reviewed', 'needs_cost_review', 'needs_accounting_review', 'disputed')
    and not public.has_org_permission(new.organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to review supplier invoice line allocations.';
  end if;

  if review_fields_changed
    and new.approval_status in ('approved', 'disputed')
    and not public.has_org_permission(new.organization_id, 'supplier_invoices.review') then
    raise exception 'You do not have permission to approve supplier invoice line allocations.';
  end if;

  if new.approval_status = 'pending' then
    new.approved_by_user_id := null;
    new.approved_at := null;
  elsif new.approved_at is null then
    new.approved_at := now();
  end if;

  if new.review_status = 'pending' then
    new.reviewed_by_user_id := null;
    new.reviewed_at := null;
  elsif new.reviewed_at is null then
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;
