import { BarChart3, Bot, Gauge, Layers3, ShieldAlert, Wrench } from "lucide-react";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import type {
  AiDailyRow,
  CorrectionDailyRow,
  CostItemDailyRow,
  DailyOverviewRow,
  IntelligenceOpsDashboardData,
  IntelligenceOpsFilters,
  PricingWorksheetDailyRow,
  SupplierInvoiceDailyRow,
  TakeoffDailyRow,
  ValidationDailyRow,
} from "@/lib/intelligence-ops-server";
import styles from "./IntelligenceOperationsDashboard.module.css";

type DashboardProps = {
  data: IntelligenceOpsDashboardData | null;
  filters: IntelligenceOpsFilters;
  availableModules: string[];
  errorMessage?: string | null;
};

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NZ").format(value ?? 0);
}

function formatDecimal(value: number | null | undefined, maximumFractionDigits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-NZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function sumRows<T>(rows: T[], getter: (row: T) => number) {
  return rows.reduce((total, row) => total + getter(row), 0);
}

function buildOverviewCards(rows: DailyOverviewRow[]) {
  const totalEvents = sumRows(rows, (row) => row.intelligence_event_count);
  const totalCorrections = sumRows(rows, (row) => row.correction_event_count);
  const totalAi = sumRows(rows, (row) => row.ai_interaction_count);
  const totalValidation = sumRows(rows, (row) => row.validation_case_count);
  const activeModules = new Set(rows.map((row) => row.module)).size;

  return [
    {
      label: "Intelligence events",
      value: formatNumber(totalEvents),
      meta: "Captured from live modules in the selected range.",
    },
    {
      label: "Correction events",
      value: formatNumber(totalCorrections),
      meta: "High-signal human overrides and edits.",
    },
    {
      label: "AI interactions",
      value: formatNumber(totalAi),
      meta: "Accepted, rejected, edited, and reviewed outputs.",
    },
    {
      label: "Validation cases",
      value: formatNumber(totalValidation),
      meta: "Rules, gates, warnings, and overrides.",
    },
    {
      label: "Active modules",
      value: formatNumber(activeModules),
      meta: "Modules currently reporting observability activity.",
    },
  ];
}

function buildAiSummary(rows: AiDailyRow[]) {
  const interactions = sumRows(rows, (row) => row.interaction_count);
  const accepted = sumRows(rows, (row) => row.accepted_count);
  const rejected = sumRows(rows, (row) => row.rejected_count);
  const edited = sumRows(rows, (row) => row.edited_count);
  const corrected = sumRows(rows, (row) => row.corrected_interaction_count);
  const weightedConfidenceTotal = rows.reduce(
    (total, row) => total + (row.avg_confidence ?? 0) * row.interaction_count,
    0
  );

  return {
    interactions,
    accepted,
    rejected,
    edited,
    corrected,
    avgConfidence: interactions > 0 ? weightedConfidenceTotal / interactions : null,
  };
}

function topCorrectionHotspots(corrections: CorrectionDailyRow[], costItems: CostItemDailyRow[]) {
  const correctionRows = [...corrections]
    .sort((left, right) => right.correction_count - left.correction_count)
    .slice(0, 8);

  const costRows = [...costItems]
    .filter((row) =>
      row.event_type === "cost_item_classification_corrected" ||
      row.event_type === "cost_code_mapping_overridden"
    )
    .sort((left, right) => right.event_count - left.event_count)
    .slice(0, 8);

  return { correctionRows, costRows };
}

function buildSupplierInvoiceSummary(rows: SupplierInvoiceDailyRow[]) {
  return {
    confirmed: sumRows(rows, (row) => row.match_confirmed_count),
    rejected: sumRows(rows, (row) => row.match_rejected_count),
    approvals: sumRows(rows, (row) => row.allocation_approved_count),
    corrections: sumRows(rows, (row) => row.allocation_corrected_count),
    posted: sumRows(rows, (row) => row.actual_cost_posted_count),
    reversed: sumRows(rows, (row) => row.actual_cost_reversed_count),
  };
}

function buildTakeoffSummary(rows: TakeoffDailyRow[]) {
  return {
    created: sumRows(rows, (row) => row.measurement_created_count),
    corrected: sumRows(rows, (row) => row.measurement_corrected_count),
    deleted: sumRows(rows, (row) => row.measurement_deleted_count),
    restored: sumRows(rows, (row) => row.measurement_restored_count),
    calibrationCorrected: sumRows(rows, (row) => row.calibration_corrected_count),
  };
}

function topTakeoffKinds(rows: TakeoffDailyRow[]) {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const key = row.measurement_kind || "unclassified";
    grouped.set(key, (grouped.get(key) ?? 0) + row.measurement_corrected_count);
  });
  return [...grouped.entries()]
    .map(([measurementKind, correctionCount]) => ({ measurementKind, correctionCount }))
    .sort((left, right) => right.correctionCount - left.correctionCount)
    .slice(0, 6);
}

function buildWorksheetSummary(rows: PricingWorksheetDailyRow[]) {
  const totalSaves = sumRows(rows, (row) => row.worksheet_saved_count);
  const totalDuplicates = sumRows(rows, (row) => row.worksheet_duplicated_count);
  const totalArchives = sumRows(rows, (row) => row.worksheet_archived_count);
  const weightedFormulaTotal = rows.reduce(
    (total, row) => total + (row.avg_formula_count_on_save ?? 0) * row.worksheet_saved_count,
    0
  );
  return {
    totalSaves,
    totalDuplicates,
    totalArchives,
    avgFormulaCount: totalSaves > 0 ? weightedFormulaTotal / totalSaves : null,
  };
}

function topWorksheetNames(rows: PricingWorksheetDailyRow[]) {
  const grouped = new Map<string, { saves: number; duplicates: number; avgFormulaTotal: number }>();
  rows.forEach((row) => {
    const current = grouped.get(row.worksheet_name) ?? { saves: 0, duplicates: 0, avgFormulaTotal: 0 };
    current.saves += row.worksheet_saved_count;
    current.duplicates += row.worksheet_duplicated_count;
    current.avgFormulaTotal += (row.avg_formula_count_on_save ?? 0) * row.worksheet_saved_count;
    grouped.set(row.worksheet_name, current);
  });

  return [...grouped.entries()]
    .map(([worksheetName, value]) => ({
      worksheetName,
      saves: value.saves,
      duplicates: value.duplicates,
      avgFormulaCount: value.saves > 0 ? value.avgFormulaTotal / value.saves : null,
    }))
    .sort((left, right) => right.saves - left.saves)
    .slice(0, 8);
}

function buildValidationSummary(rows: ValidationDailyRow[]) {
  return {
    failed: sumRows(rows, (row) => row.failed_count),
    warnings: sumRows(rows, (row) => row.warning_count),
    overridden: sumRows(rows, (row) => row.overridden_count),
    pendingApprovals: sumRows(rows, (row) => row.approval_pending_count),
  };
}

function emptyState(message: string) {
  return <div className={styles.emptyState}>{message}</div>;
}

export function IntelligenceOperationsDashboard({
  data,
  filters,
  availableModules,
  errorMessage,
}: DashboardProps) {
  const overviewCards = buildOverviewCards(data?.overview ?? []);
  const aiSummary = buildAiSummary(data?.aiDaily ?? []);
  const correctionHotspots = topCorrectionHotspots(data?.corrections ?? [], data?.costItems ?? []);
  const supplierSummary = buildSupplierInvoiceSummary(data?.supplierInvoices ?? []);
  const takeoffSummary = buildTakeoffSummary(data?.takeoff ?? []);
  const worksheetSummary = buildWorksheetSummary(data?.pricingWorksheets ?? []);
  const validationSummary = buildValidationSummary(data?.validations ?? []);
  const latestActivity = data?.overview[0]?.activity_date ?? null;

  return (
    <section className={styles.scope}>
      <div className={styles.hero}>
        <div>
          <p className={styles.heroEyebrow}>Internal Intelligence Operations</p>
          <h1 className={styles.heroTitle}>TradesStack Intelligence</h1>
          <p className={styles.heroSummary}>
            Internal observability for live intelligence capture across pricing worksheets, cost review, supplier invoices,
            and takeoff. This page reads aggregated observability views only and stays organization-scoped.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.heroPill}>
            <Layers3 className="h-4 w-4" />
            Range: {filters.range}
          </span>
          <span className={styles.heroPill}>
            <Gauge className="h-4 w-4" />
            Module: {filters.module ?? "all"}
          </span>
          <span className={styles.heroPill}>
            <BarChart3 className="h-4 w-4" />
            Latest activity: {formatDateLabel(latestActivity)}
          </span>
        </div>
      </div>

      <OperationalPanel
        title="Filters"
        description="Internal-only filters for observability aggregates. The module filter narrows shared views and shows only relevant module sections."
        contentClassName="pt-6"
      >
        <form className={styles.toolbar} method="get">
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Date range</span>
            <select className={styles.filterControl} name="range" defaultValue={filters.range}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>

          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Module</span>
            <select className={styles.filterControl} name="module" defaultValue={filters.module ?? ""}>
              <option value="">All reporting modules</option>
              {availableModules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.filterActions}>
            <button type="submit" className={styles.primaryButton}>
              Apply filters
            </button>
            <a className={styles.secondaryButton} href="/app/internal/intelligence">
              Reset
            </a>
          </div>
        </form>
      </OperationalPanel>

      {errorMessage ? <div className={styles.errorState}>{errorMessage}</div> : null}

      <section className={styles.cardGrid}>
        {overviewCards.map((card) => (
          <article key={card.label} className={styles.overviewCard}>
            <p className={styles.overviewLabel}>{card.label}</p>
            <p className={styles.overviewValue}>{card.value}</p>
            <p className={styles.overviewMeta}>{card.meta}</p>
          </article>
        ))}
      </section>

      <OperationalPanel
        title="Module Activity"
        description="Daily rollup from intelligence_observability_daily_overview."
      >
        {data && data.overview.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Activity date</th>
                  <th>Module</th>
                  <th>Intelligence events</th>
                  <th>Corrections</th>
                  <th>AI interactions</th>
                  <th>Validation cases</th>
                </tr>
              </thead>
              <tbody>
                {data.overview.slice(0, 24).map((row) => (
                  <tr key={`${row.activity_date}-${row.module}`}>
                    <td>{formatDateLabel(row.activity_date)}</td>
                    <td>{row.module}</td>
                    <td>{formatNumber(row.intelligence_event_count)}</td>
                    <td>{formatNumber(row.correction_event_count)}</td>
                    <td>{formatNumber(row.ai_interaction_count)}</td>
                    <td>{formatNumber(row.validation_case_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          emptyState("No module activity has been recorded for the selected filters yet.")
        )}
      </OperationalPanel>

      <div className={styles.splitGrid}>
        <OperationalPanel title="AI Performance" description="Disposition, confidence, and correction analytics from the AI observability views.">
          {data && data.aiDaily.length > 0 ? (
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Accepted outputs</span>
                <span className={styles.metricValueInline}>{formatNumber(aiSummary.accepted)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Rejected outputs</span>
                <span className={styles.metricValueInline}>{formatNumber(aiSummary.rejected)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Edited outputs</span>
                <span className={styles.metricValueInline}>{formatNumber(aiSummary.edited)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Average confidence</span>
                <span className={styles.metricValueInline}>{formatDecimal(aiSummary.avgConfidence, 3)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Corrected AI outputs</span>
                <span className={styles.metricValueInline}>{formatNumber(aiSummary.corrected)}</span>
              </div>
            </div>
          ) : (
            emptyState("No AI interaction aggregates are available for the selected filters.")
          )}
        </OperationalPanel>

        <OperationalPanel title="Confidence Bands" description="Confidence versus correction outcomes from intelligence_observability_ai_confidence_daily.">
          {data && data.aiConfidence.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Band</th>
                    <th>Interactions</th>
                    <th>Accepted</th>
                    <th>Edited</th>
                    <th>Correction rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aiConfidence.slice(0, 8).map((row) => (
                    <tr key={`${row.event_date}-${row.module}-${row.confidence_band}`}>
                      <td>{row.confidence_band}</td>
                      <td>{formatNumber(row.interaction_count)}</td>
                      <td>{formatNumber(row.accepted_count)}</td>
                      <td>{formatNumber(row.edited_count)}</td>
                      <td>{formatPercent(row.correction_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            emptyState("Confidence band analytics will appear once AI interactions with confidence data are recorded.")
          )}
        </OperationalPanel>
      </div>

      <div className={styles.splitGrid}>
        <OperationalPanel title="Correction Hotspots" description="Top correction pressure across correction events and cost item review intelligence.">
          {data && (correctionHotspots.correctionRows.length > 0 || correctionHotspots.costRows.length > 0) ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Correction type</th>
                    <th>Field</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {correctionHotspots.correctionRows.map((row) => (
                    <tr key={`${row.event_date}-${row.module}-${row.correction_type}-${row.corrected_field_name ?? "none"}`}>
                      <td>{row.module}</td>
                      <td>{row.feedback_label ?? row.correction_type}</td>
                      <td>{row.corrected_field_name ?? "General"}</td>
                      <td>{formatNumber(row.correction_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            emptyState("No correction hotspots are available for the current filters.")
          )}
        </OperationalPanel>

        <OperationalPanel title="Financial Routing Hotspots" description="Current Cost Item routing and review outcomes by route and source.">
          {data && correctionHotspots.costRows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Route</th>
                    <th>Routing source</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {correctionHotspots.costRows.map((row) => (
                    <tr key={`${row.event_date}-${row.event_type}-${row.tradesstack_cost_code ?? "none"}-${row.financial_routing_source ?? "none"}`}>
                      <td>{row.event_type}</td>
                      <td>{row.tradesstack_cost_code_label ? `${row.tradesstack_cost_code} ${row.tradesstack_cost_code_label}` : row.tradesstack_cost_code ?? "—"}</td>
                      <td>{row.financial_routing_source ?? "—"}</td>
                      <td>{formatNumber(row.event_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            emptyState("No cost review correction rows are available for the current filters.")
          )}
        </OperationalPanel>
      </div>

      <OperationalPanel title="Supplier Invoice Intelligence" description="Matching, allocation, approval, and actual-cost lineage health.">
        {data && data.supplierInvoices.length > 0 ? (
          <>
            <div className={styles.tagList}>
              <span className={`${styles.tag} ${styles.tagSage}`}>Matches confirmed: {formatNumber(supplierSummary.confirmed)}</span>
              <span className={`${styles.tag} ${styles.tagAccent}`}>Matches rejected: {formatNumber(supplierSummary.rejected)}</span>
              <span className={`${styles.tag} ${styles.tagGold}`}>Allocations approved: {formatNumber(supplierSummary.approvals)}</span>
              <span className={`${styles.tag} ${styles.tagAccent}`}>Actual cost reversals: {formatNumber(supplierSummary.reversed)}</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Match confirmed</th>
                    <th>Match rejected</th>
                    <th>Acceptance rate</th>
                    <th>Allocation approvals</th>
                    <th>Allocation corrections</th>
                    <th>Actual cost reversals</th>
                  </tr>
                </thead>
                <tbody>
                  {data.supplierInvoices.slice(0, 18).map((row) => (
                    <tr key={`${row.event_date}-${row.project_id ?? "org"}`}>
                      <td>{formatDateLabel(row.event_date)}</td>
                      <td>{formatNumber(row.match_confirmed_count)}</td>
                      <td>{formatNumber(row.match_rejected_count)}</td>
                      <td>{formatPercent(row.match_acceptance_rate)}</td>
                      <td>{formatNumber(row.allocation_approved_count)}</td>
                      <td>{formatNumber(row.allocation_corrected_count)}</td>
                      <td>{formatNumber(row.actual_cost_reversed_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          emptyState("No supplier invoice intelligence aggregates are available for the selected filters.")
        )}
      </OperationalPanel>

      <div className={styles.splitGrid}>
        <OperationalPanel title="Takeoff Intelligence" description="Measurement lifecycle and calibration correction pressure.">
          {data && data.takeoff.length > 0 ? (
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Measurements created</span>
                <span className={styles.metricValueInline}>{formatNumber(takeoffSummary.created)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Measurements corrected</span>
                <span className={styles.metricValueInline}>{formatNumber(takeoffSummary.corrected)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Measurements deleted</span>
                <span className={styles.metricValueInline}>{formatNumber(takeoffSummary.deleted)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Measurements restored</span>
                <span className={styles.metricValueInline}>{formatNumber(takeoffSummary.restored)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Calibration corrections</span>
                <span className={styles.metricValueInline}>{formatNumber(takeoffSummary.calibrationCorrected)}</span>
              </div>
            </div>
          ) : (
            emptyState("No takeoff observability data is available for the selected filters.")
          )}
        </OperationalPanel>

        <OperationalPanel title="Most Corrected Measurement Kinds" description="Useful for spotting takeoff training and UX pressure points.">
          {data && topTakeoffKinds(data.takeoff).length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Measurement kind</th>
                    <th>Correction count</th>
                  </tr>
                </thead>
                <tbody>
                  {topTakeoffKinds(data.takeoff).map((row) => (
                    <tr key={row.measurementKind}>
                      <td>{row.measurementKind}</td>
                      <td>{formatNumber(row.correctionCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            emptyState("No corrected measurement kinds are available yet.")
          )}
        </OperationalPanel>
      </div>

      <div className={styles.splitGrid}>
        <OperationalPanel title="Pricing Worksheet Intelligence" description="Save/duplicate/archive behavior and structure complexity.">
          {data && data.pricingWorksheets.length > 0 ? (
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Worksheet saves</span>
                <span className={styles.metricValueInline}>{formatNumber(worksheetSummary.totalSaves)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Worksheet duplicates</span>
                <span className={styles.metricValueInline}>{formatNumber(worksheetSummary.totalDuplicates)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Worksheet archives</span>
                <span className={styles.metricValueInline}>{formatNumber(worksheetSummary.totalArchives)}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricKey}>Average formula count</span>
                <span className={styles.metricValueInline}>{formatDecimal(worksheetSummary.avgFormulaCount, 1)}</span>
              </div>
            </div>
          ) : (
            emptyState("No pricing worksheet aggregates are available for the selected filters.")
          )}
        </OperationalPanel>

        <OperationalPanel title="Common Worksheet Names" description="Helps identify repeated estimating structures and naming patterns.">
          {data && topWorksheetNames(data.pricingWorksheets).length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Worksheet</th>
                    <th>Saves</th>
                    <th>Duplicates</th>
                    <th>Avg formulas</th>
                  </tr>
                </thead>
                <tbody>
                  {topWorksheetNames(data.pricingWorksheets).map((row) => (
                    <tr key={row.worksheetName}>
                      <td>{row.worksheetName}</td>
                      <td>{formatNumber(row.saves)}</td>
                      <td>{formatNumber(row.duplicates)}</td>
                      <td>{formatDecimal(row.avgFormulaCount, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            emptyState("No worksheet naming trends are available yet.")
          )}
        </OperationalPanel>
      </div>

      <div className={styles.splitGrid}>
        <OperationalPanel title="Validation Signals" description="Failure counts, override pressure, and approval bottlenecks from validation observability.">
          {data && data.validations.length > 0 ? (
            <>
              <div className={styles.tagList}>
                <span className={`${styles.tag} ${styles.tagAccent}`}>
                  <ShieldAlert className="h-4 w-4" />
                  Failed: {formatNumber(validationSummary.failed)}
                </span>
                <span className={`${styles.tag} ${styles.tagGold}`}>Warnings: {formatNumber(validationSummary.warnings)}</span>
                <span className={`${styles.tag} ${styles.tagSage}`}>Overrides: {formatNumber(validationSummary.overridden)}</span>
                <span className={`${styles.tag} ${styles.tagAccent}`}>Approval pending: {formatNumber(validationSummary.pendingApprovals)}</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Rule</th>
                      <th>Failed</th>
                      <th>Warnings</th>
                      <th>Overrides</th>
                      <th>Override rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.validations.slice(0, 14).map((row) => (
                      <tr key={`${row.event_date}-${row.module}-${row.rule_key}`}>
                        <td>{row.module}</td>
                        <td>{row.rule_key}</td>
                        <td>{formatNumber(row.failed_count)}</td>
                        <td>{formatNumber(row.warning_count)}</td>
                        <td>{formatNumber(row.overridden_count)}</td>
                        <td>{formatPercent(row.override_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            emptyState("No validation analytics are available for the selected filters.")
          )}
        </OperationalPanel>

        <OperationalPanel title="Cost Review Backlog" description="Live unresolved review backlog from current cost items that still need attention.">
          {data && data.costItemBacklog.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Source document</th>
                    <th>Route</th>
                    <th>Review state</th>
                    <th>Unresolved</th>
                    <th>Avg confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {data.costItemBacklog.slice(0, 12).map((row) => (
                    <tr key={`${row.project_id}-${row.source_document_kind}-${row.tradesstack_cost_code ?? "none"}-${row.review_status}`}>
                      <td>{row.source_document_kind}</td>
                      <td>{row.tradesstack_cost_code_label ? `${row.tradesstack_cost_code} ${row.tradesstack_cost_code_label}` : row.tradesstack_cost_code ?? "—"}</td>
                      <td>{row.review_status}</td>
                      <td>{formatNumber(row.unresolved_review_count)}</td>
                      <td>{formatDecimal(row.avg_routing_confidence, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            emptyState("No unresolved cost item review backlog is currently visible.")
          )}
        </OperationalPanel>
      </div>

      <OperationalPanel title="Notes" description="Operational constraints for this internal view.">
        <div className={styles.tagList}>
          <span className={`${styles.tag} ${styles.tagGold}`}>
            <Bot className="h-4 w-4" />
            Aggregated observability only
          </span>
          <span className={`${styles.tag} ${styles.tagSage}`}>
            <Wrench className="h-4 w-4" />
            No raw before/after event payloads shown
          </span>
          <span className={`${styles.tag} ${styles.tagAccent}`}>
            <ShieldAlert className="h-4 w-4" />
            Organization-scoped visibility preserved
          </span>
        </div>
      </OperationalPanel>
    </section>
  );
}
