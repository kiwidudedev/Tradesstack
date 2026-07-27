import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { getProject, getWorkspace } = vi.hoisted(() => ({
  getProject: vi.fn(),
  getWorkspace: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/trade-pack-workspaces-server", () => ({
  getTradePackWorkspaceBySlugForCurrentUser: getProject,
}));
vi.mock("@/lib/retention/phase7-retention-workspace", () => ({
  getRetentionWorkspace: getWorkspace,
}));
vi.mock("../retention/actions", () => ({
  createRetentionClaimAction: vi.fn(),
}));

import {
  retentionClaimRegisterAmounts,
  RetentionWorkspaceSection,
} from "./RetentionWorkspaceSection";

describe("RetentionWorkspaceSection failure isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProject.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("renders supplied server state without a second project or workspace read", async () => {
    const element = await RetentionWorkspaceSection({
      id: "retention",
      projectSlug: "project-one",
      initialSnapshot: {
        register: {
          succeeded: true,
          errorCode: null,
          rows: [],
        },
        claimRows: [],
        xeroVisible: false,
        masterAccounting: null,
        loadedAt: "2026-07-26T00:00:00.000Z",
      },
    });

    expect(renderToStaticMarkup(element)).toContain("No Retention Claims yet");
    expect(getProject).not.toHaveBeenCalled();
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    "retention_capability_disabled",
    "retention_project_mode_unsupported",
    "retention_permission_denied",
  ])("renders nothing when the authoritative register gate returns %s", async (errorCode) => {
    getWorkspace.mockResolvedValue({
      register: { succeeded: false, errorCode },
      claims: [],
    });

    await expect(
      RetentionWorkspaceSection({
        id: "retention",
        projectSlug: "project-one",
      }),
    ).resolves.toBeNull();
  });

  it("renders nothing and does not read Retention when project validation fails", async () => {
    getProject.mockResolvedValue(null);

    await expect(
      RetentionWorkspaceSection({
        id: "retention",
        projectSlug: "not-visible",
      }),
    ).resolves.toBeNull();
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it("renders nothing when the Retention workspace read throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getWorkspace.mockRejectedValue(new Error("sensitive database detail"));

    await expect(
      RetentionWorkspaceSection({
        id: "retention",
        projectSlug: "project-one",
      }),
    ).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith(
      "[retention][embedded] Retention workspace read failed.",
      { errorType: "Error" },
    );
    expect(log.mock.calls.flat().join(" ")).not.toContain(
      "sensitive database detail",
    );
    log.mockRestore();
  });

  it("renders the master ledger, explicit action, and historical claims only", async () => {
    const header = {
      organizationId: "00000000-0000-4000-8000-000000000010",
      projectId: "00000000-0000-4000-8000-000000000001",
      reference: null,
      issueDate: null,
      dueDate: null,
      subtotalExclTax: 0,
      draftRevision: 1,
      lastPositionStateHash: null,
      submissionStateHash: null,
      submittedBy: null,
      submittedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      createdBy: "00000000-0000-4000-8000-000000000020",
      createdAt: "2026-07-25T00:00:00Z",
      updatedAt: "2026-07-25T00:00:00Z",
    };
    getWorkspace.mockResolvedValue({
      register: {
        succeeded: true,
        rows: [
          {
            currentRetentionOwned: 1383.54,
            nativeClaimedAmount: 100,
            paidAmount: 25,
            remainingAmount: 1283.54,
            availableRetention: 1283.54,
          },
          {
            currentRetentionOwned: 145.65,
            nativeClaimedAmount: 0,
            paidAmount: 0,
            remainingAmount: 145.65,
            availableRetention: 145.65,
          },
        ],
      },
      claimRows: [
        {
          claim: {
            ...header,
            id: "00000000-0000-4000-8000-000000000100",
            claimNumber: "TEST-RC-01",
            title: "First release",
            issueDate: "2026-07-01",
            status: "submitted",
            subtotalExclTax: 100,
          },
          originCount: 1,
          paidAmount: 25,
          outstandingAmount: 75,
          xeroStatus: "exported",
          xeroVisible: true,
          automaticDraft: false,
        },
      ],
      masterAccounting: {
        pushedSubtotal: 100,
        pushedTax: 15,
        pushedTotal: 115,
        externalInvoiceId: "invoice-1",
        externalInvoiceNumber: "TEST-RC-01-R2",
      },
    });

    const element = await RetentionWorkspaceSection({
      id: "retention",
      projectSlug: "project-one",
    });
    const html = renderToStaticMarkup(element);

    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).not.toContain("TEST-RC-02");
    expect(html.match(/TEST-RC-01-R2/g)).toHaveLength(1);
    expect(html).not.toContain("Automatic draft");
    expect(html).toContain("Synced");
    expect(html).toContain("Totals");
    expect(html).toContain("$100.00");
    expect(html).toContain("$25.00");
    expect(html).toContain("$75.00");
    expect(html).toContain("$1,429.19");
    expect(html).toContain("$1,529.19");
    expect(html).toContain("Pushed to Xero");
    expect(html).toContain("New Since Last Push");
    expect(html).not.toContain("New Retention Claim");
    expect(html).not.toContain("Retention position details");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Current Retention Claim");
    expect(html).not.toContain("Open Retention Claim");
    expect(html).not.toContain("originating Payment Claims");
    expect(html).not.toContain("Submitted Retention Claims");
    expect(html).not.toContain("Attributed from successful reconciliations");
    expect(html).not.toContain("Unclaimed plus claimed awaiting payment");
    expect(html).not.toContain("bg-[var(--kpi-bg-navy)]");
    expect(html).not.toContain("bg-[var(--kpi-bg-amber)]");
    expect(html).not.toContain("bg-[var(--kpi-bg-sage)]");
    expect(html).not.toContain("bg-[var(--kpi-bg-peach)]");
  });

  it("presents the active cumulative revision without rewriting the immutable claim snapshot", async () => {
    expect(retentionClaimRegisterAmounts({
      status: "submitted",
      snapshotSubtotal: 1529.19,
      paidAmount: 0,
      outstandingAmount: 1529.19,
      activeRevisionSubtotal: 1553.94,
    })).toEqual({
      claimed: 1553.94,
      paid: 0,
      outstanding: 1553.94,
    });

    expect(retentionClaimRegisterAmounts({
      status: "draft",
      snapshotSubtotal: 1529.19,
      paidAmount: 0,
      outstandingAmount: 1529.19,
      activeRevisionSubtotal: 1553.94,
    })).toEqual({
      claimed: 1529.19,
      paid: 0,
      outstanding: 1529.19,
    });
  });

  it("uses a project-ledger empty state without promising automatic creation", async () => {
    getWorkspace.mockResolvedValue({
      register: { succeeded: true, rows: [] },
      claimRows: [],
    });

    const element = await RetentionWorkspaceSection({
      id: "retention",
      projectSlug: "project-one",
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No Retention Claims yet");
    expect(html).toContain(
      "Submitted Payment Claims will accumulate into this project",
    );
    expect(html).not.toContain(
      "will create a Retention Claim automatically",
    );
  });

  it("shows new cumulative retention without offering another claim", async () => {
    getWorkspace.mockResolvedValue({
      register: {
        succeeded: true,
        rows: [{
          currentRetentionOwned: 24.75,
          nativeClaimedAmount: 0,
          paidAmount: 0,
          remainingAmount: 24.75,
          availableRetention: 24.75,
        }],
      },
      claimRows: [],
    });

    const element = await RetentionWorkspaceSection({
      id: "retention",
      projectSlug: "project-one",
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Current Retention");
    expect(html).toContain("New Since Last Push");
    expect(html.match(/\$24\.75/g)).toHaveLength(2);
    expect(html).not.toContain("New Retention Claim");
    expect(html).toContain("No Retention Claims yet");
  });

  it("does not offer a new document when the master ledger has no availability", async () => {
    getWorkspace.mockResolvedValue({
      register: {
        succeeded: true,
        rows: [{
          currentRetentionOwned: 100,
          nativeClaimedAmount: 100,
          paidAmount: 0,
          remainingAmount: 0,
          availableRetention: 0,
        }],
      },
      claimRows: [],
    });

    const element = await RetentionWorkspaceSection({
      id: "retention",
      projectSlug: "project-one",
    });
    expect(renderToStaticMarkup(element)).not.toContain(
      "New Retention Claim",
    );
  });
});
