import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Supplier Bill UCL version retention", () => {
  it("retains the current, latest 25, first 90 days, milestones and held versions", async () => {
    const { selectSupplierBillUclRetentionCandidates } = await import(
      "./supplier-bill-container-retention"
    );
    const versions = Array.from({ length: 31 }, (_, index) => ({
      id: `version-${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 28 - index * 5)).toISOString(),
      milestoneCodes: index === 28 ? ["supplier_bill_payment_changed"] : [],
      retentionHold: index === 29,
    }));

    const candidates = selectSupplierBillUclRetentionCandidates({
      versions,
      currentVersionId: "version-30",
      now: new Date("2026-07-28T00:00:00.000Z"),
    });

    expect(candidates).toContain("version-25");
    expect(candidates).toContain("version-26");
    expect(candidates).toContain("version-27");
    expect(candidates).not.toContain("version-24");
    expect(candidates).not.toContain("version-28");
    expect(candidates).not.toContain("version-29");
    expect(candidates).not.toContain("version-30");
  });

  it("defines preview-only retention with no destructive operation", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync(
      `${process.cwd()}/lib/universal-learning/supplier-bill-container-retention.ts`,
      "utf8",
    ));
    expect(source).toContain("preview_supplier_bill_ucl_container_retention");
    expect(source).not.toMatch(/\.delete\(|cleanup_supplier_bill|purge_supplier_bill/);
  });
});
