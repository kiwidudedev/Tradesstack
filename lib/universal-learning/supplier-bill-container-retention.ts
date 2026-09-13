import "server-only";

import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";

export const SUPPLIER_BILL_UCL_RETENTION_POLICY = Object.freeze({
  retainAllDays: 90,
  minimumLatestVersions: 25,
});

export type SupplierBillRetentionVersion = {
  id: string;
  createdAt: string;
  milestoneCodes: string[];
  retentionHold: boolean;
};

export function selectSupplierBillUclRetentionCandidates(input: {
  versions: SupplierBillRetentionVersion[];
  currentVersionId: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const cutoff = now.getTime() - SUPPLIER_BILL_UCL_RETENTION_POLICY.retainAllDays * 86_400_000;
  return [...input.versions]
    .sort((left, right) => {
      const time = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      return time !== 0 ? time : right.id.localeCompare(left.id);
    })
    .filter((version, index) => (
      version.id !== input.currentVersionId
      && index >= SUPPLIER_BILL_UCL_RETENTION_POLICY.minimumLatestVersions
      && Date.parse(version.createdAt) < cutoff
      && !version.retentionHold
      && version.milestoneCodes.length === 0
    ))
    .map((version) => version.id);
}

export async function previewSupplierBillUclRetention(input: {
  organizationId?: string | null;
  sourceId?: string | null;
  asOf?: string;
} = {}) {
  const admin = createDynamicAdminSupabaseClient();
  const { data, error } = await admin.rpc("preview_supplier_bill_ucl_container_retention", {
    p_organization_id: input.organizationId ?? null,
    p_source_id: input.sourceId ?? null,
    p_as_of: input.asOf ?? new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}
