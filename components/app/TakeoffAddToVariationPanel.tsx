"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import {
  WorksheetSidePanel,
  WorksheetSidePanelBody,
  WorksheetSidePanelFooter,
  WorksheetSidePanelHeader,
} from "@/components/app/WorksheetSidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCommercialMoney, normalizeCommercialRate } from "@/lib/commercial-items/precision";
import type { TakeoffVariationPublishTarget } from "@/lib/commercial-items/takeoff-variation-destination";
import { VARIATION_COST_SECTIONS, type VariationCostSection } from "@/lib/commercial-items/variation-sections";
import {
  loadTakeoffAddToVariationContext,
  publishTakeoffMeasurementToVariation,
  type TakeoffAddToVariationContextResult,
} from "@/lib/takeoff/add-to-variation-actions";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

function ValueField({ label, value, readOnly = false, onChange }: {
  label: string;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return <label className="block min-w-0 px-3 py-3"><span className="block text-[13px] font-semibold text-[var(--text-secondary)]">{label}</span><Input aria-label={label} value={value} readOnly={readOnly} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={`mt-2 h-9 rounded-[var(--radius-sm)] text-sm ${readOnly ? "border-transparent bg-[var(--surface-subtle)] shadow-none" : ""}`} /></label>;
}

export function TakeoffAddToVariationPanel({ owner, measurementId, onClose, onSuccess }: {
  owner: TakeoffRouteOwner;
  measurementId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [context, setContext] = useState<TakeoffAddToVariationContextResult | null>(null);
  const [description, setDescription] = useState("");
  const [rateDraft, setRateDraft] = useState("0.00");
  const [section, setSection] = useState<VariationCostSection | "">("");
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [variationId, setVariationId] = useState("");
  const [variationTitle, setVariationTitle] = useState("");
  const [requestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    let active = true;
    void loadTakeoffAddToVariationContext({ owner, measurementId }).then((result) => {
      if (!active) return;
      setContext(result);
      if (result.ok) {
        setDescription(result.measurement.description);
        setTargetMode(result.initialMode);
        setVariationId(result.initialVariationId);
        setVariationTitle(result.initialVariationTitle);
      }
    });
    return () => { active = false; };
  }, [measurementId, owner]);

  const rate = normalizeCommercialRate(Number(rateDraft));
  const rateValid = Number.isFinite(rate) && rate >= 0;
  const total = context?.ok && rateValid ? normalizeCommercialMoney(context.measurement.quantity * rate) : 0;
  const selectedVariation = context?.ok ? context.variations.find((variation) => variation.id === variationId) ?? null : null;
  const destinationInvalid = targetMode === "new" ? !variationTitle.trim() : !selectedVariation;
  const invalid = !context?.ok || !description.trim() || !rateValid || !section || destinationInvalid;
  const title = context?.ok ? context.measurement.name : "Takeoff measurement";

  const target = useMemo<TakeoffVariationPublishTarget | null>(() => {
    if (!section) return null;
    if (targetMode === "new") return { mode: "new", section, variationTitle, requestKey };
    if (!selectedVariation) return null;
    return { mode: "existing", section, variationId: selectedVariation.id, expectedUpdatedAt: selectedVariation.updatedAt, requestKey };
  }, [requestKey, section, selectedVariation, targetMode, variationTitle]);

  async function publish() {
    if (invalid || !target) return;
    setIsPublishing(true);
    setError(null);
    const result = await publishTakeoffMeasurementToVariation({ owner, measurementId, description, rate, target });
    setIsPublishing(false);
    if (!result.ok) { setError(result.error); return; }
    onSuccess(result.message);
  }

  return (
    <WorksheetSidePanel ariaLabel="Add Takeoff measurement to Variation" closeLabel="Close Add to Variation" onClose={onClose} onKeyDown={(event) => { if (event.key === "Escape" && !isPublishing) { event.preventDefault(); onClose(); } }}>
      <WorksheetSidePanelHeader icon={<Link2 className="h-4 w-4" />} title="Add to Variation" description={title} closeLabel="Close Add to Variation" onClose={onClose} />
      <WorksheetSidePanelBody className="py-2.5">
        {!context ? <p className="px-1 py-3 text-sm text-[var(--text-muted)]">Loading measurement and eligible Variations…</p> : null}
        {context && !context.ok ? <OperationalAlert variant="error">{context.error}</OperationalAlert> : null}
        {context?.ok ? <>
          <div data-testid="takeoff-add-to-variation-fields" className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border-subtle)]"><ValueField label="Description" value={description} onChange={setDescription} /></div>
            <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]"><ValueField label="Qty." value={String(context.measurement.quantity)} readOnly /><ValueField label="Unit" value={context.measurement.unit} readOnly /></div>
            <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)]"><ValueField label="Rate" value={rateDraft} onChange={setRateDraft} /><ValueField label="Total" value={total.toFixed(2)} readOnly /></div>
          </div>
          {!rateValid ? <p className="mt-2 px-1 text-xs text-[var(--error)]">Enter a non-negative Rate.</p> : null}
          {error ? <OperationalAlert variant="error" className="mt-3">{error}</OperationalAlert> : null}
          <section className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3">
            <label className="block space-y-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">Variation section<select aria-label="Variation section" value={section} disabled={isPublishing} onChange={(event) => setSection(event.target.value as VariationCostSection | "")} className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-normal"><option value="">Select section</option>{VARIATION_COST_SECTIONS.map((option) => <option key={option} value={option}>{option === "Plant" ? "Plant / Equipment" : option}</option>)}</select></label>
          </section>
          <section className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Variation destination</h3>
            <label className="flex min-h-10 items-center gap-2.5 text-[13px]"><input type="radio" className="h-4 w-4 accent-[var(--brand-blue)]" checked={targetMode === "new"} disabled={isPublishing} onChange={() => setTargetMode("new")} />Create new Draft Variation</label>
            {targetMode === "new" ? <Input aria-label="Variation title" value={variationTitle} disabled={isPublishing} onChange={(event) => setVariationTitle(event.target.value)} /> : null}
            <label className="flex min-h-10 items-center gap-2.5 text-[13px] has-[:disabled]:text-[var(--text-muted)]"><input type="radio" className="h-4 w-4 accent-[var(--brand-blue)]" checked={targetMode === "existing"} disabled={isPublishing || context.variations.length === 0} onChange={() => setTargetMode("existing")} />Append existing Variation</label>
            {targetMode === "existing" ? <select aria-label="Existing Variations" value={variationId} disabled={isPublishing} onChange={(event) => setVariationId(event.target.value)} className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"><option value="">Select Variation</option>{context.variations.map((variation) => <option key={variation.id} value={variation.id}>{variation.variationNumber} · {variation.variationTitle} · {variation.status}</option>)}</select> : null}
          </section>
        </> : null}
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter><Button type="button" variant="secondary" onClick={onClose} disabled={isPublishing}>Cancel</Button><Button type="button" data-testid="takeoff-add-to-variation-submit" onClick={() => void publish()} disabled={invalid || isPublishing}>{isPublishing ? "Adding…" : "Add to Variation"}</Button></WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}
