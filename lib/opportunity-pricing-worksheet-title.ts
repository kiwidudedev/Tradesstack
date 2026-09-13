import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";

export const PRICING_WORKSHEET_TITLE_AUTOSAVE_DELAY_MS = 750;

export type PricingWorksheetTitleSaveStatus = "idle" | "pending" | "saving" | "error";

export type PricingWorksheetTitleAutosaveState = {
  confirmedTitle: string;
  draftTitle: string;
  error: string | null;
  lastSavedAt: string | null;
  status: PricingWorksheetTitleSaveStatus;
};

export type PricingWorksheetTitleSaveResult = {
  title: string;
  updatedAt: string | null;
};

type PricingWorksheetTitleAutosaveOptions = {
  debounceMs?: number;
  initialTitle: string;
  initialUpdatedAt?: string | null;
  onError?: (message: string) => void;
  onStateChange: (state: PricingWorksheetTitleAutosaveState) => void;
  persist: (title: string) => Promise<PricingWorksheetTitleSaveResult>;
};

export function normalizePricingWorksheetTitle(value: string) {
  return value.trim();
}

export function shouldSynchronizeLoadedWorksheetTitle(params: {
  confirmedTitle: string;
  currentSheetId: string | null;
  draftTitle: string;
  isEditing: boolean;
  nextSheetId: string | null;
  status: PricingWorksheetTitleSaveStatus;
}) {
  if (params.currentSheetId !== params.nextSheetId) {
    return true;
  }

  return !params.isEditing
    && params.status === "idle"
    && normalizePricingWorksheetTitle(params.draftTitle) === params.confirmedTitle;
}

export class PricingWorksheetTitleAutosaveController {
  private readonly debounceMs: number;
  private destroyed = false;
  private generation = 0;
  private inFlight: Promise<boolean> | null = null;
  private inFlightTitle: string | null = null;
  private onError: PricingWorksheetTitleAutosaveOptions["onError"];
  private onStateChange: PricingWorksheetTitleAutosaveOptions["onStateChange"];
  private pendingTitle: string | null = null;
  private persist: PricingWorksheetTitleAutosaveOptions["persist"];
  private restoreAfterInFlight: string | null = null;
  private state: PricingWorksheetTitleAutosaveState;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PricingWorksheetTitleAutosaveOptions) {
    const initialTitle = normalizePricingWorksheetTitle(options.initialTitle) || "Pricing Worksheet";
    this.debounceMs = options.debounceMs ?? PRICING_WORKSHEET_TITLE_AUTOSAVE_DELAY_MS;
    this.onError = options.onError;
    this.onStateChange = options.onStateChange;
    this.persist = options.persist;
    this.state = {
      confirmedTitle: initialTitle,
      draftTitle: initialTitle,
      error: null,
      lastSavedAt: options.initialUpdatedAt ?? null,
      status: "idle",
    };
  }

  getSnapshot() {
    return { ...this.state };
  }

  reset(title: string, updatedAt: string | null = null) {
    this.clearTimer();
    this.generation += 1;
    this.pendingTitle = null;
    this.restoreAfterInFlight = null;
    const confirmedTitle = normalizePricingWorksheetTitle(title) || "Pricing Worksheet";
    this.state = {
      confirmedTitle,
      draftTitle: confirmedTitle,
      error: null,
      lastSavedAt: updatedAt,
      status: "idle",
    };
    this.emit();
  }

  setDraft(title: string) {
    this.clearTimer();
    this.restoreAfterInFlight = null;
    const normalizedTitle = normalizePricingWorksheetTitle(title);
    this.state = {
      ...this.state,
      draftTitle: title,
      error: null,
      status: normalizedTitle === this.state.confirmedTitle ? "idle" : "pending",
    };
    this.emit();

    if (normalizedTitle !== this.state.confirmedTitle) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.debounceMs);
    }
  }

  async flush() {
    this.clearTimer();
    const normalizedTitle = normalizePricingWorksheetTitle(this.state.draftTitle);

    if (!normalizedTitle) {
      const message = "Worksheet name cannot be blank.";
      this.state = {
        ...this.state,
        draftTitle: this.state.confirmedTitle,
        error: null,
        status: this.inFlight ? "saving" : "idle",
      };
      this.onError?.(message);
      this.emit();
      return false;
    }

    if (normalizedTitle === this.state.confirmedTitle && !this.inFlight) {
      this.state = {
        ...this.state,
        draftTitle: this.state.confirmedTitle,
        error: null,
        status: "idle",
      };
      this.emit();
      return true;
    }

    if (normalizedTitle === this.inFlightTitle && !this.pendingTitle && this.inFlight) {
      return this.inFlight;
    }

    this.pendingTitle = normalizedTitle;
    return this.drain();
  }

  escape() {
    this.clearTimer();
    this.pendingTitle = null;
    const confirmedTitle = this.state.confirmedTitle;
    if (this.inFlight) {
      this.restoreAfterInFlight = confirmedTitle;
    }
    this.state = {
      ...this.state,
      draftTitle: confirmedTitle,
      error: null,
      status: this.inFlight ? "saving" : "idle",
    };
    this.emit();
  }

  destroy() {
    this.destroyed = true;
    this.clearTimer();
    this.pendingTitle = null;
    this.generation += 1;
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit() {
    if (!this.destroyed) {
      this.onStateChange({ ...this.state });
    }
  }

  private async drain(): Promise<boolean> {
    if (this.inFlight) {
      return this.inFlight;
    }

    const processQueue = async () => {
      let succeeded = true;
      while (this.pendingTitle) {
        const title = this.pendingTitle;
        this.pendingTitle = null;
        this.inFlightTitle = title;
        const requestGeneration = this.generation;
        this.state = { ...this.state, error: null, status: "saving" };
        this.emit();

        try {
          const result = await this.persist(title);
          succeeded = true;
          if (this.destroyed || requestGeneration !== this.generation) {
            continue;
          }

          const confirmedTitle = normalizePricingWorksheetTitle(result.title) || title;
          const shouldRestore = this.restoreAfterInFlight !== null;
          const desiredTitle = shouldRestore
            ? this.restoreAfterInFlight
            : normalizePricingWorksheetTitle(this.state.draftTitle);
          this.restoreAfterInFlight = null;
          this.state = {
            ...this.state,
            confirmedTitle,
            draftTitle: desiredTitle === title ? confirmedTitle : this.state.draftTitle,
            error: null,
            lastSavedAt: result.updatedAt,
            status: desiredTitle === title ? "idle" : "pending",
          };
          if (desiredTitle && desiredTitle !== confirmedTitle) {
            this.pendingTitle = desiredTitle;
          }
          this.emit();
        } catch (error: unknown) {
          succeeded = false;
          if (this.destroyed || requestGeneration !== this.generation) {
            continue;
          }

          const message = error instanceof Error ? error.message : "Unable to save the worksheet name.";
          if (this.pendingTitle) {
            this.state = { ...this.state, error: null, status: "pending" };
          } else {
            this.state = { ...this.state, error: message, status: "error" };
            this.onError?.(message);
          }
          this.emit();
        }
      }
      return succeeded && this.state.status !== "error";
    };

    this.inFlight = processQueue().finally(() => {
      this.inFlight = null;
      this.inFlightTitle = null;
    });
    return this.inFlight;
  }
}

export function resolveWorksheetPersistenceName(params: {
  worksheet: Pick<WorksheetData, "sheetName">;
  worksheetName?: string | null;
  fallback?: string;
}) {
  const liveSheetName = params.worksheet.sheetName?.trim();
  if (liveSheetName) {
    return liveSheetName;
  }

  const stateSheetName = params.worksheetName?.trim();
  if (stateSheetName) {
    return stateSheetName;
  }

  return params.fallback ?? "Pricing Worksheet";
}
