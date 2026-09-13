import { getUniversalLearningContainerDefinition } from "@/lib/universal-learning/container-catalog";
import {
  normalizeWorksheetData,
  type WorksheetCell,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import {
  createDynamicAdminSupabaseClient,
  type DynamicSupabaseAdminClient,
} from "@/lib/universal-learning/supabase-dynamic-client";
import { buildSupplierBillUclV2Sections } from "@/lib/universal-learning/supplier-bill-builder";
import { buildPaymentClaimUclV2Sections } from "@/lib/universal-learning/payment-claim-builder";
import {
  assertValidSupplierBillUclBusinessRecord,
} from "@/lib/universal-learning/supplier-bill-schema";
import {
  assertValidPaymentClaimUclBusinessRecord,
} from "@/lib/universal-learning/payment-claim-schema";
import { normalizeSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";
import { resolveEffectivePriceRows } from "@/lib/materials/effective-price";
import type { OrganizationMaterialSupplierPriceRow } from "@/lib/materials/types";
import type {
  UniversalLearningBuilderContext,
  UniversalLearningBuilderResult,
  UniversalLearningBusinessRecord,
  UniversalLearningContainerType,
  UniversalLearningCursor,
  UniversalLearningRecordStrength,
} from "@/lib/universal-learning/types";

type JsonRecord = Record<string, unknown>;

type ChildConfig = {
  key: string;
  table: string;
  ownerColumn: string;
  cursorColumn?: string;
  orderColumn?: string;
};

type ContainerBuilderConfig = {
  ownerTable: string;
  ownerCursorColumn?: string;
  projectIdColumn?: string;
  opportunityIdColumn?: string;
  supplierIdColumn?: string;
  clientIdColumn?: string;
  actorUserIdColumn?: string;
  versionColumn?: string;
  statusColumns: string[];
  childCollections?: ChildConfig[];
  cursorTimestampNormalizer?: (value: unknown, sourceField: string) => string | null;
};

type QuoteSourceConfig = {
  sourceTable: "opportunity_quotes" | "project_quotes";
  lineTable: "opportunity_quote_line_items" | "project_quote_line_items";
  ownerOpportunityColumn: "opportunity_id" | "source_opportunity_id";
  ownerProjectColumn?: "project_id";
  actorUserIdColumn: "created_by";
  sourceWorkflow: "monthly_opportunity_quote_review" | "monthly_project_quote_review";
  sourceModule: "opportunity_quotes" | "project_quotes";
  quoteSourceType: "opportunity_quote" | "project_quote";
};

type UnifiedQuoteOwnerRow = JsonRecord & {
  id: string;
  organization_id: string;
  updated_at?: string | null;
  created_at?: string | null;
  project_id?: string | null;
  source_opportunity_id?: string | null;
  __sourceTable: QuoteSourceConfig["sourceTable"];
  __lineTable: QuoteSourceConfig["lineTable"];
  __sourceWorkflow: QuoteSourceConfig["sourceWorkflow"];
  __sourceModule: QuoteSourceConfig["sourceModule"];
  __quoteSourceType: QuoteSourceConfig["quoteSourceType"];
};

type UnifiedQuoteLineRow = JsonRecord & {
  id: string;
  organization_id: string;
  quote_id: string;
};

export type UniversalLearningReviewWindow = {
  start: string;
  end: string;
};

const BUILDER_CONFIGS: Record<UniversalLearningContainerType, ContainerBuilderConfig> = {
  pricing_workbook_sheet: {
    ownerTable: "opportunity_pricing_workbook_sheets",
    statusColumns: ["version"],
    opportunityIdColumn: "opportunity_id",
    actorUserIdColumn: "updated_by",
    versionColumn: "version",
  },
  takeoff_measurement: {
    ownerTable: "takeoff_measurements",
    projectIdColumn: "project_id",
    opportunityIdColumn: "opportunity_id",
    actorUserIdColumn: "updated_by",
    versionColumn: "version",
    statusColumns: ["status", "measurement_kind", "source"],
    childCollections: [
      { key: "points", table: "takeoff_measurement_points", ownerColumn: "measurement_id", cursorColumn: "created_at", orderColumn: "point_order" },
      { key: "events", table: "takeoff_measurement_events", ownerColumn: "measurement_id", cursorColumn: "created_at", orderColumn: "created_at" },
      { key: "areaShapes", table: "takeoff_measurement_area_shapes", ownerColumn: "measurement_id", cursorColumn: "updated_at", orderColumn: "shape_order" },
      { key: "linePaths", table: "takeoff_measurement_line_paths", ownerColumn: "measurement_id", cursorColumn: "updated_at", orderColumn: "path_order" },
    ],
  },
  project_quote: {
    ownerTable: "project_quotes",
    projectIdColumn: "project_id",
    opportunityIdColumn: "source_opportunity_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["status"],
    childCollections: [{ key: "lineItems", table: "project_quote_line_items", ownerColumn: "quote_id", orderColumn: "sort_order" }],
  },
  project_variation: {
    ownerTable: "project_variations",
    projectIdColumn: "project_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["status", "origin", "invoice_ready"],
    childCollections: [
      { key: "lineItems", table: "project_variation_line_items", ownerColumn: "variation_id", orderColumn: "sort_order" },
      { key: "statusEvents", table: "project_variation_status_events", ownerColumn: "variation_id", cursorColumn: "changed_at", orderColumn: "changed_at" },
      { key: "attachments", table: "project_variation_attachments", ownerColumn: "variation_id", orderColumn: "updated_at" },
      { key: "invoiceItems", table: "project_variation_invoice_items", ownerColumn: "variation_id", orderColumn: "updated_at" },
    ],
  },
  project_purchase_order: {
    ownerTable: "project_purchase_orders",
    projectIdColumn: "project_id",
    supplierIdColumn: "supplier_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["status", "origin", "invoice_ready"],
    childCollections: [
      { key: "lineItems", table: "project_purchase_order_line_items", ownerColumn: "purchase_order_id", orderColumn: "sort_order" },
      { key: "statusEvents", table: "project_purchase_order_status_events", ownerColumn: "purchase_order_id", cursorColumn: "changed_at", orderColumn: "changed_at" },
    ],
  },
  supplier_invoice: {
    ownerTable: "supplier_invoices",
    supplierIdColumn: "supplier_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["status", "source"],
    cursorTimestampNormalizer: normalizeSupplierBillUclTimestamp,
    childCollections: [
      { key: "lines", table: "supplier_invoice_lines", ownerColumn: "supplier_invoice_id", orderColumn: "sort_order" },
      { key: "documents", table: "supplier_invoice_documents", ownerColumn: "supplier_invoice_id", cursorColumn: "created_at", orderColumn: "created_at" },
      { key: "matches", table: "supplier_invoice_purchase_order_matches", ownerColumn: "supplier_invoice_id", orderColumn: "created_at" },
      { key: "allocations", table: "supplier_invoice_line_allocations", ownerColumn: "supplier_invoice_id", orderColumn: "created_at" },
      { key: "actualCostEvents", table: "project_actual_cost_events", ownerColumn: "supplier_invoice_id", cursorColumn: "created_at", orderColumn: "created_at" },
    ],
  },
  supplier_invoice_allocation: {
    ownerTable: "supplier_invoice_line_allocations",
    projectIdColumn: "project_id",
    supplierIdColumn: undefined,
    actorUserIdColumn: "approved_by_user_id",
    statusColumns: ["review_status", "approval_status", "allocation_status", "match_status"],
    childCollections: [
      {
        key: "actualCostEvents",
        table: "project_actual_cost_events",
        ownerColumn: "source_invoice_allocation_id",
        cursorColumn: "created_at",
        orderColumn: "created_at",
      },
    ],
  },
  project_actual_cost_event: {
    ownerTable: "project_actual_cost_events",
    ownerCursorColumn: "created_at",
    projectIdColumn: "project_id",
    supplierIdColumn: "supplier_id",
    actorUserIdColumn: "created_by_user_id",
    statusColumns: ["event_status", "posting_source", "source_type"],
  },
  organization_material: {
    ownerTable: "organization_materials",
    actorUserIdColumn: "created_by",
    statusColumns: ["is_active"],
    childCollections: [{ key: "supplierPrices", table: "organization_material_supplier_prices", ownerColumn: "material_id", orderColumn: "updated_at" }],
  },
  material_import_batch: {
    ownerTable: "organization_material_import_batches",
    supplierIdColumn: "supplier_id",
    actorUserIdColumn: "uploaded_by",
    statusColumns: ["status"],
    childCollections: [{ key: "rows", table: "organization_material_import_rows", ownerColumn: "import_batch_id", orderColumn: "row_index" }],
  },
  project_claim: {
    ownerTable: "project_claims",
    projectIdColumn: "project_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["status", "claim_type"],
    cursorTimestampNormalizer: normalizeSupplierBillUclTimestamp,
    childCollections: [
      { key: "lineItems", table: "project_claim_line_items", ownerColumn: "claim_id", orderColumn: "sort_order" },
      {
        key: "retentionAllocations",
        table: "retention_claim_allocations",
        ownerColumn: "originating_payment_claim_id",
        orderColumn: "allocation_sequence",
      },
      {
        key: "accountingDocuments",
        table: "organization_accounting_documents",
        ownerColumn: "project_claim_id",
        orderColumn: "updated_at",
      },
    ],
  },
  project_time_sheet_entry: {
    ownerTable: "project_time_sheet_entries",
    projectIdColumn: "project_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["auto_clocked_out"],
    childCollections: [{ key: "events", table: "project_time_sheet_events", ownerColumn: "entry_id", cursorColumn: "created_at", orderColumn: "created_at" }],
  },
  project_quality_issue: {
    ownerTable: "project_quality_issues",
    projectIdColumn: "project_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["status"],
    childCollections: [{ key: "photos", table: "project_quality_issue_photos", ownerColumn: "issue_id", cursorColumn: "created_at", orderColumn: "created_at" }],
  },
  project_quality_inspection: {
    ownerTable: "project_quality_inspections",
    projectIdColumn: "project_id",
    actorUserIdColumn: "created_by",
    statusColumns: [],
    childCollections: [{ key: "items", table: "project_quality_inspection_items", ownerColumn: "inspection_id", orderColumn: "created_at" }],
  },
  project_quality_sign_off: {
    ownerTable: "project_quality_sign_offs",
    projectIdColumn: "project_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["status"],
  },
  task: {
    ownerTable: "project_job_todos",
    projectIdColumn: "project_id",
    actorUserIdColumn: "created_by",
    statusColumns: ["status", "is_completed", "source_type"],
    childCollections: [
      { key: "attachments", table: "task_attachments", ownerColumn: "task_id", cursorColumn: "created_at", orderColumn: "created_at" },
      { key: "activity", table: "task_activity_log", ownerColumn: "task_id", cursorColumn: "created_at", orderColumn: "created_at" },
      { key: "comments", table: "task_comments", ownerColumn: "task_id", orderColumn: "created_at" },
      { key: "links", table: "task_links", ownerColumn: "task_id", cursorColumn: "created_at", orderColumn: "created_at" },
    ],
  },
};

const QUOTE_SOURCE_CONFIGS: QuoteSourceConfig[] = [
  {
    sourceTable: "opportunity_quotes",
    lineTable: "opportunity_quote_line_items",
    ownerOpportunityColumn: "opportunity_id",
    actorUserIdColumn: "created_by",
    sourceWorkflow: "monthly_opportunity_quote_review",
    sourceModule: "opportunity_quotes",
    quoteSourceType: "opportunity_quote",
  },
  {
    sourceTable: "project_quotes",
    lineTable: "project_quote_line_items",
    ownerOpportunityColumn: "source_opportunity_id",
    ownerProjectColumn: "project_id",
    actorUserIdColumn: "created_by",
    sourceWorkflow: "monthly_project_quote_review",
    sourceModule: "project_quotes",
    quoteSourceType: "project_quote",
  },
];

function toArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function toIsoOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toCursorComparable(value: string | null) {
  return value ?? "";
}

function buildQuoteSourceKey(sourceTable: string, sourceId: string | null) {
  return sourceId ? `${sourceTable}:${sourceId}` : sourceTable;
}

function clampRecordStrength(input: boolean): UniversalLearningRecordStrength {
  return input ? "strong" : "normal";
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNumberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function parseQuoteCursorKey(cursorId: string | null) {
  if (!cursorId) return null;
  const separatorIndex = cursorId.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  return {
    sourceTable: cursorId.slice(0, separatorIndex),
    sourceId: cursorId.slice(separatorIndex + 1),
  };
}

export function buildUniversalLearningReviewWindow(reviewMonth: string): UniversalLearningReviewWindow {
  const normalizedMonth = /^\d{4}-\d{2}$/.test(reviewMonth) ? `${reviewMonth}-01T00:00:00.000Z` : reviewMonth;
  const startDate = new Date(normalizedMonth);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`Invalid universal learning review month: ${reviewMonth}`);
  }

  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function buildCursorFilter(column: string, cursor: UniversalLearningCursor) {
  if (!cursor.updatedAt) {
    return null;
  }

  if (cursor.id) {
    return `${column}.gt.${cursor.updatedAt},and(${column}.eq.${cursor.updatedAt},id.gt.${cursor.id})`;
  }

  return `${column}.gt.${cursor.updatedAt}`;
}

function compareCursor(left: UniversalLearningCursor, right: UniversalLearningCursor) {
  const leftUpdated = toCursorComparable(left.updatedAt);
  const rightUpdated = toCursorComparable(right.updatedAt);
  if (leftUpdated === rightUpdated) {
    return toCursorComparable(left.id).localeCompare(toCursorComparable(right.id));
  }
  return leftUpdated.localeCompare(rightUpdated);
}

export function isUniversalLearningCursorInsideWindow(
  cursor: UniversalLearningCursor,
  window: UniversalLearningReviewWindow,
) {
  if (!cursor.updatedAt) {
    return false;
  }

  return cursor.updatedAt >= window.start && cursor.updatedAt < window.end;
}

export function hasUniversalLearningCursorPassedPrevious(
  cursor: UniversalLearningCursor,
  previousCursor: UniversalLearningCursor,
) {
  return compareCursor(cursor, previousCursor) > 0;
}

export function shouldIncludeUniversalLearningRecord(input: {
  recordCursor: UniversalLearningCursor;
  previousCursor: UniversalLearningCursor;
  window: UniversalLearningReviewWindow;
}) {
  return (
    isUniversalLearningCursorInsideWindow(input.recordCursor, input.window)
    && hasUniversalLearningCursorPassedPrevious(input.recordCursor, input.previousCursor)
  );
}

function extractRoutingContext(row: JsonRecord, children: Record<string, JsonRecord[]>) {
  const values = new Set<string>();
  const context: Record<string, unknown> = {};
  const keys = [
    "organization_cost_code_id",
    "cost_code_id",
    "tradesstack_cost_code",
    "tradesstack_cost_code_label",
    "financial_routing_confidence",
    "financial_routing_source",
  ];

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      context[key] = row[key];
      values.add(String(row[key]));
    }
  }

  for (const childRows of Object.values(children)) {
    for (const child of childRows) {
      for (const key of keys) {
        if (child[key] !== undefined && child[key] !== null && child[key] !== "") {
          const collectionKey = `${key}Values`;
          const current = Array.isArray(context[collectionKey]) ? (context[collectionKey] as unknown[]) : [];
          if (!current.some((entry) => String(entry) === String(child[key]))) {
            context[collectionKey] = [...current, child[key]];
          }
          values.add(String(child[key]));
        }
      }
    }
  }

  return values.size > 0 ? context : {};
}

async function selectChangedOwnerIds(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  config: ContainerBuilderConfig;
  cursor: UniversalLearningCursor;
  reviewWindow: UniversalLearningReviewWindow;
  limit: number;
}) {
  const ownerIds = new Set<string>();
  const ownerCursorColumn = input.config.ownerCursorColumn ?? "updated_at";
  const ownerTable = input.admin
    .from(input.config.ownerTable)
    .select("id")
    .eq("organization_id", input.organizationId)
    .gte(ownerCursorColumn, input.reviewWindow.start)
    .lt(ownerCursorColumn, input.reviewWindow.end);
  const ownerFilter = buildCursorFilter(ownerCursorColumn, input.cursor);
  const ownerQuery = ownerFilter ? ownerTable.or(ownerFilter) : ownerTable;
  const ownerResult = await ownerQuery
    .order(ownerCursorColumn, { ascending: true })
    .order("id", { ascending: true })
    .limit(input.limit);

  if (ownerResult.error) {
    throw new Error(ownerResult.error.message);
  }

  for (const row of toArray(ownerResult.data as JsonRecord[] | null)) {
    const id = typeof row.id === "string" ? row.id : null;
    if (id) {
      ownerIds.add(id);
    }
  }

  for (const child of input.config.childCollections ?? []) {
    if (ownerIds.size >= input.limit) {
      break;
    }

    const childCursorColumn = child.cursorColumn ?? "updated_at";
    const childTable = input.admin
      .from(child.table)
      .select(`${child.ownerColumn}, id`)
      .eq("organization_id", input.organizationId)
      .gte(childCursorColumn, input.reviewWindow.start)
      .lt(childCursorColumn, input.reviewWindow.end);
    const childFilter = buildCursorFilter(childCursorColumn, input.cursor);
    const childQuery = childFilter ? childTable.or(childFilter) : childTable;
    const childResult = await childQuery
      .order(childCursorColumn, { ascending: true })
      .order("id", { ascending: true })
      .limit(input.limit);

    if (childResult.error) {
      throw new Error(childResult.error.message);
    }

    for (const row of toArray(childResult.data as JsonRecord[] | null)) {
      const ownerId = typeof row[child.ownerColumn] === "string" ? (row[child.ownerColumn] as string) : null;
      if (ownerId) {
        ownerIds.add(ownerId);
      }
      if (ownerIds.size >= input.limit) {
        break;
      }
    }
  }

  if (input.config.ownerTable === "project_claims" && ownerIds.size < input.limit) {
    const dependencyStart =
      input.cursor.updatedAt && input.cursor.updatedAt > input.reviewWindow.start
        ? input.cursor.updatedAt
        : input.reviewWindow.start;
    const loadChangedIds = async (table: string) => {
      const result = await input.admin
        .from(table)
        .select("id")
        .eq("organization_id", input.organizationId)
        .gte("updated_at", dependencyStart)
        .lt("updated_at", input.reviewWindow.end)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(input.limit);
      if (result.error) throw new Error(result.error.message);
      return uniqueNonEmpty(
        toArray(result.data as JsonRecord[] | null).map((row) => toStringOrNull(row.id)),
      );
    };
    const [quoteIds, variationIds, projectIds, clientIds] = await Promise.all([
      loadChangedIds("project_quotes"),
      loadChangedIds("project_variations"),
      loadChangedIds("organization_projects"),
      loadChangedIds("organization_clients"),
    ]);

    const sourceDocumentIds = [...quoteIds, ...variationIds];
    if (sourceDocumentIds.length > 0) {
      const lineResult = await input.admin
        .from("project_claim_line_items")
        .select("claim_id,source_document_id")
        .eq("organization_id", input.organizationId)
        .in("source_document_id", sourceDocumentIds)
        .limit(input.limit);
      if (lineResult.error) throw new Error(lineResult.error.message);
      for (const row of toArray(lineResult.data as JsonRecord[] | null)) {
        const claimId = toStringOrNull(row.claim_id);
        if (claimId) ownerIds.add(claimId);
      }
    }

    const changedProjectIds = new Set(projectIds);
    if (clientIds.length > 0) {
      const projectResult = await input.admin
        .from("organization_projects")
        .select("id")
        .eq("organization_id", input.organizationId)
        .in("client_id", clientIds)
        .limit(input.limit);
      if (projectResult.error) throw new Error(projectResult.error.message);
      for (const row of toArray(projectResult.data as JsonRecord[] | null)) {
        const projectId = toStringOrNull(row.id);
        if (projectId) changedProjectIds.add(projectId);
      }
    }
    if (changedProjectIds.size > 0) {
      const claimResult = await input.admin
        .from("project_claims")
        .select("id")
        .eq("organization_id", input.organizationId)
        .in("project_id", [...changedProjectIds])
        .limit(input.limit);
      if (claimResult.error) throw new Error(claimResult.error.message);
      for (const row of toArray(claimResult.data as JsonRecord[] | null)) {
        const claimId = toStringOrNull(row.id);
        if (claimId) ownerIds.add(claimId);
      }
    }
  }

  if (input.config.ownerTable === "project_claims" && ownerIds.size >= input.limit) {
    throw new Error(
      `Payment Claim UCL monthly candidate safety limit (${input.limit}) was reached. The cursor was not advanced; increase the bounded candidate scan or split the review window before retrying.`,
    );
  }

  return Array.from(ownerIds).slice(0, input.limit);
}

async function loadChildCollections(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerIds: string[];
  config: ContainerBuilderConfig;
}) {
  const collections = new Map<string, Record<string, JsonRecord[]>>();
  for (const child of input.config.childCollections ?? []) {
    if (input.ownerIds.length === 0) {
      collections.set(child.key, {});
      continue;
    }
    let query = input.admin
      .from(child.table)
      .select("*")
      .eq("organization_id", input.organizationId)
      .in(child.ownerColumn, input.ownerIds);

    if (child.orderColumn) {
      query = query.order(child.orderColumn, { ascending: true });
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const grouped: Record<string, JsonRecord[]> = {};
    for (const row of toArray(data as unknown[] | null).map(toRecord)) {
      const ownerId = typeof row[child.ownerColumn] === "string" ? (row[child.ownerColumn] as string) : null;
      if (!ownerId) {
        continue;
      }
      grouped[ownerId] = grouped[ownerId] ?? [];
      grouped[ownerId].push(row);
    }
    collections.set(child.key, grouped);
  }

  return collections;
}

type ProjectPurchaseOrderEnrichment = {
  suppliersById: Map<string, JsonRecord>;
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  costItemsById: Map<string, JsonRecord>;
};

type ProjectQuoteEnrichment = {
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  opportunitiesById: Map<string, JsonRecord>;
};

type PricingWorkbookSheetEnrichment = {
  workbooksById: Map<string, JsonRecord>;
  opportunitiesById: Map<string, JsonRecord>;
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
};

type TakeoffMeasurementEnrichment = {
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  groupsById: Map<string, JsonRecord>;
  pagesById: Map<string, JsonRecord>;
  drawingSetsById: Map<string, JsonRecord>;
  calibrationsById: Map<string, JsonRecord>;
  areaShapesByMeasurementId: Map<string, JsonRecord[]>;
  areaShapePointsByShapeId: Map<string, JsonRecord[]>;
  linePathsByMeasurementId: Map<string, JsonRecord[]>;
  linePathPointsByPathId: Map<string, JsonRecord[]>;
};

type ProjectVariationEnrichment = {
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  quotesById: Map<string, JsonRecord>;
  purchaseOrdersById: Map<string, JsonRecord>;
  mirroredCostItemsByVariationId: Map<string, JsonRecord[]>;
};

type SupplierInvoiceEnrichment = {
  suppliersById: Map<string, JsonRecord>;
  purchaseOrdersById: Map<string, JsonRecord>;
  purchaseOrderLinesById: Map<string, JsonRecord>;
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  extractionsByInvoiceId: Map<string, JsonRecord[]>;
  commercialApprovalsByInvoiceId: Map<string, JsonRecord[]>;
  commercialSnapshotsByInvoiceId: Map<string, JsonRecord[]>;
  historicalApprovedSnapshotsByPurchaseOrderLineId: Map<string, JsonRecord[]>;
  commercialVariancesByInvoiceId: Map<string, JsonRecord[]>;
  siteReviewSubmissionsByInvoiceId: Map<string, JsonRecord[]>;
  siteReviewDecisionsByInvoiceId: Map<string, JsonRecord[]>;
  accountsApprovalsByInvoiceId: Map<string, JsonRecord[]>;
  activityEventsByInvoiceId: Map<string, JsonRecord[]>;
  accountingDocumentsByInvoiceId: Map<string, JsonRecord[]>;
  accountingDocumentLinesByVersionId: Map<string, JsonRecord[]>;
};

type SupplierInvoiceAllocationEnrichment = {
  invoicesById: Map<string, JsonRecord>;
  invoiceLinesById: Map<string, JsonRecord>;
  invoiceDocumentsByInvoiceId: Map<string, JsonRecord[]>;
  purchaseOrderMatchesByInvoiceId: Map<string, JsonRecord[]>;
  purchaseOrdersById: Map<string, JsonRecord>;
  purchaseOrderLinesById: Map<string, JsonRecord>;
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  suppliersById: Map<string, JsonRecord>;
  siblingAllocationsByInvoiceId: Map<string, JsonRecord[]>;
  actualCostEventsByAllocationId: Map<string, JsonRecord[]>;
  successorAllocationIdsByAllocationId: Map<string, string[]>;
};

type ProjectActualCostEventEnrichment = {
  allocationsById: Map<string, JsonRecord>;
  invoicesById: Map<string, JsonRecord>;
  invoiceLinesById: Map<string, JsonRecord>;
  purchaseOrdersById: Map<string, JsonRecord>;
  purchaseOrderLinesById: Map<string, JsonRecord>;
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  suppliersById: Map<string, JsonRecord>;
  eventsById: Map<string, JsonRecord>;
  correctionChainEventsByRootId: Map<string, JsonRecord[]>;
};

type OrganizationMaterialEnrichment = {
  suppliersById: Map<string, JsonRecord>;
  supplierProductsById: Map<string, JsonRecord>;
  importBatchesById: Map<string, JsonRecord>;
  importRowsByMaterialId: Map<string, JsonRecord[]>;
};

type MaterialImportBatchEnrichment = {
  suppliersById: Map<string, JsonRecord>;
  materialsById: Map<string, JsonRecord>;
  supplierPricesByBatchId: Map<string, JsonRecord[]>;
};

type ProjectClaimEnrichment = {
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  quotesById: Map<string, JsonRecord>;
  quoteLinesById: Map<string, JsonRecord>;
  variationsById: Map<string, JsonRecord>;
  variationLinesById: Map<string, JsonRecord>;
  costItemsById: Map<string, JsonRecord>;
  mirroredCostItemsByClaimId: Map<string, JsonRecord[]>;
};

type ProjectTimeSheetEntryEnrichment = {
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  purchaseOrdersById: Map<string, JsonRecord>;
  purchaseOrderLinesByEntryId: Map<string, JsonRecord[]>;
  costItemsById: Map<string, JsonRecord>;
  reviewWindowEntriesByWorkerId: Map<string, JsonRecord[]>;
};

type TaskEnrichment = {
  projectsById: Map<string, JsonRecord>;
  clientsById: Map<string, JsonRecord>;
  opportunitiesById: Map<string, JsonRecord>;
  qualityIssuesById: Map<string, JsonRecord>;
  inspectionsById: Map<string, JsonRecord>;
  inspectionItemsById: Map<string, JsonRecord>;
  purchaseOrdersById: Map<string, JsonRecord>;
  variationsById: Map<string, JsonRecord>;
  quotesById: Map<string, JsonRecord>;
  legacyAttachmentsByTaskId: Map<string, JsonRecord[]>;
};

async function loadProjectPurchaseOrderEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
  childCollections: Map<string, Record<string, JsonRecord[]>>;
}): Promise<ProjectPurchaseOrderEnrichment> {
  const supplierIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.supplier_id)));
  const projectIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.project_id)));
  const lineItemsByOwner = input.childCollections.get("lineItems") ?? {};
  const lineItems = Object.values(lineItemsByOwner).flat();
  const costItemIds = uniqueNonEmpty(
    lineItems.flatMap((line) => [
      toStringOrNull(line.cost_item_id),
      toStringOrNull(line.source_cost_item_id),
    ]),
  );

  const [supplierResult, projectResult, costItemResult] = await Promise.all([
    supplierIds.length > 0
      ? input.admin
        .from("organization_suppliers")
        .select("id,organization_id,name,company_name,legal_name,email,phone,is_active,source,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    costItemIds.length > 0
      ? input.admin
        .from("cost_items")
        .select("id,organization_id,project_id,source_document_kind,source_document_id,source_line_id,source_line_table,supplier_id,supplier_name_snapshot,tradesstack_cost_code,tradesstack_cost_code_label,accounting_mapping_id")
        .eq("organization_id", input.organizationId)
        .in("id", costItemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (supplierResult.error) throw new Error(supplierResult.error.message);
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (costItemResult.error) throw new Error(costItemResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const clientResult = clientIds.length > 0
    ? await input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientResult.error) throw new Error(clientResult.error.message);

  return {
    suppliersById: new Map(toArray(supplierResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    costItemsById: new Map(toArray(costItemResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
  };
}

async function loadProjectQuoteEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
}): Promise<ProjectQuoteEnrichment> {
  const projectIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.project_id)));
  const opportunityIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.source_opportunity_id)));

  const [projectResult, opportunityResult] = await Promise.all([
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length > 0
      ? input.admin
        .from("organization_opportunities")
        .select("id,organization_id,name,opportunity_code,stage,location,client_id,estimated_value,due_date,quoted_at,owner_user_id,workspace_project_id,converted_project_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", opportunityIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectResult.error) throw new Error(projectResult.error.message);
  if (opportunityResult.error) throw new Error(opportunityResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const opportunities = toArray(opportunityResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty([
    ...projects.map((project) => toStringOrNull(project.client_id)),
    ...opportunities.map((opportunity) => toStringOrNull(opportunity.client_id)),
  ]);

  const clientResult = clientIds.length > 0
    ? await input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,default_margin_percent,email,phone,credit_risk,tags,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientResult.error) throw new Error(clientResult.error.message);

  return {
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    opportunitiesById: new Map(opportunities.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
  };
}

function resolveDeterministicOpportunityProjectId(opportunity: JsonRecord | null) {
  const convertedProjectId = toStringOrNull(opportunity?.converted_project_id);
  const workspaceProjectId = toStringOrNull(opportunity?.workspace_project_id);

  if (convertedProjectId && workspaceProjectId && convertedProjectId !== workspaceProjectId) {
    return null;
  }

  return convertedProjectId ?? workspaceProjectId;
}

async function loadPricingWorkbookSheetEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
}): Promise<PricingWorkbookSheetEnrichment> {
  const workbookIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.workbook_id)));
  const opportunityIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.opportunity_id)));

  const [workbookResult, opportunityResult] = await Promise.all([
    workbookIds.length > 0
      ? input.admin
        .from("opportunity_pricing_worksheets")
        .select("id,organization_id,opportunity_id,name,trade_package,last_active_sheet_id,archived_at,version,created_by,updated_by,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", workbookIds)
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length > 0
      ? input.admin
        .from("organization_opportunities")
        .select("id,organization_id,name,opportunity_code,stage,location,client_id,estimated_value,workspace_project_id,converted_project_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", opportunityIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (workbookResult.error) throw new Error(workbookResult.error.message);
  if (opportunityResult.error) throw new Error(opportunityResult.error.message);

  const workbooks = toArray(workbookResult.data as JsonRecord[] | null).map(toRecord);
  const opportunities = toArray(opportunityResult.data as JsonRecord[] | null).map(toRecord);
  const projectIds = uniqueNonEmpty(opportunities.map((opportunity) => resolveDeterministicOpportunityProjectId(opportunity)));

  const projectResult = projectIds.length > 0
    ? await input.admin
      .from("organization_projects")
      .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", projectIds)
    : { data: [], error: null };

  if (projectResult.error) throw new Error(projectResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty([
    ...opportunities.map((opportunity) => toStringOrNull(opportunity.client_id)),
    ...projects.map((project) => toStringOrNull(project.client_id)),
  ]);

  const clientResult = clientIds.length > 0
    ? await input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,default_margin_percent,email,phone,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientResult.error) throw new Error(clientResult.error.message);

  return {
    workbooksById: new Map(workbooks.map((row) => [String(row.id), row])),
    opportunitiesById: new Map(opportunities.map((row) => [String(row.id), row])),
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
  };
}

async function loadTakeoffMeasurementEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
}): Promise<TakeoffMeasurementEnrichment> {
  const projectIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.project_id)));
  const groupIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.group_id)));
  const pageIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.page_id)));
  const drawingSetIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.drawing_set_id)));
  const calibrationIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.calibration_id)));
  const measurementIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));

  const [
    projectResult,
    groupResult,
    pageResult,
    drawingSetResult,
    calibrationResult,
    areaShapeResult,
    linePathResult,
  ] = await Promise.all([
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length > 0
      ? input.admin
        .from("takeoff_measurement_groups")
        .select("id,organization_id,project_id,opportunity_id,parent_group_id,name,code,color_hex,sort_order,status,trade_id,trade_label,metadata,created_by,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    pageIds.length > 0
      ? input.admin
        .from("takeoff_pages")
        .select("id,organization_id,project_id,opportunity_id,drawing_set_id,page_number,page_label,rotation_degrees,source_revision,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", pageIds)
      : Promise.resolve({ data: [], error: null }),
    drawingSetIds.length > 0
      ? input.admin
        .from("project_drawing_sets")
        .select("id,organization_id,project_id,file_name,mime_type,uploaded_at,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", drawingSetIds)
      : Promise.resolve({ data: [], error: null }),
    calibrationIds.length > 0
      ? input.admin
        .from("takeoff_calibrations")
        .select("id,organization_id,project_id,opportunity_id,page_id,name,scale_ratio,unit_system,base_unit,display_unit,reference_length_input,reference_length_base,is_active,superseded_by,notes,created_by,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", calibrationIds)
      : Promise.resolve({ data: [], error: null }),
    measurementIds.length > 0
      ? input.admin
        .from("takeoff_measurement_area_shapes")
        .select("id,organization_id,measurement_id,shape_order,measured_area_base,measured_perimeter_base,page_bbox_min_x,page_bbox_min_y,page_bbox_max_x,page_bbox_max_y,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("measurement_id", measurementIds)
      : Promise.resolve({ data: [], error: null }),
    measurementIds.length > 0
      ? input.admin
        .from("takeoff_measurement_line_paths")
        .select("id,organization_id,measurement_id,path_order,measured_length_base,page_bbox_min_x,page_bbox_min_y,page_bbox_max_x,page_bbox_max_y,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("measurement_id", measurementIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectResult.error) throw new Error(projectResult.error.message);
  if (groupResult.error) throw new Error(groupResult.error.message);
  if (pageResult.error) throw new Error(pageResult.error.message);
  if (drawingSetResult.error) throw new Error(drawingSetResult.error.message);
  if (calibrationResult.error) throw new Error(calibrationResult.error.message);
  if (areaShapeResult.error) throw new Error(areaShapeResult.error.message);
  if (linePathResult.error) throw new Error(linePathResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const areaShapes = toArray(areaShapeResult.data as JsonRecord[] | null).map(toRecord);
  const linePaths = toArray(linePathResult.data as JsonRecord[] | null).map(toRecord);
  const areaShapeIds = uniqueNonEmpty(areaShapes.map((shape) => toStringOrNull(shape.id)));
  const linePathIds = uniqueNonEmpty(linePaths.map((path) => toStringOrNull(path.id)));

  const [clientResult, areaShapePointResult, linePathPointResult] = await Promise.all([
    clientIds.length > 0
      ? input.admin
        .from("organization_clients")
        .select("id,organization_id,name,company_name,client_type,client_status,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    areaShapeIds.length > 0
      ? input.admin
        .from("takeoff_measurement_area_shape_points")
        .select("id,organization_id,area_shape_id,point_order,x,y,created_at")
        .eq("organization_id", input.organizationId)
        .in("area_shape_id", areaShapeIds)
      : Promise.resolve({ data: [], error: null }),
    linePathIds.length > 0
      ? input.admin
        .from("takeoff_measurement_line_path_points")
        .select("id,organization_id,line_path_id,point_order,x,y,created_at")
        .eq("organization_id", input.organizationId)
        .in("line_path_id", linePathIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (clientResult.error) throw new Error(clientResult.error.message);
  if (areaShapePointResult.error) throw new Error(areaShapePointResult.error.message);
  if (linePathPointResult.error) throw new Error(linePathPointResult.error.message);

  const areaShapesByMeasurementId = new Map<string, JsonRecord[]>();
  for (const shape of areaShapes) {
    const measurementId = toStringOrNull(shape.measurement_id);
    if (!measurementId) continue;
    areaShapesByMeasurementId.set(measurementId, [...(areaShapesByMeasurementId.get(measurementId) ?? []), shape]);
  }
  for (const [measurementId, shapes] of areaShapesByMeasurementId.entries()) {
    areaShapesByMeasurementId.set(measurementId, shapes.slice().sort((left, right) =>
      Number(left.shape_order ?? 0) - Number(right.shape_order ?? 0)
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))));
  }

  const linePathsByMeasurementId = new Map<string, JsonRecord[]>();
  for (const path of linePaths) {
    const measurementId = toStringOrNull(path.measurement_id);
    if (!measurementId) continue;
    linePathsByMeasurementId.set(measurementId, [...(linePathsByMeasurementId.get(measurementId) ?? []), path]);
  }
  for (const [measurementId, paths] of linePathsByMeasurementId.entries()) {
    linePathsByMeasurementId.set(measurementId, paths.slice().sort((left, right) =>
      Number(left.path_order ?? 0) - Number(right.path_order ?? 0)
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))));
  }

  const areaShapePointsByShapeId = new Map<string, JsonRecord[]>();
  for (const point of toArray(areaShapePointResult.data as JsonRecord[] | null).map(toRecord)) {
    const shapeId = toStringOrNull(point.area_shape_id);
    if (!shapeId) continue;
    areaShapePointsByShapeId.set(shapeId, [...(areaShapePointsByShapeId.get(shapeId) ?? []), point]);
  }
  for (const [shapeId, points] of areaShapePointsByShapeId.entries()) {
    areaShapePointsByShapeId.set(shapeId, points.slice().sort((left, right) =>
      Number(left.point_order ?? 0) - Number(right.point_order ?? 0)
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))));
  }

  const linePathPointsByPathId = new Map<string, JsonRecord[]>();
  for (const point of toArray(linePathPointResult.data as JsonRecord[] | null).map(toRecord)) {
    const pathId = toStringOrNull(point.line_path_id);
    if (!pathId) continue;
    linePathPointsByPathId.set(pathId, [...(linePathPointsByPathId.get(pathId) ?? []), point]);
  }
  for (const [pathId, points] of linePathPointsByPathId.entries()) {
    linePathPointsByPathId.set(pathId, points.slice().sort((left, right) =>
      Number(left.point_order ?? 0) - Number(right.point_order ?? 0)
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))));
  }

  return {
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    groupsById: new Map(toArray(groupResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    pagesById: new Map(toArray(pageResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    drawingSetsById: new Map(toArray(drawingSetResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    calibrationsById: new Map(toArray(calibrationResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    areaShapesByMeasurementId,
    areaShapePointsByShapeId,
    linePathsByMeasurementId,
    linePathPointsByPathId,
  };
}

async function loadProjectVariationEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
  childCollections: Map<string, Record<string, JsonRecord[]>>;
}): Promise<ProjectVariationEnrichment> {
  const projectIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.project_id)));
  const lineItems = Object.values(input.childCollections.get("lineItems") ?? {}).flat();
  const quoteIds = uniqueNonEmpty(lineItems.map((line) => toStringOrNull(line.source_project_quote_id)));
  const purchaseOrderIds = uniqueNonEmpty(lineItems.map((line) => toStringOrNull(line.source_purchase_order_id)));
  const variationIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));

  const [projectResult, quoteResult, purchaseOrderResult, mirroredCostItemResult] = await Promise.all([
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length > 0
      ? input.admin
        .from("project_quotes")
        .select("id,organization_id,project_id,quote_number,quote_title,status,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", quoteIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseOrderIds.length > 0
      ? input.admin
        .from("project_purchase_orders")
        .select("id,organization_id,project_id,purchase_order_number,purchase_order_title,status,supplier_id,issued_to_label,supplier_name_snapshot,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", purchaseOrderIds)
      : Promise.resolve({ data: [], error: null }),
    variationIds.length > 0
      ? input.admin
        .from("cost_items")
        .select("id,organization_id,source_document_kind,source_document_id,source_line_id,source_line_table,tradesstack_cost_code,tradesstack_cost_code_label,accounting_mapping_id")
        .eq("organization_id", input.organizationId)
        .eq("source_document_kind", "project_variation")
        .in("source_document_id", variationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectResult.error) throw new Error(projectResult.error.message);
  if (quoteResult.error) throw new Error(quoteResult.error.message);
  if (purchaseOrderResult.error) throw new Error(purchaseOrderResult.error.message);
  if (mirroredCostItemResult.error) throw new Error(mirroredCostItemResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const clientResult = clientIds.length > 0
    ? await input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientResult.error) throw new Error(clientResult.error.message);

  const mirroredCostItemsByVariationId = new Map<string, JsonRecord[]>();
  for (const costItem of toArray(mirroredCostItemResult.data as JsonRecord[] | null).map(toRecord)) {
    const variationId = toStringOrNull(costItem.source_document_id);
    if (!variationId) continue;
    mirroredCostItemsByVariationId.set(variationId, [...(mirroredCostItemsByVariationId.get(variationId) ?? []), costItem]);
  }

  return {
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    quotesById: new Map(toArray(quoteResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    purchaseOrdersById: new Map(toArray(purchaseOrderResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    mirroredCostItemsByVariationId,
  };
}

async function loadSupplierInvoiceEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
  childCollections: Map<string, Record<string, JsonRecord[]>>;
}): Promise<SupplierInvoiceEnrichment> {
  const invoiceIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));
  const supplierIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.supplier_id)));
  const lineRows = Object.values(input.childCollections.get("lines") ?? {}).flat();
  const matchRows = Object.values(input.childCollections.get("matches") ?? {}).flat();
  const allocationRows = Object.values(input.childCollections.get("allocations") ?? {}).flat();
  const actualCostEventRows = Object.values(input.childCollections.get("actualCostEvents") ?? {}).flat();

  const purchaseOrderIds = uniqueNonEmpty([
    ...matchRows.map((row) => toStringOrNull(row.purchase_order_id)),
    ...allocationRows.map((row) => toStringOrNull(row.purchase_order_id)),
    ...actualCostEventRows.map((row) => toStringOrNull(row.purchase_order_id)),
  ]);
  const purchaseOrderLineIds = uniqueNonEmpty([
    ...allocationRows.map((row) => toStringOrNull(row.purchase_order_line_item_id)),
    ...actualCostEventRows.map((row) => toStringOrNull(row.purchase_order_line_item_id)),
  ]);

  const [
    supplierResult,
    purchaseOrderResult,
    purchaseOrderLineResult,
    extractionResult,
    commercialApprovalResult,
    commercialSnapshotResult,
    historicalSnapshotResult,
    commercialVarianceResult,
    siteReviewSubmissionResult,
    siteReviewDecisionResult,
    accountsApprovalResult,
    activityEventResult,
    accountingDocumentResult,
  ] = await Promise.all([
    supplierIds.length > 0
      ? input.admin
        .from("organization_suppliers")
        .select("id,organization_id,name,company_name,legal_name,is_active,source,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseOrderIds.length > 0
      ? input.admin
        .from("project_purchase_orders")
        .select("id,organization_id,project_id,purchase_order_number,purchase_order_title,status,supplier_id,issued_to_label,supplier_name_snapshot,total_purchase_order_price,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", purchaseOrderIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseOrderLineIds.length > 0
      ? input.admin
        .from("project_purchase_order_line_items")
        .select("id,organization_id,purchase_order_id,project_id,description,quantity,rate,total,sort_order,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", purchaseOrderLineIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_document_extractions")
        .select("id,organization_id,supplier_invoice_id,supplier_invoice_document_id,attempt_number,status,schema_version,warnings_json,error_code,created_at,started_at,completed_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_commercial_approvals")
        .select("id,organization_id,supplier_invoice_id,status,reviewed_at,created_at,invalidated_at,invalidation_reason,invalidation_source")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_commercial_line_snapshots")
        .select("id,organization_id,supplier_invoice_id,supplier_invoice_line_id,commercial_approval_id,allocation_id,project_id,purchase_order_id,purchase_order_line_item_id,accounting_mapping_id,accounting_tax_rate_id,tax_resolution_status,quantity,unit_rate,amount,tax_amount,created_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseOrderLineIds.length > 0
      ? input.admin
        .from("supplier_invoice_commercial_line_snapshots")
        .select("id,organization_id,supplier_invoice_id,supplier_invoice_line_id,commercial_approval_id,purchase_order_id,purchase_order_line_item_id,quantity,amount,created_at")
        .eq("organization_id", input.organizationId)
        .in("purchase_order_line_item_id", purchaseOrderLineIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_commercial_variances")
        .select("id,organization_id,supplier_invoice_id,commercial_approval_id,purchase_order_line_item_id,variance_key,variance_type,severity,variance_amount,accepted_at,created_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_site_review_submissions")
        .select("id,organization_id,supplier_invoice_id,status,submitted_at,invalidated_at,invalidation_reason,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_site_review_decisions")
        .select("id,organization_id,supplier_invoice_id,submission_id,project_id,purchase_order_id,decision,reviewed_at,invalidated_at,invalidation_reason,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_accounts_approvals")
        .select("id,organization_id,supplier_invoice_id,site_review_submission_id,status,approved_at,invalidated_at,invalidation_reason,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_activity_events")
        .select("id,organization_id,supplier_invoice_id,event_type,created_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("organization_accounting_documents")
        .select("id,organization_id,local_document_id,local_document_type,current_version_id,export_status,external_document_id,external_document_number,attachment_status,exported_at,last_synced_at,last_status_synced_at,last_error_code,last_status_sync_error,normalized_external_status,amount_paid,amount_due,fully_paid_at,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .eq("local_document_type", "supplier_invoice")
        .in("local_document_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (supplierResult.error) throw new Error(supplierResult.error.message);
  if (purchaseOrderResult.error) throw new Error(purchaseOrderResult.error.message);
  if (purchaseOrderLineResult.error) throw new Error(purchaseOrderLineResult.error.message);
  if (extractionResult.error) throw new Error(extractionResult.error.message);
  if (commercialApprovalResult.error) throw new Error(commercialApprovalResult.error.message);
  if (commercialSnapshotResult.error) throw new Error(commercialSnapshotResult.error.message);
  if (historicalSnapshotResult.error) throw new Error(historicalSnapshotResult.error.message);
  if (commercialVarianceResult.error) throw new Error(commercialVarianceResult.error.message);
  if (siteReviewSubmissionResult.error) throw new Error(siteReviewSubmissionResult.error.message);
  if (siteReviewDecisionResult.error) throw new Error(siteReviewDecisionResult.error.message);
  if (accountsApprovalResult.error) throw new Error(accountsApprovalResult.error.message);
  if (activityEventResult.error) throw new Error(activityEventResult.error.message);
  if (accountingDocumentResult.error) throw new Error(accountingDocumentResult.error.message);

  const purchaseOrders = toArray(purchaseOrderResult.data as JsonRecord[] | null).map(toRecord);
  const purchaseOrderLines = toArray(purchaseOrderLineResult.data as JsonRecord[] | null).map(toRecord);
  const accountingDocuments = toArray(accountingDocumentResult.data as JsonRecord[] | null).map(toRecord);
  const accountingVersionIds = uniqueNonEmpty(
    accountingDocuments.map((row) => toStringOrNull(row.current_version_id)),
  );
  const accountingDocumentLineResult = accountingVersionIds.length > 0
    ? await input.admin
      .from("organization_accounting_document_lines")
      .select("id,organization_id,version_id,source_invoice_line_id,source_allocation_id,organization_cost_code_id,accounting_mapping_id,project_id,purchase_order_id,purchase_order_line_item_id,routing_code,xero_account_code,xero_tax_type,sequence,created_at")
      .eq("organization_id", input.organizationId)
      .in("version_id", accountingVersionIds)
    : { data: [], error: null };
  if (accountingDocumentLineResult.error) throw new Error(accountingDocumentLineResult.error.message);

  const historicalSnapshots = toArray(historicalSnapshotResult.data as JsonRecord[] | null).map(toRecord);
  const historicalApprovalIds = uniqueNonEmpty(
    historicalSnapshots.map((row) => toStringOrNull(row.commercial_approval_id)),
  );
  const historicalApprovalResult = historicalApprovalIds.length > 0
    ? await input.admin
      .from("supplier_invoice_commercial_approvals")
      .select("id,organization_id,status,invalidated_at")
      .eq("organization_id", input.organizationId)
      .in("id", historicalApprovalIds)
    : { data: [], error: null };
  if (historicalApprovalResult.error) throw new Error(historicalApprovalResult.error.message);
  const approvedHistoricalApprovalIds = new Set(
    toArray(historicalApprovalResult.data as JsonRecord[] | null)
      .map(toRecord)
      .filter((row) =>
        toStringOrNull(row.status)?.toLowerCase() === "approved"
        && !toIsoOrNull(row.invalidated_at),
      )
      .map((row) => String(row.id)),
  );
  const approvedHistoricalSnapshots = historicalSnapshots.filter((row) => {
    const approvalId = toStringOrNull(row.commercial_approval_id);
    return approvalId ? approvedHistoricalApprovalIds.has(approvalId) : false;
  });

  const projectIds = uniqueNonEmpty([
    ...lineRows.map((row) => toStringOrNull(row.project_id)),
    ...allocationRows.map((row) => toStringOrNull(row.project_id)),
    ...actualCostEventRows.map((row) => toStringOrNull(row.project_id)),
    ...purchaseOrders.map((row) => toStringOrNull(row.project_id)),
  ]);

  const projectResult = projectIds.length > 0
    ? await input.admin
      .from("organization_projects")
      .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", projectIds)
    : { data: [], error: null };

  if (projectResult.error) throw new Error(projectResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const clientResult = clientIds.length > 0
    ? await input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientResult.error) throw new Error(clientResult.error.message);

  const groupBy = (rows: JsonRecord[], key: string) => {
    const grouped = new Map<string, JsonRecord[]>();
    for (const row of rows) {
      const value = toStringOrNull(row[key]);
      if (value) grouped.set(value, [...(grouped.get(value) ?? []), row]);
    }
    return grouped;
  };
  const toRows = (value: unknown) => toArray(value as JsonRecord[] | null).map(toRecord);

  return {
    suppliersById: new Map(toArray(supplierResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    purchaseOrdersById: new Map(purchaseOrders.map((row) => [String(row.id), row])),
    purchaseOrderLinesById: new Map(purchaseOrderLines.map((row) => [String(row.id), row])),
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    extractionsByInvoiceId: groupBy(toRows(extractionResult.data), "supplier_invoice_id"),
    commercialApprovalsByInvoiceId: groupBy(toRows(commercialApprovalResult.data), "supplier_invoice_id"),
    commercialSnapshotsByInvoiceId: groupBy(toRows(commercialSnapshotResult.data), "supplier_invoice_id"),
    historicalApprovedSnapshotsByPurchaseOrderLineId: groupBy(
      approvedHistoricalSnapshots,
      "purchase_order_line_item_id",
    ),
    commercialVariancesByInvoiceId: groupBy(toRows(commercialVarianceResult.data), "supplier_invoice_id"),
    siteReviewSubmissionsByInvoiceId: groupBy(toRows(siteReviewSubmissionResult.data), "supplier_invoice_id"),
    siteReviewDecisionsByInvoiceId: groupBy(toRows(siteReviewDecisionResult.data), "supplier_invoice_id"),
    accountsApprovalsByInvoiceId: groupBy(toRows(accountsApprovalResult.data), "supplier_invoice_id"),
    activityEventsByInvoiceId: groupBy(toRows(activityEventResult.data), "supplier_invoice_id"),
    accountingDocumentsByInvoiceId: groupBy(accountingDocuments, "local_document_id"),
    accountingDocumentLinesByVersionId: groupBy(
      toRows(accountingDocumentLineResult.data),
      "version_id",
    ),
  };
}

async function loadSupplierInvoiceAllocationEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
  childCollections: Map<string, Record<string, JsonRecord[]>>;
}): Promise<SupplierInvoiceAllocationEnrichment> {
  const invoiceIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.supplier_invoice_id)));
  const invoiceLineIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.supplier_invoice_line_id)));
  const purchaseOrderIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.purchase_order_id)));
  const purchaseOrderLineIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.purchase_order_line_item_id)));
  const projectIdsFromRows = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.project_id)));
  const actualCostEventsFromChildren = Object.values(input.childCollections.get("actualCostEvents") ?? {}).flat();

  const [invoiceResult, invoiceLineResult, documentResult, matchResult, purchaseOrderResult, purchaseOrderLineResult, siblingAllocationResult] = await Promise.all([
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoices")
        .select("id,organization_id,supplier_id,invoice_number,invoice_date,due_date,status,source,subtotal,tax_total,total,notes,created_by,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceLineIds.length > 0
      ? input.admin
        .from("supplier_invoice_lines")
        .select("id,organization_id,supplier_invoice_id,project_id,description,quantity,unit_price,line_total,tax_amount,created_at,updated_at,sort_order")
        .eq("organization_id", input.organizationId)
        .in("id", invoiceLineIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_documents")
        .select("id,organization_id,supplier_invoice_id,document_type,created_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_purchase_order_matches")
        .select("id,organization_id,supplier_invoice_id,purchase_order_id,matched_amount,match_status,approval_status,approval_notes,approval_checks_json,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseOrderIds.length > 0
      ? input.admin
        .from("project_purchase_orders")
        .select("id,organization_id,project_id,purchase_order_number,purchase_order_title,status,supplier_id,issued_to_label,supplier_name_snapshot,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", purchaseOrderIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseOrderLineIds.length > 0
      ? input.admin
        .from("project_purchase_order_line_items")
        .select("id,organization_id,purchase_order_id,project_id,cost_item_id,source_cost_item_id,description,quantity,unit,rate,total,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", purchaseOrderLineIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? input.admin
        .from("supplier_invoice_line_allocations")
        .select("id,organization_id,supplier_invoice_id,supplier_invoice_line_id,purchase_order_id,purchase_order_line_item_id,project_id,allocated_amount,allocated_quantity,matched_amount,allocation_group_id,allocation_sequence,allocation_source,allocation_status,match_status,review_status,review_reason,approval_status,approval_notes,accepted_ai_suggestion,cost_item_id,source_cost_item_id,organization_cost_code_id,accounting_mapping_id,tradesstack_cost_code,tradesstack_cost_code_label,created_at,updated_at,reviewed_at,reviewed_by_user_id,approved_at,approved_by_user_id,edit_state,supersedes_allocation_id")
        .eq("organization_id", input.organizationId)
        .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  if (invoiceLineResult.error) throw new Error(invoiceLineResult.error.message);
  if (documentResult.error) throw new Error(documentResult.error.message);
  if (matchResult.error) throw new Error(matchResult.error.message);
  if (purchaseOrderResult.error) throw new Error(purchaseOrderResult.error.message);
  if (purchaseOrderLineResult.error) throw new Error(purchaseOrderLineResult.error.message);
  if (siblingAllocationResult.error) throw new Error(siblingAllocationResult.error.message);

  const invoices = toArray(invoiceResult.data as JsonRecord[] | null).map(toRecord);
  const invoiceLines = toArray(invoiceLineResult.data as JsonRecord[] | null).map(toRecord);
  const documents = toArray(documentResult.data as JsonRecord[] | null).map(toRecord);
  const matches = toArray(matchResult.data as JsonRecord[] | null).map(toRecord);
  const purchaseOrders = toArray(purchaseOrderResult.data as JsonRecord[] | null).map(toRecord);
  const purchaseOrderLines = toArray(purchaseOrderLineResult.data as JsonRecord[] | null).map(toRecord);
  const siblingAllocations = toArray(siblingAllocationResult.data as JsonRecord[] | null).map(toRecord);

  const supplierIds = uniqueNonEmpty([
    ...invoices.map((row) => toStringOrNull(row.supplier_id)),
    ...purchaseOrders.map((row) => toStringOrNull(row.supplier_id)),
  ]);
  const projectIds = uniqueNonEmpty([
    ...projectIdsFromRows,
    ...invoiceLines.map((row) => toStringOrNull(row.project_id)),
    ...purchaseOrders.map((row) => toStringOrNull(row.project_id)),
    ...purchaseOrderLines.map((row) => toStringOrNull(row.project_id)),
    ...actualCostEventsFromChildren.map((row) => toStringOrNull(row.project_id)),
  ]);

  const [supplierResult, projectResult] = await Promise.all([
    supplierIds.length > 0
      ? input.admin
        .from("organization_suppliers")
        .select("id,organization_id,name,company_name,legal_name,is_active,source,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (supplierResult.error) throw new Error(supplierResult.error.message);
  if (projectResult.error) throw new Error(projectResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const clientResult = clientIds.length > 0
    ? await input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientResult.error) throw new Error(clientResult.error.message);

  const invoiceDocumentsByInvoiceId = new Map<string, JsonRecord[]>();
  for (const document of documents) {
    const invoiceId = toStringOrNull(document.supplier_invoice_id);
    if (!invoiceId) continue;
    invoiceDocumentsByInvoiceId.set(invoiceId, [...(invoiceDocumentsByInvoiceId.get(invoiceId) ?? []), document]);
  }

  const purchaseOrderMatchesByInvoiceId = new Map<string, JsonRecord[]>();
  for (const match of matches) {
    const invoiceId = toStringOrNull(match.supplier_invoice_id);
    if (!invoiceId) continue;
    purchaseOrderMatchesByInvoiceId.set(invoiceId, [...(purchaseOrderMatchesByInvoiceId.get(invoiceId) ?? []), match]);
  }

  const siblingAllocationsByInvoiceId = new Map<string, JsonRecord[]>();
  const successorAllocationIdsByAllocationId = new Map<string, string[]>();
  for (const allocation of siblingAllocations) {
    const invoiceId = toStringOrNull(allocation.supplier_invoice_id);
    if (invoiceId) {
      siblingAllocationsByInvoiceId.set(invoiceId, [...(siblingAllocationsByInvoiceId.get(invoiceId) ?? []), allocation]);
    }
    const supersededId = toStringOrNull(allocation.supersedes_allocation_id);
    const allocationId = toStringOrNull(allocation.id);
    if (supersededId && allocationId) {
      successorAllocationIdsByAllocationId.set(supersededId, [
        ...(successorAllocationIdsByAllocationId.get(supersededId) ?? []),
        allocationId,
      ]);
    }
  }

  const actualCostEventsByAllocationId = new Map<string, JsonRecord[]>();
  for (const event of actualCostEventsFromChildren) {
    const allocationId = toStringOrNull(event.source_invoice_allocation_id)
      ?? toStringOrNull(event.supplier_invoice_line_allocation_id);
    if (!allocationId) continue;
    actualCostEventsByAllocationId.set(allocationId, [...(actualCostEventsByAllocationId.get(allocationId) ?? []), event]);
  }

  return {
    invoicesById: new Map(invoices.map((row) => [String(row.id), row])),
    invoiceLinesById: new Map(invoiceLines.map((row) => [String(row.id), row])),
    invoiceDocumentsByInvoiceId,
    purchaseOrderMatchesByInvoiceId,
    purchaseOrdersById: new Map(purchaseOrders.map((row) => [String(row.id), row])),
    purchaseOrderLinesById: new Map(purchaseOrderLines.map((row) => [String(row.id), row])),
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    suppliersById: new Map(toArray(supplierResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    siblingAllocationsByInvoiceId,
    actualCostEventsByAllocationId,
    successorAllocationIdsByAllocationId,
  };
}

async function loadProjectActualCostEventEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
}): Promise<ProjectActualCostEventEnrichment> {
  const eventIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));
  const correctionRootIds = uniqueNonEmpty(input.ownerRows.map((row) =>
    toStringOrNull(row.correction_root_event_id) ?? toStringOrNull(row.id)));
  const relatedEventIds = uniqueNonEmpty([
    ...eventIds,
    ...input.ownerRows.map((row) => toStringOrNull(row.reverses_event_id)),
    ...input.ownerRows.map((row) => toStringOrNull(row.correction_root_event_id)),
  ]);
  const allocationIds = uniqueNonEmpty([
    ...input.ownerRows.map((row) => toStringOrNull(row.source_invoice_allocation_id)),
    ...input.ownerRows.map((row) => toStringOrNull(row.supplier_invoice_line_allocation_id)),
  ]);

  const [
    allocationResult,
    invoiceResult,
    invoiceLineResult,
    purchaseOrderResult,
    purchaseOrderLineResult,
    directEventResult,
    chainEventResult,
  ] = await Promise.all([
    allocationIds.length > 0
      ? input.admin
        .from("supplier_invoice_line_allocations")
        .select("id,organization_id,supplier_invoice_id,supplier_invoice_line_id,purchase_order_id,purchase_order_line_item_id,project_id,allocated_amount,allocated_quantity,matched_amount,allocation_group_id,allocation_sequence,allocation_source,allocation_status,match_status,review_status,review_reason,approval_status,approval_notes,accepted_ai_suggestion,cost_item_id,source_cost_item_id,organization_cost_code_id,accounting_mapping_id,tradesstack_cost_code,tradesstack_cost_code_label,created_at,updated_at,reviewed_at,reviewed_by_user_id,approved_at,approved_by_user_id,edit_state,supersedes_allocation_id")
        .eq("organization_id", input.organizationId)
        .in("id", allocationIds)
      : Promise.resolve({ data: [], error: null }),
    uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.supplier_invoice_id))).length > 0
      ? input.admin
        .from("supplier_invoices")
        .select("id,organization_id,supplier_id,invoice_number,invoice_date,due_date,status,source,subtotal,tax_total,total,notes,created_by,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.supplier_invoice_id))))
      : Promise.resolve({ data: [], error: null }),
    uniqueNonEmpty([
      ...input.ownerRows.map((row) => toStringOrNull(row.supplier_invoice_line_id)),
      ...input.ownerRows.map((row) => toStringOrNull(row.source_invoice_line_id)),
    ]).length > 0
      ? input.admin
        .from("supplier_invoice_lines")
        .select("id,organization_id,supplier_invoice_id,project_id,description,quantity,unit_price,line_total,tax_amount,created_at,updated_at,sort_order")
        .eq("organization_id", input.organizationId)
        .in("id", uniqueNonEmpty([
          ...input.ownerRows.map((row) => toStringOrNull(row.supplier_invoice_line_id)),
          ...input.ownerRows.map((row) => toStringOrNull(row.source_invoice_line_id)),
        ]))
      : Promise.resolve({ data: [], error: null }),
    uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.purchase_order_id))).length > 0
      ? input.admin
        .from("project_purchase_orders")
        .select("id,organization_id,project_id,purchase_order_number,purchase_order_title,status,supplier_id,issued_to_label,supplier_name_snapshot,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.purchase_order_id))))
      : Promise.resolve({ data: [], error: null }),
    uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.purchase_order_line_item_id))).length > 0
      ? input.admin
        .from("project_purchase_order_line_items")
        .select("id,organization_id,purchase_order_id,project_id,cost_item_id,source_cost_item_id,description,quantity,unit,rate,total,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.purchase_order_line_item_id))))
      : Promise.resolve({ data: [], error: null }),
    relatedEventIds.length > 0
      ? input.admin
        .from("project_actual_cost_events")
        .select("id,organization_id,supplier_invoice_id,supplier_invoice_line_id,supplier_invoice_line_allocation_id,purchase_order_id,purchase_order_line_item_id,project_id,supplier_id,cost_item_id,source_cost_item_id,organization_cost_code_id,amount,tax_amount,total_amount,quantity,event_date,event_status,posting_source,source_invoice_line_id,source_invoice_allocation_id,source_type,source_reference,created_by_user_id,created_at,tradesstack_cost_code,tradesstack_cost_code_label,accounting_mapping_id,event_type,reverses_event_id,correction_root_event_id,reversal_reason,reversal_note")
        .eq("organization_id", input.organizationId)
        .in("id", relatedEventIds)
      : Promise.resolve({ data: [], error: null }),
    correctionRootIds.length > 0
      ? input.admin
        .from("project_actual_cost_events")
        .select("id,organization_id,supplier_invoice_id,supplier_invoice_line_id,supplier_invoice_line_allocation_id,purchase_order_id,purchase_order_line_item_id,project_id,supplier_id,cost_item_id,source_cost_item_id,organization_cost_code_id,amount,tax_amount,total_amount,quantity,event_date,event_status,posting_source,source_invoice_line_id,source_invoice_allocation_id,source_type,source_reference,created_by_user_id,created_at,tradesstack_cost_code,tradesstack_cost_code_label,accounting_mapping_id,event_type,reverses_event_id,correction_root_event_id,reversal_reason,reversal_note")
        .eq("organization_id", input.organizationId)
        .in("correction_root_event_id", correctionRootIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (allocationResult.error) throw new Error(allocationResult.error.message);
  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  if (invoiceLineResult.error) throw new Error(invoiceLineResult.error.message);
  if (purchaseOrderResult.error) throw new Error(purchaseOrderResult.error.message);
  if (purchaseOrderLineResult.error) throw new Error(purchaseOrderLineResult.error.message);
  if (directEventResult.error) throw new Error(directEventResult.error.message);
  if (chainEventResult.error) throw new Error(chainEventResult.error.message);

  const allocations = toArray(allocationResult.data as JsonRecord[] | null).map(toRecord);
  const invoices = toArray(invoiceResult.data as JsonRecord[] | null).map(toRecord);
  const invoiceLines = toArray(invoiceLineResult.data as JsonRecord[] | null).map(toRecord);
  const purchaseOrders = toArray(purchaseOrderResult.data as JsonRecord[] | null).map(toRecord);
  const purchaseOrderLines = toArray(purchaseOrderLineResult.data as JsonRecord[] | null).map(toRecord);
  const chainEvents = [
    ...toArray(directEventResult.data as JsonRecord[] | null).map(toRecord),
    ...toArray(chainEventResult.data as JsonRecord[] | null).map(toRecord),
  ];
  const dedupedEvents = new Map(chainEvents.map((event) => [String(event.id), event]));

  const supplierIds = uniqueNonEmpty([
    ...input.ownerRows.map((row) => toStringOrNull(row.supplier_id)),
    ...invoices.map((row) => toStringOrNull(row.supplier_id)),
    ...purchaseOrders.map((row) => toStringOrNull(row.supplier_id)),
  ]);
  const projectIds = uniqueNonEmpty([
    ...input.ownerRows.map((row) => toStringOrNull(row.project_id)),
    ...allocations.map((row) => toStringOrNull(row.project_id)),
    ...invoiceLines.map((row) => toStringOrNull(row.project_id)),
    ...purchaseOrders.map((row) => toStringOrNull(row.project_id)),
    ...purchaseOrderLines.map((row) => toStringOrNull(row.project_id)),
    ...Array.from(dedupedEvents.values()).map((row) => toStringOrNull(row.project_id)),
  ]);

  const [supplierResult, projectResult] = await Promise.all([
    supplierIds.length > 0
      ? input.admin
        .from("organization_suppliers")
        .select("id,organization_id,name,company_name,legal_name,is_active,source,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (supplierResult.error) throw new Error(supplierResult.error.message);
  if (projectResult.error) throw new Error(projectResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const clientResult = clientIds.length > 0
    ? await input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientResult.error) throw new Error(clientResult.error.message);

  const correctionChainEventsByRootId = new Map<string, JsonRecord[]>();
  for (const event of Array.from(dedupedEvents.values())) {
    const rootId = toStringOrNull(event.correction_root_event_id) ?? toStringOrNull(event.id);
    if (!rootId) continue;
    correctionChainEventsByRootId.set(rootId, [...(correctionChainEventsByRootId.get(rootId) ?? []), event]);
  }

  for (const [rootId, events] of correctionChainEventsByRootId.entries()) {
    correctionChainEventsByRootId.set(rootId, events.slice().sort((left, right) =>
      String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""))
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))));
  }

  return {
    allocationsById: new Map(allocations.map((row) => [String(row.id), row])),
    invoicesById: new Map(invoices.map((row) => [String(row.id), row])),
    invoiceLinesById: new Map(invoiceLines.map((row) => [String(row.id), row])),
    purchaseOrdersById: new Map(purchaseOrders.map((row) => [String(row.id), row])),
    purchaseOrderLinesById: new Map(purchaseOrderLines.map((row) => [String(row.id), row])),
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    suppliersById: new Map(toArray(supplierResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    eventsById: dedupedEvents,
    correctionChainEventsByRootId,
  };
}

async function loadOrganizationMaterialEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
  childCollections: Map<string, Record<string, JsonRecord[]>>;
}): Promise<OrganizationMaterialEnrichment> {
  const materialIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));
  const supplierPrices = Object.values(input.childCollections.get("supplierPrices") ?? {}).flat();
  const supplierIds = uniqueNonEmpty(supplierPrices.map((row) => toStringOrNull(row.supplier_id)));
  const importBatchIds = uniqueNonEmpty(supplierPrices.map((row) => toStringOrNull(row.import_batch_id)));

  const [supplierResult, supplierProductResult, importBatchResult, importRowResult] = await Promise.all([
    supplierIds.length > 0
      ? input.admin
        .from("organization_suppliers")
        .select("id,organization_id,name,company_name,legal_name,is_active,source,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    materialIds.length > 0
      ? input.admin
        .from("organization_material_supplier_products")
        .select("id,organization_id,material_id,supplier_id,is_preferred,is_active,archived_at,identity_status,supplier_sku,supplier_description,supplier_unit,pack_quantity,pack_unit")
        .eq("organization_id", input.organizationId)
        .in("material_id", materialIds)
      : Promise.resolve({ data: [], error: null }),
    importBatchIds.length > 0
      ? input.admin
        .from("organization_material_import_batches")
        .select("id,organization_id,supplier_id,uploaded_by,file_name,file_type,status,rows_extracted,rows_approved,rows_rejected,extraction_method,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", importBatchIds)
      : Promise.resolve({ data: [], error: null }),
    materialIds.length > 0
      ? input.admin
        .from("organization_material_import_rows")
        .select("id,organization_id,import_batch_id,matched_material_id,action,status,reviewed_by,reviewed_at,reviewed_name,reviewed_description,reviewed_unit,reviewed_unit_cost,reviewed_currency,reviewed_supplier_description,reviewed_supplier_sku,supplier_description,supplier_sku,classification_reason_summary,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("matched_material_id", materialIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (supplierResult.error) throw new Error(supplierResult.error.message);
  if (supplierProductResult.error) throw new Error(supplierProductResult.error.message);
  if (importBatchResult.error) throw new Error(importBatchResult.error.message);
  if (importRowResult.error) throw new Error(importRowResult.error.message);

  const importRowsByMaterialId = new Map<string, JsonRecord[]>();
  for (const row of toArray(importRowResult.data as JsonRecord[] | null).map(toRecord)) {
    const materialId = toStringOrNull(row.matched_material_id);
    if (!materialId) continue;
    importRowsByMaterialId.set(materialId, [...(importRowsByMaterialId.get(materialId) ?? []), row]);
  }

  for (const [materialId, rows] of importRowsByMaterialId.entries()) {
    importRowsByMaterialId.set(materialId, rows.slice().sort((left, right) =>
      String(left.reviewed_at ?? left.updated_at ?? left.created_at ?? "").localeCompare(
        String(right.reviewed_at ?? right.updated_at ?? right.created_at ?? ""),
      ) || String(left.id ?? "").localeCompare(String(right.id ?? ""))));
  }

  return {
    suppliersById: new Map(toArray(supplierResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    supplierProductsById: new Map(toArray(supplierProductResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    importBatchesById: new Map(toArray(importBatchResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    importRowsByMaterialId,
  };
}

async function loadMaterialImportBatchEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
  childCollections: Map<string, Record<string, JsonRecord[]>>;
}): Promise<MaterialImportBatchEnrichment> {
  const supplierIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.supplier_id)));
  const batchIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));
  const rows = Object.values(input.childCollections.get("rows") ?? {}).flat();
  const materialIds = uniqueNonEmpty(rows.map((row) => toStringOrNull(row.matched_material_id)));

  const [supplierResult, materialResult, supplierPriceResult] = await Promise.all([
    supplierIds.length > 0
      ? input.admin
        .from("organization_suppliers")
        .select("id,organization_id,name,company_name,legal_name,is_active,source,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    materialIds.length > 0
      ? input.admin
        .from("organization_materials")
        .select("id,organization_id,created_by,name,description,default_unit,category,is_active,needs_review,review_reason,organization_cost_code_id,tradesstack_cost_code,tradesstack_cost_code_label,accounting_mapping_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", materialIds)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length > 0
      ? input.admin
        .from("organization_material_supplier_prices")
        .select("id,organization_id,material_id,supplier_id,import_batch_id,supplier_sku,supplier_description,unit,unit_cost,currency,is_preferred,is_current,source,effective_from,effective_to,created_by,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("import_batch_id", batchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (supplierResult.error) throw new Error(supplierResult.error.message);
  if (materialResult.error) throw new Error(materialResult.error.message);
  if (supplierPriceResult.error) throw new Error(supplierPriceResult.error.message);

  const supplierPricesByBatchId = new Map<string, JsonRecord[]>();
  for (const row of toArray(supplierPriceResult.data as JsonRecord[] | null).map(toRecord)) {
    const batchId = toStringOrNull(row.import_batch_id);
    if (!batchId) continue;
    supplierPricesByBatchId.set(batchId, [...(supplierPricesByBatchId.get(batchId) ?? []), row]);
  }

  for (const [batchId, supplierPrices] of supplierPricesByBatchId.entries()) {
    supplierPricesByBatchId.set(batchId, supplierPrices.slice().sort((left, right) =>
      String(left.updated_at ?? left.created_at ?? "").localeCompare(String(right.updated_at ?? right.created_at ?? ""))
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))));
  }

  return {
    suppliersById: new Map(toArray(supplierResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    materialsById: new Map(toArray(materialResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    supplierPricesByBatchId,
  };
}

async function loadProjectClaimEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
  childCollections: Map<string, Record<string, JsonRecord[]>>;
}): Promise<ProjectClaimEnrichment> {
  const projectIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.project_id)));
  const claimIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));
  const lineItems = Object.values(input.childCollections.get("lineItems") ?? {}).flat();
  const quoteIds = uniqueNonEmpty(lineItems
    .filter((line) => (toStringOrNull(line.source_kind)?.toLowerCase() ?? "") === "quote")
    .map((line) => toStringOrNull(line.source_document_id)));
  const quoteLineIds = uniqueNonEmpty(lineItems
    .filter((line) => (toStringOrNull(line.source_kind)?.toLowerCase() ?? "") === "quote")
    .map((line) => toStringOrNull(line.source_line_item_id)));
  const variationIds = uniqueNonEmpty(lineItems
    .filter((line) => (toStringOrNull(line.source_kind)?.toLowerCase() ?? "") === "variation")
    .map((line) => toStringOrNull(line.source_document_id)));
  const variationLineIds = uniqueNonEmpty(lineItems
    .filter((line) => (toStringOrNull(line.source_kind)?.toLowerCase() ?? "") === "variation")
    .map((line) => toStringOrNull(line.source_line_item_id)));
  const costItemIds = uniqueNonEmpty(lineItems.flatMap((line) => [
    toStringOrNull(line.cost_item_id),
    toStringOrNull(line.source_cost_item_id),
  ]));

  const [
    projectResult,
    quoteResult,
    quoteLineResult,
    variationResult,
    variationLineResult,
    costItemResult,
    mirroredCostItemResult,
  ] = await Promise.all([
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length > 0
      ? input.admin
        .from("project_quotes")
        .select("id,organization_id,project_id,quote_number,quote_title,status,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", quoteIds)
      : Promise.resolve({ data: [], error: null }),
    quoteLineIds.length > 0
      ? input.admin
        .from("project_quote_line_items")
        .select("id,organization_id,quote_id,project_id,section,description,quantity,unit,rate,total,is_optional,sort_order,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", quoteLineIds)
      : Promise.resolve({ data: [], error: null }),
    variationIds.length > 0
      ? input.admin
        .from("project_variations")
        .select("id,organization_id,project_id,variation_number,variation_title,status,total_variation_price,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", variationIds)
      : Promise.resolve({ data: [], error: null }),
    variationLineIds.length > 0
      ? input.admin
        .from("project_variation_line_items")
        .select("id,organization_id,variation_id,project_id,section,description,quantity,unit,rate,total,sort_order,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", variationLineIds)
      : Promise.resolve({ data: [], error: null }),
    costItemIds.length > 0
      ? input.admin
        .from("cost_items")
        .select("id,organization_id,project_id,source_document_kind,source_document_id,source_line_id,source_line_table,tradesstack_cost_code,tradesstack_cost_code_label,accounting_mapping_id")
        .eq("organization_id", input.organizationId)
        .in("id", costItemIds)
      : Promise.resolve({ data: [], error: null }),
    claimIds.length > 0
      ? input.admin
        .from("cost_items")
        .select("id,organization_id,project_id,source_document_kind,source_document_id,source_line_id,source_line_table,tradesstack_cost_code,tradesstack_cost_code_label,accounting_mapping_id")
        .eq("organization_id", input.organizationId)
        .eq("source_document_kind", "project_claim")
        .in("source_document_id", claimIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectResult.error) throw new Error(projectResult.error.message);
  if (quoteResult.error) throw new Error(quoteResult.error.message);
  if (quoteLineResult.error) throw new Error(quoteLineResult.error.message);
  if (variationResult.error) throw new Error(variationResult.error.message);
  if (variationLineResult.error) throw new Error(variationLineResult.error.message);
  if (costItemResult.error) throw new Error(costItemResult.error.message);
  if (mirroredCostItemResult.error) throw new Error(mirroredCostItemResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const clientResult = clientIds.length > 0
    ? await input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientResult.error) throw new Error(clientResult.error.message);

  const mirroredCostItemsByClaimId = new Map<string, JsonRecord[]>();
  for (const costItem of toArray(mirroredCostItemResult.data as JsonRecord[] | null).map(toRecord)) {
    const claimId = toStringOrNull(costItem.source_document_id);
    if (!claimId) continue;
    mirroredCostItemsByClaimId.set(claimId, [...(mirroredCostItemsByClaimId.get(claimId) ?? []), costItem]);
  }

  return {
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    quotesById: new Map(toArray(quoteResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    quoteLinesById: new Map(toArray(quoteLineResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    variationsById: new Map(toArray(variationResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    variationLinesById: new Map(toArray(variationLineResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    costItemsById: new Map(toArray(costItemResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    mirroredCostItemsByClaimId,
  };
}

async function loadProjectTimeSheetEntryEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
  reviewWindow: UniversalLearningReviewWindow;
}): Promise<ProjectTimeSheetEntryEnrichment> {
  const entryIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));
  const projectIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.project_id)));
  const purchaseOrderIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.purchase_order_id)));
  const workerIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.worker_user_id)));

  const [
    projectResult,
    purchaseOrderResult,
    purchaseOrderLineResult,
    reviewWindowEntryResult,
  ] = await Promise.all([
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseOrderIds.length > 0
      ? input.admin
        .from("project_purchase_orders")
        .select("id,organization_id,project_id,purchase_order_number,purchase_order_title,status,supplier_id,issued_to_label,supplier_name_snapshot,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", purchaseOrderIds)
      : Promise.resolve({ data: [], error: null }),
    entryIds.length > 0
      ? input.admin
        .from("project_purchase_order_line_items")
        .select("id,organization_id,purchase_order_id,project_id,cost_item_id,source_cost_item_id,description,quantity,unit,rate,total,section,source_time_sheet_entry_id,updated_at")
        .eq("organization_id", input.organizationId)
        .in("source_time_sheet_entry_id", entryIds)
      : Promise.resolve({ data: [], error: null }),
    workerIds.length > 0
      ? input.admin
        .from("project_time_sheet_entries")
        .select("id,organization_id,project_id,worker_user_id,purchase_order_id,clock_in_at,clock_out_at,total_hours,warning_8h5_at,auto_clocked_out,source")
        .eq("organization_id", input.organizationId)
        .in("worker_user_id", workerIds)
        .gte("clock_in_at", input.reviewWindow.start)
        .lt("clock_in_at", input.reviewWindow.end)
        .order("clock_in_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectResult.error) throw new Error(projectResult.error.message);
  if (purchaseOrderResult.error) throw new Error(purchaseOrderResult.error.message);
  if (purchaseOrderLineResult.error) throw new Error(purchaseOrderLineResult.error.message);
  if (reviewWindowEntryResult.error) throw new Error(reviewWindowEntryResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const clientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const costItemIds = uniqueNonEmpty(toArray(purchaseOrderLineResult.data as JsonRecord[] | null).map(toRecord).flatMap((row) => [
    toStringOrNull(row.cost_item_id),
    toStringOrNull(row.source_cost_item_id),
  ]));

  const clientPromise = clientIds.length > 0
    ? input.admin
      .from("organization_clients")
      .select("id,organization_id,name,company_name,client_type,client_status,created_at,updated_at")
      .eq("organization_id", input.organizationId)
      .in("id", clientIds)
    : Promise.resolve({ data: [], error: null });
  const costItemPromise = costItemIds.length > 0
    ? (async () => {
      const baseSelect = "id,organization_id,project_id,source_document_kind,source_document_id,source_line_id,source_line_table,tradesstack_cost_code,tradesstack_cost_code_label,accounting_mapping_id";
      const preferredResult = await input.admin
        .from("cost_items")
        .select(`${baseSelect},organization_cost_code_id`)
        .eq("organization_id", input.organizationId)
        .in("id", costItemIds);

      if (
        preferredResult.error
        && preferredResult.error.message.includes("organization_cost_code_id")
        && preferredResult.error.message.includes("does not exist")
      ) {
        return input.admin
          .from("cost_items")
          .select(baseSelect)
          .eq("organization_id", input.organizationId)
          .in("id", costItemIds);
      }

      return preferredResult;
    })()
    : Promise.resolve({ data: [], error: null });

  const [clientResult, costItemResult] = await Promise.all([
    clientPromise,
    costItemPromise,
  ]);

  if (clientResult.error) throw new Error(clientResult.error.message);
  if (costItemResult.error) throw new Error(costItemResult.error.message);

  const purchaseOrderLinesByEntryId = new Map<string, JsonRecord[]>();
  for (const row of toArray(purchaseOrderLineResult.data as JsonRecord[] | null).map(toRecord)) {
    const entryId = toStringOrNull(row.source_time_sheet_entry_id);
    if (!entryId) continue;
    purchaseOrderLinesByEntryId.set(entryId, [...(purchaseOrderLinesByEntryId.get(entryId) ?? []), row]);
  }

  const reviewWindowEntriesByWorkerId = new Map<string, JsonRecord[]>();
  for (const row of toArray(reviewWindowEntryResult.data as JsonRecord[] | null).map(toRecord)) {
    const workerId = toStringOrNull(row.worker_user_id);
    if (!workerId) continue;
    reviewWindowEntriesByWorkerId.set(workerId, [...(reviewWindowEntriesByWorkerId.get(workerId) ?? []), row]);
  }

  return {
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    purchaseOrdersById: new Map(toArray(purchaseOrderResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    purchaseOrderLinesByEntryId,
    costItemsById: new Map(toArray(costItemResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    reviewWindowEntriesByWorkerId,
  };
}

async function loadTaskEnrichment(input: {
  admin: DynamicSupabaseAdminClient;
  organizationId: string;
  ownerRows: JsonRecord[];
}): Promise<TaskEnrichment> {
  const projectIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.project_id)));
  const opportunityIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.opportunity_id)));
  const issueIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.linked_issue_id)));
  const inspectionIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.linked_inspection_id)));
  const inspectionItemIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.linked_inspection_item_id)));
  const purchaseOrderIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.linked_purchase_order_id)));
  const variationIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.linked_variation_id)));
  const quoteIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.linked_quote_id)));
  const taskIds = uniqueNonEmpty(input.ownerRows.map((row) => toStringOrNull(row.id)));

  const [
    projectResult,
    opportunityResult,
    qualityIssueResult,
    inspectionResult,
    inspectionItemResult,
    purchaseOrderResult,
    variationResult,
    quoteResult,
    legacyAttachmentResult,
  ] = await Promise.all([
    projectIds.length > 0
      ? input.admin
        .from("organization_projects")
        .select("id,organization_id,name,project_code,stage,location,client_id,source_opportunity_id,created_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length > 0
      ? input.admin
        .from("organization_opportunities")
        .select("id,organization_id,client_id,name,opportunity_code,stage,location,workspace_project_id,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", opportunityIds)
      : Promise.resolve({ data: [], error: null }),
    issueIds.length > 0
      ? input.admin
        .from("project_quality_issues")
        .select("id,organization_id,project_id,title,status,priority,trade,location,area,due_date,closed_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", issueIds)
      : Promise.resolve({ data: [], error: null }),
    inspectionIds.length > 0
      ? input.admin
        .from("project_quality_inspections")
        .select("id,organization_id,project_id,title,trade,location,due_date,scheduled_at,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", inspectionIds)
      : Promise.resolve({ data: [], error: null }),
    inspectionItemIds.length > 0
      ? input.admin
        .from("project_quality_inspection_items")
        .select("id,organization_id,project_id,inspection_id,label,status,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", inspectionItemIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseOrderIds.length > 0
      ? input.admin
        .from("project_purchase_orders")
        .select("id,organization_id,project_id,purchase_order_number,purchase_order_title,status,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", purchaseOrderIds)
      : Promise.resolve({ data: [], error: null }),
    variationIds.length > 0
      ? input.admin
        .from("project_variations")
        .select("id,organization_id,project_id,variation_number,variation_title,status,total_variation_price,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", variationIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length > 0
      ? input.admin
        .from("project_quotes")
        .select("id,organization_id,project_id,quote_number,quote_title,status,total_quote_price,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", quoteIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length > 0
      ? input.admin
        .from("project_job_todo_attachments")
        .select("id,organization_id,project_id,todo_id,file_name,mime_type,file_size_bytes,created_at")
        .eq("organization_id", input.organizationId)
        .in("todo_id", taskIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectResult.error) throw new Error(projectResult.error.message);
  if (opportunityResult.error) throw new Error(opportunityResult.error.message);
  if (qualityIssueResult.error) throw new Error(qualityIssueResult.error.message);
  if (inspectionResult.error) throw new Error(inspectionResult.error.message);
  if (inspectionItemResult.error) throw new Error(inspectionItemResult.error.message);
  if (purchaseOrderResult.error) throw new Error(purchaseOrderResult.error.message);
  if (variationResult.error) throw new Error(variationResult.error.message);
  if (quoteResult.error) throw new Error(quoteResult.error.message);
  if (legacyAttachmentResult.error) throw new Error(legacyAttachmentResult.error.message);

  const projects = toArray(projectResult.data as JsonRecord[] | null).map(toRecord);
  const projectOpportunityIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.source_opportunity_id)));
  const projectClientIds = uniqueNonEmpty(projects.map((project) => toStringOrNull(project.client_id)));
  const opportunityRows = toArray(opportunityResult.data as JsonRecord[] | null).map(toRecord);
  const opportunityClientIds = uniqueNonEmpty(opportunityRows.map((opportunity) => toStringOrNull(opportunity.client_id)));
  const clientIds = uniqueNonEmpty([...projectClientIds, ...opportunityClientIds]);

  const [projectOpportunityResult, clientResult] = await Promise.all([
    projectOpportunityIds.length > 0
      ? input.admin
        .from("organization_opportunities")
        .select("id,organization_id,client_id,name,opportunity_code,stage,location,workspace_project_id,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", projectOpportunityIds)
      : Promise.resolve({ data: [], error: null }),
    clientIds.length > 0
      ? input.admin
        .from("organization_clients")
        .select("id,organization_id,name,company_name,client_type,client_status,updated_at")
        .eq("organization_id", input.organizationId)
        .in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectOpportunityResult.error) throw new Error(projectOpportunityResult.error.message);
  if (clientResult.error) throw new Error(clientResult.error.message);

  const opportunities = [
    ...opportunityRows,
    ...toArray(projectOpportunityResult.data as JsonRecord[] | null).map(toRecord),
  ];

  const legacyAttachmentsByTaskId = new Map<string, JsonRecord[]>();
  for (const row of toArray(legacyAttachmentResult.data as JsonRecord[] | null).map(toRecord)) {
    const taskId = toStringOrNull(row.todo_id);
    if (!taskId) continue;
    legacyAttachmentsByTaskId.set(taskId, [...(legacyAttachmentsByTaskId.get(taskId) ?? []), row]);
  }

  return {
    projectsById: new Map(projects.map((row) => [String(row.id), row])),
    clientsById: new Map(toArray(clientResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    opportunitiesById: new Map(opportunities.map((row) => [String(row.id), row])),
    qualityIssuesById: new Map(toArray(qualityIssueResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    inspectionsById: new Map(toArray(inspectionResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    inspectionItemsById: new Map(toArray(inspectionItemResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    purchaseOrdersById: new Map(toArray(purchaseOrderResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    variationsById: new Map(toArray(variationResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    quotesById: new Map(toArray(quoteResult.data as JsonRecord[] | null).map(toRecord).map((row) => [String(row.id), row])),
    legacyAttachmentsByTaskId,
  };
}

function normalizeUnifiedQuoteOwnerRow(row: JsonRecord, source: QuoteSourceConfig): UnifiedQuoteOwnerRow | null {
  const id = toStringOrNull(row.id);
  const organizationId = toStringOrNull(row.organization_id);
  if (!id || !organizationId) {
    return null;
  }

  const sourceOpportunityId = source.sourceTable === "opportunity_quotes"
    ? toStringOrNull(row.opportunity_id)
    : toStringOrNull(row.source_opportunity_id);
  const projectId = source.sourceTable === "project_quotes"
    ? toStringOrNull(row.project_id)
    : null;

  return {
    ...row,
    id,
    organization_id: organizationId,
    project_id: projectId,
    source_opportunity_id: sourceOpportunityId,
    source_opportunity_quote_id:
      source.sourceTable === "opportunity_quotes"
        ? id
        : toStringOrNull(row.source_opportunity_quote_id),
    source_opportunity_quote_number:
      source.sourceTable === "opportunity_quotes"
        ? toStringOrNull(row.quote_number)
        : toStringOrNull(row.source_opportunity_quote_number),
    __sourceTable: source.sourceTable,
    __lineTable: source.lineTable,
    __sourceWorkflow: source.sourceWorkflow,
    __sourceModule: source.sourceModule,
    __quoteSourceType: source.quoteSourceType,
  };
}

function normalizeUnifiedQuoteLineRow(input: {
  line: JsonRecord;
  owner: UnifiedQuoteOwnerRow;
}): UnifiedQuoteLineRow | null {
  const id = toStringOrNull(input.line.id);
  const organizationId = toStringOrNull(input.line.organization_id);
  const quoteId = toStringOrNull(input.line.quote_id);
  if (!id || !organizationId || !quoteId) {
    return null;
  }

  return {
    ...input.line,
    id,
    organization_id: organizationId,
    quote_id: quoteId,
    source_opportunity_quote_id:
      toStringOrNull(input.line.source_opportunity_quote_id)
      ?? toStringOrNull(input.owner.source_opportunity_quote_id),
    source_opportunity_quote_line_item_id: toStringOrNull(input.line.source_opportunity_quote_line_item_id),
    source_opportunity_quote_number:
      toStringOrNull(input.line.source_opportunity_quote_number)
      ?? toStringOrNull(input.owner.source_opportunity_quote_number),
  };
}

function getUnifiedQuoteBusinessKey(row: UnifiedQuoteOwnerRow) {
  if (row.__sourceTable === "project_quotes" && typeof row.source_opportunity_quote_id === "string" && row.source_opportunity_quote_id.length > 0) {
    return `opportunity:${row.source_opportunity_quote_id}`;
  }
  if (row.__sourceTable === "opportunity_quotes") {
    return `opportunity:${row.id}`;
  }
  return `project:${row.id}`;
}

function compareUnifiedQuoteRecordKey(
  left: { updatedAt: string | null; sourceTable: string; sourceId: string | null },
  right: { updatedAt: string | null; sourceTable: string; sourceId: string | null },
) {
  const updatedComparison = toCursorComparable(left.updatedAt).localeCompare(toCursorComparable(right.updatedAt));
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  const tableComparison = left.sourceTable.localeCompare(right.sourceTable);
  if (tableComparison !== 0) {
    return tableComparison;
  }
  return toCursorComparable(left.sourceId).localeCompare(toCursorComparable(right.sourceId));
}

function compareUnifiedQuoteCursor(
  left: { updatedAt: string | null; sourceTable: string; sourceId: string | null },
  right: UniversalLearningCursor,
) {
  const parsed = parseQuoteCursorKey(right.id);
  return compareUnifiedQuoteRecordKey(left, {
    updatedAt: right.updatedAt,
    sourceTable: parsed?.sourceTable ?? "",
    sourceId: parsed?.sourceId ?? right.id,
  });
}

function getUnifiedQuoteRecordChangeCursor(input: {
  row: UnifiedQuoteOwnerRow;
  lineItems: UnifiedQuoteLineRow[];
}) {
  let latest = {
    updatedAt: toIsoOrNull(input.row.updated_at ?? input.row.created_at),
    sourceTable: input.row.__sourceTable,
    sourceId: input.row.id,
  };

  for (const line of input.lineItems) {
    const candidate = {
      updatedAt: toIsoOrNull(line.updated_at ?? line.created_at),
      sourceTable: input.row.__sourceTable,
      sourceId: input.row.id,
    };
    if (compareUnifiedQuoteRecordKey(candidate, latest) > 0) {
      latest = candidate;
    }
  }

  return {
    updatedAt: latest.updatedAt,
    id: buildQuoteSourceKey(latest.sourceTable, latest.sourceId),
  };
}

function buildSupplierDisplayContext(row: JsonRecord, enrichment: ProjectPurchaseOrderEnrichment) {
  const supplierId = toStringOrNull(row.supplier_id);
  const supplier = supplierId ? enrichment.suppliersById.get(supplierId) ?? null : null;
  const supplierName = toStringOrNull(supplier?.company_name)
    ?? toStringOrNull(supplier?.name)
    ?? toStringOrNull(supplier?.legal_name)
    ?? toStringOrNull(row.supplier_name_snapshot)
    ?? toStringOrNull(row.issued_to_label);

  return {
    supplierId,
    supplierName,
    supplierDisplayName: supplierName,
    issuedToLabel: toStringOrNull(row.issued_to_label),
    supplierNameSnapshot: toStringOrNull(row.supplier_name_snapshot),
  };
}

function buildProjectDisplayContext(row: JsonRecord, enrichment: ProjectPurchaseOrderEnrichment) {
  const projectId = toStringOrNull(row.project_id);
  const project = projectId ? enrichment.projectsById.get(projectId) ?? null : null;
  const clientId = toStringOrNull(project?.client_id);
  const client = clientId ? enrichment.clientsById.get(clientId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    projectType: null,
    clientId,
    clientName:
      toStringOrNull(client?.company_name)
      ?? toStringOrNull(client?.name),
  };
}

function buildProjectQuoteProjectContext(row: JsonRecord, enrichment: ProjectQuoteEnrichment) {
  const projectId = toStringOrNull(row.project_id);
  const project = projectId ? enrichment.projectsById.get(projectId) ?? null : null;
  const opportunityId = toStringOrNull(row.source_opportunity_id);
  const opportunity = opportunityId ? enrichment.opportunitiesById.get(opportunityId) ?? null : null;
  return {
    projectId: projectId ?? toStringOrNull(opportunity?.converted_project_id) ?? toStringOrNull(opportunity?.workspace_project_id),
    projectName: toStringOrNull(project?.name) ?? toStringOrNull(row.project_name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    siteAddress: toStringOrNull(project?.location) ?? toStringOrNull(row.site_address),
    clientId: toStringOrNull(project?.client_id),
  };
}

function buildProjectQuoteOpportunityContext(row: JsonRecord, enrichment: ProjectQuoteEnrichment) {
  const opportunityId = toStringOrNull(row.source_opportunity_id);
  const opportunity = opportunityId ? enrichment.opportunitiesById.get(opportunityId) ?? null : null;
  return {
    opportunityId,
    opportunityName: toStringOrNull(opportunity?.name),
    opportunityCode: toStringOrNull(opportunity?.opportunity_code),
    opportunityStage: toStringOrNull(opportunity?.stage),
    opportunityEstimatedValue: typeof opportunity?.estimated_value === "number" ? opportunity.estimated_value : null,
    opportunityClientId: toStringOrNull(opportunity?.client_id),
    sourceOpportunityQuoteId: toStringOrNull(row.source_opportunity_quote_id),
    sourceOpportunityQuoteNumber: toStringOrNull(row.source_opportunity_quote_number),
  };
}

function buildProjectQuoteClientContext(input: {
  row: JsonRecord;
  enrichment: ProjectQuoteEnrichment;
  projectContext: ReturnType<typeof buildProjectQuoteProjectContext>;
  opportunityContext: ReturnType<typeof buildProjectQuoteOpportunityContext>;
}) {
  const clientId = input.projectContext.clientId ?? input.opportunityContext.opportunityClientId ?? null;
  const client = clientId ? input.enrichment.clientsById.get(clientId) ?? null : null;
  return {
    clientId,
    clientName:
      toStringOrNull(client?.company_name)
      ?? toStringOrNull(client?.name)
      ?? toStringOrNull(input.row.company_name)
      ?? toStringOrNull(input.row.client_name),
    clientCompanyName:
      toStringOrNull(client?.company_name)
      ?? toStringOrNull(input.row.company_name),
    clientContactName:
      toStringOrNull(input.row.contact_person)
      ?? toStringOrNull(input.row.client_name),
    clientEmail: toStringOrNull(input.row.client_email) ?? toStringOrNull(client?.email),
    clientPhone: toStringOrNull(input.row.client_phone) ?? toStringOrNull(client?.phone),
    clientType: toStringOrNull(client?.client_type),
    clientStatus: toStringOrNull(client?.client_status),
    defaultMarginPercent: typeof client?.default_margin_percent === "number" ? client.default_margin_percent : null,
  };
}

function buildProjectTimeSheetEntryProjectContext(row: JsonRecord, enrichment: ProjectTimeSheetEntryEnrichment) {
  const projectId = toStringOrNull(row.project_id);
  const project = projectId ? enrichment.projectsById.get(projectId) ?? null : null;
  const clientId = toStringOrNull(project?.client_id);
  const client = clientId ? enrichment.clientsById.get(clientId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    clientId,
    clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
  };
}

function buildProjectTimeSheetEntryPurchaseOrderContext(row: JsonRecord, enrichment: ProjectTimeSheetEntryEnrichment) {
  const purchaseOrderId = toStringOrNull(row.purchase_order_id);
  const purchaseOrder = purchaseOrderId ? enrichment.purchaseOrdersById.get(purchaseOrderId) ?? null : null;

  return {
    purchaseOrderId,
    purchaseOrderNumber: toStringOrNull(purchaseOrder?.purchase_order_number) ?? toStringOrNull(row.purchase_order_number),
    purchaseOrderTitle: toStringOrNull(purchaseOrder?.purchase_order_title) ?? toStringOrNull(row.purchase_order_title),
    purchaseOrderStatus: toStringOrNull(purchaseOrder?.status),
  };
}

function buildPricingWorkbookSheetProjectContext(row: JsonRecord, enrichment: PricingWorkbookSheetEnrichment) {
  const opportunityId = toStringOrNull(row.opportunity_id);
  const opportunity = opportunityId ? enrichment.opportunitiesById.get(opportunityId) ?? null : null;
  const projectId = resolveDeterministicOpportunityProjectId(opportunity);
  const project = projectId ? enrichment.projectsById.get(projectId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    opportunityId,
    opportunityName: toStringOrNull(opportunity?.name),
    opportunityCode: toStringOrNull(opportunity?.opportunity_code),
    opportunityStage: toStringOrNull(opportunity?.stage),
  };
}

function buildPricingWorkbookSheetClientContext(input: {
  row: JsonRecord;
  enrichment: PricingWorkbookSheetEnrichment;
  projectContext: ReturnType<typeof buildPricingWorkbookSheetProjectContext>;
}) {
  const opportunityId = toStringOrNull(input.row.opportunity_id);
  const opportunity = opportunityId ? input.enrichment.opportunitiesById.get(opportunityId) ?? null : null;
  const project = input.projectContext.projectId
    ? input.enrichment.projectsById.get(input.projectContext.projectId) ?? null
    : null;
  const projectClientId = toStringOrNull(project?.client_id);
  const opportunityClientId = toStringOrNull(opportunity?.client_id);
  const clientId =
    projectClientId && opportunityClientId && projectClientId !== opportunityClientId
      ? null
      : projectClientId ?? opportunityClientId;
  const client = clientId ? input.enrichment.clientsById.get(clientId) ?? null : null;

  return {
    clientId,
    clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
    clientCompanyName: toStringOrNull(client?.company_name),
    clientStatus: toStringOrNull(client?.client_status),
  };
}

function buildPricingWorkbookSheetWorkbookContext(row: JsonRecord, enrichment: PricingWorkbookSheetEnrichment) {
  const workbookId = toStringOrNull(row.workbook_id);
  const workbook = workbookId ? enrichment.workbooksById.get(workbookId) ?? null : null;

  return {
    workbookId,
    workbookName: toStringOrNull(workbook?.name),
    tradePackage: toStringOrNull(workbook?.trade_package),
    workbookArchivedAt: toIsoOrNull(workbook?.archived_at),
    workbookVersion: typeof workbook?.version === "number" ? workbook.version : null,
    workbookCreatedAt: toIsoOrNull(workbook?.created_at),
    workbookUpdatedAt: toIsoOrNull(workbook?.updated_at),
    workbookCreatedBy: toStringOrNull(workbook?.created_by),
    workbookUpdatedBy: toStringOrNull(workbook?.updated_by),
    lastActiveSheetId: toStringOrNull(workbook?.last_active_sheet_id),
  };
}

function summarizeWorksheetCellValue(cell: WorksheetCell) {
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return cell.value;
  }
  if (typeof cell.computedValue === "number" && Number.isFinite(cell.computedValue)) {
    return cell.computedValue;
  }
  if (typeof cell.displayValue === "string" && cell.displayValue.trim()) {
    return cell.displayValue.trim();
  }
  if (typeof cell.value === "string" && cell.value.trim()) {
    return cell.value.trim();
  }
  if (typeof cell.computedValue === "string" && cell.computedValue.trim()) {
    return cell.computedValue.trim();
  }
  return null;
}

function sanitizeWorksheetText(value: string | null) {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function summarizeWorksheetLineItem(item: unknown) {
  const record = toRecord(item);
  return pruneEmptyObject({
    name: toStringOrNull(record.name),
    title: toStringOrNull(record.title),
    description: toStringOrNull(record.description),
    unit: toStringOrNull(record.unit),
    quantity: typeof record.quantity === "number" ? record.quantity : null,
    rate: typeof record.rate === "number" ? record.rate : typeof record.unitRate === "number" ? record.unitRate : null,
    total: typeof record.total === "number" ? record.total : typeof record.amount === "number" ? record.amount : null,
    trade: toStringOrNull(record.trade),
    category: toStringOrNull(record.category),
  });
}

function summarizeWorksheetRecord(value: unknown) {
  const record = toRecord(value);
  const entries = Object.entries(record)
    .filter(([, child]) =>
      typeof child === "string"
      || typeof child === "number"
      || typeof child === "boolean"
      || child === null,
    )
    .slice(0, 12);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function buildPricingWorkbookSheetSummary(input: {
  row: JsonRecord;
  workbookContext: ReturnType<typeof buildPricingWorkbookSheetWorkbookContext>;
  projectContext: ReturnType<typeof buildPricingWorkbookSheetProjectContext>;
  clientContext: ReturnType<typeof buildPricingWorkbookSheetClientContext>;
}) {
  const rawWorksheetRecord = toRecord(input.row.worksheet_data);
  const worksheet = normalizeWorksheetData(input.row.worksheet_data);
  const declaredRowCount =
    typeof rawWorksheetRecord.rowCount === "number" && Number.isFinite(rawWorksheetRecord.rowCount)
      ? rawWorksheetRecord.rowCount
      : Array.isArray(rawWorksheetRecord.rows)
        ? rawWorksheetRecord.rows.length
        : worksheet.rowCount;
  const declaredColumnCount =
    typeof rawWorksheetRecord.columnCount === "number" && Number.isFinite(rawWorksheetRecord.columnCount)
      ? rawWorksheetRecord.columnCount
      : Array.isArray(rawWorksheetRecord.columns)
        ? rawWorksheetRecord.columns.length
        : worksheet.columnCount;
  const nonEmptyCells = Object.entries(worksheet.cells)
    .map(([cellAddress, rawCell]) => {
      const cell = rawCell as WorksheetCell | undefined;
      if (!cell) return null;
      const summarizedValue = summarizeWorksheetCellValue(cell);
      if (summarizedValue === null || summarizedValue === "") return null;
      const match = cellAddress.match(/^([A-Z]+)(.+)$/);
      const columnId = match?.[1] ?? null;
      const rowId = match?.[2] ?? null;
      const column = columnId ? worksheet.columns.find((entry) => entry.id === columnId) ?? null : null;
      const rowMeta = rowId ? worksheet.rows.find((entry) => entry.id === rowId) ?? null : null;

      return {
        cellAddress,
        columnId,
        rowId,
        columnLabel: column?.label ?? columnId,
        columnIndex: column?.index ?? null,
        rowIndex: rowMeta?.index ?? null,
        value: summarizedValue,
        formula: typeof cell.formula === "string" && cell.formula.trim() ? cell.formula.trim() : null,
        valueType: cell.type,
      };
    })
    .filter((cell): cell is NonNullable<typeof cell> => Boolean(cell))
    .sort((left, right) => {
      const rowComparison = (left.rowIndex ?? Number.MAX_SAFE_INTEGER) - (right.rowIndex ?? Number.MAX_SAFE_INTEGER);
      if (rowComparison !== 0) return rowComparison;
      return (left.columnIndex ?? Number.MAX_SAFE_INTEGER) - (right.columnIndex ?? Number.MAX_SAFE_INTEGER);
    });

  const rowMap = new Map<string, typeof nonEmptyCells>();
  for (const cell of nonEmptyCells) {
    const rowKey = cell.rowId ?? cell.cellAddress;
    rowMap.set(rowKey, [...(rowMap.get(rowKey) ?? []), cell]);
  }

  const retainedRows = Array.from(rowMap.entries())
    .map(([rowId, cells]) => {
      const textValues = cells
        .map((cell) => (typeof cell.value === "string" ? cell.value : null))
        .filter((value): value is string => Boolean(value));
      const rowLabel = sanitizeWorksheetText(textValues[0] ?? null);
      return {
        rowId,
        rowIndex: cells[0]?.rowIndex ?? null,
        rowLabel,
        populatedCellCount: cells.length,
        formulaCellCount: cells.filter((cell) => Boolean(cell.formula)).length,
        visibleCells: cells.slice(0, 8).map((cell) => pruneEmptyObject({
          cell: cell.cellAddress,
          columnId: cell.columnId,
          columnLabel: cell.columnLabel,
          value: cell.value,
          formula: cell.formula,
        })),
      };
    })
    .filter((row) => row.visibleCells.length > 0)
    .slice(0, 60);

  const formulaSamples = nonEmptyCells
    .filter((cell) => Boolean(cell.formula))
    .slice(0, 20)
    .map((cell) => pruneEmptyObject({
      cell: cell.cellAddress,
      columnLabel: cell.columnLabel,
      rowIndex: cell.rowIndex,
      formula: cell.formula,
      value: typeof cell.value === "number" ? cell.value : sanitizeWorksheetText(typeof cell.value === "string" ? cell.value : null),
    }));

  const classificationBuckets = {
    quantity: [] as Array<Record<string, unknown>>,
    rate: [] as Array<Record<string, unknown>>,
    markup: [] as Array<Record<string, unknown>>,
    margin: [] as Array<Record<string, unknown>>,
    wastage: [] as Array<Record<string, unknown>>,
    contingency: [] as Array<Record<string, unknown>>,
    allowance: [] as Array<Record<string, unknown>>,
    labour: [] as Array<Record<string, unknown>>,
    material: [] as Array<Record<string, unknown>>,
    plant: [] as Array<Record<string, unknown>>,
    subcontract: [] as Array<Record<string, unknown>>,
    assumption: [] as Array<Record<string, unknown>>,
    inclusion: [] as Array<Record<string, unknown>>,
    exclusion: [] as Array<Record<string, unknown>>,
    note: [] as Array<Record<string, unknown>>,
  };

  for (const row of retainedRows) {
    const combinedText = [
      row.rowLabel,
      ...row.visibleCells.map((cell) => sanitizeWorksheetText(typeof cell?.value === "string" ? cell.value : null)),
      input.workbookContext.tradePackage,
      input.workbookContext.workbookName,
      toStringOrNull(input.row.name),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase();

    const numericValues = row.visibleCells
      .map((cell) => (typeof cell?.value === "number" ? cell.value : null))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const candidate = pruneEmptyObject({
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      rowLabel: row.rowLabel,
      sampleValues: numericValues.slice(0, 3),
      formulaCellCount: row.formulaCellCount,
    });
    if (!candidate) continue;

    const classify = (bucket: keyof typeof classificationBuckets, pattern: RegExp) => {
      if (pattern.test(combinedText) && classificationBuckets[bucket].length < 12) {
        classificationBuckets[bucket].push(candidate);
      }
    };

    classify("quantity", /\bqty\b|\bquantity\b|\bm2\b|\bm3\b|\blinear\b|\blm\b/);
    classify("rate", /\brate\b|\bunit price\b|\bunit rate\b|\bprice\b/);
    classify("markup", /\bmarkup\b|\bmark up\b/);
    classify("margin", /\bmargin\b/);
    classify("wastage", /\bwastage\b|\bwaste\b|\boverage\b/);
    classify("contingency", /\bcontingency\b/);
    classify("allowance", /\ballowance\b/);
    classify("labour", /\blabou?r\b|\bhours\b|\binstall\b|\bcrew\b/);
    classify("material", /\bmaterial\b|\bboard\b|\btrack\b|\bstud\b|\bfixing\b/);
    classify("plant", /\bplant\b|\bequipment\b|\bscaffold\b|\blift\b/);
    classify("subcontract", /\bsubcontract\b|\bsubbie\b|\bsub contractor\b/);
    classify("assumption", /\bassumption\b|\bassume\b/);
    classify("inclusion", /\binclusion\b|\bincluded\b/);
    classify("exclusion", /\bexclusion\b|\bexcluded\b/);
    classify("note", /\bnote\b|\bremark\b|\bclarification\b/);
  }

  const pricingSummary = toRecord(input.row.pricing_summary);
  const extractedPricingData = toRecord(input.row.extracted_pricing_data);
  const extractedLineItems = Array.isArray(extractedPricingData.lineItems)
    ? extractedPricingData.lineItems.map(summarizeWorksheetLineItem).filter(Boolean)
    : [];
  const extractedSummary = summarizeWorksheetRecord(extractedPricingData.summary);
  const worksheetNotes = sanitizeWorksheetText(toStringOrNull(toRecord(worksheet.metadata).notes));
  const formulaCount = nonEmptyCells.filter((cell) => Boolean(cell.formula)).length;
  const populatedCellCount = nonEmptyCells.length;
  const formulaDensity = populatedCellCount > 0
    ? Math.round((formulaCount / populatedCellCount) * 1000) / 1000
    : 0;
  const hasPricingSummary = Object.values(pricingSummary).some((value) => value !== null && value !== "" && value !== undefined);
  const hasExtractedPricingData = extractedLineItems.length > 0 || Boolean(extractedSummary);

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (populatedCellCount < 4 || (!hasPricingSummary && formulaCount === 0 && extractedLineItems.length === 0)) {
    evidenceStrength = "weak";
  } else if (populatedCellCount >= 12 && formulaCount >= 2 && (hasPricingSummary || extractedLineItems.length > 0)) {
    evidenceStrength = "strong";
  }

  const worksheetStatus = input.workbookContext.workbookArchivedAt ? "archived" : "active";
  const worksheetMaturity =
    worksheetStatus === "archived"
      ? "archived_saved"
      : Number(input.row.version ?? 1) > 1 && populatedCellCount >= 12
        ? "revised_established"
        : Number(input.row.version ?? 1) > 1
          ? "revised_saved"
          : formulaCount > 0 || extractedLineItems.length > 0
            ? "saved_structured"
            : "saved_initial";

  return {
    worksheet,
    retainedRows,
    formulaSamples,
    worksheetNotes,
    extractedLineItems,
    extractedSummary,
    populatedCellCount,
    formulaCount,
    formulaDensity,
    hasPricingSummary,
    hasExtractedPricingData,
    evidenceStrength,
    worksheetStatus,
    worksheetMaturity,
    classificationBuckets,
    nonEmptyCellCount: populatedCellCount,
    rowCount: declaredRowCount,
    columnCount: declaredColumnCount,
    savedCompleteness: {
      populatedCellCount,
      formulaCount,
      retainedRowCount: retainedRows.length,
      extractedLineItemCount: extractedLineItems.length,
      hasWorksheetNotes: Boolean(worksheetNotes),
      hasWorkbookName: Boolean(input.workbookContext.workbookName),
      hasSheetName: Boolean(toStringOrNull(input.row.name) ?? worksheet.sheetName),
    },
    pricingSignals: {
      subtotal: typeof pricingSummary.subtotal === "number" ? pricingSummary.subtotal : null,
      margin: typeof pricingSummary.margin === "number" ? pricingSummary.margin : null,
      gst: typeof pricingSummary.gst === "number" ? pricingSummary.gst : null,
      grandTotal: typeof pricingSummary.grandTotal === "number" ? pricingSummary.grandTotal : null,
    },
    projectLinked: Boolean(input.projectContext.projectId),
    clientLinked: Boolean(input.clientContext.clientId),
  };
}

function buildPricingWorkbookSheetReadOnlyRoutingContext() {
  return { readOnly: true };
}

function buildPricingWorkbookSheetTrustBoundaryPayload(input: {
  row: JsonRecord;
  workbookContext: ReturnType<typeof buildPricingWorkbookSheetWorkbookContext>;
  projectContext: ReturnType<typeof buildPricingWorkbookSheetProjectContext>;
  clientContext: ReturnType<typeof buildPricingWorkbookSheetClientContext>;
  worksheetSummary: ReturnType<typeof buildPricingWorkbookSheetSummary>;
  organizationId: string;
}) {
  const sheetId = toStringOrNull(input.row.id);
  const sheetName = toStringOrNull(input.row.name) ?? input.worksheetSummary.worksheet.sheetName;
  const workbookName = input.workbookContext.workbookName;
  const pricingSummary = toRecord(input.row.pricing_summary);
  const extractedPricingData = toRecord(input.row.extracted_pricing_data);

  return {
    sourceEvidence: {
      worksheetIdentity: {
        workbookId: input.workbookContext.workbookId,
        workbookName,
        sheetId,
        sheetName,
        tradePackage: input.workbookContext.tradePackage,
        isDefaultSheet: input.row.is_default === true,
      },
      worksheetStructureSummary: {
        rowCount: input.worksheetSummary.rowCount,
        columnCount: input.worksheetSummary.columnCount,
        populatedCellCount: input.worksheetSummary.populatedCellCount,
        nonEmptyCellCount: input.worksheetSummary.nonEmptyCellCount,
        formulaCellCount: input.worksheetSummary.formulaCount,
        retainedRowCount: input.worksheetSummary.retainedRows.length,
      },
      retainedWorksheetRows: input.worksheetSummary.retainedRows,
      retainedFormulaSummary: {
        formulaCellCount: input.worksheetSummary.formulaCount,
        formulaSamples: input.worksheetSummary.formulaSamples,
      },
      retainedPricingSummary: pruneEmptyObject({
        currency: toStringOrNull(pricingSummary.currency),
        subtotal: typeof pricingSummary.subtotal === "number" ? pricingSummary.subtotal : null,
        margin: typeof pricingSummary.margin === "number" ? pricingSummary.margin : null,
        gst: typeof pricingSummary.gst === "number" ? pricingSummary.gst : null,
        grandTotal: typeof pricingSummary.grandTotal === "number" ? pricingSummary.grandTotal : null,
        lastCalculatedAt: toIsoOrNull(pricingSummary.lastCalculatedAt),
      }),
      retainedExtractedPricingData: {
        extractedAt: toIsoOrNull(extractedPricingData.extractedAt),
        method: toStringOrNull(extractedPricingData.method),
        confidence: typeof extractedPricingData.confidence === "number" ? extractedPricingData.confidence : null,
        sourceWorksheetVersion:
          typeof extractedPricingData.sourceWorksheetVersion === "number"
            ? extractedPricingData.sourceWorksheetVersion
            : null,
        lineItemCount: input.worksheetSummary.extractedLineItems.length,
        lineItems: input.worksheetSummary.extractedLineItems.slice(0, 25),
        summary: input.worksheetSummary.extractedSummary,
        warningCount: Array.isArray(extractedPricingData.warnings) ? extractedPricingData.warnings.length : 0,
      },
      retainedEstimatingSignals: {
        quantities: input.worksheetSummary.classificationBuckets.quantity,
        rates: input.worksheetSummary.classificationBuckets.rate,
        markup: input.worksheetSummary.classificationBuckets.markup,
        margins: input.worksheetSummary.classificationBuckets.margin,
        wastage: input.worksheetSummary.classificationBuckets.wastage,
        contingency: input.worksheetSummary.classificationBuckets.contingency,
        allowances: input.worksheetSummary.classificationBuckets.allowance,
        buildUpPatterns: {
          labour: input.worksheetSummary.classificationBuckets.labour,
          material: input.worksheetSummary.classificationBuckets.material,
          plant: input.worksheetSummary.classificationBuckets.plant,
          subcontract: input.worksheetSummary.classificationBuckets.subcontract,
        },
      },
      retainedCommercialNotes: {
        worksheetNotes: input.worksheetSummary.worksheetNotes,
        assumptions: input.worksheetSummary.classificationBuckets.assumption,
        inclusions: input.worksheetSummary.classificationBuckets.inclusion,
        exclusions: input.worksheetSummary.classificationBuckets.exclusion,
        noteRows: input.worksheetSummary.classificationBuckets.note,
      },
      project: pruneEmptyObject({
        projectId: input.projectContext.projectId,
        projectName: input.projectContext.projectName,
        projectCode: input.projectContext.projectCode,
      }),
    },
    operationalContext: {
      worksheetMaturity: input.worksheetSummary.worksheetMaturity,
      worksheetStatus: input.worksheetSummary.worksheetStatus,
      worksheetVersion: typeof input.row.version === "number" ? input.row.version : 1,
      savedCompleteness: input.worksheetSummary.savedCompleteness,
      formulaDensity: input.worksheetSummary.formulaDensity,
      populatedCellCount: input.worksheetSummary.populatedCellCount,
      rowCount: input.worksheetSummary.rowCount,
      columnCount: input.worksheetSummary.columnCount,
      hasPricingSummary: input.worksheetSummary.hasPricingSummary,
      hasExtractedPricingData: input.worksheetSummary.hasExtractedPricingData,
      hasTradePackage: Boolean(input.workbookContext.tradePackage),
      estimatorInvolvement: {
        createdByUserId: toStringOrNull(input.row.created_by),
        updatedByUserId: toStringOrNull(input.row.updated_by),
        workbookCreatedByUserId: input.workbookContext.workbookCreatedBy,
        workbookUpdatedByUserId: input.workbookContext.workbookUpdatedBy,
      },
      revisionHistory: {
        workbookVersion: input.workbookContext.workbookVersion,
        sheetVersion: typeof input.row.version === "number" ? input.row.version : 1,
        revised: Number(input.row.version ?? 1) > 1,
        lastActiveSheetId: input.workbookContext.lastActiveSheetId,
      },
      evidenceStrength: input.worksheetSummary.evidenceStrength,
    },
    lineageContext: {
      organizationId: input.organizationId,
      opportunityId: input.projectContext.opportunityId,
      projectId: input.projectContext.projectId,
      projectName: input.projectContext.projectName,
      clientId: input.clientContext.clientId,
      clientName: input.clientContext.clientName,
      workbookId: input.workbookContext.workbookId,
      sheetId,
      workbookName,
      sheetName,
      worksheetVersion: typeof input.row.version === "number" ? input.row.version : 1,
      createdAt: toIsoOrNull(input.row.created_at),
      updatedAt: toIsoOrNull(input.row.updated_at),
      createdBy: toStringOrNull(input.row.created_by),
      updatedBy: toStringOrNull(input.row.updated_by),
      sourceTable: "opportunity_pricing_workbook_sheets",
      parentTable: "opportunity_pricing_worksheets",
    },
  };
}

function buildTakeoffMeasurementProjectContext(row: JsonRecord, enrichment: TakeoffMeasurementEnrichment) {
  const projectId = toStringOrNull(row.project_id);
  const project = projectId ? enrichment.projectsById.get(projectId) ?? null : null;
  const clientId = toStringOrNull(project?.client_id);
  const client = clientId ? enrichment.clientsById.get(clientId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    clientId,
    clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
  };
}

function buildTakeoffMeasurementGroupContext(row: JsonRecord, enrichment: TakeoffMeasurementEnrichment) {
  const groupId = toStringOrNull(row.group_id);
  const group = groupId ? enrichment.groupsById.get(groupId) ?? null : null;
  const metadata = toRecord(group?.metadata);
  const rawTag = metadata.tag;

  return {
    groupId,
    groupName: toStringOrNull(group?.name),
    groupCode: toStringOrNull(group?.code),
    groupStatus: toStringOrNull(group?.status),
    tradeId: toStringOrNull(group?.trade_id),
    tradeLabel: toStringOrNull(group?.trade_label),
    tagSummary:
      typeof rawTag === "string"
        ? rawTag
        : typeof rawTag === "number" || typeof rawTag === "boolean"
          ? String(rawTag)
          : null,
  };
}

function buildTakeoffMeasurementPageContext(row: JsonRecord, enrichment: TakeoffMeasurementEnrichment) {
  const pageId = toStringOrNull(row.page_id);
  const page = pageId ? enrichment.pagesById.get(pageId) ?? null : null;
  const drawingSetId = toStringOrNull(row.drawing_set_id) ?? toStringOrNull(page?.drawing_set_id);
  const drawingSet = drawingSetId ? enrichment.drawingSetsById.get(drawingSetId) ?? null : null;

  return {
    pageId,
    pageNumber: typeof page?.page_number === "number" ? page.page_number : null,
    pageLabel: toStringOrNull(page?.page_label),
    sourceRevision: toStringOrNull(page?.source_revision),
    drawingSetId,
    drawingSetName: toStringOrNull(drawingSet?.file_name),
    drawingSetMimeType: toStringOrNull(drawingSet?.mime_type),
  };
}

function buildTakeoffMeasurementCalibrationContext(row: JsonRecord, enrichment: TakeoffMeasurementEnrichment) {
  const calibrationId = toStringOrNull(row.calibration_id);
  const calibration = calibrationId ? enrichment.calibrationsById.get(calibrationId) ?? null : null;

  return {
    calibrationId,
    calibrationName: toStringOrNull(calibration?.name),
    scaleRatio: typeof calibration?.scale_ratio === "number" ? calibration.scale_ratio : null,
    unitSystem: toStringOrNull(calibration?.unit_system),
    baseUnit: toStringOrNull(calibration?.base_unit),
    displayUnit: toStringOrNull(calibration?.display_unit),
    referenceLengthInput: typeof calibration?.reference_length_input === "number" ? calibration.reference_length_input : null,
    referenceLengthBase: typeof calibration?.reference_length_base === "number" ? calibration.reference_length_base : null,
    isActive: calibration?.is_active === true,
    supersededBy: toStringOrNull(calibration?.superseded_by),
  };
}

function summarizeTakeoffCorrectionFrequency(correctionCount: number, totalEvents: number) {
  if (correctionCount <= 0) return "none";
  if (correctionCount >= 5 || correctionCount >= Math.max(3, Math.floor(totalEvents / 2))) return "high";
  if (correctionCount >= 2) return "moderate";
  return "low";
}

function buildTakeoffMeasurementLifecycleStage(input: {
  row: JsonRecord;
  events: JsonRecord[];
  hasGeometry: boolean;
  childMeasurementCount: number;
  hasCalibration: boolean;
}) {
  const status = toStringOrNull(input.row.status)?.toLowerCase() ?? "";
  const latestEventType = toStringOrNull(input.events[input.events.length - 1]?.event_type)?.toLowerCase();
  const correctionCount = input.events.filter((event) => {
    const eventType = toStringOrNull(event.event_type)?.toLowerCase();
    return eventType === "updated" || eventType === "recalculated";
  }).length;

  if (status === "deleted") return "deleted";
  if (status === "archived") return "archived";
  if (latestEventType === "restored") return "restored";
  if (!input.hasGeometry || input.childMeasurementCount === 0 || !input.hasCalibration) return "incomplete_measurement";
  if (correctionCount > 0 || Number(input.row.version ?? 1) > 1) return "corrected";
  if (latestEventType === "created" || Number(input.row.version ?? 1) <= 1) return "created";
  return "actively_measured";
}

function buildTakeoffMeasurementSummary(input: {
  row: JsonRecord;
  points: JsonRecord[];
  events: JsonRecord[];
  areaShapes: JsonRecord[];
  linePaths: JsonRecord[];
  enrichment: TakeoffMeasurementEnrichment;
  projectContext: ReturnType<typeof buildTakeoffMeasurementProjectContext>;
  groupContext: ReturnType<typeof buildTakeoffMeasurementGroupContext>;
  pageContext: ReturnType<typeof buildTakeoffMeasurementPageContext>;
  calibrationContext: ReturnType<typeof buildTakeoffMeasurementCalibrationContext>;
}) {
  const measurementKind = toStringOrNull(input.row.measurement_kind)?.toLowerCase();
  const metadata = toRecord(input.row.metadata);
  const countItemValue = typeof metadata.countItemValue === "number" ? metadata.countItemValue : null;
  const areaShapeRoleMap = toRecord(metadata.areaShapeRoles);
  const includeShapeIds: string[] = [];
  const deductionShapeIds: string[] = [];

  for (const shape of input.areaShapes) {
    const shapeId = toStringOrNull(shape.id);
    if (!shapeId) continue;
    const role = toStringOrNull(areaShapeRoleMap[shapeId])?.toLowerCase() === "deduction" ? "deduction" : "include";
    if (role === "deduction") deductionShapeIds.push(shapeId);
    else includeShapeIds.push(shapeId);
  }

  const childMeasurementCount = measurementKind === "area"
    ? input.areaShapes.length
    : measurementKind === "line"
      ? input.linePaths.length
      : input.points.length;
  const hasCalibration = measurementKind === "count" || Boolean(input.calibrationContext.calibrationId);
  const hasGeometry = input.points.length > 0;
  const eventTypeCounts = {
    created: input.events.filter((event) => toStringOrNull(event.event_type)?.toLowerCase() === "created").length,
    corrected: input.events.filter((event) => toStringOrNull(event.event_type)?.toLowerCase() === "updated").length,
    recalculated: input.events.filter((event) => toStringOrNull(event.event_type)?.toLowerCase() === "recalculated").length,
    archived: input.events.filter((event) => toStringOrNull(event.event_type)?.toLowerCase() === "archived").length,
    restored: input.events.filter((event) => toStringOrNull(event.event_type)?.toLowerCase() === "restored").length,
    deleted: input.events.filter((event) => toStringOrNull(event.event_type)?.toLowerCase() === "deleted").length,
  };
  const correctionCount = eventTypeCounts.corrected + eventTypeCounts.recalculated;
  const correctionFrequency = summarizeTakeoffCorrectionFrequency(correctionCount, input.events.length);
  const geometryCompleteness = {
    hasGeometry,
    pointCount: input.points.length,
    requiresCalibration: measurementKind === "line" || measurementKind === "area",
    hasCalibration,
  };
  const childStructureCompleteness = {
    childMeasurementCount,
    linePathCount: input.linePaths.length,
    areaShapeCount: input.areaShapes.length,
    countPointCount: measurementKind === "count" ? input.points.length : 0,
    areaShapesWithPointGeometry: input.areaShapes.filter((shape) =>
      (input.enrichment.areaShapePointsByShapeId.get(String(shape.id)) ?? []).length >= 3).length,
    linePathsWithPointGeometry: input.linePaths.filter((path) =>
      (input.enrichment.linePathPointsByPathId.get(String(path.id)) ?? []).length >= 2).length,
  };
  const lifecycleStage = buildTakeoffMeasurementLifecycleStage({
    row: input.row,
    events: input.events,
    hasGeometry,
    childMeasurementCount,
    hasCalibration,
  });

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (!input.projectContext.projectId || !input.pageContext.pageId || !input.pageContext.drawingSetId || !hasGeometry) {
    evidenceStrength = "weak";
  } else if (
    hasCalibration
    && input.events.length > 0
    && (input.groupContext.groupId || measurementKind === "count")
    && childMeasurementCount > 0
  ) {
    evidenceStrength = "strong";
  }

  return {
    lifecycleStage,
    eventTypeCounts,
    correctionCount,
    correctionFrequency,
    geometryCompleteness,
    childStructureCompleteness,
    countItemValue,
    includeShapeIds,
    deductionShapeIds,
    hasCalibration,
    evidenceStrength,
    reviewDiscipline: {
      latestEventType: toStringOrNull(input.events[input.events.length - 1]?.event_type),
      eventCount: input.events.length,
      correctionFrequency,
      correctionCount,
      archiveRestoreCount: eventTypeCounts.archived + eventTypeCounts.restored,
    },
    changeReasonSummary: {
      latestChangeReason: toStringOrNull(input.events[input.events.length - 1]?.change_reason),
      uniqueReasons: uniqueNonEmpty(input.events.map((event) => toStringOrNull(event.change_reason))),
    },
  };
}

function buildTakeoffMeasurementReadOnlyRoutingContext() {
  return { readOnly: true };
}

function buildTakeoffMeasurementTrustBoundaryPayload(input: {
  row: JsonRecord;
  points: JsonRecord[];
  events: JsonRecord[];
  areaShapes: JsonRecord[];
  linePaths: JsonRecord[];
  projectContext: ReturnType<typeof buildTakeoffMeasurementProjectContext>;
  groupContext: ReturnType<typeof buildTakeoffMeasurementGroupContext>;
  pageContext: ReturnType<typeof buildTakeoffMeasurementPageContext>;
  calibrationContext: ReturnType<typeof buildTakeoffMeasurementCalibrationContext>;
  takeoffSummary: ReturnType<typeof buildTakeoffMeasurementSummary>;
  organizationId: string;
}) {
  const measurementId = toStringOrNull(input.row.id);

  return {
    sourceEvidence: {
      measurement: {
        measurementId,
        name: toStringOrNull(input.row.name),
        description: toStringOrNull(input.row.description),
        measurementKind: toStringOrNull(input.row.measurement_kind),
        source: toStringOrNull(input.row.source),
        status: toStringOrNull(input.row.status),
      },
      measurementSummary: {
        displayQuantity: typeof input.row.display_value === "number" ? input.row.display_value : null,
        displayUnit: toStringOrNull(input.row.display_unit),
        quantityMultiplier: typeof input.row.quantity === "number" ? input.row.quantity : null,
        measuredLengthSummary: {
          measuredLengthBase: typeof input.row.measured_length_base === "number" ? input.row.measured_length_base : null,
          linePathTotal: input.linePaths.reduce((sum, path) => sum + toNumberOrZero(path.measured_length_base), 0),
        },
        measuredAreaSummary: {
          measuredAreaBase: typeof input.row.measured_area_base === "number" ? input.row.measured_area_base : null,
          areaShapeTotal: input.areaShapes.reduce((sum, shape) => sum + toNumberOrZero(shape.measured_area_base), 0),
        },
        perimeterSummary: {
          measuredPerimeterBase: typeof input.row.measured_perimeter_base === "number" ? input.row.measured_perimeter_base : null,
          areaShapePerimeterTotal: input.areaShapes.reduce((sum, shape) => sum + toNumberOrZero(shape.measured_perimeter_base), 0),
        },
        countSummary: {
          countValue: typeof input.row.count_value === "number" ? input.row.count_value : null,
          countItemValue: input.takeoffSummary.countItemValue,
        },
      },
      calibration: {
        calibrationId: input.calibrationContext.calibrationId,
        calibrationName: input.calibrationContext.calibrationName,
        calibrationScale: input.calibrationContext.scaleRatio,
        calibrationAvailability: input.takeoffSummary.hasCalibration ? "available" : "missing",
        unitSystem: input.calibrationContext.unitSystem,
        baseUnit: input.calibrationContext.baseUnit,
        displayUnit: input.calibrationContext.displayUnit,
      },
      grouping: {
        measurementGroup: {
          groupId: input.groupContext.groupId,
          groupName: input.groupContext.groupName,
          groupCode: input.groupContext.groupCode,
          groupStatus: input.groupContext.groupStatus,
        },
        tradeGrouping: {
          tradeId: input.groupContext.tradeId,
          tradeLabel: input.groupContext.tradeLabel,
        },
        measurementTagsSummary: {
          tagSummary: input.groupContext.tagSummary,
          hasGroup: Boolean(input.groupContext.groupId),
          hasTradeGrouping: Boolean(input.groupContext.tradeId || input.groupContext.tradeLabel),
        },
      },
      drawingContext: {
        drawingSetSummary: {
          drawingSetId: input.pageContext.drawingSetId,
          drawingSetName: input.pageContext.drawingSetName,
          drawingSetMimeType: input.pageContext.drawingSetMimeType,
        },
        pageSummary: {
          pageId: input.pageContext.pageId,
          pageNumber: input.pageContext.pageNumber,
          pageLabel: input.pageContext.pageLabel,
          sourceRevision: input.pageContext.sourceRevision,
        },
      },
      geometrySummary: {
        pointCount: input.points.length,
        linePathCount: input.linePaths.length,
        areaShapeCount: input.areaShapes.length,
        childMeasurementCount: input.takeoffSummary.childStructureCompleteness.childMeasurementCount,
        includeDeductionSummary: {
          includedAreaShapeCount: input.takeoffSummary.includeShapeIds.length,
          deductionAreaShapeCount: input.takeoffSummary.deductionShapeIds.length,
          hasDeductions: input.takeoffSummary.deductionShapeIds.length > 0,
        },
        boundingBoxSummary: {
          hasBoundingBox: Boolean(
            input.row.page_bbox_min_x !== null
            && input.row.page_bbox_min_y !== null
            && input.row.page_bbox_max_x !== null
            && input.row.page_bbox_max_y !== null,
          ),
        },
      },
      eventSummary: {
        created: input.takeoffSummary.eventTypeCounts.created,
        corrected: input.takeoffSummary.eventTypeCounts.corrected,
        recalculated: input.takeoffSummary.eventTypeCounts.recalculated,
        archived: input.takeoffSummary.eventTypeCounts.archived,
        restored: input.takeoffSummary.eventTypeCounts.restored,
        deleted: input.takeoffSummary.eventTypeCounts.deleted,
        correctionFrequency: input.takeoffSummary.correctionFrequency,
        changeReasonSummary: input.takeoffSummary.changeReasonSummary,
      },
      project: pruneEmptyObject({
        projectId: input.projectContext.projectId,
        projectName: input.projectContext.projectName,
        projectCode: input.projectContext.projectCode,
      }),
      evidenceStrengthSummary: {
        evidenceStrength: input.takeoffSummary.evidenceStrength,
      },
    },
    operationalContext: {
      lifecycleStage: input.takeoffSummary.lifecycleStage,
      createdAt: toIsoString(input.row.created_at),
      updatedAt: toIsoString(input.row.updated_at),
      archivedAt: toIsoString(input.row.archived_at),
      hasCalibration: input.takeoffSummary.hasCalibration,
      hasGroup: Boolean(input.groupContext.groupId),
      hasOpportunity: Boolean(toStringOrNull(input.row.opportunity_id)),
      hasProject: Boolean(input.projectContext.projectId),
      hasAiOrigin: toStringOrNull(input.row.source)?.toLowerCase() === "ai",
      hasImportedOrigin: toStringOrNull(input.row.source)?.toLowerCase() === "imported",
      correctionFrequency: input.takeoffSummary.correctionFrequency,
      reviewDiscipline: input.takeoffSummary.reviewDiscipline,
      geometryCompleteness: input.takeoffSummary.geometryCompleteness,
      childStructureCompleteness: input.takeoffSummary.childStructureCompleteness,
      evidenceStrength: input.takeoffSummary.evidenceStrength,
    },
    lineageContext: {
      organizationId: input.organizationId,
      projectId: input.projectContext.projectId,
      projectName: input.projectContext.projectName,
      opportunityId: toStringOrNull(input.row.opportunity_id),
      drawingSetId: input.pageContext.drawingSetId,
      pageId: input.pageContext.pageId,
      calibrationId: input.calibrationContext.calibrationId,
      groupId: input.groupContext.groupId,
      measurementId,
      pointIds: uniqueNonEmpty(input.points.map((point) => toStringOrNull(point.id))).sort(),
      linePathIds: uniqueNonEmpty(input.linePaths.map((path) => toStringOrNull(path.id))).sort(),
      areaShapeIds: uniqueNonEmpty(input.areaShapes.map((shape) => toStringOrNull(shape.id))).sort(),
      eventIds: uniqueNonEmpty(input.events.map((event) => toStringOrNull(event.id))).sort(),
      createdByUserId: toStringOrNull(input.row.created_by),
      updatedByUserId: toStringOrNull(input.row.updated_by),
      archivedByUserId: toStringOrNull(input.row.archived_by),
      sourceTable: "takeoff_measurements",
    },
  };
}

function buildProjectVariationProjectContext(row: JsonRecord, enrichment: ProjectVariationEnrichment) {
  const projectId = toStringOrNull(row.project_id);
  const project = projectId ? enrichment.projectsById.get(projectId) ?? null : null;
  const clientId = toStringOrNull(project?.client_id);
  const client = clientId ? enrichment.clientsById.get(clientId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    clientId,
    clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
  };
}

function buildProjectClaimProjectContext(row: JsonRecord, enrichment: ProjectClaimEnrichment) {
  const projectId = toStringOrNull(row.project_id);
  const project = projectId ? enrichment.projectsById.get(projectId) ?? null : null;
  const clientId = toStringOrNull(project?.client_id);
  const client = clientId ? enrichment.clientsById.get(clientId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    clientId,
    clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
  };
}

function buildProjectVariationLineEvidence(line: JsonRecord) {
  return {
    lineItemId: toStringOrNull(line.id),
    section: toStringOrNull(line.section),
    description: toStringOrNull(line.description),
    quantity: typeof line.quantity === "number" ? line.quantity : null,
    unit: toStringOrNull(line.unit),
    rate: typeof line.rate === "number" ? line.rate : null,
    total: typeof line.total === "number" ? line.total : null,
  };
}

function summarizeProjectVariationStatusNote(note: string | null) {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

function buildProjectVariationLifecycleStage(input: {
  status: string | null;
  invoiceReady: boolean;
  hasInvoiceItems: boolean;
  hasExportedInvoiceItems: boolean;
}) {
  const normalizedStatus = input.status?.toLowerCase() ?? "";
  if (normalizedStatus === "invoiced" || input.hasExportedInvoiceItems) {
    return "invoiced";
  }
  if (input.invoiceReady || input.hasInvoiceItems) {
    return "invoice_ready";
  }
  if (normalizedStatus === "approved") {
    return "approved";
  }
  if (normalizedStatus === "rejected") {
    return "rejected";
  }
  if (normalizedStatus === "client review") {
    return "client_review";
  }
  if (normalizedStatus === "sent") {
    return "sent";
  }
  if (normalizedStatus === "priced") {
    return "priced";
  }
  return "draft";
}

function buildProjectVariationTurnaroundLag(input: {
  requestedDate: string | null;
  completedAt: string | null;
}) {
  if (!input.requestedDate || !input.completedAt) {
    return null;
  }
  const start = new Date(input.requestedDate);
  const end = new Date(input.completedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function buildProjectVariationSummary(input: {
  row: JsonRecord;
  lineItems: JsonRecord[];
  attachments: JsonRecord[];
  statusEvents: JsonRecord[];
  invoiceItems: JsonRecord[];
  projectContext: ReturnType<typeof buildProjectVariationProjectContext>;
}) {
  const quoteIds = new Set<string>();
  const quoteLineItemIds = new Set<string>();
  const purchaseOrderIds = new Set<string>();
  const purchaseOrderLineItemIds = new Set<string>();
  const attachmentKinds = new Set<string>();
  const statusTransitions = new Set<string>();
  const lineCount = input.lineItems.length;
  const attachmentCount = input.attachments.length;
  const invoiceItemCount = input.invoiceItems.length;
  let exportedInvoiceItemCount = 0;
  let totalReadyAmount = 0;
  let totalExportedAmount = 0;

  for (const line of input.lineItems) {
    addUniqueValue(quoteIds, toStringOrNull(line.source_project_quote_id));
    addUniqueValue(quoteLineItemIds, toStringOrNull(line.source_project_quote_line_item_id));
    addUniqueValue(purchaseOrderIds, toStringOrNull(line.source_purchase_order_id));
    addUniqueValue(purchaseOrderLineItemIds, toStringOrNull(line.source_purchase_order_line_item_id));
  }

  for (const attachment of input.attachments) {
    addUniqueValue(attachmentKinds, toStringOrNull(attachment.file_kind));
  }

  for (const event of input.statusEvents) {
    const toStatus = toStringOrNull(event.to_status);
    if (toStatus) {
      statusTransitions.add(toStatus);
    }
  }

  for (const invoiceItem of input.invoiceItems) {
    totalReadyAmount += toNumberOrZero(invoiceItem.amount);
    if (toIsoOrNull(invoiceItem.exported_at) || (toStringOrNull(invoiceItem.status)?.toLowerCase() ?? "") === "exported") {
      exportedInvoiceItemCount += 1;
      totalExportedAmount += toNumberOrZero(invoiceItem.amount);
    }
  }

  const hasQuoteLinkedLines = quoteIds.size > 0 || quoteLineItemIds.size > 0;
  const hasPurchaseOrderLinkedLines = purchaseOrderIds.size > 0 || purchaseOrderLineItemIds.size > 0;
  const hasAttachments = attachmentCount > 0;
  const hasIssuedToClient = Boolean(toIsoOrNull(input.row.sent_to_client_at))
    || ["sent", "client review", "approved", "rejected", "invoiced"].includes((toStringOrNull(input.row.status)?.toLowerCase() ?? ""));
  const hasClientViewed = Boolean(toIsoOrNull(input.row.client_viewed_at));
  const hasApproved = Boolean(toIsoOrNull(input.row.approved_at)) || (toStringOrNull(input.row.status)?.toLowerCase() ?? "") === "approved";
  const hasRejected = Boolean(toIsoOrNull(input.row.rejected_at)) || (toStringOrNull(input.row.status)?.toLowerCase() ?? "") === "rejected";
  const invoiceReady = input.row.invoice_ready === true;
  const hasInvoiceItems = invoiceItemCount > 0;
  const hasExportedInvoiceItems = exportedInvoiceItemCount > 0;
  const lifecycleStage = buildProjectVariationLifecycleStage({
    status: toStringOrNull(input.row.status),
    invoiceReady,
    hasInvoiceItems,
    hasExportedInvoiceItems,
  });
  const claimRelevant = hasApproved || invoiceReady || hasInvoiceItems;
  const commerciallyRecovered = hasExportedInvoiceItems || (toStringOrNull(input.row.status)?.toLowerCase() ?? "") === "invoiced";
  const awaitingApproval = ["sent", "client review", "priced"].includes((toStringOrNull(input.row.status)?.toLowerCase() ?? ""))
    && !hasApproved
    && !hasRejected;
  const awaitingIssue = lineCount > 0 && !hasIssuedToClient && !hasApproved && !hasRejected;
  const total = toNumberOrZero(input.row.total_variation_price);

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (lineCount === 0 || total <= 0 || !input.projectContext.projectId || !input.projectContext.clientId) {
    evidenceStrength = "weak";
  }
  if ((hasApproved || lifecycleStage === "invoiced" || lifecycleStage === "invoice_ready") && lineCount > 0 && total > 0) {
    evidenceStrength = "strong";
  }

  return {
    lineCount,
    attachmentCount,
    invoiceItemCount,
    exportedInvoiceItemCount,
    totalReadyAmount,
    totalExportedAmount,
    attachmentKinds: Array.from(attachmentKinds).sort(),
    statusTransitions: Array.from(statusTransitions).sort(),
    quoteIds: Array.from(quoteIds).sort(),
    quoteLineItemIds: Array.from(quoteLineItemIds).sort(),
    purchaseOrderIds: Array.from(purchaseOrderIds).sort(),
    purchaseOrderLineItemIds: Array.from(purchaseOrderLineItemIds).sort(),
    hasQuoteLinkedLines,
    hasPurchaseOrderLinkedLines,
    hasAttachments,
    hasIssuedToClient,
    hasClientViewed,
    hasApproved,
    hasRejected,
    invoiceReady,
    hasInvoiceItems,
    hasExportedInvoiceItems,
    claimRelevant,
    commerciallyRecovered,
    awaitingApproval,
    awaitingIssue,
    lifecycleStage,
    evidenceStrength,
    pricingCompleteness: {
      hasLineItems: lineCount > 0,
      hasCommercialValue: total > 0,
      hasMargin: toNumberOrZero(input.row.margin_total) > 0 || toNumberOrZero(input.row.margin_percent) > 0,
      commerciallyComplete: lineCount > 0 && total > 0,
    },
    documentCompleteness: {
      attachmentCount,
      hasAttachments,
      fileKinds: Array.from(attachmentKinds).sort(),
    },
    approvalCompleteness: {
      hasIssuedToClient,
      hasClientViewed,
      hasApproved,
      hasRejected,
      fullyResolved: hasApproved || hasRejected || commerciallyRecovered,
    },
    variationTurnaroundLagDays: buildProjectVariationTurnaroundLag({
      requestedDate: toIsoOrNull(input.row.requested_date),
      completedAt:
        toIsoOrNull(input.row.approved_at)
        ?? toIsoOrNull(input.row.rejected_at)
        ?? toIsoOrNull(input.row.updated_at),
    }),
  };
}

function buildSupplierInvoiceSupplierContext(row: JsonRecord, enrichment: SupplierInvoiceEnrichment) {
  const storedSupplierId = toStringOrNull(row.supplier_id);
  const supplier = storedSupplierId ? enrichment.suppliersById.get(storedSupplierId) ?? null : null;
  const supplierId = supplier ? storedSupplierId : null;
  const supplierName =
    toStringOrNull(supplier?.company_name)
    ?? toStringOrNull(supplier?.name)
    ?? toStringOrNull(supplier?.legal_name);

  return {
    supplierId,
    supplierName,
  };
}

function buildSupplierInvoiceAllocationSupplierContext(row: JsonRecord, enrichment: SupplierInvoiceAllocationEnrichment) {
  const invoiceId = toStringOrNull(row.supplier_invoice_id);
  const invoice = invoiceId ? enrichment.invoicesById.get(invoiceId) ?? null : null;
  const supplierId = toStringOrNull(invoice?.supplier_id);
  const supplier = supplierId ? enrichment.suppliersById.get(supplierId) ?? null : null;

  return {
    supplierId,
    supplierName:
      toStringOrNull(supplier?.company_name)
      ?? toStringOrNull(supplier?.name)
      ?? toStringOrNull(supplier?.legal_name),
  };
}

function buildSupplierInvoiceAllocationProjectContext(input: {
  row: JsonRecord;
  invoiceLine: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  purchaseOrderLine: JsonRecord | null;
  enrichment: SupplierInvoiceAllocationEnrichment;
}) {
  const projectId =
    toStringOrNull(input.row.project_id)
    ?? toStringOrNull(input.invoiceLine?.project_id)
    ?? toStringOrNull(input.purchaseOrderLine?.project_id)
    ?? toStringOrNull(input.purchaseOrder?.project_id);
  const project = projectId ? input.enrichment.projectsById.get(projectId) ?? null : null;
  const clientId = toStringOrNull(project?.client_id);
  const client = clientId ? input.enrichment.clientsById.get(clientId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    clientId,
    clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
  };
}

function buildSupplierInvoiceAllocationApprovalNoteSummary(note: string | null) {
  if (!note) {
    return {
      hasApprovalNote: false,
      noteSummary: null,
    };
  }

  const trimmed = note.trim();
  return {
    hasApprovalNote: trimmed.length > 0,
    noteSummary: trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed,
  };
}

function getProjectPurchaseOrderLineSourceKind(line: JsonRecord) {
  if (line.source_time_sheet_entry_id) return "time_sheet_entry";
  if (line.source_cost_item_id || line.cost_item_id) return "cost_item";
  return "manual";
}

function buildProjectPurchaseOrderLineEvidence(line: JsonRecord) {
  return {
    lineItemId: toStringOrNull(line.id),
    description: toStringOrNull(line.description),
    section: toStringOrNull(line.section),
    quantity: typeof line.quantity === "number" ? line.quantity : null,
    unit: toStringOrNull(line.unit),
    rate: typeof line.rate === "number" ? line.rate : null,
    total: typeof line.total === "number" ? line.total : null,
  };
}

function buildProjectPurchaseOrderLineageLink(input: {
  line: JsonRecord;
  enrichment: ProjectPurchaseOrderEnrichment;
}) {
  const costItemId = toStringOrNull(input.line.cost_item_id);
  const sourceCostItemId = toStringOrNull(input.line.source_cost_item_id);
  const costItem = costItemId ? input.enrichment.costItemsById.get(costItemId) ?? null : null;
  const sourceCostItem = sourceCostItemId ? input.enrichment.costItemsById.get(sourceCostItemId) ?? null : null;
  const source = sourceCostItem ?? costItem;

  return {
    lineItemId: toStringOrNull(input.line.id),
    costItemId,
    sourceCostItemId,
    sourceTimeSheetEntryId: toStringOrNull(input.line.source_time_sheet_entry_id),
    sourceKind: getProjectPurchaseOrderLineSourceKind(input.line),
    sourceId:
      toStringOrNull(input.line.source_time_sheet_entry_id)
      ?? sourceCostItemId
      ?? costItemId,
    sourceDocumentKind: toStringOrNull(source?.source_document_kind),
    sourceDocumentId: toStringOrNull(source?.source_document_id),
    sourceLineId: toStringOrNull(source?.source_line_id),
    sourceLineTable: toStringOrNull(source?.source_line_table),
  };
}

function buildProjectPurchaseOrderStatusContext(row: JsonRecord, statusEvents: JsonRecord[]) {
  const sortedEvents = [...statusEvents].sort((left, right) =>
    toCursorComparable(toIsoOrNull(left.changed_at)).localeCompare(toCursorComparable(toIsoOrNull(right.changed_at))),
  );
  return {
    latestStatus: toStringOrNull(row.status),
    statusHistory: sortedEvents.map((event) => ({
      fromStatus: toStringOrNull(event.from_status),
      toStatus: toStringOrNull(event.to_status),
      changedAt: toIsoOrNull(event.changed_at),
      changedBy: toStringOrNull(event.changed_by),
      note: toStringOrNull(event.note),
    })),
    approvedAt: toIsoOrNull(row.approved_at),
    sentAt: toIsoOrNull(row.sent_to_client_at),
    invoiceReady: row.invoice_ready === true,
    invoiced: toStringOrNull(row.status)?.toLowerCase() === "invoiced" || row.invoice_ready === true,
  };
}

function buildProjectPurchaseOrderSummary(input: {
  row: JsonRecord;
  lineItems: JsonRecord[];
  supplierContext: ReturnType<typeof buildSupplierDisplayContext>;
  statusContext: ReturnType<typeof buildProjectPurchaseOrderStatusContext>;
}) {
  const lineTotals = {
    materialTotal: 0,
    labourTotal: 0,
    subcontractorTotal: 0,
    plantTotal: 0,
    otherTotal: 0,
  };
  for (const line of input.lineItems) {
    addTotalByRoutingBucket(lineTotals, line);
  }
  const lineDescriptions = input.lineItems
    .map((line) => toStringOrNull(line.description))
    .filter((description): description is string => Boolean(description));
  const productLikeLineDescriptions = input.lineItems
    .filter((line) => {
      const section = toStringOrNull(line.section)?.toLowerCase() ?? "";
      return section.includes("material") || (!section.includes("labour") && !section.includes("labor") && !toStringOrNull(line.source_time_sheet_entry_id));
    })
    .map((line) => toStringOrNull(line.description))
    .filter((description): description is string => Boolean(description));
  const labourLikeLineDescriptions = input.lineItems
    .filter((line) => {
      const section = toStringOrNull(line.section)?.toLowerCase() ?? "";
      return section.includes("labour") || section.includes("labor") || Boolean(line.source_time_sheet_entry_id);
    })
    .map((line) => toStringOrNull(line.description))
    .filter((description): description is string => Boolean(description));
  const sourceTypes = uniqueNonEmpty(input.lineItems.map((line) => {
    return getProjectPurchaseOrderLineSourceKind(line);
  }));
  const lineCount = input.lineItems.length;
  const hasSupplier = Boolean(input.supplierContext.supplierId || input.supplierContext.supplierName);
  const total = toNumberOrZero(input.row.total_purchase_order_price);
  const hasApprovedStatus = ["approved", "sent", "invoiced"].includes(input.statusContext.latestStatus?.toLowerCase() ?? "");
  const hasUsefulLineItems = lineCount > 0 && lineDescriptions.length > 0;
  const hasZeroValue = total <= 0;
  const generatedOrAdminLineCount = lineDescriptions.filter((description) =>
    /tradesstack admin|alan fenton|admin\s*-/i.test(description),
  ).length;
  const ambiguousGeneratedRows = lineCount > 0 && generatedOrAdminLineCount === lineCount;

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (!hasUsefulLineItems || hasZeroValue || !hasSupplier || ambiguousGeneratedRows) {
    evidenceStrength = "weak";
  }
  if (hasApprovedStatus && hasSupplier && hasUsefulLineItems && !hasZeroValue) {
    evidenceStrength = "strong";
  }

  return {
    lineCount,
    hasSupplier,
    hasApprovedStatus,
    isDraftOnly: (input.statusContext.latestStatus?.toLowerCase() ?? "") === "draft" && input.statusContext.statusHistory.length === 0,
    hasZeroValue,
    materialTotal: toNumberOrZero(input.row.materials_total) || lineTotals.materialTotal,
    labourTotal: toNumberOrZero(input.row.labour_total) || lineTotals.labourTotal,
    subcontractorTotal: toNumberOrZero(input.row.subcontractors_total) || lineTotals.subcontractorTotal,
    plantTotal: toNumberOrZero(input.row.plant_total) || lineTotals.plantTotal,
    otherTotal: lineTotals.otherTotal,
    productLikeLineDescriptions,
    labourLikeLineDescriptions,
    sourceTypes,
    evidenceStrength,
  };
}

function buildProjectTimeSheetEntryEventEvidence(event: JsonRecord) {
  return pruneEmptyObject({
    eventType: toStringOrNull(event.event_type),
    createdAt: toIsoOrNull(event.created_at),
    message: toStringOrNull(event.message),
  });
}

function buildProjectTimeSheetEntryShiftDurationBucket(hours: number | null) {
  if (hours === null || !Number.isFinite(hours)) return "unknown";
  if (hours < 4) return "short";
  if (hours < 8) return "standard";
  if (hours < 10) return "extended";
  return "long";
}

function buildProjectTimeSheetEntryRepeatWorkerCadence(entryCount: number) {
  if (entryCount >= 8) return "high";
  if (entryCount >= 4) return "repeat";
  if (entryCount >= 2) return "occasional";
  return "single";
}

function buildProjectTimeSheetEntrySummary(input: {
  row: JsonRecord;
  events: JsonRecord[];
  syncedLines: JsonRecord[];
  projectContext: ReturnType<typeof buildProjectTimeSheetEntryProjectContext>;
  purchaseOrderContext: ReturnType<typeof buildProjectTimeSheetEntryPurchaseOrderContext>;
  reviewWindowEntries: JsonRecord[];
}) {
  const closed = Boolean(toIsoOrNull(input.row.clock_out_at));
  const autoClockedOut = input.row.auto_clocked_out === true;
  const warningReached = Boolean(toIsoOrNull(input.row.warning_8h5_at))
    || input.events.some((event) => toStringOrNull(event.event_type) === "warning_8h5");
  const hasClockInEvent = input.events.some((event) => toStringOrNull(event.event_type) === "clock_in");
  const hasClockOutEvent = input.events.some((event) => toStringOrNull(event.event_type) === "clock_out");
  const hasAutoClockOutEvent = input.events.some((event) => toStringOrNull(event.event_type) === "auto_clock_out");
  const eventTypes = uniqueNonEmpty(input.events.map((event) => toStringOrNull(event.event_type)));
  const totalHours = typeof input.row.total_hours === "number"
    ? input.row.total_hours
    : closed
      ? diffHours(toIsoOrNull(input.row.clock_in_at), toIsoOrNull(input.row.clock_out_at))
      : null;
  const durationBucket = buildProjectTimeSheetEntryShiftDurationBucket(totalHours);
  const closeStatus = closed ? (autoClockedOut ? "closed" : "clocked_out") : "open";
  const closeMethod = !closed ? "open" : autoClockedOut ? "automatic" : "manual";
  const sourceChannel = toStringOrNull(input.row.source) ?? "web";
  const staleHealed = autoClockedOut && input.events.some((event) =>
    toStringOrNull(event.event_type) === "auto_clock_out" && toStringOrNull(event.actor_user_id) !== null);
  const assignedPurchaseOrder = Boolean(
    input.purchaseOrderContext.purchaseOrderId
    || input.purchaseOrderContext.purchaseOrderNumber
    || input.purchaseOrderContext.purchaseOrderTitle,
  );
  const syncedLine = input.syncedLines[0] ?? null;
  const eventCompleteness = hasClockInEvent && (!closed || hasClockOutEvent || hasAutoClockOutEvent)
    ? "complete"
    : input.events.length > 0
      ? "partial"
      : "minimal";
  const repeatWorkerEntryCount = input.reviewWindowEntries.length;
  const repeatWorkerCadence = buildProjectTimeSheetEntryRepeatWorkerCadence(repeatWorkerEntryCount);
  const hasWorkerSnapshot = Boolean(toStringOrNull(input.row.worker_name));
  const hasProjectSnapshot = Boolean(input.projectContext.projectId || input.projectContext.projectName);
  const hasRetainedDuration = closed && typeof totalHours === "number" && totalHours >= 0;

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (!hasWorkerSnapshot || !hasProjectSnapshot || !hasClockInEvent) {
    evidenceStrength = "weak";
  }
  if ((closeStatus === "closed" || closeStatus === "clocked_out") && hasRetainedDuration && eventCompleteness === "complete") {
    evidenceStrength = "strong";
  }

  return {
    closeStatus,
    closeMethod,
    lifecycleStage: !closed ? (warningReached ? "active_warning" : "active") : autoClockedOut ? "closed_automatic" : "closed_manual",
    warningReached,
    autoClockedOut,
    staleHealed,
    sourceChannel,
    durationBucket,
    totalHours,
    eventTypes,
    eventCount: input.events.length,
    hasClockInEvent,
    hasClockOutEvent,
    hasAutoClockOutEvent,
    eventCompleteness,
    assignedPurchaseOrder,
    syncedLineCount: input.syncedLines.length,
    repeatWorkerEntryCount,
    repeatWorkerCadence,
    evidenceStrength,
    labourCommitmentSummary: {
      purchaseOrderLinked: assignedPurchaseOrder,
      syncedPurchaseOrderLineCount: input.syncedLines.length,
      syncedPurchaseOrderLineId: toStringOrNull(syncedLine?.id),
      committedHours: totalHours,
      committedUnit: toStringOrNull(syncedLine?.unit),
      committedRate: syncedLine ? toNumberOrZero(syncedLine.rate) : null,
      committedTotal: syncedLine ? toNumberOrZero(syncedLine.total) : null,
    },
  };
}

function buildProjectQuoteLineEvidence(line: JsonRecord) {
  return {
    lineItemId: toStringOrNull(line.id),
    section: toStringOrNull(line.section),
    description: toStringOrNull(line.description),
    quantity: typeof line.quantity === "number" ? line.quantity : null,
    unit: toStringOrNull(line.unit),
    rate: typeof line.rate === "number" ? line.rate : null,
    total: typeof line.total === "number" ? line.total : null,
    isOptional: line.is_optional === true,
    sourceOpportunityQuoteId: toStringOrNull(line.source_opportunity_quote_id),
    sourceOpportunityQuoteLineItemId: toStringOrNull(line.source_opportunity_quote_line_item_id),
    sourceOpportunityQuoteNumber: toStringOrNull(line.source_opportunity_quote_number),
  };
}

function getProjectPurchaseOrderLineTotal(line: JsonRecord) {
  return toNumberOrZero(line.total)
    || toNumberOrZero(line.line_total)
    || (toNumberOrZero(line.quantity) * toNumberOrZero(line.rate))
    || (toNumberOrZero(line.quantity) * toNumberOrZero(line.unit_rate));
}

function addTotalByRoutingBucket(totals: Record<string, number>, line: JsonRecord) {
  const label = (
    toStringOrNull(line.section)
    ?? ""
  ).toLowerCase();
  const total = getProjectPurchaseOrderLineTotal(line);

  if (label.includes("material")) {
    totals.materialTotal += total;
    return;
  }
  if (label.includes("labour") || label.includes("labor")) {
    totals.labourTotal += total;
    return;
  }
  if (label.includes("subcontract")) {
    totals.subcontractorTotal += total;
    return;
  }
  if (label.includes("plant") || label.includes("equipment")) {
    totals.plantTotal += total;
    return;
  }
  totals.otherTotal += total;
}

function buildSectionMix(lineItems: JsonRecord[]) {
  const counts = new Map<string, number>();
  for (const line of lineItems) {
    const key = toStringOrNull(line.section)?.trim() || "Unsectioned";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

function buildProjectQuoteSummary(input: {
  row: JsonRecord;
  lineItems: JsonRecord[];
  clientContext: ReturnType<typeof buildProjectQuoteClientContext>;
  projectContext: ReturnType<typeof buildProjectQuoteProjectContext>;
  opportunityContext: ReturnType<typeof buildProjectQuoteOpportunityContext>;
}) {
  const totalsBySection = {
    materialTotal: 0,
    labourTotal: 0,
    subcontractorTotal: 0,
    plantTotal: 0,
    otherTotal: 0,
  };
  for (const line of input.lineItems) {
    addTotalByRoutingBucket(totalsBySection, line);
  }

  const lineDescriptions = input.lineItems
    .map((line) => toStringOrNull(line.description))
    .filter((description): description is string => Boolean(description));
  const sectionsUsed = uniqueNonEmpty(input.lineItems.map((line) => toStringOrNull(line.section)));
  const status = toStringOrNull(input.row.status) ?? "";
  const normalizedStatus = status.toLowerCase();
  const lineCount = input.lineItems.length;
  const optionalLineCount = input.lineItems.filter((line) => line.is_optional === true).length;
  const includedLineCount = Math.max(0, lineCount - optionalLineCount);
  const total = toNumberOrZero(input.row.total_quote_price);
  const title = toStringOrNull(input.row.quote_title) ?? "";
  const isPlaceholderTitle = /draft|placeholder|test quote|tbd/i.test(title);
  const hasUsefulLineItems = lineCount > 0 && lineDescriptions.length > 0;
  const hasClient = Boolean(input.clientContext.clientId || input.clientContext.clientName);
  const hasProject = Boolean(input.projectContext.projectId || input.projectContext.projectName);
  const hasOpportunity = Boolean(input.opportunityContext.opportunityId || input.opportunityContext.opportunityName);
  const hasZeroValue = total <= 0;

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (!hasUsefulLineItems || hasZeroValue || !hasClient || isPlaceholderTitle) {
    evidenceStrength = "weak";
  }
  if ((normalizedStatus === "accepted" || normalizedStatus === "sent") && hasUsefulLineItems && !hasZeroValue && hasClient) {
    evidenceStrength = "strong";
  }

  return {
    lineCount,
    optionalLineCount,
    includedLineCount,
    sectionsUsed,
    sectionMix: buildSectionMix(input.lineItems),
    hasUsefulLineItems,
    hasClient,
    hasProject,
    hasOpportunity,
    hasZeroValue,
    isPlaceholderTitle,
    hasAcceptedStatus: normalizedStatus === "accepted",
    hasSentStatus: normalizedStatus === "sent",
    hasRejectedStatus: normalizedStatus === "rejected",
    hasExpiredStatus: normalizedStatus === "expired",
    isDraftLike: !["accepted", "sent", "rejected", "expired"].includes(normalizedStatus),
    totalsBySection,
    evidenceStrength,
  };
}

function addUniqueValue(target: Set<string>, value: string | null) {
  if (value) {
    target.add(value);
  }
}

function diffHours(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const fromAt = new Date(from);
  const toAt = new Date(to);
  if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime())) {
    return null;
  }
  return Math.max(0, Math.round(((toAt.getTime() - fromAt.getTime()) / 3_600_000) * 100) / 100);
}

function countCompletedChecks(value: unknown) {
  const record = toRecord(value);
  return Object.values(record).filter((entry) => entry === true).length;
}

function toIsoString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function diffDurationSummary(from: string | null, to: string | null) {
  if (!from || !to) {
    return null;
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }
  const deltaMs = Math.max(0, toDate.getTime() - fromDate.getTime());
  const hours = Math.round((deltaMs / (1000 * 60 * 60)) * 10) / 10;
  const days = Math.round((deltaMs / (1000 * 60 * 60 * 24)) * 10) / 10;
  return {
    hours,
    days,
  };
}

function buildSupplierInvoiceAllocationLifecycleStage(input: {
  row: JsonRecord;
  postedEventCount: number;
  reversalCount: number;
  successorAllocationIds: string[];
}) {
  const approvalStatus = toStringOrNull(input.row.approval_status)?.toLowerCase();
  const reviewStatus = toStringOrNull(input.row.review_status)?.toLowerCase();
  const allocationStatus = toStringOrNull(input.row.allocation_status)?.toLowerCase();
  const matchStatus = toStringOrNull(input.row.match_status)?.toLowerCase();
  const editState = toStringOrNull(input.row.edit_state)?.toLowerCase();
  const hasSupersedes = Boolean(toStringOrNull(input.row.supersedes_allocation_id));

  if (approvalStatus === "disputed" || reviewStatus === "disputed") {
    return "disputed";
  }
  if (editState === "reversed" || input.reversalCount > 0) {
    return "reversed";
  }
  if (hasSupersedes || input.successorAllocationIds.length > 0) {
    return "corrected";
  }
  if (input.postedEventCount > 0) {
    return "posted";
  }
  if (approvalStatus === "approved") {
    return "approved_pending_posting";
  }
  if (reviewStatus === "needs_routing_review" || reviewStatus === "needs_accounting_mapping" || reviewStatus === "high_value_review") {
    return "review_blocked";
  }
  if (allocationStatus === "matched" || allocationStatus === "partially_matched" || allocationStatus === "split" || matchStatus === "accepted" || matchStatus === "adjusted") {
    return "matched_pending_review";
  }
  return "drafted";
}

function buildSupplierInvoiceAllocationMatchedBasis(input: {
  row: JsonRecord;
  purchaseOrderMatch: JsonRecord | null;
}) {
  const allocationStatus = toStringOrNull(input.row.allocation_status)?.toLowerCase();
  const hasPurchaseOrderLine = Boolean(toStringOrNull(input.row.purchase_order_line_item_id));
  if (allocationStatus === "unmatched" || !hasPurchaseOrderLine) {
    return {
      basis: "unmatched",
      matchEvidence: "no_purchase_order_line",
    };
  }
  if (allocationStatus === "split") {
    return {
      basis: "split_matched",
      matchEvidence: toStringOrNull(input.purchaseOrderMatch?.match_status) ?? "allocation_split",
    };
  }
  return {
    basis: "matched_to_purchase_order_line",
    matchEvidence: toStringOrNull(input.purchaseOrderMatch?.match_status) ?? toStringOrNull(input.row.match_status),
  };
}

function buildSupplierInvoiceAllocationPostingReadiness(row: JsonRecord) {
  const approvalStatus = toStringOrNull(row.approval_status)?.toLowerCase();
  const allocationStatus = toStringOrNull(row.allocation_status)?.toLowerCase();
  const hasProject = Boolean(toStringOrNull(row.project_id));
  const hasPurchaseOrder = Boolean(toStringOrNull(row.purchase_order_id));
  const hasPurchaseOrderLine = Boolean(toStringOrNull(row.purchase_order_line_item_id));
  const hasRouting = row.tradesstack_cost_code !== null && row.tradesstack_cost_code !== undefined;
  const hasOrganizationCostCode = Boolean(toStringOrNull(row.organization_cost_code_id));

  const readyToPost = approvalStatus === "approved" && hasProject && (
    allocationStatus === "unmatched"
      ? hasRouting
      : hasPurchaseOrder && hasPurchaseOrderLine && hasRouting && hasOrganizationCostCode
  );

  return {
    approved: approvalStatus === "approved",
    hasProject,
    hasPurchaseOrder,
    hasPurchaseOrderLine,
    hasRouting,
    hasOrganizationCostCode,
    readyToPost,
  };
}

function buildSupplierInvoiceAllocationSummary(input: {
  row: JsonRecord;
  invoice: JsonRecord | null;
  invoiceLine: JsonRecord | null;
  invoiceDocuments: JsonRecord[];
  purchaseOrderMatch: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  purchaseOrderLine: JsonRecord | null;
  projectContext: ReturnType<typeof buildSupplierInvoiceAllocationProjectContext>;
  supplierContext: ReturnType<typeof buildSupplierInvoiceAllocationSupplierContext>;
  actualCostEvents: JsonRecord[];
  siblingAllocations: JsonRecord[];
  successorAllocationIds: string[];
}) {
  const postedEvents = input.actualCostEvents.filter((event) =>
    (toStringOrNull(event.event_type)?.toLowerCase() ?? "posting") === "posting"
    && toStringOrNull(event.event_status)?.toLowerCase() === "posted",
  );
  const reversalEvents = input.actualCostEvents.filter((event) =>
    toStringOrNull(event.event_type)?.toLowerCase() === "reversal"
    || toStringOrNull(event.event_status)?.toLowerCase() === "reversed",
  );
  const documentTypes = uniqueNonEmpty(input.invoiceDocuments.map((document) => toStringOrNull(document.document_type)));
  const splitGroupRows = uniqueNonEmpty(input.siblingAllocations
    .filter((allocation) => toStringOrNull(allocation.allocation_group_id) === toStringOrNull(input.row.allocation_group_id))
    .map((allocation) => toStringOrNull(allocation.id)));
  const postingReadiness = buildSupplierInvoiceAllocationPostingReadiness(input.row);
  const approvalNoteSummary = buildSupplierInvoiceAllocationApprovalNoteSummary(toStringOrNull(input.row.approval_notes));
  const lifecycleStage = buildSupplierInvoiceAllocationLifecycleStage({
    row: input.row,
    postedEventCount: postedEvents.length,
    reversalCount: reversalEvents.length,
    successorAllocationIds: input.successorAllocationIds,
  });
  const matchedBasis = buildSupplierInvoiceAllocationMatchedBasis({
    row: input.row,
    purchaseOrderMatch: input.purchaseOrderMatch,
  });
  const createdAt = toIsoString(input.row.created_at);
  const reviewedAt = toIsoString(input.row.reviewed_at);
  const approvedAt = toIsoString(input.row.approved_at);
  const firstPostedAt = uniqueNonEmpty(postedEvents.map((event) => toIsoString(event.created_at))).sort()[0] ?? null;
  const invoiceDate = toIsoString(input.invoice?.invoice_date);

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (!input.invoiceLine || !input.supplierContext.supplierId || !input.projectContext.projectId) {
    evidenceStrength = "weak";
  } else if (postingReadiness.readyToPost || postedEvents.length > 0 || reversalEvents.length > 0) {
    evidenceStrength = "strong";
  }

  return {
    createdAt,
    reviewedAt,
    approvedAt,
    firstPostedAt,
    documentCount: input.invoiceDocuments.length,
    documentTypes,
    postedEvents,
    reversalEvents,
    splitGroupRows,
    postingReadiness,
    approvalNoteSummary,
    lifecycleStage,
    matchedBasis,
    evidenceStrength,
    allocationLag: diffDurationSummary(invoiceDate, createdAt),
    reviewLag: diffDurationSummary(createdAt, reviewedAt),
    postingLag: diffDurationSummary(createdAt, firstPostedAt),
  };
}

function appendUniqueValue(target: JsonRecord, key: string, value: unknown) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  const current = Array.isArray(target[key]) ? (target[key] as unknown[]) : [];
  if (!current.some((entry) => String(entry) === String(value))) {
    target[key] = [...current, value];
  }
}

function truncateText(value: string | null, limit = 160) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function formatDateLabel(value: unknown) {
  const iso = toIsoString(value);
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildTaskLifecycleStage(row: JsonRecord) {
  if (toIsoString(row.deleted_at)) return "deleted";
  if (toIsoString(row.archived_at) || toStringOrNull(row.status) === "Archived") return "archived";
  if (toIsoString(row.completed_at) || toStringOrNull(row.status) === "Done" || row.is_completed === true) return "completed";
  if (toStringOrNull(row.status) === "Need Review") return "need_review";
  if (toStringOrNull(row.status) === "In Progress") return "in_progress";
  return "open";
}

function buildTaskAssignmentState(row: JsonRecord) {
  return toStringOrNull(row.assigned_user_id) ? "assigned" : "unassigned";
}

function buildTaskDueState(row: JsonRecord) {
  const lifecycleStage = buildTaskLifecycleStage(row);
  const dueAt = toIsoString(row.due_at);
  const dueDate = toStringOrNull(row.due_date);
  const reference = dueAt ?? (dueDate ? `${dueDate}T23:59:59.999Z` : null);
  if (!reference) return "unscheduled";
  if (lifecycleStage === "completed" || lifecycleStage === "archived" || lifecycleStage === "deleted") return "closed_with_due_date";
  const due = new Date(reference);
  if (Number.isNaN(due.getTime())) return "scheduled";
  return due.getTime() < Date.now() ? "overdue" : "scheduled";
}

function buildTaskLinkageCompleteness(input: {
  row: JsonRecord;
  issue: JsonRecord | null;
  inspection: JsonRecord | null;
  inspectionItem: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  variation: JsonRecord | null;
  quote: JsonRecord | null;
}) {
  const requested = [
    toStringOrNull(input.row.linked_issue_id),
    toStringOrNull(input.row.linked_inspection_id),
    toStringOrNull(input.row.linked_inspection_item_id),
    toStringOrNull(input.row.linked_purchase_order_id),
    toStringOrNull(input.row.linked_variation_id),
    toStringOrNull(input.row.linked_quote_id),
  ].filter((value): value is string => Boolean(value));
  const resolved = [
    input.issue,
    input.inspection,
    input.inspectionItem,
    input.purchaseOrder,
    input.variation,
    input.quote,
  ].filter(Boolean).length;
  if (requested.length === 0) return "unlinked";
  if (resolved === requested.length) return "complete";
  if (resolved === 0) return "missing";
  return "partial";
}

function buildTaskEvidenceStrength(input: {
  activityCount: number;
  commentCount: number;
  canonicalAttachmentCount: number;
  projectId: string | null;
  clientId: string | null;
  linkageCompleteness: string;
}) {
  if (!input.projectId || (input.linkageCompleteness === "missing" && input.activityCount === 0)) {
    return "weak" as UniversalLearningRecordStrength;
  }
  if (
    input.activityCount >= 2
    && (input.commentCount > 0 || input.canonicalAttachmentCount > 0)
    && Boolean(input.clientId)
    && input.linkageCompleteness !== "missing"
  ) {
    return "strong" as UniversalLearningRecordStrength;
  }
  return "normal" as UniversalLearningRecordStrength;
}

function summarizeTaskComments(comments: JsonRecord[]) {
  const active = comments.filter((comment) => !toIsoString(comment.deleted_at));
  const deletedCount = comments.length - active.length;
  const latest = active[active.length - 1] ?? null;
  return {
    commentCount: active.length,
    deletedCommentCount: deletedCount,
    latestCommentAt: formatDateLabel(latest?.created_at),
    latestCommentPreview: truncateText(toStringOrNull(latest?.comment), 120),
    commenterIds: uniqueNonEmpty(active.map((comment) => toStringOrNull(comment.user_id))),
  };
}

function summarizeTaskActivity(activity: JsonRecord[]) {
  const eventTypes = uniqueNonEmpty(activity.map((event) => toStringOrNull(event.event_type)));
  const latest = activity[activity.length - 1] ?? null;
  return {
    activityCount: activity.length,
    eventTypes,
    latestActivityAt: formatDateLabel(latest?.created_at),
    latestEventType: toStringOrNull(latest?.event_type),
    actorUserIds: uniqueNonEmpty(activity.map((event) => toStringOrNull(event.actor_user_id))),
  };
}

function summarizeTaskAttachments(attachments: JsonRecord[]) {
  const active = attachments.filter((attachment) => !toIsoString(attachment.deleted_at));
  return {
    attachmentCount: active.length,
    attachmentTypes: uniqueNonEmpty(active.map((attachment) => toStringOrNull(attachment.attachment_type))),
    mimeTypes: uniqueNonEmpty(active.map((attachment) => toStringOrNull(attachment.mime_type))),
    attachmentNames: uniqueNonEmpty(active.map((attachment) => truncateText(toStringOrNull(attachment.file_name), 80))),
    latestAttachmentAt: formatDateLabel(active[active.length - 1]?.created_at),
  };
}

function summarizeLegacyTaskAttachments(attachments: JsonRecord[]) {
  return {
    legacyAttachmentCount: attachments.length,
    legacyAttachmentNames: uniqueNonEmpty(attachments.map((attachment) => truncateText(toStringOrNull(attachment.file_name), 80))),
    latestLegacyAttachmentAt: formatDateLabel(attachments[attachments.length - 1]?.created_at),
  };
}

function buildProjectPurchaseOrderReadOnlyRoutingContext(input: {
  lineItems: JsonRecord[];
  enrichment: ProjectPurchaseOrderEnrichment;
}) {
  const context: JsonRecord = { readOnly: true };
  for (const line of input.lineItems) {
    const costItemId = toStringOrNull(line.cost_item_id);
    const sourceCostItemId = toStringOrNull(line.source_cost_item_id);
    for (const source of [
      costItemId ? input.enrichment.costItemsById.get(costItemId) ?? null : null,
      sourceCostItemId ? input.enrichment.costItemsById.get(sourceCostItemId) ?? null : null,
    ]) {
      if (!source) continue;
      appendUniqueValue(context, "tradesstack_cost_codeValues", source.tradesstack_cost_code);
      appendUniqueValue(context, "tradesstack_cost_code_labelValues", source.tradesstack_cost_code_label);
      appendUniqueValue(context, "accounting_mapping_idValues", source.accounting_mapping_id);
    }
  }
  return context;
}

function buildProjectQuoteReadOnlyRoutingContext() {
  return {
    readOnly: true,
  };
}

function buildProjectVariationReadOnlyRoutingContext(mirroredCostItems: JsonRecord[]) {
  const tradesstackCostCodes = uniqueNonEmpty(mirroredCostItems.map((item) =>
    item.tradesstack_cost_code == null || item.tradesstack_cost_code === ""
      ? null
      : String(item.tradesstack_cost_code)));
  const tradesstackCostCodeLabels = uniqueNonEmpty(mirroredCostItems.map((item) => toStringOrNull(item.tradesstack_cost_code_label)));
  const accountingMappingIds = uniqueNonEmpty(mirroredCostItems.map((item) => toStringOrNull(item.accounting_mapping_id)));
  const organizationCostCodeIds = uniqueNonEmpty(mirroredCostItems.map((item) => toStringOrNull(item.organization_cost_code_id)));

  return {
    readOnly: true,
    ...(tradesstackCostCodes.length > 0 ? { tradesstack_cost_codeValues: tradesstackCostCodes } : {}),
    ...(tradesstackCostCodeLabels.length > 0 ? { tradesstack_cost_code_labelValues: tradesstackCostCodeLabels } : {}),
    ...(accountingMappingIds.length > 0 ? { accounting_mapping_idValues: accountingMappingIds } : {}),
    ...(organizationCostCodeIds.length > 0 ? { organization_cost_code_idValues: organizationCostCodeIds } : {}),
  };
}

function buildSupplierInvoiceAllocationReadOnlyRoutingContext(row: JsonRecord) {
  return pruneEmptyObject({
    readOnly: true,
    tradesstack_cost_code: row.tradesstack_cost_code,
    tradesstack_cost_code_label: row.tradesstack_cost_code_label,
    accounting_mapping_id: row.accounting_mapping_id,
    organization_cost_code_id: row.organization_cost_code_id,
  }) ?? { readOnly: true };
}

function buildProjectClaimReadOnlyRoutingContext(input: {
  row: JsonRecord;
  lineItems: JsonRecord[];
  enrichment: ProjectClaimEnrichment;
}) {
  const context: JsonRecord = { readOnly: true };
  const claimId = toStringOrNull(input.row.id);
  const mirroredCostItems = claimId ? input.enrichment.mirroredCostItemsByClaimId.get(claimId) ?? [] : [];

  for (const source of [
    ...mirroredCostItems,
    ...input.lineItems.flatMap((line) => {
      const costItemId = toStringOrNull(line.cost_item_id);
      const sourceCostItemId = toStringOrNull(line.source_cost_item_id);
      return [
        costItemId ? input.enrichment.costItemsById.get(costItemId) ?? null : null,
        sourceCostItemId ? input.enrichment.costItemsById.get(sourceCostItemId) ?? null : null,
      ];
    }),
  ]) {
    if (!source) continue;
    appendUniqueValue(context, "tradesstack_cost_code", source.tradesstack_cost_code);
    appendUniqueValue(context, "tradesstack_cost_code_label", source.tradesstack_cost_code_label);
    appendUniqueValue(context, "accounting_mapping_id", source.accounting_mapping_id);
    appendUniqueValue(context, "organization_cost_code_id", (source as JsonRecord).organization_cost_code_id);
  }

  return context;
}

function buildProjectTimeSheetEntryReadOnlyRoutingContext(input: {
  syncedLines: JsonRecord[];
  enrichment: ProjectTimeSheetEntryEnrichment;
}) {
  const context: JsonRecord = { readOnly: true };
  for (const line of input.syncedLines) {
    const costItemId = toStringOrNull(line.cost_item_id);
    const sourceCostItemId = toStringOrNull(line.source_cost_item_id);
    for (const source of [
      costItemId ? input.enrichment.costItemsById.get(costItemId) ?? null : null,
      sourceCostItemId ? input.enrichment.costItemsById.get(sourceCostItemId) ?? null : null,
    ]) {
      if (!source) continue;
      appendUniqueValue(context, "tradesstack_cost_codeValues", source.tradesstack_cost_code);
      appendUniqueValue(context, "tradesstack_cost_code_labelValues", source.tradesstack_cost_code_label);
      appendUniqueValue(context, "accounting_mapping_idValues", source.accounting_mapping_id);
      appendUniqueValue(context, "organization_cost_code_idValues", source.organization_cost_code_id);
    }
  }
  return context;
}

function buildTaskProjectContext(row: JsonRecord, enrichment: TaskEnrichment) {
  const projectId = toStringOrNull(row.project_id);
  const project = projectId ? enrichment.projectsById.get(projectId) ?? null : null;
  const clientId = toStringOrNull(project?.client_id);
  const client = clientId ? enrichment.clientsById.get(clientId) ?? null : null;
  const projectOpportunityId = toStringOrNull(project?.source_opportunity_id);
  const rowOpportunityId = toStringOrNull(row.opportunity_id);
  const opportunityId = rowOpportunityId ?? projectOpportunityId;
  const opportunity = opportunityId ? enrichment.opportunitiesById.get(opportunityId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    siteAddress: toStringOrNull(project?.location),
    clientId,
    clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
    clientStatus: toStringOrNull(client?.client_status),
    opportunityId,
    opportunityName: toStringOrNull(opportunity?.name),
    opportunityCode: toStringOrNull(opportunity?.opportunity_code),
    opportunityStage: toStringOrNull(opportunity?.stage),
  };
}

function buildTaskReadOnlyRoutingContext() {
  return { readOnly: true };
}

function buildTaskTrustBoundaryPayload(input: {
  row: JsonRecord;
  activity: JsonRecord[];
  comments: JsonRecord[];
  attachments: JsonRecord[];
  links: JsonRecord[];
  legacyAttachments: JsonRecord[];
  projectContext: ReturnType<typeof buildTaskProjectContext>;
  qualityIssue: JsonRecord | null;
  inspection: JsonRecord | null;
  inspectionItem: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  variation: JsonRecord | null;
  quote: JsonRecord | null;
}) {
  const lifecycleStage = buildTaskLifecycleStage(input.row);
  const dueState = buildTaskDueState(input.row);
  const assignmentState = buildTaskAssignmentState(input.row);
  const activitySummary = summarizeTaskActivity(input.activity);
  const commentSummary = summarizeTaskComments(input.comments);
  const attachmentSummary = summarizeTaskAttachments(input.attachments);
  const legacyAttachmentSummary = summarizeLegacyTaskAttachments(input.legacyAttachments);
  const linkageCompleteness = buildTaskLinkageCompleteness({
    row: input.row,
    issue: input.qualityIssue,
    inspection: input.inspection,
    inspectionItem: input.inspectionItem,
    purchaseOrder: input.purchaseOrder,
    variation: input.variation,
    quote: input.quote,
  });
  const evidenceStrength = buildTaskEvidenceStrength({
    activityCount: activitySummary.activityCount,
    commentCount: commentSummary.commentCount,
    canonicalAttachmentCount: attachmentSummary.attachmentCount,
    projectId: input.projectContext.projectId,
    clientId: input.projectContext.clientId,
    linkageCompleteness,
  });
  const latestRestoreEvent = [...input.activity]
    .reverse()
    .find((event) => toStringOrNull(event.event_type) === "restored") ?? null;
  const closeEventTypes = new Set(["completed", "reopened", "archived", "deleted", "restored"]);
  const closeEvents = input.activity.filter((event) => closeEventTypes.has(toStringOrNull(event.event_type) ?? ""));

  return {
    sourceEvidence: {
      taskSnapshot: {
        taskId: toStringOrNull(input.row.id),
        sourceType: toStringOrNull(input.row.source_type),
        sourceId: toStringOrNull(input.row.source_id),
        createdAt: formatDateLabel(input.row.created_at),
        updatedAt: formatDateLabel(input.row.updated_at),
      },
      titleDescriptionSummary: {
        title: truncateText(toStringOrNull(input.row.title), 120),
        descriptionPreview: truncateText(toStringOrNull(input.row.description), 200),
        hasDescription: Boolean(truncateText(toStringOrNull(input.row.description), 200)),
      },
      taskStateSummary: {
        status: toStringOrNull(input.row.status),
        priority: toStringOrNull(input.row.priority),
        taskType: toStringOrNull(input.row.task_type),
        dueDate: toStringOrNull(input.row.due_date),
        dueAt: formatDateLabel(input.row.due_at),
        completedAt: formatDateLabel(input.row.completed_at),
        archivedAt: formatDateLabel(input.row.archived_at),
        deletedAt: formatDateLabel(input.row.deleted_at),
        isCompleted: input.row.is_completed === true,
      },
      assigneeSnapshot: {
        assigneeId: toStringOrNull(input.row.assigned_user_id),
        assignmentState,
      },
      projectSnapshot: {
        projectId: input.projectContext.projectId,
        projectName: input.projectContext.projectName,
        projectCode: input.projectContext.projectCode,
        projectStatus: input.projectContext.projectStatus,
        siteAddress: input.projectContext.siteAddress,
      },
      clientSnapshot: input.projectContext.clientId ? {
        clientId: input.projectContext.clientId,
        clientName: input.projectContext.clientName,
        clientStatus: input.projectContext.clientStatus,
      } : null,
      opportunitySnapshot: input.projectContext.opportunityId ? {
        opportunityId: input.projectContext.opportunityId,
        opportunityName: input.projectContext.opportunityName,
        opportunityCode: input.projectContext.opportunityCode,
        opportunityStage: input.projectContext.opportunityStage,
      } : null,
      linkedQASnapshots: pruneEmptyObject({
        linkedIssue: input.qualityIssue ? {
          issueId: toStringOrNull(input.qualityIssue.id),
          title: truncateText(toStringOrNull(input.qualityIssue.title), 120),
          status: toStringOrNull(input.qualityIssue.status),
          priority: toStringOrNull(input.qualityIssue.priority),
          trade: toStringOrNull(input.qualityIssue.trade),
        } : null,
        linkedInspection: input.inspection ? {
          inspectionId: toStringOrNull(input.inspection.id),
          title: truncateText(toStringOrNull(input.inspection.title), 120),
          trade: toStringOrNull(input.inspection.trade),
          dueDate: toStringOrNull(input.inspection.due_date),
        } : null,
        linkedInspectionItem: input.inspectionItem ? {
          inspectionItemId: toStringOrNull(input.inspectionItem.id),
          inspectionId: toStringOrNull(input.inspectionItem.inspection_id),
          label: truncateText(toStringOrNull(input.inspectionItem.label), 120),
          status: toStringOrNull(input.inspectionItem.status),
        } : null,
      }),
      linkedCommercialSnapshots: pruneEmptyObject({
        linkedPurchaseOrder: input.purchaseOrder ? {
          purchaseOrderId: toStringOrNull(input.purchaseOrder.id),
          purchaseOrderNumber: toStringOrNull(input.purchaseOrder.purchase_order_number),
          purchaseOrderTitle: truncateText(toStringOrNull(input.purchaseOrder.purchase_order_title), 120),
          status: toStringOrNull(input.purchaseOrder.status),
        } : null,
        linkedVariation: input.variation ? {
          variationId: toStringOrNull(input.variation.id),
          variationNumber: toStringOrNull(input.variation.variation_number),
          variationTitle: truncateText(toStringOrNull(input.variation.variation_title), 120),
          status: toStringOrNull(input.variation.status),
          totalVariationPrice: input.variation.total_variation_price ?? null,
        } : null,
        linkedQuote: input.quote ? {
          quoteId: toStringOrNull(input.quote.id),
          quoteNumber: toStringOrNull(input.quote.quote_number),
          quoteTitle: truncateText(toStringOrNull(input.quote.quote_title), 120),
          status: toStringOrNull(input.quote.status),
          totalQuotePrice: input.quote.total_quote_price ?? null,
        } : null,
      }),
      activitySummary,
      commentSummary,
      attachmentSummary,
      taskLinkSummary: {
        taskLinkCount: input.links.length,
        linkedTypes: uniqueNonEmpty(input.links.map((link) => toStringOrNull(link.linked_type))),
      },
      lifecycleEventSummary: {
        lifecycleStage,
        closeEventCount: closeEvents.length,
        closeEventTypes: uniqueNonEmpty(closeEvents.map((event) => toStringOrNull(event.event_type))),
        reopenedAt: formatDateLabel([...input.activity].reverse().find((event) => toStringOrNull(event.event_type) === "reopened")?.created_at),
        archivedAt: formatDateLabel([...input.activity].reverse().find((event) => toStringOrNull(event.event_type) === "archived")?.created_at),
        deletedAt: formatDateLabel([...input.activity].reverse().find((event) => toStringOrNull(event.event_type) === "deleted")?.created_at),
        restoredAt: formatDateLabel(latestRestoreEvent?.created_at),
      },
    },
    operationalContext: {
      lifecycleStage,
      dueState,
      overdue: dueState === "overdue",
      assignmentState,
      linkageCompleteness,
      commentVolume: commentSummary.commentCount,
      activityVolume: activitySummary.activityCount,
      attachmentEvidenceState: attachmentSummary.attachmentCount > 0 ? "canonical_present" : "none",
      evidenceStrength,
      canonicalVsLegacyAttachmentState:
        attachmentSummary.attachmentCount > 0 && legacyAttachmentSummary.legacyAttachmentCount > 0
          ? "canonical_with_legacy_compatibility"
          : attachmentSummary.attachmentCount > 0
            ? "canonical_only"
            : legacyAttachmentSummary.legacyAttachmentCount > 0
              ? "legacy_only"
              : "none",
      hasLinkedCommercialContext: Boolean(input.purchaseOrder || input.variation || input.quote),
      hasLinkedQaContext: Boolean(input.qualityIssue || input.inspection || input.inspectionItem),
    },
    lineageContext: {
      organizationId: toStringOrNull(input.row.organization_id),
      projectId: input.projectContext.projectId,
      opportunityId: input.projectContext.opportunityId,
      clientId: input.projectContext.clientId,
      taskId: toStringOrNull(input.row.id),
      assigneeId: toStringOrNull(input.row.assigned_user_id),
      createdBy: toStringOrNull(input.row.created_by),
      updatedBy: toStringOrNull(input.row.updated_by),
      completedBy: toStringOrNull(input.row.completed_by),
      archivedBy: toStringOrNull(input.row.archived_by),
      deletedBy: toStringOrNull(input.row.deleted_by),
      restoredBy: toStringOrNull(latestRestoreEvent?.actor_user_id),
      activityIds: uniqueNonEmpty(input.activity.map((event) => toStringOrNull(event.id))),
      commentIds: uniqueNonEmpty(input.comments.map((comment) => toStringOrNull(comment.id))),
      attachmentIds: uniqueNonEmpty(input.attachments.map((attachment) => toStringOrNull(attachment.id))),
      legacyAttachmentIds: uniqueNonEmpty(input.legacyAttachments.map((attachment) => toStringOrNull(attachment.id))),
      taskLinkIds: uniqueNonEmpty(input.links.map((link) => toStringOrNull(link.id))),
      linkedEntityIds: pruneEmptyObject({
        linkedIssueId: toStringOrNull(input.row.linked_issue_id),
        linkedInspectionId: toStringOrNull(input.row.linked_inspection_id),
        linkedInspectionItemId: toStringOrNull(input.row.linked_inspection_item_id),
        linkedPurchaseOrderId: toStringOrNull(input.row.linked_purchase_order_id),
        linkedVariationId: toStringOrNull(input.row.linked_variation_id),
        linkedQuoteId: toStringOrNull(input.row.linked_quote_id),
        linkedClientId: toStringOrNull(input.row.linked_client_id),
      }),
      sourceTable: "project_job_todos",
      sourceId: toStringOrNull(input.row.id),
    },
  };
}

function buildProjectActualCostEventSupplierContext(input: {
  row: JsonRecord;
  invoice: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  enrichment: ProjectActualCostEventEnrichment;
}) {
  const supplierId = toStringOrNull(input.row.supplier_id)
    ?? toStringOrNull(input.invoice?.supplier_id)
    ?? toStringOrNull(input.purchaseOrder?.supplier_id);
  const supplier = supplierId ? input.enrichment.suppliersById.get(supplierId) ?? null : null;

  return {
    supplierId,
    supplierName:
      toStringOrNull(supplier?.company_name)
      ?? toStringOrNull(supplier?.name)
      ?? toStringOrNull(input.purchaseOrder?.issued_to_label)
      ?? toStringOrNull(input.purchaseOrder?.supplier_name_snapshot),
  };
}

function buildProjectActualCostEventProjectContext(input: {
  row: JsonRecord;
  allocation: JsonRecord | null;
  invoiceLine: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  purchaseOrderLine: JsonRecord | null;
  enrichment: ProjectActualCostEventEnrichment;
}) {
  const projectId = toStringOrNull(input.row.project_id)
    ?? toStringOrNull(input.allocation?.project_id)
    ?? toStringOrNull(input.invoiceLine?.project_id)
    ?? toStringOrNull(input.purchaseOrder?.project_id)
    ?? toStringOrNull(input.purchaseOrderLine?.project_id);
  const project = projectId ? input.enrichment.projectsById.get(projectId) ?? null : null;
  const clientId = toStringOrNull(project?.client_id);
  const client = clientId ? input.enrichment.clientsById.get(clientId) ?? null : null;

  return {
    projectId,
    projectName: toStringOrNull(project?.name),
    projectCode: toStringOrNull(project?.project_code),
    projectStatus: toStringOrNull(project?.stage),
    clientId,
    clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
  };
}

function buildProjectActualCostEventLedgerMeaning(input: {
  row: JsonRecord;
  allocation: JsonRecord | null;
}) {
  const eventType = toStringOrNull(input.row.event_type)?.toLowerCase();
  const postingSource = toStringOrNull(input.row.posting_source)?.toLowerCase();
  const correctionRootEventId = toStringOrNull(input.row.correction_root_event_id);
  const eventId = toStringOrNull(input.row.id);
  const allocationSupersedes = Boolean(toStringOrNull(input.allocation?.supersedes_allocation_id));

  if (postingSource === "manual_adjustment") {
    return {
      ledgerLabel: "manual_adjustment",
      meaning: "Manual cost adjustment posted directly to the project cost ledger.",
    };
  }
  if (eventType === "reversal") {
    return {
      ledgerLabel: "reversal",
      meaning: "A previously posted actual cost was reversed to correct project cost truth.",
    };
  }
  if (correctionRootEventId && eventId && correctionRootEventId !== eventId) {
    return {
      ledgerLabel: "repost",
      meaning: "A corrected actual cost was reposted within an existing correction chain.",
    };
  }
  if (allocationSupersedes) {
    return {
      ledgerLabel: "corrected",
      meaning: "This posting came from a successor allocation created during a correction workflow.",
    };
  }
  if (postingSource === "system") {
    return {
      ledgerLabel: "system_posted",
      meaning: "System-created actual cost posting.",
    };
  }
  return {
    ledgerLabel: "posting",
    meaning: "Approved commercial cost posted to the project cost ledger.",
  };
}

function buildProjectActualCostEventMatchedBasis(input: {
  row: JsonRecord;
  allocation: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  purchaseOrderLine: JsonRecord | null;
}) {
  if (toStringOrNull(input.row.posting_source)?.toLowerCase() === "manual_adjustment") {
    return {
      basis: "manual_adjustment",
      matchEvidence: "manual_adjustment",
    };
  }
  if (toStringOrNull(input.allocation?.allocation_status)?.toLowerCase() === "unmatched") {
    return {
      basis: "unmatched_allocation",
      matchEvidence: toStringOrNull(input.allocation?.match_status) ?? "unmatched",
    };
  }
  if (toStringOrNull(input.purchaseOrderLine?.id)) {
    return {
      basis: "matched_to_purchase_order_line",
      matchEvidence: toStringOrNull(input.allocation?.match_status) ?? "matched",
    };
  }
  if (toStringOrNull(input.purchaseOrder?.id)) {
    return {
      basis: "matched_to_purchase_order",
      matchEvidence: toStringOrNull(input.allocation?.match_status) ?? "matched",
    };
  }
  return {
    basis: "lineage_incomplete",
    matchEvidence: toStringOrNull(input.allocation?.match_status) ?? "unknown",
  };
}

function buildProjectActualCostEventPostingLag(input: {
  invoice: JsonRecord | null;
  row: JsonRecord;
}) {
  return diffDurationSummary(
    toIsoString(input.invoice?.invoice_date),
    toIsoString(input.row.created_at),
  );
}

function buildProjectActualCostEventLifecycleStage(input: {
  row: JsonRecord;
  allocation: JsonRecord | null;
  projectContext: ReturnType<typeof buildProjectActualCostEventProjectContext>;
}) {
  const eventType = toStringOrNull(input.row.event_type)?.toLowerCase();
  const postingSource = toStringOrNull(input.row.posting_source)?.toLowerCase();
  const correctionRootEventId = toStringOrNull(input.row.correction_root_event_id);
  const eventId = toStringOrNull(input.row.id);
  const hasIncompleteSupplierInvoiceLineage =
    toStringOrNull(input.row.source_type)?.toLowerCase() === "supplier_invoice"
    && (!toStringOrNull(input.row.source_invoice_allocation_id) || !toStringOrNull(input.row.source_invoice_line_id));

  if (postingSource === "manual_adjustment") return "manual_adjustment_posted";
  if (postingSource === "system") return "system_posted";
  if (!input.projectContext.projectId || hasIncompleteSupplierInvoiceLineage) return "incomplete_lineage";
  if (eventType === "reversal") return "reversed";
  if (correctionRootEventId && eventId && correctionRootEventId !== eventId) return "reposted";
  if (toStringOrNull(input.allocation?.supersedes_allocation_id)) return "corrected";
  return "posted";
}

function buildProjectActualCostEventSummary(input: {
  row: JsonRecord;
  invoice: JsonRecord | null;
  invoiceLine: JsonRecord | null;
  allocation: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  purchaseOrderLine: JsonRecord | null;
  supplierContext: ReturnType<typeof buildProjectActualCostEventSupplierContext>;
  projectContext: ReturnType<typeof buildProjectActualCostEventProjectContext>;
  correctionChainEvents: JsonRecord[];
}) {
  const ledgerMeaning = buildProjectActualCostEventLedgerMeaning({
    row: input.row,
    allocation: input.allocation,
  });
  const matchedBasis = buildProjectActualCostEventMatchedBasis({
    row: input.row,
    allocation: input.allocation,
    purchaseOrder: input.purchaseOrder,
    purchaseOrderLine: input.purchaseOrderLine,
  });
  const lifecycleStage = buildProjectActualCostEventLifecycleStage({
    row: input.row,
    allocation: input.allocation,
    projectContext: input.projectContext,
  });
  const hasCoreLineage = Boolean(
    input.projectContext.projectId
    && (toStringOrNull(input.row.source_type)?.toLowerCase() !== "supplier_invoice"
      || (input.invoice && input.invoiceLine && input.allocation)),
  );
  const hasCostLineage = Boolean(toStringOrNull(input.row.cost_item_id) || toStringOrNull(input.row.source_cost_item_id));

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (!hasCoreLineage || lifecycleStage === "manual_adjustment_posted" || lifecycleStage === "incomplete_lineage") {
    evidenceStrength = "weak";
  } else if (
    input.invoice
    && input.invoiceLine
    && input.allocation
    && input.purchaseOrder
    && input.purchaseOrderLine
    && input.projectContext.projectId
    && input.supplierContext.supplierId
    && hasCostLineage
  ) {
    evidenceStrength = "strong";
  }

  return {
    lifecycleStage,
    ledgerMeaning,
    matchedBasis,
    postingLag: buildProjectActualCostEventPostingLag({
      invoice: input.invoice,
      row: input.row,
    }),
    correctionChainEventIds: uniqueNonEmpty(input.correctionChainEvents.map((event) => toStringOrNull(event.id))),
    correctionChainEventCount: input.correctionChainEvents.length,
    hasCoreLineage,
    hasCostLineage,
    evidenceStrength,
  };
}

function buildProjectActualCostEventReadOnlyRoutingContext(row: JsonRecord) {
  return pruneEmptyObject({
    readOnly: true,
    tradesstack_cost_code: row.tradesstack_cost_code,
    tradesstack_cost_code_label: row.tradesstack_cost_code_label,
    accounting_mapping_id: row.accounting_mapping_id,
    organization_cost_code_id: row.organization_cost_code_id,
  }) ?? { readOnly: true };
}

function pruneEmptyObject(value: Record<string, unknown>) {
  const entries = Object.entries(value).filter(([, child]) => child !== undefined && child !== null && child !== "");
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function buildProjectActualCostEventTrustBoundaryPayload(input: {
  row: JsonRecord;
  invoice: JsonRecord | null;
  invoiceLine: JsonRecord | null;
  allocation: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  purchaseOrderLine: JsonRecord | null;
  projectContext: ReturnType<typeof buildProjectActualCostEventProjectContext>;
  supplierContext: ReturnType<typeof buildProjectActualCostEventSupplierContext>;
  correctionChainEvents: JsonRecord[];
  actualCostEventSummary: ReturnType<typeof buildProjectActualCostEventSummary>;
  organizationId: string;
}) {
  const eventId = toStringOrNull(input.row.id);
  const supplierInvoiceId = toStringOrNull(input.row.supplier_invoice_id);
  const supplierInvoiceLineId = toStringOrNull(input.row.supplier_invoice_line_id);
  const supplierInvoiceLineAllocationId = toStringOrNull(input.row.supplier_invoice_line_allocation_id);
  const sourceInvoiceLineId = toStringOrNull(input.row.source_invoice_line_id);
  const sourceInvoiceAllocationId = toStringOrNull(input.row.source_invoice_allocation_id);
  const reversalEventIds = uniqueNonEmpty(input.correctionChainEvents
    .filter((event) => toStringOrNull(event.event_type)?.toLowerCase() === "reversal")
    .map((event) => toStringOrNull(event.id)));

  return {
    sourceEvidence: {
      actualCostEvent: {
        eventId,
        eventDate: toIsoString(input.row.event_date),
        eventType: toStringOrNull(input.row.event_type),
        eventStatus: toStringOrNull(input.row.event_status),
        postingSource: toStringOrNull(input.row.posting_source),
        sourceType: toStringOrNull(input.row.source_type),
        sourceReference: toStringOrNull(input.row.source_reference),
        commercialAmounts: {
          amount: typeof input.row.amount === "number" ? input.row.amount : null,
          taxAmount: typeof input.row.tax_amount === "number" ? input.row.tax_amount : null,
          totalAmount: typeof input.row.total_amount === "number" ? input.row.total_amount : null,
          quantity: typeof input.row.quantity === "number" ? input.row.quantity : null,
        },
      },
      supplierInvoice: pruneEmptyObject({
        invoiceId: supplierInvoiceId,
        invoiceNumber: toStringOrNull(input.invoice?.invoice_number),
        invoiceDate: toIsoString(input.invoice?.invoice_date),
        status: toStringOrNull(input.invoice?.status),
      }),
      supplierInvoiceLine: pruneEmptyObject({
        invoiceLineId: supplierInvoiceLineId,
        sourceInvoiceLineId,
        description: toStringOrNull(input.invoiceLine?.description),
        quantity: typeof input.invoiceLine?.quantity === "number" ? input.invoiceLine.quantity : null,
        unitPrice: typeof input.invoiceLine?.unit_price === "number" ? input.invoiceLine.unit_price : null,
        lineTotal: typeof input.invoiceLine?.line_total === "number" ? input.invoiceLine.line_total : null,
      }),
      sourceAllocation: pruneEmptyObject({
        allocationId: sourceInvoiceAllocationId ?? supplierInvoiceLineAllocationId,
        supplierInvoiceLineAllocationId,
        allocationStatus: toStringOrNull(input.allocation?.allocation_status),
        reviewStatus: toStringOrNull(input.allocation?.review_status),
        approvalStatus: toStringOrNull(input.allocation?.approval_status),
        allocatedAmount: input.allocation ? toNumberOrZero(input.allocation.allocated_amount) : null,
        allocatedQuantity: typeof input.allocation?.allocated_quantity === "number" ? input.allocation.allocated_quantity : null,
        acceptedAiSuggestion: input.allocation?.accepted_ai_suggestion === true,
      }),
      purchaseOrder: pruneEmptyObject({
        purchaseOrderId: toStringOrNull(input.row.purchase_order_id),
        purchaseOrderNumber: toStringOrNull(input.purchaseOrder?.purchase_order_number),
        purchaseOrderTitle: toStringOrNull(input.purchaseOrder?.purchase_order_title),
        purchaseOrderStatus: toStringOrNull(input.purchaseOrder?.status),
      }),
      purchaseOrderLine: pruneEmptyObject({
        purchaseOrderLineItemId: toStringOrNull(input.row.purchase_order_line_item_id),
        description: toStringOrNull(input.purchaseOrderLine?.description),
        unit: toStringOrNull(input.purchaseOrderLine?.unit),
        rate: typeof input.purchaseOrderLine?.rate === "number" ? input.purchaseOrderLine.rate : null,
      }),
      project: pruneEmptyObject({
        projectId: input.projectContext.projectId,
        projectName: input.projectContext.projectName,
        projectCode: input.projectContext.projectCode,
      }),
      supplier: pruneEmptyObject({
        supplierId: input.supplierContext.supplierId,
        supplierName: input.supplierContext.supplierName,
      }),
      correctionOrReversalSummary: {
        correctionRootEventId: toStringOrNull(input.row.correction_root_event_id),
        reversesEventId: toStringOrNull(input.row.reverses_event_id),
        reversalReason: toStringOrNull(input.row.reversal_reason),
        reversalNotePresent: Boolean(toStringOrNull(input.row.reversal_note)),
        chainEventIds: input.actualCostEventSummary.correctionChainEventIds,
        chainEventCount: input.actualCostEventSummary.correctionChainEventCount,
        reversalEventIds,
      },
      ledgerMeaning: input.actualCostEventSummary.ledgerMeaning,
      matchedBasis: input.actualCostEventSummary.matchedBasis,
      evidenceStrengthSummary: {
        evidenceStrength: input.actualCostEventSummary.evidenceStrength,
        hasCoreLineage: input.actualCostEventSummary.hasCoreLineage,
        hasCostLineage: input.actualCostEventSummary.hasCostLineage,
      },
    },
    operationalContext: {
      lifecycleStage: input.actualCostEventSummary.lifecycleStage,
      createdAt: toIsoString(input.row.created_at),
      updatedAt: toIsoString(input.row.updated_at),
      hasSupplierInvoice: Boolean(supplierInvoiceId),
      hasInvoiceLine: Boolean(supplierInvoiceLineId || sourceInvoiceLineId),
      hasAllocation: Boolean(sourceInvoiceAllocationId || supplierInvoiceLineAllocationId),
      hasPurchaseOrder: Boolean(toStringOrNull(input.row.purchase_order_id)),
      hasPurchaseOrderLine: Boolean(toStringOrNull(input.row.purchase_order_line_item_id)),
      hasProject: Boolean(input.projectContext.projectId),
      hasSupplier: Boolean(input.supplierContext.supplierId),
      hasCostItem: Boolean(toStringOrNull(input.row.cost_item_id)),
      hasSourceCostItem: Boolean(toStringOrNull(input.row.source_cost_item_id)),
      isCorrectionChain: input.actualCostEventSummary.correctionChainEventCount > 1
        || Boolean(toStringOrNull(input.row.reverses_event_id))
        || (toStringOrNull(input.row.correction_root_event_id) ?? eventId) !== eventId,
      isManualAdjustment: toStringOrNull(input.row.posting_source)?.toLowerCase() === "manual_adjustment",
      postingLag: input.actualCostEventSummary.postingLag,
      reversalState: {
        eventType: toStringOrNull(input.row.event_type),
        hasReversalReason: Boolean(toStringOrNull(input.row.reversal_reason)),
        hasReversalNote: Boolean(toStringOrNull(input.row.reversal_note)),
        reversesEventId: toStringOrNull(input.row.reverses_event_id),
      },
      correctionCompleteness: {
        correctionRootEventId: toStringOrNull(input.row.correction_root_event_id),
        chainEventCount: input.actualCostEventSummary.correctionChainEventCount,
        hasChainRoot: Boolean(toStringOrNull(input.row.correction_root_event_id)),
        hasReversalEvent: reversalEventIds.length > 0,
      },
      lineageCompleteness: {
        hasCoreLineage: input.actualCostEventSummary.hasCoreLineage,
        hasProjectLineage: Boolean(input.projectContext.projectId),
        hasSupplierInvoiceLineage: Boolean(supplierInvoiceId && (supplierInvoiceLineId || sourceInvoiceLineId)),
        hasAllocationLineage: Boolean(sourceInvoiceAllocationId || supplierInvoiceLineAllocationId),
        hasPurchaseOrderLineage: Boolean(toStringOrNull(input.row.purchase_order_id) || toStringOrNull(input.row.purchase_order_line_item_id)),
      },
      evidenceStrength: input.actualCostEventSummary.evidenceStrength,
    },
    lineageContext: {
      organizationId: input.organizationId,
      eventId,
      supplierInvoiceId,
      supplierInvoiceLineId,
      supplierInvoiceLineAllocationId,
      sourceInvoiceLineId,
      sourceInvoiceAllocationId,
      purchaseOrderId: toStringOrNull(input.row.purchase_order_id),
      purchaseOrderLineItemId: toStringOrNull(input.row.purchase_order_line_item_id),
      projectId: input.projectContext.projectId,
      projectName: input.projectContext.projectName,
      clientId: input.projectContext.clientId,
      clientName: input.projectContext.clientName,
      supplierId: input.supplierContext.supplierId,
      supplierName: input.supplierContext.supplierName,
      costItemId: toStringOrNull(input.row.cost_item_id),
      sourceCostItemId: toStringOrNull(input.row.source_cost_item_id),
      reversesEventId: toStringOrNull(input.row.reverses_event_id),
      correctionRootEventId: toStringOrNull(input.row.correction_root_event_id),
      createdByUserId: toStringOrNull(input.row.created_by_user_id),
      sourceTable: "project_actual_cost_events",
    },
  };
}

function buildOrganizationMaterialSupplierName(
  supplierId: string | null,
  enrichment: OrganizationMaterialEnrichment | MaterialImportBatchEnrichment,
) {
  if (!supplierId) {
    return null;
  }
  const supplier = enrichment.suppliersById.get(supplierId) ?? null;
  return toStringOrNull(supplier?.company_name)
    ?? toStringOrNull(supplier?.name)
    ?? toStringOrNull(supplier?.legal_name);
}

function summarizeOrganizationMaterialPriceSource(source: string | null) {
  const normalized = source?.trim().toLowerCase() ?? "";
  if (normalized === "import") {
    return "import";
  }
  if (normalized === "manual") {
    return "manual";
  }
  return normalized.length > 0 ? normalized : "unknown";
}

function buildOrganizationMaterialPricingFreshness(latestPriceUpdatedAt: string | null) {
  if (!latestPriceUpdatedAt) {
    return {
      latestPriceUpdatedAt: null,
      ageDays: null,
      status: "no_current_price",
    };
  }

  const latestDate = new Date(latestPriceUpdatedAt);
  if (Number.isNaN(latestDate.getTime())) {
    return {
      latestPriceUpdatedAt,
      ageDays: null,
      status: "unknown",
    };
  }

  const ageDays = Math.max(0, Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24)));
  return {
    latestPriceUpdatedAt,
    ageDays,
    status: ageDays <= 30 ? "fresh" : ageDays <= 90 ? "aging" : "stale",
  };
}

function buildOrganizationMaterialLifecycleStage(input: {
  row: JsonRecord;
  hasCurrentPrice: boolean;
  confirmed: boolean;
  reopenedForReview: boolean;
}) {
  if (input.row.is_active !== true || Boolean(toIsoOrNull(input.row.archived_at))) {
    return "archived";
  }
  if (!toStringOrNull(input.row.name) || !toStringOrNull(input.row.default_unit)) {
    return "incomplete_catalogue_record";
  }
  if (input.reopenedForReview) {
    return "reopened_for_review";
  }
  if (input.row.needs_review === true) {
    return "active_needs_review";
  }
  if (input.confirmed) {
    return "active_confirmed";
  }
  if (input.hasCurrentPrice) {
    return "active_priced";
  }
  return "active_unpriced";
}

function buildOrganizationMaterialSummary(input: {
  row: JsonRecord;
  supplierPrices: JsonRecord[];
  importRows: JsonRecord[];
  enrichment: OrganizationMaterialEnrichment;
}) {
  const effectivePriceByProduct = resolveEffectivePriceRows({
    prices: input.supplierPrices as unknown as OrganizationMaterialSupplierPriceRow[],
    evaluationTime: new Date(),
  });
  const effectivePriceIds = new Set(
    [...effectivePriceByProduct.entries()].flatMap(([supplierProductId, price]) => {
      const supplierProduct = input.enrichment.supplierProductsById.get(supplierProductId);
      return supplierProduct?.is_active === true && !toIsoOrNull(supplierProduct.archived_at)
        ? [price.id]
        : [];
    })
  );
  const productIsPreferred = (price: JsonRecord) =>
    input.enrichment.supplierProductsById.get(toStringOrNull(price.supplier_product_id) ?? "")
      ?.is_preferred === true;
  const currentSupplierPrices = input.supplierPrices
    .filter((price) => effectivePriceIds.has(toStringOrNull(price.id) ?? ""))
    .slice()
    .sort((left, right) =>
      Number(productIsPreferred(right)) - Number(productIsPreferred(left))
      || String(right.updated_at ?? right.effective_from ?? "").localeCompare(String(left.updated_at ?? left.effective_from ?? ""))
      || String(left.id ?? "").localeCompare(String(right.id ?? "")));
  const historicalSupplierPrices = input.supplierPrices
    .filter((price) => !effectivePriceIds.has(toStringOrNull(price.id) ?? ""))
    .slice()
    .sort((left, right) =>
      String(right.effective_to ?? right.updated_at ?? "").localeCompare(String(left.effective_to ?? left.updated_at ?? ""))
      || String(left.id ?? "").localeCompare(String(right.id ?? "")));
  const preferredSupplierPrices = currentSupplierPrices.filter(productIsPreferred);
  const reviewedImportRows = input.importRows.filter((row) =>
    Boolean(toIsoOrNull(row.reviewed_at)) || ["approved", "rejected"].includes((toStringOrNull(row.status)?.toLowerCase() ?? "")));
  const approvedImportRows = reviewedImportRows.filter((row) => (toStringOrNull(row.status)?.toLowerCase() ?? "") === "approved");
  const matchedImportRows = reviewedImportRows.filter((row) => (toStringOrNull(row.action)?.toLowerCase() ?? "") === "match_material");
  const createdImportRows = reviewedImportRows.filter((row) => (toStringOrNull(row.action)?.toLowerCase() ?? "") === "create_material");
  const skippedImportRows = reviewedImportRows.filter((row) => (toStringOrNull(row.action)?.toLowerCase() ?? "") === "skip");
  const importBackedPrices = input.supplierPrices.filter((price) => summarizeOrganizationMaterialPriceSource(toStringOrNull(price.source)) === "import");
  const manualPrices = input.supplierPrices.filter((price) => summarizeOrganizationMaterialPriceSource(toStringOrNull(price.source)) === "manual");
  const latestCurrentPrice = currentSupplierPrices
    .slice()
    .sort((left, right) =>
      String(right.updated_at ?? right.effective_from ?? "").localeCompare(String(left.updated_at ?? left.effective_from ?? ""))
      || String(right.id ?? "").localeCompare(String(left.id ?? "")))[0] ?? null;
  const earliestHistoricalPrice = historicalSupplierPrices
    .slice()
    .sort((left, right) =>
      String(left.effective_from ?? left.created_at ?? "").localeCompare(String(right.effective_from ?? right.created_at ?? ""))
      || String(left.id ?? "").localeCompare(String(right.id ?? "")))[0] ?? null;
  const latestHistoricalPrice = historicalSupplierPrices
    .slice()
    .sort((left, right) =>
      String(right.effective_to ?? right.updated_at ?? "").localeCompare(String(left.effective_to ?? left.updated_at ?? ""))
      || String(right.id ?? "").localeCompare(String(left.id ?? "")))[0] ?? null;
  const uniqueSupplierIds = uniqueNonEmpty(input.supplierPrices.map((price) => toStringOrNull(price.supplier_id)));
  const currentSupplierIds = uniqueNonEmpty(currentSupplierPrices.map((price) => toStringOrNull(price.supplier_id)));
  const preferredSupplierIds = uniqueNonEmpty(preferredSupplierPrices.map((price) => toStringOrNull(price.supplier_id)));
  const importBatchIds = uniqueNonEmpty([
    ...input.supplierPrices.map((price) => toStringOrNull(price.import_batch_id)),
    ...reviewedImportRows.map((row) => toStringOrNull(row.import_batch_id)),
  ]);
  const importBatches = importBatchIds
    .map((batchId) => input.enrichment.importBatchesById.get(batchId) ?? null)
    .filter((batch): batch is JsonRecord => Boolean(batch));
  const confirmed = (toStringOrNull(input.row.classification_source)?.toLowerCase() ?? "") === "user_confirmed"
    && input.row.needs_review !== true;
  const reopenedForReview = input.row.needs_review === true && Boolean(toIsoOrNull(input.row.confirmed_at));
  const lifecycleStage = buildOrganizationMaterialLifecycleStage({
    row: input.row,
    hasCurrentPrice: currentSupplierPrices.length > 0,
    confirmed,
    reopenedForReview,
  });
  const pricingFreshness = buildOrganizationMaterialPricingFreshness(
    toIsoOrNull(latestCurrentPrice?.updated_at) ?? toIsoOrNull(latestCurrentPrice?.effective_from),
  );
  const currentPriceValues = currentSupplierPrices
    .map((price) => typeof price.unit_cost === "number" ? price.unit_cost : null)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const historicalPriceValues = historicalSupplierPrices
    .map((price) => typeof price.unit_cost === "number" ? price.unit_cost : null)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const confirmedAt = toIsoOrNull(input.row.confirmed_at);
  const reviewReasonSummary = toStringOrNull(input.row.review_reason);

  let evidenceStrength: UniversalLearningRecordStrength = "normal";
  if (currentSupplierPrices.length === 0 && reviewedImportRows.length === 0) {
    evidenceStrength = "weak";
  } else if (currentSupplierPrices.length > 0 && preferredSupplierPrices.length > 0 && reviewedImportRows.length > 0) {
    evidenceStrength = "strong";
  }

  return {
    lifecycleStage,
    confirmed,
    reopenedForReview,
    reviewReasonSummary,
    currentSupplierPrices,
    historicalSupplierPrices,
    preferredSupplierPrices,
    reviewedImportRows,
    approvedImportRows,
    matchedImportRows,
    createdImportRows,
    skippedImportRows,
    importBackedPrices,
    manualPrices,
    latestCurrentPrice,
    earliestHistoricalPrice,
    latestHistoricalPrice,
    uniqueSupplierIds,
    currentSupplierIds,
    preferredSupplierIds,
    importBatchIds,
    importBatches,
    pricingFreshness,
    evidenceStrength,
    supplierCoverage: {
      supplierCount: uniqueSupplierIds.length,
      currentSupplierCount: currentSupplierIds.length,
      preferredSupplierCount: preferredSupplierIds.length,
    },
    priceMovementSummary: {
      currentMinUnitPrice: currentPriceValues.length > 0 ? Math.min(...currentPriceValues) : null,
      currentMaxUnitPrice: currentPriceValues.length > 0 ? Math.max(...currentPriceValues) : null,
      historicalMinUnitPrice: historicalPriceValues.length > 0 ? Math.min(...historicalPriceValues) : null,
      historicalMaxUnitPrice: historicalPriceValues.length > 0 ? Math.max(...historicalPriceValues) : null,
      priceHistoryCount: historicalSupplierPrices.length,
      latestHistoricalEffectiveTo: toIsoOrNull(latestHistoricalPrice?.effective_to),
      earliestHistoricalEffectiveFrom: toIsoOrNull(earliestHistoricalPrice?.effective_from),
    },
    supplierCatalogueUpdateSummary: {
      approvedImportBatchCount: importBatches.filter((batch) => (toStringOrNull(batch.status)?.toLowerCase() ?? "") === "approved").length,
      reviewedImportRowCount: reviewedImportRows.length,
      approvedImportRowCount: approvedImportRows.length,
      matchedImportRowCount: matchedImportRows.length,
      createdImportRowCount: createdImportRows.length,
      skippedImportRowCount: skippedImportRows.length,
    },
    confirmedAt,
    reviewCompleteness: {
      needsReview: input.row.needs_review === true,
      confirmed,
      reopenedForReview,
      hasReviewReason: Boolean(reviewReasonSummary),
      confirmedAt,
    },
  };
}

function buildOrganizationMaterialReadOnlyRoutingContext(row: JsonRecord) {
  return pruneEmptyObject({
    readOnly: true,
    tradesstack_cost_code: row.tradesstack_cost_code,
    tradesstack_cost_code_label: row.tradesstack_cost_code_label,
    accounting_mapping_id: row.accounting_mapping_id,
    organization_cost_code_id: row.organization_cost_code_id,
  }) ?? { readOnly: true };
}

function buildMaterialImportBatchLifecycleStage(input: {
  status: string | null;
  rowsExtracted: number;
  rowCount: number;
}) {
  const normalizedStatus = input.status?.trim().toLowerCase() ?? "";
  if (input.rowsExtracted > 0 && input.rowCount > 0 && input.rowCount < input.rowsExtracted) {
    return "incomplete_import";
  }

  switch (normalizedStatus) {
    case "uploaded":
    case "extracting":
    case "ready_for_review":
    case "partially_approved":
    case "approved":
    case "failed":
    case "cancelled":
      return normalizedStatus;
    default:
      return input.rowsExtracted > 0 ? "incomplete_import" : "uploaded";
  }
}

function buildMaterialImportBatchReadOnlyRoutingContext(input: {
  rows: JsonRecord[];
  enrichment: MaterialImportBatchEnrichment;
}) {
  const context: JsonRecord = { readOnly: true };

  for (const row of input.rows) {
    const materialId = toStringOrNull(row.matched_material_id);
    if (!materialId) continue;
    const material = input.enrichment.materialsById.get(materialId) ?? null;
    if (!material) continue;
    appendUniqueValue(context, "tradesstack_cost_codeValues", material.tradesstack_cost_code);
    appendUniqueValue(context, "tradesstack_cost_code_labelValues", material.tradesstack_cost_code_label);
    appendUniqueValue(context, "accounting_mapping_idValues", material.accounting_mapping_id);
    appendUniqueValue(context, "organization_cost_code_idValues", material.organization_cost_code_id);
  }

  return context;
}

function buildMaterialImportBatchSummary(input: {
  row: JsonRecord;
  rows: JsonRecord[];
  supplierPrices: JsonRecord[];
  enrichment: MaterialImportBatchEnrichment;
}) {
  const rowsExtracted = toNumberOrZero(input.row.rows_extracted);
  const rowsApproved = toNumberOrZero(input.row.rows_approved);
  const rowsRejected = toNumberOrZero(input.row.rows_rejected);
  const reviewedRows = input.rows.filter((row) =>
    Boolean(toIsoOrNull(row.reviewed_at))
    || Boolean(toStringOrNull(row.reviewed_by))
    || ["approved", "rejected"].includes(toStringOrNull(row.status)?.toLowerCase() ?? ""));
  const approvedRows = input.rows.filter((row) => (toStringOrNull(row.status)?.toLowerCase() ?? "") === "approved");
  const rejectedRows = input.rows.filter((row) => (toStringOrNull(row.status)?.toLowerCase() ?? "") === "rejected");
  const matchedRows = input.rows.filter((row) => (toStringOrNull(row.action)?.toLowerCase() ?? "") === "match_material");
  const createdRows = input.rows.filter((row) => (toStringOrNull(row.action)?.toLowerCase() ?? "") === "create_material");
  const skippedRows = input.rows.filter((row) =>
    (toStringOrNull(row.action)?.toLowerCase() ?? "") === "skip"
    || (toStringOrNull(row.status)?.toLowerCase() ?? "") === "rejected");
  const matchedMaterialIds = uniqueNonEmpty(matchedRows.map((row) => toStringOrNull(row.matched_material_id)));
  const createdMaterialIds = uniqueNonEmpty(createdRows.map((row) => toStringOrNull(row.matched_material_id)));
  const reopenedMaterials = matchedRows
    .map((row) => {
      const materialId = toStringOrNull(row.matched_material_id);
      if (!materialId) return null;
      const material = input.enrichment.materialsById.get(materialId) ?? null;
      if (!material || material.needs_review !== true) return null;
      return material;
    })
    .filter((material): material is JsonRecord => Boolean(material));
  const reviewCoverage = rowsExtracted > 0 ? reviewedRows.length / rowsExtracted : 0;
  const approvalCoverage = rowsExtracted > 0 ? (rowsApproved + rowsRejected) / rowsExtracted : 0;
  const extractionComplete = rowsExtracted === 0 || input.rows.length >= rowsExtracted;

  let evidenceStrength: UniversalLearningRecordStrength = "weak";
  if (approvedRows.length > 0 && input.supplierPrices.length > 0) {
    evidenceStrength = "strong";
  } else if (reviewedRows.length > 0 || input.rows.length > 0) {
    evidenceStrength = "normal";
  }

  return {
    rowsExtracted,
    rowsApproved,
    rowsRejected,
    reviewedRows,
    approvedRows,
    rejectedRows,
    matchedRows,
    createdRows,
    skippedRows,
    matchedMaterialIds,
    createdMaterialIds,
    reopenedMaterials,
    lifecycleStage: buildMaterialImportBatchLifecycleStage({
      status: toStringOrNull(input.row.status),
      rowsExtracted,
      rowCount: input.rows.length,
    }),
    reviewCompleteness: {
      reviewedRowCount: reviewedRows.length,
      reviewedCoverage: Number(reviewCoverage.toFixed(4)),
      complete: rowsExtracted > 0 && reviewedRows.length >= rowsExtracted,
    },
    approvalCompleteness: {
      decidedRowCount: rowsApproved + rowsRejected,
      decidedCoverage: Number(approvalCoverage.toFixed(4)),
      complete: rowsExtracted > 0 && rowsApproved + rowsRejected >= rowsExtracted,
    },
    extractionCompleteness: {
      rowCount: input.rows.length,
      expectedRowCount: rowsExtracted,
      complete: extractionComplete,
    },
    createVsMatchMix: {
      createMaterialRowCount: createdRows.length,
      matchMaterialRowCount: matchedRows.length,
      skipRowCount: skippedRows.length,
    },
    evidenceStrength,
  };
}

function buildMaterialImportBatchTrustBoundaryPayload(input: {
  row: JsonRecord;
  rows: JsonRecord[];
  enrichment: MaterialImportBatchEnrichment;
  supplierPrices: JsonRecord[];
  organizationId: string;
  materialImportBatchSummary: ReturnType<typeof buildMaterialImportBatchSummary>;
}) {
  const batchId = toStringOrNull(input.row.id);
  const supplierId = toStringOrNull(input.row.supplier_id);
  const supplierName = buildOrganizationMaterialSupplierName(supplierId, input.enrichment);
  const reviewedRowSummaries = input.materialImportBatchSummary.reviewedRows.map((row) => ({
    rowId: toStringOrNull(row.id),
    rowIndex: typeof row.row_index === "number" ? row.row_index : null,
    action: toStringOrNull(row.action),
    status: toStringOrNull(row.status),
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    extractedName: toStringOrNull(row.extracted_name),
    extractedDescription: toStringOrNull(row.extracted_description),
    extractedUnit: toStringOrNull(row.extracted_unit),
    extractedUnitCost: typeof row.extracted_unit_cost === "number" ? row.extracted_unit_cost : null,
    extractedCurrency: toStringOrNull(row.extracted_currency),
    supplierDescription: toStringOrNull(row.supplier_description),
    supplierSku: toStringOrNull(row.supplier_sku),
    reviewedName: toStringOrNull(row.reviewed_name),
    reviewedDescription: toStringOrNull(row.reviewed_description),
    reviewedUnit: toStringOrNull(row.reviewed_unit),
    reviewedUnitCost: typeof row.reviewed_unit_cost === "number" ? row.reviewed_unit_cost : null,
    reviewedCurrency: toStringOrNull(row.reviewed_currency),
    reviewedSupplierDescription: toStringOrNull(row.reviewed_supplier_description),
    reviewedSupplierSku: toStringOrNull(row.reviewed_supplier_sku),
    reviewedAt: toIsoOrNull(row.reviewed_at),
    reviewedByUserId: toStringOrNull(row.reviewed_by),
    matchedMaterialId: toStringOrNull(row.matched_material_id),
    reasonSummary: toStringOrNull(row.classification_reason_summary),
  }));
  const matchedMaterialSummary = input.materialImportBatchSummary.matchedMaterialIds.map((materialId) => {
    const material = input.enrichment.materialsById.get(materialId) ?? null;
    return {
      materialId,
      materialName: toStringOrNull(material?.name),
      defaultUnit: toStringOrNull(material?.default_unit),
      category: toStringOrNull(material?.category),
      needsReview: material?.needs_review === true,
      reviewReason: toStringOrNull(material?.review_reason),
    };
  });
  const createdMaterialSummary = input.materialImportBatchSummary.createdMaterialIds.map((materialId) => {
    const material = input.enrichment.materialsById.get(materialId) ?? null;
    return {
      materialId,
      materialName: toStringOrNull(material?.name),
      defaultUnit: toStringOrNull(material?.default_unit),
      category: toStringOrNull(material?.category),
      createdByUserId: toStringOrNull(material?.created_by),
      createdAt: toIsoOrNull(material?.created_at),
    };
  });
  const supplierPriceUpdateSummary = input.supplierPrices.map((price) => ({
    supplierPriceId: toStringOrNull(price.id),
    materialId: toStringOrNull(price.material_id),
    supplierId: toStringOrNull(price.supplier_id),
    supplierName: buildOrganizationMaterialSupplierName(toStringOrNull(price.supplier_id), input.enrichment),
    supplierSku: toStringOrNull(price.supplier_sku),
    supplierDescription: toStringOrNull(price.supplier_description),
    unit: toStringOrNull(price.unit),
    unitCost: typeof price.unit_cost === "number" ? price.unit_cost : null,
    currency: toStringOrNull(price.currency),
    isCurrent: price.is_current === true,
    isPreferred: price.is_preferred === true,
    source: toStringOrNull(price.source),
    effectiveFrom: toIsoOrNull(price.effective_from),
    effectiveTo: toIsoOrNull(price.effective_to),
  }));

  return {
    sourceEvidence: {
      batch: {
        batchId,
        supplierId,
        supplierName,
        fileName: toStringOrNull(input.row.file_name),
        fileType: toStringOrNull(input.row.file_type),
        batchStatus: toStringOrNull(input.row.status),
        extractionMethod: toStringOrNull(input.row.extraction_method),
        rowsExtracted: input.materialImportBatchSummary.rowsExtracted,
        rowsApproved: input.materialImportBatchSummary.rowsApproved,
        rowsRejected: input.materialImportBatchSummary.rowsRejected,
        createdAt: toIsoOrNull(input.row.created_at),
        updatedAt: toIsoOrNull(input.row.updated_at),
      },
      reviewedRowSummary: reviewedRowSummaries,
      rowDecisionSummary: {
        reviewedRowCount: input.materialImportBatchSummary.reviewedRows.length,
        approvedRowCount: input.materialImportBatchSummary.approvedRows.length,
        rejectedRowCount: input.materialImportBatchSummary.rejectedRows.length,
        createMaterialRowCount: input.materialImportBatchSummary.createdRows.length,
        matchMaterialRowCount: input.materialImportBatchSummary.matchedRows.length,
        skipRowCount: input.materialImportBatchSummary.skippedRows.length,
      },
      matchedMaterialSummary,
      createdMaterialSummary,
      supplierPriceUpdateSummary,
      conflictReopenedReviewSummary: {
        reopenedReviewCount: input.materialImportBatchSummary.reopenedMaterials.length,
        reopenedMaterialIds: uniqueNonEmpty(input.materialImportBatchSummary.reopenedMaterials.map((material) => toStringOrNull(material.id))),
        reopenedReviewReasons: uniqueNonEmpty(input.materialImportBatchSummary.reopenedMaterials.map((material) => toStringOrNull(material.review_reason))),
      },
      evidenceStrengthSummary: {
        evidenceStrength: input.materialImportBatchSummary.evidenceStrength,
        reviewCoverage: input.materialImportBatchSummary.reviewCompleteness.reviewedCoverage,
        approvalCoverage: input.materialImportBatchSummary.approvalCompleteness.decidedCoverage,
      },
    },
    operationalContext: {
      lifecycleStage: input.materialImportBatchSummary.lifecycleStage,
      hasSupplier: Boolean(supplierId),
      hasExtractedRows: input.materialImportBatchSummary.rowsExtracted > 0,
      hasReviewedRows: input.materialImportBatchSummary.reviewedRows.length > 0,
      hasApprovedRows: input.materialImportBatchSummary.approvedRows.length > 0,
      hasRejectedRows: input.materialImportBatchSummary.rejectedRows.length > 0,
      hasPriceUpdates: input.supplierPrices.length > 0,
      hasMaterialMatches: input.materialImportBatchSummary.matchedRows.length > 0,
      hasCreatedMaterials: input.materialImportBatchSummary.createdRows.length > 0,
      hasSkippedRows: input.materialImportBatchSummary.skippedRows.length > 0,
      hasConflicts: input.materialImportBatchSummary.reopenedMaterials.length > 0,
      reviewCompleteness: input.materialImportBatchSummary.reviewCompleteness,
      approvalCompleteness: input.materialImportBatchSummary.approvalCompleteness,
      extractionCompleteness: input.materialImportBatchSummary.extractionCompleteness,
      createVsMatchMix: input.materialImportBatchSummary.createVsMatchMix,
      evidenceStrength: input.materialImportBatchSummary.evidenceStrength,
    },
    lineageContext: {
      organizationId: input.organizationId,
      supplierId,
      supplierName,
      batchId,
      rowIds: uniqueNonEmpty(input.rows.map((row) => toStringOrNull(row.id))),
      reviewedRowIds: uniqueNonEmpty(input.materialImportBatchSummary.reviewedRows.map((row) => toStringOrNull(row.id))),
      approvedRowIds: uniqueNonEmpty(input.materialImportBatchSummary.approvedRows.map((row) => toStringOrNull(row.id))),
      rejectedRowIds: uniqueNonEmpty(input.materialImportBatchSummary.rejectedRows.map((row) => toStringOrNull(row.id))),
      matchedMaterialIds: input.materialImportBatchSummary.matchedMaterialIds,
      createdMaterialIds: input.materialImportBatchSummary.createdMaterialIds,
      supplierPriceIds: uniqueNonEmpty(input.supplierPrices.map((price) => toStringOrNull(price.id))),
      uploadedByUserId: toStringOrNull(input.row.uploaded_by),
      reviewedByUserIds: uniqueNonEmpty(input.materialImportBatchSummary.reviewedRows.map((row) => toStringOrNull(row.reviewed_by))),
      sourceTable: "organization_material_import_batches",
    },
  };
}

function buildOrganizationMaterialTrustBoundaryPayload(input: {
  row: JsonRecord;
  supplierPrices: JsonRecord[];
  importRows: JsonRecord[];
  enrichment: OrganizationMaterialEnrichment;
  organizationId: string;
  materialSummary: ReturnType<typeof buildOrganizationMaterialSummary>;
}) {
  const materialId = toStringOrNull(input.row.id);
  const currentPriceEvidence = input.materialSummary.currentSupplierPrices.map((price) => {
    const supplierId = toStringOrNull(price.supplier_id);
    return {
      supplierPriceId: toStringOrNull(price.id),
      supplierId,
      supplierName: buildOrganizationMaterialSupplierName(supplierId, input.enrichment),
      supplierSku: toStringOrNull(price.supplier_sku),
      supplierDescription: toStringOrNull(price.supplier_description),
      unitPrice: typeof price.unit_cost === "number" ? price.unit_cost : null,
      unit: toStringOrNull(price.unit),
      currency: toStringOrNull(price.currency),
      effectiveFrom: toIsoOrNull(price.effective_from),
      isCurrent: true,
      isPreferred:
        input.enrichment.supplierProductsById.get(
          toStringOrNull(price.supplier_product_id) ?? ""
        )?.is_preferred === true,
      priceSource: toStringOrNull(price.source),
      priceSourceType: summarizeOrganizationMaterialPriceSource(toStringOrNull(price.source)),
    };
  });
  const importEvidenceRows = input.materialSummary.reviewedImportRows.map((row) => ({
    importRowId: toStringOrNull(row.id),
    importBatchId: toStringOrNull(row.import_batch_id),
    action: toStringOrNull(row.action),
    status: toStringOrNull(row.status),
    reviewedAt: toIsoOrNull(row.reviewed_at),
    reviewedUnitPrice: typeof row.reviewed_unit_cost === "number" ? row.reviewed_unit_cost : null,
    reviewedUnit: toStringOrNull(row.reviewed_unit),
    reviewedCurrency: toStringOrNull(row.reviewed_currency),
    supplierSku: toStringOrNull(row.reviewed_supplier_sku) ?? toStringOrNull(row.supplier_sku),
    supplierDescription: toStringOrNull(row.reviewed_supplier_description) ?? toStringOrNull(row.supplier_description),
    matchedMaterialId: toStringOrNull(row.matched_material_id),
    reasonSummary: toStringOrNull(row.classification_reason_summary),
  }));
  const preferredSupplierSummary = input.materialSummary.preferredSupplierPrices.map((price) => {
    const supplierId = toStringOrNull(price.supplier_id);
    return {
      supplierPriceId: toStringOrNull(price.id),
      supplierId,
      supplierName: buildOrganizationMaterialSupplierName(supplierId, input.enrichment),
      unitPrice: typeof price.unit_cost === "number" ? price.unit_cost : null,
      unit: toStringOrNull(price.unit),
      currency: toStringOrNull(price.currency),
      effectiveFrom: toIsoOrNull(price.effective_from),
    };
  });

  return {
    sourceEvidence: {
      material: {
        materialId,
        materialName: toStringOrNull(input.row.name),
        description: toStringOrNull(input.row.description),
        defaultUnit: toStringOrNull(input.row.default_unit),
        category: toStringOrNull(input.row.category),
        activeState: {
          isActive: input.row.is_active === true,
          archivedAt: toIsoOrNull(input.row.archived_at),
          archived: input.row.is_active !== true || Boolean(toIsoOrNull(input.row.archived_at)),
        },
      },
      reviewState: {
        needsReview: input.row.needs_review === true,
        confirmedState: input.materialSummary.confirmed ? "confirmed" : "not_confirmed",
        confirmedAt: input.materialSummary.confirmedAt,
        reopenedForReview: input.materialSummary.reopenedForReview,
        reviewReasonSummary: input.materialSummary.reviewReasonSummary,
      },
      currentSupplierPrices: currentPriceEvidence,
      historicalSupplierPriceSummary: {
        historicalSupplierPriceCount: input.materialSummary.historicalSupplierPrices.length,
        historicalSupplierPriceIds: uniqueNonEmpty(input.materialSummary.historicalSupplierPrices.map((price) => toStringOrNull(price.id))),
        earliestHistoricalEffectiveFrom: input.materialSummary.priceMovementSummary.earliestHistoricalEffectiveFrom,
        latestHistoricalEffectiveTo: input.materialSummary.priceMovementSummary.latestHistoricalEffectiveTo,
        historicalMinUnitPrice: input.materialSummary.priceMovementSummary.historicalMinUnitPrice,
        historicalMaxUnitPrice: input.materialSummary.priceMovementSummary.historicalMaxUnitPrice,
      },
      importLinkedEvidence: {
        approvedImportBatchSummary: input.materialSummary.importBatches.map((batch) => ({
          importBatchId: toStringOrNull(batch.id),
          supplierId: toStringOrNull(batch.supplier_id),
          supplierName: buildOrganizationMaterialSupplierName(toStringOrNull(batch.supplier_id), input.enrichment),
          status: toStringOrNull(batch.status),
          extractionMethod: toStringOrNull(batch.extraction_method),
          rowsExtracted: typeof batch.rows_extracted === "number" ? batch.rows_extracted : null,
          rowsApproved: typeof batch.rows_approved === "number" ? batch.rows_approved : null,
          rowsRejected: typeof batch.rows_rejected === "number" ? batch.rows_rejected : null,
        })),
        approvedImportRowSummary: importEvidenceRows,
        matchedMaterialDecisionSummary: {
          matchedImportRowCount: input.materialSummary.matchedImportRows.length,
          createdImportRowCount: input.materialSummary.createdImportRows.length,
          skippedImportRowCount: input.materialSummary.skippedImportRows.length,
        },
        supplierCatalogueUpdateSummary: input.materialSummary.supplierCatalogueUpdateSummary,
      },
      catalogueSummaries: {
        preferredSupplierSummary,
        priceMovementSummary: input.materialSummary.priceMovementSummary,
        supplierCoverageSummary: input.materialSummary.supplierCoverage,
        pricingFreshnessSummary: input.materialSummary.pricingFreshness,
        catalogueHygieneSummary: {
          hasCurrentPrice: input.materialSummary.currentSupplierPrices.length > 0,
          hasPreferredSupplier: input.materialSummary.preferredSupplierPrices.length > 0,
          needsReview: input.row.needs_review === true,
          archived: input.row.is_active !== true || Boolean(toIsoOrNull(input.row.archived_at)),
        },
        evidenceStrengthSummary: {
          evidenceStrength: input.materialSummary.evidenceStrength,
        },
      },
    },
    operationalContext: {
      lifecycleStage: input.materialSummary.lifecycleStage,
      createdAt: toIsoOrNull(input.row.created_at),
      updatedAt: toIsoOrNull(input.row.updated_at),
      archivedAt: toIsoOrNull(input.row.archived_at),
      isActive: input.row.is_active === true,
      hasCurrentPrice: input.materialSummary.currentSupplierPrices.length > 0,
      hasPreferredSupplier: input.materialSummary.preferredSupplierPrices.length > 0,
      supplierPriceCount: input.supplierPrices.length,
      currentSupplierPriceCount: input.materialSummary.currentSupplierPrices.length,
      historicalSupplierPriceCount: input.materialSummary.historicalSupplierPrices.length,
      preferredSupplierCount: input.materialSummary.preferredSupplierPrices.length,
      importBackedPriceCount: input.materialSummary.importBackedPrices.length,
      manualPriceCount: input.materialSummary.manualPrices.length,
      needsReview: input.row.needs_review === true,
      confirmed: input.materialSummary.confirmed,
      reopenedForReview: input.materialSummary.reopenedForReview,
      pricingFreshness: input.materialSummary.pricingFreshness,
      supplierCoverage: input.materialSummary.supplierCoverage,
      reviewCompleteness: input.materialSummary.reviewCompleteness,
      evidenceStrength: input.materialSummary.evidenceStrength,
    },
    lineageContext: {
      organizationId: input.organizationId,
      materialId,
      supplierIds: input.materialSummary.uniqueSupplierIds.slice().sort(),
      supplierPriceIds: uniqueNonEmpty(input.supplierPrices.map((price) => toStringOrNull(price.id))).sort(),
      currentSupplierPriceIds: uniqueNonEmpty(input.materialSummary.currentSupplierPrices.map((price) => toStringOrNull(price.id))).sort(),
      historicalSupplierPriceIds: uniqueNonEmpty(input.materialSummary.historicalSupplierPrices.map((price) => toStringOrNull(price.id))).sort(),
      preferredSupplierPriceIds: uniqueNonEmpty(input.materialSummary.preferredSupplierPrices.map((price) => toStringOrNull(price.id))).sort(),
      importBatchIds: input.materialSummary.importBatchIds.slice().sort(),
      importRowIds: uniqueNonEmpty(input.materialSummary.reviewedImportRows.map((row) => toStringOrNull(row.id))).sort(),
      matchedImportRowIds: uniqueNonEmpty(input.materialSummary.matchedImportRows.map((row) => toStringOrNull(row.id))).sort(),
      createdByUserId: toStringOrNull(input.row.created_by),
      confirmedByUserId: toStringOrNull(input.row.confirmed_by_user_id),
      archivedByUserId: toStringOrNull(input.row.archived_by),
      sourceTable: "organization_materials",
    },
  };
}

function buildSupplierInvoiceAllocationTrustBoundaryPayload(input: {
  row: JsonRecord;
  invoice: JsonRecord | null;
  invoiceLine: JsonRecord | null;
  invoiceDocuments: JsonRecord[];
  purchaseOrderMatch: JsonRecord | null;
  purchaseOrder: JsonRecord | null;
  purchaseOrderLine: JsonRecord | null;
  projectContext: ReturnType<typeof buildSupplierInvoiceAllocationProjectContext>;
  supplierContext: ReturnType<typeof buildSupplierInvoiceAllocationSupplierContext>;
  actualCostEvents: JsonRecord[];
  siblingAllocations: JsonRecord[];
  successorAllocationIds: string[];
  allocationSummary: ReturnType<typeof buildSupplierInvoiceAllocationSummary>;
  organizationId: string;
}) {
  const allocationId = toStringOrNull(input.row.id);
  const invoiceId = toStringOrNull(input.row.supplier_invoice_id);
  const invoiceLineId = toStringOrNull(input.row.supplier_invoice_line_id);
  const approvalNoteSummary = input.allocationSummary.approvalNoteSummary;

  return {
    sourceEvidence: {
      allocation: {
        allocationId,
        supplierInvoiceId: invoiceId,
        supplierInvoiceLineId: invoiceLineId,
        supplier: {
          supplierId: input.supplierContext.supplierId,
          supplierName: input.supplierContext.supplierName,
        },
        project: {
          projectId: input.projectContext.projectId,
          projectName: input.projectContext.projectName,
          projectCode: input.projectContext.projectCode,
        },
        purchaseOrder: {
          purchaseOrderId: toStringOrNull(input.row.purchase_order_id),
          purchaseOrderNumber: toStringOrNull(input.purchaseOrder?.purchase_order_number),
          purchaseOrderTitle: toStringOrNull(input.purchaseOrder?.purchase_order_title),
        },
        purchaseOrderLine: {
          purchaseOrderLineItemId: toStringOrNull(input.row.purchase_order_line_item_id),
          description: toStringOrNull(input.purchaseOrderLine?.description),
          unit: toStringOrNull(input.purchaseOrderLine?.unit),
        },
        commercialAmounts: {
          allocatedAmount: toNumberOrZero(input.row.allocated_amount),
          allocatedQuantity: typeof input.row.allocated_quantity === "number" ? input.row.allocated_quantity : null,
          matchedAmount: toNumberOrZero(input.row.matched_amount),
        },
        allocationStatus: toStringOrNull(input.row.allocation_status),
        reviewStatus: toStringOrNull(input.row.review_status),
        approvalStatus: toStringOrNull(input.row.approval_status),
        approvalNoteSummary,
        matchStatus: toStringOrNull(input.row.match_status),
        allocationSource: toStringOrNull(input.row.allocation_source),
        acceptedAiSuggestion: input.row.accepted_ai_suggestion === true,
        splitGroup: {
          allocationGroupId: toStringOrNull(input.row.allocation_group_id),
          allocationSequence: typeof input.row.allocation_sequence === "number" ? input.row.allocation_sequence : null,
          allocationIdsInGroup: input.allocationSummary.splitGroupRows,
        },
        matchedBasis: input.allocationSummary.matchedBasis,
        postingCompleteness: input.allocationSummary.postingReadiness,
      },
      supplierInvoice: {
        invoiceId,
        invoiceNumber: toStringOrNull(input.invoice?.invoice_number),
        invoiceDate: toIsoString(input.invoice?.invoice_date),
        status: toStringOrNull(input.invoice?.status),
      },
      invoiceLine: {
        invoiceLineId,
        description: toStringOrNull(input.invoiceLine?.description),
        quantity: typeof input.invoiceLine?.quantity === "number" ? input.invoiceLine.quantity : null,
        unit: toStringOrNull(input.invoiceLine?.unit),
        unitPrice: typeof input.invoiceLine?.unit_price === "number" ? input.invoiceLine.unit_price : null,
        lineTotal: typeof input.invoiceLine?.line_total === "number" ? input.invoiceLine.line_total : null,
      },
      purchaseOrderMatch: pruneEmptyObject({
        matchId: toStringOrNull(input.purchaseOrderMatch?.id),
        purchaseOrderId: toStringOrNull(input.purchaseOrderMatch?.purchase_order_id),
        matchedAmount: input.purchaseOrderMatch ? toNumberOrZero(input.purchaseOrderMatch.matched_amount) : null,
        matchStatus: toStringOrNull(input.purchaseOrderMatch?.match_status),
        approvalStatus: toStringOrNull(input.purchaseOrderMatch?.approval_status),
        approvalNoteSummary: buildSupplierInvoiceAllocationApprovalNoteSummary(toStringOrNull(input.purchaseOrderMatch?.approval_notes)).noteSummary,
        completedApprovalCheckCount: input.purchaseOrderMatch ? countCompletedChecks(input.purchaseOrderMatch.approval_checks_json) : null,
      }),
      documentSummary: {
        documentCount: input.allocationSummary.documentCount,
        documentTypes: input.allocationSummary.documentTypes,
        hasInvoiceDocument: input.allocationSummary.documentTypes.includes("invoice"),
        hasSupportingDocument: input.allocationSummary.documentTypes.includes("supporting_document"),
        hasCreditNoteDocument: input.allocationSummary.documentTypes.includes("credit_note"),
      },
      actualCostEventSummary: {
        postedEventCount: input.allocationSummary.postedEvents.length,
        postedEventIds: uniqueNonEmpty(input.allocationSummary.postedEvents.map((event) => toStringOrNull(event.id))),
        postedTotalAmount: input.allocationSummary.postedEvents.reduce((sum, event) => sum + toNumberOrZero(event.total_amount), 0),
        reversalEventCount: input.allocationSummary.reversalEvents.length,
        reversalEventIds: uniqueNonEmpty(input.allocationSummary.reversalEvents.map((event) => toStringOrNull(event.id))),
      },
      correctionChainSummary: {
        editState: toStringOrNull(input.row.edit_state),
        supersedesAllocationId: toStringOrNull(input.row.supersedes_allocation_id),
        successorAllocationIds: input.successorAllocationIds,
      },
    },
    operationalContext: {
      lifecycleStage: input.allocationSummary.lifecycleStage,
      createdAt: input.allocationSummary.createdAt,
      updatedAt: toIsoString(input.row.updated_at),
      reviewedAt: input.allocationSummary.reviewedAt,
      approvedAt: input.allocationSummary.approvedAt,
      hasProject: Boolean(input.projectContext.projectId),
      hasPurchaseOrder: Boolean(toStringOrNull(input.row.purchase_order_id)),
      hasPurchaseOrderLine: Boolean(toStringOrNull(input.row.purchase_order_line_item_id)),
      hasCostItem: Boolean(toStringOrNull(input.row.cost_item_id)),
      hasSourceCostItem: Boolean(toStringOrNull(input.row.source_cost_item_id)),
      hasActualCostPosting: input.allocationSummary.postedEvents.length > 0,
      hasReversal: input.allocationSummary.reversalEvents.length > 0 || toStringOrNull(input.row.edit_state)?.toLowerCase() === "reversed",
      postingCompleteness: input.allocationSummary.postingReadiness,
      reviewCompleteness: {
        reviewStatus: toStringOrNull(input.row.review_status),
        reviewed: Boolean(input.allocationSummary.reviewedAt),
        blocked: ["needs_routing_review", "needs_accounting_mapping", "high_value_review"].includes(
          toStringOrNull(input.row.review_status)?.toLowerCase() ?? "",
        ),
      },
      approvalCompleteness: {
        approvalStatus: toStringOrNull(input.row.approval_status),
        approved: toStringOrNull(input.row.approval_status)?.toLowerCase() === "approved",
        disputed: toStringOrNull(input.row.approval_status)?.toLowerCase() === "disputed",
        pending: toStringOrNull(input.row.approval_status)?.toLowerCase() === "pending",
      },
      disputeState: {
        isDisputed: toStringOrNull(input.row.approval_status)?.toLowerCase() === "disputed"
          || toStringOrNull(input.row.review_status)?.toLowerCase() === "disputed",
        approvalStatus: toStringOrNull(input.row.approval_status),
        reviewStatus: toStringOrNull(input.row.review_status),
        hasApprovalNote: approvalNoteSummary.hasApprovalNote,
      },
      allocationLag: input.allocationSummary.allocationLag,
      reviewLag: input.allocationSummary.reviewLag,
      postingLag: input.allocationSummary.postingLag,
      evidenceStrength: input.allocationSummary.evidenceStrength,
    },
    lineageContext: {
      organizationId: input.organizationId,
      supplierInvoiceId: invoiceId,
      supplierInvoiceLineId: invoiceLineId,
      purchaseOrderId: toStringOrNull(input.row.purchase_order_id),
      purchaseOrderLineItemId: toStringOrNull(input.row.purchase_order_line_item_id),
      projectId: input.projectContext.projectId,
      projectName: input.projectContext.projectName,
      clientId: input.projectContext.clientId,
      clientName: input.projectContext.clientName,
      supplierId: input.supplierContext.supplierId,
      supplierName: input.supplierContext.supplierName,
      costItemId: toStringOrNull(input.row.cost_item_id),
      sourceCostItemId: toStringOrNull(input.row.source_cost_item_id),
      actualCostEventIds: uniqueNonEmpty(input.actualCostEvents.map((event) => toStringOrNull(event.id))),
      supersedesAllocationId: toStringOrNull(input.row.supersedes_allocation_id),
      successorAllocationIds: input.successorAllocationIds,
      reviewedByUserId: toStringOrNull(input.row.reviewed_by_user_id),
      approvedByUserId: toStringOrNull(input.row.approved_by_user_id),
      sourceTable: "supplier_invoice_line_allocations",
    },
  };
}

function buildProjectPurchaseOrderTrustBoundaryPayload(input: {
  row: JsonRecord;
  lineItems: JsonRecord[];
  statusContext: ReturnType<typeof buildProjectPurchaseOrderStatusContext>;
  supplierContext: ReturnType<typeof buildSupplierDisplayContext>;
  projectContext: ReturnType<typeof buildProjectDisplayContext>;
  poSummary: ReturnType<typeof buildProjectPurchaseOrderSummary>;
  enrichment: ProjectPurchaseOrderEnrichment;
  organizationId: string;
  actorUserId: string | null;
  sourceTable: string;
  sourceModule: string;
  sourceWorkflow: string;
  updatedAt: string;
}) {
  const sourceId = toStringOrNull(input.row.id);
  return {
    sourceEvidence: {
      purchaseOrder: {
        sourceId,
        number: toStringOrNull(input.row.purchase_order_number),
        title: toStringOrNull(input.row.purchase_order_title),
        status: toStringOrNull(input.row.status),
        origin: toStringOrNull(input.row.origin),
        requestedBy: toStringOrNull(input.row.requested_by),
        requestedDate: toIsoOrNull(input.row.requested_date),
        dueDate: toIsoOrNull(input.row.due_date),
        approvedAt: toIsoOrNull(input.row.approved_at),
        sentToClientAt: toIsoOrNull(input.row.sent_to_client_at),
        invoiceReady: input.row.invoice_ready === true,
        notes: toStringOrNull(input.row.notes),
        supplier: {
          supplierId: input.supplierContext.supplierId,
          displayName: input.supplierContext.supplierDisplayName,
          issuedToLabel: input.supplierContext.issuedToLabel,
          nameSnapshot: input.supplierContext.supplierNameSnapshot,
        },
        commercialTotals: {
          subtotal: toNumberOrZero(input.row.subtotal),
          marginPercent: toNumberOrZero(input.row.margin_percent),
          marginTotal: toNumberOrZero(input.row.margin_total),
          discountAmount: toNumberOrZero(input.row.discount_amount),
          contingencyAmount: toNumberOrZero(input.row.contingency_amount),
          gstPercent: toNumberOrZero(input.row.gst_percent),
          gstTotal: toNumberOrZero(input.row.gst_total),
          total: toNumberOrZero(input.row.total_purchase_order_price),
          materialsTotal: toNumberOrZero(input.row.materials_total),
          labourTotal: toNumberOrZero(input.row.labour_total),
          subcontractorsTotal: toNumberOrZero(input.row.subcontractors_total),
          plantTotal: toNumberOrZero(input.row.plant_total),
        },
      },
      lineItems: input.lineItems.map(buildProjectPurchaseOrderLineEvidence),
      statusHistory: input.statusContext.statusHistory,
    },
    operationalContext: {
      updatedAt: input.updatedAt,
      lineCount: input.poSummary.lineCount,
      hasSupplier: input.poSummary.hasSupplier,
      hasApprovedStatus: input.poSummary.hasApprovedStatus,
      isDraftOnly: input.poSummary.isDraftOnly,
      hasZeroValue: input.poSummary.hasZeroValue,
      sourceTypes: input.poSummary.sourceTypes,
      evidenceStrength: input.poSummary.evidenceStrength,
      invoiceReady: input.statusContext.invoiceReady,
      invoiced: input.statusContext.invoiced,
      totalsBySection: {
        materialTotal: input.poSummary.materialTotal,
        labourTotal: input.poSummary.labourTotal,
        subcontractorTotal: input.poSummary.subcontractorTotal,
        plantTotal: input.poSummary.plantTotal,
        otherTotal: input.poSummary.otherTotal,
      },
      productLikeLineDescriptions: input.poSummary.productLikeLineDescriptions,
      labourLikeLineDescriptions: input.poSummary.labourLikeLineDescriptions,
    },
    lineageContext: {
      organizationId: input.organizationId,
      projectId: input.projectContext.projectId,
      projectName: input.projectContext.projectName,
      projectCode: input.projectContext.projectCode,
      projectStatus: input.projectContext.projectStatus,
      clientId: input.projectContext.clientId,
      clientName: input.projectContext.clientName,
      supplierId: input.supplierContext.supplierId,
      actorUserId: input.actorUserId,
      sourceTable: input.sourceTable,
      sourceModule: input.sourceModule,
      sourceWorkflow: input.sourceWorkflow,
      sourceIds: {
        purchaseOrderId: sourceId,
        projectId: input.projectContext.projectId,
        supplierId: input.supplierContext.supplierId,
        clientId: input.projectContext.clientId,
      },
      lineLinks: input.lineItems.map((line) =>
        buildProjectPurchaseOrderLineageLink({
          line,
          enrichment: input.enrichment,
        }),
      ),
    },
  };
}

function buildProjectTimeSheetEntryTrustBoundaryPayload(input: {
  row: JsonRecord;
  events: JsonRecord[];
  syncedLines: JsonRecord[];
  projectContext: ReturnType<typeof buildProjectTimeSheetEntryProjectContext>;
  purchaseOrderContext: ReturnType<typeof buildProjectTimeSheetEntryPurchaseOrderContext>;
  timeSheetSummary: ReturnType<typeof buildProjectTimeSheetEntrySummary>;
  organizationId: string;
}) {
  const entryId = toStringOrNull(input.row.id);
  const noteText = toStringOrNull(input.row.notes);
  const syncedLine = input.syncedLines[0] ?? null;

  return {
    sourceEvidence: {
      workerSnapshot: {
        workerName: toStringOrNull(input.row.worker_name),
        companyName: toStringOrNull(input.row.company_name),
        tradeName: toStringOrNull(input.row.trade_name),
      },
      projectSnapshot: pruneEmptyObject({
        projectId: input.projectContext.projectId,
        projectName: input.projectContext.projectName,
        projectCode: input.projectContext.projectCode,
        projectStatus: input.projectContext.projectStatus,
        clientName: input.projectContext.clientName,
      }),
      purchaseOrderSnapshot: pruneEmptyObject({
        purchaseOrderId: input.purchaseOrderContext.purchaseOrderId,
        purchaseOrderNumber: input.purchaseOrderContext.purchaseOrderNumber,
        purchaseOrderTitle: input.purchaseOrderContext.purchaseOrderTitle,
        purchaseOrderStatus: input.purchaseOrderContext.purchaseOrderStatus,
      }),
      shiftSummary: {
        entryId,
        clockInAt: toIsoOrNull(input.row.clock_in_at),
        clockOutAt: toIsoOrNull(input.row.clock_out_at),
        totalHours: input.timeSheetSummary.totalHours,
        durationBucket: input.timeSheetSummary.durationBucket,
        savedTimestamps: {
          createdAt: toIsoOrNull(input.row.created_at),
          updatedAt: toIsoOrNull(input.row.updated_at),
          warningAt: toIsoOrNull(input.row.warning_8h5_at),
          autoClockedOutAt: toIsoOrNull(input.row.auto_clocked_out_at),
        },
      },
      notes: pruneEmptyObject({
        notePresent: Boolean(noteText),
        noteText,
      }),
      eventSummary: {
        eventCount: input.timeSheetSummary.eventCount,
        eventTypes: input.timeSheetSummary.eventTypes,
        history: input.events
          .map(buildProjectTimeSheetEntryEventEvidence)
          .filter((event): event is Record<string, unknown> => Boolean(event)),
      },
      closeMethodSummary: {
        closeStatus: input.timeSheetSummary.closeStatus,
        closeMethod: input.timeSheetSummary.closeMethod,
        manuallyClosed: input.timeSheetSummary.closeMethod === "manual",
        automaticallyClosed: input.timeSheetSummary.closeMethod === "automatic",
      },
      warningSummary: {
        warningReached: input.timeSheetSummary.warningReached,
        warningAt: toIsoOrNull(input.row.warning_8h5_at),
        autoCloseReached: input.timeSheetSummary.autoClockedOut,
      },
      labourCommitmentSummary: {
        purchaseOrderLinked: input.timeSheetSummary.labourCommitmentSummary.purchaseOrderLinked,
        syncedPurchaseOrderLineCount: input.timeSheetSummary.labourCommitmentSummary.syncedPurchaseOrderLineCount,
        syncedPurchaseOrderLine: pruneEmptyObject({
          purchaseOrderLineItemId: toStringOrNull(syncedLine?.id),
          description: toStringOrNull(syncedLine?.description),
          section: toStringOrNull(syncedLine?.section),
          quantity: syncedLine ? toNumberOrZero(syncedLine.quantity) : null,
          unit: toStringOrNull(syncedLine?.unit),
          rate: syncedLine ? toNumberOrZero(syncedLine.rate) : null,
          total: syncedLine ? toNumberOrZero(syncedLine.total) : null,
        }),
        committedHours: input.timeSheetSummary.labourCommitmentSummary.committedHours,
      },
      evidenceStrengthSummary: {
        evidenceStrength: input.timeSheetSummary.evidenceStrength,
        eventCompleteness: input.timeSheetSummary.eventCompleteness,
        closeStatus: input.timeSheetSummary.closeStatus,
      },
    },
    operationalContext: {
      lifecycleStage: input.timeSheetSummary.lifecycleStage,
      shiftDurationBucket: input.timeSheetSummary.durationBucket,
      warningReached: input.timeSheetSummary.warningReached,
      autoCloseReached: input.timeSheetSummary.autoClockedOut,
      staleHealed: input.timeSheetSummary.staleHealed,
      assignedPurchaseOrder: input.timeSheetSummary.assignedPurchaseOrder,
      sourceChannel: input.timeSheetSummary.sourceChannel,
      eventCompleteness: input.timeSheetSummary.eventCompleteness,
      repeatWorkerCadence: {
        cadence: input.timeSheetSummary.repeatWorkerCadence,
        entryCountInReviewWindow: input.timeSheetSummary.repeatWorkerEntryCount,
      },
      evidenceStrength: input.timeSheetSummary.evidenceStrength,
    },
    lineageContext: {
      organizationId: input.organizationId,
      projectId: input.projectContext.projectId,
      workerId: toStringOrNull(input.row.worker_user_id),
      purchaseOrderId: input.purchaseOrderContext.purchaseOrderId,
      syncedPurchaseOrderLineItemIds: uniqueNonEmpty(input.syncedLines.map((line) => toStringOrNull(line.id))),
      syncedCostItemIds: uniqueNonEmpty(input.syncedLines.flatMap((line) => [
        toStringOrNull(line.cost_item_id),
        toStringOrNull(line.source_cost_item_id),
      ])),
      workbookLineage: null,
      createdBy: toStringOrNull(input.row.created_by),
      updatedBy: null,
      sourceTable: "project_time_sheet_entries",
      sourceIds: {
        entryId,
        eventIds: uniqueNonEmpty(input.events.map((event) => toStringOrNull(event.id))),
      },
    },
  };
}

function buildProjectQuoteTrustBoundaryPayload(input: {
  row: JsonRecord;
  lineItems: JsonRecord[];
  projectContext: ReturnType<typeof buildProjectQuoteProjectContext>;
  clientContext: ReturnType<typeof buildProjectQuoteClientContext>;
  opportunityContext: ReturnType<typeof buildProjectQuoteOpportunityContext>;
  quoteSummary: ReturnType<typeof buildProjectQuoteSummary>;
  organizationId: string;
  actorUserId: string | null;
  sourceTable: string;
  sourceModule: string;
  sourceWorkflow: string;
  quoteSourceType: "opportunity_quote" | "project_quote";
  updatedAt: string;
}) {
  const sourceId = toStringOrNull(input.row.id);
  return {
    sourceEvidence: {
      quote: {
        sourceId,
        quoteSourceType: input.quoteSourceType,
        number: toStringOrNull(input.row.quote_number),
        title: toStringOrNull(input.row.quote_title),
        status: toStringOrNull(input.row.status),
        quoteDate: toIsoOrNull(input.row.quote_date),
        expiryDate: toIsoOrNull(input.row.expiry_date),
        validityPeriod: toStringOrNull(input.row.validity_period),
        leadTime: toStringOrNull(input.row.lead_time),
        paymentTerms: toStringOrNull(input.row.payment_terms),
        client: {
          clientId: input.clientContext.clientId,
          displayName: input.clientContext.clientName,
          companyName: input.clientContext.clientCompanyName,
          contactName: input.clientContext.clientContactName,
          email: input.clientContext.clientEmail,
          phone: input.clientContext.clientPhone,
        },
        project: {
          projectId: input.projectContext.projectId,
          projectName: input.projectContext.projectName,
          projectCode: input.projectContext.projectCode,
          siteAddress: input.projectContext.siteAddress,
        },
        opportunity: {
          opportunityId: input.opportunityContext.opportunityId,
          opportunityName: input.opportunityContext.opportunityName,
          opportunityCode: input.opportunityContext.opportunityCode,
          opportunityStage: input.opportunityContext.opportunityStage,
          sourceOpportunityQuoteId: input.opportunityContext.sourceOpportunityQuoteId,
          sourceOpportunityQuoteNumber: input.opportunityContext.sourceOpportunityQuoteNumber,
        },
        scope: {
          scopeNotes: toStringOrNull(input.row.scope_notes),
          scopeExclusions: toStringOrNull(input.row.scope_exclusions),
          assumptions: toStringOrNull(input.row.assumptions),
          clarifications: toStringOrNull(input.row.clarifications),
          acceptanceNotes: toStringOrNull(input.row.acceptance_notes),
          optionalItemsNotes: toStringOrNull(input.row.optional_items_notes),
          termsInclusions: toStringOrNull(input.row.terms_inclusions),
          termsExclusions: toStringOrNull(input.row.terms_exclusions),
        },
        commercialTotals: {
          subtotal: toNumberOrZero(input.row.subtotal),
          optionalSubtotal: toNumberOrZero(input.row.optional_subtotal),
          marginPercent: toNumberOrZero(input.row.margin_percent),
          marginAmount: toNumberOrZero(input.row.margin_amount),
          contingencyAmount: toNumberOrZero(input.row.contingency_amount),
          discountAmount: toNumberOrZero(input.row.discount_amount),
          gstPercent: toNumberOrZero(input.row.gst_percent),
          gstAmount: toNumberOrZero(input.row.gst_amount),
          total: toNumberOrZero(input.row.total_quote_price),
        },
      },
      lineItems: input.lineItems.map(buildProjectQuoteLineEvidence),
    },
    operationalContext: {
      updatedAt: input.updatedAt,
      quoteSourceType: input.quoteSourceType,
      lineCount: input.quoteSummary.lineCount,
      optionalLineCount: input.quoteSummary.optionalLineCount,
      includedLineCount: input.quoteSummary.includedLineCount,
      sectionsUsed: input.quoteSummary.sectionsUsed,
      sectionMix: input.quoteSummary.sectionMix,
      hasUsefulLineItems: input.quoteSummary.hasUsefulLineItems,
      hasClient: input.quoteSummary.hasClient,
      hasProject: input.quoteSummary.hasProject,
      hasOpportunity: input.quoteSummary.hasOpportunity,
      hasAcceptedStatus: input.quoteSummary.hasAcceptedStatus,
      hasSentStatus: input.quoteSummary.hasSentStatus,
      hasRejectedStatus: input.quoteSummary.hasRejectedStatus,
      hasExpiredStatus: input.quoteSummary.hasExpiredStatus,
      isDraftLike: input.quoteSummary.isDraftLike,
      hasZeroValue: input.quoteSummary.hasZeroValue,
      evidenceStrength: input.quoteSummary.evidenceStrength,
      workflowCoverage: {
        hasStatusHistory: false,
        hasRevisionHistory: false,
        hasSourceOpportunityLineage: Boolean(
          input.opportunityContext.sourceOpportunityQuoteId || input.opportunityContext.sourceOpportunityQuoteNumber,
        ),
      },
      pricingSignals: {
        marginApplied: toNumberOrZero(input.row.margin_amount) > 0 || toNumberOrZero(input.row.margin_percent) > 0,
        contingencyApplied: toNumberOrZero(input.row.contingency_amount) > 0,
        discountApplied: toNumberOrZero(input.row.discount_amount) > 0,
        optionalPricingUsed: input.quoteSummary.optionalLineCount > 0 || toNumberOrZero(input.row.optional_subtotal) > 0,
      },
      totalsBySection: input.quoteSummary.totalsBySection,
    },
    lineageContext: {
      organizationId: input.organizationId,
      projectId: input.projectContext.projectId,
      projectName: input.projectContext.projectName,
      projectCode: input.projectContext.projectCode,
      projectStatus: input.projectContext.projectStatus,
      clientId: input.clientContext.clientId,
      clientName: input.clientContext.clientName,
      clientType: input.clientContext.clientType,
      clientStatus: input.clientContext.clientStatus,
      opportunityId: input.opportunityContext.opportunityId,
      opportunityName: input.opportunityContext.opportunityName,
      opportunityCode: input.opportunityContext.opportunityCode,
      opportunityStage: input.opportunityContext.opportunityStage,
      opportunityEstimatedValue: input.opportunityContext.opportunityEstimatedValue,
      actorUserId: input.actorUserId,
      sourceTable: input.sourceTable,
      sourceModule: input.sourceModule,
      sourceWorkflow: input.sourceWorkflow,
      sourceIds: {
        quoteId: sourceId,
        opportunityQuoteId: input.quoteSourceType === "opportunity_quote" ? sourceId : null,
        projectQuoteId: input.quoteSourceType === "project_quote" ? sourceId : null,
        projectId: input.projectContext.projectId,
        clientId: input.clientContext.clientId,
        opportunityId: input.opportunityContext.opportunityId,
        sourceOpportunityQuoteId: input.opportunityContext.sourceOpportunityQuoteId,
      },
      lineLinks: input.lineItems.map((line) => ({
        lineItemId: toStringOrNull(line.id),
        sourceOpportunityQuoteId: toStringOrNull(line.source_opportunity_quote_id),
        sourceOpportunityQuoteLineItemId: toStringOrNull(line.source_opportunity_quote_line_item_id),
        sourceOpportunityQuoteNumber: toStringOrNull(line.source_opportunity_quote_number),
      })),
    },
  };
}

function buildProjectVariationTrustBoundaryPayload(input: {
  row: JsonRecord;
  lineItems: JsonRecord[];
  attachments: JsonRecord[];
  statusEvents: JsonRecord[];
  invoiceItems: JsonRecord[];
  projectContext: ReturnType<typeof buildProjectVariationProjectContext>;
  variationSummary: ReturnType<typeof buildProjectVariationSummary>;
  enrichment: ProjectVariationEnrichment;
  organizationId: string;
  actorUserId: string | null;
  updatedAt: string;
}) {
  const variationId = toStringOrNull(input.row.id);
  const quoteLinkages = input.variationSummary.quoteIds.map((quoteId) => {
    const quote = input.enrichment.quotesById.get(quoteId) ?? null;
    return {
      quoteId,
      quoteNumber: toStringOrNull(quote?.quote_number),
      quoteTitle: toStringOrNull(quote?.quote_title),
      quoteStatus: toStringOrNull(quote?.status),
    };
  });
  const purchaseOrderLinkages = input.variationSummary.purchaseOrderIds.map((purchaseOrderId) => {
    const purchaseOrder = input.enrichment.purchaseOrdersById.get(purchaseOrderId) ?? null;
    return {
      purchaseOrderId,
      purchaseOrderNumber: toStringOrNull(purchaseOrder?.purchase_order_number),
      purchaseOrderTitle: toStringOrNull(purchaseOrder?.purchase_order_title),
      purchaseOrderStatus: toStringOrNull(purchaseOrder?.status),
    };
  });
  const mirroredCostItems = variationId
    ? input.enrichment.mirroredCostItemsByVariationId.get(variationId) ?? []
    : [];

  return {
    sourceEvidence: {
      variation: {
        variationId,
        variationNumber: toStringOrNull(input.row.variation_number),
        title: toStringOrNull(input.row.variation_title),
        status: toStringOrNull(input.row.status),
        origin: toStringOrNull(input.row.origin),
        sourceReference: toStringOrNull(input.row.source_reference),
        requestedBy: toStringOrNull(input.row.requested_by),
        requestedDate: toIsoOrNull(input.row.requested_date),
        dueDate: toIsoOrNull(input.row.due_date),
        sentToClientAt: toIsoOrNull(input.row.sent_to_client_at),
        approvedAt: toIsoOrNull(input.row.approved_at),
        rejectedAt: toIsoOrNull(input.row.rejected_at),
        clientViewedAt: toIsoOrNull(input.row.client_viewed_at),
      },
      commercialValues: {
        subtotal: toNumberOrZero(input.row.subtotal),
        marginPercent: toNumberOrZero(input.row.margin_percent),
        marginTotal: toNumberOrZero(input.row.margin_total),
        discountAmount: toNumberOrZero(input.row.discount_amount),
        contingencyAmount: toNumberOrZero(input.row.contingency_amount),
        gstTotal: toNumberOrZero(input.row.gst_total),
        total: toNumberOrZero(input.row.total_variation_price),
        labourTotal: toNumberOrZero(input.row.labour_total),
        materialsTotal: toNumberOrZero(input.row.materials_total),
        subcontractorsTotal: toNumberOrZero(input.row.subcontractors_total),
        plantTotal: toNumberOrZero(input.row.plant_total),
      },
      commercialTerms: {
        paymentTerms: toStringOrNull(input.row.payment_terms),
        validityPeriod: toStringOrNull(input.row.validity_period),
        leadTime: toStringOrNull(input.row.lead_time),
      },
      commercialScope: {
        inclusions: toStringOrNull(input.row.terms_inclusions),
        exclusions: toStringOrNull(input.row.terms_exclusions),
        assumptions: toStringOrNull(input.row.assumptions),
        clarifications: toStringOrNull(input.row.clarifications),
        notes: toStringOrNull(input.row.notes),
      },
      lineItems: input.lineItems.map(buildProjectVariationLineEvidence),
      attachmentSummary: {
        attachmentCount: input.variationSummary.attachmentCount,
        attachmentKinds: input.variationSummary.attachmentKinds,
        hasAttachments: input.variationSummary.hasAttachments,
      },
      statusHistorySummary: input.statusEvents.map((event) => ({
        statusEventId: toStringOrNull(event.id),
        fromStatus: toStringOrNull(event.from_status),
        toStatus: toStringOrNull(event.to_status),
        eventType: toStringOrNull(event.event_type),
        occurredAt: toIsoOrNull(event.occurred_at),
        changedAt: toIsoOrNull(event.changed_at),
        noteSummary: summarizeProjectVariationStatusNote(toStringOrNull(event.note)),
      })),
      invoiceExportSummary: {
        invoiceReady: input.variationSummary.invoiceReady,
        invoiceReference: toStringOrNull(input.row.invoice_reference),
        invoiceItemCount: input.variationSummary.invoiceItemCount,
        exportedItemCount: input.variationSummary.exportedInvoiceItemCount,
        totalReadyAmount: input.variationSummary.totalReadyAmount,
        totalExportedAmount: input.variationSummary.totalExportedAmount,
        invoiceItems: input.invoiceItems.map((invoiceItem) => ({
          invoiceItemId: toStringOrNull(invoiceItem.id),
          status: toStringOrNull(invoiceItem.status),
          amount: toNumberOrZero(invoiceItem.amount),
          invoiceReference: toStringOrNull(invoiceItem.invoice_reference),
          readyAt: toIsoOrNull(invoiceItem.ready_at),
          exportedAt: toIsoOrNull(invoiceItem.exported_at),
        })),
      },
      claimRelevanceSummary: {
        claimRelevant: input.variationSummary.claimRelevant,
        commerciallyRecovered: input.variationSummary.commerciallyRecovered,
        awaitingApproval: input.variationSummary.awaitingApproval,
        awaitingIssue: input.variationSummary.awaitingIssue,
      },
      quoteLinkageSummary: {
        quoteLinked: input.variationSummary.hasQuoteLinkedLines,
        linkedQuoteCount: quoteLinkages.length,
        linkedQuoteLineCount: input.variationSummary.quoteLineItemIds.length,
        linkedQuotes: quoteLinkages,
      },
      purchaseOrderLinkageSummary: {
        purchaseOrderLinked: input.variationSummary.hasPurchaseOrderLinkedLines,
        linkedPurchaseOrderCount: purchaseOrderLinkages.length,
        linkedPurchaseOrderLineCount: input.variationSummary.purchaseOrderLineItemIds.length,
        linkedPurchaseOrders: purchaseOrderLinkages,
      },
      evidenceStrengthSummary: {
        evidenceStrength: input.variationSummary.evidenceStrength,
        mirroredCostItemCount: mirroredCostItems.length,
      },
    },
    operationalContext: {
      lifecycleStage: input.variationSummary.lifecycleStage,
      createdAt: toIsoOrNull(input.row.created_at),
      updatedAt: input.updatedAt,
      hasQuoteLinkedLines: input.variationSummary.hasQuoteLinkedLines,
      hasPurchaseOrderLinkedLines: input.variationSummary.hasPurchaseOrderLinkedLines,
      hasAttachments: input.variationSummary.hasAttachments,
      hasIssuedToClient: input.variationSummary.hasIssuedToClient,
      hasClientViewed: input.variationSummary.hasClientViewed,
      hasApproved: input.variationSummary.hasApproved,
      hasRejected: input.variationSummary.hasRejected,
      invoiceReady: input.variationSummary.invoiceReady,
      hasInvoiceItems: input.variationSummary.hasInvoiceItems,
      pricingCompleteness: input.variationSummary.pricingCompleteness,
      documentCompleteness: input.variationSummary.documentCompleteness,
      approvalCompleteness: input.variationSummary.approvalCompleteness,
      variationTurnaroundLagDays: input.variationSummary.variationTurnaroundLagDays,
      claimRelevant: input.variationSummary.claimRelevant,
      commerciallyRecovered: input.variationSummary.commerciallyRecovered,
      awaitingApproval: input.variationSummary.awaitingApproval,
      awaitingIssue: input.variationSummary.awaitingIssue,
      evidenceStrength: input.variationSummary.evidenceStrength,
    },
    lineageContext: {
      organizationId: input.organizationId,
      variationId,
      projectId: input.projectContext.projectId,
      projectName: input.projectContext.projectName,
      clientId: input.projectContext.clientId,
      clientName: input.projectContext.clientName,
      quoteIds: input.variationSummary.quoteIds,
      quoteLineItemIds: input.variationSummary.quoteLineItemIds,
      purchaseOrderIds: input.variationSummary.purchaseOrderIds,
      purchaseOrderLineItemIds: input.variationSummary.purchaseOrderLineItemIds,
      attachmentIds: uniqueNonEmpty(input.attachments.map((attachment) => toStringOrNull(attachment.id))),
      statusEventIds: uniqueNonEmpty(input.statusEvents.map((event) => toStringOrNull(event.id))),
      invoiceItemIds: uniqueNonEmpty(input.invoiceItems.map((invoiceItem) => toStringOrNull(invoiceItem.id))),
      mirroredCostItemIds: uniqueNonEmpty(mirroredCostItems.map((costItem) => toStringOrNull(costItem.id))),
      actorUserId: input.actorUserId,
      sourceTable: "project_variations",
    },
  };
}

function getRecordChangeCursor(row: JsonRecord, childCollections: Map<string, Record<string, JsonRecord[]>>, config: ContainerBuilderConfig) {
  const normalizeTimestamp = config.cursorTimestampNormalizer
    ?? ((value: unknown) => toIsoOrNull(value));
  const ownerCursorColumn = config.ownerCursorColumn ?? "updated_at";
  let cursor: UniversalLearningCursor = {
    updatedAt: normalizeTimestamp(
      row[ownerCursorColumn] ?? row.created_at,
      `${config.ownerTable}.${ownerCursorColumn}`,
    ),
    id: typeof row.id === "string" ? row.id : null,
  };

  for (const child of config.childCollections ?? []) {
    const rows = childCollections.get(child.key)?.[String(row.id)] ?? [];
    for (const childRow of rows) {
      const childCursorColumn = child.cursorColumn ?? "updated_at";
      const next: UniversalLearningCursor = {
        updatedAt: normalizeTimestamp(
          childRow[childCursorColumn] ?? childRow.created_at,
          `${child.table}.${childCursorColumn}`,
        ),
        id: typeof row.id === "string" ? row.id : null,
      };
      if (compareCursor(next, cursor) > 0) {
        cursor = next;
      }
    }
  }

  return cursor;
}

async function buildUnifiedProjectQuoteRecords(input: {
  context: UniversalLearningBuilderContext;
  limit: number;
  definition: ReturnType<typeof getUniversalLearningContainerDefinition>;
  admin: DynamicSupabaseAdminClient;
}): Promise<UniversalLearningBuilderResult> {
  const reviewWindow = buildUniversalLearningReviewWindow(input.context.reviewMonth);
  const normalizedRowsBySourceKey = new Map<string, UnifiedQuoteOwnerRow>();
  const normalizedLinesBySourceKey = new Map<string, UnifiedQuoteLineRow[]>();

  for (const source of QUOTE_SOURCE_CONFIGS) {
    const ownerQuery = input.admin
      .from(source.sourceTable)
      .select("*")
      .eq("organization_id", input.context.organizationId)
      .gte("updated_at", input.context.cursor.updatedAt && input.context.cursor.updatedAt > reviewWindow.start ? input.context.cursor.updatedAt : reviewWindow.start)
      .lt("updated_at", reviewWindow.end)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(input.limit);
    const ownerResult = await ownerQuery;
    if (ownerResult.error) {
      throw new Error(ownerResult.error.message);
    }

    const changedLineQuery = input.admin
      .from(source.lineTable)
      .select("quote_id,id,updated_at,created_at")
      .eq("organization_id", input.context.organizationId)
      .gte("updated_at", input.context.cursor.updatedAt && input.context.cursor.updatedAt > reviewWindow.start ? input.context.cursor.updatedAt : reviewWindow.start)
      .lt("updated_at", reviewWindow.end)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(input.limit);
    const changedLineResult = await changedLineQuery;
    if (changedLineResult.error) {
      throw new Error(changedLineResult.error.message);
    }

    const ownerIds = new Set<string>();
    for (const row of toArray(ownerResult.data as unknown[] | null).map(toRecord)) {
      const id = toStringOrNull(row.id);
      if (id) ownerIds.add(id);
    }
    for (const row of toArray(changedLineResult.data as unknown[] | null).map(toRecord)) {
      const quoteId = toStringOrNull(row.quote_id);
      if (quoteId) ownerIds.add(quoteId);
    }
    if (ownerIds.size === 0) {
      continue;
    }

    const fullOwnerResult = await input.admin
      .from(source.sourceTable)
      .select("*")
      .eq("organization_id", input.context.organizationId)
      .in("id", Array.from(ownerIds))
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true });
    if (fullOwnerResult.error) {
      throw new Error(fullOwnerResult.error.message);
    }

    const fullLineResult = await input.admin
      .from(source.lineTable)
      .select("*")
      .eq("organization_id", input.context.organizationId)
      .in("quote_id", Array.from(ownerIds))
      .order("sort_order", { ascending: true });
    if (fullLineResult.error) {
      throw new Error(fullLineResult.error.message);
    }

    const fullOwners = toArray(fullOwnerResult.data as unknown[] | null).map(toRecord);
    const fullLines = toArray(fullLineResult.data as unknown[] | null).map(toRecord);
    const groupedLines = new Map<string, UnifiedQuoteLineRow[]>();

    const normalizedOwners = fullOwners
      .map((row) => normalizeUnifiedQuoteOwnerRow(row, source))
      .filter((row): row is UnifiedQuoteOwnerRow => row !== null);

    for (const owner of normalizedOwners) {
      normalizedRowsBySourceKey.set(buildQuoteSourceKey(owner.__sourceTable, owner.id), owner);
    }

    for (const owner of normalizedOwners) {
      groupedLines.set(buildQuoteSourceKey(owner.__sourceTable, owner.id), []);
    }

    for (const line of fullLines) {
      const quoteId = toStringOrNull(line.quote_id);
      if (!quoteId) continue;
      const owner = normalizedOwners.find((candidate) => candidate.id === quoteId);
      if (!owner) continue;
      const normalizedLine = normalizeUnifiedQuoteLineRow({ line, owner });
      if (!normalizedLine) continue;
      const sourceKey = buildQuoteSourceKey(owner.__sourceTable, owner.id);
      groupedLines.set(sourceKey, [...(groupedLines.get(sourceKey) ?? []), normalizedLine]);
    }

    for (const [sourceKey, lines] of groupedLines.entries()) {
      normalizedLinesBySourceKey.set(sourceKey, lines);
    }
  }

  const candidateRows = Array.from(normalizedRowsBySourceKey.values()).map((row) => {
    const sourceKey = buildQuoteSourceKey(row.__sourceTable, row.id);
    const lineItems = normalizedLinesBySourceKey.get(sourceKey) ?? [];
    const recordCursor = getUnifiedQuoteRecordChangeCursor({ row, lineItems });
    return {
      row,
      lineItems,
      sourceKey,
      recordCursor,
      businessKey: getUnifiedQuoteBusinessKey(row),
    };
  }).filter((candidate) =>
    isUniversalLearningCursorInsideWindow(candidate.recordCursor, reviewWindow)
    && compareUnifiedQuoteCursor(
      {
        updatedAt: candidate.recordCursor.updatedAt,
        sourceTable: candidate.row.__sourceTable,
        sourceId: candidate.row.id,
      },
      input.context.cursor,
    ) > 0,
  );

  const dedupedByBusinessKey = new Map<string, (typeof candidateRows)[number]>();
  for (const candidate of candidateRows) {
    const existing = dedupedByBusinessKey.get(candidate.businessKey);
    if (!existing) {
      dedupedByBusinessKey.set(candidate.businessKey, candidate);
      continue;
    }
    const comparison = compareUnifiedQuoteRecordKey(
      { updatedAt: existing.recordCursor.updatedAt, sourceTable: existing.row.__sourceTable, sourceId: existing.row.id },
      { updatedAt: candidate.recordCursor.updatedAt, sourceTable: candidate.row.__sourceTable, sourceId: candidate.row.id },
    );
    if (comparison < 0 || (comparison === 0 && existing.row.__sourceTable === "opportunity_quotes" && candidate.row.__sourceTable === "project_quotes")) {
      dedupedByBusinessKey.set(candidate.businessKey, candidate);
    }
  }

  const selectedCandidates = Array.from(dedupedByBusinessKey.values())
    .sort((left, right) =>
      compareUnifiedQuoteRecordKey(
        { updatedAt: left.recordCursor.updatedAt, sourceTable: left.row.__sourceTable, sourceId: left.row.id },
        { updatedAt: right.recordCursor.updatedAt, sourceTable: right.row.__sourceTable, sourceId: right.row.id },
      ),
    )
    .slice(0, input.limit);

  if (selectedCandidates.length === 0) {
    return {
      records: [],
      nextCursorCandidate: input.context.cursor,
      reviewScopeContext: {
        module: input.definition.module,
        workflow: input.definition.workflow,
        recordCount: 0,
        projectCount: 0,
        supplierCount: 0,
        clientCount: 0,
        statusMix: {},
        projects: [],
        suppliers: [],
        clients: [],
      },
    };
  }

  const ownerRows = selectedCandidates.map((candidate) => candidate.row);
  const projectQuoteEnrichment = await loadProjectQuoteEnrichment({
    admin: input.admin,
    organizationId: input.context.organizationId,
    ownerRows,
  });

  const records: UniversalLearningBusinessRecord[] = [];
  let nextCursorCandidate = input.context.cursor;
  const projectIds = new Set<string>();
  const clientIds = new Set<string>();
  const projectContexts = new Map<string, JsonRecord>();
  const clientContexts = new Map<string, JsonRecord>();
  const statusMix = new Map<string, number>();

  for (const candidate of selectedCandidates) {
    const row = candidate.row;
    const quoteProjectContext = buildProjectQuoteProjectContext(row, projectQuoteEnrichment);
    const quoteOpportunityContext = buildProjectQuoteOpportunityContext(row, projectQuoteEnrichment);
    const quoteClientContext = buildProjectQuoteClientContext({
      row,
      enrichment: projectQuoteEnrichment,
      projectContext: quoteProjectContext,
      opportunityContext: quoteOpportunityContext,
    });
    const quoteSummary = buildProjectQuoteSummary({
      row,
      lineItems: candidate.lineItems,
      clientContext: quoteClientContext,
      projectContext: quoteProjectContext,
      opportunityContext: quoteOpportunityContext,
    });
    const enrichedPayload = buildProjectQuoteTrustBoundaryPayload({
      row,
      lineItems: candidate.lineItems,
      projectContext: quoteProjectContext,
      clientContext: quoteClientContext,
      opportunityContext: quoteOpportunityContext,
      quoteSummary,
      organizationId: input.context.organizationId,
      actorUserId: typeof row.created_by === "string" ? row.created_by : null,
      sourceTable: row.__sourceTable,
      sourceModule: row.__sourceModule,
      sourceWorkflow: row.__sourceWorkflow,
      quoteSourceType: row.__quoteSourceType,
      updatedAt: candidate.recordCursor.updatedAt ?? new Date().toISOString(),
    });
    const projectId = quoteProjectContext.projectId;
    const clientId = quoteClientContext.clientId;
    if (projectId) {
      projectIds.add(projectId);
      projectContexts.set(projectId, {
        projectId,
        projectName: quoteProjectContext.projectName,
        projectCode: quoteProjectContext.projectCode,
        projectStatus: quoteProjectContext.projectStatus,
        siteAddress: quoteProjectContext.siteAddress,
      });
    }
    if (clientId) {
      clientIds.add(clientId);
      clientContexts.set(clientId, {
        clientId,
        clientName: quoteClientContext.clientName,
        clientCompanyName: quoteClientContext.clientCompanyName,
        clientType: quoteClientContext.clientType,
        clientStatus: quoteClientContext.clientStatus,
      });
    }

    const status: UniversalLearningBusinessRecord["status"] = { status: row.status as JsonRecord["status"] };
    statusMix.set(`status:${String(row.status)}`, (statusMix.get(`status:${String(row.status)}`) ?? 0) + 1);

    if (compareUnifiedQuoteCursor(
      { updatedAt: candidate.recordCursor.updatedAt, sourceTable: row.__sourceTable, sourceId: row.id },
      nextCursorCandidate,
    ) > 0) {
      nextCursorCandidate = {
        updatedAt: candidate.recordCursor.updatedAt,
        id: buildQuoteSourceKey(row.__sourceTable, row.id),
      };
    }

    records.push({
      containerType: "project_quote",
      source: {
        table: row.__sourceTable,
        sourceId: row.id,
        sourceVersion: 1,
      },
      organizationId: input.context.organizationId,
      projectId: quoteProjectContext.projectId,
      opportunityId: quoteOpportunityContext.opportunityId,
      supplierId: null,
      clientId: quoteClientContext.clientId,
      actorUserId: typeof row.created_by === "string" ? row.created_by : null,
      updatedAt: candidate.recordCursor.updatedAt ?? new Date().toISOString(),
      status,
      payload: enrichedPayload,
      linkedContext: {
        sourceTable: row.__sourceTable,
        sourceModule: row.__sourceModule,
        sourceWorkflow: row.__sourceWorkflow,
        sourceIds: {
          projectId: quoteProjectContext.projectId,
          opportunityId: quoteOpportunityContext.opportunityId,
          supplierId: null,
          clientId: quoteClientContext.clientId,
          quoteId: row.id,
        },
      },
      routingContext: buildProjectQuoteReadOnlyRoutingContext(),
      signalStrength: quoteSummary.evidenceStrength,
    });
  }

  return {
    records,
    nextCursorCandidate,
    reviewScopeContext: {
      module: input.definition.module,
      workflow: input.definition.workflow,
      recordCount: records.length,
      projectCount: projectIds.size,
      supplierCount: 0,
      clientCount: clientIds.size,
      statusMix: Object.fromEntries(statusMix),
      projects: Array.from(projectContexts.values()),
      suppliers: [],
      clients: Array.from(clientContexts.values()),
    },
  };
}

export async function buildUniversalLearningContainerRecords(input: {
  containerType: UniversalLearningContainerType;
  context: UniversalLearningBuilderContext;
  limit?: number;
  /**
   * Server-only exact source selection for record-level freshness rebuilds.
   * It deliberately bypasses the monthly review window/cursor, but retains the
   * same organization-scoped queries, assembler and full-envelope validation.
   */
  sourceIds?: string[];
}): Promise<UniversalLearningBuilderResult> {
  const admin = createDynamicAdminSupabaseClient();
  const config = BUILDER_CONFIGS[input.containerType];
  const definition = getUniversalLearningContainerDefinition(input.containerType);
  const contextCursor = input.containerType === "supplier_invoice"
    || input.containerType === "project_claim"
    ? {
      updatedAt: normalizeSupplierBillUclTimestamp(
        input.context.cursor.updatedAt,
        input.containerType === "supplier_invoice"
          ? "Stored Supplier Bill UCL cursor"
          : "Stored Payment Claim UCL cursor",
      ),
      id: input.context.cursor.id,
    }
    : input.context.cursor;
  const limit = input.containerType === "project_claim"
    ? Math.max(1, Math.min(input.limit ?? 1_000, 1_000))
    : Math.max(1, Math.min(input.limit ?? 100, 250));
  const targetedSourceIds = uniqueNonEmpty(input.sourceIds ?? []).slice(0, limit);
  const isTargetedBuild = targetedSourceIds.length > 0;
  if (
    isTargetedBuild
    && input.containerType !== "supplier_invoice"
    && input.containerType !== "project_claim"
  ) {
    throw new Error(
      "Exact source rebuilds are currently supported only for supplier_invoice and project_claim.",
    );
  }
  if (input.containerType === "project_quote") {
    return buildUnifiedProjectQuoteRecords({
      context: input.context,
      limit,
      definition,
      admin,
    });
  }
  const reviewWindow = buildUniversalLearningReviewWindow(input.context.reviewMonth);
  const ownerIds = isTargetedBuild
    ? targetedSourceIds
    : await selectChangedOwnerIds({
      admin,
      organizationId: input.context.organizationId,
      config,
      cursor: contextCursor,
      reviewWindow,
      limit,
    });

  if (ownerIds.length === 0) {
    return {
      records: [],
      nextCursorCandidate: contextCursor,
      reviewScopeContext: {
        module: definition.module,
        workflow: definition.workflow,
        recordCount: 0,
        projectCount: 0,
        supplierCount: 0,
        clientCount: 0,
        statusMix: {},
        projects: [],
        suppliers: [],
        clients: [],
      },
    };
  }

  const ownerQuery = admin
    .from(config.ownerTable)
    .select("*")
    .eq("organization_id", input.context.organizationId)
    .in("id", ownerIds)
    .order(config.ownerCursorColumn ?? "updated_at", { ascending: true })
    .order("id", { ascending: true });

  const ownerResult = await ownerQuery;
  if (ownerResult.error) {
    throw new Error(ownerResult.error.message);
  }
  const ownerRows = toArray(ownerResult.data as unknown[] | null).map(toRecord);

  const childCollections = await loadChildCollections({
    admin,
    organizationId: input.context.organizationId,
    ownerIds,
    config,
  });
  const projectPurchaseOrderEnrichment = input.containerType === "project_purchase_order"
    ? await loadProjectPurchaseOrderEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
      childCollections,
    })
    : null;
  const supplierInvoiceEnrichment = input.containerType === "supplier_invoice"
    ? await loadSupplierInvoiceEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
      childCollections,
    })
    : null;
  const projectVariationEnrichment = input.containerType === "project_variation"
    ? await loadProjectVariationEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
      childCollections,
    })
    : null;
  const projectClaimEnrichment = input.containerType === "project_claim"
    ? await loadProjectClaimEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
      childCollections,
    })
    : null;
  const organizationMaterialEnrichment = input.containerType === "organization_material"
    ? await loadOrganizationMaterialEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
      childCollections,
    })
    : null;
  const materialImportBatchEnrichment = input.containerType === "material_import_batch"
    ? await loadMaterialImportBatchEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
      childCollections,
    })
    : null;
  const projectTimeSheetEntryEnrichment = input.containerType === "project_time_sheet_entry"
    ? await loadProjectTimeSheetEntryEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
      reviewWindow,
    })
    : null;
  const taskEnrichment = input.containerType === "task"
    ? await loadTaskEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
    })
    : null;
  const supplierInvoiceAllocationEnrichment = input.containerType === "supplier_invoice_allocation"
    ? await loadSupplierInvoiceAllocationEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
      childCollections,
    })
    : null;
  const projectActualCostEventEnrichment = input.containerType === "project_actual_cost_event"
    ? await loadProjectActualCostEventEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
    })
    : null;
  const takeoffMeasurementEnrichment = input.containerType === "takeoff_measurement"
    ? await loadTakeoffMeasurementEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
    })
    : null;
  const pricingWorkbookSheetEnrichment = input.containerType === "pricing_workbook_sheet"
    ? await loadPricingWorkbookSheetEnrichment({
      admin,
      organizationId: input.context.organizationId,
      ownerRows,
    })
    : null;

  const records: UniversalLearningBusinessRecord[] = [];
  let nextCursorCandidate = contextCursor;
  const projectIds = new Set<string>();
  const supplierIds = new Set<string>();
  const clientIds = new Set<string>();
  const projectContexts = new Map<string, JsonRecord>();
  const supplierContexts = new Map<string, JsonRecord>();
  const clientContexts = new Map<string, JsonRecord>();
  const statusMix = new Map<string, number>();

  for (const row of ownerRows) {
    const ownerId = typeof row.id === "string" ? row.id : null;
    if (!ownerId) {
      continue;
    }

    const childPayload: Record<string, JsonRecord[]> = {};
    for (const child of config.childCollections ?? []) {
      childPayload[child.key] = childCollections.get(child.key)?.[ownerId] ?? [];
    }

    let recordCursor = getRecordChangeCursor(row, childCollections, config);
    if (projectClaimEnrichment) {
      const projectId = toStringOrNull(row.project_id);
      const project = projectId
        ? projectClaimEnrichment.projectsById.get(projectId) ?? null
        : null;
      const clientId = toStringOrNull(project?.client_id);
      const dependencyRows = [
        project,
        clientId ? projectClaimEnrichment.clientsById.get(clientId) ?? null : null,
        ...((childPayload.lineItems ?? []).flatMap((line) => {
          const sourceId = toStringOrNull(line.source_document_id);
          const sourceKind = toStringOrNull(line.source_kind)?.toLowerCase();
          if (!sourceId) return [];
          if (sourceKind === "quote") {
            return [projectClaimEnrichment.quotesById.get(sourceId) ?? null];
          }
          if (sourceKind === "variation") {
            return [projectClaimEnrichment.variationsById.get(sourceId) ?? null];
          }
          return [];
        })),
      ].filter((dependency): dependency is JsonRecord => Boolean(dependency));
      for (const dependency of dependencyRows) {
        const dependencyUpdatedAt = normalizeSupplierBillUclTimestamp(
          dependency.updated_at ?? dependency.created_at,
          `Payment Claim UCL enrichment dependency for ${ownerId}`,
        );
        const dependencyCursor = { updatedAt: dependencyUpdatedAt, id: ownerId };
        if (compareCursor(dependencyCursor, recordCursor) > 0) {
          recordCursor = dependencyCursor;
        }
      }
    }
    if (
      (input.containerType === "supplier_invoice" || input.containerType === "project_claim")
      && !recordCursor.updatedAt
    ) {
      throw new Error(
        `${input.containerType === "supplier_invoice" ? "Supplier Bill" : "Payment Claim"} UCL ${ownerId} has no canonical owner or direct-child cursor timestamp.`,
      );
    }
    const shouldIncludeRecord = isTargetedBuild || shouldIncludeUniversalLearningRecord({
      recordCursor,
      previousCursor: contextCursor,
      window: reviewWindow,
    });
    if (shouldIncludeRecord && compareCursor(recordCursor, nextCursorCandidate) > 0) {
      nextCursorCandidate = recordCursor;
    }

    if (!shouldIncludeRecord) {
      continue;
    }

    let enrichedPayload: JsonRecord = {};
    let enrichedRoutingContext = extractRoutingContext(row, childPayload);
    let signalStrengthOverride: UniversalLearningRecordStrength | null = null;
    let supplierBillV2Sections: ReturnType<typeof buildSupplierBillUclV2Sections> | null = null;
    let paymentClaimV2Sections: ReturnType<typeof buildPaymentClaimUclV2Sections> | null = null;
    const supplierInvoiceSupplierContext = supplierInvoiceEnrichment
      ? buildSupplierInvoiceSupplierContext(row, supplierInvoiceEnrichment)
      : null;
    const projectVariationProjectContext = projectVariationEnrichment
      ? buildProjectVariationProjectContext(row, projectVariationEnrichment)
      : null;
    const projectClaimProjectContext = projectClaimEnrichment
      ? buildProjectClaimProjectContext(row, projectClaimEnrichment)
      : null;
    const takeoffMeasurementProjectContext = takeoffMeasurementEnrichment
      ? buildTakeoffMeasurementProjectContext(row, takeoffMeasurementEnrichment)
      : null;
    const pricingWorkbookSheetWorkbookContext = pricingWorkbookSheetEnrichment
      ? buildPricingWorkbookSheetWorkbookContext(row, pricingWorkbookSheetEnrichment)
      : null;
    const pricingWorkbookSheetProjectContext = pricingWorkbookSheetEnrichment
      ? buildPricingWorkbookSheetProjectContext(row, pricingWorkbookSheetEnrichment)
      : null;
    const pricingWorkbookSheetClientContext = pricingWorkbookSheetEnrichment && pricingWorkbookSheetProjectContext
      ? buildPricingWorkbookSheetClientContext({
        row,
        enrichment: pricingWorkbookSheetEnrichment,
        projectContext: pricingWorkbookSheetProjectContext,
      })
      : null;
    const timeSheetProjectContext = projectTimeSheetEntryEnrichment
      ? buildProjectTimeSheetEntryProjectContext(row, projectTimeSheetEntryEnrichment)
      : null;
    const timeSheetPurchaseOrderContext = projectTimeSheetEntryEnrichment
      ? buildProjectTimeSheetEntryPurchaseOrderContext(row, projectTimeSheetEntryEnrichment)
      : null;
    const taskProjectContext = taskEnrichment
      ? buildTaskProjectContext(row, taskEnrichment)
      : null;
    const poSupplierContext = projectPurchaseOrderEnrichment
      ? buildSupplierDisplayContext(row, projectPurchaseOrderEnrichment)
      : null;
    const poProjectContext = projectPurchaseOrderEnrichment
      ? buildProjectDisplayContext(row, projectPurchaseOrderEnrichment)
      : null;
    const supplierInvoiceAllocationInvoice = supplierInvoiceAllocationEnrichment
      ? supplierInvoiceAllocationEnrichment.invoicesById.get(String(row.supplier_invoice_id ?? "")) ?? null
      : null;
    const supplierInvoiceAllocationInvoiceLine = supplierInvoiceAllocationEnrichment
      ? supplierInvoiceAllocationEnrichment.invoiceLinesById.get(String(row.supplier_invoice_line_id ?? "")) ?? null
      : null;
    const supplierInvoiceAllocationPurchaseOrder = supplierInvoiceAllocationEnrichment
      ? supplierInvoiceAllocationEnrichment.purchaseOrdersById.get(String(row.purchase_order_id ?? "")) ?? null
      : null;
    const supplierInvoiceAllocationPurchaseOrderLine = supplierInvoiceAllocationEnrichment
      ? supplierInvoiceAllocationEnrichment.purchaseOrderLinesById.get(String(row.purchase_order_line_item_id ?? "")) ?? null
      : null;
    const supplierInvoiceAllocationSupplierContext = supplierInvoiceAllocationEnrichment
      ? buildSupplierInvoiceAllocationSupplierContext(row, supplierInvoiceAllocationEnrichment)
      : null;
    const supplierInvoiceAllocationProjectContext = supplierInvoiceAllocationEnrichment
      ? buildSupplierInvoiceAllocationProjectContext({
        row,
        invoiceLine: supplierInvoiceAllocationInvoiceLine,
        purchaseOrder: supplierInvoiceAllocationPurchaseOrder,
        purchaseOrderLine: supplierInvoiceAllocationPurchaseOrderLine,
        enrichment: supplierInvoiceAllocationEnrichment,
      })
      : null;
    const projectActualCostEventAllocation = projectActualCostEventEnrichment
      ? projectActualCostEventEnrichment.allocationsById.get(
        String(row.source_invoice_allocation_id ?? row.supplier_invoice_line_allocation_id ?? ""),
      ) ?? null
      : null;
    const projectActualCostEventInvoice = projectActualCostEventEnrichment
      ? projectActualCostEventEnrichment.invoicesById.get(String(row.supplier_invoice_id ?? "")) ?? null
      : null;
    const projectActualCostEventInvoiceLine = projectActualCostEventEnrichment
      ? projectActualCostEventEnrichment.invoiceLinesById.get(
        String(row.source_invoice_line_id ?? row.supplier_invoice_line_id ?? ""),
      ) ?? null
      : null;
    const projectActualCostEventPurchaseOrder = projectActualCostEventEnrichment
      ? projectActualCostEventEnrichment.purchaseOrdersById.get(String(row.purchase_order_id ?? "")) ?? null
      : null;
    const projectActualCostEventPurchaseOrderLine = projectActualCostEventEnrichment
      ? projectActualCostEventEnrichment.purchaseOrderLinesById.get(String(row.purchase_order_line_item_id ?? "")) ?? null
      : null;
    const projectActualCostEventSupplierContext = projectActualCostEventEnrichment
      ? buildProjectActualCostEventSupplierContext({
        row,
        invoice: projectActualCostEventInvoice,
        purchaseOrder: projectActualCostEventPurchaseOrder,
        enrichment: projectActualCostEventEnrichment,
      })
      : null;
    const projectActualCostEventProjectContext = projectActualCostEventEnrichment
      ? buildProjectActualCostEventProjectContext({
        row,
        allocation: projectActualCostEventAllocation,
        invoiceLine: projectActualCostEventInvoiceLine,
        purchaseOrder: projectActualCostEventPurchaseOrder,
        purchaseOrderLine: projectActualCostEventPurchaseOrderLine,
        enrichment: projectActualCostEventEnrichment,
      })
      : null;
    let organizationMaterialPrimarySupplierContext: { supplierId: string | null; supplierName: string | null } | null = null;

    if (takeoffMeasurementEnrichment && takeoffMeasurementProjectContext) {
      const takeoffPoints = childPayload.points ?? [];
      const takeoffEvents = childPayload.events ?? [];
      const takeoffAreaShapes = childPayload.areaShapes ?? (takeoffMeasurementEnrichment.areaShapesByMeasurementId.get(ownerId) ?? []);
      const takeoffLinePaths = childPayload.linePaths ?? (takeoffMeasurementEnrichment.linePathsByMeasurementId.get(ownerId) ?? []);
      const takeoffMeasurementGroupContext = buildTakeoffMeasurementGroupContext(row, takeoffMeasurementEnrichment);
      const takeoffMeasurementPageContext = buildTakeoffMeasurementPageContext(row, takeoffMeasurementEnrichment);
      const takeoffMeasurementCalibrationContext = buildTakeoffMeasurementCalibrationContext(row, takeoffMeasurementEnrichment);
      const takeoffSummary = buildTakeoffMeasurementSummary({
        row,
        points: takeoffPoints,
        events: takeoffEvents,
        areaShapes: takeoffAreaShapes,
        linePaths: takeoffLinePaths,
        enrichment: takeoffMeasurementEnrichment,
        projectContext: takeoffMeasurementProjectContext,
        groupContext: takeoffMeasurementGroupContext,
        pageContext: takeoffMeasurementPageContext,
        calibrationContext: takeoffMeasurementCalibrationContext,
      });

      enrichedPayload = buildTakeoffMeasurementTrustBoundaryPayload({
        row,
        points: takeoffPoints,
        events: takeoffEvents,
        areaShapes: takeoffAreaShapes,
        linePaths: takeoffLinePaths,
        projectContext: takeoffMeasurementProjectContext,
        groupContext: takeoffMeasurementGroupContext,
        pageContext: takeoffMeasurementPageContext,
        calibrationContext: takeoffMeasurementCalibrationContext,
        takeoffSummary,
        organizationId: input.context.organizationId,
      });
      enrichedRoutingContext = buildTakeoffMeasurementReadOnlyRoutingContext();
      signalStrengthOverride = takeoffSummary.evidenceStrength;
    }

    if (
      pricingWorkbookSheetEnrichment
      && pricingWorkbookSheetWorkbookContext
      && pricingWorkbookSheetProjectContext
      && pricingWorkbookSheetClientContext
    ) {
      const worksheetSummary = buildPricingWorkbookSheetSummary({
        row,
        workbookContext: pricingWorkbookSheetWorkbookContext,
        projectContext: pricingWorkbookSheetProjectContext,
        clientContext: pricingWorkbookSheetClientContext,
      });
      enrichedPayload = buildPricingWorkbookSheetTrustBoundaryPayload({
        row,
        workbookContext: pricingWorkbookSheetWorkbookContext,
        projectContext: pricingWorkbookSheetProjectContext,
        clientContext: pricingWorkbookSheetClientContext,
        worksheetSummary,
        organizationId: input.context.organizationId,
      });
      enrichedRoutingContext = buildPricingWorkbookSheetReadOnlyRoutingContext();
      signalStrengthOverride = worksheetSummary.evidenceStrength;
    }

    if (projectPurchaseOrderEnrichment) {
      const poLineItems = childPayload.lineItems ?? [];
      const statusContext = buildProjectPurchaseOrderStatusContext(row, childPayload.statusEvents ?? []);
      const poSummary = buildProjectPurchaseOrderSummary({
        row,
        lineItems: poLineItems,
        supplierContext: poSupplierContext,
        statusContext,
      });
      enrichedPayload = buildProjectPurchaseOrderTrustBoundaryPayload({
        row,
        lineItems: poLineItems,
        statusContext,
        supplierContext: poSupplierContext,
        projectContext: poProjectContext,
        poSummary,
        enrichment: projectPurchaseOrderEnrichment,
        organizationId: input.context.organizationId,
        actorUserId: config.actorUserIdColumn ? (typeof row[config.actorUserIdColumn] === "string" ? row[config.actorUserIdColumn] as string : null) : null,
        sourceTable: config.ownerTable,
        sourceModule: definition.module,
        sourceWorkflow: definition.workflow,
        updatedAt: recordCursor.updatedAt ?? new Date().toISOString(),
      });
      enrichedRoutingContext = buildProjectPurchaseOrderReadOnlyRoutingContext({
        lineItems: poLineItems,
        enrichment: projectPurchaseOrderEnrichment,
      });
      signalStrengthOverride = poSummary.evidenceStrength;
    }

    if (projectVariationEnrichment && projectVariationProjectContext) {
      const variationLineItems = childPayload.lineItems ?? [];
      const variationAttachments = childPayload.attachments ?? [];
      const variationStatusEvents = childPayload.statusEvents ?? [];
      const variationInvoiceItems = childPayload.invoiceItems ?? [];
      const variationSummary = buildProjectVariationSummary({
        row,
        lineItems: variationLineItems,
        attachments: variationAttachments,
        statusEvents: variationStatusEvents,
        invoiceItems: variationInvoiceItems,
        projectContext: projectVariationProjectContext,
      });
      enrichedPayload = buildProjectVariationTrustBoundaryPayload({
        row,
        lineItems: variationLineItems,
        attachments: variationAttachments,
        statusEvents: variationStatusEvents,
        invoiceItems: variationInvoiceItems,
        projectContext: projectVariationProjectContext,
        variationSummary,
        enrichment: projectVariationEnrichment,
        organizationId: input.context.organizationId,
        actorUserId: config.actorUserIdColumn ? (typeof row[config.actorUserIdColumn] === "string" ? row[config.actorUserIdColumn] as string : null) : null,
        updatedAt: recordCursor.updatedAt ?? new Date().toISOString(),
      });
      enrichedRoutingContext = buildProjectVariationReadOnlyRoutingContext(
        projectVariationEnrichment.mirroredCostItemsByVariationId.get(ownerId) ?? [],
      );
      signalStrengthOverride = variationSummary.evidenceStrength;
    }

    if (projectClaimEnrichment && projectClaimProjectContext) {
      const claimLineItems = childPayload.lineItems ?? [];
      const claimRoutingContext = buildProjectClaimReadOnlyRoutingContext({
        row,
        lineItems: claimLineItems,
        enrichment: projectClaimEnrichment,
      });
      const project = projectClaimProjectContext.projectId
        ? projectClaimEnrichment.projectsById.get(projectClaimProjectContext.projectId) ?? null
        : null;
      const client = projectClaimProjectContext.clientId
        ? projectClaimEnrichment.clientsById.get(projectClaimProjectContext.clientId) ?? null
        : null;
      paymentClaimV2Sections = buildPaymentClaimUclV2Sections({
        organizationId: input.context.organizationId,
        row,
        lines: claimLineItems,
        project,
        client,
        quotesById: projectClaimEnrichment.quotesById,
        variationsById: projectClaimEnrichment.variationsById,
        retentionAllocations: childPayload.retentionAllocations ?? [],
        accountingDocuments: childPayload.accountingDocuments ?? [],
        routingContext: claimRoutingContext,
        assembledAt: new Date().toISOString(),
        updatedAt: recordCursor.updatedAt!,
      });
      enrichedPayload = paymentClaimV2Sections.payload as JsonRecord;
      enrichedRoutingContext = paymentClaimV2Sections.routingContext;
      signalStrengthOverride = paymentClaimV2Sections.signalStrength;
    }

    if (supplierInvoiceEnrichment && supplierInvoiceSupplierContext) {
      const invoiceLines = childPayload.lines ?? [];
      const invoiceDocuments = childPayload.documents ?? [];
      const invoiceMatches = childPayload.matches ?? [];
      const invoiceAllocations = childPayload.allocations ?? [];
      const invoiceActualCostEvents = childPayload.actualCostEvents ?? [];
      const accountingDocuments =
        supplierInvoiceEnrichment.accountingDocumentsByInvoiceId.get(ownerId) ?? [];
      const accountingDocumentLines = accountingDocuments.flatMap((document) => {
        const versionId = toStringOrNull(document.current_version_id);
        return versionId
          ? supplierInvoiceEnrichment.accountingDocumentLinesByVersionId.get(versionId) ?? []
          : [];
      });
      const invoicePurchaseOrderLineIds = uniqueNonEmpty([
        ...invoiceAllocations.map((allocation) => toStringOrNull(allocation.purchase_order_line_item_id)),
        ...invoiceActualCostEvents.map((event) => toStringOrNull(event.purchase_order_line_item_id)),
      ]);
      supplierBillV2Sections = buildSupplierBillUclV2Sections({
        organizationId: input.context.organizationId,
        row,
        lines: invoiceLines,
        documents: invoiceDocuments,
        matches: invoiceMatches,
        allocations: invoiceAllocations,
        actualCostEvents: invoiceActualCostEvents,
        supplier: supplierInvoiceSupplierContext.supplierId
          ? supplierInvoiceEnrichment.suppliersById.get(supplierInvoiceSupplierContext.supplierId) ?? null
          : null,
        purchaseOrdersById: supplierInvoiceEnrichment.purchaseOrdersById,
        purchaseOrderLinesById: supplierInvoiceEnrichment.purchaseOrderLinesById,
        projectsById: supplierInvoiceEnrichment.projectsById,
        extractions: supplierInvoiceEnrichment.extractionsByInvoiceId.get(ownerId) ?? [],
        commercialApprovals:
          supplierInvoiceEnrichment.commercialApprovalsByInvoiceId.get(ownerId) ?? [],
        commercialSnapshots:
          supplierInvoiceEnrichment.commercialSnapshotsByInvoiceId.get(ownerId) ?? [],
        historicalApprovedSnapshots: invoicePurchaseOrderLineIds.flatMap(
          (lineId) =>
            supplierInvoiceEnrichment.historicalApprovedSnapshotsByPurchaseOrderLineId.get(lineId) ?? [],
        ),
        commercialVariances:
          supplierInvoiceEnrichment.commercialVariancesByInvoiceId.get(ownerId) ?? [],
        siteReviewSubmissions:
          supplierInvoiceEnrichment.siteReviewSubmissionsByInvoiceId.get(ownerId) ?? [],
        siteReviewDecisions:
          supplierInvoiceEnrichment.siteReviewDecisionsByInvoiceId.get(ownerId) ?? [],
        accountsApprovals:
          supplierInvoiceEnrichment.accountsApprovalsByInvoiceId.get(ownerId) ?? [],
        activityEvents:
          supplierInvoiceEnrichment.activityEventsByInvoiceId.get(ownerId) ?? [],
        accountingDocuments,
        accountingDocumentLines,
        assembledAt: new Date().toISOString(),
        updatedAt: recordCursor.updatedAt!,
      });
      enrichedPayload = supplierBillV2Sections.payload as JsonRecord;
      enrichedRoutingContext = supplierBillV2Sections.routingContext;
      signalStrengthOverride = supplierBillV2Sections.evidenceStrength;
    }

    if (supplierInvoiceAllocationEnrichment && supplierInvoiceAllocationSupplierContext && supplierInvoiceAllocationProjectContext) {
      const invoiceId = toStringOrNull(row.supplier_invoice_id);
      const invoiceDocuments = invoiceId
        ? supplierInvoiceAllocationEnrichment.invoiceDocumentsByInvoiceId.get(invoiceId) ?? []
        : [];
      const invoiceMatches = invoiceId
        ? supplierInvoiceAllocationEnrichment.purchaseOrderMatchesByInvoiceId.get(invoiceId) ?? []
        : [];
      const purchaseOrderId = toStringOrNull(row.purchase_order_id);
      const purchaseOrderMatch = purchaseOrderId
        ? invoiceMatches.find((match) => toStringOrNull(match.purchase_order_id) === purchaseOrderId) ?? null
        : null;
      const siblingAllocations = invoiceId
        ? supplierInvoiceAllocationEnrichment.siblingAllocationsByInvoiceId.get(invoiceId) ?? []
        : [];
      const actualCostEvents = supplierInvoiceAllocationEnrichment.actualCostEventsByAllocationId.get(ownerId) ?? [];
      const successorAllocationIds = supplierInvoiceAllocationEnrichment.successorAllocationIdsByAllocationId.get(ownerId) ?? [];
      const allocationSummary = buildSupplierInvoiceAllocationSummary({
        row,
        invoice: supplierInvoiceAllocationInvoice,
        invoiceLine: supplierInvoiceAllocationInvoiceLine,
        invoiceDocuments,
        purchaseOrderMatch,
        purchaseOrder: supplierInvoiceAllocationPurchaseOrder,
        purchaseOrderLine: supplierInvoiceAllocationPurchaseOrderLine,
        projectContext: supplierInvoiceAllocationProjectContext,
        supplierContext: supplierInvoiceAllocationSupplierContext,
        actualCostEvents,
        siblingAllocations,
        successorAllocationIds,
      });

      enrichedPayload = buildSupplierInvoiceAllocationTrustBoundaryPayload({
        row,
        invoice: supplierInvoiceAllocationInvoice,
        invoiceLine: supplierInvoiceAllocationInvoiceLine,
        invoiceDocuments,
        purchaseOrderMatch,
        purchaseOrder: supplierInvoiceAllocationPurchaseOrder,
        purchaseOrderLine: supplierInvoiceAllocationPurchaseOrderLine,
        projectContext: supplierInvoiceAllocationProjectContext,
        supplierContext: supplierInvoiceAllocationSupplierContext,
        actualCostEvents,
        siblingAllocations,
        successorAllocationIds,
        allocationSummary,
        organizationId: input.context.organizationId,
      });
      enrichedRoutingContext = buildSupplierInvoiceAllocationReadOnlyRoutingContext(row);
      signalStrengthOverride = allocationSummary.evidenceStrength;
    }

    if (projectActualCostEventEnrichment && projectActualCostEventSupplierContext && projectActualCostEventProjectContext) {
      const correctionRootEventId = toStringOrNull(row.correction_root_event_id) ?? ownerId;
      const correctionChainEvents = correctionRootEventId
        ? projectActualCostEventEnrichment.correctionChainEventsByRootId.get(correctionRootEventId) ?? []
        : [];
      const actualCostEventSummary = buildProjectActualCostEventSummary({
        row,
        invoice: projectActualCostEventInvoice,
        invoiceLine: projectActualCostEventInvoiceLine,
        allocation: projectActualCostEventAllocation,
        purchaseOrder: projectActualCostEventPurchaseOrder,
        purchaseOrderLine: projectActualCostEventPurchaseOrderLine,
        supplierContext: projectActualCostEventSupplierContext,
        projectContext: projectActualCostEventProjectContext,
        correctionChainEvents,
      });
      enrichedPayload = buildProjectActualCostEventTrustBoundaryPayload({
        row,
        invoice: projectActualCostEventInvoice,
        invoiceLine: projectActualCostEventInvoiceLine,
        allocation: projectActualCostEventAllocation,
        purchaseOrder: projectActualCostEventPurchaseOrder,
        purchaseOrderLine: projectActualCostEventPurchaseOrderLine,
        projectContext: projectActualCostEventProjectContext,
        supplierContext: projectActualCostEventSupplierContext,
        correctionChainEvents,
        actualCostEventSummary,
        organizationId: input.context.organizationId,
      });
      enrichedRoutingContext = buildProjectActualCostEventReadOnlyRoutingContext(row);
      signalStrengthOverride = actualCostEventSummary.evidenceStrength;
    }

    if (organizationMaterialEnrichment) {
      const supplierPrices = childPayload.supplierPrices ?? [];
      const importRows = ownerId
        ? organizationMaterialEnrichment.importRowsByMaterialId.get(ownerId) ?? []
        : [];
      const materialSummary = buildOrganizationMaterialSummary({
        row,
        supplierPrices,
        importRows,
        enrichment: organizationMaterialEnrichment,
      });
      enrichedPayload = buildOrganizationMaterialTrustBoundaryPayload({
        row,
        supplierPrices,
        importRows,
        enrichment: organizationMaterialEnrichment,
        organizationId: input.context.organizationId,
        materialSummary,
      });
      enrichedRoutingContext = buildOrganizationMaterialReadOnlyRoutingContext(row);
      signalStrengthOverride = materialSummary.evidenceStrength;

      const primarySupplierPrice = materialSummary.preferredSupplierPrices[0]
        ?? materialSummary.currentSupplierPrices[0]
        ?? null;
      const primarySupplierId = toStringOrNull(primarySupplierPrice?.supplier_id);
      organizationMaterialPrimarySupplierContext = {
        supplierId: primarySupplierId,
        supplierName: buildOrganizationMaterialSupplierName(primarySupplierId, organizationMaterialEnrichment),
      };
    }

    if (materialImportBatchEnrichment) {
      const importRows = childPayload.rows ?? [];
      const supplierPrices = ownerId
        ? materialImportBatchEnrichment.supplierPricesByBatchId.get(ownerId) ?? []
        : [];
      const materialImportBatchSummary = buildMaterialImportBatchSummary({
        row,
        rows: importRows,
        supplierPrices,
        enrichment: materialImportBatchEnrichment,
      });
      enrichedPayload = buildMaterialImportBatchTrustBoundaryPayload({
        row,
        rows: importRows,
        enrichment: materialImportBatchEnrichment,
        supplierPrices,
        organizationId: input.context.organizationId,
        materialImportBatchSummary,
      });
      enrichedRoutingContext = buildMaterialImportBatchReadOnlyRoutingContext({
        rows: importRows,
        enrichment: materialImportBatchEnrichment,
      });
      signalStrengthOverride = materialImportBatchSummary.evidenceStrength;
    }

    if (projectTimeSheetEntryEnrichment && timeSheetProjectContext && timeSheetPurchaseOrderContext) {
      const timeSheetEvents = childPayload.events ?? [];
      const syncedLines = ownerId
        ? projectTimeSheetEntryEnrichment.purchaseOrderLinesByEntryId.get(ownerId) ?? []
        : [];
      const workerReviewWindowEntries = toStringOrNull(row.worker_user_id)
        ? projectTimeSheetEntryEnrichment.reviewWindowEntriesByWorkerId.get(String(row.worker_user_id)) ?? []
        : [];
      const timeSheetSummary = buildProjectTimeSheetEntrySummary({
        row,
        events: timeSheetEvents,
        syncedLines,
        projectContext: timeSheetProjectContext,
        purchaseOrderContext: timeSheetPurchaseOrderContext,
        reviewWindowEntries: workerReviewWindowEntries,
      });

      enrichedPayload = buildProjectTimeSheetEntryTrustBoundaryPayload({
        row,
        events: timeSheetEvents,
        syncedLines,
        projectContext: timeSheetProjectContext,
        purchaseOrderContext: timeSheetPurchaseOrderContext,
        timeSheetSummary,
        organizationId: input.context.organizationId,
      });
      enrichedRoutingContext = buildProjectTimeSheetEntryReadOnlyRoutingContext({
        syncedLines,
        enrichment: projectTimeSheetEntryEnrichment,
      });
      signalStrengthOverride = timeSheetSummary.evidenceStrength;
    }

    if (taskEnrichment && taskProjectContext) {
      const taskActivity = childPayload.activity ?? [];
      const taskComments = childPayload.comments ?? [];
      const taskAttachments = childPayload.attachments ?? [];
      const taskLinks = childPayload.links ?? [];
      const taskLegacyAttachments = taskEnrichment.legacyAttachmentsByTaskId.get(ownerId) ?? [];
      const taskQualityIssue = toStringOrNull(row.linked_issue_id)
        ? taskEnrichment.qualityIssuesById.get(String(row.linked_issue_id)) ?? null
        : null;
      const taskInspection = toStringOrNull(row.linked_inspection_id)
        ? taskEnrichment.inspectionsById.get(String(row.linked_inspection_id)) ?? null
        : null;
      const taskInspectionItem = toStringOrNull(row.linked_inspection_item_id)
        ? taskEnrichment.inspectionItemsById.get(String(row.linked_inspection_item_id)) ?? null
        : null;
      const taskPurchaseOrder = toStringOrNull(row.linked_purchase_order_id)
        ? taskEnrichment.purchaseOrdersById.get(String(row.linked_purchase_order_id)) ?? null
        : null;
      const taskVariation = toStringOrNull(row.linked_variation_id)
        ? taskEnrichment.variationsById.get(String(row.linked_variation_id)) ?? null
        : null;
      const taskQuote = toStringOrNull(row.linked_quote_id)
        ? taskEnrichment.quotesById.get(String(row.linked_quote_id)) ?? null
        : null;

      enrichedPayload = buildTaskTrustBoundaryPayload({
        row,
        activity: taskActivity,
        comments: taskComments,
        attachments: taskAttachments,
        links: taskLinks,
        legacyAttachments: taskLegacyAttachments,
        projectContext: taskProjectContext,
        qualityIssue: taskQualityIssue,
        inspection: taskInspection,
        inspectionItem: taskInspectionItem,
        purchaseOrder: taskPurchaseOrder,
        variation: taskVariation,
        quote: taskQuote,
      });
      enrichedRoutingContext = buildTaskReadOnlyRoutingContext();
      signalStrengthOverride = (enrichedPayload.operationalContext as JsonRecord | undefined)?.evidenceStrength as UniversalLearningRecordStrength | null;
    }

    const supplierInvoiceProjectIds = supplierBillV2Sections?.projectIds ?? [];
    const supplierInvoiceClientIds: string[] = [];
    const projectId = pricingWorkbookSheetProjectContext?.projectId
      ?? takeoffMeasurementProjectContext?.projectId
      ?? projectVariationProjectContext?.projectId
      ?? projectClaimProjectContext?.projectId
      ?? timeSheetProjectContext?.projectId
      ?? taskProjectContext?.projectId
      ?? poProjectContext?.projectId
      ?? supplierInvoiceAllocationProjectContext?.projectId
      ?? projectActualCostEventProjectContext?.projectId
      ?? (supplierInvoiceProjectIds.length === 1 ? supplierInvoiceProjectIds[0] : null)
      ?? (config.projectIdColumn ? (typeof row[config.projectIdColumn] === "string" ? row[config.projectIdColumn] as string : null) : null);
    const opportunityId = pricingWorkbookSheetProjectContext?.opportunityId
      ?? taskProjectContext?.opportunityId
      ?? (config.opportunityIdColumn ? (typeof row[config.opportunityIdColumn] === "string" ? row[config.opportunityIdColumn] as string : null) : null);
    const supplierId = supplierBillV2Sections
      ? supplierBillV2Sections.payload.lineage.supplierId
      : supplierInvoiceAllocationSupplierContext?.supplierId
        ?? projectActualCostEventSupplierContext?.supplierId
        ?? organizationMaterialPrimarySupplierContext?.supplierId
        ?? supplierInvoiceSupplierContext?.supplierId
        ?? poSupplierContext?.supplierId
        ?? (config.supplierIdColumn ? (typeof row[config.supplierIdColumn] === "string" ? row[config.supplierIdColumn] as string : null) : null);
    const clientId = pricingWorkbookSheetClientContext?.clientId
      ?? takeoffMeasurementProjectContext?.clientId
      ?? projectVariationProjectContext?.clientId
      ?? projectClaimProjectContext?.clientId
      ?? timeSheetProjectContext?.clientId
      ?? taskProjectContext?.clientId
      ?? poProjectContext?.clientId
      ?? supplierInvoiceAllocationProjectContext?.clientId
      ?? projectActualCostEventProjectContext?.clientId
      ?? (supplierInvoiceClientIds.length === 1 ? supplierInvoiceClientIds[0] : null)
      ?? (config.clientIdColumn ? (typeof row[config.clientIdColumn] === "string" ? row[config.clientIdColumn] as string : null) : null);
    const actorUserId = config.actorUserIdColumn ? (typeof row[config.actorUserIdColumn] === "string" ? row[config.actorUserIdColumn] as string : null) : null;
    if (projectId) projectIds.add(projectId);
    if (supplierId) supplierIds.add(supplierId);
    if (clientId) clientIds.add(clientId);
    if (poProjectContext?.projectId) {
      projectContexts.set(poProjectContext.projectId, poProjectContext);
    }
    if (projectVariationProjectContext?.projectId) {
      projectContexts.set(projectVariationProjectContext.projectId, {
        projectId: projectVariationProjectContext.projectId,
        projectName: projectVariationProjectContext.projectName,
        projectCode: projectVariationProjectContext.projectCode,
        projectStatus: projectVariationProjectContext.projectStatus,
      });
    }
    if (projectClaimProjectContext?.projectId) {
      projectContexts.set(projectClaimProjectContext.projectId, {
        projectId: projectClaimProjectContext.projectId,
        projectName: projectClaimProjectContext.projectName,
        projectCode: projectClaimProjectContext.projectCode,
        projectStatus: projectClaimProjectContext.projectStatus,
      });
    }
    if (pricingWorkbookSheetProjectContext?.projectId) {
      projectContexts.set(pricingWorkbookSheetProjectContext.projectId, {
        projectId: pricingWorkbookSheetProjectContext.projectId,
        projectName: pricingWorkbookSheetProjectContext.projectName,
        projectCode: pricingWorkbookSheetProjectContext.projectCode,
        projectStatus: pricingWorkbookSheetProjectContext.projectStatus,
      });
    }
    if (takeoffMeasurementProjectContext?.projectId) {
      projectContexts.set(takeoffMeasurementProjectContext.projectId, {
        projectId: takeoffMeasurementProjectContext.projectId,
        projectName: takeoffMeasurementProjectContext.projectName,
        projectCode: takeoffMeasurementProjectContext.projectCode,
        projectStatus: takeoffMeasurementProjectContext.projectStatus,
      });
    }
    if (timeSheetProjectContext?.projectId) {
      projectContexts.set(timeSheetProjectContext.projectId, {
        projectId: timeSheetProjectContext.projectId,
        projectName: timeSheetProjectContext.projectName,
        projectCode: timeSheetProjectContext.projectCode,
        projectStatus: timeSheetProjectContext.projectStatus,
      });
    }
    if (taskProjectContext?.projectId) {
      projectContexts.set(taskProjectContext.projectId, {
        projectId: taskProjectContext.projectId,
        projectName: taskProjectContext.projectName,
        projectCode: taskProjectContext.projectCode,
        projectStatus: taskProjectContext.projectStatus,
        siteAddress: taskProjectContext.siteAddress,
      });
    }
    if (poSupplierContext?.supplierId) {
      supplierContexts.set(poSupplierContext.supplierId, poSupplierContext);
    }
    if (supplierInvoiceSupplierContext?.supplierId) {
      supplierContexts.set(supplierInvoiceSupplierContext.supplierId, supplierInvoiceSupplierContext);
    }
    if (supplierInvoiceAllocationSupplierContext?.supplierId) {
      supplierContexts.set(supplierInvoiceAllocationSupplierContext.supplierId, supplierInvoiceAllocationSupplierContext);
    }
    if (organizationMaterialPrimarySupplierContext?.supplierId) {
      supplierContexts.set(organizationMaterialPrimarySupplierContext.supplierId, organizationMaterialPrimarySupplierContext);
    }
    if (poProjectContext?.clientId) {
      clientContexts.set(poProjectContext.clientId, {
        clientId: poProjectContext.clientId,
        clientName: poProjectContext.clientName,
      });
    }
    if (projectVariationProjectContext?.clientId) {
      clientContexts.set(projectVariationProjectContext.clientId, {
        clientId: projectVariationProjectContext.clientId,
        clientName: projectVariationProjectContext.clientName,
      });
    }
    if (projectClaimProjectContext?.clientId) {
      clientContexts.set(projectClaimProjectContext.clientId, {
        clientId: projectClaimProjectContext.clientId,
        clientName: projectClaimProjectContext.clientName,
      });
    }
    if (supplierInvoiceEnrichment) {
      const projectIdsForInvoice = supplierBillV2Sections?.projectIds ?? [];
      const clientIdsForInvoice: string[] = [];
      for (const invoiceProjectId of projectIdsForInvoice) {
        if (typeof invoiceProjectId !== "string") continue;
        const project = supplierInvoiceEnrichment.projectsById.get(invoiceProjectId) ?? null;
        projectContexts.set(invoiceProjectId, {
          projectId: invoiceProjectId,
          projectName: toStringOrNull(project?.name),
          projectCode: toStringOrNull(project?.project_code),
          projectStatus: toStringOrNull(project?.stage),
        });
      }
      for (const invoiceClientId of clientIdsForInvoice) {
        if (typeof invoiceClientId !== "string") continue;
        const client = supplierInvoiceEnrichment.clientsById.get(invoiceClientId) ?? null;
        clientContexts.set(invoiceClientId, {
          clientId: invoiceClientId,
          clientName: toStringOrNull(client?.company_name) ?? toStringOrNull(client?.name),
        });
      }
    }
    if (supplierInvoiceAllocationProjectContext?.projectId) {
      projectContexts.set(supplierInvoiceAllocationProjectContext.projectId, {
        projectId: supplierInvoiceAllocationProjectContext.projectId,
        projectName: supplierInvoiceAllocationProjectContext.projectName,
        projectCode: supplierInvoiceAllocationProjectContext.projectCode,
        projectStatus: supplierInvoiceAllocationProjectContext.projectStatus,
      });
    }
    if (supplierInvoiceAllocationProjectContext?.clientId) {
      clientContexts.set(supplierInvoiceAllocationProjectContext.clientId, {
        clientId: supplierInvoiceAllocationProjectContext.clientId,
        clientName: supplierInvoiceAllocationProjectContext.clientName,
      });
    }
    if (projectActualCostEventSupplierContext?.supplierId) {
      supplierContexts.set(projectActualCostEventSupplierContext.supplierId, projectActualCostEventSupplierContext);
    }
    if (projectActualCostEventProjectContext?.projectId) {
      projectContexts.set(projectActualCostEventProjectContext.projectId, {
        projectId: projectActualCostEventProjectContext.projectId,
        projectName: projectActualCostEventProjectContext.projectName,
        projectCode: projectActualCostEventProjectContext.projectCode,
        projectStatus: projectActualCostEventProjectContext.projectStatus,
      });
    }
    if (projectActualCostEventProjectContext?.clientId) {
      clientContexts.set(projectActualCostEventProjectContext.clientId, {
        clientId: projectActualCostEventProjectContext.clientId,
        clientName: projectActualCostEventProjectContext.clientName,
      });
    }
    if (pricingWorkbookSheetClientContext?.clientId) {
      clientContexts.set(pricingWorkbookSheetClientContext.clientId, {
        clientId: pricingWorkbookSheetClientContext.clientId,
        clientName: pricingWorkbookSheetClientContext.clientName,
        clientCompanyName: pricingWorkbookSheetClientContext.clientCompanyName,
        clientStatus: pricingWorkbookSheetClientContext.clientStatus,
      });
    }
    if (takeoffMeasurementProjectContext?.clientId) {
      clientContexts.set(takeoffMeasurementProjectContext.clientId, {
        clientId: takeoffMeasurementProjectContext.clientId,
        clientName: takeoffMeasurementProjectContext.clientName,
      });
    }
    if (timeSheetProjectContext?.clientId) {
      clientContexts.set(timeSheetProjectContext.clientId, {
        clientId: timeSheetProjectContext.clientId,
        clientName: timeSheetProjectContext.clientName,
      });
    }
    if (taskProjectContext?.clientId) {
      clientContexts.set(taskProjectContext.clientId, {
        clientId: taskProjectContext.clientId,
        clientName: taskProjectContext.clientName,
        clientStatus: taskProjectContext.clientStatus,
      });
    }

    const derivedStatus =
      input.containerType === "project_time_sheet_entry"
        ? {
            close_status:
              toIsoOrNull(row.clock_out_at)
                ? row.auto_clocked_out === true
                  ? "closed"
                  : "clocked_out"
                : "open",
            auto_clocked_out: row.auto_clocked_out === true,
          }
        : null;
    const status: UniversalLearningBusinessRecord["status"] = supplierBillV2Sections
      ? {
        canonicalStatus: toStringOrNull(row.status) ?? "",
        workflowState: supplierBillV2Sections.workflowState,
        approvalState: supplierBillV2Sections.approvalState,
      }
      : paymentClaimV2Sections
        ? {
          canonicalStatus: toStringOrNull(row.status) ?? "",
          workflowState: paymentClaimV2Sections.workflowState,
          approvalState: paymentClaimV2Sections.approvalState,
        }
      : {};
    if (!supplierBillV2Sections && !paymentClaimV2Sections) {
      for (const column of config.statusColumns) {
        const statusValue = row[column] !== undefined ? row[column] : derivedStatus?.[column];
        if (statusValue !== undefined) {
          status[column] = statusValue as UniversalLearningBusinessRecord["status"][string];
          const mixKey = `${column}:${String(statusValue)}`;
          statusMix.set(mixKey, (statusMix.get(mixKey) ?? 0) + 1);
        }
      }
    } else {
      for (const [column, statusValue] of Object.entries(status)) {
        const mixKey = `${column}:${String(statusValue)}`;
        statusMix.set(mixKey, (statusMix.get(mixKey) ?? 0) + 1);
      }
    }
    if (derivedStatus?.close_status) {
      status.close_status = derivedStatus.close_status;
      const mixKey = `close_status:${String(derivedStatus.close_status)}`;
      statusMix.set(mixKey, (statusMix.get(mixKey) ?? 0) + 1);
    }

    const strongestStatusMatch = Object.values(status).some((value) =>
      definition.strongEvidenceStatuses.some((statusValue) => String(value) === statusValue),
    );

    const businessRecord: UniversalLearningBusinessRecord = {
      containerType: input.containerType,
      source: {
        table: config.ownerTable,
        sourceId: ownerId,
        sourceVersion:
          config.versionColumn && typeof row[config.versionColumn] === "number"
            ? (row[config.versionColumn] as number)
            : 1,
      },
      organizationId: input.context.organizationId,
      projectId,
      opportunityId,
      supplierId,
      ...(supplierBillV2Sections
        ? { supplier: { ...supplierBillV2Sections.payload.sourceEvidence.supplier } }
        : {}),
      clientId,
      actorUserId,
      updatedAt:
        input.containerType === "supplier_invoice"
        || input.containerType === "project_claim"
          ? recordCursor.updatedAt!
          : recordCursor.updatedAt ?? new Date().toISOString(),
      status,
      payload: (
        projectPurchaseOrderEnrichment
        || projectVariationEnrichment
        || projectClaimEnrichment
        || pricingWorkbookSheetEnrichment
        || takeoffMeasurementEnrichment
        || projectTimeSheetEntryEnrichment
        || taskEnrichment
        || supplierInvoiceEnrichment
        || supplierInvoiceAllocationEnrichment
        || projectActualCostEventEnrichment
        || organizationMaterialEnrichment
        || materialImportBatchEnrichment
          ? enrichedPayload
          : {
              row,
              ...childPayload,
            }
      ) as UniversalLearningBusinessRecord["payload"],
      linkedContext: supplierBillV2Sections?.linkedContext
        ?? paymentClaimV2Sections?.linkedContext
        ?? {
          sourceTable: config.ownerTable,
          sourceModule: definition.module,
          sourceWorkflow: definition.workflow,
          sourceIds: {
            projectId,
            opportunityId,
            supplierId,
            clientId,
          },
        },
      routingContext: enrichedRoutingContext as UniversalLearningBusinessRecord["routingContext"],
      signalStrength: signalStrengthOverride ?? clampRecordStrength(strongestStatusMatch),
    };
    if (supplierBillV2Sections) {
      try {
        assertValidSupplierBillUclBusinessRecord(businessRecord);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Supplier Bill UCL validation error.";
        throw new Error(`Supplier Bill UCL validation failed for ${ownerId}: ${message}`);
      }
    }
    if (paymentClaimV2Sections) {
      try {
        assertValidPaymentClaimUclBusinessRecord(businessRecord);
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Unknown Payment Claim UCL validation error.";
        throw new Error(`Payment Claim UCL validation failed for ${ownerId}: ${message}`);
      }
    }
    records.push(businessRecord);
  }

  return {
    records,
    nextCursorCandidate,
    reviewScopeContext: {
      module: definition.module,
      workflow: definition.workflow,
      recordCount: records.length,
      projectCount: projectIds.size,
      supplierCount: supplierIds.size,
      clientCount: clientIds.size,
      statusMix: Object.fromEntries(statusMix),
      projects: projectContexts.size > 0 ? Array.from(projectContexts.values()) : Array.from(projectIds).map((id) => ({ id })),
      suppliers: supplierContexts.size > 0 ? Array.from(supplierContexts.values()) : Array.from(supplierIds).map((id) => ({ id })),
      clients: clientContexts.size > 0 ? Array.from(clientContexts.values()) : Array.from(clientIds).map((id) => ({ id })),
    },
  };
}
