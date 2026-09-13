import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync("components/app/Sidebar.tsx", "utf8");
const layout = readFileSync("app/app/(workspace)/layout.tsx", "utf8");

describe("Payment Claims company navigation", () => {
  it("adds the requested route near Supplier Invoices", () => {
    expect(sidebar).toContain('label: "Payment Claims"');
    expect(sidebar).toContain('href: "/app/company/payment-claims"');
    expect(sidebar.indexOf('label: "Payment Claims"')).toBeGreaterThan(
      sidebar.indexOf('label: "Supplier Invoices"'),
    );
  });

  it("hides the item unless the approved permission was resolved server-side", () => {
    expect(sidebar).toContain("requiresPaymentClaimsView");
    expect(sidebar).toContain("!canViewPaymentClaims");
    expect(layout).toContain('"accounting.sales_invoices.view"');
    expect(layout).toContain("<Sidebar canViewPaymentClaims={canViewPaymentClaims}");
    expect(layout).toContain("<Topbar canViewPaymentClaims={canViewPaymentClaims}");
  });
});

