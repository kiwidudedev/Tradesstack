import { describe, expect, it } from "vitest";
import {
  mapWorksheetPurchaseOrderPublishErrorMessage,
  mapWorksheetQuotePublishErrorMessage,
  mapWorksheetVariationPublishErrorMessage,
} from "@/lib/commercial-items/worksheet-publish-errors";

describe("worksheet publish error mapping", () => {
  it("hides raw lineage errors from the worksheet UI", () => {
    expect(mapWorksheetQuotePublishErrorMessage("Project must belong to the same opportunity")).toBe(
      "Unable to add rows to the quote right now.",
    );
    expect(mapWorksheetQuotePublishErrorMessage("Project must match the opportunity workspace project")).toBe(
      "Unable to add rows to the quote right now.",
    );
  });

  it("hides Commercial Item terminology from the worksheet UI", () => {
    expect(mapWorksheetQuotePublishErrorMessage("Commercial Item linking failed.")).toBe(
      "Unable to complete source linking for one or more rows.",
    );
  });

  it("preserves estimator-friendly messages", () => {
    expect(mapWorksheetQuotePublishErrorMessage("This worksheet is not linked to a quote workspace yet.")).toBe(
      "This worksheet is not linked to a quote workspace yet.",
    );
    expect(mapWorksheetQuotePublishErrorMessage("This quote belongs to a different opportunity.")).toBe(
      "This quote belongs to a different opportunity.",
    );
    expect(
      mapWorksheetQuotePublishErrorMessage("No valid commercial rows were found in the selected worksheet rows."),
    ).toBe("No priced rows found in this selection.");
  });

  it("maps purchase order publishing messages without exposing raw internals", () => {
    expect(
      mapWorksheetPurchaseOrderPublishErrorMessage("Purchase Orders are available after this opportunity is converted to a project."),
    ).toBe("Purchase Orders are available after this opportunity is converted to a project.");
    expect(
      mapWorksheetPurchaseOrderPublishErrorMessage("Commercial item purchase order linking failed."),
    ).toBe("Rows were added to the purchase order, but worksheet source linking could not be completed.");
    expect(
      mapWorksheetPurchaseOrderPublishErrorMessage("commercial_item_document_links constraint failure"),
    ).toBe("Unable to add rows to the purchase order.");
    expect(
      mapWorksheetPurchaseOrderPublishErrorMessage("Cannot coerce the result to a single JSON object"),
    ).toBe("Unable to add rows to the purchase order.");
    expect(
      mapWorksheetPurchaseOrderPublishErrorMessage("source_link_json worksheetVersion must match source_version"),
    ).toBe("Rows were added to the purchase order, but worksheet source linking could not be completed.");
    expect(
      mapWorksheetPurchaseOrderPublishErrorMessage("locked_metadata_json worksheetVersion must match source_version"),
    ).toBe("Rows were added to the purchase order, but worksheet source linking could not be completed.");
  });

  it("maps variation publishing messages without exposing raw internals", () => {
    expect(
      mapWorksheetVariationPublishErrorMessage("This variation can no longer be changed from the pricing worksheet."),
    ).toBe("This variation can no longer be changed from the pricing worksheet.");
    expect(
      mapWorksheetVariationPublishErrorMessage("commercial_item_document_links constraint failure"),
    ).toBe("Unable to add rows to the variation because worksheet source validation failed.");
    expect(
      mapWorksheetVariationPublishErrorMessage("No valid commercial rows were found in the selected worksheet rows."),
    ).toBe("No priced rows found in this selection.");
  });
});
