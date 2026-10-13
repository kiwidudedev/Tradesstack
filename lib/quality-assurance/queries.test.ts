import { describe, expect, it, vi } from "vitest";
import { listQualityInspections, listQualityIssues, listQualityWorkProofs } from "@/lib/quality-assurance/queries";

describe("quality assurance work-proof queries", () => {
  it("qualifies the checklist relationship when loading work proofs", async () => {
    const select = vi.fn().mockReturnThis();
    const eqOrganization = vi.fn().mockReturnThis();
    const eqProject = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "proof-1",
          trade_type: "General",
          work_category: "Inspection",
          area: "NP Control Tower",
          note: "Synthetic proof",
          status: "completed",
          created_by: "user-1",
          created_at: "2026-10-03T00:00:00.000Z",
          updated_at: "2026-10-03T00:00:00.000Z",
          completed_at: "2026-10-03T00:01:00.000Z",
          project_quality_work_proof_checklist_items: [
            { id: "item-1", label: "Check", checked: true, checked_by: "user-1", checked_at: null },
          ],
        },
      ],
      error: null,
    });

    const supabase = {
      from: vi.fn(() => ({ select, eq: eqOrganization, order, limit })),
    };
    eqOrganization.mockImplementationOnce(() => ({ eq: eqProject }));
    eqProject.mockImplementationOnce(() => ({ order }));
    order.mockImplementationOnce(() => ({ limit }));

    await expect(listQualityWorkProofs(supabase, {
      organizationId: "org-1",
      projectId: "project-1",
    })).resolves.toMatchObject([
      {
        id: "proof-1",
        checklistItems: [{ id: "item-1", checked: true }],
      },
    ]);

    expect(select).toHaveBeenCalledWith(expect.stringContaining(
      "project_quality_work_proof_checklist_items!project_quality_work_proof_checklist_items_work_proof_id_fkey(",
    ));
  });

  it("maps a verified issue returned by the current query without filtering it", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "issue-1",
          title: "Synthetic QA issue",
          description: "Verified issue",
          trade: "General",
          location: "NP Control Tower",
          priority: "High",
          status: "Verified",
          due_date: null,
          assignee_name: "Corey",
          assignee_user_id: "user-1",
          linked_work_proof_id: null,
          closed_at: "2026-10-03T00:02:00.000Z",
          updated_at: "2026-10-03T00:02:00.000Z",
        },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const eqProject = vi.fn().mockReturnValue({ order });
    const eqOrganization = vi.fn().mockReturnValue({ eq: eqProject });
    const select = vi.fn().mockReturnValue({ eq: eqOrganization });
    const supabase = { from: vi.fn(() => ({ select })) };

    await expect(listQualityIssues(supabase, {
      organizationId: "org-1",
      projectId: "project-1",
    })).resolves.toMatchObject([
      {
        id: "issue-1",
        status: "Verified",
        priority: "High",
      },
    ]);
  });

  it("qualifies the inspection-item relationship when loading inspections", async () => {
    const select = vi.fn().mockReturnThis();
    const eqOrganization = vi.fn().mockReturnThis();
    const eqProject = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });

    const supabase = {
      from: vi.fn(() => ({ select, eq: eqOrganization, order, limit })),
    };
    eqOrganization.mockImplementationOnce(() => ({ eq: eqProject }));
    eqProject.mockImplementationOnce(() => ({ order }));
    order.mockImplementationOnce(() => ({ limit }));

    await expect(listQualityInspections(supabase, {
      organizationId: "org-1",
      projectId: "project-1",
    })).resolves.toEqual([]);

    expect(select).toHaveBeenCalledWith(expect.stringContaining(
      "project_quality_inspection_items!project_quality_inspection_items_inspection_scope_fkey(",
    ));
  });
});
