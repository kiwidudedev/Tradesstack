// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QARegisterRow } from "@/lib/quality-assurance/definitions/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/fonts", () => ({
  akzidenz: { className: "", variable: "" },
  ibmPlexSans: { className: "", variable: "" },
  interBold: { className: "", variable: "" },
  interMedium: { className: "", variable: "" },
}));
vi.mock("@/components/app/ProjectQualityAssuranceBoard", () => ({ ProjectQualityAssuranceBoard: () => <div>Existing QA Activity Board</div> }));
vi.mock("./StartQADialog", () => ({ StartQADialog: () => null }));
vi.mock("@/lib/quality-assurance/definitions/actions", () => ({
  createBlankProjectQAAction: vi.fn(),
  createProjectQAFromTemplateAction: vi.fn(),
}));

import { ProjectQARegister } from "./ProjectQARegister";

function plan(overrides: Partial<QARegisterRow>): QARegisterRow {
  return {
    id: "qa-1",
    name: "Suspended Ceilings QA",
    description: "",
    status: "draft",
    updatedAt: "2026-08-29T00:00:00.000Z",
    updatedBy: "Alex Builder",
    sectionCount: 3,
    fieldCount: 18,
    sourceTemplateName: "Suspended Ceilings",
    inProgressCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    ...overrides,
  };
}

function setup(options: { canViewTemplates?: boolean } = {}) {
  render(<ProjectQARegister
    projectSlug="tower-project"
    plans={[
      plan({ id: "draft", status: "draft" }),
      plan({ id: "ready", name: "Ready QA", status: "active", sourceTemplateName: null }),
      plan({ id: "archived", name: "Archived QA", status: "archived" }),
    ]}
    templates={[plan({ id: "template", name: "Suspended Ceilings", status: "active" })]}
    canWrite
    canInspect
    canViewTemplates={options.canViewTemplates ?? true}
    canManageTemplates={false}
  />);
  return userEvent.setup();
}

afterEach(() => cleanup());

describe("ProjectQARegister creation entry point", () => {
  it("opens the start-method dialog from New Project QA and preserves lineage text", async () => {
    const user = setup();
    expect(screen.getAllByText("Created from Suspended Ceilings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Started blank").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /New Project QA/ }));
    expect(screen.getByRole("heading", { name: "Create Project QA" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Use Company Template/ })).toBeTruthy();
  });

  it("keeps the header focused on one project-level creation action", () => {
    setup();
    expect(screen.queryByRole("link", { name: "Company QA Templates" })).toBeNull();
    expect(screen.getByRole("button", { name: /New Project QA/ })).toBeTruthy();
  });

  it("preserves draft, Ready, and archived operational actions", () => {
    setup();
    expect(screen.getAllByRole("link", { name: "Continue setup" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Start QA" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "View" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Edit" }).length).toBeGreaterThan(0);
  });
});
