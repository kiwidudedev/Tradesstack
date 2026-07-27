import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorksheetSourceLink } from "@/components/app/WorksheetSourceLink";

describe("WorksheetSourceLink", () => {
  it("renders only the View Source action when a worksheet link exists", () => {
    const markup = renderToStaticMarkup(
      <WorksheetSourceLink href="/app/projects/project-1/preconstruction/variations/var-1/pricing-worksheet/workbook-1?sheetId=sheet-1" />,
    );

    expect(markup).toContain("View Source");
    expect(markup).toContain("/app/projects/project-1/preconstruction/variations/var-1/pricing-worksheet/workbook-1?sheetId=sheet-1");
    expect(markup).not.toContain("Worksheet Source");
    expect(markup).not.toContain("Current");
    expect(markup).not.toContain("Pricing worksheet");
    expect(markup).not.toContain("Sheet 1");
    expect(markup).not.toContain("selected cells");
  });

  it("renders nothing when no worksheet link exists", () => {
    expect(renderToStaticMarkup(<WorksheetSourceLink href={null} />)).toBe("");
  });
});
