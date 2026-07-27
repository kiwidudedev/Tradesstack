import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getProviderMappingPreviewSecondaryText,
  ProviderMappingPreviewItem,
} from "./ProviderMappingPreviewItem";

describe("ProviderMappingPreviewItem", () => {
  it("shows the payment claim source without changing or duplicating the item title", () => {
    const markup = renderToStaticMarkup(
      <ProviderMappingPreviewItem
        row={{
          title: "Steel Stud Wall",
          description: "Steel Stud Wall",
          sourceDocumentKind: "project_claim",
          sourceDocumentNumber: "26028-CL-01",
        }}
      />
    );

    expect(markup).toContain("Steel Stud Wall");
    expect(markup).toContain("Source: Payment Claim 26028-CL-01");
    expect(markup.match(/Steel Stud Wall/g)).toHaveLength(1);
  });

  it("falls back to the human-readable document type when the parent is missing", () => {
    expect(
      getProviderMappingPreviewSecondaryText({
        description: "Steel Stud Wall",
        sourceDocumentKind: "project_claim",
        sourceDocumentNumber: null,
      })
    ).toBe("Source: Payment Claim");
  });

  it("retains the existing description when no source context exists", () => {
    expect(
      getProviderMappingPreviewSecondaryText({
        description: "Supply and install",
        sourceDocumentKind: null,
        sourceDocumentNumber: null,
      })
    ).toBe("Supply and install");
  });

  it("formats non-payment-claim source kinds without exposing identifiers", () => {
    expect(
      getProviderMappingPreviewSecondaryText({
        description: "Original description",
        sourceDocumentKind: "project_variation",
        sourceDocumentNumber: "26028-VAR-03",
      })
    ).toBe("Source: Variation 26028-VAR-03");
  });
});
