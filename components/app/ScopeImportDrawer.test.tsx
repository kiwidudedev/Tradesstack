import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScopeImportDrawer } from "@/components/app/ScopeImportDrawer";

const drawerSource = readFileSync(resolve(process.cwd(), "components/app/ScopeImportDrawer.tsx"), "utf8");
const opportunitySource = readFileSync(resolve(process.cwd(), "components/app/OpportunityQuoteRevisionEditor.tsx"), "utf8");
const projectSource = readFileSync(resolve(process.cwd(), "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx"), "utf8");

const item = {
  id: "scope-run-1:0",
  title: "Wall framing",
  description: "Timber wall framing to drawings",
  tradeLabel: "Carpentry",
  generatedAt: "2026-08-27T08:00:00.000Z",
};

function renderDrawer(overrides?: {
  isLoading?: boolean;
  items?: typeof item[];
  selectedIds?: string[];
}) {
  return renderToStaticMarkup(
    <ScopeImportDrawer
      isLoading={overrides?.isLoading ?? false}
      items={overrides?.items ?? []}
      selectedIds={overrides?.selectedIds ?? []}
      onToggleItem={vi.fn()}
      onAddSelected={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("ScopeImportDrawer", () => {
  it("uses the shared overlay panel with domain-neutral loading and empty states", () => {
    const loadingMarkup = renderDrawer({ isLoading: true });
    const emptyMarkup = renderDrawer();

    expect(loadingMarkup).toContain("Import Scope Items");
    expect(loadingMarkup).toContain("Import completed Scope Builder items into this quote.");
    expect(loadingMarkup).toContain("Loading Scope Builder items...");
    expect(emptyMarkup).toContain("No completed Scope Builder items are available for this quote.");
    expect(emptyMarkup).not.toContain("lead workspace");
    expect(drawerSource).toContain('variant="overlay"');
    expect(drawerSource).toContain('event.key === "Escape"');
    expect(drawerSource).toContain("bodyFocusRef.current?.focus()");
  });

  it("renders selectable items and the selected-count action", () => {
    const unselectedMarkup = renderDrawer({ items: [item] });
    const selectedMarkup = renderDrawer({ items: [item], selectedIds: [item.id] });

    expect(unselectedMarkup).toContain("Wall framing");
    expect(unselectedMarkup).toContain("Timber wall framing to drawings");
    expect(unselectedMarkup).toContain("Carpentry");
    expect(unselectedMarkup).toMatch(/data-testid="scope-import-add-selected"[^>]*disabled/);
    expect(unselectedMarkup).toContain("Add Selected (0)");
    expect(selectedMarkup).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(selectedMarkup).not.toMatch(/data-testid="scope-import-add-selected"[^>]*disabled/);
    expect(selectedMarkup).toContain("Add Selected (1)");
    expect(drawerSource).toContain("onChange={() => onToggleItem(item.id)}");
    expect(drawerSource).toContain("onClick={onAddSelected}");
  });

  it("keeps host state mutually exclusive and preserves each Scope source boundary", () => {
    for (const host of [opportunitySource, projectSource]) {
      expect(host).toContain('type QuoteDrawerType = "scope" | "materials" | null');
      expect(host).toContain('setActiveQuoteDrawer("scope")');
      expect(host).toContain('setActiveQuoteDrawer("materials")');
      expect(host).toContain('activeQuoteDrawer === "scope"');
      expect(host).toContain('activeQuoteDrawer === "materials"');
      expect(host).toContain("scopeImportTriggerRef.current?.focus()");
      expect(host).toContain("setSelectedScopeCostItemIds([])");
      expect(host).toContain("closeScopeImport()");
    }

    expect(opportunitySource).toContain("const workspaceProjectId = sharedOpportunity.workspaceProjectId");
    expect(opportunitySource).toContain('rpc("save_commercial_quote_draft"');
    expect(projectSource).toContain('.eq("project_id", dbProjectId)');
    expect(projectSource).toContain('activeQuoteDrawer !== "scope" || hasLoadedScopeItems');
    expect(projectSource).toContain('rpc("save_project_quote_draft"');
  });
});
