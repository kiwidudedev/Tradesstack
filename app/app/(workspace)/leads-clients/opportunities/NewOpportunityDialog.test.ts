import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialogPath = "app/app/(workspace)/leads-clients/opportunities/NewOpportunityDialog.tsx";
const pagePath = "app/app/(workspace)/leads-clients/opportunities/page.tsx";
const dependenciesPath = "lib/opportunity-creation-dependencies-server.ts";

const source = (path: string) => readFileSync(path, "utf8");

describe("New Opportunity client-picker stability", () => {
  it("preloads the authoritative organization clients and members before the dialog can open", () => {
    const page = source(pagePath);
    const dependencies = source(dependenciesPath);

    expect(page).toContain("getOpportunityCreationDependenciesForCurrentUser()");
    expect(page).toContain("<NewOpportunityDialog {...creationDependencies} />");
    expect(dependencies).toContain('.from("organization_clients")');
    expect(dependencies).toContain('.from("organization_members")');
    expect(dependencies).toContain('.eq("organization_id", member.organization_id)');
  });

  it("keeps one Primary Client select mounted instead of swapping loading and loaded branches", () => {
    const dialog = source(dialogPath);

    expect(dialog.match(/<select id="oppClient"/g)).toHaveLength(1);
    expect(dialog).not.toContain("isLoadingFormData");
    expect(dialog).not.toContain("Loading clients...");
    expect(dialog).not.toContain("No clients yet. Add below.");
    expect(dialog).not.toContain('from("organization_clients")');
    expect(dialog).not.toMatch(/<select id="oppClient"[^>]*\bkey=/);
  });

  it("keeps Tender Clients present and submits the selected Primary Client authority", () => {
    const dialog = source(dialogPath);

    expect(dialog.match(/<TenderClientMultiSelect/g)).toHaveLength(1);
    expect(dialog).toContain("clientId: shouldCreateNewClient ? null : selectedClientId");
    expect(dialog).toContain("...(shouldCreateNewClient ? [] : [selectedClientId])");
    expect(dialog).toContain("withPrimaryTenderClient(current, nextClientId)");
  });

  it("restores server-derived Primary Client and Owner defaults on reopen without refetching", () => {
    const dialog = source(dialogPath);

    expect(dialog).toContain("setSelectedClientId(initialPrimaryClientId(clients, loadError))");
    expect(dialog).toContain("setSelectedOwnerUserId(initialOwnerUserId(members, currentUserId))");
    expect(dialog).not.toContain("useEffect(");
    expect(dialog).not.toContain("resolveOrganizationId");
  });

  it("does not expose autofill-oriented metadata on the Primary Client trigger", () => {
    const dialog = source(dialogPath);
    const selectStart = dialog.indexOf('<select id="oppClient"');
    const selectEnd = dialog.indexOf("</select>", selectStart);
    const primarySelect = dialog.slice(selectStart, selectEnd);

    expect(selectStart).toBeGreaterThan(-1);
    expect(primarySelect).not.toContain("name=");
    expect(primarySelect).not.toContain("autoComplete=");
  });
});
