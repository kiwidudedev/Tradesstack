// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardAggregateResult } from "@/lib/project-dashboard-aggregate";
import { ProjectDashboardBoard } from "./ProjectDashboardBoard";

type Row = Record<string, unknown>;
type Result = { data: Row | Row[] | null; error: { message: string } | null; count: number };
const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  session: { id: "user-1", organizationId: "org-1" as string | null },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ session: harness.session }) }));
vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "project-slug" }) }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => harness }));
vi.mock("@/lib/fonts", () => ({ interMedium: { className: "font" }, ibmPlexSans: { className: "font" } }));
vi.mock("@/components/app/OperationalKpiCard", () => ({
  OperationalKpiCard: ({ label, value, helper }: { label: string; value: string; helper: string }) => (
    <section data-kpi={label}>{value}<small>{helper}</small></section>
  ),
}));

const queries: Query[] = [];
let quotes: Row[];
let quoteError: string | null;
const project = { id: "project-1", organization_id: "org-1", slug: "project-slug", name: "Test project", stage: "Planning", location: "Auckland", created_at: "2026-01-01", client_id: null };
const variation = { id: "variation-1", organization_id: "org-1", project_id: "project-1", total_variation_price: 25, status: "Approved", variation_number: "V-001", updated_at: "2026-01-03" };

class Query implements PromiseLike<Result> {
  filters: Array<[string, unknown]> = [];
  orderBy: string | null = null;
  ascending = false;
  maximum = Infinity;
  single = false;
  constructor(readonly table: string) { queries.push(this); }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  neq() { return this; }
  gte() { return this; }
  gt() { return this; }
  lt() { return this; }
  in() { return this; }
  is() { return this; }
  order(column: string, options: { ascending: boolean }) { this.orderBy = column; this.ascending = options.ascending; return this; }
  limit(value: number) { this.maximum = value; return this; }
  maybeSingle() { this.single = true; return this; }
  result(): Result {
    let rows: Row[] = this.table === "organization_projects" ? [project]
      : this.table === "project_quotes" ? quotes
      : this.table === "project_variations" ? [variation] : [];
    rows = rows.filter((row) => this.filters.every(([key, value]) => row[key] === value));
    if (this.orderBy) {
      const key = this.orderBy;
      rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (this.ascending ? 1 : -1));
    }
    rows = rows.slice(0, this.maximum);
    return { data: this.single ? rows[0] ?? null : rows, count: 0, error: this.table === "project_quotes" && quoteError ? { message: quoteError } : null };
  }
  then<T = Result, U = never>(fulfilled?: ((value: Result) => T | PromiseLike<T>) | null, rejected?: ((reason: unknown) => U | PromiseLike<U>) | null): PromiseLike<T | U> {
    return Promise.resolve(this.result()).then(fulfilled, rejected);
  }
}

function aggregate(quoteValue = 200): DashboardAggregateResult {
  return {
    project: { projectId: project.id, projectName: project.name, stage: project.stage, location: project.location, createdAt: project.created_at, clientName: "Unassigned" },
    metrics: { overdueTasks: 0, awaitingVariationApproval: 0, claimReadyToSend: 0, openIssues: 0, failedInspections: 0, tasksDueToday: 0, pendingVariations: 0, claimsThisMonth: 0, activeWorkers: 0, pendingSignoffs: 0, inspectionsToday: 0 },
    financials: { quoteValue, variationTotal: 25, claimsSubmitted: 0, claimsPaidAmount: 0, claimsUnpaidAmount: 0, poOutstandingCount: 0, poOutstandingAmount: 0 },
    feeds: { tasks: [], issues: [], variations: [variation], claims: [], time_events: [], signoffs: [] },
  };
}

function configure(mode: "aggregate" | "error" | "invalid") {
  harness.from.mockImplementation((table: string) => ({ select: () => new Query(table) }));
  harness.rpc.mockImplementation(async (name: string) => {
    if (name === "get_project_dashboard_aggregate") return { data: mode === "aggregate" ? aggregate() : null, error: mode === "error" ? { message: "Aggregate unavailable" } : null };
    if (name === "ensure_organization_membership") return { data: "org-1", error: null };
    if (name === "list_project_members") return { data: [], error: null };
    // The contractual resolver is deliberately unavailable in every case.
    return { data: null, error: { message: `Unexpected RPC: ${name}` } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  quoteError = null;
  harness.session.organizationId = "org-1";
  quotes = [
    { id: "accepted", organization_id: "org-1", project_id: "project-1", status: "Accepted", total_quote_price: 100, updated_at: "2026-01-01" },
    { id: "newer", organization_id: "org-1", project_id: "project-1", status: "Draft", total_quote_price: 200, updated_at: "2026-01-02" },
    { id: "other-project", organization_id: "org-1", project_id: "project-2", total_quote_price: 900, updated_at: "2026-01-04" },
    { id: "other-org", organization_id: "org-2", project_id: "project-1", total_quote_price: 800, updated_at: "2026-01-05" },
  ];
  for (const method of ["time", "timeEnd", "info", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function loaded(mode: "aggregate" | "error" | "invalid", expectedPipeline = "225") {
  configure(mode);
  const view = render(<ProjectDashboardBoard />);
  await waitFor(() => expect(view.container.querySelector('[data-kpi="Pipeline value"]')?.textContent).toContain(expectedPipeline));
  await waitFor(() => expect(harness.rpc).toHaveBeenCalledWith("list_project_members", { p_organization_id: "org-1", p_project_id: "project-1" }));
  return view;
}

describe("dashboard aggregate and independent legacy fallback", () => {
  it("keeps the successful aggregate fast path and the separate team loader", async () => {
    await loaded("aggregate");
    expect(harness.rpc.mock.calls.map(([name]) => name)).toEqual(["get_project_dashboard_aggregate", "list_project_members"]);
    expect(queries.map((q) => q.table)).toEqual(["organization_members"]);
  });

  it.each(["error", "invalid"] as const)("selects the newer quote regardless of Accepted status when aggregate returns %s", async (mode) => {
    const normal = await loaded("aggregate");
    const normalCards = Array.from(normal.container.querySelectorAll("[data-kpi]")).map((card) => card.textContent);
    const normalActivity = normal.container.textContent?.includes("V-001");
    cleanup();
    harness.rpc.mockClear();
    queries.length = 0;
    const fallback = await loaded(mode);
    expect(Array.from(fallback.container.querySelectorAll("[data-kpi]")).map((card) => card.textContent)).toEqual(normalCards);
    expect(fallback.container.textContent?.includes("V-001")).toBe(normalActivity);
    expect(normalActivity).toBe(true);
    const quoteQuery = queries.find((q) => q.table === "project_quotes");
    expect(quoteQuery?.filters).toEqual([["organization_id", "org-1"], ["project_id", "project-1"]]);
    expect(quoteQuery?.orderBy).toBe("updated_at");
    expect(quoteQuery?.ascending).toBe(false);
    expect(quoteQuery?.maximum).toBe(1);
    expect(harness.rpc.mock.calls.map(([name]) => name)).toEqual(["get_project_dashboard_aggregate", "list_project_members"]);
    // The real aggregate SQL retains the same selection contract; this does not execute SQL.
    const sql = readFileSync("supabase/migrations/20260429110000_add_project_dashboard_aggregate_rpc.sql", "utf8");
    const latestQuote = sql.slice(sql.indexOf("latest_quote as ("), sql.indexOf("time_event_feed as ("));
    expect(latestQuote).toContain("organization_id = p_organization_id");
    expect(latestQuote).toContain("project_id = v_project.id");
    expect(latestQuote).toMatch(/order by updated_at desc\s+limit 1/);
    expect(latestQuote).not.toContain("status");
  });

  it("uses zero quote value when the project has no quotes", async () => {
    quotes = [];
    await loaded("error", "25");
  });

  it("retains organization resolution when the session has no organization", async () => {
    harness.session.organizationId = null;
    await loaded("error");
    expect(harness.rpc.mock.calls.map(([name]) => name)).toEqual(["ensure_organization_membership", "get_project_dashboard_aggregate", "list_project_members"]);
  });

  it("still reports a real fallback query error instead of fabricating a value", async () => {
    quoteError = "Quote read denied";
    configure("error");
    const view = render(<ProjectDashboardBoard />);
    await waitFor(() => expect(view.container.textContent).toContain("Quote read denied"));
    expect(harness.rpc.mock.calls.map(([name]) => name)).toEqual(["get_project_dashboard_aggregate"]);
  });
});
