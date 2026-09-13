"use client";

/* eslint-disable @next/next/no-img-element -- Private signed QA evidence URLs are short-lived and cannot use the image optimizer safely. */

import { useRef, useState } from "react";
import { Camera, Download, FileText, Loader2, RotateCcw, Trash2, Upload, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad, type SignaturePadHandle } from "@/components/ui/signature-pad";
import {
  abandonProjectQAEvidenceUploadAction,
  finalizeProjectQAEvidenceUploadAction,
  finalizeDrawnProjectQASignatureAction,
  initiateProjectQAEvidenceUploadAction,
  removeProjectQAEvidenceAction,
  setProjectQAHoldReleaseAction,
  signProjectQAResponseAction,
} from "@/lib/quality-assurance/execution/actions";
import { QA_FILE_ACCEPT, QA_PHOTO_ACCEPT, uploadProjectQAEvidence, validateQAEvidenceFile } from "@/lib/quality-assurance/execution/evidence-client";
import type { QAEvidenceType, QARunRecord, QARunResponse } from "@/lib/quality-assurance/execution/types";

type SharedProps = {
  response: QARunResponse;
  projectSlug: string;
  projectQaId: string;
  runId: string;
  disabled: boolean;
  onRunChange: (run: QARunRecord) => void;
  onUploadStateChange: (active: boolean, failed?: boolean) => void;
  currentUserName?: string;
};

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function QARecordEvidenceControl({ type, ...props }: SharedProps & { type: QAEvidenceType }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const takeRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const evidence = props.response.evidence.filter((item) => item.evidenceType === type);

  async function upload(files: File[]) {
    if (!files.length || props.disabled) return;
    setBusy(true); setError(""); setRetryFiles([]); props.onUploadStateChange(true);
    try {
      for (const file of files) {
        validateQAEvidenceFile(file, type);
        const idempotencyKey = crypto.randomUUID();
        const initiated = await initiateProjectQAEvidenceUploadAction({
          projectSlug: props.projectSlug, projectQaId: props.projectQaId, runId: props.runId, responseId: props.response.id,
          evidenceType: type, purpose: props.response.fieldType === "inspection_check" && props.response.inspectionResult === "fail" ? "failure" : "general",
          originalFilename: file.name, mimeType: file.type.toLowerCase(), byteSize: file.size, idempotencyKey,
        });
        if (!initiated.ok) throw new Error(initiated.error);
        try {
          await uploadProjectQAEvidence({ file, storagePath: initiated.data.storagePath, token: initiated.data.token });
          const finalized = await finalizeProjectQAEvidenceUploadAction({ projectSlug: props.projectSlug, projectQaId: props.projectQaId, runId: props.runId, responseId: props.response.id, uploadId: initiated.data.uploadId });
          if (!finalized.ok) throw new Error(finalized.error);
          props.onRunChange(finalized.data.run);
        } catch (uploadError) {
          await abandonProjectQAEvidenceUploadAction({ projectSlug: props.projectSlug, uploadId: initiated.data.uploadId });
          throw uploadError;
        }
      }
      props.onUploadStateChange(false);
    } catch (uploadError) {
      setRetryFiles(files); setError(uploadError instanceof Error ? uploadError.message : "Evidence upload failed.");
      props.onUploadStateChange(false, true);
    } finally { setBusy(false); }
  }

  async function remove(evidenceId: string) {
    setBusy(true); setError(""); props.onUploadStateChange(true);
    const result = await removeProjectQAEvidenceAction({ projectSlug: props.projectSlug, projectQaId: props.projectQaId, runId: props.runId, evidenceId });
    if (result.ok) props.onRunChange(result.data.run); else setError(result.error);
    setBusy(false); props.onUploadStateChange(false, !result.ok);
  }

  return <div className="space-y-3">
    {!props.disabled ? <div className="flex flex-wrap gap-2">
      {type === "photo" ? <>
        <input ref={takeRef} className="sr-only" type="file" accept={QA_PHOTO_ACCEPT} capture="environment" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void upload(files); }} />
        <Button type="button" variant="outline" disabled={busy} onClick={() => takeRef.current?.click()}><Camera className="h-4 w-4" />Take Photo</Button>
      </> : null}
      <input ref={uploadRef} className="sr-only" type="file" accept={type === "photo" ? QA_PHOTO_ACCEPT : QA_FILE_ACCEPT} multiple onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void upload(files); }} />
      <Button type="button" variant="outline" disabled={busy} onClick={() => uploadRef.current?.click()}><Upload className="h-4 w-4" />{type === "photo" ? "Upload Photo" : "Upload File"}</Button>
      {busy ? <span className="inline-flex items-center text-sm text-[var(--text-secondary)]"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</span> : null}
    </div> : null}
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--error)] p-3 text-sm"><span>{error}</span>{retryFiles.length ? <Button type="button" size="sm" variant="outline" onClick={() => void upload(retryFiles)}><RotateCcw className="h-4 w-4" />Retry</Button> : null}</div> : null}
    {evidence.length ? <div className={type === "photo" ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "space-y-2"}>{evidence.map((item) => type === "photo" ? <div key={item.id} className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)]">
      {item.signedUrl && ["image/jpeg", "image/png", "image/webp"].includes(item.mimeType) ? <a href={item.signedUrl} target="_blank" rel="noreferrer"><img src={item.signedUrl} alt={item.caption || item.originalFilename} className="aspect-square w-full object-cover" loading="lazy" /></a> : <a href={item.signedUrl ?? undefined} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center p-3 text-center text-xs"><FileText className="mr-2 h-5 w-5" />{item.originalFilename}</a>}
      {!props.disabled ? <Button type="button" size="icon" variant="secondary" aria-label={`Remove ${item.originalFilename}`} className="absolute right-1 top-1 h-8 w-8" disabled={busy} onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4" /></Button> : null}
    </div> : <div key={item.id} className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.originalFilename}</p><p className="text-xs text-[var(--text-muted)]">{item.mimeType} · {bytes(item.byteSize)}</p></div><div className="flex"><Button asChild type="button" size="icon" variant="ghost"><a href={item.signedUrl ?? undefined} target="_blank" rel="noreferrer" aria-label={`Open ${item.originalFilename}`}><Download className="h-4 w-4" /></a></Button>{!props.disabled ? <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${item.originalFilename}`} disabled={busy} onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4" /></Button> : null}</div></div>)}</div> : <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm text-[var(--text-secondary)]">No {type === "photo" ? "photos" : "files"} added.</p>}
  </div>;
}

export function QARecordSignatureControl(props: SharedProps) {
  const attestation = "I confirm that the information recorded in this QA response is accurate to the best of my knowledge.";
  const padRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(props.response.signatureSignerName ?? props.currentUserName ?? "");
  const [method, setMethod] = useState<"drawn_signature" | "typed_acknowledgement">("drawn_signature");
  const [acknowledged, setAcknowledged] = useState(false);
  const [meaningful, setMeaningful] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signTyped() {
    setBusy(true); setError(""); props.onUploadStateChange(true);
    const result = await signProjectQAResponseAction({ projectSlug: props.projectSlug, projectQaId: props.projectQaId, runId: props.runId, responseId: props.response.id, signerName: name, attestation });
    if (result.ok) {
      setReplacing(false);
      props.onRunChange(result.data.run);
    } else setError(result.error);
    setBusy(false); props.onUploadStateChange(false, !result.ok);
  }

  async function signDrawn() {
    setBusy(true); setError(""); props.onUploadStateChange(true);
    let uploadId: string | null = null;
    try {
      const artifact = await padRef.current?.exportPng();
      if (!artifact) throw new Error("Signature pad is unavailable.");
      const file = new File([artifact.blob], `qa-signature-${crypto.randomUUID()}.png`, { type: "image/png" });
      validateQAEvidenceFile(file, "signature");
      const initiated = await initiateProjectQAEvidenceUploadAction({
        projectSlug: props.projectSlug, projectQaId: props.projectQaId, runId: props.runId, responseId: props.response.id,
        evidenceType: "signature", purpose: "general", originalFilename: file.name, mimeType: file.type, byteSize: file.size, idempotencyKey: crypto.randomUUID(),
      });
      if (!initiated.ok) throw new Error(initiated.error);
      uploadId = initiated.data.uploadId;
      await uploadProjectQAEvidence({ file, storagePath: initiated.data.storagePath, token: initiated.data.token });
      const finalized = await finalizeDrawnProjectQASignatureAction({
        projectSlug: props.projectSlug, projectQaId: props.projectQaId, runId: props.runId, responseId: props.response.id,
        uploadId, storagePath: initiated.data.storagePath, signerName: name, attestation, metadata: artifact.metadata,
      });
      if (!finalized.ok) throw new Error(finalized.error);
      props.onRunChange(finalized.data.run);
      setReplacing(false);
    } catch (uploadError) {
      if (uploadId) await abandonProjectQAEvidenceUploadAction({ projectSlug: props.projectSlug, uploadId });
      setError(uploadError instanceof Error ? uploadError.message : "Signature save failed.");
      props.onUploadStateChange(false, true);
      setBusy(false);
      return;
    }
    setBusy(false); props.onUploadStateChange(false);
  }

  const saved = Boolean(props.response.signatureSignedAt) && !replacing;
  if (saved) {
    const signatureEvidence = props.response.evidence.find((item) => item.id === props.response.signatureEvidenceId && item.evidenceType === "signature");
    return <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--success)] bg-[var(--success-light)] p-4">
      {props.response.signatureMethod === "drawn_signature" ? signatureEvidence?.signedUrl ? <img src={signatureEvidence.signedUrl} alt={`Signature captured for ${props.response.signatureSignerName ?? "signer"}`} className="max-h-56 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white object-contain" /> : <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--error)] bg-white p-3 text-sm">The saved signature image is temporarily unavailable.</p> : null}
      <div className="grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Signed by</p><p className="mt-1 font-semibold">{props.response.signatureSignerName}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recorded by</p><p className="mt-1 font-semibold">{props.response.signatureRecordedByName ?? "Authenticated TradesStack user"}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Signed</p><p className="mt-1 font-semibold">{new Date(props.response.signatureSignedAt!).toLocaleString()}</p></div></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Attestation</p><p className="mt-1 flex items-center text-sm"><CheckCircle2 className="mr-2 h-4 w-4" />Confirmed</p></div>
      <p className="text-xs text-[var(--text-secondary)]">{props.response.signatureMethod === "drawn_signature" ? "Drawn signature" : "Typed acknowledgement"}</p>
      {!props.disabled ? <Button type="button" variant="outline" onClick={() => { setReplacing(true); setAcknowledged(false); setMethod("drawn_signature"); setError(""); }}>Replace signature</Button> : null}
    </div>;
  }

  return <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4">
    {replacing ? <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-sm"><span>The saved signature remains active until replacement succeeds.</span><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setReplacing(false)}>Cancel</Button></div> : null}
    <div><label className="mb-1 block text-xs font-semibold" htmlFor={`qa-signer-${props.response.id}`}>Signer name</label><Input id={`qa-signer-${props.response.id}`} value={name} disabled={props.disabled || busy} onChange={(event) => setName(event.target.value)} /></div>
    <fieldset disabled={props.disabled || busy}><legend className="mb-1 text-xs font-semibold">Signature method</legend><div className="grid gap-2 sm:grid-cols-2">{([ ["drawn_signature", "Draw signature"], ["typed_acknowledgement", "Typed acknowledgement"] ] as const).map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"><Radio name={`qa-signature-method-${props.response.id}`} value={value} checked={method === value} onChange={() => setMethod(value)} />{label}</label>)}</div></fieldset>
    {method === "drawn_signature" ? <><SignaturePad ref={padRef} disabled={props.disabled || busy} onValidityChange={setMeaningful} /><Button type="button" variant="outline" disabled={props.disabled || busy} onClick={() => padRef.current?.clear()}>Clear</Button></> : <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]">Your typed acknowledgement will be recorded with your signer name and authenticated TradesStack identity.</p>}
    <label className="flex items-start gap-3 text-sm"><Checkbox checked={acknowledged} disabled={props.disabled || busy} onChange={(event) => setAcknowledged(event.target.checked)} /><span>{attestation}</span></label>
    {error ? <p role="alert" className="text-sm text-[var(--error)]">{error}</p> : null}
    <Button type="button" disabled={props.disabled || busy || !name.trim() || !acknowledged || (method === "drawn_signature" && !meaningful)} onClick={() => void (method === "drawn_signature" ? signDrawn() : signTyped())}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{method === "drawn_signature" ? "Save signature" : "Sign acknowledgement"}</Button>
    <p className="text-xs text-[var(--text-muted)]">TradesStack records the authenticated user, signer-name snapshot, acknowledgement, and server timestamp. This is not a legal certification guarantee.</p>
  </div>;
}

export function QAHoldReleaseControl(props: SharedProps & { canVerify: boolean }) {
  const [comment, setComment] = useState(props.response.holdRelease?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(status: "released" | "rejected") {
    setBusy(true); setError(""); props.onUploadStateChange(true);
    const result = await setProjectQAHoldReleaseAction({ projectSlug: props.projectSlug, projectQaId: props.projectQaId, runId: props.runId, responseId: props.response.id, status, comment });
    if (result.ok) props.onRunChange(result.data.run); else setError(result.error);
    setBusy(false); props.onUploadStateChange(false, !result.ok);
  }
  return <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-light)] p-3"><p className="font-semibold">Hold Point: {props.response.holdRelease?.status === "released" ? "Released" : props.response.holdRelease?.status === "rejected" ? "Rejected" : "Awaiting release"}</p>{props.response.holdRelease ? <p className="text-xs">Decision {new Date(props.response.holdRelease.releasedAt).toLocaleString()}{props.response.holdRelease.comment ? ` · ${props.response.holdRelease.comment}` : ""}</p> : null}{props.canVerify ? <><Textarea value={comment} disabled={busy} placeholder="Verification comment (optional)" onChange={(event) => setComment(event.target.value)} /><div className="flex gap-2"><Button type="button" size="sm" disabled={busy || !props.response.inspectionResult} onClick={() => void decide("released")}><CheckCircle2 className="h-4 w-4" />Release</Button><Button type="button" size="sm" variant="outline" disabled={busy || !props.response.inspectionResult} onClick={() => void decide("rejected")}><XCircle className="h-4 w-4" />Reject</Button></div></> : <p className="text-xs text-[var(--text-secondary)]">A QA verifier must release this Hold Point before completion.</p>}{error ? <p role="alert" className="text-sm text-[var(--error)]">{error}</p> : null}</div>;
}
