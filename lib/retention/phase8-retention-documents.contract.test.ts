import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const service = fs.readFileSync(
  path.join(root, "lib/retention/phase8-retention-documents.ts"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(root, "app/api/retention-claims/[retentionClaimId]/pdf/route.ts"),
  "utf8",
);
const detail = fs.readFileSync(
  path.join(
    root,
    "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
  ),
  "utf8",
);

describe("Phase 8 Retention document application boundary", () => {
  it("uses server RPC authority before storage writes", () => {
    expect(service).toContain("get_retention_claim_document_source");
    expect(service).toContain("record_retention_claim_document");
    expect(service).toContain("createServerSupabaseClient");
    expect(service).toContain("createAdminSupabaseClient");
    expect(service.indexOf('source.claim.status !== "submitted"')).toBeLessThan(
      service.indexOf('.from("retention-claim-documents")'),
    );
    expect(service).not.toContain("createBrowserSupabaseClient");
  });

  it("verifies stored bytes against immutable document evidence on download", () => {
    expect(service).toContain("upsert: false");
    expect(service).not.toContain("upsert: true");
    expect(service).toContain("collisionHash !== pdfSha256");
    expect(service).toContain('createHash("sha256").update(bytes)');
    expect(service).toContain("actualHash !== result.document.pdfSha256");
    expect(service).toContain(
      "bytes.byteLength !== result.document.byteLength",
    );
    expect(route).toContain("X-Retention-Document-SHA256");
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });

  it("retains the historical document service without exposing PDFs in the master workflow", () => {
    expect(detail).toContain("const isSubmitted = claim.status === \"submitted\"");
    expect(detail).not.toContain("Download PDF");
    expect(detail).not.toContain("Generate immutable PDF");
    expect(detail).not.toContain("{isSubmitted && document ? (");
    expect(detail).not.toContain("This PDF is not a tax invoice");
  });

  it("contains no Phase 9 Xero, invoice, or Phase 10 paid attribution workflow", () => {
    expect(service).not.toMatch(/xero|paid_amount|payment allocation/i);
    expect(route).not.toMatch(/xero|invoice|paid_amount/i);
  });
});
