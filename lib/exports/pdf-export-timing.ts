export type PdfExportTimingKind = "payment-claim" | "invoice-browser" | "invoice-server";

type TimingMark = {
  stage: string;
  offsetMs: number;
};

type TimingDuration = {
  stage: string;
  durationMs: number;
};

export type PdfExportTiming = {
  readonly enabled: boolean;
  readonly exportId: string;
  start(stage: string): void;
  end(stage: string): void;
  mark(stage: string): void;
  report(extra?: Record<string, string | number | null>): void;
  serverTimingHeader(): string | null;
};

function roundTiming(value: number) {
  return Math.round(value * 100) / 100;
}

function serverTimingName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "stage";
}

export function createPdfExportTiming(params: {
  enabled: boolean;
  exportId: string;
  kind: PdfExportTimingKind;
  now?: () => number;
}): PdfExportTiming {
  const now = params.now ?? (() => performance.now());
  const origin = now();
  const starts = new Map<string, number>();
  const marks: TimingMark[] = [];
  const durations: TimingDuration[] = [];

  const mark = (stage: string) => {
    if (!params.enabled) return;
    marks.push({
      stage,
      offsetMs: roundTiming(now() - origin),
    });
  };

  return {
    enabled: params.enabled,
    exportId: params.exportId,
    start(stage) {
      if (!params.enabled) return;
      starts.set(stage, now());
    },
    end(stage) {
      if (!params.enabled) return;
      const completedAt = now();
      const startedAt = starts.get(stage);
      if (startedAt !== undefined) {
        durations.push({
          stage,
          durationMs: roundTiming(completedAt - startedAt),
        });
        starts.delete(stage);
      }
      marks.push({
        stage: `${stage}-completed`,
        offsetMs: roundTiming(completedAt - origin),
      });
    },
    mark,
    report(extra = {}) {
      if (!params.enabled) return;
      const totalMs = roundTiming(now() - origin);
      console.info("[pdf-export-timing]", JSON.stringify({
        exportId: params.exportId,
        kind: params.kind,
        totalMs,
        marks,
        durations,
        ...extra,
      }));
    },
    serverTimingHeader() {
      if (!params.enabled) return null;
      const metrics = durations.map((entry) => (
        `${serverTimingName(entry.stage)};dur=${entry.durationMs}`
      ));
      metrics.push(`total;dur=${roundTiming(now() - origin)}`);
      return metrics.join(", ");
    },
  };
}
