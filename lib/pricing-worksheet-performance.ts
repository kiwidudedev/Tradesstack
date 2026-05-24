const PRICING_WORKSHEET_PERF_PREFIX = "[PricingWorksheetPerf]";

function isPricingWorksheetPerfEnabled() {
  return process.env.NODE_ENV === "development";
}

function getPerformanceNow() {
  if (typeof performance === "undefined") {
    return Date.now();
  }

  return performance.now();
}

function markPerformanceEntry(label: string) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") {
    return;
  }

  try {
    performance.mark(`pricing-worksheet:${label}`);
  } catch {
    // Performance marks are diagnostic only; never let them affect app behavior.
  }
}

export function markPricingWorksheetPerformance(
  label: string,
  detail?: Record<string, unknown>
) {
  if (!isPricingWorksheetPerfEnabled()) {
    return;
  }

  markPerformanceEntry(label);
  console.info(PRICING_WORKSHEET_PERF_PREFIX, label, {
    at: Number(getPerformanceNow().toFixed(2)),
    ...detail,
  });
}

export function countPricingWorksheetPerformance(
  label: string,
  detail?: Record<string, unknown>
) {
  if (!isPricingWorksheetPerfEnabled()) {
    return;
  }

  console.count(`${PRICING_WORKSHEET_PERF_PREFIX} ${label}`);
  if (detail) {
    console.info(PRICING_WORKSHEET_PERF_PREFIX, `${label}:detail`, detail);
  }
}

export function startPricingWorksheetPerformanceMeasure(
  label: string,
  detail?: Record<string, unknown>
) {
  if (!isPricingWorksheetPerfEnabled()) {
    return () => undefined;
  }

  const start = getPerformanceNow();
  markPerformanceEntry(`${label}:start`);

  return (endDetail?: Record<string, unknown>) => {
    const durationMs = getPerformanceNow() - start;
    markPerformanceEntry(`${label}:end`);
    console.info(PRICING_WORKSHEET_PERF_PREFIX, `${label}:duration`, {
      durationMs: Number(durationMs.toFixed(2)),
      ...detail,
      ...endDetail,
    });
  };
}
