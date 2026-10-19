import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({
  ibmPlexSans: { className: "ibm" },
  interMedium: { className: "inter" },
}));

import {
  SupplierInvoiceTeamApprovalPanel,
  type SupplierInvoiceTeamApprovalGroup,
  type SupplierInvoiceTeamApprovalRow,
} from "./SupplierInvoiceTeamApprovalPanel";

function row(overrides: Partial<SupplierInvoiceTeamApprovalRow> = {}): SupplierInvoiceTeamApprovalRow {
  return {
    allocationId: "allocation-1",
    invoiceLine: "Synthetic commissioning materials",
    purchaseOrderLine: "13mm standard GIB",
    amount: 110,
    status: "approved",
    reviewer: "corey",
    comment: null,
    reviewedAt: "2026-10-19T02:15:00.000Z",
    ...overrides,
  };
}

function group(overrides: Partial<SupplierInvoiceTeamApprovalGroup> = {}): SupplierInvoiceTeamApprovalGroup {
  return {
    purchaseOrderId: "po-1",
    purchaseOrderNumber: "26002-PO-01",
    href: "/app/projects/np-control-tower/preconstruction/purchase-orders/po-1",
    rows: [row()],
    ...overrides,
  };
}

function render(overrides: Partial<React.ComponentProps<typeof SupplierInvoiceTeamApprovalPanel>> = {}) {
  return renderToStaticMarkup(
    <SupplierInvoiceTeamApprovalPanel
      status="approved"
      groups={[group()]}
      canSend={false}
      hasBeenSent
      sending={false}
      onSend={vi.fn()}
      {...overrides}
    />,
  );
}

describe("SupplierInvoiceTeamApprovalPanel", () => {
  it("presents a finished approval without a banner or explanatory paragraphs", () => {
    const html = render();
    expect(html).toContain("Team approval");
    expect(html).toContain("PO 26002-PO-01");
    expect(html).toContain("Synthetic commissioning materials");
    expect(html).toContain("13mm standard GIB");
    expect(html).toContain("NZ$110.00");
    expect(html).toContain("Approved by corey");
    expect(html).toContain("19 October 2026");
    expect(html).toContain("1 of 1 line approved");
    expect(html).toContain('aria-label="Approved"');
    expect(html).not.toContain("The project team reviews each matched invoice line");
    expect(html).not.toContain("Accounting");
    expect(html).not.toContain("<table");
  });

  it("keeps the PO reference as a single link to the Purchase Order", () => {
    const html = render();
    expect(html.match(/PO 26002-PO-01/g)).toHaveLength(1);
    expect(html).toContain('href="/app/projects/np-control-tower/preconstruction/purchase-orders/po-1"');
  });

  it("offers a concise submission action and disables it while operational checks remain", () => {
    const html = render({
      status: "not_sent",
      canSend: true,
      hasBeenSent: false,
      blockers: ["Match a Purchase Order before site review."],
    });
    expect(html).toContain("Not submitted");
    expect(html).toContain("Send this invoice to the project team for approval.");
    expect(html).toContain("Before sending");
    expect(html).toContain("Match a Purchase Order before site review.");
    expect(html).toContain("Send for team approval");
    expect(html).toContain("disabled");
  });

  it("shows awaiting review with a review link and pending line status", () => {
    const html = render({
      status: "waiting",
      groups: [group({ rows: [row({ status: "waiting", reviewer: null, reviewedAt: null })] })],
    });
    expect(html).toContain("Awaiting review");
    expect(html).toContain("Review the invoice lines before approving.");
    expect(html).toContain("Review lines");
    expect(html).toContain("Pending");
    expect(html).toContain("0 of 1 line approved");
  });

  it("distinguishes partial approval and multiple reviewers", () => {
    const html = render({
      status: "partially_reviewed",
      groups: [group({ rows: [
        row({ allocationId: "approved", reviewer: "corey" }),
        row({ allocationId: "pending", invoiceLine: "Second line", status: "waiting", reviewer: null, reviewedAt: null }),
      ] })],
    });
    expect(html).toContain("Partially approved");
    expect(html).toContain("1 of 2 lines approved");
    expect(html).toContain("Some lines still need a decision.");
    expect(html).toContain("corey");
    expect(html).not.toContain("Approved by corey");
  });

  it("shows changes required with the declined line and comment", () => {
    const html = render({
      status: "declined",
      groups: [group({ rows: [
        row({ allocationId: "approved" }),
        row({ allocationId: "declined", invoiceLine: "Disputed materials", status: "declined", comment: "Quantity does not match the delivery docket." }),
      ] })],
    });
    expect(html).toContain("Changes required");
    expect(html).toContain("Declined");
    expect(html).toContain("Quantity does not match the delivery docket.");
    expect(html).toContain("Update the declined line, then send the invoice again.");
    expect(html).toContain("1 of 2 lines approved");
  });

  it("offers re-review when the invoice changed after approval", () => {
    const html = render({ status: "invalidated", canSend: true, hasBeenSent: true });
    expect(html).toContain("Review again");
    expect(html).toContain("The invoice changed after review.");
    expect(html).toContain("Send again");
  });

  it("keeps the no-PO state compact and free of duplicate empty-state text", () => {
    const html = render({ status: "not_required", groups: [] });
    expect(html).toContain("This invoice does not need team approval.");
    expect(html).not.toContain("No purchase orders are linked to this invoice.");
  });

  it("lists each Purchase Order once when several are linked", () => {
    const html = render({
      groups: [
        group({ purchaseOrderId: "po-1", purchaseOrderNumber: "26002-PO-01", href: "/po-1" }),
        group({ purchaseOrderId: "po-2", purchaseOrderNumber: "26002-PO-02", href: "/po-2", rows: [row({ allocationId: "two" })] }),
      ],
    });
    expect(html).toContain("2 purchase orders");
    expect(html.match(/PO 26002-PO-01/g)).toHaveLength(1);
    expect(html.match(/PO 26002-PO-02/g)).toHaveLength(1);
  });
});
