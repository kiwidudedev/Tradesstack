import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TakeoffDrawingTab } from "@/lib/takeoff-server";
import { TakeoffDrawingSetRegister } from "@/components/app/TakeoffDrawingSetRegister";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/fonts", () => {
  const font = { className: "font", variable: "font-variable" };
  return {
    akzidenz: font,
    akzidenzBlack: font,
    akzidenzProBoldEx: font,
    bertholdHeading: font,
    bertholdExtraBoldCondensed: font,
    interMedium: font,
    interBold: font,
    ibmPlexSans: font,
    mulishBody: font,
    mulishHeading: font,
  };
});

vi.mock("@/components/app/useTakeoffSourceDrawingUpload", () => ({
  useTakeoffSourceDrawingUpload: () => ({
    inputRef: { current: null },
    isUploading: false,
    status: null,
    error: null,
    onChooseFile: vi.fn(),
    onFileChange: vi.fn(),
  }),
}));

function drawingRows(count: number): TakeoffDrawingTab[] {
  return Array.from({ length: count }, (_, index) => ({
    drawingSetId: `drawing-${index + 1}`,
    displayName: `Drawing Set ${index + 1}`,
    sourceFilename: `plans-${index + 1}.pdf`,
    sortOrder: index,
    status: index === 1 ? "preparing" : index === 2 ? "failed" : "ready",
    uploadedAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
  }));
}

function renderRegister(count: number) {
  return renderToStaticMarkup(
    <TakeoffDrawingSetRegister
      opportunityId="opportunity-1"
      organizationId="organization-1"
      projectId="project-1"
      initialDrawingSets={drawingRows(count)}
    />,
  );
}

describe("TakeoffDrawingSetRegister", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the upload-first empty state for zero drawings", () => {
    const markup = renderRegister(0);
    expect(markup).toContain("No drawing sets yet.");
    expect(markup).toContain("Upload First Drawing Set");
    expect(markup).not.toContain("View Quantities");
  });

  it.each([1, 2, 20])("renders a stable register for %i drawing sets", (count) => {
    const markup = renderRegister(count);
    expect(markup).toContain("Drawing Sets");
    expect(markup).not.toContain("View Quantities");
    expect(markup).toContain("Add Drawing Set");
    expect(markup.match(/aria-label="Open Drawing Set/g)).toHaveLength(count);
    expect(markup).toContain("plans-1.pdf");
    expect(markup).not.toContain('aria-label="Drawing sets"');
  });
});
