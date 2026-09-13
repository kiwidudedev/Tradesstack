import { describe, expect, it } from "vitest";
import {
  clearPricingWorksheetOverlayHistoryState,
  resolveRestoredPricingWorksheetId,
} from "./pricing-worksheet-overlay-lifecycle";

describe("pricing worksheet overlay close lifecycle", () => {
  it("retains worksheet identity while close navigation is pending on the deep pathname", () => {
    expect(resolveRestoredPricingWorksheetId({
      isRegisterPath: false,
      pathnameWorksheetId: "workbook-1",
      historyState: clearPricingWorksheetOverlayHistoryState({
        __NA: true,
        pricingWorksheetOverlay: true,
        worksheetId: "workbook-1",
        sheetId: "sheet-1",
      }),
      persistedWorksheetId: null,
    })).toBe("workbook-1");
  });

  it("does not reopen from history or persistence after the register pathname commits", () => {
    expect(resolveRestoredPricingWorksheetId({
      isRegisterPath: true,
      pathnameWorksheetId: null,
      historyState: {
        __NA: true,
        pricingWorksheetOverlay: true,
        worksheetId: "workbook-1",
      },
      persistedWorksheetId: "workbook-1",
    })).toBeNull();
  });

  it("clears only worksheet overlay identity after a successful close", () => {
    expect(clearPricingWorksheetOverlayHistoryState({
      __NA: true,
      pricingWorksheetOverlay: true,
      worksheetId: "workbook-1",
      sheetId: "sheet-1",
    })).toEqual({ __NA: true });
  });

  it("restores normally after close state has been cleared so a worksheet can be reopened", () => {
    expect(resolveRestoredPricingWorksheetId({
      isRegisterPath: false,
      pathnameWorksheetId: "workbook-2",
      historyState: {},
      persistedWorksheetId: null,
    })).toBe("workbook-2");
  });
});
