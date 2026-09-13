import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityLeadDetailsForm } from "./OpportunityLeadDetailsForm";

const clients = [
  { id: "fletcher", name: "Jordan", company_name: "Fletcher Construction" },
  { id: "harbour", name: "Josh", company_name: "Harbour Side Builders" },
  { id: "dynamic", name: "Taylor", company_name: "Dynamic Tool & Die" },
];

describe("OpportunityLeadDetailsForm", () => {
  it("initializes the shared compact selector from all active Tender Clients", () => {
    const markup = renderToStaticMarkup(createElement(OpportunityLeadDetailsForm, {
      action: () => undefined,
      clients,
      initialPrimaryClientId: "fletcher",
      initialTenderClientIds: ["fletcher", "harbour", "dynamic"],
      projectName: "Langton Road",
      location: "Auckland",
      dueDate: "2026-08-23",
      createdAtLabel: "22 Aug, 16:28",
    }));

    expect(markup).toContain("Fletcher Construction, Harbour Side Builders +1 more");
    expect(markup.match(/name="tenderClientIds"/g)).toHaveLength(3);
    expect(markup).toContain('name="primaryClientId"');
    expect(markup).not.toContain('type="checkbox"');
  });

  it("keeps create and edit on the same searchable selector", () => {
    const detailPage = readFileSync(
      new URL("../../app/app/(workspace)/leads-clients/opportunities/[opportunityId]/page.tsx", import.meta.url),
      "utf8",
    );
    const dialog = readFileSync(
      new URL("../../app/app/(workspace)/leads-clients/opportunities/NewOpportunityDialog.tsx", import.meta.url),
      "utf8",
    );
    const fullPage = readFileSync(
      new URL("../../app/app/(workspace)/leads-clients/opportunities/new/page.tsx", import.meta.url),
      "utf8",
    );
    const editForm = readFileSync(new URL("./OpportunityLeadDetailsForm.tsx", import.meta.url), "utf8");

    expect(detailPage).toContain("<OpportunityLeadDetailsForm");
    expect(detailPage).not.toContain('name="tenderClientIds"');
    expect(detailPage).toContain("revalidatePath(`/app/leads-clients/opportunities/${opportunityId}`)");
    expect(editForm).toContain("<TenderClientMultiSelect");
    expect(dialog).toContain("<TenderClientMultiSelect");
    expect(fullPage).toContain("<TenderClientMultiSelect");
  });
});
