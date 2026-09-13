import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "components/app/TakeoffPdfViewer.tsx"), "utf8");
const dialogSource = source.slice(
  source.indexOf("open={isCalibrationManagerOpen}"),
  source.indexOf('<div className="flex h-full min-h-0 w-full'),
);

describe("takeoff calibration dialog presentation", () => {
  it("uses the shared TradesStack dialog and management primitives", () => {
    expect(dialogSource).toContain("<DialogContent");
    expect(dialogSource).toContain("<DialogTitle>Calibration</DialogTitle>");
    expect(dialogSource).toContain("<Button");
    expect(dialogSource).toContain("<StatusBadge");
    expect(dialogSource).toContain("<DropdownMenu>");
    expect(dialogSource).toContain("<OperationalAlert");
  });

  it("keeps history visible and removes the redundant feature-card treatment", () => {
    expect(dialogSource).toContain("Calibration history");
    expect(dialogSource).not.toContain("View history");
    expect(dialogSource).not.toContain('bg-[#F0FDF4]');
    expect(dialogSource).toContain('max-w-[560px]');
  });

  it("uses the standard overflow and destructive confirmation patterns", () => {
    expect(dialogSource).toContain("<DropdownMenuTrigger asChild>");
    expect(dialogSource).toContain("Make active");
    expect(dialogSource).toContain('variant="destructive"');
    expect(dialogSource).toContain("Delete calibration");
  });
});
