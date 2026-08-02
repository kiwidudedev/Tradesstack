import pg from "pg";

const enabled = process.env.RETENTION_GST_INHERITANCE_SHADOW_ENABLED === "true";
if (!enabled) {
  throw new Error(
    "Shadow comparison is disabled. Set RETENTION_GST_INHERITANCE_SHADOW_ENABLED=true explicitly.",
  );
}

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`Missing required --${name}.`);
  return value;
}

function uuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return value;
}

function halfUpTax(amountMinor: number, basisPoints: number) {
  const numerator = BigInt(amountMinor) * BigInt(basisPoints);
  const absolute = numerator < BigInt(0) ? -numerator : numerator;
  const rounded = (absolute + BigInt(5_000)) / BigInt(10_000);
  return Number(numerator < BigInt(0) ? -rounded : rounded);
}

const organizationId = uuid(argument("organization-id"), "organization-id");
const projectId = uuid(argument("project-id"), "project-id");
const retentionClaimId = uuid(argument("claim-id"), "claim-id");
const databaseUrl = process.env.RETENTION_GST_SHADOW_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("Missing RETENTION_GST_SHADOW_DATABASE_URL.");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("begin read only");
  const sourceResult = await client.query<{
    v1: Record<string, unknown>;
    v2: Record<string, unknown>;
  }>(
    `select private.master_retention_claim_source($1) v1,
            private.master_retention_claim_source_v2($1) v2
     where exists (
       select 1 from public.retention_claims claim
       where claim.id = $1
         and claim.organization_id = $2
         and claim.project_id = $3
     )`,
    [retentionClaimId, organizationId, projectId],
  );
  if (sourceResult.rowCount !== 1) throw new Error("Scoped Retention Claim was not found.");

  const { v1, v2 } = sourceResult.rows[0];
  const v2Allocations = Array.isArray(v2.allocations)
    ? v2.allocations as Array<Record<string, unknown>>
    : [];
  const connectionId = v2Allocations.find((row) => row.xeroConnectionId)?.xeroConnectionId;
  const tenantId = v2Allocations.find((row) => row.tenantId)?.tenantId;
  const rates = connectionId && tenantId
    ? await client.query<{
        tax_type: string;
        effective_rate: string;
      }>(
        `select tax_type, effective_rate::text
         from public.organization_accounting_tax_rates
         where organization_id = $1
           and provider = 'xero'
           and accounting_connection_id = $2
           and tenant_id = $3
           and is_active
           and status = 'ACTIVE'
           and effective_rate >= 0
           and nullif(trim(tax_type), '') is not null
           and metadata->>'canApplyToRevenue' = 'true'`,
        [organizationId, connectionId, tenantId],
      )
    : { rows: [] };
  const v1Global = rates.rows[0] ?? null;
  const v1BasisPoints = v1Global
    ? Math.round(Number(v1Global.effective_rate) * 100)
    : null;

  const comparisons = v2Allocations.map((allocation) => {
    const amountMinor = Math.round(Number(allocation.allocationAmount ?? 0) * 100);
    const v1TaxMinor = v1BasisPoints == null
      ? null
      : halfUpTax(amountMinor, v1BasisPoints);
    const v2AmountMinor = allocation.originAmountMinor == null
      ? null
      : Math.abs(Number(allocation.originAmountMinor));
    const v2TaxMinor = allocation.originTaxMinor == null
      ? null
      : Math.abs(Number(allocation.originTaxMinor));
    return {
      originatingPaymentClaimId: allocation.originatingPaymentClaimId,
      status: allocation.status,
      blockerCode: allocation.blockerCode ?? null,
      evidenceKind: allocation.evidenceKind ?? null,
      replacementLineage: Boolean(allocation.originPredecessorRevisionId),
      v1TaxType: v1Global?.tax_type ?? null,
      v1RateBasisPoints: v1BasisPoints,
      v2TaxType: allocation.taxType ?? null,
      v2RateBasisPoints: allocation.effectiveRateBasisPoints ?? null,
      amountDifferenceMinor: v2AmountMinor == null ? null : v2AmountMinor - amountMinor,
      gstDifferenceMinor: v1TaxMinor == null || v2TaxMinor == null
        ? null
        : v2TaxMinor - v1TaxMinor,
      totalDifferenceMinor: v1TaxMinor == null || v2TaxMinor == null || v2AmountMinor == null
        ? null
        : (v2AmountMinor + v2TaxMinor) - (amountMinor + v1TaxMinor),
    };
  });
  const resolvedTaxTypes = new Set(
    comparisons
      .filter((row) => row.status === "resolved" && row.v2TaxType)
      .map((row) => row.v2TaxType),
  );

  console.log(JSON.stringify({
    readOnly: true,
    scope: { organizationId, projectId, retentionClaimId },
    originCount: comparisons.length,
    v1GlobalTax: v1Global
      ? { taxType: v1Global.tax_type, rateBasisPoints: v1BasisPoints }
      : null,
    eligibleV1TaxCandidates: rates.rows.map((row) => ({
      taxType: row.tax_type,
      rateBasisPoints: Math.round(Number(row.effective_rate) * 100),
    })),
    mixedTax: resolvedTaxTypes.size > 1,
    legacy: comparisons.some((row) =>
      row.evidenceKind === "exact_legacy_adoption"
      || row.evidenceKind === "submission_snapshot"
      || row.evidenceKind === "reviewed_classification"),
    ambiguousOrMissingEvidence: comparisons.filter((row) => row.status === "blocked").length,
    comparisons,
    v1SourceSchemaVersion: v1.schemaVersion,
    v2SourceSchemaVersion: v2.schemaVersion,
  }, null, 2));
  await client.query("rollback");
} finally {
  await client.end();
}
