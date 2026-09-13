"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QAFormContent } from "@/components/app/quality-assurance/presentation/QAFormPresentation";
import { QASectionPresentation } from "@/components/app/quality-assurance/presentation/QASectionPresentation";
import { RecordQAFieldRenderer } from "@/components/app/quality-assurance/presentation/RecordQAFieldRenderer";
import { cancelProjectQARunAction, completeProjectQARunAction, getProjectQARunLockAction, reloadProjectQARunAction, saveProjectQAResponseAction, signoffProjectQARunAction } from "@/lib/quality-assurance/execution/actions";
import { getQARunProgress, responseToSaveValue } from "@/lib/quality-assurance/execution/model";
import type { QARecordPersonOption, QARunRecord, QARunResponse } from "@/lib/quality-assurance/execution/types";

type SaveState = "saved" | "saving" | "error";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-NZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ProjectQARecord({ initialRun, projectSlug, people, currentUserName, canInspect, canVerify, canSignoff }: {
  initialRun: QARunRecord;
  projectSlug: string;
  people: QARecordPersonOption[];
  currentUserName: string;
  canInspect: boolean;
  canVerify: boolean;
  canSignoff: boolean;
}) {
  const [run, setRun] = useState(initialRun);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [changeSequence, setChangeSequence] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [staleConflict, setStaleConflict] = useState(false);
  const [signoffName, setSignoffName] = useState("");
  const [signoffAck, setSignoffAck] = useState(false);
  const responsesRef = useRef(initialRun.responses);
  const runLockRef = useRef(initialRun.lockVersion);
  const revisionsRef = useRef(new Map<string, number>());
  const dirtyRef = useRef(new Set<string>());
  const savingRef = useRef(new Set<string>());
  const uploadCountRef = useRef(0);
  const editable = canInspect && run.status === "in_progress";

  const replaceResponse = useCallback((responseId: string, updater: (response: QARunResponse) => QARunResponse) => {
    const next = responsesRef.current.map((response) => response.id === responseId ? updater(response) : response);
    responsesRef.current = next;
    setRun((current) => ({ ...current, responses: next }));
  }, []);

  const updateResponse = useCallback((responseId: string, patch: Partial<QARunResponse>) => {
    if (!editable) return;
    replaceResponse(responseId, (response) => ({ ...response, ...patch }));
    revisionsRef.current.set(responseId, (revisionsRef.current.get(responseId) ?? 0) + 1);
    dirtyRef.current.add(responseId);
    setSaveError("");
    setSaveState("saving");
    setChangeSequence((value) => value + 1);
  }, [editable, replaceResponse]);

  const saveResponse = useCallback(async (responseId: string) => {
    if (savingRef.current.has(responseId) || !dirtyRef.current.has(responseId)) return true;
    const response = responsesRef.current.find((item) => item.id === responseId);
    if (!response) return true;
    const sentRevision = revisionsRef.current.get(responseId) ?? 0;
    savingRef.current.add(responseId);
    setSaveState("saving");
    const result = await saveProjectQAResponseAction({
      projectSlug,
      projectQaId: run.projectQaId,
      runId: run.id,
      responseId,
      expectedLockVersion: response.lockVersion,
      value: responseToSaveValue(response),
    });
    savingRef.current.delete(responseId);
    if (!result.ok) {
      setSaveError(result.error);
      setStaleConflict(/changed elsewhere|reload/i.test(result.error));
      setSaveState("error");
      return false;
    }
    runLockRef.current = Math.max(runLockRef.current, result.data.runLockVersion);
    setStaleConflict(false);
    replaceResponse(responseId, (current) => ({ ...current, lockVersion: result.data.responseLockVersion, updatedAt: result.data.responseUpdatedAt }));
    if ((revisionsRef.current.get(responseId) ?? 0) === sentRevision) dirtyRef.current.delete(responseId);
    if (dirtyRef.current.size === 0 && savingRef.current.size === 0) setSaveState("saved");
    else setChangeSequence((value) => value + 1);
    return true;
  }, [projectSlug, replaceResponse, run.id, run.projectQaId]);

  const saveDirty = useCallback(async () => {
    const ids = [...dirtyRef.current].filter((id) => !savingRef.current.has(id));
    for (const id of ids) if (!(await saveResponse(id))) return false;
    return dirtyRef.current.size === 0 && savingRef.current.size === 0;
  }, [saveResponse]);

  useEffect(() => {
    if (!editable || dirtyRef.current.size === 0) return;
    const timeout = window.setTimeout(() => { void saveDirty(); }, 650);
    return () => window.clearTimeout(timeout);
  }, [changeSequence, editable, saveDirty]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current.size || savingRef.current.size || uploadCountRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(() => {
    const protectClientNavigation = (event: MouseEvent) => {
      if (!dirtyRef.current.size && !savingRef.current.size && !uploadCountRef.current) return;
      const link = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!link || event.defaultPrevented) return;
      if (!window.confirm("This QA Record still has unsaved changes. Leave anyway?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", protectClientNavigation, true);
    return () => document.removeEventListener("click", protectClientNavigation, true);
  }, []);

  const applyRunChange = useCallback((fresh: QARunRecord) => {
    const localById = new Map(responsesRef.current.map((response) => [response.id, response]));
    const responses = fresh.responses.map((response) => {
      const local = localById.get(response.id);
      if (!local || !dirtyRef.current.has(response.id)) return response;
      return { ...response, ...local, evidence: response.evidence, signatureSignerName: response.signatureSignerName, signatureMethod: response.signatureMethod, signatureAttestation: response.signatureAttestation, signatureSignedBy: response.signatureSignedBy, signatureSignedAt: response.signatureSignedAt, signatureEvidenceId: response.signatureEvidenceId, signatureArtifactSha256: response.signatureArtifactSha256, signatureArtifactMetadata: response.signatureArtifactMetadata, signatureRecordedByName: response.signatureRecordedByName, holdRelease: response.holdRelease, lockVersion: response.lockVersion, updatedAt: response.updatedAt };
    });
    responsesRef.current = responses;
    runLockRef.current = Math.max(runLockRef.current, fresh.lockVersion);
    setRun({ ...fresh, responses });
  }, []);

  const updateUploadState = useCallback((active: boolean, failed = false) => {
    uploadCountRef.current = Math.max(0, uploadCountRef.current + (active ? 1 : -1));
    setPendingUploads(uploadCountRef.current);
    if (active) setUploadFailed(false);
    if (failed) setUploadFailed(true);
  }, []);

  async function reloadAfterConflict() {
    const result = await reloadProjectQARunAction({ projectSlug, projectQaId: run.projectQaId, runId: run.id });
    if (!result.ok) { setSaveError(result.error); return; }
    dirtyRef.current.clear(); savingRef.current.clear(); revisionsRef.current.clear();
    responsesRef.current = result.data.responses; runLockRef.current = result.data.lockVersion;
    setRun(result.data); setStaleConflict(false); setSaveError(""); setSaveState("saved");
  }

  const progress = useMemo(() => getQARunProgress(run.responses), [run.responses]);
  const groupedResponses = useMemo(() => {
    const bySection = new Map<string, QARunResponse[]>();
    for (const response of run.responses) {
      const group = bySection.get(response.capturedSectionId);
      if (group) group.push(response);
      else bySection.set(response.capturedSectionId, [response]);
    }
    return run.definitionSnapshot.sections.map((section) => ({ section, responses: bySection.get(section.id) ?? [] }));
  }, [run.definitionSnapshot.sections, run.responses]);

  async function completeRun() {
    if (pendingUploads || uploadFailed) { setSaveError(uploadFailed ? "Resolve the failed evidence upload before completing QA." : "Wait for evidence uploads to finish before completing QA."); return; }
    if (savingRef.current.size) { setSaveError("Wait for the current save to finish, then try again."); return; }
    setCompleting(true);
    setSaveError("");
    if (!(await saveDirty())) { setCompleting(false); return; }
    const reconciled = await getProjectQARunLockAction({ projectSlug, runId: run.id });
    if (!reconciled.ok) { setSaveError(reconciled.error); setCompleting(false); return; }
    runLockRef.current = reconciled.data.lockVersion;
    const result = await completeProjectQARunAction({ projectSlug, projectQaId: run.projectQaId, runId: run.id, expectedLockVersion: runLockRef.current });
    if (!result.ok) { setSaveError(result.error); setSaveState("error"); setCompleting(false); return; }
    runLockRef.current = result.data.lockVersion;
    setRun((current) => ({ ...current, status: "completed", completedAt: result.data.completedAt, lockVersion: result.data.lockVersion }));
    setSaveState("saved");
    setCompleting(false);
  }

  async function cancelRun() {
    if (pendingUploads || savingRef.current.size || dirtyRef.current.size) {
      setSaveError("Wait for pending uploads and saves before cancelling this QA Record.");
      return;
    }
    if (!window.confirm("Cancel this QA Record? It will remain readable but cannot be edited or completed.")) return;
    setSaveError("");
    setStaleConflict(false);
    const result = await cancelProjectQARunAction({ projectSlug, projectQaId: run.projectQaId, runId: run.id, expectedLockVersion: runLockRef.current });
    if (!result.ok) { setSaveError(result.error); setStaleConflict(/changed since|reload/i.test(result.error)); setSaveState("error"); return; }
    runLockRef.current = result.data.lockVersion;
    setRun((current) => ({ ...current, status: "cancelled", cancelledAt: result.data.cancelledAt, lockVersion: result.data.lockVersion }));
    setSaveState("saved");
  }

  async function signoffRun() {
    const result = await signoffProjectQARunAction({ projectSlug, projectQaId: run.projectQaId, runId: run.id, signerName: signoffName, attestation: "I approve this completed QA Record as an accurate record of the inspection." });
    if (!result.ok) { setSaveError(result.error); return; }
    applyRunChange(result.data.run);
  }

  const base = `/app/projects/${projectSlug}/job-management/quality-assurance/${run.projectQaId}`;
  return <QAFormContent className="pb-28">
    <header className="sticky top-0 z-20 -mx-4 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-[var(--radius-md)] sm:px-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={base} className="text-sm font-medium text-[var(--brand-blue)]">← QA Records</Link><h1 className="mt-1 truncate text-xl font-semibold">{run.title || run.definitionSnapshot.name}</h1><p className="mt-1 text-xs text-[var(--text-secondary)]">{run.locationLabel || `Started ${dateTime(run.startedAt)}`}</p></div><div className="flex items-center gap-2"><Badge variant={run.status === "completed" ? "default" : "secondary"}>{run.status === "completed" ? "Completed" : run.status === "cancelled" ? "Cancelled" : "In progress"}</Badge>{editable ? <Button type="button" size="sm" variant="ghost" onClick={() => void cancelRun()}>Cancel QA</Button> : null}</div></div>
      <div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full bg-[var(--brand-blue)] transition-all" style={{ width: `${progress.percent}%` }} /></div><span className="shrink-0 text-xs font-semibold">{progress.completed}/{progress.total}</span></div>
      <div className="mt-2 flex min-h-5 items-center text-xs text-[var(--text-secondary)]">{pendingUploads ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Uploading evidence…</> : uploadFailed ? <><AlertTriangle className="mr-1.5 h-3.5 w-3.5 text-[var(--error)]" />Upload failed · retry required</> : saveState === "saving" ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : saveState === "error" ? <><AlertTriangle className="mr-1.5 h-3.5 w-3.5 text-[var(--error)]" />Save failed</> : <><Check className="mr-1.5 h-3.5 w-3.5" />Saved</>}</div>
    </header>

    {run.status === "completed" ? <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm"><p className="font-semibold">This QA Record is complete and read-only.</p>{run.completedAt ? <p className="mt-1 text-[var(--text-secondary)]">Completed {dateTime(run.completedAt)}</p> : null}</div> : null}
    {run.status === "cancelled" ? <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm"><p className="font-semibold">This QA Record was cancelled and is read-only.</p>{run.cancelledAt ? <p className="mt-1 text-[var(--text-secondary)]">Cancelled {dateTime(run.cancelledAt)}</p> : null}</div> : null}
    {run.status === "completed" ? <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] p-4">{run.signoff ? <><p className="font-semibold">Final QA sign-off</p><p className="mt-1 text-sm">Signed off by {run.signoff.signerName} · {dateTime(run.signoff.signedAt)}</p><p className="mt-2 text-sm text-[var(--text-secondary)]">{run.signoff.attestation}</p></> : canSignoff ? <div className="space-y-3"><p className="font-semibold">Final QA sign-off</p><Input value={signoffName} placeholder="Signer name" onChange={(event) => setSignoffName(event.target.value)} /><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={signoffAck} onChange={(event) => setSignoffAck(event.target.checked)} /><span>I approve this completed QA Record as an accurate record of the inspection.</span></label><Button type="button" disabled={!signoffName.trim() || !signoffAck} onClick={() => void signoffRun()}>Sign off QA</Button></div> : <p className="text-sm text-[var(--text-secondary)]">Final sign-off has not been recorded.</p>}</div> : null}
    {!canInspect && run.status === "in_progress" ? <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">You can view this record, but you do not have permission to complete QA.</div> : null}
    {saveError ? <div role="alert" className="mt-5 flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--error)] bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span>{saveError}</span>{editable ? staleConflict ? <Button type="button" size="sm" variant="outline" onClick={() => void reloadAfterConflict()}><RotateCcw className="mr-2 h-4 w-4" />Reload latest record</Button> : <Button type="button" size="sm" variant="outline" onClick={() => { setSaveError(""); setChangeSequence((value) => value + 1); }}><RotateCcw className="mr-2 h-4 w-4" />Retry save</Button> : null}</div> : null}

    <div className="mt-6 space-y-8">{groupedResponses.map(({ section, responses }, sectionIndex) => <QASectionPresentation key={section.id} section={section} sectionIndex={sectionIndex}>{responses.map((response) => <RecordQAFieldRenderer key={response.id} response={response} people={people} currentUserName={currentUserName} disabled={!editable} projectSlug={projectSlug} projectQaId={run.projectQaId} runId={run.id} canVerify={canVerify && run.status === "in_progress"} onRunChange={applyRunChange} onUploadStateChange={updateUploadState} onUpdateResponse={updateResponse} />)}</QASectionPresentation>)}</div>

    {editable ? <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-white/95 p-3 backdrop-blur"><div className="mx-auto flex max-w-4xl items-center justify-between gap-3"><div className="text-sm"><span className="font-semibold">{progress.percent}% ready</span><span className="hidden text-[var(--text-secondary)] sm:inline"> · Required responses, evidence, and Hold Points are included</span></div><Button type="button" className="h-12 min-w-36" disabled={completing || saveState === "saving" || pendingUploads>0 || uploadFailed} onClick={() => void completeRun()}>{completing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Completing…</> : "Complete QA"}</Button></div></div> : null}
  </QAFormContent>;
}
