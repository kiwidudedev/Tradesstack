import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/page.tsx",
  "utf8",
);
const client = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx",
  "utf8",
);
const loader = readFileSync("lib/project-quote-detail-server.ts", "utf8");
const readView = readFileSync("components/app/ProjectQuoteReadView.tsx", "utf8");

describe("Project Quote Detail performance architecture", () => {
  it("loads validated critical Quote data at the server route boundary", () => {
    expect(route).not.toContain('"use client"');
    expect(route).toContain("loadProjectQuoteDetail(projectId, quoteId)");
    expect(route).toContain("if (!initialData) notFound()");
    expect(route).toContain("initialData={initialData}");
  });

  it("validates quote ownership before loading ordered lines", () => {
    const quoteQuery = loader.indexOf('.from("project_quotes")');
    const lineQuery = loader.indexOf('.from("project_quote_line_items")');
    expect(quoteQuery).toBeGreaterThan(-1);
    expect(lineQuery).toBeGreaterThan(quoteQuery);
    expect(loader).toContain('.eq("organization_id", project.organization_id)');
    expect(loader).toContain('.eq("project_id", project.id)');
    expect(loader).toContain('.eq("id", quoteId)');
    expect(loader).toContain('.order("sort_order", { ascending: true })');
    expect(loader).not.toContain('.select("*")');
  });

  it("does not reconstruct critical Quote context in the browser", () => {
    expect(client).not.toContain('.from("organization_projects")');
    expect(client).not.toContain('.from("organization_clients")');
    expect(client).not.toContain("ensure_organization_membership");
    expect(client).not.toContain('.select("*")');
    expect(client).not.toContain("useAuth()");
  });

  it("keeps commercial provenance secondary and preserves line pricing during merge", () => {
    expect(client).toContain("commercialEnrichmentInFlight");
    expect(client).toContain("metadataByLineId");
    expect(client).toContain("{ ...line, commercialItemLink:");
    expect(readView).toContain("Loading source details…");
  });

  it("defers editor and export implementations and saves to the known quote ID", () => {
    expect(client).toContain('dynamic(');
    expect(client).toContain('import("@/components/app/QuoteEditorShared")');
    expect(client).toContain('import("@/lib/quote-pdf-html")');
    expect(client).toContain("router.replace(directQuoteHref)");
    expect(client).toContain("router.refresh()");
    expect(client).not.toContain("router.push(`/app/projects/${routeProjectSlug}/preconstruction/quote`)");
  });
});
