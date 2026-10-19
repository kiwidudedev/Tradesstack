import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({
  ibmPlexSans: { className: "ibm" },
}));

import { SupplierInvoiceReadyForXeroPanel } from "./SupplierInvoiceReadyForXeroPanel";

function render(overrides: Partial<React.ComponentProps<typeof SupplierInvoiceReadyForXeroPanel>> = {}) {
  return renderToStaticMarkup(
    <SupplierInvoiceReadyForXeroPanel
      status="issue"
      message="Add a Supplier Bills account before creating the Xero bill."
      canCreate={false}
      creating={false}
      showNoPoReason={false}
      noPoReason=""
      noPoExplanation=""
      onNoPoReasonChange={vi.fn()}
      onNoPoExplanationChange={vi.fn()}
      onCreate={vi.fn()}
      {...overrides}
    />,
  );
}

describe("SupplierInvoiceReadyForXeroPanel", () => {
  it("does not expose GST controls in the normal issue presentation", () => {
    expect(render()).not.toContain("Resolve GST");
  });

  it("shows the compact Accounts exception action only when supplied", () => {
    expect(render({ onResolveGst: vi.fn() })).toContain("Resolve GST");
  });

  it("uses a human status label instead of an Issue banner", () => {
    const html = render();
    expect(html).toContain("Ready for Xero");
    expect(html).toContain("Needs attention");
    expect(html).not.toContain(">Issue<");
    expect(html).toContain("Add a Supplier Bills account before creating the Xero bill.");
  });

  it("links to accounting settings when setup is required", () => {
    expect(render({ setupHref: "/app/settings/integrations" })).toContain('href="/app/settings/integrations"');
    expect(render({ setupHref: "/app/settings/integrations" })).toContain("Open accounting settings");
  });

  it("shows the create action only when the invoice is ready", () => {
    const waiting = render({ status: "waiting", message: "Waiting for the project team to review the invoice." });
    expect(waiting).toContain("Waiting");
    expect(waiting).not.toContain("Create Draft Bill in Xero");

    const ready = render({ status: "ready", message: "The invoice is approved and ready to create as a Draft Bill.", canCreate: true });
    expect(ready).toContain("Ready");
    expect(ready).toContain("Create Draft Bill in Xero");
    expect(ready).not.toContain('disabled=""');
  });

  it("explains a permission limit instead of showing a disabled primary action", () => {
    const html = render({ status: "ready", message: "The invoice is approved and ready to create as a Draft Bill.", canCreate: false });
    expect(html).toContain("You do not have permission to create the Draft Bill.");
    expect(html).not.toContain("Create Draft Bill in Xero");
  });

  it("keeps the no-PO reason fields available", () => {
    const html = render({ showNoPoReason: true, noPoReason: "other" });
    expect(html).toContain("Why was no Purchase Order used?");
    expect(html).toContain("Explain the reason");
  });
});
