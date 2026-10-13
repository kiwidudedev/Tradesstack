import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type PdfPage = {
  getViewport: (params: { scale: number; rotation?: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    canvas: unknown;
    viewport: { width: number; height: number };
    background?: string;
  }) => { promise: Promise<void> };
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy?: () => Promise<void> | void;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  destroy?: () => Promise<void> | void;
};

type PdfJsModule = {
  getDocument: (params: Record<string, unknown>) => PdfLoadingTask;
};

export type TakeoffPreviewRenderPage = {
  pageNumber: number;
  outputPath: string;
  outputWidthPts: number;
  outputHeightPts: number;
  rotationDegrees: number;
};

const TARGET_PIXELS_PER_POINT = 3;
const MAX_EDGE_PX = 6144;

function getRenderScale(page: TakeoffPreviewRenderPage): number {
  const longestEdgePts = Math.max(page.outputWidthPts, page.outputHeightPts, 1);
  const boundedPixelsPerPoint = Math.min(
    TARGET_PIXELS_PER_POINT,
    MAX_EDGE_PX / longestEdgePts,
  );

  return Math.max(1, boundedPixelsPerPoint);
}

/**
 * Render Takeoff source pages using dependencies available in Linux hosted
 * runtimes. The previous implementation invoked macOS PDFKit/Swift, which is
 * not available in Vercel or Linux worker runners.
 */
export async function renderTakeoffPdfPreviews(params: {
  sourcePdfBytes: Uint8Array;
  pages: TakeoffPreviewRenderPage[];
}): Promise<void> {
  if (params.pages.length === 0) {
    return;
  }

  // Keep the native renderer out of the normal application import path. The
  // caller is the dedicated Node-compatible takeoff worker; Cloudflare web
  // routes only enqueue and read job state. A lazy import also keeps the
  // renderer's platform-specific binary out of route initialization.
  // Deliberately keep the package specifier opaque to the web bundler. The
  // worker runs this module under Node, where the native package is installed;
  // Cloudflare must never attempt to bundle a platform-specific `.node` file.
  const loadNodeModule = new Function(
    "specifier",
    "try { const moduleApi = process.getBuiltinModule('module'); return Promise.resolve(moduleApi.createRequire(process.cwd() + '/package.json')(specifier)); } catch { return import(specifier); }",
  ) as (specifier: string) => Promise<{ createCanvas: typeof import("@napi-rs/canvas").createCanvas }>;
  const { createCanvas } = await loadNodeModule("@napi-rs/canvas");

  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(params.sourcePdfBytes),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;

  try {
    for (const page of params.pages) {
      if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > document.numPages) {
        throw new Error(`Unable to render Takeoff page ${page.pageNumber}.`);
      }

      const renderScale = getRenderScale(page);
      const pdfPage = await document.getPage(page.pageNumber);
      const viewport = pdfPage.getViewport({
        scale: renderScale,
        rotation: page.rotationDegrees,
      });
      const canvas = createCanvas(
        Math.max(1, Math.round(viewport.width)),
        Math.max(1, Math.round(viewport.height)),
      );
      const context = canvas.getContext("2d");

      await pdfPage.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        canvas: null,
        viewport,
        background: "#ffffff",
      }).promise;

      await mkdir(dirname(page.outputPath), { recursive: true });
      await writeFile(page.outputPath, canvas.toBuffer("image/png"));
    }
  } finally {
    await document.destroy?.();
    await loadingTask.destroy?.();
  }
}
