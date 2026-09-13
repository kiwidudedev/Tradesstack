import { afterEach, describe, expect, it, vi } from "vitest";
import { createPdfExportTiming } from "@/lib/exports/pdf-export-timing";

describe("PDF export timing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records only correlation, stage, duration, outcome, and safe extras", () => {
    const values = [100, 101, 103, 106, 110, 112];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const timing = createPdfExportTiming({
      enabled: true,
      exportId: "export-safe-1",
      kind: "invoice-server",
      now: () => values.shift() ?? 112,
    });

    timing.mark("route-entered");
    timing.start("claim-query");
    timing.end("claim-query");
    timing.report({ outcome: "success" });

    expect(info).toHaveBeenCalledTimes(1);
    const logged = info.mock.calls[0]?.[1] ?? "";
    expect(logged).toContain('"exportId":"export-safe-1"');
    expect(logged).toContain('"stage":"claim-query"');
    expect(logged).toContain('"outcome":"success"');
    expect(logged).not.toContain("claimNumber");
    expect(logged).not.toContain("client");
    expect(timing.serverTimingHeader()).toContain("claim-query;dur=");
  });

  it("is a no-op when the explicit timing flag is disabled", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const timing = createPdfExportTiming({
      enabled: false,
      exportId: "disabled",
      kind: "payment-claim",
      now: () => 1,
    });

    timing.start("drawing");
    timing.end("drawing");
    timing.mark("download-triggered");
    timing.report();

    expect(info).not.toHaveBeenCalled();
    expect(timing.serverTimingHeader()).toBeNull();
  });
});
