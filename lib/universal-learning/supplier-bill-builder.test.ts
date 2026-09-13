import { describe, expect, it } from "vitest";
import {
  buildSupplierBillUclV2Sections,
  type SupplierBillBuilderRow,
  type SupplierBillV2BuilderInput,
  type SupplierBillV2BuilderResult,
} from "@/lib/universal-learning/supplier-bill-builder";
import {
  SUPPLIER_BILL_UCL_LIMITS,
  SUPPLIER_BILL_UCL_SCHEMA_VERSION,
  validateSupplierBillUclBusinessRecord,
  type SupplierBillUclBusinessRecord,
} from "@/lib/universal-learning/supplier-bill-schema";
import { normalizeSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";

const ORGANIZATION_ID = "org-1";
const INVOICE_ID = "invoice-1";
const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-07-27T01:00:00.000Z";

function mapRows(rows: SupplierBillBuilderRow[]) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

function completeInput(): SupplierBillV2BuilderInput {
  return {
    organizationId: ORGANIZATION_ID,
    row: {
      id: INVOICE_ID,
      organization_id: ORGANIZATION_ID,
      supplier_id: SUPPLIER_ID,
      invoice_number: "BILL-100",
      invoice_date: "2026-07-20",
      due_date: "2026-08-20",
      supplier_po_reference: "SUP-PO-9",
      currency: "NZD",
      status: "Approved",
      source: "document_extraction",
      subtotal: 150,
      tax_total: 22.5,
      total: 172.5,
      tax_amount_mode: "exclusive",
      tax_evidence_json: { source: "PRIVATE TAX EVIDENCE" },
      notes: "Deliver to the project office.",
      created_at: "2026-07-20T01:00:00.000Z",
      updated_at: "2026-07-27T00:30:00.000Z",
    },
    lines: [
      {
        id: "line-2",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        line_uid: "uid-2",
        supplier_item_code: "ITEM-2",
        sort_order: 2,
        description: "Second line",
        quantity: 1,
        unit_price: 50,
        line_total: 50,
        tax_amount: 7.5,
        project_id: "project-1",
        updated_at: "2026-07-21T02:00:00.000Z",
      },
      {
        id: "line-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        line_uid: "uid-1",
        supplier_item_code: "ITEM-1",
        sort_order: 1,
        description: "First line",
        quantity: 2,
        unit_price: 50,
        line_total: 100,
        tax_amount: 15,
        project_id: "project-1",
        updated_at: "2026-07-21T01:00:00.000Z",
        raw_line_text: "PRIVATE RAW OCR LINE",
      },
    ],
    documents: [
      {
        id: "document-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        document_type: "invoice",
        file_name: "supplier-bill.pdf",
        file_path: "PRIVATE/STORAGE/PATH",
        is_current: true,
        superseded_at: null,
        created_at: "2026-07-20T02:00:00.000Z",
      },
      {
        id: "document-old",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        document_type: "invoice",
        file_name: "old.pdf",
        file_path: "PRIVATE/OLD/PATH",
        is_current: false,
        superseded_at: "2026-07-20T02:00:00.000Z",
        created_at: "2026-07-19T02:00:00.000Z",
      },
    ],
    matches: [
      {
        id: "match-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        purchase_order_id: "po-1",
        match_basis: "manual",
        matched_amount: 150,
        match_status: "accepted",
        approval_status: "approved",
        approval_checks_json: {
          supplier: true,
          total: true,
          remaining: null,
        },
        created_at: "2026-07-22T01:00:00.000Z",
      },
    ],
    allocations: [
      {
        id: "allocation-2",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        supplier_invoice_line_id: "line-2",
        allocation_sequence: 1,
        allocated_quantity: 1,
        allocated_amount: 50,
        matched_amount: 50,
        allocation_status: "matched",
        approval_status: "approved",
        project_id: "project-1",
        purchase_order_id: "po-1",
        purchase_order_line_item_id: "po-line-2",
        organization_cost_code_id: "cost-code-2",
        accounting_mapping_id: "mapping-2",
        tradesstack_cost_code: 200,
        tax_resolution_status: "resolved",
        created_at: "2026-07-22T02:00:00.000Z",
      },
      {
        id: "allocation-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        supplier_invoice_line_id: "line-1",
        allocation_sequence: 1,
        allocated_quantity: 2,
        allocated_amount: 100,
        matched_amount: 100,
        allocation_status: "matched",
        approval_status: "approved",
        project_id: "project-1",
        purchase_order_id: "po-1",
        purchase_order_line_item_id: "po-line-1",
        organization_cost_code_id: "cost-code-1",
        accounting_mapping_id: "mapping-1",
        tradesstack_cost_code: 100,
        tax_resolution_status: "resolved",
        created_at: "2026-07-22T01:00:00.000Z",
      },
    ],
    actualCostEvents: [
      {
        id: "cost-posting",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        event_type: "posting",
        event_status: "posted",
        project_id: "project-1",
        purchase_order_id: "po-1",
        purchase_order_line_item_id: "po-line-1",
        amount: 100,
        tax_amount: 15,
        total_amount: 115,
        created_at: "2026-07-25T01:00:00.000Z",
      },
      {
        id: "cost-reversal",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        event_type: "reversal",
        event_status: "posted",
        project_id: "project-1",
        purchase_order_id: "po-1",
        purchase_order_line_item_id: "po-line-1",
        amount: -20,
        tax_amount: -3,
        total_amount: -23,
        created_at: "2026-07-26T01:00:00.000Z",
      },
    ],
    supplier: {
      id: SUPPLIER_ID,
      organization_id: ORGANIZATION_ID,
      company_name: "Example Supplies",
      email: "private@example.test",
      bank_account: "PRIVATE BANK ACCOUNT",
      updated_at: "2026-07-20T00:00:00.000Z",
    },
    purchaseOrdersById: mapRows([
      {
        id: "po-1",
        organization_id: ORGANIZATION_ID,
        project_id: "project-1",
        purchase_order_number: "PO-100",
        status: "Approved",
        total_purchase_order_price: 500,
        updated_at: "2026-07-19T00:00:00.000Z",
      },
    ]),
    purchaseOrderLinesById: mapRows([
      {
        id: "po-line-1",
        organization_id: ORGANIZATION_ID,
        purchase_order_id: "po-1",
        project_id: "project-1",
        description: "Ordered first line",
        quantity: 10,
        rate: 50,
        total: 500,
      },
      {
        id: "po-line-2",
        organization_id: ORGANIZATION_ID,
        purchase_order_id: "po-1",
        project_id: "project-1",
        description: "Ordered second line",
        quantity: 5,
        rate: 50,
        total: 250,
      },
    ]),
    projectsById: mapRows([
      {
        id: "project-1",
        organization_id: ORGANIZATION_ID,
        name: "North Project",
        stage: "Delivery",
      },
    ]),
    extractions: [
      {
        id: "extraction-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        supplier_invoice_document_id: "document-1",
        attempt_number: 2,
        status: "completed",
        schema_version: "supplier-invoice-extraction-v1",
        warnings_json: ["date_normalized"],
        extracted_payload_json: { private: "RAW EXTRACTION PAYLOAD" },
        updated_at: "2026-07-20T03:00:00.000Z",
      },
    ],
    commercialApprovals: [
      {
        id: "commercial-approval-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        status: "approved",
        reviewed_at: "2026-07-24T01:00:00.000Z",
        invalidated_at: null,
        approval_note: "PRIVATE APPROVAL NOTE",
      },
    ],
    commercialSnapshots: [
      {
        id: "snapshot-current-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        commercial_approval_id: "commercial-approval-1",
        supplier_invoice_line_id: "line-1",
        purchase_order_id: "po-1",
        purchase_order_line_item_id: "po-line-1",
        quantity: 2,
        amount: 100,
        created_at: "2026-07-24T01:00:00.000Z",
      },
    ],
    historicalApprovedSnapshots: [
      {
        id: "snapshot-history-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: "invoice-earlier",
        commercial_approval_id: "commercial-approval-earlier",
        purchase_order_line_item_id: "po-line-1",
        quantity: 3,
        amount: 150,
        created_at: "2026-07-01T01:00:00.000Z",
      },
    ],
    commercialVariances: [
      {
        id: "variance-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        commercial_approval_id: "commercial-approval-1",
        variance_key: "quantity_above_remaining",
        variance_type: "quantity",
        severity: "warning",
        variance_amount: 10,
        explanation: "PRIVATE VARIANCE EXPLANATION",
        created_at: "2026-07-24T01:00:00.000Z",
      },
    ],
    siteReviewSubmissions: [
      {
        id: "site-submission-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        status: "completed",
        submitted_at: "2026-07-23T01:00:00.000Z",
        invalidated_at: null,
      },
    ],
    siteReviewDecisions: [
      {
        id: "site-decision-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        submission_id: "site-submission-1",
        decision: "approved",
        reviewed_at: "2026-07-23T02:00:00.000Z",
        invalidated_at: null,
      },
    ],
    accountsApprovals: [
      {
        id: "accounts-approval-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        status: "approved",
        approved_at: "2026-07-24T02:00:00.000Z",
        invalidated_at: null,
      },
    ],
    activityEvents: [
      {
        id: "activity-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        event_type: "accounts_approved",
        message: "PRIVATE ACTIVITY MESSAGE",
        created_at: "2026-07-24T02:00:00.000Z",
      },
    ],
    accountingDocuments: [
      {
        id: "accounting-document-1",
        organization_id: ORGANIZATION_ID,
        local_document_id: INVOICE_ID,
        local_document_type: "supplier_invoice",
        current_version_id: "accounting-version-1",
        export_status: "exported",
        external_document_id: "xero-id-1",
        external_document_number: "XERO-BILL-100",
        attachment_status: "uploaded",
        exported_at: "2026-07-25T02:00:00.000Z",
        last_status_synced_at: "2026-07-26T02:00:00.000Z",
        normalized_external_status: "paid",
        amount_paid: 172.5,
        amount_due: 0,
        fully_paid_at: "2026-07-26T01:30:00.000Z",
        tenant_id: "PRIVATE TENANT",
        access_token: "PRIVATE ACCESS TOKEN",
        updated_at: "2026-07-26T02:00:00.000Z",
      },
    ],
    accountingDocumentLines: [
      {
        id: "accounting-line-1",
        organization_id: ORGANIZATION_ID,
        version_id: "accounting-version-1",
        xero_account_code: "310",
        xero_tax_type: "INPUT2",
        organization_cost_code_id: "cost-code-1",
        accounting_mapping_id: "mapping-1",
        sequence: 1,
      },
      {
        id: "accounting-line-2",
        organization_id: ORGANIZATION_ID,
        version_id: "accounting-version-1",
        xero_account_code: "320",
        xero_tax_type: "INPUT",
        organization_cost_code_id: "cost-code-2",
        accounting_mapping_id: "mapping-2",
        sequence: 2,
      },
    ],
    assembledAt: NOW,
    updatedAt: NOW,
  };
}

function minimumInput(): SupplierBillV2BuilderInput {
  const input = completeInput();
  return {
    ...input,
    row: {
      id: INVOICE_ID,
      organization_id: ORGANIZATION_ID,
      supplier_id: null,
      invoice_number: null,
      invoice_date: null,
      due_date: null,
      currency: "NZD",
      status: "Needs review",
      source: "manual",
      subtotal: 0,
      tax_total: 0,
      total: 0,
      updated_at: NOW,
    },
    lines: [],
    documents: [],
    matches: [],
    allocations: [],
    actualCostEvents: [],
    supplier: null,
    purchaseOrdersById: new Map(),
    purchaseOrderLinesById: new Map(),
    projectsById: new Map(),
    extractions: [],
    commercialApprovals: [],
    commercialSnapshots: [],
    historicalApprovedSnapshots: [],
    commercialVariances: [],
    siteReviewSubmissions: [],
    siteReviewDecisions: [],
    accountsApprovals: [],
    activityEvents: [],
    accountingDocuments: [],
    accountingDocumentLines: [],
  };
}

function asBusinessRecord(
  result: SupplierBillV2BuilderResult,
  input: SupplierBillV2BuilderInput,
): SupplierBillUclBusinessRecord {
  const projectId = result.projectIds.length === 1 ? result.projectIds[0]! : null;
  return {
    containerType: "supplier_invoice",
    source: {
      table: "supplier_invoices",
      sourceId: String(input.row.id),
      sourceVersion: 1,
    },
    organizationId: input.organizationId,
    projectId,
    opportunityId: null,
    supplierId: result.payload.lineage.supplierId,
    supplier: { ...result.payload.sourceEvidence.supplier },
    clientId: null,
    actorUserId: null,
    updatedAt: input.updatedAt,
    status: {
      canonicalStatus: String(input.row.status ?? ""),
      workflowState: result.workflowState,
      approvalState: result.approvalState,
    },
    payload: result.payload,
    linkedContext: result.linkedContext,
    routingContext: result.routingContext,
    signalStrength: result.evidenceStrength,
  };
}

function expectValid(result: SupplierBillV2BuilderResult, input: SupplierBillV2BuilderInput) {
  const validation = validateSupplierBillUclBusinessRecord(asBusinessRecord(result, input));
  expect(validation).toMatchObject({ success: true });
}

describe("buildSupplierBillUclV2Sections", () => {
  it("constructs the complete v2 contract from canonical, bounded evidence", () => {
    const input = completeInput();
    const result = buildSupplierBillUclV2Sections(input);

    expectValid(result, input);
    expect(result.payload.schemaVersion).toBe(SUPPLIER_BILL_UCL_SCHEMA_VERSION);
    expect(result.payload.sourceEvidence.bill).toMatchObject({
      billNumber: "BILL-100",
      billDate: "2026-07-20",
      dueDate: "2026-08-20",
      currency: "NZD",
      supplierPoReference: "SUP-PO-9",
    });
    expect(result.payload.sourceEvidence.supplier).toEqual({
      supplierId: SUPPLIER_ID,
      displayName: "Example Supplies",
    });
    expect(asBusinessRecord(result, input).supplier).toEqual({
      supplierId: SUPPLIER_ID,
      displayName: "Example Supplies",
    });
    expect(result.payload.sourceEvidence.financialTotals).toEqual({
      subtotal: 150,
      taxTotal: 22.5,
      total: 172.5,
      calculatedLineSubtotal: 150,
      calculatedLineTax: 22.5,
      calculatedLineTotal: 172.5,
      headerVariance: 0,
    });
    expect(result.payload.sourceEvidence.billLines.map((line) => line.lineId)).toEqual([
      "line-1",
      "line-2",
    ]);
    expect(result.payload.sourceEvidence.billLines[0]?.poMatchSummary).toMatchObject({
      previouslyApprovedQuantity: 3,
      cumulativeQuantity: 5,
      remainingQuantity: 5,
    });
    expect(result.payload.sourceEvidence.commercialApproval).toMatchObject({
      approvalState: "approved",
      commercialApprovalId: "commercial-approval-1",
      varianceCount: 1,
      varianceCodes: ["quantity_above_remaining"],
    });
    expect(result.payload.sourceEvidence.actualCostPostingSummary).toEqual({
      postingEventCount: 2,
      postedAmount: 100,
      postedTax: 15,
      postedTotal: 115,
      reversalAmount: 23,
      netPostedAmount: 92,
    });
    expect(result.payload.sourceEvidence.xeroSummary).toMatchObject({
      accountingDocumentId: "accounting-document-1",
      externalBillReference: "XERO-BILL-100",
      exportStatus: "exported",
    });
    expect(result.payload.sourceEvidence.paymentSummary).toMatchObject({
      paymentStatus: "paid",
      amountPaid: 172.5,
      amountDue: 0,
    });
    expect(result.routingContext).toEqual({
      readOnly: true,
      organizationCostCodeIds: ["cost-code-1", "cost-code-2"],
      accountingMappingIds: ["mapping-1", "mapping-2"],
      tradesstackCostCodes: ["100", "200"],
      xeroAccountCodes: ["310", "320"],
      xeroTaxTypes: ["INPUT", "INPUT2"],
    });
    expect(result.linkedContext.purchaseOrders[0]).toMatchObject({
      purchaseOrderId: "po-1",
      committedTotal: 500,
    });
    expect(asBusinessRecord(result, input).projectId).toBe("project-1");

    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "PRIVATE RAW OCR LINE",
      "PRIVATE TAX EVIDENCE",
      "PRIVATE/STORAGE/PATH",
      "RAW EXTRACTION PAYLOAD",
      "private@example.test",
      "PRIVATE BANK ACCOUNT",
      "PRIVATE APPROVAL NOTE",
      "PRIVATE VARIANCE EXPLANATION",
      "PRIVATE ACTIVITY MESSAGE",
      "PRIVATE TENANT",
      "PRIVATE ACCESS TOKEN",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("emits a valid minimum bill with nullable supplier and no related records", () => {
    const input = minimumInput();
    const result = buildSupplierBillUclV2Sections(input);

    expectValid(result, input);
    expect(result.projectIds).toEqual([]);
    expect(result.payload.sourceEvidence.supplier).toEqual({
      supplierId: null,
      displayName: null,
    });
    expect(asBusinessRecord(result, input).supplier).toEqual({
      supplierId: null,
      displayName: null,
    });
    expect(result.payload.sourceEvidence.billLines).toEqual([]);
    expect(result.payload.operationalContext.evidenceStrength).toBe("weak");
    expect(result.payload.operationalContext.truncated).toBe(false);
  });

  it.each([
    ["exclusive", 15, "resolved", { taxable: 1, zeroRated: 0, exempt: 0, unresolved: 0 }],
    ["inclusive", 0, "resolved", { taxable: 0, zeroRated: 1, exempt: 0, unresolved: 0 }],
    ["no_tax", 0, "not_applicable", { taxable: 0, zeroRated: 0, exempt: 1, unresolved: 0 }],
    [null, 0, "unresolved", { taxable: 0, zeroRated: 0, exempt: 0, unresolved: 1 }],
  ])(
    "serializes the %s tax treatment without reinterpreting canonical status",
    (amountMode, taxAmount, taxStatus, expected) => {
      const input = completeInput();
      input.row.tax_amount_mode = amountMode;
      input.lines = [input.lines[1]!];
      input.lines[0]!.tax_amount = taxAmount;
      input.allocations = [input.allocations[1]!];
      input.allocations[0]!.tax_resolution_status = taxStatus;

      const result = buildSupplierBillUclV2Sections(input);
      expect(result.payload.sourceEvidence.taxSummary.treatmentCounts).toEqual(expected);
    },
  );

  it("is deterministic across source ordering and excludes assembly time from its content hash", () => {
    const firstInput = completeInput();
    const secondInput = completeInput();
    secondInput.lines.reverse();
    secondInput.allocations.reverse();
    secondInput.actualCostEvents.reverse();
    secondInput.assembledAt = "2026-07-27T02:00:00.000Z";

    const first = buildSupplierBillUclV2Sections(firstInput);
    const second = buildSupplierBillUclV2Sections(secondInput);

    expect(second.payload.sourceEvidence.billLines).toEqual(first.payload.sourceEvidence.billLines);
    expect(second.payload.lineage).toEqual(first.payload.lineage);
    expect(second.payload.provenance.contentHash).toBe(first.payload.provenance.contentHash);
    expect(second.payload.provenance.assembledAt).not.toBe(first.payload.provenance.assembledAt);

    secondInput.lines[0]!.line_total = 51;
    const changed = buildSupplierBillUclV2Sections(secondInput);
    expect(changed.payload.provenance.contentHash).not.toBe(first.payload.provenance.contentHash);
  });

  it("truncates line detail deterministically while retaining complete financial totals", () => {
    const input = minimumInput();
    input.row.subtotal = 101;
    input.row.total = 101;
    input.row.tax_amount_mode = "no_tax";
    input.lines = Array.from({ length: 101 }, (_, index) => ({
      id: `line-${String(index + 1).padStart(3, "0")}`,
      organization_id: ORGANIZATION_ID,
      supplier_invoice_id: INVOICE_ID,
      sort_order: index + 1,
      description: "Line",
      quantity: 1,
      unit_price: 1,
      line_total: 1,
      tax_amount: 0,
    }));

    const result = buildSupplierBillUclV2Sections(input);

    expectValid(result, input);
    expect(result.payload.sourceEvidence.billLines).toHaveLength(SUPPLIER_BILL_UCL_LIMITS.billLines);
    expect(result.payload.sourceEvidence.financialTotals.calculatedLineSubtotal).toBe(101);
    expect(result.payload.operationalContext.totalCounts.billLines).toBe(101);
    expect(result.payload.operationalContext.omittedCounts.billLines).toBe(1);
    expect(result.payload.operationalContext.truncated).toBe(true);
  });

  it("enforces the payload byte budget by omitting bounded detail, never canonical totals", () => {
    const input = minimumInput();
    input.row.subtotal = 10_000;
    input.row.total = 10_000;
    input.row.tax_amount_mode = "no_tax";
    input.lines = Array.from({ length: 100 }, (_, index) => ({
      id: `line-${String(index).padStart(3, "0")}`,
      organization_id: ORGANIZATION_ID,
      supplier_invoice_id: INVOICE_ID,
      sort_order: index,
      description: "A".repeat(2_000),
      quantity: 1,
      unit_price: 100,
      line_total: 100,
      tax_amount: 0,
      project_id: `project-${String(index).padStart(3, "0")}`,
    }));
    input.projectsById = mapRows(input.lines.map((line, index) => ({
      id: line.project_id,
      organization_id: ORGANIZATION_ID,
      name: `Project ${index} ${"P".repeat(400)}`,
      stage: "Delivery",
    })));
    input.purchaseOrdersById = mapRows(Array.from({ length: 20 }, (_, index) => ({
      id: `po-${String(index).padStart(3, "0")}`,
      organization_id: ORGANIZATION_ID,
      project_id: `project-${String(index).padStart(3, "0")}`,
      purchase_order_number: `PO-${index}`,
      status: "Approved",
    })));
    input.purchaseOrderLinesById = mapRows(Array.from({ length: 100 }, (_, index) => ({
      id: `po-line-${String(index).padStart(3, "0")}`,
      organization_id: ORGANIZATION_ID,
      purchase_order_id: `po-${String(index % 20).padStart(3, "0")}`,
      project_id: `project-${String(index).padStart(3, "0")}`,
      quantity: 10,
      rate: 100,
      total: 1_000,
    })));
    input.allocations = input.lines.map((line, index) => ({
      id: `allocation-${String(index).padStart(3, "0")}`,
      organization_id: ORGANIZATION_ID,
      supplier_invoice_id: INVOICE_ID,
      supplier_invoice_line_id: line.id,
      allocation_sequence: 1,
      allocated_quantity: 1,
      allocated_amount: 100,
      allocation_status: "matched",
      approval_status: "approved",
      project_id: line.project_id,
      purchase_order_id: `po-${String(index % 20).padStart(3, "0")}`,
      purchase_order_line_item_id: `po-line-${String(index).padStart(3, "0")}`,
      organization_cost_code_id: `cost-code-${index}`,
      accounting_mapping_id: `mapping-${index}`,
      tax_resolution_status: "not_applicable",
    }));
    input.actualCostEvents = input.lines.map((_line, index) => ({
      id: `event-${String(index).padStart(3, "0")}`,
      organization_id: ORGANIZATION_ID,
      supplier_invoice_id: INVOICE_ID,
      event_type: "posting",
      event_status: "posted",
      project_id: `project-${String(index).padStart(3, "0")}`,
      purchase_order_id: `po-${String(index % 20).padStart(3, "0")}`,
      purchase_order_line_item_id: `po-line-${String(index).padStart(3, "0")}`,
      amount: 100,
      tax_amount: 0,
      total_amount: 100,
    }));

    const result = buildSupplierBillUclV2Sections(input);

    expectValid(result, input);
    expect(new TextEncoder().encode(JSON.stringify(result.payload)).length)
      .toBeLessThanOrEqual(SUPPLIER_BILL_UCL_LIMITS.serializedPayloadBytes);
    expect(result.payload.sourceEvidence.financialTotals).toMatchObject({
      subtotal: 10_000,
      total: 10_000,
      calculatedLineSubtotal: 10_000,
    });
    expect(result.payload.operationalContext.truncated).toBe(true);
    expect(Object.values(result.payload.operationalContext.omittedCounts).some((count) => count > 0))
      .toBe(true);
  });

  it("keeps only current document references and reports bounded extraction counts", () => {
    const input = minimumInput();
    input.documents = [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `document-${String(index + 1).padStart(2, "0")}`,
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        document_type: "invoice",
        file_name: `bill-${index + 1}.pdf`,
        is_current: true,
        superseded_at: null,
        created_at: `2026-07-${String((index % 20) + 1).padStart(2, "0")}T01:00:00.000Z`,
      })),
      {
        id: "document-superseded",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        document_type: "invoice",
        file_name: "superseded.pdf",
        is_current: false,
        superseded_at: NOW,
        created_at: "2026-07-01T01:00:00.000Z",
      },
    ];
    input.extractions = input.documents.map((document, index) => ({
      id: `extraction-${index}`,
      organization_id: ORGANIZATION_ID,
      supplier_invoice_id: INVOICE_ID,
      supplier_invoice_document_id: document.id,
      attempt_number: 1,
      status: index === 0 ? "failed" : "completed",
      schema_version: "v1",
      warnings_json: index === 1 ? ["warning"] : [],
      error_code: index === 0 ? "parse_failed" : null,
      updated_at: NOW,
    }));

    const result = buildSupplierBillUclV2Sections(input);

    expectValid(result, input);
    expect(result.payload.sourceEvidence.attachmentSummary.totalAttachmentCount).toBe(30);
    expect(result.payload.sourceEvidence.attachmentSummary.references).toHaveLength(25);
    expect(result.payload.lineage.currentDocumentIds).not.toContain("document-superseded");
    expect(result.payload.operationalContext.omittedCounts.attachmentReferences).toBe(5);
    expect(result.payload.sourceEvidence.attachmentSummary.warningCount).toBe(1);
    expect(result.payload.sourceEvidence.attachmentSummary.errorCount).toBe(1);
  });

  it.each([
    ["queued", "queued", null, 0],
    ["completed", "completed", null, 0],
    ["failed", "failed", "parse_failed", 1],
  ])(
    "summarizes %s extraction state without serializing extraction content",
    (_label, status, errorCode, expectedErrors) => {
      const input = minimumInput();
      input.documents = [{
        id: "document-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        file_name: "bill.pdf",
        is_current: true,
        superseded_at: null,
        created_at: NOW,
      }];
      input.extractions = [{
        id: "extraction-1",
        organization_id: ORGANIZATION_ID,
        supplier_invoice_id: INVOICE_ID,
        supplier_invoice_document_id: "document-1",
        attempt_number: 1,
        status,
        error_code: errorCode,
        extracted_payload_json: { text: "PRIVATE EXTRACTION CONTENT" },
        updated_at: NOW,
      }];

      const result = buildSupplierBillUclV2Sections(input);
      expect(result.payload.sourceEvidence.attachmentSummary.extractionState).toBe(status);
      expect(result.payload.sourceEvidence.attachmentSummary.errorCount).toBe(expectedErrors);
      expect(JSON.stringify(result)).not.toContain("PRIVATE EXTRACTION CONTENT");
    },
  );

  it("preserves rejected and invalidated commercial outcomes without actor PII or mutable notes", () => {
    const rejectedInput = minimumInput();
    rejectedInput.commercialApprovals = [{
      id: "approval-rejected",
      organization_id: ORGANIZATION_ID,
      supplier_invoice_id: INVOICE_ID,
      status: "rejected",
      reviewed_at: NOW,
      invalidated_at: null,
      reviewed_by: "PRIVATE ACTOR ID",
      approval_note: "PRIVATE REJECTION NOTE",
    }];
    const rejected = buildSupplierBillUclV2Sections(rejectedInput);
    expect(rejected.approvalState).toBe("rejected");
    expect(rejected.payload.sourceEvidence.commercialApproval.approvalState).toBe("rejected");

    const invalidatedInput = minimumInput();
    invalidatedInput.commercialApprovals = [{
      id: "approval-invalidated",
      organization_id: ORGANIZATION_ID,
      supplier_invoice_id: INVOICE_ID,
      status: "approved",
      reviewed_at: NOW,
      invalidated_at: "2026-07-27T02:00:00.000Z",
      invalidation_source: "allocation_changed",
      invalidation_reason: "PRIVATE INVALIDATION EXPLANATION",
    }];
    const invalidated = buildSupplierBillUclV2Sections(invalidatedInput);
    expect(invalidated.approvalState).toBe("invalidated");
    expect(invalidated.payload.sourceEvidence.commercialApproval).toMatchObject({
      commercialApprovalId: null,
      invalidationReasonCode: "allocation_changed",
    });
    expect(JSON.stringify([rejected, invalidated])).not.toMatch(
      /PRIVATE ACTOR ID|PRIVATE REJECTION NOTE|PRIVATE INVALIDATION EXPLANATION/,
    );
  });

  it("excludes cross-organization supplier, PO, allocation, document, ledger, and accounting data", () => {
    const input = minimumInput();
    input.row.supplier_id = "supplier-foreign";
    input.supplier = {
      id: "supplier-foreign",
      organization_id: "org-foreign",
      company_name: "Foreign supplier",
    };
    input.projectsById = mapRows([
      { id: "project-foreign", organization_id: "org-foreign", name: "Foreign project" },
    ]);
    input.purchaseOrdersById = mapRows([
      {
        id: "po-foreign",
        organization_id: "org-foreign",
        project_id: "project-foreign",
        purchase_order_number: "FOREIGN-PO",
      },
    ]);
    input.matches = [{
      id: "match-foreign",
      organization_id: ORGANIZATION_ID,
      supplier_invoice_id: INVOICE_ID,
      purchase_order_id: "po-foreign",
    }];
    input.allocations = [{
      id: "allocation-foreign",
      organization_id: "org-foreign",
      supplier_invoice_id: INVOICE_ID,
      supplier_invoice_line_id: "line-foreign",
      project_id: "project-foreign",
      purchase_order_id: "po-foreign",
      allocated_amount: 999,
    }];
    input.documents = [{
      id: "document-foreign",
      organization_id: "org-foreign",
      supplier_invoice_id: INVOICE_ID,
      file_name: "foreign.pdf",
      is_current: true,
    }];
    input.actualCostEvents = [{
      id: "event-foreign",
      organization_id: "org-foreign",
      supplier_invoice_id: INVOICE_ID,
      event_type: "posting",
      event_status: "posted",
      total_amount: 999,
    }];
    input.accountingDocuments = [{
      id: "accounting-foreign",
      organization_id: "org-foreign",
      local_document_id: INVOICE_ID,
      local_document_type: "supplier_invoice",
      export_status: "exported",
    }];

    const result = buildSupplierBillUclV2Sections(input);

    expectValid(result, input);
    expect(result.payload.sourceEvidence.supplier.supplierId).toBeNull();
    expect(result.payload.sourceEvidence.poMatches).toEqual([]);
    expect(result.payload.sourceEvidence.allocationSummary.allocations).toEqual([]);
    expect(result.payload.sourceEvidence.attachmentSummary.references).toEqual([]);
    expect(result.payload.sourceEvidence.actualCostPostingSummary.postingEventCount).toBe(0);
    expect(result.payload.sourceEvidence.xeroSummary.accountingDocumentId).toBeNull();
    expect(result.projectIds).toEqual([]);
  });

  it.each([
    ["not_exported", null, null, null],
    ["queued", null, null, null],
    ["exported", "authorised", 75, NOW],
    ["exported", "paid", 100, NOW],
    ["failed", null, 0, "2026-07-01T01:00:00.000Z"],
  ])(
    "keeps Xero export state %s separate from synchronized payment state",
    (exportStatus, paymentStatus, amountPaid, refreshedAt) => {
      const input = minimumInput();
      input.accountingDocuments = [{
        id: "accounting-document",
        organization_id: ORGANIZATION_ID,
        local_document_id: INVOICE_ID,
        local_document_type: "supplier_invoice",
        export_status: exportStatus,
        normalized_external_status: paymentStatus,
        amount_paid: amountPaid,
        amount_due: amountPaid === null ? null : 100 - amountPaid,
        last_status_synced_at: refreshedAt,
        updated_at: NOW,
      }];

      const result = buildSupplierBillUclV2Sections(input);
      expect(result.payload.sourceEvidence.xeroSummary.exportStatus).toBe(exportStatus);
      expect(result.payload.sourceEvidence.xeroSummary.retryable).toBe(exportStatus === "failed");
      expect(result.payload.sourceEvidence.paymentSummary.paymentStatus).toBe(paymentStatus);
      expect(result.payload.sourceEvidence.paymentSummary.amountPaid).toBe(amountPaid);
      expect(result.payload.sourceEvidence.paymentSummary.lastRefreshedAt).toBe(
        normalizeSupplierBillUclTimestamp(refreshedAt),
      );
    },
  );
});
