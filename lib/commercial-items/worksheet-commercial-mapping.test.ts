import { describe, expect, it } from "vitest";
import { createDefaultWorksheetData, type WorksheetCell, type WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { recalculateWorksheetFormulas } from "@/lib/opportunity-pricing-worksheet-formulas";
import { buildPublishedWorksheetSelectionFromConfirmedLines } from "@/lib/commercial-items/worksheet-publish-v2";
import {
  buildExplicitMappedCommercialSelection,
  buildWorksheetStructureKey,
  combineExplicitMappedCommercialSelections,
  createEmptyCommercialMappings,
  EMPTY_COMMERCIAL_MAPPING_ERROR,
  resolveWorksheetCommercialMapping,
  type CommercialMappingField,
  type WorksheetCommercialMappingSession,
} from "@/lib/commercial-items/worksheet-commercial-mapping";

function cell(value: string | number, extra?: Partial<WorksheetCell>): WorksheetCell {
  return { value, type: typeof value === "number" ? "number" : "text", formula: null, computedValue: value, displayValue: String(value), metadata: {}, ...extra };
}

function session(worksheet: WorksheetData, fields: Partial<Record<CommercialMappingField, string>>, destination: "quote" | "purchase_order" | "variation" = "quote"): WorksheetCommercialMappingSession {
  const structureKey = buildWorksheetStructureKey(worksheet);
  const mappings = createEmptyCommercialMappings();
  let description: WorksheetCommercialMappingSession["description"] = { mode: "empty" };
  for (const [field, cellKey] of Object.entries(fields) as Array<[CommercialMappingField, string]>) {
    const source = { workbookId: "wb-1", sheetId: "sheet-1", cellKey, structureKey };
    if (field === "description") description = { mode: "worksheet", source };
    else mappings[field] = source;
  }
  return { destination, workbookId: "wb-1", sheetId: "sheet-1", structureKey, startingCell: "A5", capturedSelection: { startRowIndex: 4, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 12 }, capturedSelections: [{ startRowIndex: 4, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 12 }], activeField: null, description, mappings, statusMessage: "" };
}

describe("explicit worksheet commercial mapping", () => {
  it("resolves the reported worksheet only from user-mapped cells", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 10, columnCount: 13 });
    Object.assign(worksheet.cells, {
      A5: cell("92mm 0.75BMT Stud"), B5: cell(100), D5: cell(3.6), E5: cell(0.6), H5: cell("L/m"), I5: cell(4.88), J5: cell(3220.8), K5: cell(6.82), L5: cell(4500), M5: cell(7720.8),
    });
    const mapping = session(worksheet, { description: "A5", quantity: "B5", unit: "H5", rate: "I5", total: "M5" });
    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    expect(resolved.line).toEqual({ description: "92mm 0.75BMT Stud", quantity: 100, unit: "L/m", rate: 4.88, total: 7720.8 });
    expect(resolved.line.rate).not.toBe(3.6);
    expect(resolved.line.total).not.toBe(0.6);
    const explicit = buildExplicitMappedCommercialSelection({ session: mapping, worksheet, resolved });
    expect(explicit.interpretedSelection.selectionRangeLabel).toBe("A5:M5");
    expect(explicit.interpretedSelection.proposedLines[0].rate.anchors[0].cellKey).toBe("I5");
    expect(explicit.interpretedSelection.proposedLines[0].total.anchors[0].cellKey).toBe("M5");
    const published = buildPublishedWorksheetSelectionFromConfirmedLines({
      destination: "quote",
      worksheet,
      selectionRange: mapping.capturedSelection,
      selectionRanges: mapping.capturedSelections,
      workbookId: "wb-1",
      worksheetId: "worksheet-1",
      sheetId: "sheet-1",
      worksheetName: "Pricing",
      sheetName: "Sheet 1",
      interpretedSelection: explicit.interpretedSelection,
      confirmedLines: [explicit.confirmedLine],
    });
    expect((published.commercialRows[0].lockedMetadataJson as { worksheetMetadata?: { worksheetPublishV2?: unknown } }).worksheetMetadata?.worksheetPublishV2).toMatchObject({
      fieldMappings: { description: ["A5"], quantity: ["B5"], unit: ["H5"], rate: ["I5"], total: ["M5"] },
    });
  });

  it("respects an alternative explicit Rate mapping", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 10, columnCount: 13 });
    Object.assign(worksheet.cells, { A5: cell("Stud"), B5: cell(100), K5: cell(6.82) });
    const mapping = session(worksheet, { description: "A5", quantity: "B5", rate: "K5" });
    expect(resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }).line.rate).toBe(6.82);
  });

  it("uses live formula values, formatted display, and preserves zero", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 13 });
    worksheet.cells.A5 = cell("Formula item");
    worksheet.cells.B5 = cell(0);
    worksheet.cells.D5 = cell("=2*4", { formula: "=2*4", computedValue: 8, displayValue: "8" });
    const calculated = recalculateWorksheetFormulas(worksheet);
    const mapping = session(calculated, { description: "A5", quantity: "B5", rate: "D5" });
    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet: calculated, workbookId: "wb-1", sheetId: "sheet-1" });
    expect(resolved.line.quantity).toBe(0);
    expect(resolved.line.rate).toBe(8);
  });

  it("uses raw currency and percentage numbers while showing formatted values", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 13 });
    worksheet.cells.A5 = cell("Formatted item");
    worksheet.cells.B5 = cell(0.25, { metadata: { format: { number: { kind: "percent", decimalPlaces: 0 } } } });
    worksheet.cells.D5 = cell(4.88, { metadata: { format: { number: { kind: "currency", currencyCode: "NZD", decimalPlaces: 2 } } } });
    const mapping = session(worksheet, { description: "A5", quantity: "B5", rate: "D5" });
    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    expect(resolved.line).toMatchObject({ quantity: 0.25, rate: 4.88 });
    expect(resolved.fields.quantity.displayValue).toContain("25%");
    expect(resolved.fields.rate.displayValue).toContain("4.88");
  });

  it("rejects numeric strings, formula errors, sheet and structure mismatches", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 13 });
    worksheet.cells.A5 = cell("Item");
    worksheet.cells.B5 = cell("100");
    worksheet.cells.D5 = cell("#DIV/0!", { formula: "=1/0", computedValue: null, displayValue: "#DIV/0!" });
    const mapping = session(worksheet, { description: "A5", quantity: "B5", rate: "D5" });
    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    expect(resolved.fields.quantity.error).toMatch(/numeric/);
    expect(resolved.fields.rate.error).toMatch(/formula error/);
    expect(resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "other" }).errors).toContain("Mapped source belongs to a different sheet.");
    worksheet.rows.push({ id: "7", index: 6, height: 36 });
    worksheet.rowCount += 1;
    expect(resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }).errors).toContain("Worksheet structure changed after this field was mapped.");
  });

  it("derives a visible effective rate from mapped total", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 5 });
    worksheet.cells.A5 = cell("Item"); worksheet.cells.B5 = cell(100); worksheet.cells.E5 = cell(7720.8);
    const mapping = session(worksheet, { description: "A5", quantity: "B5", total: "E5" });
    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    expect(resolved.effective).toMatchObject({ quantity: 100, rate: 77.208, total: 7720.8, derivedRate: true });
  });

  it("formats the reported floating-point derived-rate warning as currency", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 14, columnCount: 13 });
    worksheet.cells.M13 = cell("=SUM(M11:M12)", {
      formula: "=SUM(M11:M12)",
      computedValue: 46117.075000000004,
      displayValue: "46117.075",
      metadata: { format: { number: { kind: "currency" } } },
    });
    const mapping = session(worksheet, { total: "M13" });
    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });

    expect(resolved.effective).toMatchObject({ quantity: 1, rate: 46117.075000000004, derivedQuantity: true, derivedRate: true });
    expect(resolved.warnings).toContain("Rate will be derived as $46,117.08 from the mapped Total and effective Quantity.");
    expect(resolved.warnings.join(" ")).not.toContain("46117.075000000004");
  });

  const singleFieldCases = [
    { field: "description", cellKey: "A5", quote: [1, 0, 0], purchaseOrder: [0, 0, 0] },
    { field: "quantity", cellKey: "B5", quote: [10, 0, 0], purchaseOrder: [10, 0, 0] },
    { field: "unit", cellKey: "C5", quote: [1, 0, 0], purchaseOrder: [0, 0, 0] },
    { field: "rate", cellKey: "D5", quote: [1, 5, 5], purchaseOrder: [0, 5, 0] },
    { field: "total", cellKey: "E5", quote: [1, 50, 50], purchaseOrder: [1, 50, 50] },
  ] as const;

  it.each(["quote", "purchase_order"] as const)("supports every valid one-field mapping for %s with exact provenance", (destination) => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 13 });
    Object.assign(worksheet.cells, { A5: cell("Stud"), B5: cell(10), C5: cell("lm"), D5: cell(5), E5: cell(50) });

    for (const testCase of singleFieldCases) {
      const mapping = session(worksheet, { [testCase.field]: testCase.cellKey }, destination);
      const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
      const expected = destination === "quote" ? testCase.quote : testCase.purchaseOrder;
      expect(resolved.errors, `${destination} ${testCase.field}`).toEqual([]);
      expect(resolved.effective, `${destination} ${testCase.field}`).toMatchObject({ quantity: expected[0], rate: expected[1], total: expected[2] });

      const explicit = buildExplicitMappedCommercialSelection({ session: mapping, worksheet, resolved });
      const published = buildPublishedWorksheetSelectionFromConfirmedLines({
        destination,
        worksheet,
        selectionRange: mapping.capturedSelection,
        selectionRanges: mapping.capturedSelections,
        workbookId: "wb-1",
        worksheetId: "worksheet-1",
        sheetId: "sheet-1",
        worksheetName: "Pricing",
        sheetName: "Sheet 1",
        interpretedSelection: explicit.interpretedSelection,
        confirmedLines: [explicit.confirmedLine],
      });
      const metadata = published.commercialRows[0].lockedMetadataJson as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } };
      expect(metadata.worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ [testCase.field]: [testCase.cellKey] });
    }
  });

  it.each(["quote", "purchase_order"] as const)("publishes a manual-only Description without worksheet Description provenance for %s", (destination) => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 13 });
    worksheet.cells.A5 = cell("Worksheet text that must not become Description provenance");
    const mapping = session(worksheet, {}, destination);
    mapping.description = { mode: "manual", value: "  Plasterboard Linings  " };

    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    expect(resolved.errors).toEqual([]);
    expect(resolved.line.description).toBe("Plasterboard Linings");

    const explicit = buildExplicitMappedCommercialSelection({ session: mapping, worksheet, resolved });
    expect(explicit.interpretedSelection.proposedLines[0]?.description).toEqual({ value: null, confidence: "high", anchors: [] });
    expect(explicit.confirmedLine.description).toBe("Plasterboard Linings");

    const published = buildPublishedWorksheetSelectionFromConfirmedLines({
      destination,
      worksheet,
      selectionRange: mapping.capturedSelection,
      selectionRanges: mapping.capturedSelections,
      workbookId: "wb-1",
      worksheetId: "worksheet-1",
      sheetId: "sheet-1",
      worksheetName: "Pricing",
      sheetName: "Sheet 1",
      interpretedSelection: explicit.interpretedSelection,
      confirmedLines: [explicit.confirmedLine],
    });
    const metadata = published.commercialRows[0].lockedMetadataJson as {
      worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown; edits?: unknown } };
    };
    expect(metadata.worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({});
    expect(metadata.worksheetMetadata?.worksheetPublishV2?.edits).toMatchObject({ descriptionChanged: true });
  });

  it("keeps manual Description in source identity while preserving numeric-only anchors", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 13 });
    Object.assign(worksheet.cells, { B5: cell(660), E5: cell(3220.8) });
    const mapping = session(worksheet, { quantity: "B5", total: "E5" });
    mapping.description = { mode: "manual", value: "Plasterboard Linings" };
    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
    expect(resolved.effective).toMatchObject({ quantity: 660, rate: 4.88 });
    expect(resolved.effective?.total).toBeCloseTo(3220.8, 8);

    const publish = (description: string) => {
      mapping.description = { mode: "manual", value: description };
      const nextResolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
      const explicit = buildExplicitMappedCommercialSelection({ session: mapping, worksheet, resolved: nextResolved });
      return buildPublishedWorksheetSelectionFromConfirmedLines({
        destination: "quote",
        worksheet,
        selectionRange: mapping.capturedSelection,
        selectionRanges: mapping.capturedSelections,
        workbookId: "wb-1",
        worksheetId: "worksheet-1",
        sheetId: "sheet-1",
        worksheetName: "Pricing",
        sheetName: "Sheet 1",
        interpretedSelection: explicit.interpretedSelection,
        confirmedLines: [explicit.confirmedLine],
      }).commercialRows[0];
    };

    const first = publish("Plasterboard Linings");
    const second = publish("Supply and install plasterboard wall linings");
    const metadata = first.lockedMetadataJson as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } };
    expect(metadata.worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ quantity: ["B5"], total: ["E5"] });
    expect(first.sourceSignature).not.toBe(second.sourceSignature);
  });

  it.each(["quote", "purchase_order"] as const)("preserves sparse derivation and exact numeric provenance for manual Description combinations in %s", (destination) => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 13 });
    Object.assign(worksheet.cells, { B5: cell(10), C5: cell("lm"), D5: cell(5), E5: cell(50) });
    const cases: Array<{ fields: Partial<Record<CommercialMappingField, string>>; provenance: Record<string, string[]> }> = [
      { fields: {}, provenance: {} },
      { fields: { quantity: "B5" }, provenance: { quantity: ["B5"] } },
      { fields: { total: "E5" }, provenance: { total: ["E5"] } },
      { fields: { quantity: "B5", total: "E5" }, provenance: { quantity: ["B5"], total: ["E5"] } },
      { fields: { unit: "C5", rate: "D5" }, provenance: { unit: ["C5"], rate: ["D5"] } },
      { fields: { quantity: "B5", unit: "C5", rate: "D5", total: "E5" }, provenance: { quantity: ["B5"], unit: ["C5"], rate: ["D5"], total: ["E5"] } },
    ];

    for (const testCase of cases) {
      const mapping = session(worksheet, testCase.fields, destination);
      mapping.description = { mode: "manual", value: "Manual commercial description" };
      const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });
      expect(resolved.errors).toEqual([]);
      expect(resolved.line.description).toBe("Manual commercial description");
      const explicit = buildExplicitMappedCommercialSelection({ session: mapping, worksheet, resolved });
      const published = buildPublishedWorksheetSelectionFromConfirmedLines({
        destination,
        worksheet,
        selectionRange: mapping.capturedSelection,
        selectionRanges: mapping.capturedSelections,
        workbookId: "wb-1",
        worksheetId: "worksheet-1",
        sheetId: "sheet-1",
        worksheetName: "Pricing",
        sheetName: "Sheet 1",
        interpretedSelection: explicit.interpretedSelection,
        confirmedLines: [explicit.confirmedLine],
      });
      const metadata = published.commercialRows[0].lockedMetadataJson as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } };
      expect(metadata.worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual(testCase.provenance);
    }
  });

  it.each(["quote", "purchase_order"] as const)("supports common partial combinations for %s", (destination) => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 5 });
    Object.assign(worksheet.cells, { A5: cell("Stud"), B5: cell(10), D5: cell(5), E5: cell(50) });
    const combinations: Array<Partial<Record<CommercialMappingField, string>>> = [
      { description: "A5", total: "E5" },
      { quantity: "B5", total: "E5" },
      { description: "A5", quantity: "B5", rate: "D5" },
    ];
    for (const fields of combinations) {
      const mapping = session(worksheet, fields, destination);
      expect(resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }).errors).toEqual([]);
    }
  });

  it("blocks an empty mapping and rejects only invalid mapped values", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 5 });
    worksheet.cells.A5 = cell("");
    const emptySession = session(worksheet, {});
    expect(resolveWorksheetCommercialMapping({ session: emptySession, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }).errors).toEqual([EMPTY_COMMERCIAL_MAPPING_ERROR]);
    const blankDescriptionSession = session(worksheet, { description: "A5" });
    expect(resolveWorksheetCommercialMapping({ session: blankDescriptionSession, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }).fields.description.error).toBe("Description source cell is empty.");
  });

  it("keeps an explicit Variation total independent from Quantity multiplied by Rate", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 5 });
    Object.assign(worksheet.cells, { A5: cell("Timber"), B5: cell(124), C5: cell(4.55), E5: cell(74.31) });
    const mapping = session(worksheet, { description: "A5", quantity: "B5", rate: "C5", total: "E5" }, "variation");
    const resolved = resolveWorksheetCommercialMapping({ session: mapping, worksheet, workbookId: "wb-1", sheetId: "sheet-1" });

    expect(resolved.errors).toEqual([]);
    expect(resolved.warnings).toEqual([]);
    expect(resolved.effective).toEqual({ quantity: 124, rate: 4.55, total: 74.31, derivedQuantity: false, derivedRate: false });
  });

  it("keeps exact field provenance isolated across multiple Variation mapping lines", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 7, columnCount: 13 });
    Object.assign(worksheet.cells, { A5: cell("Timber"), E5: cell(74.31), A6: cell("Fixings"), E6: cell(18.5) });
    const first = session(worksheet, { description: "A5", total: "E5" }, "variation");
    const second = session(worksheet, { description: "A6", total: "E6" }, "variation");
    const firstExplicit = buildExplicitMappedCommercialSelection({ session: first, worksheet, resolved: resolveWorksheetCommercialMapping({ session: first, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }), proposalId: "line-1" });
    const secondExplicit = buildExplicitMappedCommercialSelection({ session: second, worksheet, resolved: resolveWorksheetCommercialMapping({ session: second, worksheet, workbookId: "wb-1", sheetId: "sheet-1" }), proposalId: "line-2" });
    const published = buildPublishedWorksheetSelectionFromConfirmedLines({
      destination: "variation", worksheet, selectionRange: first.capturedSelection, selectionRanges: first.capturedSelections, workbookId: "wb-1", worksheetId: "worksheet-1", sheetId: "sheet-1", worksheetName: "Pricing", sheetName: "Sheet 1",
      interpretedSelection: combineExplicitMappedCommercialSelections([firstExplicit, secondExplicit]),
      confirmedLines: [firstExplicit.confirmedLine, secondExplicit.confirmedLine],
    });

    const fieldMappings = published.commercialRows.map((row) => (row.lockedMetadataJson as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings);
    expect(fieldMappings).toEqual([
      { description: ["A5"], total: ["E5"] },
      { description: ["A6"], total: ["E6"] },
    ]);
    expect(published.commercialRows.map((row) => row.description)).toEqual(["Timber", "Fixings"]);
  });
});
