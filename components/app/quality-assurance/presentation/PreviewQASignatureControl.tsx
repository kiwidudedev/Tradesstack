"use client";

/* eslint-disable @next/next/no-img-element -- blob URLs are ephemeral signature previews */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { SignaturePad, type SignaturePadHandle } from "@/components/ui/signature-pad";

const ATTESTATION = "I confirm that the information recorded in this QA response is accurate to the best of my knowledge.";

export function PreviewQASignatureControl() {
  const padRef = useRef<SignaturePadHandle>(null);
  const [method, setMethod] = useState<"drawn_signature" | "typed_acknowledgement">("drawn_signature");
  const [name, setName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [meaningful, setMeaningful] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedMethod, setSavedMethod] = useState<typeof method | null>(null);

  useEffect(() => () => { if (savedUrl) URL.revokeObjectURL(savedUrl); }, [savedUrl]);

  async function save() {
    let nextUrl: string | null = null;
    if (method === "drawn_signature") {
      const artifact = await padRef.current?.exportPng();
      if (!artifact) return;
      nextUrl = URL.createObjectURL(artifact.blob);
    }
    if (savedUrl) URL.revokeObjectURL(savedUrl);
    setSavedUrl(nextUrl);
    setSavedMethod(method);
  }

  if (savedMethod) return <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--success)] bg-[var(--success-light)] p-4">
    {savedMethod === "drawn_signature" && savedUrl ? <img src={savedUrl} alt={`Signature captured for ${name}`} className="max-h-52 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white object-contain" /> : null}
    <p className="flex items-center font-semibold"><CheckCircle2 className="mr-2 h-4 w-4" />Signed by {name}</p>
    <p className="text-xs text-[var(--text-secondary)]">{savedMethod === "drawn_signature" ? "Drawn signature" : "Typed acknowledgement"} · Preview only</p>
    <p className="text-sm">Attestation confirmed</p>
    <Button type="button" variant="outline" onClick={() => { setSavedMethod(null); setAcknowledged(false); }}>Replace signature</Button>
  </div>;

  return <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4">
    <div><label className="mb-1 block text-xs font-semibold" htmlFor="qa-preview-signer">Signer name</label><Input id="qa-preview-signer" value={name} placeholder="Signer name" onChange={(event) => setName(event.target.value)} /></div>
    <fieldset><legend className="mb-1 text-xs font-semibold">Signature method</legend><div className="grid gap-2 sm:grid-cols-2">{([ ["drawn_signature", "Draw signature"], ["typed_acknowledgement", "Typed acknowledgement"] ] as const).map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"><Radio name="qa-preview-signature-method" value={value} checked={method === value} onChange={() => setMethod(value)} />{label}</label>)}</div></fieldset>
    {method === "drawn_signature" ? <><SignaturePad ref={padRef} onValidityChange={setMeaningful} /><Button type="button" variant="outline" onClick={() => padRef.current?.clear()}>Clear</Button></> : <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]">Your typed acknowledgement will be recorded with your signer name and attestation.</p>}
    <label className="flex items-start gap-3 text-sm"><Checkbox checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>{ATTESTATION}</span></label>
    <Button type="button" disabled={!name.trim() || !acknowledged || (method === "drawn_signature" && !meaningful)} onClick={() => void save()}>{method === "drawn_signature" ? "Save signature" : "Sign acknowledgement"}</Button>
  </div>;
}
