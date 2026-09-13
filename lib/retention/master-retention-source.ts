import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type MasterRetentionOrigin = {
  id: string;
  originatingPaymentClaimId: string;
  originClaimNumberSnapshot: string;
  originClaimDateSnapshot: string | null;
  allocationAmount: number;
};

export type MasterRetentionSource = {
  claim: {
    id: string;
    claimNumber: string;
    subtotalExclTax: number;
    submissionStateHash: string;
    submittedAt: string;
  };
  allocations: MasterRetentionOrigin[];
};

export type MasterRetentionAccountingPosition = {
  revisionId: string | null;
  externalInvoiceId: string | null;
  externalInvoiceNumber: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxType: string | null;
  effectiveRate: number | null;
  authoritativeInheritedTax: boolean;
  pushedByOrigin: Map<string, number>;
  pushedTaxByOrigin: Map<string, number>;
  pushedTotalByOrigin: Map<string, number>;
};

type RpcResult = {
  succeeded?: boolean;
  source?: MasterRetentionSource;
};

export async function getMasterRetentionSource(
  retentionClaimId: string,
): Promise<MasterRetentionSource | null> {
  const admin = createAdminSupabaseClient();
  const result = await (admin.rpc as unknown as (
    name: string,
    input: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<{ data: any; error: { message: string } | null }>)(
    "get_retention_claim_xero_source_phase2c",
    { p_retention_claim_id: retentionClaimId },
  );
  if (result.error) throw new Error(result.error.message);
  const payload = result.data as RpcResult | null;
  return payload?.succeeded === true && payload.source
    ? payload.source
    : null;
}

export async function getMasterRetentionAccountingPosition(
  retentionClaimId: string,
): Promise<MasterRetentionAccountingPosition> {
  const admin = createAdminSupabaseClient() as unknown as {
    // Accounting tables intentionally precede generated types in this branch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => any;
  };
  const document = await admin
    .from("organization_accounting_documents")
    .select(
      "active_accounting_revision_id,external_document_id,"
      + "external_document_number",
    )
    .eq("retention_claim_id", retentionClaimId)
    .eq("local_document_type", "retention_claim")
    .maybeSingle();
  if (document.error) throw new Error(document.error.message);
  if (!document.data?.active_accounting_revision_id) {
    return {
      revisionId: null,
      externalInvoiceId: null,
      externalInvoiceNumber: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      taxType: null,
      effectiveRate: null,
      authoritativeInheritedTax: false,
      pushedByOrigin: new Map<string, number>(),
      pushedTaxByOrigin: new Map<string, number>(),
      pushedTotalByOrigin: new Map<string, number>(),
    };
  }
  const [revision, lines] = await Promise.all([
    admin.from("organization_accounting_document_revisions")
      .select("subtotal_minor,tax_minor,total_minor,tax_snapshot")
      .eq("id", document.data.active_accounting_revision_id)
      .single(),
    admin.from("organization_accounting_revision_lines")
      .select(
        "originating_payment_claim_id,line_amount_minor,tax_minor,total_minor",
      )
      .eq(
        "accounting_revision_id",
        document.data.active_accounting_revision_id,
      ),
  ]);
  if (revision.error) throw new Error(revision.error.message);
  if (lines.error) throw new Error(lines.error.message);
  const taxSnapshot = revision.data.tax_snapshot
    && typeof revision.data.tax_snapshot === "object"
    && !Array.isArray(revision.data.tax_snapshot)
    ? revision.data.tax_snapshot as Record<string, unknown>
    : {};
  const taxType = typeof taxSnapshot.taxType === "string"
    && taxSnapshot.taxType.trim()
    ? taxSnapshot.taxType.trim()
    : null;
  const effectiveRate = Number(taxSnapshot.effectiveRate);
  const authoritativeInheritedTax =
    taxSnapshot.inheritanceContract === "direct_immutable_retention_v1";
  return {
    revisionId: document.data.active_accounting_revision_id,
    externalInvoiceId: document.data.external_document_id,
    externalInvoiceNumber: document.data.external_document_number,
    subtotalMinor: Number(revision.data.subtotal_minor),
    taxMinor: Number(revision.data.tax_minor),
    totalMinor: Number(revision.data.total_minor),
    taxType,
    effectiveRate: Number.isFinite(effectiveRate) ? effectiveRate : null,
    authoritativeInheritedTax,
    pushedByOrigin: new Map(
      lines.data.map((line: Record<string, unknown>) => [
        String(line.originating_payment_claim_id),
        Number(line.line_amount_minor),
      ]),
    ) as Map<string, number>,
    pushedTaxByOrigin: new Map(
      lines.data.map((line: Record<string, unknown>) => [
        String(line.originating_payment_claim_id),
        Number(line.tax_minor),
      ]),
    ) as Map<string, number>,
    pushedTotalByOrigin: new Map(
      lines.data.map((line: Record<string, unknown>) => [
        String(line.originating_payment_claim_id),
        Number(line.total_minor),
      ]),
    ) as Map<string, number>,
  };
}
