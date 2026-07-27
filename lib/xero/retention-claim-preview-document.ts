import "server-only";

import {
  generateRetentionClaimDocumentFromServerSource,
  type RetentionClaimDocumentGenerationResult,
  type RetentionClaimDocumentSource,
} from "@/lib/retention/phase8-retention-documents";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type RpcResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult>;
};

type Phase2cSourceResult = {
  succeeded?: boolean;
  errorCode?: string;
  organizationId?: string;
  projectId?: string;
  retentionSourceEvidenceHash?: string;
  source?: RetentionClaimDocumentSource;
};

function phase2cSource(value: unknown): Phase2cSourceResult {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(
      "get_retention_claim_xero_source_phase2c returned an invalid payload.",
    );
  }
  return value as Phase2cSourceResult;
}

export async function generateRetentionClaimPreviewDocument(params: {
  organizationId: string;
  retentionClaimId: string;
  actorUserId: string;
}): Promise<RetentionClaimDocumentGenerationResult> {
  const admin = createAdminSupabaseClient() as unknown as RpcClient;
  const response = await admin.rpc(
    "get_retention_claim_xero_source_phase2c",
    { p_retention_claim_id: params.retentionClaimId },
  );
  if (response.error) {
    const sqlState = response.error.code
      ? ` (${response.error.code})`
      : "";
    throw new Error(
      `Unable to load immutable Retention Claim preview evidence${sqlState}: ${response.error.message}`,
    );
  }
  const result = phase2cSource(response.data);
  if (result.succeeded !== true) {
    return {
      succeeded: false,
      errorCode: result.errorCode ?? "document_generation_failed",
      created: false,
      reused: false,
    };
  }
  if (
    result.organizationId !== params.organizationId
    || !result.source
    || result.source.claim.id !== params.retentionClaimId
    || result.source.claim.organizationId !== params.organizationId
    || result.source.claim.status !== "submitted"
    || typeof result.retentionSourceEvidenceHash !== "string"
  ) {
    throw new Error(
      "Immutable Retention Claim preview evidence did not match the requested Claim.",
    );
  }
  return generateRetentionClaimDocumentFromServerSource({
    retentionClaimId: params.retentionClaimId,
    actorUserId: params.actorUserId,
    sourceEvidenceHash: result.retentionSourceEvidenceHash,
    source: result.source,
  });
}
