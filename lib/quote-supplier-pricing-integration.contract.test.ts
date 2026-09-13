import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sharedEditor = readFileSync(resolve(process.cwd(), "components/app/QuoteEditorShared.tsx"), "utf8");
const quoteDrawer = readFileSync(resolve(process.cwd(), "components/app/QuoteSupplierPricingDrawer.tsx"), "utf8");
const organizationDrawer = readFileSync(resolve(process.cwd(), "components/app/OrganizationSupplierPricingDrawer.tsx"), "utf8");
const browser = readFileSync(resolve(process.cwd(), "components/app/SharedSupplierPricingBrowser.tsx"), "utf8");
const opportunity = readFileSync(resolve(process.cwd(), "components/app/OpportunityQuoteRevisionEditor.tsx"), "utf8");
const project = readFileSync(resolve(process.cwd(), "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "components/app/WorksheetSidePanel.tsx"), "utf8");

describe("Quote supplier pricing integration contract", () => {
  it("adds one controlled Materials action to the shared Quote toolbar", () => {
    expect(sharedEditor).toContain("canUseMaterials && onOpenMaterials");
    expect(sharedEditor).toContain("Materials");
    expect(sharedEditor).not.toContain("supplier-pricing?");
  });

  it("uses the same browser for worksheet and Quote destinations", () => {
    expect(quoteDrawer).toContain("OrganizationSupplierPricingDrawer");
    expect(organizationDrawer).toContain("SharedSupplierPricingBrowser");
    expect(browser).toContain("requestController.current?.abort()");
    expect(browser).toContain("requestSequence");
    expect(browser).toContain("window.setTimeout");
    expect(browser).toContain("300");
  });

  it("integrates both controllers through the same mapper and local line state", () => {
    for (const controller of [opportunity, project]) {
      expect(controller).toContain("buildQuoteLineFromSupplierPrice(item)");
      expect(controller).toContain("setLineItems((current) => [...current");
      expect(controller).toContain("QuoteSupplierPricingDrawer");
      expect(controller).toContain("canUseMaterials");
      expect(controller).toContain("Save Quote to persist this line");
    }
  });

  it("uses a fixed responsive overlay with Escape, autofocus, and focus return", () => {
    expect(organizationDrawer).toContain('variant="overlay"');
    expect(organizationDrawer).toContain('event.key === "Escape"');
    expect(organizationDrawer).toContain("autoFocus");
    expect(browser).toContain('event.key !== "Escape"');
    expect(shell).toContain('variant === "overlay"');
    expect(opportunity).toContain("materialsTriggerRef.current?.focus()");
    expect(project).toContain("materialsTriggerRef.current?.focus()");
  });

  it("keeps Quote Materials mutually exclusive with the Scope drawer without changing add behavior", () => {
    for (const controller of [opportunity, project]) {
      expect(controller).toContain('type QuoteDrawerType = "scope" | "materials" | null');
      expect(controller).toContain('setActiveQuoteDrawer("materials")');
      expect(controller).toContain('activeQuoteDrawer === "materials" && canUseMaterials');
      expect(controller).toContain("buildQuoteLineFromSupplierPrice(item)");
    }
  });
});
