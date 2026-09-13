/**
 * Descriptive dependency metadata for the Supplier Bill UCL v2 payload.
 *
 * This list documents the canonical tables read by the v2 assembler. It is not
 * a source-selection query, scheduler trigger, or invalidation mechanism.
 */
export const SUPPLIER_BILL_UCL_SOURCE_TABLES = [
  "supplier_invoices",
  "supplier_invoice_lines",
  "supplier_invoice_documents",
  "supplier_invoice_document_extractions",
  "supplier_invoice_purchase_order_matches",
  "supplier_invoice_line_allocations",
  "supplier_invoice_site_review_submissions",
  "supplier_invoice_site_review_decisions",
  "supplier_invoice_accounts_approvals",
  "supplier_invoice_commercial_approvals",
  "supplier_invoice_commercial_line_snapshots",
  "supplier_invoice_commercial_variances",
  "supplier_invoice_activity_events",
  "project_purchase_orders",
  "project_purchase_order_line_items",
  "project_actual_cost_events",
  "organization_accounting_documents",
  "organization_accounting_document_lines",
  "organization_projects",
  "organization_suppliers",
] as const;

/**
 * The monthly builder can make an invoice eligible from the owner row or these
 * configured direct children. Their timestamps participate in the effective
 * `(updatedAt, sourceId)` cursor.
 */
export const SUPPLIER_BILL_UCL_MONTHLY_SELECTION_TABLES = [
  "supplier_invoices",
  "supplier_invoice_lines",
  "supplier_invoice_documents",
  "supplier_invoice_purchase_order_matches",
  "supplier_invoice_line_allocations",
  "project_actual_cost_events",
] as const;

/**
 * These tables enrich an already-selected monthly record. They deliberately do
 * not make an invoice eligible by themselves; their independent freshness path
 * is the existing Supplier Bill event-refresh outbox.
 */
export const SUPPLIER_BILL_UCL_MONTHLY_ENRICHMENT_SNAPSHOT_TABLES = [
  "supplier_invoice_document_extractions",
  "supplier_invoice_site_review_submissions",
  "supplier_invoice_site_review_decisions",
  "supplier_invoice_accounts_approvals",
  "supplier_invoice_commercial_approvals",
  "supplier_invoice_commercial_line_snapshots",
  "supplier_invoice_commercial_variances",
  "supplier_invoice_activity_events",
  "project_purchase_orders",
  "project_purchase_order_line_items",
  "organization_accounting_documents",
  "organization_accounting_document_lines",
  "organization_projects",
  "organization_suppliers",
] as const;
