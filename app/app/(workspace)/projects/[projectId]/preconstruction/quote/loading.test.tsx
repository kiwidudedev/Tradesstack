import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProjectQuoteLoading from "./loading";

const loadingSource = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/loading.tsx",
  "utf8",
);

describe("Project Quote route loading state", () => {
  it("renders a minimal accessible status without a fake board", () => {
    const markup = renderToStaticMarkup(<ProjectQuoteLoading />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Loading quote…");
    expect(loadingSource).not.toContain("BoardLoadingSkeleton");
    expect(loadingSource).not.toContain("metricCount");
    expect(loadingSource).not.toContain("tableRows");
    expect(loadingSource).not.toContain("showFilters");
    expect(markup).not.toContain("Quotation");
    expect(markup).not.toContain("animate-pulse");
  });
});
