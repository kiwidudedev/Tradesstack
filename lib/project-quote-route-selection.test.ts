import { describe, expect, it } from "vitest";
import { appendSearchParams, selectCanonicalProjectQuote, type ProjectQuoteRouteCandidate } from "@/lib/project-quote-route-selection";

function quote(overrides: Partial<ProjectQuoteRouteCandidate> & { id: string }): ProjectQuoteRouteCandidate {
  return {
    status: "Sent", revision_kind: "tender", revision_number: 1, award_locked_at: null,
    updated_at: "2026-08-20T00:00:00.000Z", created_at: "2026-08-20T00:00:00.000Z", ...overrides,
  };
}

describe("canonical Project quote route selection", () => {
  it("prefers the newest working Draft over accepted evidence", () => {
    expect(selectCanonicalProjectQuote([
      quote({ id: "accepted", status: "Accepted", revision_number: 4, award_locked_at: "2026-08-20T01:00:00.000Z" }),
      quote({ id: "working", status: "Draft", revision_kind: "project_working", revision_number: 5 }),
    ])?.id).toBe("working");
  });

  it("falls back to accepted evidence and then the latest valid quote", () => {
    expect(selectCanonicalProjectQuote([quote({ id: "sent", revision_number: 3 }), quote({ id: "accepted", status: "Accepted", revision_number: 2 })])?.id).toBe("accepted");
    expect(selectCanonicalProjectQuote([quote({ id: "older", revision_number: 1 }), quote({ id: "newer", revision_number: 2 })])?.id).toBe("newer");
  });

  it("deprioritizes only a proven untouched automatic award Draft", () => {
    expect(selectCanonicalProjectQuote([
      quote({ id: "accepted", status: "Accepted", revision_number: 4, award_locked_at: "2026-08-20T01:00:00.000Z" }),
      quote({
        id: "automatic",
        status: "Draft",
        revision_kind: "project_working",
        revision_number: 5,
        is_untouched_automatic_award_draft: true,
      }),
    ])?.id).toBe("accepted");

    expect(selectCanonicalProjectQuote([
      quote({ id: "accepted", status: "Accepted", revision_number: 4, award_locked_at: "2026-08-20T01:00:00.000Z" }),
      quote({ id: "user-draft", status: "Draft", revision_kind: "project_working", revision_number: 5 }),
    ])?.id).toBe("user-draft");
  });

  it("does not let historical tender Drafts outrank an accepted award", () => {
    expect(selectCanonicalProjectQuote([
      quote({ id: "tender-draft-1", status: "Draft", revision_kind: "tender", revision_number: 1 }),
      quote({ id: "tender-draft-2", status: "Draft", revision_kind: "tender", revision_number: 1 }),
      quote({ id: "accepted", status: "Accepted", revision_kind: "tender", revision_number: 1 }),
    ])?.id).toBe("accepted");
  });

  it("keeps an untouched automatic Draft only as a final fallback", () => {
    expect(selectCanonicalProjectQuote([
      quote({
        id: "automatic-only",
        status: "Draft",
        revision_kind: "project_working",
        is_untouched_automatic_award_draft: true,
      }),
    ])?.id).toBe("automatic-only");
  });

  it("prefers a genuine successor when a legacy Draft remains in history", () => {
    expect(selectCanonicalProjectQuote([
      quote({ id: "accepted", status: "Accepted", revision_number: 1 }),
      quote({
        id: "legacy-p1",
        status: "Draft",
        revision_kind: "project_working",
        revision_number: 2,
        is_untouched_automatic_award_draft: true,
      }),
      quote({ id: "explicit-p2", status: "Draft", revision_kind: "project_working", revision_number: 3 }),
    ])?.id).toBe("explicit-p2");
  });

  it("returns null for a no-quote Project", () => expect(selectCanonicalProjectQuote([])).toBeNull());

  it("preserves deep-link query parameters", () => {
    expect(appendSearchParams("/pricing-worksheet/workbook", { sheetId: "sheet-2", view: ["compact", "source"] }))
      .toBe("/pricing-worksheet/workbook?sheetId=sheet-2&view=compact&view=source");
  });
});
