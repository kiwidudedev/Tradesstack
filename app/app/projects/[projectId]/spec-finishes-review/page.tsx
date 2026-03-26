import { notFound } from "next/navigation";
import { SpecFinishesReviewWorkbench } from "@/components/app/SpecFinishesReviewWorkbench";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface StructuredItem {
  title: string;
  description: string;
}

interface SpecFinishesReviewResult {
  tradeLabel: string;
  projectSummary: StructuredItem[];
  keyFinishes: StructuredItem[];
  materials: StructuredItem[];
  fixtures: StructuredItem[];
  systems: StructuredItem[];
  assumptions: StructuredItem[];
  exclusions: StructuredItem[];
  risksClarificationsRequired: StructuredItem[];
}

interface StoredRun {
  id: string;
  tradeId: string;
  tradeLabel: string;
  sourceDocumentName: string;
  generatedAt: string;
  result: SpecFinishesReviewResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStructuredItemArray(value: unknown): StructuredItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: StructuredItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const description = typeof entry.description === "string" ? entry.description.trim() : "";
    if (title && description) {
      items.push({ title, description });
    }
  }

  return items;
}

function toReviewPayload(value: unknown): SpecFinishesReviewResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const result: SpecFinishesReviewResult = {
    tradeLabel: typeof value.tradeLabel === "string" ? value.tradeLabel.trim() : "",
    projectSummary: toStructuredItemArray(value.projectSummary),
    keyFinishes: toStructuredItemArray(value.keyFinishes),
    materials: toStructuredItemArray(value.materials),
    fixtures: toStructuredItemArray(value.fixtures),
    systems: toStructuredItemArray(value.systems),
    assumptions: toStructuredItemArray(value.assumptions),
    exclusions: toStructuredItemArray(value.exclusions),
    risksClarificationsRequired: toStructuredItemArray(value.risksClarificationsRequired),
  };

  const hasContent =
    result.tradeLabel.length > 0 ||
    result.projectSummary.length > 0 ||
    result.keyFinishes.length > 0 ||
    result.materials.length > 0 ||
    result.fixtures.length > 0 ||
    result.systems.length > 0 ||
    result.assumptions.length > 0 ||
    result.exclusions.length > 0 ||
    result.risksClarificationsRequired.length > 0;

  return hasContent ? result : null;
}

function isMissingTableInSchemaCacheError(error: unknown, tableName: string): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code.trim().toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details = typeof error.details === "string" ? error.details.toLowerCase() : "";
  const needle = tableName.toLowerCase();

  if (code === "PGRST205" && (message.includes(needle) || details.includes(needle))) {
    return true;
  }

  return message.includes("schema cache") && message.includes(needle);
}

export default async function ProjectSpecFinishesReviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const supabaseAny = supabase as unknown as {
    from: (table: string) => {
      select: (...args: unknown[]) => {
        eq: (column: string, value: unknown) => {
          eq: (column: string, value: unknown) => {
            eq: (column: string, value: unknown) => {
              order: (column: string, options: { ascending: boolean }) => {
                limit: (value: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
              };
            };
          };
        };
      };
    };
  };

  let initialStoredRuns: StoredRun[] = [];

  const query = supabaseAny
    .from("spec_finishes_runs")
    .select("id, trade_id, trade_label, source_document_name, result_json, created_at") as {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          eq: (column: string, value: unknown) => {
            order: (column: string, options: { ascending: boolean }) => {
              limit: (value: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
            };
          };
        };
      };
    };

  const { data: runs, error: runsError } = await query
    .eq("organization_id", project.organization_id)
    .eq("project_id", project.id)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(40);

  if (!runsError && runs) {
    initialStoredRuns = runs
      .map((run) => {
        const parsed = toReviewPayload(run.result_json);
        if (!parsed) {
          return null;
        }

        return {
          id: typeof run.id === "string" ? run.id : crypto.randomUUID(),
          tradeId: typeof run.trade_id === "string" ? run.trade_id : "",
          tradeLabel:
            typeof run.trade_label === "string" && run.trade_label.trim().length > 0
              ? run.trade_label
              : parsed.tradeLabel,
          sourceDocumentName:
            typeof run.source_document_name === "string" && run.source_document_name.trim().length > 0
              ? run.source_document_name
              : "Specification PDF",
          generatedAt: typeof run.created_at === "string" ? run.created_at : new Date().toISOString(),
          result: parsed,
        } satisfies StoredRun;
      })
      .filter((run): run is StoredRun => run !== null);
  } else if (runsError && !isMissingTableInSchemaCacheError(runsError, "spec_finishes_runs")) {
    console.error("[spec-finishes-review] failed to load stored runs", runsError);
  }

  return (
    <SpecFinishesReviewWorkbench
      projectId={project.id}
      organizationId={project.organization_id}
      initialStoredRuns={initialStoredRuns}
    />
  );
}
