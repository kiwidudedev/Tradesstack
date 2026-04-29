export interface DashboardAggregateProject {
  projectId: string;
  projectName: string;
  stage: string;
  location: string;
  createdAt: string;
  clientName: string;
}

export interface DashboardAggregateMetrics {
  overdueTasks: number;
  awaitingVariationApproval: number;
  claimReadyToSend: number;
  openIssues: number;
  failedInspections: number;
  tasksDueToday: number;
  pendingVariations: number;
  claimsThisMonth: number;
  activeWorkers: number;
  pendingSignoffs: number;
  inspectionsToday: number;
}

export interface DashboardAggregateFinancials {
  quoteValue: number;
  variationTotal: number;
  claimsSubmitted: number;
  claimsPaidAmount: number;
  claimsUnpaidAmount: number;
  poOutstandingCount: number;
  poOutstandingAmount: number;
}

export interface DashboardAggregateFeedItem {
  id: string;
  title?: string;
  variation_number?: string;
  claim_number?: string;
  message?: string;
  event_type?: string;
  status?: string;
  updated_at?: string;
  created_at?: string;
}

export interface DashboardAggregateFeeds {
  tasks: DashboardAggregateFeedItem[];
  issues: DashboardAggregateFeedItem[];
  variations: DashboardAggregateFeedItem[];
  claims: DashboardAggregateFeedItem[];
  time_events: DashboardAggregateFeedItem[];
  signoffs: DashboardAggregateFeedItem[];
}

export interface DashboardAggregateResult {
  project: DashboardAggregateProject;
  metrics: DashboardAggregateMetrics;
  financials: DashboardAggregateFinancials;
  feeds: DashboardAggregateFeeds;
}

export interface DashboardComparisonFeedItem {
  id: string;
  at: string;
}

export interface DashboardComparisonSnapshot {
  project: DashboardAggregateProject;
  metrics: DashboardAggregateMetrics;
  financials: DashboardAggregateFinancials;
  feeds: {
    tasks: DashboardComparisonFeedItem[];
    issues: DashboardComparisonFeedItem[];
    variations: DashboardComparisonFeedItem[];
    claims: DashboardComparisonFeedItem[];
    time_events: DashboardComparisonFeedItem[];
    signoffs: DashboardComparisonFeedItem[];
  };
}

function normalizeComparisonNumber(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function normalizeComparisonMetrics(metrics: DashboardAggregateMetrics) {
  return {
    overdueTasks: normalizeComparisonNumber(metrics.overdueTasks),
    awaitingVariationApproval: normalizeComparisonNumber(metrics.awaitingVariationApproval),
    claimReadyToSend: normalizeComparisonNumber(metrics.claimReadyToSend),
    openIssues: normalizeComparisonNumber(metrics.openIssues),
    failedInspections: normalizeComparisonNumber(metrics.failedInspections),
    tasksDueToday: normalizeComparisonNumber(metrics.tasksDueToday),
    pendingVariations: normalizeComparisonNumber(metrics.pendingVariations),
    claimsThisMonth: normalizeComparisonNumber(metrics.claimsThisMonth),
    activeWorkers: normalizeComparisonNumber(metrics.activeWorkers),
    pendingSignoffs: normalizeComparisonNumber(metrics.pendingSignoffs),
    inspectionsToday: normalizeComparisonNumber(metrics.inspectionsToday),
  };
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumberValue(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function toFeedItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as DashboardAggregateFeedItem[];
  }

  return value.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      id: toStringValue(row.id),
      title: toStringValue(row.title),
      variation_number: toStringValue(row.variation_number),
      claim_number: toStringValue(row.claim_number),
      message: toStringValue(row.message),
      event_type: toStringValue(row.event_type),
      status: toStringValue(row.status),
      updated_at: toStringValue(row.updated_at),
      created_at: toStringValue(row.created_at),
    };
  });
}

export function normalizeDashboardAggregateResult(value: unknown): DashboardAggregateResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const project = row.project && typeof row.project === "object" ? (row.project as Record<string, unknown>) : {};
  const metrics = row.metrics && typeof row.metrics === "object" ? (row.metrics as Record<string, unknown>) : {};
  const financials = row.financials && typeof row.financials === "object" ? (row.financials as Record<string, unknown>) : {};
  const feeds = row.feeds && typeof row.feeds === "object" ? (row.feeds as Record<string, unknown>) : {};

  return {
    project: {
      projectId: toStringValue(project.projectId),
      projectName: toStringValue(project.projectName),
      stage: toStringValue(project.stage),
      location: toStringValue(project.location),
      createdAt: toStringValue(project.createdAt),
      clientName: toStringValue(project.clientName),
    },
    metrics: {
      overdueTasks: toNumberValue(metrics.overdueTasks),
      awaitingVariationApproval: toNumberValue(metrics.awaitingVariationApproval),
      claimReadyToSend: toNumberValue(metrics.claimReadyToSend),
      openIssues: toNumberValue(metrics.openIssues),
      failedInspections: toNumberValue(metrics.failedInspections),
      tasksDueToday: toNumberValue(metrics.tasksDueToday),
      pendingVariations: toNumberValue(metrics.pendingVariations),
      claimsThisMonth: toNumberValue(metrics.claimsThisMonth),
      activeWorkers: toNumberValue(metrics.activeWorkers),
      pendingSignoffs: toNumberValue(metrics.pendingSignoffs),
      inspectionsToday: toNumberValue(metrics.inspectionsToday),
    },
    financials: {
      quoteValue: toNumberValue(financials.quoteValue),
      variationTotal: toNumberValue(financials.variationTotal),
      claimsSubmitted: toNumberValue(financials.claimsSubmitted),
      claimsPaidAmount: toNumberValue(financials.claimsPaidAmount),
      claimsUnpaidAmount: toNumberValue(financials.claimsUnpaidAmount),
      poOutstandingCount: toNumberValue(financials.poOutstandingCount),
      poOutstandingAmount: toNumberValue(financials.poOutstandingAmount),
    },
    feeds: {
      tasks: toFeedItems(feeds.tasks),
      issues: toFeedItems(feeds.issues),
      variations: toFeedItems(feeds.variations),
      claims: toFeedItems(feeds.claims),
      time_events: toFeedItems(feeds.time_events),
      signoffs: toFeedItems(feeds.signoffs),
    },
  };
}

function toComparisonFeedItems(items: DashboardAggregateFeedItem[], timestampKey: "updated_at" | "created_at"): DashboardComparisonFeedItem[] {
  return items.map((item) => ({
    id: item.id,
    at: toStringValue(item[timestampKey]),
  }));
}

export function toDashboardComparisonSnapshot(result: DashboardAggregateResult): DashboardComparisonSnapshot {
  return {
    project: result.project,
    metrics: normalizeComparisonMetrics(result.metrics),
    financials: result.financials,
    feeds: {
      tasks: toComparisonFeedItems(result.feeds.tasks, "updated_at"),
      issues: toComparisonFeedItems(result.feeds.issues, "updated_at"),
      variations: toComparisonFeedItems(result.feeds.variations, "updated_at"),
      claims: toComparisonFeedItems(result.feeds.claims, "updated_at"),
      time_events: toComparisonFeedItems(result.feeds.time_events, "created_at"),
      signoffs: toComparisonFeedItems(result.feeds.signoffs, "updated_at"),
    },
  };
}

export function compareDashboardSnapshots(oldSnapshot: DashboardComparisonSnapshot, nextSnapshot: DashboardComparisonSnapshot) {
  return {
    project: JSON.stringify(oldSnapshot.project) === JSON.stringify(nextSnapshot.project),
    metrics:
      JSON.stringify(normalizeComparisonMetrics(oldSnapshot.metrics)) ===
      JSON.stringify(normalizeComparisonMetrics(nextSnapshot.metrics)),
    financials: JSON.stringify(oldSnapshot.financials) === JSON.stringify(nextSnapshot.financials),
    feeds: {
      tasks: JSON.stringify(oldSnapshot.feeds.tasks) === JSON.stringify(nextSnapshot.feeds.tasks),
      issues: JSON.stringify(oldSnapshot.feeds.issues) === JSON.stringify(nextSnapshot.feeds.issues),
      variations: JSON.stringify(oldSnapshot.feeds.variations) === JSON.stringify(nextSnapshot.feeds.variations),
      claims: JSON.stringify(oldSnapshot.feeds.claims) === JSON.stringify(nextSnapshot.feeds.claims),
      time_events: JSON.stringify(oldSnapshot.feeds.time_events) === JSON.stringify(nextSnapshot.feeds.time_events),
      signoffs: JSON.stringify(oldSnapshot.feeds.signoffs) === JSON.stringify(nextSnapshot.feeds.signoffs),
    },
  };
}
