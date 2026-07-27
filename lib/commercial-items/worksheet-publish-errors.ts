const RAW_LINEAGE_PATTERNS = [
  "Project must belong to the same opportunity",
  "Project must match the opportunity workspace project",
  "Quote line must match the commercial item organization, project, and opportunity scope",
  "This quote is not linked to an opportunity workspace",
];

export function mapWorksheetQuotePublishErrorMessage(message: string | null | undefined) {
  const normalized = message?.trim();
  if (!normalized) {
    return "Unable to add rows to the quote right now.";
  }

  if (normalized === "No valid commercial rows were found in the selected worksheet rows.") {
    return "No priced rows found in this selection.";
  }

  if (normalized === "This quote belongs to a different opportunity.") {
    return normalized;
  }

  if (
    normalized === "This worksheet is not linked to a quote workspace yet." ||
    normalized === "Create quote workspace before publishing"
  ) {
    return normalized;
  }

  if (normalized.includes("Commercial Item") || normalized.includes("commercial item")) {
    return "Unable to complete source linking for one or more rows.";
  }

  if (RAW_LINEAGE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "Unable to add rows to the quote right now.";
  }

  return normalized;
}

export function mapWorksheetPurchaseOrderPublishErrorMessage(message: string | null | undefined) {
  const normalized = message?.trim();
  if (!normalized) {
    return "Unable to add rows to the purchase order.";
  }

  if (normalized === "No valid commercial rows were found in the selected worksheet rows.") {
    return "No priced rows found in this selection.";
  }

  if (normalized === "Purchase Orders are available after this opportunity is converted to a project.") {
    return normalized;
  }

  if (
    normalized.includes("Commercial Item") ||
    normalized.includes("commercial item") ||
    normalized.includes("Commercial item") ||
    normalized.includes("source_link_json") ||
    normalized.includes("locked_metadata_json") ||
    normalized.includes("snapshot_json")
  ) {
    return "Rows were added to the purchase order, but worksheet source linking could not be completed.";
  }

  if (
    normalized.includes("Project must belong to the same opportunity") ||
    normalized.includes("Cannot coerce the result to a single JSON object") ||
    normalized.includes("purchase_order_line") ||
    normalized.includes("commercial_item_document_links")
  ) {
    return "Unable to add rows to the purchase order.";
  }

  return normalized;
}

export function mapWorksheetVariationPublishErrorMessage(message: string | null | undefined) {
  const normalized = message?.trim();
  if (!normalized) {
    return "Unable to add rows to the variation.";
  }

  if (normalized === "No valid commercial rows were found in the selected worksheet rows.") {
    return "No priced rows found in this selection.";
  }

  if (
    normalized === "This variation can no longer be changed from the pricing worksheet." ||
    normalized === "This variation is not linked to an opportunity workspace yet." ||
    normalized === "Add to Variation is only available from variation-owned pricing worksheets."
  ) {
    return normalized;
  }

  if (
    normalized.includes("Commercial Item") ||
    normalized.includes("commercial item") ||
    normalized.includes("commercial_item_document_links") ||
    normalized.includes("variation_line")
  ) {
    return "Rows were added to the variation, but worksheet source linking could not be completed.";
  }

  if (
    normalized.includes("Project must belong to the same opportunity") ||
    normalized.includes("Variation not found") ||
    normalized.includes("Cannot coerce the result to a single JSON object")
  ) {
    return "Unable to add rows to the variation.";
  }

  return normalized;
}
