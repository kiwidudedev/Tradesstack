import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  PricingWorksheetTitleAutosaveController,
  resolveWorksheetPersistenceName,
  shouldSynchronizeLoadedWorksheetTitle,
  type PricingWorksheetTitleAutosaveState,
  type PricingWorksheetTitleSaveResult,
} from "@/lib/opportunity-pricing-worksheet-title";

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveWorksheetPersistenceName", () => {
  it("prefers the live worksheet sheet name over stale local state", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Renamed Worksheet",
    });

    expect(
      resolveWorksheetPersistenceName({
        worksheet,
        worksheetName: "New Worksheet",
      }),
    ).toBe("Renamed Worksheet");
  });

  it("falls back to the local state name when the worksheet snapshot has no title", () => {
    const worksheet = createDefaultWorksheetData({
      sheetName: "Pricing Worksheet",
    });
    worksheet.sheetName = "   ";

    expect(
      resolveWorksheetPersistenceName({
        worksheet,
        worksheetName: "State Title",
      }),
    ).toBe("State Title");
  });
});

describe("PricingWorksheetTitleAutosaveController", () => {
  type PersistMock = ReturnType<typeof vi.fn<(title: string) => Promise<PricingWorksheetTitleSaveResult>>>;

  function setup(persist: PersistMock = vi.fn(async (title: string) => ({
    title,
    updatedAt: "2026-08-17T00:00:00.000Z",
  }))) {
    const states: PricingWorksheetTitleAutosaveState[] = [];
    const errors: string[] = [];
    const controller = new PricingWorksheetTitleAutosaveController({
      debounceMs: 50,
      initialTitle: "Saved title",
      onError: (message) => errors.push(message),
      onStateChange: (state) => states.push(state),
      persist,
    });
    return { controller, errors, persist, states };
  }

  it("debounces typing into one normalized persistence call", async () => {
    vi.useFakeTimers();
    const { controller, persist } = setup();
    controller.setDraft("N");
    controller.setDraft("Ne");
    controller.setDraft("  New title  ");

    await vi.advanceTimersByTimeAsync(50);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("New title");
    expect(controller.getSnapshot().status).toBe("idle");
  });

  it("flushes pending saves and skips unchanged normalized titles", async () => {
    const { controller, persist } = setup();
    controller.setDraft("Enter title");
    await controller.flush();
    expect(persist).toHaveBeenCalledWith("Enter title");

    controller.setDraft("  Enter title  ");
    await controller.flush();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("coalesces Enter and its following blur into one persistence call", async () => {
    let finishSave: ((value: PricingWorksheetTitleSaveResult) => void) | undefined;
    const persist: PersistMock = vi.fn(() => new Promise<PricingWorksheetTitleSaveResult>((resolve) => {
      finishSave = resolve;
    }));
    const { controller } = setup(persist);
    controller.setDraft("One save");
    const enterFlush = controller.flush();
    const blurFlush = controller.flush();
    finishSave?.({ title: "One save", updatedAt: "saved" });

    await Promise.all([enterFlush, blurFlush]);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("restores the confirmed title on Escape without saving a pending draft", () => {
    vi.useFakeTimers();
    const { controller, persist } = setup();
    controller.setDraft("Discard me");
    controller.escape();
    vi.advanceTimersByTime(100);

    expect(controller.getSnapshot().draftTitle).toBe("Saved title");
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects and restores a blank title", async () => {
    const { controller, errors, persist } = setup();
    controller.setDraft("   ");
    await controller.flush();

    expect(persist).not.toHaveBeenCalled();
    expect(controller.getSnapshot().draftTitle).toBe("Saved title");
    expect(errors).toEqual(["Worksheet name cannot be blank."]);
  });

  it("keeps a failed draft available and never reports it saved", async () => {
    const persist = vi.fn(async () => {
      throw new Error("RLS rejected the update");
    });
    const { controller, errors } = setup(persist);
    controller.setDraft("Retry me");
    await controller.flush();

    expect(controller.getSnapshot()).toMatchObject({
      confirmedTitle: "Saved title",
      draftTitle: "Retry me",
      status: "error",
    });
    expect(errors).toEqual(["RLS rejected the update"]);
  });

  it("serializes rapid edits so the newest title is the final persisted value", async () => {
    const firstRequest: {
      resolve?: (value: PricingWorksheetTitleSaveResult) => void;
    } = {};
    const persist = vi.fn((title: string) => {
      if (title === "First") {
        return new Promise<{ title: string; updatedAt: string | null }>((resolve) => {
          firstRequest.resolve = resolve;
        });
      }
      return Promise.resolve({ title, updatedAt: "newest" });
    });
    const { controller } = setup(persist);
    controller.setDraft("First");
    const firstFlush = controller.flush();
    controller.setDraft("Newest");
    const newestFlush = controller.flush();

    expect(persist).toHaveBeenCalledTimes(1);
    if (!firstRequest.resolve) {
      throw new Error("The first title save did not start.");
    }
    firstRequest.resolve({ title: "First", updatedAt: "older" });
    await firstFlush;
    await newestFlush;

    expect(persist.mock.calls.map(([title]) => title)).toEqual(["First", "Newest"]);
    expect(controller.getSnapshot()).toMatchObject({
      confirmedTitle: "Newest",
      draftTitle: "Newest",
      lastSavedAt: "newest",
      status: "idle",
    });
  });
});

describe("shouldSynchronizeLoadedWorksheetTitle", () => {
  const base = {
    confirmedTitle: "Server title",
    currentSheetId: "sheet-1",
    draftTitle: "Server title",
    isEditing: false,
    nextSheetId: "sheet-1",
    status: "idle" as const,
  };

  it("does not overwrite a focused, dirty, pending, saving, or failed draft", () => {
    expect(shouldSynchronizeLoadedWorksheetTitle({ ...base, isEditing: true })).toBe(false);
    expect(shouldSynchronizeLoadedWorksheetTitle({ ...base, draftTitle: "Local draft" })).toBe(false);
    expect(shouldSynchronizeLoadedWorksheetTitle({ ...base, status: "pending" })).toBe(false);
    expect(shouldSynchronizeLoadedWorksheetTitle({ ...base, status: "saving" })).toBe(false);
    expect(shouldSynchronizeLoadedWorksheetTitle({ ...base, status: "error" })).toBe(false);
  });

  it("accepts a clean newer external title or a genuine sheet change", () => {
    expect(shouldSynchronizeLoadedWorksheetTitle(base)).toBe(true);
    expect(shouldSynchronizeLoadedWorksheetTitle({
      ...base,
      draftTitle: "Unsaved local title",
      isEditing: true,
      nextSheetId: "sheet-2",
      status: "pending",
    })).toBe(true);
  });
});
