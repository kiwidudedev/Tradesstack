import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type ShadowRpcResult = {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message: string } | null;
};

export interface ShadowCaptureResult {
  runId: string | null;
  captured: boolean;
  eligible: boolean;
  failureCodes: string[];
}

function deterministicUuid(value: string) {
  const hex = createHash("sha256").update(`opportunity-shadow:${value}`).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
}

function rpcClient() {
  return createAdminSupabaseClient() as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<ShadowRpcResult>;
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function capturePromotionShadowBestEffort(params: {
  organizationId: string;
  opportunityId: string;
  acceptedQuoteId: string;
  actorUserId: string;
  correlationId: string;
}): Promise<ShadowCaptureResult | null> {
  try {
    const result = await rpcClient().rpc("capture_opportunity_promotion_shadow_v2", {
      p_organization_id: params.organizationId,
      p_opportunity_id: params.opportunityId,
      p_accepted_quote_id: params.acceptedQuoteId,
      p_correlation_id: deterministicUuid(params.correlationId),
      p_actor_user_id: params.actorUserId,
    });
    if (result.error) throw new Error(result.error.message);
    const row = result.data?.[0];
    if (!row || typeof row.run_id !== "string") return null;
    return {
      runId: row.run_id,
      captured: row.captured === true,
      eligible: row.eligible === true,
      failureCodes: stringArray(row.failure_codes),
    };
  } catch (error) {
    console.error("[opportunity/shadow] pre-conversion capture failed", {
      opportunityId: params.opportunityId,
      organizationId: params.organizationId,
      message: error instanceof Error ? error.message : "Unknown shadow capture failure",
    });
    return null;
  }
}

export async function finalizePromotionShadowBestEffort(params: {
  organizationId: string;
  runId: string | null;
  finalProjectId: string;
  actorUserId: string;
}) {
  if (!params.runId) return null;
  try {
    const result = await rpcClient().rpc("finalize_opportunity_promotion_shadow_v2", {
      p_organization_id: params.organizationId,
      p_run_id: params.runId,
      p_final_project_id: params.finalProjectId,
      p_actor_user_id: params.actorUserId,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data?.[0] ?? null;
  } catch (error) {
    console.error("[opportunity/shadow] post-conversion comparison failed", {
      runId: params.runId,
      organizationId: params.organizationId,
      finalProjectId: params.finalProjectId,
      message: error instanceof Error ? error.message : "Unknown shadow comparison failure",
    });
    return null;
  }
}
