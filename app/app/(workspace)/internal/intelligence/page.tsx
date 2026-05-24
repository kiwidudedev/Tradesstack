import { IntelligenceOperationsDashboard } from "./IntelligenceOperationsDashboard";
import {
  getIntelligenceOpsDashboardData,
  parseIntelligenceOpsFilters,
} from "@/lib/intelligence-ops-server";
import { requirePlatformAdmin } from "@/lib/permissions-server";

const DEFAULT_FALLBACK = "/app/dashboard";
const KNOWN_MODULES = [
  "pricing_worksheets",
  "cost_items",
  "cost_code_mappings",
  "supplier_invoices",
  "takeoff",
] as const;

export default async function InternalIntelligencePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin("viewer", DEFAULT_FALLBACK);

  const resolvedSearchParams = (await searchParams) ?? {};
  const filters = parseIntelligenceOpsFilters(resolvedSearchParams);
  let data = null;
  let errorMessage: string | null = null;

  try {
    data = await getIntelligenceOpsDashboardData(filters);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? `Unable to load intelligence observability right now. ${error.message}`
        : "Unable to load intelligence observability right now.";
  }

  const dynamicModules = data?.overview.map((row) => row.module) ?? [];
  const availableModules = Array.from(new Set([...KNOWN_MODULES, ...dynamicModules])).sort();

  return (
    <IntelligenceOperationsDashboard
      data={data}
      filters={filters}
      availableModules={availableModules}
      errorMessage={errorMessage}
    />
  );
}
