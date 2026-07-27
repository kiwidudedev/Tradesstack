import { createHash } from "node:crypto";
import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";
import type { UniversalLearningBusinessRecord } from "@/lib/universal-learning/types";

function hashRecord(record: UniversalLearningBusinessRecord) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

export async function writeUniversalLearningRunRecords(input: {
  reviewRunId: string;
  records: UniversalLearningBusinessRecord[];
}) {
  if (input.records.length === 0) {
    return;
  }
  const admin = createDynamicAdminSupabaseClient();
  const payload = input.records.map((record) => ({
    review_run_id: input.reviewRunId,
    organization_id: record.organizationId,
    container_type: record.containerType,
    source_table: record.source.table,
    source_id: record.source.sourceId,
    source_updated_at: record.updatedAt,
    source_project_id: record.projectId,
    source_opportunity_id: record.opportunityId,
    source_supplier_id: record.supplierId,
    record_hash: hashRecord(record),
    record_strength: record.signalStrength,
  }));

  const { error } = await admin
    .from("learning_review_run_records")
    .upsert(payload, {
      onConflict: "review_run_id,source_table,source_id",
      ignoreDuplicates: true,
    });
  if (error) {
    throw new Error(error.message);
  }
}
