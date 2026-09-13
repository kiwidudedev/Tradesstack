import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SupabaseCommercialLineageDataSource, type CommercialLineageSupabaseClient } from "@/lib/commercial-lineage/supabase-data-source";
import { getCommercialLineageFromDataSource } from "@/lib/commercial-lineage/traversal";
import type { GetCommercialLineageInput } from "@/lib/commercial-lineage/types";

/**
 * Deterministic, read-only lineage traversal. Root and every returned node are
 * filtered through the caller's existing table RLS before service-role graph
 * reads are exposed.
 */
export async function getCommercialLineage(input: GetCommercialLineageInput) {
  const [authorized, admin] = await Promise.all([
    createServerSupabaseClient(),
    Promise.resolve(createAdminSupabaseClient()),
  ]);
  const dataSource = new SupabaseCommercialLineageDataSource(
    admin as unknown as CommercialLineageSupabaseClient,
    authorized as unknown as CommercialLineageSupabaseClient,
  );
  return getCommercialLineageFromDataSource(dataSource, input);
}

