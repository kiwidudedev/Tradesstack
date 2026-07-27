import Link from "next/link";
import { AlertTriangle, BrainCircuit, Clock, DatabaseZap, DollarSign, GitBranch, ShieldCheck } from "lucide-react";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Badge } from "@/components/ui/badge";
import {
  getUniversalLearningOperationsDashboardData,
  parseUniversalLearningOperationsFilters,
  type CostSummaryRow,
  type LearningReviewActionResultOpsRow,
  type LearningReviewQueueOpsRow,
  type LearningReviewRunOpsRow,
  type LearningReviewRunRecordOpsRow,
  type OrganizationMemoryLinkOpsRow,
  type ReviewRunDetail,
  type UniversalLearningOperationsDashboardData,
} from "@/lib/universal-learning/operations-server";
import { UNIVERSAL_LEARNING_CONTAINER_TYPES } from "@/lib/universal-learning/types";
import { requirePlatformAdmin } from "@/lib/permissions-server";

const DEFAULT_FALLBACK = "/app/dashboard";
const QUEUE_STATES = ["pending", "claimed", "retry_scheduled", "completed", "dead_lettered"] as const;
const RUN_STATUSES = ["pending", "running", "completed", "failed", "skipped"] as const;

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NZ").format(value ?? 0);
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value ?? 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function shortId(value: string | null | undefined) {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function statusTone(value: string | null | undefined) {
  if (value === "completed") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (value === "dead_lettered" || value === "failed") return "bg-red-100 text-red-800 border-red-200";
  if (value === "retry_scheduled" || value === "claimed" || value === "running") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function card(label: string, value: string, meta: string) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{meta}</p>
    </div>
  );
}

function emptyState(message: string) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">{message}</div>;
}

function Filters({
  data,
}: {
  data: UniversalLearningOperationsDashboardData;
}) {
  return (
    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6" method="get">
      <label className="text-sm font-medium text-slate-700">
        Organization
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="organizationId"
          placeholder="organization id"
          defaultValue={data.filters.organizationId ?? ""}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Container
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="containerType"
          defaultValue={data.filters.containerType ?? ""}
        >
          <option value="">All containers</option>
          {UNIVERSAL_LEARNING_CONTAINER_TYPES.map((containerType) => (
            <option key={containerType} value={containerType}>{containerType}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Month
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="reviewMonth"
          placeholder="YYYY-MM"
          defaultValue={data.filters.reviewMonth ?? ""}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Queue state
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="queueState"
          defaultValue={data.filters.queueState ?? ""}
        >
          <option value="">All queue states</option>
          {QUEUE_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Run status
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="runStatus"
          defaultValue={data.filters.runStatus ?? ""}
        >
          <option value="">All run statuses</option>
          {RUN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Limit
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="limit"
          type="number"
          min="1"
          max="200"
          defaultValue={data.filters.limit}
        />
      </label>
      <label className="md:col-span-5 text-sm font-medium text-slate-700">
        Review run detail
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="reviewRunId"
          placeholder="review run id"
          defaultValue={data.filters.reviewRunId ?? ""}
        />
      </label>
      <div className="flex items-end gap-2">
        <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white" type="submit">
          Apply
        </button>
        <Link className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" href="/app/internal/universal-learning">
          Reset
        </Link>
      </div>
    </form>
  );
}

function QueueRowsTable({ rows }: { rows: LearningReviewQueueOpsRow[] }) {
  if (rows.length === 0) return emptyState("No queue rows match the current filters.");
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-3">Queue ID</th>
            <th className="p-3">Organization</th>
            <th className="p-3">Container</th>
            <th className="p-3">Month</th>
            <th className="p-3">State</th>
            <th className="p-3">Attempts</th>
            <th className="p-3">Priority</th>
            <th className="p-3">Available</th>
            <th className="p-3">Last Run</th>
            <th className="p-3">Last Error</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-3 font-mono text-xs">{shortId(row.id)}</td>
              <td className="p-3 font-mono text-xs">{shortId(row.organization_id)}</td>
              <td className="p-3">{row.container_type}</td>
              <td className="p-3">{row.review_month}</td>
              <td className="p-3"><Badge className={statusTone(row.queue_state)}>{row.queue_state}</Badge></td>
              <td className="p-3">{row.attempt_count}/{row.max_attempts}</td>
              <td className="p-3">{row.priority}</td>
              <td className="p-3">{formatDateTime(row.available_at)}</td>
              <td className="p-3 font-mono text-xs">{shortId(row.last_run_id)}</td>
              <td className="max-w-sm p-3 text-xs text-slate-600">{row.last_error_code ?? row.last_error_message ?? "—"}</td>
              <td className="p-3 text-xs text-slate-600">
                {row.last_run_id ? (
                  <Link className="font-semibold text-slate-950 underline" href={`/app/internal/universal-learning?reviewRunId=${row.last_run_id}`}>
                    View
                  </Link>
                ) : "View"}
                <span className="ml-2 text-slate-400">Retry/Replays use existing queue API.</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewRunsTable({ rows }: { rows: LearningReviewRunOpsRow[] }) {
  if (rows.length === 0) return emptyState("No review runs match the current filters.");
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-3">Run ID</th>
            <th className="p-3">Organization</th>
            <th className="p-3">Container</th>
            <th className="p-3">Month</th>
            <th className="p-3">Status</th>
            <th className="p-3">Records</th>
            <th className="p-3">Memory Pack</th>
            <th className="p-3">Tokens</th>
            <th className="p-3">Prompt / Response</th>
            <th className="p-3">Started / Completed</th>
            <th className="p-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-3 font-mono text-xs">{shortId(row.id)}</td>
              <td className="p-3 font-mono text-xs">{shortId(row.organization_id)}</td>
              <td className="p-3">{row.container_type}</td>
              <td className="p-3">{row.review_month}</td>
              <td className="p-3"><Badge className={statusTone(row.run_status)}>{row.run_status}</Badge></td>
              <td className="p-3">{formatNumber(row.selected_record_count)}</td>
              <td className="p-3">{formatNumber(row.memory_pack_count)}</td>
              <td className="p-3">{formatNumber(row.total_token_count)}</td>
              <td className="p-3 font-mono text-xs">{shortId(row.prompt_hash)} / {shortId(row.response_hash)}</td>
              <td className="p-3 text-xs">{formatDateTime(row.started_at)} / {formatDateTime(row.completed_at)}</td>
              <td className="p-3">
                <Link className="text-sm font-semibold text-slate-950 underline" href={`/app/internal/universal-learning?reviewRunId=${row.id}`}>
                  Open Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionResultsTable({ rows }: { rows: LearningReviewActionResultOpsRow[] }) {
  if (rows.length === 0) return emptyState("No memory action results match the current filters.");
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-3">Learning</th>
            <th className="p-3">Action</th>
            <th className="p-3">Target</th>
            <th className="p-3">Created</th>
            <th className="p-3">Updated</th>
            <th className="p-3">Status</th>
            <th className="p-3">Confidence</th>
            <th className="p-3">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-3 font-mono text-xs">{row.learning_id}</td>
              <td className="p-3">{row.action_type}</td>
              <td className="p-3 font-mono text-xs">{memoryLink(row.target_memory_id)}</td>
              <td className="p-3 font-mono text-xs">{memoryLink(row.created_memory_id)}</td>
              <td className="p-3 font-mono text-xs">{memoryLink(row.updated_memory_id)}</td>
              <td className="p-3"><Badge className={statusTone(row.result_status)}>{row.result_status}</Badge></td>
              <td className="p-3">{row.confidence_adjustment ?? "—"}</td>
              <td className="max-w-md p-3 text-xs text-slate-600">{row.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function memoryLink(memoryId: string | null) {
  if (!memoryId) return "—";
  return (
    <Link className="font-semibold text-slate-950 underline" href={`/app/company/memory-inspection?memoryId=${memoryId}`}>
      {shortId(memoryId)}
    </Link>
  );
}

function SourceRecordsTable({ rows }: { rows: LearningReviewRunRecordOpsRow[] }) {
  if (rows.length === 0) return emptyState("No source records were recorded for this review.");
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-3">Source Table</th>
            <th className="p-3">Source ID</th>
            <th className="p-3">Updated At</th>
            <th className="p-3">Strength</th>
            <th className="p-3">Record Hash</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-3">{row.source_table}</td>
              <td className="p-3 font-mono text-xs">{row.source_id}</td>
              <td className="p-3">{formatDateTime(row.source_updated_at)}</td>
              <td className="p-3">{row.record_strength}</td>
              <td className="p-3 font-mono text-xs">{shortId(row.record_hash)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProvenanceTable({ links }: { links: OrganizationMemoryLinkOpsRow[] }) {
  if (links.length === 0) return emptyState("No provenance links match the current filters.");
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-3">Memory</th>
            <th className="p-3">Source Type</th>
            <th className="p-3">Source ID</th>
            <th className="p-3">Link Type</th>
            <th className="p-3">Weight</th>
            <th className="p-3">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {links.map((link) => (
            <tr key={link.id}>
              <td className="p-3 font-mono text-xs">{memoryLink(link.organization_memory_item_id)}</td>
              <td className="p-3">{link.source_entity_type ?? sourceFallbackType(link)}</td>
              <td className="p-3 font-mono text-xs">{link.source_entity_id ?? link.source_event_id ?? link.source_ai_interaction_id ?? link.source_correction_event_id ?? link.source_validation_case_id ?? "—"}</td>
              <td className="p-3">{link.link_type}</td>
              <td className="p-3">{link.weight}</td>
              <td className="p-3">{formatDateTime(link.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sourceFallbackType(link: OrganizationMemoryLinkOpsRow) {
  if (link.source_event_id) return "event";
  if (link.source_ai_interaction_id) return "ai_interaction";
  if (link.source_correction_event_id) return "correction_event";
  if (link.source_validation_case_id) return "validation_case";
  return "—";
}

function CostSummaryTable({ rows }: { rows: CostSummaryRow[] }) {
  if (rows.length === 0) return emptyState("No token usage is available for the current filters.");
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-3">Organization</th>
            <th className="p-3">Month</th>
            <th className="p-3">Container</th>
            <th className="p-3">Completed</th>
            <th className="p-3">Failed</th>
            <th className="p-3">Input</th>
            <th className="p-3">Output</th>
            <th className="p-3">Total</th>
            <th className="p-3">Avg</th>
            <th className="p-3">Estimated Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={`${row.organizationId}:${row.reviewMonth}:${row.containerType}`}>
              <td className="p-3 font-mono text-xs">{shortId(row.organizationId)}</td>
              <td className="p-3">{row.reviewMonth}</td>
              <td className="p-3">{row.containerType}</td>
              <td className="p-3">{formatNumber(row.completedReviews)}</td>
              <td className="p-3">{formatNumber(row.failedReviews)}</td>
              <td className="p-3">{formatNumber(row.inputTokens)}</td>
              <td className="p-3">{formatNumber(row.outputTokens)}</td>
              <td className="p-3">{formatNumber(row.totalTokens)}</td>
              <td className="p-3">{formatNumber(row.averageTokens)}</td>
              <td className="p-3">{formatMoney(row.estimatedCostUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewDetailPanel({ detail }: { detail: ReviewRunDetail | null }) {
  if (!detail) return null;
  if (!detail.run) return (
    <OperationalPanel title="Review Details" description="The selected review run was not found.">
      {emptyState("No review run found for the supplied id.")}
    </OperationalPanel>
  );

  const run = detail.run;
  return (
    <OperationalPanel
      title="Review Details"
      description="Admin-only review metadata. Raw prompts are intentionally not displayed by default."
    >
      <div className="grid gap-3 md:grid-cols-4">
        {card("Run status", run.run_status, `${run.container_type} · ${run.review_month}`)}
        {card("Selected records", formatNumber(run.selected_record_count), `Memory pack: ${formatNumber(run.memory_pack_count)}`)}
        {card("Tokens", formatNumber(run.total_token_count), `${formatNumber(run.input_token_count)} in / ${formatNumber(run.output_token_count)} out`)}
        {card("Duration", run.duration_ms ? `${formatNumber(run.duration_ms)} ms` : "—", `${formatDateTime(run.started_at)} → ${formatDateTime(run.completed_at)}`)}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4 text-sm">
          <h3 className="font-semibold text-slate-950">Cursor Before / After</h3>
          <p className="mt-2 text-slate-600">Before: {run.previous_cursor_updated_at ?? "null"} / {run.previous_cursor_id ?? "null"}</p>
          <p className="text-slate-600">Candidate: {run.candidate_next_cursor_updated_at ?? "null"} / {run.candidate_next_cursor_id ?? "null"}</p>
          <p className="text-slate-600">Final: {run.final_next_cursor_updated_at ?? "null"} / {run.final_next_cursor_id ?? "null"}</p>
          <p className="text-slate-600">Current cursor row: {detail.cursor?.last_cursor_updated_at ?? "—"} / {detail.cursor?.last_cursor_id ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 text-sm">
          <h3 className="font-semibold text-slate-950">Model + Hashes</h3>
          <p className="mt-2 text-slate-600">Model: {run.model_provider ?? "—"} / {run.model_name ?? "—"}</p>
          <p className="text-slate-600">Prompt hash: <span className="font-mono">{run.prompt_hash ?? "—"}</span></p>
          <p className="text-slate-600">Response hash: <span className="font-mono">{run.response_hash ?? "—"}</span></p>
        </div>
      </div>
      <div className="mt-6 space-y-6">
        <section>
          <h3 className="mb-2 text-base font-semibold text-slate-950">Memory Actions</h3>
          <ActionResultsTable rows={detail.actionResults} />
        </section>
        <section>
          <h3 className="mb-2 text-base font-semibold text-slate-950">Source Records</h3>
          <SourceRecordsTable rows={detail.sourceRecords} />
        </section>
        <section>
          <h3 className="mb-2 text-base font-semibold text-slate-950">Why does TradesStack believe this?</h3>
          <ProvenanceTable links={detail.provenance.links} />
        </section>
      </div>
    </OperationalPanel>
  );
}

function OperationsDashboard({
  data,
  errorMessage,
}: {
  data: UniversalLearningOperationsDashboardData | null;
  errorMessage: string | null;
}) {
  return (
    <section className="space-y-6 bg-slate-50 p-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-8 text-white shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Company / AI / Universal Learning Operations</p>
        <h1 className="mt-3 text-3xl font-semibold">Universal Construction Learning Operations</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
          Internal production visibility for monthly construction learning reviews: queue state, review runs,
          memory actions, provenance, token usage, dead letters, and linkless memory health. This page does not expose raw prompts.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {data ? <Filters data={data} /> : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {card("Queue waiting", formatNumber(data.queueHealth.pending), `${formatNumber(data.queueHealth.claimed)} claimed · ${formatNumber(data.queueHealth.retryScheduled)} retry`)}
            {card("Reviews completed", formatNumber(data.reviewRunMetrics.completed), `${formatNumber(data.reviewRunMetrics.failed)} failed · ${formatNumber(data.reviewRunMetrics.running)} running`)}
            {card("Tokens observed", formatNumber(data.reviewRunMetrics.totalTokens), `${formatNumber(data.reviewRunMetrics.selectedRecords)} selected records`)}
            {card("Linkless memories", formatNumber(data.memoryHealth.linklessMemories), `${formatNumber(data.memoryHealth.memoriesWithProvenance)} with provenance`)}
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {card("Pending", formatNumber(data.queueHealth.pending), "Waiting for worker claim")}
            {card("Claimed", formatNumber(data.queueHealth.claimed), "Currently leased or recovering")}
            {card("Retry scheduled", formatNumber(data.queueHealth.retryScheduled), "Transient failure recovery")}
            {card("Completed", formatNumber(data.queueHealth.completed), "Finished queue rows")}
            {card("Dead lettered", formatNumber(data.queueHealth.deadLettered), "Needs operator inspection")}
          </div>

          <OperationalPanel
            title={<span className="inline-flex items-center gap-2"><Clock className="h-5 w-5" /> Queue Health</span>}
            description="Monthly review queue rows. Retry/replay/dead-letter mutation continues through the existing queue API."
          >
            <QueueRowsTable rows={data.queueRows} />
          </OperationalPanel>

          <OperationalPanel
            title={<span className="inline-flex items-center gap-2"><BrainCircuit className="h-5 w-5" /> Review Runs</span>}
            description="Review metadata from learning_review_runs, including prompt/response hashes and token usage."
          >
            <ReviewRunsTable rows={data.reviewRuns} />
          </OperationalPanel>

          <ReviewDetailPanel detail={data.reviewDetail} />

          <OperationalPanel
            title={<span className="inline-flex items-center gap-2"><DatabaseZap className="h-5 w-5" /> Memory Actions</span>}
            description="Create, reinforce, update, retire, and no_action decisions written to learning_review_action_results."
          >
            <ActionResultsTable rows={data.actionResults} />
          </OperationalPanel>

          <OperationalPanel
            title={<span className="inline-flex items-center gap-2"><GitBranch className="h-5 w-5" /> Memory Provenance</span>}
            description="Admin explainability graph: memory to review/source records via organization_memory_links."
          >
            <ProvenanceTable links={data.provenance.links} />
          </OperationalPanel>

          <OperationalPanel
            title={<span className="inline-flex items-center gap-2"><DollarSign className="h-5 w-5" /> Costs & Usage</span>}
            description="Observation-only token and rough cost estimates grouped by organization, month, and container."
          >
            <CostSummaryTable rows={data.costSummary} />
          </OperationalPanel>

          <OperationalPanel
            title={<span className="inline-flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Dead Letters</span>}
            description="Rows that exhausted retry or hit deterministic failure. Inspect before replaying."
          >
            <QueueRowsTable rows={data.deadLetters} />
          </OperationalPanel>

          <OperationalPanel
            title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Universal Learning Health</span>}
            description="Organization memory provenance health. Existing linkless memories remain visible; new UCL linkless memories should be zero."
          >
            <div className="grid gap-4 md:grid-cols-5">
              {card("Total memories", formatNumber(data.memoryHealth.totalMemories), "Sampled for operations health")}
              {card("With provenance", formatNumber(data.memoryHealth.memoriesWithProvenance), "At least one organization_memory_links row")}
              {card("Linkless", formatNumber(data.memoryHealth.linklessMemories), "Should not increase after UCL runs")}
              {card("Retired", formatNumber(data.memoryHealth.retiredMemories), "Inactive or retired memories")}
              {card("Contradicted", formatNumber(data.memoryHealth.contradictedMemories), "Contradiction lifecycle signal")}
            </div>
            {data.memoryHealth.sampledLinklessMemoryIds.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Known linkless memory sample</p>
                <p className="mt-1 font-mono text-xs">{data.memoryHealth.sampledLinklessMemoryIds.join(", ")}</p>
              </div>
            ) : null}
          </OperationalPanel>
        </>
      ) : null}
    </section>
  );
}

export default async function UniversalLearningOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin("admin", DEFAULT_FALLBACK);

  const resolvedSearchParams = (await searchParams) ?? {};
  const filters = parseUniversalLearningOperationsFilters(resolvedSearchParams);
  let data: UniversalLearningOperationsDashboardData | null = null;
  let errorMessage: string | null = null;

  try {
    data = await getUniversalLearningOperationsDashboardData(filters);
  } catch (error) {
    errorMessage = error instanceof Error
      ? `Unable to load Universal Learning operations. ${error.message}`
      : "Unable to load Universal Learning operations.";
  }

  return <OperationsDashboard data={data} errorMessage={errorMessage} />;
}
