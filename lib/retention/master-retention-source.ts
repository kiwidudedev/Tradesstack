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
  pushedByOrigin: Map<string, number>;
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
      pushedByOrigin: new Map<string, number>(),
    };
  }
  const [revision, lines] = await Promise.all([
    admin.from("organization_accounting_document_revisions")
      .select("subtotal_minor,tax_minor,total_minor")
      .eq("id", document.data.active_accounting_revision_id)
      .single(),
    admin.from("organization_accounting_revision_lines")
      .select("originating_payment_claim_id,line_amount_minor")
      .eq(
        "accounting_revision_id",
        document.data.active_accounting_revision_id,
      ),
  ]);
  if (revision.error) throw new Error(revision.error.message);
  if (lines.error) throw new Error(lines.error.message);
  return {
    revisionId: document.data.active_accounting_revision_id,
    externalInvoiceId: document.data.external_document_id,
    externalInvoiceNumber: document.data.external_document_number,
    subtotalMinor: Number(revision.data.subtotal_minor),
    taxMinor: Number(revision.data.tax_minor),
    totalMinor: Number(revision.data.total_minor),
    pushedByOrigin: new Map(
      lines.data.map((line: Record<string, unknown>) => [
        String(line.originating_payment_claim_id),
        Number(line.line_amount_minor),
      ]),
    ) as Map<string, number>,
  };
}
