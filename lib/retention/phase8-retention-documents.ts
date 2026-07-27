import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  composeRetentionClaimPdf,
  type RetentionClaimPdfModel,
} from "@/lib/exports/retention-claim-pdf";

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>;
};

type QueryClient = {
  // Phase 8 presentation fields can be ahead of generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type RetentionClaimDocumentSource = {
  schemaVersion: 1;
  claim: {
    id: string;
    organizationId: string;
    projectId: string;
    claimNumber: string;
    title: string;
    reference: string | null;
    issueDate: string | null;
    dueDate: string | null;
    status: "submitted";
    subtotalExclTax: number;
    submissionStateHash: string;
    submissionEligibilityStateHash: string | null;
    submittedBy: string;
    submittedAt: string;
  };
  allocations: Array<{
    id: string;
    allocationSequence: number;
    originatingPaymentClaimId: string;
    allocationAmount: number;
    originClaimNumberSnapshot: string;
    originClaimDateSnapshot: string | null;
    originClaimStatusSnapshot: string;
    originRetentionOwnedSnapshot: number;
    retentionMethodSnapshot: string;
    retentionRateSnapshot: number;
    retentionWithheldSnapshot: number;
    retentionReleasedSnapshot: number;
    retentionBalanceSnapshot: number;
    existingSubmittedAllocationBefore: number;
    remainingAfterAllocation: number;
    projectStateHashSnapshot: string;
    originStateHashSnapshot: string;
    eligibilityStateHashSnapshot: string | null;
    eligibilityScheduleIdsSnapshot: string[] | null;
    submittedAt: string;
  }>;
};

export type RetentionClaimDocument = {
  id: string;
  organizationId: string;
  projectId: string;
  retentionClaimId: string;
  documentKind: "submitted_claim_pdf";
  documentVersion: 1;
  sourceEvidenceHash: string;
  pdfSha256: string;
  fileName: string;
  storageBucket: "retention-claim-documents";
  storagePath: string;
  byteLength: number;
  renderModelSnapshot: RetentionClaimPdfModel;
  createdBy: string;
  createdAt: string;
};

export type RetentionDocumentResult<T = undefined> = {
  succeeded: boolean;
  errorCode: string | null;
} & (T extends undefined ? object : T);

function object<T>(value: Json | null, operation: string): T {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${operation} returned an invalid Retention document payload.`);
  }
  return value as T;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDocument(value: Record<string, unknown>): RetentionClaimDocument {
  return {
    id: text(value.id),
    organizationId: text(value.organization_id),
    projectId: text(value.project_id),
    retentionClaimId: text(value.retention_claim_id),
    documentKind: "submitted_claim_pdf",
    documentVersion: 1,
    sourceEvidenceHash: text(value.source_evidence_hash),
    pdfSha256: text(value.pdf_sha256),
    fileName: text(value.file_name),
    storageBucket: "retention-claim-documents",
    storagePath: text(value.storage_path),
    byteLength: number(value.byte_length),
    renderModelSnapshot:
      value.render_model_snapshot as RetentionClaimPdfModel,
    createdBy: text(value.created_by),
    createdAt: text(value.created_at),
  };
}

async function invoke(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, Json | undefined>> {
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args);
  if (error) throw new Error(`Unable to execute ${name}: ${error.message}`);
  return object<Record<string, Json | undefined>>(data, name);
}

export async function getRetentionClaimDocument(
  retentionClaimId: string,
): Promise<RetentionDocumentResult<{ document: RetentionClaimDocument | null }>> {
  const result = await invoke("get_retention_claim_document", {
    p_retention_claim_id: retentionClaimId,
  });
  const succeeded = result.succeeded === true;
  return {
    succeeded,
    errorCode: typeof result.errorCode === "string" ? result.errorCode : null,
    document:
      succeeded && result.document && !Array.isArray(result.document)
      && typeof result.document === "object"
        ? normalizeDocument(result.document as Record<string, unknown>)
        : null,
  };
}

async function getDocumentSource(retentionClaimId: string) {
  const result = await invoke("get_retention_claim_document_source", {
    p_retention_claim_id: retentionClaimId,
  });
  if (result.succeeded !== true) {
    return {
      succeeded: false as const,
      errorCode: typeof result.errorCode === "string"
        ? result.errorCode
        : "document_generation_failed",
    };
  }
  if (
    !result.source
    || Array.isArray(result.source)
    || typeof result.source !== "object"
    || typeof result.sourceEvidenceHash !== "string"
    || typeof result.actorUserId !== "string"
    || !result.actorUserId
  ) {
    throw new Error("Retention Claim document source was incomplete.");
  }
  return {
    succeeded: true as const,
    errorCode: null,
    actorUserId: text(result.actorUserId),
    sourceEvidenceHash: result.sourceEvidenceHash,
    source: result.source as unknown as RetentionClaimDocumentSource,
  };
}

async function buildRenderModel(
  source: RetentionClaimDocumentSource,
  sourceEvidenceHash: string,
): Promise<RetentionClaimPdfModel> {
  const server = (await createServerSupabaseClient()) as unknown as QueryClient;
  const [organizationResult, projectResult] = await Promise.all([
    server
      .from("organizations")
      .select(
        "id,name,brand_primary_color,business_number,gst_number,contact_name,contact_email,contact_phone",
      )
      .eq("id", source.claim.organizationId)
      .maybeSingle(),
    server
      .from("organization_projects")
      .select("id,organization_id,name,location,client_id")
      .eq("organization_id", source.claim.organizationId)
      .eq("id", source.claim.projectId)
      .maybeSingle(),
  ]);
  const initialError = organizationResult.error ?? projectResult.error;
  if (initialError) throw new Error(initialError.message);
  if (!organizationResult.data || !projectResult.data) {
    throw new Error("Retention Claim document presentation data was not found.");
  }
  const organization = organizationResult.data as Record<string, unknown>;
  const project = projectResult.data as Record<string, unknown>;
  const clientResult = project.client_id
    ? await server
        .from("organization_clients")
        .select("id,organization_id,name,company_name")
        .eq("organization_id", source.claim.organizationId)
        .eq("id", project.client_id)
        .maybeSingle()
    : { data: null, error: null };
  if (clientResult.error) throw new Error(clientResult.error.message);
  const client = clientResult.data as Record<string, unknown> | null;

  const allocationTotalCents = source.allocations.reduce(
    (sum, allocation) => sum + Math.round(number(allocation.allocationAmount) * 100),
    0,
  );
  const subtotalCents = Math.round(number(source.claim.subtotalExclTax) * 100);
  if (allocationTotalCents !== subtotalCents) {
    throw new Error(
      "Submitted Retention Claim allocation evidence does not match its immutable subtotal.",
    );
  }

  return {
    schemaVersion: 1,
    organizationName: text(organization.name) || "TradesStack",
    organizationBrandPrimaryColor:
      text(organization.brand_primary_color) || null,
    organizationBusinessNumber: text(organization.business_number),
    organizationGstNumber: text(organization.gst_number),
    organizationContactName: text(organization.contact_name),
    organizationContactEmail: text(organization.contact_email),
    organizationContactPhone: text(organization.contact_phone),
    projectName: text(project.name) || "Project",
    projectLocation: text(project.location),
    clientCompanyName: text(client?.company_name),
    clientContactName: text(client?.name),
    claimId: source.claim.id,
    claimNumber: source.claim.claimNumber,
    title: source.claim.title,
    reference: source.claim.reference,
    issueDate: source.claim.issueDate,
    dueDate: source.claim.dueDate,
    submittedAt: source.claim.submittedAt,
    subtotalExclTax: number(source.claim.subtotalExclTax),
    submissionStateHash: source.claim.submissionStateHash,
    submissionEligibilityStateHash:
      source.claim.submissionEligibilityStateHash,
    sourceEvidenceHash,
    allocations: source.allocations.map((allocation) => ({
      id: allocation.id,
      sequence: allocation.allocationSequence,
      originatingPaymentClaimId: allocation.originatingPaymentClaimId,
      paymentClaimNumber: allocation.originClaimNumberSnapshot,
      paymentClaimDate: allocation.originClaimDateSnapshot,
      retentionOwnedAtSubmission: number(
        allocation.originRetentionOwnedSnapshot,
      ),
      previouslyClaimed: number(
        allocation.existingSubmittedAllocationBefore,
      ),
      claimedInThisRetentionClaim: number(allocation.allocationAmount),
      remainingAfterAllocation: number(allocation.remainingAfterAllocation),
    })),
  };
}

export type RetentionClaimDocumentGenerationResult =
  RetentionDocumentResult<{
    created: boolean;
    reused: boolean;
    document?: RetentionClaimDocument;
  }>;

export async function generateRetentionClaimDocumentFromServerSource(params: {
  retentionClaimId: string;
  actorUserId: string;
  sourceEvidenceHash: string;
  source: RetentionClaimDocumentSource;
}): Promise<RetentionClaimDocumentGenerationResult> {
  const { retentionClaimId, actorUserId, sourceEvidenceHash, source } = params;
  if (
    source.claim.id !== retentionClaimId
    || source.claim.status !== "submitted"
    || !actorUserId
    || !/^[a-f0-9]{64}$/.test(sourceEvidenceHash)
  ) {
    throw new Error("Retention Claim document source was incomplete.");
  }
  const existing = await getRetentionClaimDocument(retentionClaimId);
  if (!existing.succeeded) {
    return {
      succeeded: false,
      errorCode: existing.errorCode,
      created: false,
      reused: false,
    };
  }
  if (existing.document) {
    return {
      succeeded: true,
      errorCode: null,
      created: false,
      reused: true,
      document: existing.document,
    };
  }

  const model = await buildRenderModel(
    source,
    sourceEvidenceHash,
  );
  const rendered = await composeRetentionClaimPdf(model);
  const pdfSha256 = createHash("sha256").update(rendered.bytes).digest("hex");
  const storagePath = [
    source.claim.organizationId,
    source.claim.projectId,
    source.claim.id,
    `${sourceEvidenceHash}.pdf`,
  ].join("/");

  const admin = createAdminSupabaseClient();
  const upload = await admin.storage
    .from("retention-claim-documents")
    .upload(storagePath, rendered.bytes, {
      contentType: "application/pdf",
      cacheControl: "31536000",
      upsert: false,
    });
  if (upload.error) {
    // A concurrent request may have created the content-addressed object first.
    // Never overwrite it: verify that the existing bytes are exactly the
    // deterministic artifact this request produced before recording evidence.
    const collision = await admin.storage
      .from("retention-claim-documents")
      .download(storagePath);
    if (collision.error || !collision.data) {
      throw new Error(
        `Unable to store Retention Claim PDF: ${upload.error.message}`,
      );
    }
    const collisionBytes = new Uint8Array(
      await collision.data.arrayBuffer(),
    );
    const collisionHash = createHash("sha256")
      .update(collisionBytes)
      .digest("hex");
    if (
      collisionHash !== pdfSha256
      || collisionBytes.byteLength !== rendered.bytes.byteLength
    ) {
      throw new Error(
        "Existing Retention Claim PDF conflicts with immutable document evidence.",
      );
    }
  }

  const recordResponse = await (admin as unknown as RpcClient).rpc(
    "record_retention_claim_document",
    {
      p_retention_claim_id: retentionClaimId,
      p_source_evidence_hash: sourceEvidenceHash,
      p_pdf_sha256: pdfSha256,
      p_file_name: rendered.fileName,
      p_storage_path: storagePath,
      p_byte_length: rendered.bytes.byteLength,
      p_render_model_snapshot: model as unknown as Json,
      p_actor_user_id: actorUserId,
    },
  );
  if (recordResponse.error) {
    throw new Error(
      `Unable to record Retention Claim PDF: ${recordResponse.error.message}`,
    );
  }
  const recorded = object<Record<string, Json | undefined>>(
    recordResponse.data,
    "record_retention_claim_document",
  );
  const succeeded = recorded.succeeded === true;
  const document =
    succeeded && recorded.document && !Array.isArray(recorded.document)
    && typeof recorded.document === "object"
      ? normalizeDocument(recorded.document as Record<string, unknown>)
      : undefined;
  return {
    succeeded,
    errorCode: typeof recorded.errorCode === "string"
      ? recorded.errorCode
      : null,
    created: recorded.created === true,
    reused: recorded.reused === true,
    document,
  };
}

export async function generateRetentionClaimDocument(
  retentionClaimId: string,
): Promise<RetentionClaimDocumentGenerationResult> {
  const sourceResult = await getDocumentSource(retentionClaimId);
  if (!sourceResult.succeeded) {
    return {
      succeeded: false,
      errorCode: sourceResult.errorCode,
      created: false,
      reused: false,
    };
  }
  return generateRetentionClaimDocumentFromServerSource({
    retentionClaimId,
    actorUserId: sourceResult.actorUserId,
    sourceEvidenceHash: sourceResult.sourceEvidenceHash,
    source: sourceResult.source,
  });
}

export async function downloadRetentionClaimDocument(
  retentionClaimId: string,
) {
  const result = await getRetentionClaimDocument(retentionClaimId);
  if (!result.succeeded || !result.document) return result;
  const admin = createAdminSupabaseClient();
  const download = await admin.storage
    .from(result.document.storageBucket)
    .download(result.document.storagePath);
  if (download.error || !download.data) {
    throw new Error(
      `Unable to download Retention Claim PDF: ${
        download.error?.message ?? "document missing"
      }`,
    );
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (
    actualHash !== result.document.pdfSha256
    || bytes.byteLength !== result.document.byteLength
  ) {
    throw new Error("Retention Claim PDF failed immutable evidence verification.");
  }
  return { ...result, bytes };
}
