"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { startProjectQARunAction } from "@/lib/quality-assurance/execution/actions";

export function StartQADialog({ open, onOpenChange, projectSlug, projectQaId, qaName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
  projectQaId: string;
  qaName: string;
}) {
  const router = useRouter();
  const [locationLabel, setLocationLabel] = useState("");
  const [title, setTitle] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => startTransition(async () => {
    setError(null);
    const result = await startProjectQARunAction({ projectSlug, projectQaId, idempotencyKey: idempotencyKey.current, title, locationLabel });
    if (!result.ok) { setError(result.error); return; }
    onOpenChange(false);
    router.push(`/app/projects/${projectSlug}/job-management/quality-assurance/${projectQaId}/records/${result.data.runId}`);
  });

  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent fullScreenMobile className="max-w-lg p-6">
      <DialogHeader>
        <DialogTitle>Start QA</DialogTitle>
        <DialogDescription>QA · {qaName}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        {error ? <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)] whitespace-pre-line">{error}</p> : null}
        <div><label className="mb-1 block text-[13px] font-semibold" htmlFor={`qa-location-${projectQaId}`}>Location / area <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><Input id={`qa-location-${projectQaId}`} value={locationLabel} onChange={(event) => setLocationLabel(event.target.value)} placeholder="e.g. Level 2 Office" autoFocus /></div>
        <div><label className="mb-1 block text-[13px] font-semibold" htmlFor={`qa-reference-${projectQaId}`}>Reference / name <span className="font-normal text-[var(--text-muted)]">(optional)</span></label><Input id={`qa-reference-${projectQaId}`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Grid inspection 02" /></div>
        <p className="text-xs text-[var(--text-muted)]">You and the current start time are recorded automatically.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button><Button onClick={start} disabled={pending}>{pending ? "Starting…" : "Start QA"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
