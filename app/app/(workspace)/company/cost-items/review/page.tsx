import { Fragment } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { ibmPlexSans } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { WORK_TYPE_KEYWORDS } from "@/lib/cost-items/classification/workTypeKeywords.enriched";
import { ReviewEditorForm, type ReviewWorkTypeOption } from "./ReviewEditorForm";

type JsonObject = Record<string, unknown>;

type CostItemReviewRow = {
  id: string;
  organization_id: string;
  project_id: string;
  source_document_kind: string;
  title: string;
  description: string;
  status: string;
  is_current: boolean;
  work_type: string | null;
  cost_type: string | null;
  cost_code: string | null;
  classification_confidence: number | null;
  needs_review: boolean;
  classification_source: string | null;
  original_classification?: JsonObject | null;
  final_classification?: JsonObject | null;
};

type ProjectRow = {
  id: string;
  name: string;
};

const PAGE_PATH = "/app/company/cost-items/review";

const COST_TYPE_OPTIONS = ["LAB", "MAT", "LAB_MAT", "SUB", "PLN", "FRT", "WST", "DES", "CMS"] as const;
type CostTypeOption = (typeof COST_TYPE_OPTIONS)[number];
const VALID_COST_TYPES = new Set<string>(COST_TYPE_OPTIONS);
const WORK_TYPE_OPTIONS: ReviewWorkTypeOption[] = WORK_TYPE_KEYWORDS.map((entry) => ({
  workType: entry.workType,
  codePrefix: entry.codePrefix ?? null,
}));
const WORK_TYPE_CODE_PREFIX_BY_NAME = new Map(WORK_TYPE_OPTIONS.map((option) => [option.workType, option.codePrefix]));

type CostItemsSelectQuery = {
  eq: (column: string, value: string | boolean) => CostItemsSelectQuery;
  neq: (column: string, value: string) => CostItemsSelectQuery;
  order: (column: string, options?: { ascending?: boolean }) => {
    limit: (value: number) => Promise<{
      data: CostItemReviewRow[] | null;
      error: { message: string } | null;
    }>;
  };
  maybeSingle: () => Promise<{
    data: CostItemReviewRow | null;
    error: { message: string } | null;
  }>;
};

type CostItemsTable = {
  select: (columns: string) => CostItemsSelectQuery;
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
  };
};

type ProjectsTable = {
  select: (columns: string) => {
    in: (column: string, values: string[]) => Promise<{
      data: ProjectRow[] | null;
      error: { message: string } | null;
    }>;
  };
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getReviewDescription(row: Pick<CostItemReviewRow, "description" | "title">): string {
  const description = row.description.trim();
  if (description.length > 0) {
    return description;
  }

  const title = row.title.trim();
  return title.length > 0 ? title : "Untitled cost item";
}

function formatDocumentKind(value: string): string {
  switch (value) {
    case "opportunity_quote":
      return "Opportunity quote";
    case "project_quote":
      return "Project quote";
    case "project_variation":
      return "Variation";
    case "project_purchase_order":
      return "Purchase order";
    case "project_claim":
      return "Claim";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatConfidence(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return `${Math.round(value * 100)}%`;
}

function buildCostCode(codePrefix: string | null, costType: string): string | null {
  if (!codePrefix || !costType) {
    return null;
  }

  return `${codePrefix}.${costType}`;
}

function buildConfirmedClassification(
  row: CostItemReviewRow,
  confirmedByUserId: string,
  confirmedAt: string,
  overrides?: {
    workType?: string | null;
    costType?: string | null;
    costCode?: string | null;
  }
): JsonObject {
  const existingFinal = isObject(row.final_classification) ? row.final_classification : null;
  const existingOriginal = isObject(row.original_classification) ? row.original_classification : null;
  const workType = overrides?.workType ?? row.work_type;
  const costType = overrides?.costType ?? row.cost_type;
  const costCode = overrides?.costCode ?? row.cost_code;

  return {
    ...(existingFinal ?? {}),
    method: "user_confirmed",
    confirmedFromSource: row.classification_source ?? (existingOriginal?.method as string | undefined) ?? "rules",
    workType,
    costType,
    costCode,
    confidence: row.classification_confidence,
    needsReview: false,
    confirmedByUserId,
    confirmedAt,
  };
}

async function fetchReviewRows(organizationId: string): Promise<CostItemReviewRow[]> {
  const supabase = await createServerSupabaseClient();
  const table = supabase.from("cost_items") as unknown as CostItemsTable;
  const { data, error } = await table
    .select(
      [
        "id",
        "project_id",
        "source_document_kind",
        "title",
        "description",
        "work_type",
        "cost_type",
        "cost_code",
        "classification_confidence",
      ].join(", ")
    )
    .eq("organization_id", organizationId)
    .eq("is_current", true)
    .eq("needs_review", true)
    .neq("status", "deleted")
    .neq("status", "superseded")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function fetchProjectNames(projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const supabase = await createServerSupabaseClient();
  const projectsTable = supabase.from("organization_projects") as unknown as ProjectsTable;
  const { data, error } = await projectsTable.select("id, name").in("id", projectIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((project: ProjectRow) => [project.id, project.name]));
}

type CostItemsReviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CostItemsReviewPage({ searchParams }: CostItemsReviewPageProps) {
  const member = await getCurrentOrganizationMember();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const editRaw = resolvedSearchParams.edit;
  const editCostItemId = typeof editRaw === "string" ? editRaw : Array.isArray(editRaw) ? editRaw[0] ?? null : null;

  async function confirmCostItem(formData: FormData) {
    "use server";

    const currentMember = await getCurrentOrganizationMember();
    if (!currentMember) {
      redirect(PAGE_PATH);
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(PAGE_PATH);
    }

    const costItemId = String(formData.get("costItemId") ?? "").trim();
    if (!costItemId) {
      redirect(PAGE_PATH);
    }

    const admin = createAdminSupabaseClient();
    const costItemsTable = admin.from("cost_items") as unknown as CostItemsTable;
    const { data: row, error: rowError } = await costItemsTable
      .select(
        [
          "id",
          "organization_id",
          "project_id",
          "source_document_kind",
          "title",
          "description",
          "status",
          "is_current",
          "work_type",
          "cost_type",
          "cost_code",
          "classification_confidence",
          "needs_review",
          "classification_source",
          "original_classification",
          "final_classification",
        ].join(", ")
      )
      .eq("id", costItemId)
      .eq("organization_id", currentMember.organization_id)
      .maybeSingle();

    if (rowError || !row) {
      redirect(PAGE_PATH);
    }

    if (!row.is_current || row.status === "deleted" || row.status === "superseded") {
      redirect(PAGE_PATH);
    }

    const confirmedAt = new Date().toISOString();
    const finalClassification = buildConfirmedClassification(row, user.id, confirmedAt);

    const { error: updateError } = await costItemsTable
      .update({
        classification_source: "user_confirmed",
        needs_review: false,
        final_classification: finalClassification,
        confirmed_by_user_id: user.id,
        confirmed_at: confirmedAt,
      })
      .eq("id", costItemId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath(PAGE_PATH);
    redirect(PAGE_PATH);
  }

  async function saveReviewedCostItem(formData: FormData) {
    "use server";

    const currentMember = await getCurrentOrganizationMember();
    if (!currentMember) {
      redirect(PAGE_PATH);
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(PAGE_PATH);
    }

    const costItemId = String(formData.get("costItemId") ?? "").trim();
    const workType = String(formData.get("workType") ?? "").trim();
    const costType = String(formData.get("costType") ?? "").trim();
    const submittedCostCode = String(formData.get("costCode") ?? "").trim();

    if (!costItemId) {
      redirect(PAGE_PATH);
    }

    if (!WORK_TYPE_CODE_PREFIX_BY_NAME.has(workType) || !VALID_COST_TYPES.has(costType)) {
      redirect(`${PAGE_PATH}?edit=${costItemId}`);
    }

    const codePrefix = WORK_TYPE_CODE_PREFIX_BY_NAME.get(workType) ?? null;
    const costCode = buildCostCode(codePrefix, costType) ?? (submittedCostCode || null);

    const admin = createAdminSupabaseClient();
    const costItemsTable = admin.from("cost_items") as unknown as CostItemsTable;
    const { data: row, error: rowError } = await costItemsTable
      .select(
        [
          "id",
          "organization_id",
          "project_id",
          "source_document_kind",
          "title",
          "description",
          "status",
          "is_current",
          "work_type",
          "cost_type",
          "cost_code",
          "classification_confidence",
          "needs_review",
          "classification_source",
          "original_classification",
          "final_classification",
        ].join(", ")
      )
      .eq("id", costItemId)
      .eq("organization_id", currentMember.organization_id)
      .maybeSingle();

    if (rowError || !row) {
      redirect(PAGE_PATH);
    }

    if (!row.is_current || row.status === "deleted" || row.status === "superseded") {
      redirect(PAGE_PATH);
    }

    const confirmedAt = new Date().toISOString();
    const finalClassification = buildConfirmedClassification(row, user.id, confirmedAt, {
      workType: workType || null,
      costType: costType || null,
      costCode,
    });

    const { error: updateError } = await costItemsTable
      .update({
        work_type: workType || null,
        cost_type: costType || null,
        cost_code: costCode,
        classification_source: "user_confirmed",
        needs_review: false,
        final_classification: finalClassification,
        confirmed_by_user_id: user.id,
        confirmed_at: confirmedAt,
      })
      .eq("id", costItemId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath(PAGE_PATH);
    redirect(PAGE_PATH);
  }

  if (!member) {
    return (
      <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
        <OperationalPanel>
          <p className="text-sm text-[var(--text-secondary)]">Sign in to review cost item classifications.</p>
        </OperationalPanel>
      </main>
    );
  }

  const reviewRows = await fetchReviewRows(member.organization_id);
  const projectNameById = await fetchProjectNames([...new Set(reviewRows.map((row) => row.project_id).filter(Boolean))]);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
      <OperationalModuleHeader
        title="Cost Item Review"
        description="Review low-confidence cost item classifications before they become part of your org’s confirmed intelligence."
        actions={
          <StatusBadge status="draft">{reviewRows.length} needing review</StatusBadge>
        }
      />

      <OperationalPanel contentClassName="p-0">
          {reviewRows.length === 0 ? (
            <div className="px-6 pb-6 pt-6">
              <OperationalEmptyState title="No cost items need review right now." />
            </div>
          ) : (
            <OperationalTable className="min-w-[1280px]">
                <OperationalTableHeader>
                  <OperationalTableRow>
                    {[
                      "Description",
                      "Project",
                      "Source",
                      "Work Type",
                      "Cost Type",
                      "Cost Code",
                      "Confidence",
                      "Action",
                    ].map((heading) => (
                      <OperationalTableHead key={heading}>{heading}</OperationalTableHead>
                    ))}
                  </OperationalTableRow>
                </OperationalTableHeader>
                <OperationalTableBody>
                  {reviewRows.map((row) => {
                    const description = getReviewDescription(row);
                    const projectName = projectNameById.get(row.project_id) ?? "Unknown project";
                    const isEditing = editCostItemId === row.id;
                    const confidence = row.classification_confidence;
                    const confidenceTone =
                      typeof confidence === "number" && confidence >= 0.75
                        ? "approved"
                        : typeof confidence === "number" && confidence >= 0.5
                          ? "pending"
                          : "overdue";

                    return (
                      <Fragment key={row.id}>
                        <OperationalTableRow>
                          <OperationalTableCell>
                            <div className="max-w-[320px] font-semibold">{description}</div>
                          </OperationalTableCell>
                          <OperationalTableCell>{projectName}</OperationalTableCell>
                          <OperationalTableCell>
                            <StatusBadge status="draft">{formatDocumentKind(row.source_document_kind)}</StatusBadge>
                          </OperationalTableCell>
                          <OperationalTableCell>{row.work_type ?? "—"}</OperationalTableCell>
                          <OperationalTableCell>{row.cost_type ?? "—"}</OperationalTableCell>
                          <OperationalTableCell>{row.cost_code ?? "—"}</OperationalTableCell>
                          <OperationalTableCell>
                            <StatusBadge status={confidenceTone}>{formatConfidence(confidence)}</StatusBadge>
                          </OperationalTableCell>
                          <OperationalTableCell>
                            <div className="flex items-center gap-2">
                              <form action={confirmCostItem}>
                                <input type="hidden" name="costItemId" value={row.id} />
                                <Button type="submit" variant="secondary" size="sm">
                                  Confirm
                                </Button>
                              </form>
                              <Button asChild variant={isEditing ? "primary" : "secondary"} size="sm">
                                <Link href={isEditing ? PAGE_PATH : `${PAGE_PATH}?edit=${row.id}`}>
                                  {isEditing ? "Close" : "Review"}
                                </Link>
                              </Button>
                            </div>
                          </OperationalTableCell>
                        </OperationalTableRow>
                        {isEditing ? (
                          <OperationalTableRow className="bg-[var(--surface-muted)]">
                            <OperationalTableCell colSpan={8} className="py-5">
                              <ReviewEditorForm
                                action={saveReviewedCostItem}
                                cancelHref={PAGE_PATH}
                                costItemId={row.id}
                                initialWorkType={row.work_type ?? WORK_TYPE_OPTIONS[0]?.workType ?? ""}
                                initialCostType={(row.cost_type as CostTypeOption | null) ?? COST_TYPE_OPTIONS[0]}
                                initialCostCode={row.cost_code ?? ""}
                                workTypeOptions={WORK_TYPE_OPTIONS}
                                costTypeOptions={[...COST_TYPE_OPTIONS]}
                              />
                            </OperationalTableCell>
                          </OperationalTableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </OperationalTableBody>
              </OperationalTable>
          )}
      </OperationalPanel>

      {reviewRows.length > 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          `Confirm` accepts the current suggestion as-is. `Review` opens an inline editor so the suggested work type, cost type, and cost code can be amended before confirming.
        </p>
      ) : null}
    </main>
  );
}
