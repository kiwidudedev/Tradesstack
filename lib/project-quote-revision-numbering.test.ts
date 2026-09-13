import { describe, expect, it } from "vitest";
import { nextProjectQuoteRevisionNumber } from "@/lib/project-quote-revision-numbering";

describe("Project quote revision numbering", () => {
  it("creates P1 from the accepted quote number", () => {
    expect(nextProjectQuoteRevisionNumber("Q-26020-4")).toBe("Q-26020-4-P1");
  });

  it("increments an existing Project revision suffix", () => {
    expect(nextProjectQuoteRevisionNumber("Q-26020-4-P1")).toBe("Q-26020-4-P2");
  });
});
