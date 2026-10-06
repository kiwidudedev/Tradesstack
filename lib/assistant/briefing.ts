import "server-only";

import type { AssistantContext, AssistantRoleMode, AssistantToolResult } from "./types";

type BriefingTool = "project_overview" | "project_activity" | "purchase_orders" | "variations" | "payment_claims" | "qa";

export type ProjectBriefing = {
  project: { id: string; name: string; slug: string };
  mode: AssistantRoleMode;
  commercial: Record<string, unknown>;
  procurement: Record<string, unknown>;
  variations: Record<string, unknown>;
  claims: Record<string, unknown>;
  qa: Record<string, unknown>;
  activity: Record<string, unknown>;
  risks: Array<{ code: string; severity: "high" | "medium" | "low"; title: string; evidence: string; citations: unknown[] }>;
  priorities: Array<{ rank: number; title: string; reason: string; citations: unknown[] }>;
  unavailableModules: Array<{ tool: string; status: string; message: string }>;
  sources: unknown[];
  asOf: string;
};

function records(result: AssistantToolResult): Array<Record<string, unknown>> {
  if (result.status !== "ok" || !result.data || typeof result.data !== "object") return [];
  const value = (result.data as { records?: unknown[] }).records;
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")) : [];
}

function data(result: AssistantToolResult): Record<string, unknown> {
  return result.status === "ok" && result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
}

function statusLabel(result: AssistantToolResult) {
  if (result.status === "ok" || result.status === "empty") return null;
  return { tool: result.toolName, status: result.status, message: result.status === "failed" ? result.safeMessage : result.safeMessage };
}

export async function buildProjectBriefing(
  context: AssistantContext,
  runTool: (tool: BriefingTool) => Promise<AssistantToolResult>,
  mode: AssistantRoleMode = "auto",
): Promise<ProjectBriefing> {
  const toolNames: BriefingTool[] = ["project_overview", "variations", "purchase_orders", "payment_claims", "qa", "project_activity"];
  const results = await Promise.all(toolNames.map((tool) => runTool(tool)));
  const byTool = new Map(results.map((result) => [result.toolName, result]));
  const overview = byTool.get("project_overview") ?? { toolName: "project_overview", sourceService: "briefing", status: "empty", data: [], citations: [], truncated: false, returnedRows: 0, totalRows: 0, asOf: new Date().toISOString() } as AssistantToolResult;
  const variationResult = byTool.get("variations")!;
  const poResult = byTool.get("purchase_orders")!;
  const claimResult = byTool.get("payment_claims")!;
  const qaResult = byTool.get("qa")!;
  const activityResult = byTool.get("project_activity")!;
  const variationRows = records(variationResult);
  const poRows = records(poResult);
  const claimRows = records(claimResult);
  const qaRows = records(qaResult);
  const financial = data(overview).financial && typeof data(overview).financial === "object" ? data(overview).financial as Record<string, unknown> : {};
  const pendingVariations = variationRows.filter((row) => row.approvalState === "pending");
  const draftPos = poRows.filter((row) => String(row.status).toLowerCase() === "draft");
  const unpaidClaims = claimRows.filter((row) => !["paid", "fully_paid"].includes(String(row.status).toLowerCase()));
  const openQa = qaRows.filter((row) => !["complete", "completed", "closed", "approved"].includes(String(row.status).toLowerCase()));
  const risks: ProjectBriefing["risks"] = [];
  const priorities: ProjectBriefing["priorities"] = [];

  if (pendingVariations.length) {
    const value = pendingVariations.reduce((sum, row) => sum + numberValue(row.value), 0);
    risks.push({ code: "UNAPPROVED_VARIATIONS", severity: value > 0 ? "high" : "medium", title: `${pendingVariations.length} variation${pendingVariations.length === 1 ? "" : "s"} still need sign-off`, evidence: value ? `Pending variation value is ${value}.` : "Pending variation records are present.", citations: variationResult.status === "ok" ? variationResult.citations : [] });
    priorities.push({ rank: 1, title: "Chase variation sign-off", reason: "Unapproved change work can create commercial exposure if it proceeds without authority.", citations: variationResult.status === "ok" ? variationResult.citations : [] });
  }
  if (draftPos.length) {
    const registerTotal = numberValue(data(poResult).registerTotal);
    risks.push({ code: "DRAFT_PURCHASE_ORDERS", severity: "medium", title: `${draftPos.length} purchase order${draftPos.length === 1 ? "" : "s"} remain in Draft`, evidence: registerTotal ? `The Draft PO register totals ${registerTotal}; Draft POs are not committed cost.` : "Draft POs are not committed cost.", citations: poResult.status === "ok" ? poResult.citations : [] });
    priorities.push({ rank: 2, title: "Confirm procurement coverage", reason: "Draft POs are not committed and may not represent approved supplier orders.", citations: poResult.status === "ok" ? poResult.citations : [] });
  }
  if (unpaidClaims.length || numberValue(financial.revenue) > 0) {
    priorities.push({ rank: 3, title: "Review the current claim/payment position", reason: "Claims and payment state should be checked before treating claimed value as cash received.", citations: claimResult.status === "ok" ? claimResult.citations : [] });
  }
  if (openQa.length) {
    risks.push({ code: "OPEN_QA", severity: "medium", title: `${openQa.length} QA item${openQa.length === 1 ? "" : "s"} remain open`, evidence: "Current QA records include items that are not complete or closed.", citations: qaResult.status === "ok" ? qaResult.citations : [] });
    priorities.push({ rank: 4, title: "Close out open QA", reason: "Open QA can hold up completion or handover.", citations: qaResult.status === "ok" ? qaResult.citations : [] });
  }
  if (!risks.length && !priorities.length) {
    priorities.push({ rank: 1, title: "No deterministic priority was identified", reason: "The available project modules did not expose an overdue or unresolved item.", citations: [] });
  }

  return {
    project: { id: context.projectId, name: context.projectName, slug: context.projectSlug },
    mode,
    commercial: { financial, profitability: financial.profitability ?? { status: "not_determinable", reason: "Authoritative margin/cost-to-complete data is not available in this briefing." }, claimRows: claimRows.length },
    procurement: { purchaseOrders: poRows, draftCount: draftPos.length, registerTotal: data(poResult).registerTotal ?? null, committed: financial.committed ?? null },
    variations: { records: variationRows, pendingCount: pendingVariations.length, approvedValue: financial.approvedVariations ?? null },
    claims: { records: claimRows, outstandingCount: unpaidClaims.length, claimed: financial.revenue ?? null, retention: financial.retention ?? null },
    qa: { records: qaRows, openCount: openQa.length, source: qaResult.status === "empty" ? "current QA returned no records; legacy QA is not included in this source" : "current QA" },
    activity: { data: data(activityResult) },
    risks,
    priorities: priorities.sort((a, b) => a.rank - b.rank),
    unavailableModules: results.map(statusLabel).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    sources: results.flatMap((result) => result.status === "ok" ? result.citations : []),
    asOf: new Date().toISOString(),
  };
}
