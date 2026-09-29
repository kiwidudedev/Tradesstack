-- Allocation writers now persist named-route setup and mapping outcomes.
-- Retain historical outcomes so existing allocations and reversals remain valid.
alter table public.supplier_invoice_line_allocations
  drop constraint if exists supplier_invoice_line_allocations_accounting_resolution_status_check;

alter table public.supplier_invoice_line_allocations
  add constraint supplier_invoice_line_allocations_accounting_resolution_status_check
  check (accounting_resolution_status in (
    'pending',
    'resolved',
    'fallback',
    'unresolved',
    'classification_review_required',
    'needs_accounting_mapping',
    'needs_accounting_setup',
    'invalid_tradesstack_cost_code'
  ));
