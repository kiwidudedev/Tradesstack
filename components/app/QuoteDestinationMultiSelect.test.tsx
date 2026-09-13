import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  QuoteDestinationMultiSelect,
  filterQuoteDestinations,
  getQuoteDestinationLabel,
  summarizeQuoteDestinationSelection,
  toggleQuoteDestinationSelection,
} from "@/components/app/QuoteDestinationMultiSelect";

const quotes = [
  { id: "fletcher", quoteNumber: "Q-26008-2", quoteTitle: "Skycity", status: "Draft", updatedAt: null, lineItemCount: 0, recipientName: "Fletcher Construction", revisionNumber: 1 },
  { id: "harbour", quoteNumber: "Q-26008-3", quoteTitle: "Skycity", status: "Draft", updatedAt: null, lineItemCount: 0, recipientName: "Harbour Side Builders", revisionNumber: 2 },
  { id: "metro", quoteNumber: "Q-26008-4", quoteTitle: "Skycity", status: "Draft", updatedAt: null, lineItemCount: 0, recipientName: "Metro Build", revisionNumber: 1 },
];

describe("QuoteDestinationMultiSelect", () => {
  it("retains exact Quote ids while selecting and deselecting destinations", () => {
    const fletcher = toggleQuoteDestinationSelection([], "fletcher", true);
    const both = toggleQuoteDestinationSelection(fletcher, "harbour", true);
    const harbourOnly = toggleQuoteDestinationSelection(both, "fletcher", false);

    expect(fletcher).toEqual(["fletcher"]);
    expect(both).toEqual(["fletcher", "harbour"]);
    expect(harbourOnly).toEqual(["harbour"]);
  });

  it("searches number, recipient, and revision without changing selection", () => {
    expect(filterQuoteDestinations(quotes, "Harbour").map((quote) => quote.id)).toEqual(["harbour"]);
    expect(filterQuoteDestinations(quotes, "Q-26008-2").map((quote) => quote.id)).toEqual(["fletcher"]);
    expect(filterQuoteDestinations(quotes, "R1").map((quote) => quote.id)).toEqual(["harbour"]);
  });

  it("summarizes zero, one, and multiple selections without overflowing labels", () => {
    expect(summarizeQuoteDestinationSelection(quotes, [])).toBe("Select draft Quotes");
    expect(summarizeQuoteDestinationSelection(quotes, ["fletcher"])).toBe("Q-26008-2 · Fletcher Construction · Original");
    expect(summarizeQuoteDestinationSelection(quotes, ["fletcher", "harbour"])).toBe("2 draft Quotes selected");
    expect(getQuoteDestinationLabel(quotes[1])).toBe("Q-26008-3 · Harbour Side Builders · R1");
  });

  it("renders the accessible trigger using the current selection summary", () => {
    const markup = renderToStaticMarkup(createElement(QuoteDestinationMultiSelect, {
      quotes,
      selectedIds: ["fletcher", "harbour"],
      onChange: () => undefined,
    }));

    expect(markup).toContain('aria-label="Draft Quotes"');
    expect(markup).toContain("2 draft Quotes selected");
  });
});
