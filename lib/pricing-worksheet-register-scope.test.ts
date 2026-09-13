import { describe, expect, it } from "vitest";
import { buildProjectPricingWorksheetOwner } from "@/lib/pricing-worksheet-owner";
import {
  buildPricingWorksheetRegisterLoadScopeKey,
  buildPricingWorksheetRegisterScopeKey,
} from "@/lib/pricing-worksheet-register-scope";

function buildOwner(projectId = "project-a") {
  return buildProjectPricingWorksheetOwner({
    organizationId: "organization-a",
    opportunityId: "opportunity-a",
    projectId,
    projectSlug: projectId,
  });
}

describe("buildPricingWorksheetRegisterScopeKey", () => {
  it("keeps logically identical owner objects in one register load scope", () => {
    expect(buildPricingWorksheetRegisterScopeKey(buildOwner())).toBe(
      buildPricingWorksheetRegisterScopeKey(buildOwner()),
    );
  });

  it("changes when the Project ownership scope changes", () => {
    expect(buildPricingWorksheetRegisterScopeKey(buildOwner("project-a"))).not.toBe(
      buildPricingWorksheetRegisterScopeKey(buildOwner("project-b")),
    );
  });

  it("includes access and routing primitives without JSON serialization", () => {
    const writable = buildOwner();
    const readOnly = { ...writable, readOnly: true };
    const otherQuoteContext = { ...writable, quoteId: "quote-a" };

    expect(buildPricingWorksheetRegisterScopeKey(writable)).not.toBe(
      buildPricingWorksheetRegisterScopeKey(readOnly),
    );
    expect(buildPricingWorksheetRegisterScopeKey(writable)).not.toBe(
      buildPricingWorksheetRegisterScopeKey(otherQuoteContext),
    );
  });

  it("does not change for parent, pathname, sheet, successor, or same-session auth rerenders", () => {
    const firstRender = buildPricingWorksheetRegisterLoadScopeKey({
      owner: buildOwner(),
      sessionOrganizationId: "organization-a",
      sessionUserId: "user-a",
    });
    const unrelatedRerender = buildPricingWorksheetRegisterLoadScopeKey({
      owner: buildOwner(),
      sessionOrganizationId: "organization-a",
      sessionUserId: "user-a",
    });

    expect(unrelatedRerender).toBe(firstRender);
  });

  it("reloads for a different tenant, user, or Project", () => {
    const initial = buildPricingWorksheetRegisterLoadScopeKey({
      owner: buildOwner(),
      sessionOrganizationId: "organization-a",
      sessionUserId: "user-a",
    });

    expect(buildPricingWorksheetRegisterLoadScopeKey({
      owner: buildOwner("project-b"),
      sessionOrganizationId: "organization-a",
      sessionUserId: "user-a",
    })).not.toBe(initial);
    expect(buildPricingWorksheetRegisterLoadScopeKey({
      owner: buildOwner(),
      sessionOrganizationId: "organization-a",
      sessionUserId: "user-b",
    })).not.toBe(initial);
  });
});
