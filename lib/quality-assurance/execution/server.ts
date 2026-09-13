import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic nested-select adapters normalize generated JSON and relational result shapes. */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  QARecordPersonOption,
  QARunDefinitionSnapshot,
  QARunFieldSnapshot,
  QARunListItem,
  QARunRecord,
  QARunResponse,
  QASnapshotOption,
} from "./types";
import { signatureMetadataIsMeaningful, type SignatureArtifactMetadata } from "@/components/ui/signature-pad-model";

type Row = Record<string, unknown>;

function nullableString(value: unknown) { return typeof value === "string" ? value : null; }
function stringValue(value: unknown) { return typeof value === "string" ? value : String(value ?? ""); }
function numberValue(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function signatureMetadata(value: unknown): SignatureArtifactMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as SignatureArtifactMetadata;
  return signatureMetadataIsMeaningful(metadata) ? metadata : null;
}

function mapResponse(row: Row): QARunResponse {
  return {
    id: stringValue(row.id),
    capturedSectionId: stringValue(row.captured_section_id),
    capturedFieldId: stringValue(row.captured_field_id),
    sectionSortOrder: numberValue(row.section_sort_order),
    fieldSortOrder: numberValue(row.field_sort_order),
    fieldType: stringValue(row.field_type) as QARunResponse["fieldType"],
    fieldSnapshot: row.field_snapshot as QARunFieldSnapshot,
    textValue: nullableString(row.text_value),
    numericValue: row.numeric_value === null || row.numeric_value === undefined ? null : numberValue(row.numeric_value),
    booleanValue: typeof row.boolean_value === "boolean" ? row.boolean_value : null,
    dateValue: nullableString(row.date_value),
    inspectionResult: row.inspection_result === "pass" || row.inspection_result === "fail" || row.inspection_result === "na" ? row.inspection_result : null,
    selectedOptions: Array.isArray(row.selected_options) ? row.selected_options as QASnapshotOption[] : [],
    personUserId: nullableString(row.person_user_id),
    personDisplayName: nullableString(row.person_display_name),
    locationLabel: nullableString(row.location_label),
    productMaterialValue: row.product_material_value && typeof row.product_material_value === "object" && !Array.isArray(row.product_material_value)
      ? row.product_material_value as QARunResponse["productMaterialValue"]
      : null,
    evidence: [],
    signatureSignerName: nullableString(row.signature_signer_name),
    signatureMethod: row.signature_method === "typed_acknowledgement" || row.signature_method === "drawn_signature" ? row.signature_method : null,
    signatureAttestation: nullableString(row.signature_attestation),
    signatureSignedBy: nullableString(row.signature_signed_by),
    signatureSignedAt: nullableString(row.signature_signed_at),
    signatureEvidenceId: nullableString(row.signature_evidence_id),
    signatureArtifactSha256: nullableString(row.signature_artifact_sha256),
    signatureArtifactMetadata: signatureMetadata(row.signature_artifact_metadata),
    signatureRecordedByName: nullableString(row.signature_recorded_by_name),
    holdRelease: null,
    comment: stringValue(row.comment),
    lockVersion: numberValue(row.lock_version, 1),
    updatedAt: stringValue(row.updated_at),
  };
}

function mapRun(row: Row): QARunRecord {
  const nested = Array.isArray(row.project_qa_responses) ? row.project_qa_responses as Row[] : [];
  const responses = nested.map(mapResponse).sort((a, b) => a.sectionSortOrder - b.sectionSortOrder || a.fieldSortOrder - b.fieldSortOrder);
  return {
    id: stringValue(row.id),
    projectQaId: stringValue(row.project_qa_id),
    projectQaDefinitionVersion: numberValue(row.project_qa_definition_version, 1),
    definitionSnapshotSchemaVersion: numberValue(row.definition_snapshot_schema_version, 1),
    definitionSnapshot: row.definition_snapshot as QARunDefinitionSnapshot,
    definitionSnapshotHash: stringValue(row.definition_snapshot_hash),
    status: stringValue(row.status) as QARunRecord["status"],
    title: stringValue(row.title),
    locationLabel: stringValue(row.location_label),
    startedBy: stringValue(row.started_by),
    startedAt: stringValue(row.started_at),
    completedBy: nullableString(row.completed_by),
    completedAt: nullableString(row.completed_at),
    cancelledBy: nullableString(row.cancelled_by),
    cancelledAt: nullableString(row.cancelled_at),
    lockVersion: numberValue(row.lock_version, 1),
    responses,
    signoff: null,
  };
}

const responseColumns = "id,captured_section_id,captured_field_id,section_sort_order,field_sort_order,field_type,field_snapshot,text_value,numeric_value,boolean_value,date_value,inspection_result,selected_options,person_user_id,person_display_name,location_label,product_material_value,signature_signer_name,signature_method,signature_attestation,signature_signed_by,signature_signed_at,signature_evidence_id,signature_artifact_sha256,signature_artifact_metadata,signature_recorded_by_name,comment,lock_version,updated_at";
const runColumns = `id,project_qa_id,project_qa_definition_version,definition_snapshot_schema_version,definition_snapshot,definition_snapshot_hash,status,title,location_label,started_by,started_at,completed_by,completed_at,cancelled_by,cancelled_at,lock_version,project_qa_responses(${responseColumns})`;

export async function getProjectQARun(organizationId: string, projectId: string, projectQaId: string, runId: string) {
  const supabase = await createServerSupabaseClient();
  const [runResult, evidenceResult, holdResult, signoffResult] = await Promise.all([
    (supabase as any).from("project_qa_runs").select(runColumns).eq("organization_id", organizationId).eq("project_id", projectId).eq("project_qa_id", projectQaId).eq("id", runId).maybeSingle(),
    (supabase as any).from("project_qa_response_evidence").select("id,project_qa_response_id,evidence_type,purpose,storage_path,original_filename,mime_type,byte_size,caption,sort_order,uploaded_by,uploaded_at,content_sha256,image_width,image_height").eq("organization_id", organizationId).eq("project_id", projectId).eq("project_qa_run_id", runId).order("sort_order"),
    (supabase as any).from("project_qa_hold_releases").select("response_id,status,comment,released_by,released_at,revision").eq("organization_id", organizationId).eq("project_id", projectId).eq("run_id", runId),
    (supabase as any).from("project_qa_signoffs").select("id,signer_name,attestation,signed_by,signed_at").eq("organization_id", organizationId).eq("project_id", projectId).eq("run_id", runId).maybeSingle(),
  ]);
  const { data, error } = runResult;
  if (error || !data) return null;
  const run = mapRun(data as Row);
  const evidenceRows = (evidenceResult.data ?? []) as Row[];
  const paths = evidenceRows.map((row) => stringValue(row.storage_path));
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const signed = await createAdminSupabaseClient().storage.from("project-qa-evidence").createSignedUrls(paths, 60 * 60);
    if (!signed.error) signed.data?.forEach((item, index) => { if (item.signedUrl) urlByPath.set(paths[index], item.signedUrl); });
  }
  const evidenceByResponse = new Map<string, QARunResponse["evidence"]>();
  for (const row of evidenceRows) {
    const responseId = stringValue(row.project_qa_response_id);
    const path = stringValue(row.storage_path);
    const item: QARunResponse["evidence"][number] = {
      id: stringValue(row.id), evidenceType: row.evidence_type === "file" ? "file" : row.evidence_type === "signature" ? "signature" : "photo",
      purpose: row.purpose === "failure" ? "failure" : "general", originalFilename: stringValue(row.original_filename),
      mimeType: stringValue(row.mime_type), byteSize: numberValue(row.byte_size), caption: stringValue(row.caption),
      sortOrder: numberValue(row.sort_order), uploadedBy: stringValue(row.uploaded_by), uploadedAt: stringValue(row.uploaded_at),
      signedUrl: urlByPath.get(path) ?? null,
      contentSha256: nullableString(row.content_sha256), imageWidth: row.image_width == null ? null : numberValue(row.image_width), imageHeight: row.image_height == null ? null : numberValue(row.image_height),
    };
    evidenceByResponse.set(responseId, [...(evidenceByResponse.get(responseId) ?? []), item]);
  }
  const holdByResponse = new Map<string, Row>(((holdResult.data ?? []) as Row[]).map((row) => [stringValue(row.response_id), row]));
  run.responses = run.responses.map((response) => {
    const hold = holdByResponse.get(response.id);
    return { ...response, evidence: evidenceByResponse.get(response.id) ?? [], holdRelease: hold ? {
      status: hold.status === "rejected" ? "rejected" : "released", comment: stringValue(hold.comment),
      releasedBy: stringValue(hold.released_by), releasedAt: stringValue(hold.released_at), revision: numberValue(hold.revision, 1),
    } : null };
  });
  const signoff = signoffResult.data as Row | null;
  run.signoff = signoff ? { id: stringValue(signoff.id), signerName: stringValue(signoff.signer_name), attestation: stringValue(signoff.attestation), signedBy: stringValue(signoff.signed_by), signedAt: stringValue(signoff.signed_at) } : null;
  return run;
}

export async function listProjectQARuns(organizationId: string, projectId: string, projectQaId: string): Promise<QARunListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("list_project_qa_runs_v1", { p_organization_id: organizationId, p_project_id: projectId, p_project_qa_id: projectQaId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((row) => ({
    id: stringValue(row.id), status: stringValue(row.status) as QARunListItem["status"], title: stringValue(row.title), locationLabel: stringValue(row.location_label),
    startedAt: stringValue(row.started_at), completedAt: nullableString(row.completed_at), cancelledAt: nullableString(row.cancelled_at), lockVersion: numberValue(row.lock_version, 1),
    answeredCount: numberValue(row.answered_count), responseCount: numberValue(row.response_count),
  }));
}

export async function getProjectQAMetadata(organizationId: string, projectId: string, projectQaId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).from("project_qas")
    .select("updated_at,updated_by,created_at").eq("organization_id", organizationId).eq("project_id", projectId).eq("id", projectQaId).maybeSingle();
  if (error || !data) return null;
  return { updatedAt: stringValue(data.updated_at), updatedBy: stringValue(data.updated_by), createdAt: stringValue(data.created_at) };
}

export async function listQARecordPeople(organizationId: string): Promise<QARecordPersonOption[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).from("organization_members").select("user_id,display_name")
    .eq("organization_id", organizationId).order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((row) => ({ userId: stringValue(row.user_id), name: stringValue(row.display_name) || "Team Member" })).filter((row) => row.userId);
}
