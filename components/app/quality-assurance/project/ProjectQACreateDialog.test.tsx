// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QARegisterRow } from "@/lib/quality-assurance/definitions/server";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createBlank: vi.fn(),
  createFromTemplate: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/quality-assurance/definitions/actions", () => ({
  createBlankProjectQAAction: mocks.createBlank,
  createProjectQAFromTemplateAction: mocks.createFromTemplate,
}));

import { ProjectQACreateDialog } from "./ProjectQACreateDialog";

function template(overrides: Partial<QARegisterRow> = {}): QARegisterRow {
  return {
    id: "template-1",
    name: "Suspended Ceilings",
    description: "Ceiling installation checks",
    status: "active",
    updatedAt: "2026-08-29T00:00:00.000Z",
    updatedBy: "Alex Builder",
    sectionCount: 3,
    fieldCount: 18,
    sourceTemplateName: null,
    inProgressCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    ...overrides,
  };
}

function setup(options: { templates?: QARegisterRow[]; canViewTemplates?: boolean; canManageTemplates?: boolean } = {}) {
  const onOpenChange = vi.fn();
  render(<ProjectQACreateDialog
    open
    onOpenChange={onOpenChange}
    projectSlug="tower-project"
    templates={options.templates ?? [template()]}
    canViewTemplates={options.canViewTemplates ?? true}
    canManageTemplates={options.canManageTemplates ?? true}
  />);
  return { user: userEvent.setup(), onOpenChange };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectQACreateDialog", () => {
  it("opens on an explicit start-method step without a Create action", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Create Project QA" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Use Company Template/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start Blank/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create Project QA" })).toBeNull();
  });

  it("shows an intentional permission state instead of an empty-template claim", () => {
    setup({ templates: [], canViewTemplates: false, canManageTemplates: false });
    expect(screen.queryByRole("button", { name: /Use Company Template/ })).toBeNull();
    expect(screen.getByText("You do not have access to Company QA Templates.")).toBeTruthy();
    expect(screen.queryByText("No active company QA templates")).toBeNull();
  });

  it("uses full-width mobile-friendly start targets and returns to them with Back", async () => {
    const { user } = setup();
    const templateChoice = screen.getByRole("button", { name: /Use Company Template/ });
    const blankChoice = screen.getByRole("button", { name: /Start Blank/ });
    expect(templateChoice.className).toContain("min-h-20");
    expect(templateChoice.className).toContain("w-full");
    expect(blankChoice.className).toContain("min-h-20");
    expect(blankChoice.className).toContain("w-full");
    await user.click(blankChoice);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /Use Company Template/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start Blank/ })).toBeTruthy();
  });

  it("renders compact active template radio rows without metadata and excludes draft or archived templates", async () => {
    const { user } = setup({ templates: [
      template(),
      template({ id: "template-2", name: "Waterproofing", sectionCount: 4, fieldCount: 22 }),
      template({ id: "template-draft", name: "Draft Template", status: "draft" }),
      template({ id: "template-archived", name: "Archived Template", status: "archived" }),
    ] });
    await user.click(screen.getByRole("button", { name: /Use Company Template/ }));
    expect(screen.getByRole("heading", { name: "Select Company QA Template" })).toBeTruthy();
    expect(screen.queryByText("3 sections · 18 checks")).toBeNull();
    expect(screen.queryByText("4 sections · 22 checks")).toBeNull();
    const selectedRow = screen.getByRole("radio", { name: /Suspended Ceilings/ }).closest("label");
    expect(selectedRow?.className).toContain("min-h-12");
    expect(selectedRow?.className).toContain("border-[var(--border)]");
    expect(selectedRow?.className).not.toContain("border-[var(--brand-blue)]");
    expect(selectedRow?.className).not.toContain("ring-1");
    expect(screen.queryByText("Draft Template")).toBeNull();
    expect(screen.queryByText("Archived Template")).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("copies the selected template with a name override and navigates to its editor", async () => {
    mocks.createFromTemplate.mockResolvedValue({ ok: true, data: { id: "project-qa-9" } });
    const { user, onOpenChange } = setup({ templates: [
      template(),
      template({ id: "template-2", name: "Waterproofing", sectionCount: 4, fieldCount: 22 }),
    ] });
    await user.click(screen.getByRole("button", { name: /Use Company Template/ }));
    await user.click(screen.getByRole("radio", { name: /Waterproofing/ }));
    const nameInput = screen.getByLabelText("Project QA Name");
    expect(nameInput).toHaveProperty("value", "Waterproofing");
    await user.clear(nameInput);
    await user.type(nameInput, "Level 3 Waterproofing");
    await user.click(screen.getByRole("button", { name: "Create Project QA" }));

    expect(mocks.createFromTemplate).toHaveBeenCalledWith({ projectSlug: "tower-project", templateId: "template-2", name: "Level 3 Waterproofing" });
    expect(mocks.createBlank).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.push).toHaveBeenCalledWith("/app/projects/tower-project/job-management/quality-assurance/project-qa-9/edit");
  });

  it("creates a blank Project QA and routes directly to its editor", async () => {
    mocks.createBlank.mockResolvedValue({ ok: true, data: { id: "blank-qa-4" } });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /Start Blank/ }));
    await user.type(screen.getByLabelText("Name"), "Project-specific QA");
    await user.type(screen.getByLabelText("Description"), "Checks for this job");
    await user.click(screen.getByRole("button", { name: "Create Project QA" }));

    expect(mocks.createBlank).toHaveBeenCalledWith({ projectSlug: "tower-project", name: "Project-specific QA", description: "Checks for this job" });
    expect(mocks.createFromTemplate).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/app/projects/tower-project/job-management/quality-assurance/blank-qa-4/edit");
  });

  it("shows the no-active-template state with useful actions", async () => {
    const { user } = setup({ templates: [] });
    await user.click(screen.getByRole("button", { name: /Use Company Template/ }));
    expect(screen.getByText("No active company QA templates")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Blank" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Company QA Templates" })).toHaveProperty("href", "http://localhost:3000/app/settings/qa-templates");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("keeps ordinary creation errors in the dialog", async () => {
    mocks.createFromTemplate.mockResolvedValue({ ok: false, error: "Unable to copy QA template." });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /Use Company Template/ }));
    await user.click(screen.getByRole("button", { name: "Create Project QA" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Unable to copy QA template.");
    expect(screen.getByLabelText("Project QA Name")).toHaveProperty("value", "Suspended Ceilings");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("removes a stale template, retains the entered name, and allows another selection", async () => {
    mocks.createFromTemplate.mockResolvedValue({ ok: false, error: "Active QA template not found" });
    const { user } = setup({ templates: [
      template(),
      template({ id: "template-2", name: "Waterproofing" }),
    ] });
    await user.click(screen.getByRole("button", { name: /Use Company Template/ }));
    const nameInput = screen.getByLabelText("Project QA Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Custom QA Name");
    await user.click(screen.getByRole("button", { name: "Create Project QA" }));

    expect((await screen.findByRole("alert")).textContent).toContain("no longer active");
    expect(screen.queryByText("Suspended Ceilings")).toBeNull();
    expect(screen.getByRole("radio", { name: /Waterproofing/ })).toBeTruthy();
    expect(screen.getByLabelText("Project QA Name")).toHaveProperty("value", "Custom QA Name");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("disables Create immediately and blocks repeated submissions while pending", async () => {
    let resolveCreate: ((result: { ok: true; data: { id: string } }) => void) | undefined;
    mocks.createFromTemplate.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /Use Company Template/ }));
    const createButton = screen.getByRole("button", { name: "Create Project QA" });
    await user.click(createButton);
    expect((screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Creating…" }));
    expect(mocks.createFromTemplate).toHaveBeenCalledTimes(1);
    resolveCreate?.({ ok: true, data: { id: "pending-qa" } });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });
});
