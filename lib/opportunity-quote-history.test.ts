import { describe, expect, it } from "vitest";
import { selectPreviousOpportunityQuoteRevisions } from "@/lib/opportunity-quote-history";

const original = { revision_id: "original", revision_number: 1 };
const revisionOne = { revision_id: "r1", revision_number: 2 };
const revisionTwo = { revision_id: "r2", revision_number: 3 };

describe("Opportunity quote previous revision selection", () => {
  it("hides history for an original-only current series", () => {
    expect(selectPreviousOpportunityQuoteRevisions({
      rows: [original],
      viewedRevisionId: original.revision_id,
      currentRevisionId: original.revision_id,
      currentRevisionNumber: original.revision_number,
    })).toEqual([]);
  });

  it("excludes the current revision and orders prior revisions newest first", () => {
    expect(selectPreviousOpportunityQuoteRevisions({
      rows: [original, revisionTwo, revisionOne],
      viewedRevisionId: revisionTwo.revision_id,
      currentRevisionId: revisionTwo.revision_id,
      currentRevisionNumber: revisionTwo.revision_number,
    }).map((row) => row.revision_id)).toEqual(["r1", "original"]);
  });

  it("does not label other revisions as Previous Revisions on a historical page", () => {
    expect(selectPreviousOpportunityQuoteRevisions({
      rows: [revisionTwo, revisionOne, original],
      viewedRevisionId: original.revision_id,
      currentRevisionId: revisionTwo.revision_id,
      currentRevisionNumber: original.revision_number,
    })).toEqual([]);
  });
});
