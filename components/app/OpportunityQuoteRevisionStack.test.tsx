import { Children, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityQuoteRevisionStack } from "@/components/app/OpportunityQuoteRevisionStack";

describe("OpportunityQuoteRevisionStack", () => {
  it("renders quote and history as separate sibling surfaces with standard spacing", () => {
    const tree = OpportunityQuoteRevisionStack({
      quote: <section data-surface="quote">Quote Details</section>,
      history: <section data-surface="history">Previous Revisions</section>,
    }) as ReactElement<{ children: React.ReactNode; className: string }>;
    const siblings = Children.toArray(tree.props.children) as Array<ReactElement<{
      children?: ReactElement<{ "data-surface": string }>;
      className?: string;
      "data-surface"?: string;
    }>>;

    expect(tree.props.className).toContain("space-y-6");
    expect(siblings).toHaveLength(2);
    expect(siblings[0].props.children?.props["data-surface"]).toBe("quote");
    expect(siblings[0].props.className).toBe("pb-8");
    expect(siblings[1].props["data-surface"]).toBe("history");
  });

  it("does not add compensation or an empty gap without history", () => {
    const markup = renderToStaticMarkup(
      <OpportunityQuoteRevisionStack quote={<section>Quote Details</section>} />,
    );

    expect(markup).not.toContain("pb-8");
    expect(markup).not.toContain("Previous Revisions");
  });

  it("disables worksheet sources for Opportunity Quotes while Project Quotes retain the capability", () => {
    const opportunityEditorSource = readFileSync(
      resolve(process.cwd(), "components/app/OpportunityQuoteRevisionEditor.tsx"),
      "utf8",
    );
    const projectEditorSource = readFileSync(
      resolve(
        process.cwd(),
        "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx",
      ),
      "utf8",
    );

    expect(opportunityEditorSource).toContain("showWorksheetSources={false}");
    expect(opportunityEditorSource).not.toContain("isCommercialItemsOpen=");
    expect(opportunityEditorSource).not.toContain("availableCommercialItems={[]}");
    expect(opportunityEditorSource).not.toContain("importSelectedCommercialItems=");

    expect(projectEditorSource).toContain("showWorksheetSources");
    expect(projectEditorSource).toContain("isCommercialItemsOpen={isCommercialItemsOpen}");
    expect(projectEditorSource).toContain("availableCommercialItems={availableCommercialItems}");
    expect(projectEditorSource).toContain("importSelectedCommercialItems={importSelectedCommercialItems}");
  });
});
