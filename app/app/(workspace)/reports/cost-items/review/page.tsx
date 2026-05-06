import { Fragment } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { WORK_TYPE_KEYWORDS } from "@/lib/cost-items/classification/workTypeKeywords.enriched";
import { ReviewEditorForm, type ReviewWorkTypeOption } from "./ReviewEditorForm";

type JsonObject = Record<string, unknown>;

type CostItemStatus = "active" | "superseded" | "deleted" | "snapshot";
type CostItemSource = "rules" | "user_confirmed" | "ai" | "imported" | null;

type CostItemReviewRow = {
  id: string;
  project_id: string;
  source_document_kind: string;
  title: string;
  description: string;
  work_type: string | null;
  cost_type: string | null;
  cost_code: string | null;
  classification_confidence: number | null;
};

type ProjectRow = {
  id: string;
  name: string;
};

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
  order: (column: string, options?: { ascending?: boolean }) => Promise<{
    data: CostItemReviewRow[] | null;
    error: { message: string } | null;
  }>;
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
      redirect("/app/reports/cost-items/review");
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/app/reports/cost-items/review");
    }

    const costItemId = String(formData.get("costItemId") ?? "").trim();
    if (!costItemId) {
      redirect("/app/reports/cost-items/review");
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
      redirect("/app/reports/cost-items/review");
    }

    if (!row.is_current || row.status === "deleted" || row.status === "superseded") {
      redirect("/app/reports/cost-items/review");
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

    revalidatePath("/app/reports/cost-items/review");
    redirect("/app/reports/cost-items/review");
  }

  async function saveReviewedCostItem(formData: FormData) {
    "use server";

    const currentMember = await getCurrentOrganizationMember();
    if (!currentMember) {
      redirect("/app/reports/cost-items/review");
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/app/reports/cost-items/review");
    }

    const costItemId = String(formData.get("costItemId") ?? "").trim();
    const workType = String(formData.get("workType") ?? "").trim();
    const costType = String(formData.get("costType") ?? "").trim();
    const submittedCostCode = String(formData.get("costCode") ?? "").trim();

    if (!costItemId) {
      redirect("/app/reports/cost-items/review");
    }

    if (!WORK_TYPE_CODE_PREFIX_BY_NAME.has(workType) || !VALID_COST_TYPES.has(costType)) {
      redirect(`/app/reports/cost-items/review?edit=${costItemId}`);
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
      redirect("/app/reports/cost-items/review");
    }

    if (!row.is_current || row.status === "deleted" || row.status === "superseded") {
      redirect("/app/reports/cost-items/review");
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

    revalidatePath("/app/reports/cost-items/review");
    redirect("/app/reports/cost-items/review");
  }

  if (!member) {
    return (
      <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
        <Card className="overflow-hidden rounded-[32px] border-none bg-[var(--app-surface)] shadow-none">
          <CardContent className="px-6 py-6">
            <p className={`${interMedium.className} text-[15px] text-[#6b6b6b]`}>Sign in to review cost item classifications.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const reviewRows = await fetchReviewRows(member.organization_id);
  const projectNameById = await fetchProjectNames([...new Set(reviewRows.map((row) => row.project_id).filter(Boolean))]);

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
      <section className="flex items-start justify-between gap-4 pt-[25px]">
        <div>
          <h1 className="m-0 text-[clamp(1.24rem,2.24vw,2.08rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#1d1d1d]">
            Cost Item Review
          </h1>
          <p className={`${interMedium.className} mt-[0.65rem] text-[15px] leading-[1.45] text-[#6b6b6b]`}>
            Review low-confidence cost item classifications before they become part of your org’s confirmed intelligence.
          </p>
        </div>
        <div className="inline-flex items-center rounded-[0.8rem] border border-[#E2E8F1] bg-white px-4 py-2 text-[14px] font-semibold text-[#10283B]">
          {reviewRows.length} needing review
        </div>
      </section>

      <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
        <CardContent className="p-0">
          {reviewRows.length === 0 ? (
            <div className="px-6 pb-6 pt-6">
              <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>No cost items need review right now.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F1] bg-[#F8FAFB]">
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
                      <th
                        key={heading}
                        className={`${ibmPlexSans.className} px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.map((row) => {
                    const description = getReviewDescription(row);
                    const projectName = projectNameById.get(row.project_id) ?? "Unknown project";
                    const isEditing = editCostItemId === row.id;
                    const confidence = row.classification_confidence;
                    const confidenceTone =
                      typeof confidence === "number" && confidence >= 0.75
                        ? "bg-[#DCFCE7] text-[#15803D]"
                        : typeof confidence === "number" && confidence >= 0.5
                        ? "bg-[#FEF3C7] text-[#B45309]"
                        : "bg-[#FEE2E2] text-[#B91C1C]";

                    return (
                      <Fragment key={row.id}>
                        <tr className="group border-b border-[#E2E8F1] transition-colors hover:bg-[#F8FBFB]">
                          <td className="px-6 py-4 align-top">
                            <div className="max-w-[320px]">
                              <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#10283B]`}>{description}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>{projectName}</p>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[13px] font-semibold text-[#475569]`}>
                              {formatDocumentKind(row.source_document_kind)}
                            </span>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>{row.work_type ?? "—"}</p>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>{row.cost_type ?? "—"}</p>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <p className={`${ibmPlexSans.className} text-[14px] text-[#10283B]`}>{row.cost_code ?? "—"}</p>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <span className={`${ibmPlexSans.className} inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold ${confidenceTone}`}>
                              {formatConfidence(confidence)}
                            </span>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="flex items-center gap-2">
                              <form action={confirmCostItem}>
                                <input type="hidden" name="costItemId" value={row.id} />
                                <button
                                  type="submit"
                                  className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border border-[#E2E8F1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
                                >
                                  Confirm
                                </button>
                              </form>
                              <Link
                                href={isEditing ? "/app/reports/cost-items/review" : `/app/reports/cost-items/review?edit=${row.id}`}
                                className={`${ibmPlexSans.className} inline-flex items-center rounded-[0.5rem] border px-3 py-1.5 text-[13px] font-semibold transition ${
                                  isEditing
                                    ? "border-[#F15A29] bg-[#FFF1EB] text-[#C2410C]"
                                    : "border-[#E2E8F1] bg-white text-[#475569] hover:bg-[#F8FAFC]"
                                }`}
                              >
                                {isEditing ? "Close" : "Review"}
                              </Link>
                            </div>
                          </td>
                        </tr>
                        {isEditing ? (
                          <tr className="border-b border-[#E2E8F1] bg-[#FFFDFC]">
                            <td colSpan={8} className="px-6 py-5">
                              <ReviewEditorForm
                                action={saveReviewedCostItem}
                                cancelHref="/app/reports/cost-items/review"
                                costItemId={row.id}
                                initialWorkType={row.work_type ?? WORK_TYPE_OPTIONS[0]?.workType ?? ""}
                                initialCostType={(row.cost_type as CostTypeOption | null) ?? COST_TYPE_OPTIONS[0]}
                                initialCostCode={row.cost_code ?? ""}
                                workTypeOptions={WORK_TYPE_OPTIONS}
                                costTypeOptions={[...COST_TYPE_OPTIONS]}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {reviewRows.length > 0 ? (
        <p className={`${interMedium.className} text-[13px] text-[#6b6b6b]`}>
          `Confirm` accepts the current suggestion as-is. `Review` opens an inline editor so the suggested work type, cost type, and cost code can be amended before confirming.
        </p>
      ) : null}
    </main>
  );
}
