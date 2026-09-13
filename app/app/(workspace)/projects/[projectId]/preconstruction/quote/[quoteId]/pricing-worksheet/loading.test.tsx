import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProjectPricingWorksheetLoading from "./loading";

describe("Project Pricing Worksheet route loading state", () => {
  it("renders a minimal accessible status without a fake board", () => {
    const markup = renderToStaticMarkup(<ProjectPricingWorksheetLoading />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Loading pricing worksheets…");
    expect(markup).not.toContain("BoardLoadingSkeleton");
    expect(markup).not.toContain("tableRows");
    expect(markup).not.toContain("animate-pulse");
  });
});
