"use server";

/* eslint-disable @typescript-eslint/no-explicit-any -- Server actions normalize generated RPC result unions at the trust boundary. */

import { revalidatePath } from "next/cache";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canAccessProjectQA } from "@/lib/quality-assurance/definitions/server";
import { getProjectQARun } from "./server";
import type { QAActionResult } from "@/lib/quality-assurance/definitions/actions";
import type { QAEvidencePurpose, QAEvidenceType, QAResponseSaveValue, QARunRecord } from "./types";
import { signatureMetadataIsMeaningful, type SignatureArtifactMetadata } from "@/components/ui/signature-pad-model";
import { validateSignaturePngArtifact } from "./signature-artifact-server";

function message(error: unknown) { return error instanceof Error ? error.message : "The QA operation failed."; }

async function requireExecutionPermission(projectSlug: string, permission: "qa.view" | "qa.inspect" | "qa.verify" | "qa.signoff") {
  const [member, project] = await Promise.all([getCurrentOrganizationMember(), getTradePackWorkspaceBySlugForCurrentUser(projectSlug)]);
  if (!member || !project || project.organization_id !== member.organization_id) throw new Error("Project not found.");
  if (!(await hasOrganizationPermission(member.organization_id, permission))) throw new Error("You do not have permission to complete QA for this project.");
  if (!(await canAccessProjectQA(member.organization_id, project.id, permission))) throw new Error("You do not have access to QA for this project.");
  return { member, project };
}

export async function reloadProjectQARunAction(input: { projectSlug: string; projectQaId: string; runId: string }): Promise<QAActionResult<QARunRecord>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.view");
    const run = await getProjectQARun(member.organization_id, project.id, input.projectQaId, input.runId);
    if (!run) throw new Error("QA Record not found.");
    return { ok: true, data: run };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function initiateProjectQAEvidenceUploadAction(input: {
  projectSlug: string; projectQaId: string; runId: string; responseId: string; evidenceType: QAEvidenceType;
  purpose: QAEvidencePurpose; originalFilename: string; mimeType: string; byteSize: number; idempotencyKey: string;
}): Promise<QAActionResult<{ uploadId: string; storagePath: string; token: string }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("initiate_project_qa_evidence_upload_v1", {
      p_organization_id: member.organization_id, p_project_id: project.id, p_run_id: input.runId, p_response_id: input.responseId,
      p_evidence_type: input.evidenceType, p_purpose: input.purpose, p_original_filename: input.originalFilename,
      p_mime_type: input.mimeType, p_byte_size: input.byteSize, p_idempotency_key: input.idempotencyKey,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.upload_id || !row?.storage_path) throw new Error(error?.message ?? "Unable to prepare QA evidence upload.");
    const signed = await createAdminSupabaseClient().storage.from("project-qa-evidence").createSignedUploadUrl(String(row.storage_path));
    if (signed.error || !signed.data?.token) throw new Error("Unable to authorize QA evidence upload.");
    return { ok: true, data: { uploadId: String(row.upload_id), storagePath: String(row.storage_path), token: signed.data.token } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function finalizeProjectQAEvidenceUploadAction(input: { projectSlug: string; projectQaId: string; runId: string; responseId: string; uploadId: string }): Promise<QAActionResult<{ run: QARunRecord }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { error } = await (supabase as any).rpc("finalize_project_qa_evidence_upload_v1", { p_upload_id: input.uploadId });
    if (error) throw new Error(error.message);
    const run = await getProjectQARun(member.organization_id, project.id, input.projectQaId, input.runId);
    if (!run) throw new Error("Uploaded evidence was saved, but the QA Record could not be reloaded.");
    return { ok: true, data: { run } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function abandonProjectQAEvidenceUploadAction(input: { projectSlug: string; uploadId: string }): Promise<QAActionResult> {
  try {
    await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("abandon_project_qa_evidence_upload_v1", { p_upload_id: input.uploadId });
    if (error || typeof data !== "string") throw new Error(error?.message ?? "Unable to abandon QA evidence upload.");
    await createAdminSupabaseClient().storage.from("project-qa-evidence").remove([data]);
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function removeProjectQAEvidenceAction(input: { projectSlug: string; projectQaId: string; runId: string; evidenceId: string }): Promise<QAActionResult<{ run: QARunRecord }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("remove_project_qa_evidence_v1", { p_evidence_id: input.evidenceId });
    if (error || typeof data !== "string") throw new Error(error?.message ?? "Unable to remove QA evidence.");
    await createAdminSupabaseClient().storage.from("project-qa-evidence").remove([data]);
    const run = await getProjectQARun(member.organization_id, project.id, input.projectQaId, input.runId);
    if (!run) throw new Error("QA Record could not be reloaded.");
    return { ok: true, data: { run } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function startProjectQARunAction(input: {
  projectSlug: string;
  projectQaId: string;
  idempotencyKey: string;
  title?: string;
  locationLabel?: string;
}): Promise<QAActionResult<{ runId: string; created: boolean }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("start_project_qa_run_v1", {
      p_organization_id: member.organization_id,
      p_project_id: project.id,
      p_project_qa_id: input.projectQaId,
      p_start_idempotency_key: input.idempotencyKey,
      p_title: input.title?.trim() ?? "",
      p_location_label: input.locationLabel?.trim() ?? "",
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.run_id) throw new Error(error?.message ?? "Unable to Start QA.");
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance`);
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance/${input.projectQaId}`);
    return { ok: true, data: { runId: String(row.run_id), created: row.created === true } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function saveProjectQAResponseAction(input: {
  projectSlug: string;
  projectQaId: string;
  runId: string;
  responseId: string;
  expectedLockVersion: number;
  value: QAResponseSaveValue;
}): Promise<QAActionResult<{ responseLockVersion: number; responseUpdatedAt: string; runLockVersion: number }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("save_project_qa_response_v1", {
      p_organization_id: member.organization_id,
      p_project_id: project.id,
      p_run_id: input.runId,
      p_response_id: input.responseId,
      p_expected_lock_version: input.expectedLockVersion,
      p_value: input.value,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) throw new Error(error?.message ?? "Unable to save QA response.");
    return { ok: true, data: {
      responseLockVersion: Number(row.response_lock_version),
      responseUpdatedAt: String(row.response_updated_at),
      runLockVersion: Number(row.run_lock_version),
    } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function completeProjectQARunAction(input: {
  projectSlug: string;
  projectQaId: string;
  runId: string;
  expectedLockVersion: number;
}): Promise<QAActionResult<{ status: "completed"; completedAt: string; lockVersion: number }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("complete_project_qa_run_v1", {
      p_organization_id: member.organization_id,
      p_project_id: project.id,
      p_run_id: input.runId,
      p_expected_lock_version: input.expectedLockVersion,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || row?.status !== "completed") throw new Error(error?.message ?? "Unable to complete QA.");
    const recordPath = `/app/projects/${input.projectSlug}/job-management/quality-assurance/${input.projectQaId}/records/${input.runId}`;
    revalidatePath(recordPath);
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance/${input.projectQaId}`);
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance`);
    return { ok: true, data: { status: "completed", completedAt: String(row.completed_at), lockVersion: Number(row.lock_version) } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function getProjectQARunLockAction(input: { projectSlug: string; runId: string }): Promise<QAActionResult<{ lockVersion: number }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("get_project_qa_run_lock_v1", { p_organization_id: member.organization_id, p_project_id: project.id, p_run_id: input.runId });
    if (error || !Number.isFinite(Number(data))) throw new Error(error?.message ?? "Unable to reconcile QA Record state.");
    return { ok: true, data: { lockVersion: Number(data) } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function signProjectQAResponseAction(input: { projectSlug: string; projectQaId: string; runId: string; responseId: string; signerName: string; attestation: string }): Promise<QAActionResult<{ run: QARunRecord }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { error } = await (supabase as any).rpc("sign_project_qa_response_v1", { p_organization_id: member.organization_id, p_project_id: project.id, p_run_id: input.runId, p_response_id: input.responseId, p_signer_name: input.signerName, p_attestation: input.attestation });
    if (error) throw new Error(error.message);
    const run = await getProjectQARun(member.organization_id, project.id, input.projectQaId, input.runId);
    if (!run) throw new Error("Signed QA Record could not be reloaded.");
    return { ok: true, data: { run } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function finalizeDrawnProjectQASignatureAction(input: {
  projectSlug: string;
  projectQaId: string;
  runId: string;
  responseId: string;
  uploadId: string;
  storagePath: string;
  signerName: string;
  attestation: string;
  metadata: SignatureArtifactMetadata;
}): Promise<QAActionResult<{ run: QARunRecord }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    if (!signatureMetadataIsMeaningful(input.metadata)) throw new Error("Draw a fuller signature before saving.");
    const admin = createAdminSupabaseClient();
    const uploadResult = await admin.from("project_qa_evidence_uploads")
      .select("id,organization_id,project_id,run_id,response_id,evidence_type,status,storage_path,initiated_by,expires_at")
      .eq("id", input.uploadId)
      .maybeSingle();
    const upload = uploadResult.data;
    if (uploadResult.error || !upload
      || upload.organization_id !== member.organization_id || upload.project_id !== project.id
      || upload.run_id !== input.runId || upload.response_id !== input.responseId
      || upload.evidence_type !== "signature" || upload.status !== "pending"
      || upload.storage_path !== input.storagePath || upload.initiated_by !== member.user_id
      || new Date(upload.expires_at).getTime() <= Date.now()) {
      throw new Error("QA signature upload not found or access denied.");
    }
    const downloaded = await admin.storage.from("project-qa-evidence").download(upload.storage_path);
    if (downloaded.error || !downloaded.data) throw new Error("Uploaded signature image could not be validated.");
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const artifact = await validateSignaturePngArtifact(bytes, input.metadata);
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("finalize_drawn_project_qa_signature_v1", {
      p_upload_id: input.uploadId,
      p_signer_name: input.signerName,
      p_attestation: input.attestation,
      p_sha256: artifact.sha256,
      p_metadata: input.metadata,
      p_image_width: artifact.width,
      p_image_height: artifact.height,
    });
    if (error) throw new Error(error.message);
    const run = await getProjectQARun(member.organization_id, project.id, input.projectQaId, input.runId);
    if (!run) throw new Error("Saved signature could not be reloaded.");
    return { ok: true, data: { run } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function setProjectQAHoldReleaseAction(input: { projectSlug: string; projectQaId: string; runId: string; responseId: string; status: "released" | "rejected"; comment?: string }): Promise<QAActionResult<{ run: QARunRecord }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.verify");
    const supabase = await createServerSupabaseClient();
    const { error } = await (supabase as any).rpc("set_project_qa_hold_release_v1", { p_organization_id: member.organization_id, p_project_id: project.id, p_run_id: input.runId, p_response_id: input.responseId, p_status: input.status, p_comment: input.comment ?? "" });
    if (error) throw new Error(error.message);
    const run = await getProjectQARun(member.organization_id, project.id, input.projectQaId, input.runId);
    if (!run) throw new Error("Verified QA Record could not be reloaded.");
    return { ok: true, data: { run } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function cancelProjectQARunAction(input: { projectSlug: string; projectQaId: string; runId: string; expectedLockVersion: number }): Promise<QAActionResult<{ cancelledAt: string; lockVersion: number }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.inspect");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("cancel_project_qa_run_v1", { p_organization_id: member.organization_id, p_project_id: project.id, p_run_id: input.runId, p_expected_lock_version: input.expectedLockVersion });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || row?.status !== "cancelled") throw new Error(error?.message ?? "Unable to cancel QA Record.");
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance/${input.projectQaId}`);
    return { ok: true, data: { cancelledAt: String(row.cancelled_at), lockVersion: Number(row.lock_version) } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function signoffProjectQARunAction(input: { projectSlug: string; projectQaId: string; runId: string; signerName: string; attestation: string }): Promise<QAActionResult<{ run: QARunRecord }>> {
  try {
    const { member, project } = await requireExecutionPermission(input.projectSlug, "qa.signoff");
    const supabase = await createServerSupabaseClient();
    const { error } = await (supabase as any).rpc("signoff_project_qa_run_v1", { p_organization_id: member.organization_id, p_project_id: project.id, p_run_id: input.runId, p_signer_name: input.signerName, p_attestation: input.attestation });
    if (error) throw new Error(error.message);
    const run = await getProjectQARun(member.organization_id, project.id, input.projectQaId, input.runId);
    if (!run) throw new Error("Signed-off QA Record could not be reloaded.");
    return { ok: true, data: { run } };
  } catch (error) { return { ok: false, error: message(error) }; }
}
