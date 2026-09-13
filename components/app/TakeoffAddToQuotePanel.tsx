"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { QuoteDestinationSection } from "@/components/app/QuoteDestinationSection";
import {
  WorksheetSidePanel,
  WorksheetSidePanelBody,
  WorksheetSidePanelFooter,
  WorksheetSidePanelHeader,
} from "@/components/app/WorksheetSidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCommercialMoney, normalizeCommercialRate } from "@/lib/commercial-items/precision";
import type { QuotePublishTarget } from "@/lib/commercial-items/quote-destination-adapter";
import {
  loadTakeoffAddToQuoteContext,
  publishTakeoffMeasurementToQuotes,
  type TakeoffAddToQuoteContextResult,
} from "@/lib/takeoff/add-to-quote-actions";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

function ValueField({ label, value, readOnly = false, onChange }: {
  label: string;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 px-3 py-3">
      <span className="block text-[13px] font-semibold text-[var(--text-secondary)]">{label}</span>
      <Input
        aria-label={label}
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={`mt-2 h-9 rounded-[var(--radius-sm)] text-sm ${readOnly ? "border-transparent bg-[var(--surface-subtle)] shadow-none" : ""}`}
      />
    </label>
  );
}

export function TakeoffAddToQuotePanel({ owner, measurementId, onClose, onSuccess }: {
  owner: TakeoffRouteOwner;
  measurementId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [context, setContext] = useState<TakeoffAddToQuoteContextResult | null>(null);
  const [description, setDescription] = useState("");
  const [rateDraft, setRateDraft] = useState("0.00");
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    let active = true;
    void loadTakeoffAddToQuoteContext({ owner, measurementId }).then((result) => {
      if (!active) return;
      setContext(result);
      if (result.ok) {
        setDescription(result.measurement.description);
        setTargetMode(result.initialMode);
        setTargetIds(result.initialQuoteIds);
      }
    });
    return () => { active = false; };
  }, [measurementId, owner]);

  const rate = normalizeCommercialRate(Number(rateDraft));
  const rateValid = Number.isFinite(rate) && rate >= 0;
  const total = context?.ok && rateValid
    ? normalizeCommercialMoney(context.measurement.quantity * rate)
    : 0;
  const destinationInvalid = targetMode === "existing" && targetIds.length === 0;
  const title = context?.ok ? context.measurement.name : "Takeoff measurement";
  const target = useMemo<QuotePublishTarget>(() => targetMode === "new"
    ? { mode: "new" }
    : { mode: "existing", quoteIds: targetIds }, [targetIds, targetMode]);

  async function publish() {
    if (!context?.ok || !description.trim() || !rateValid || destinationInvalid) return;
    setIsPublishing(true);
    setError(null);
    const result = await publishTakeoffMeasurementToQuotes({ owner, measurementId, description, rate, target });
    setIsPublishing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess(result.message);
  }

  return (
    <WorksheetSidePanel
      ariaLabel="Add Takeoff measurement to Quote"
      closeLabel="Close Add to Quote"
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPublishing) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <WorksheetSidePanelHeader icon={<Link2 className="h-4 w-4" />} title="Add to Quote" description={title} closeLabel="Close Add to Quote" onClose={onClose} />
      <WorksheetSidePanelBody className="py-2.5">
        {!context ? <p className="px-1 py-3 text-sm text-[var(--text-muted)]">Loading measurement and Draft Quotes…</p> : null}
        {context && !context.ok ? <OperationalAlert variant="error">{context.error}</OperationalAlert> : null}
        {context?.ok ? (
          <>
            <div data-testid="takeoff-add-to-quote-fields" className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
              <div className="border-b border-[var(--border-subtle)]"><ValueField label="Description" value={description} onChange={setDescription} /></div>
              <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
                <ValueField label="Qty." value={String(context.measurement.quantity)} readOnly />
                <ValueField label="Unit" value={context.measurement.unit} readOnly />
              </div>
              <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)]">
                <ValueField label="Rate" value={rateDraft} onChange={setRateDraft} />
                <ValueField label="Total" value={total.toFixed(2)} readOnly />
              </div>
            </div>
            {!rateValid ? <p className="mt-2 px-1 text-xs text-[var(--error)]">Enter a non-negative Rate.</p> : null}
            {error ? <OperationalAlert variant="error" className="mt-3">{error}</OperationalAlert> : null}
            <section className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Quote destination</h3>
              <QuoteDestinationSection
                options={context.quoteOptions}
                mode={targetMode}
                selectedIds={targetIds}
                disabled={isPublishing}
                onModeChange={setTargetMode}
                onSelectedIdsChange={setTargetIds}
              />
            </section>
          </>
        ) : null}
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPublishing}>Cancel</Button>
        <Button type="button" data-testid="takeoff-add-to-quote-submit" onClick={() => void publish()} disabled={!context?.ok || isPublishing || !description.trim() || !rateValid || destinationInvalid}>
          {isPublishing ? "Adding…" : targetMode === "existing" && targetIds.length > 1 ? "Add to Quotes" : "Add to Quote"}
        </Button>
      </WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}
