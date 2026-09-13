import { describe, expect, it } from "vitest";
import {
  classifyXeroJobFailure,
  classifyXeroJobRetry,
  shouldXeroFailureAffectConnectionHealth,
  xeroJobDocumentIdentity,
} from "./job-report";

describe("Xero job recovery report", () => {
  it("keeps document failures at document level", () => {
    const job = {
      job_kind: "xero.sales_invoice.attachment",
      queue_state: "dead_lettered",
      last_error: "Immutable PDF hash does not match the queued attachment.",
    };
    expect(classifyXeroJobFailure(job)).toBe("document_level");
    expect(classifyXeroJobRetry(job)).toBe("operator_review_required");
  });

  it("classifies credential failures as connection-level", () => {
    const job = {
      job_kind: "health_check",
      queue_state: "dead_lettered",
      last_error: "invalid_grant while refreshing token",
    };
    expect(classifyXeroJobFailure(job)).toBe("connection_level");
    expect(classifyXeroJobRetry(job)).toBe("reconnect_required");
  });

  it("reports a document identity without mutating the job", () => {
    expect(xeroJobDocumentIdentity({ accountingDocumentId: "document-1" }))
      .toBe("accountingDocumentId: document-1");
  });

  it.each([
    ["xero.sales_invoice.attachment", "immutable PDF mismatch", null, false],
    ["xero.bill.export", "bill validation failed", null, false],
    ["xero.sales_invoice.sync", "invoice validation failed", null, false],
    ["health_check", "invalid_grant", 401, true],
    ["xero.sales_invoice.sync", "tenant access denied", 403, true],
    ["import_contacts", "request failed", null, true],
  ] as const)(
    "classifies %s health impact without promoting document failures",
    (jobKind, message, httpStatus, expected) => {
      expect(shouldXeroFailureAffectConnectionHealth({ jobKind, message, httpStatus }))
        .toBe(expected);
    },
  );
});
