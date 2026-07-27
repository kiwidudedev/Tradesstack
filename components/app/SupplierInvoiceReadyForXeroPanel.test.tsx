import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({
  ibmPlexSans: { className: "ibm" },
  interMedium: { className: "inter" },
}));

import { SupplierInvoiceReadyForXeroPanel } from "./SupplierInvoiceReadyForXeroPanel";

function render(onResolveGst?: () => void) {
  return renderToStaticMarkup(
    <SupplierInvoiceReadyForXeroPanel
      status="issue"
      message="GST could not be validated."
      canCreate={false}
      creating={false}
      showNoPoReason={false}
      noPoReason=""
      noPoExplanation=""
      onNoPoReasonChange={vi.fn()}
      onNoPoExplanationChange={vi.fn()}
      onCreate={vi.fn()}
      onResolveGst={onResolveGst}
    />,
  );
}

describe("SupplierInvoiceReadyForXeroPanel GST exception", () => {
  it("does not expose GST controls in the normal issue presentation", () => {
    expect(render()).not.toContain("Resolve GST");
  });

  it("shows the compact Accounts exception action only when supplied", () => {
    expect(render(vi.fn())).toContain("Resolve GST");
  });
});
