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
import type { TakeoffPurchaseOrderPublishTarget } from "@/lib/commercial-items/takeoff-purchase-order-destination";
import { PURCHASE_ORDER_SOURCE_SECTIONS, type PurchaseOrderSourceSection } from "@/lib/purchase-orders/types";
import {
  loadTakeoffAddToPurchaseOrderContext,
  publishTakeoffMeasurementToPurchaseOrder,
  type TakeoffAddToPurchaseOrderContextResult,
} from "@/lib/takeoff/add-to-purchase-order-actions";
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
      <Input aria-label={label} value={value} readOnly={readOnly} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={`mt-2 h-9 rounded-[var(--radius-sm)] text-sm ${readOnly ? "border-transparent bg-[var(--surface-subtle)] shadow-none" : ""}`} />
    </label>
  );
}

export function TakeoffAddToPurchaseOrderPanel({ owner, measurementId, onClose, onSuccess }: {
  owner: TakeoffRouteOwner;
  measurementId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [context, setContext] = useState<TakeoffAddToPurchaseOrderContextResult | null>(null);
  const [description, setDescription] = useState("");
  const [rateDraft, setRateDraft] = useState("0.00");
  const [section, setSection] = useState<PurchaseOrderSourceSection | "">("");
  const [supplierId, setSupplierId] = useState("");
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [purchaseOrderTitle, setPurchaseOrderTitle] = useState("New Purchase Order");
  const [requestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    let active = true;
    void loadTakeoffAddToPurchaseOrderContext({ owner, measurementId }).then((result) => {
      if (!active) return;
      setContext(result);
      if (result.ok) {
        setDescription(result.measurement.description);
        setTargetMode(result.initialMode);
        setPurchaseOrderTitle(result.initialPurchaseOrderTitle);
      }
    });
    return () => { active = false; };
  }, [measurementId, owner]);

  const rate = normalizeCommercialRate(Number(rateDraft));
  const rateValid = Number.isFinite(rate) && rate >= 0;
  const total = context?.ok && rateValid ? normalizeCommercialMoney(context.measurement.quantity * rate) : 0;
  const selectedPurchaseOrder = context?.ok
    ? context.draftPurchaseOrders.find((option) => option.id === purchaseOrderId) ?? null
    : null;
  const destinationInvalid = targetMode === "new" ? !purchaseOrderTitle.trim() : !selectedPurchaseOrder;
  const invalid = !context?.ok || !description.trim() || !rateValid || !section || !supplierId || destinationInvalid;
  const title = context?.ok ? context.measurement.name : "Takeoff measurement";

  const target = useMemo<TakeoffPurchaseOrderPublishTarget | null>(() => {
    if (!section || !supplierId) return null;
    if (targetMode === "new") {
      return { mode: "new", supplierId, section, purchaseOrderTitle, requestKey };
    }
    if (!selectedPurchaseOrder) return null;
    return {
      mode: "existing",
      supplierId,
      section,
      purchaseOrderId: selectedPurchaseOrder.id,
      expectedUpdatedAt: selectedPurchaseOrder.updatedAt,
      requestKey,
    };
  }, [purchaseOrderTitle, requestKey, section, selectedPurchaseOrder, supplierId, targetMode]);

  async function publish() {
    if (invalid || !target) return;
    setIsPublishing(true);
    setError(null);
    const result = await publishTakeoffMeasurementToPurchaseOrder({ owner, measurementId, description, rate, target });
    setIsPublishing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess(result.message);
  }

  return (
    <WorksheetSidePanel ariaLabel="Add Takeoff measurement to Purchase Order" closeLabel="Close Add to Purchase Order" onClose={onClose} onKeyDown={(event) => {
      if (event.key === "Escape" && !isPublishing) { event.preventDefault(); onClose(); }
    }}>
      <WorksheetSidePanelHeader icon={<Link2 className="h-4 w-4" />} title="Add to Purchase Order" description={title} closeLabel="Close Add to Purchase Order" onClose={onClose} />
      <WorksheetSidePanelBody className="py-2.5">
        {!context ? <p className="px-1 py-3 text-sm text-[var(--text-muted)]">Loading measurement, suppliers, and Draft Purchase Orders…</p> : null}
        {context && !context.ok ? <OperationalAlert variant="error">{context.error}</OperationalAlert> : null}
        {context?.ok ? (
          <>
            <div data-testid="takeoff-add-to-purchase-order-fields" className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
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
              <label className="block space-y-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">
                Procurement section
                <select aria-label="Procurement section" value={section} disabled={isPublishing} onChange={(event) => setSection(event.target.value as PurchaseOrderSourceSection | "")} className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-normal text-[var(--text-primary)]">
                  <option value="">Select section</option>
                  {PURCHASE_ORDER_SOURCE_SECTIONS.map((option) => <option key={option} value={option}>{option === "Plant" ? "Plant / Equipment" : option}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">
                Supplier
                <select aria-label="Supplier" value={supplierId} disabled={isPublishing} onChange={(event) => setSupplierId(event.target.value)} className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-normal text-[var(--text-primary)]">
                  <option value="">Select supplier</option>
                  {context.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.label}</option>)}
                </select>
              </label>
            </section>
            <section className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Purchase Order destination</h3>
              <label className="flex min-h-10 items-center gap-2.5 text-[13px] text-[var(--text-primary)]"><input type="radio" className="h-4 w-4 accent-[var(--brand-blue)]" checked={targetMode === "new"} disabled={isPublishing} onChange={() => setTargetMode("new")} />Create new Draft PO</label>
              {targetMode === "new" ? <Input aria-label="Purchase Order title" value={purchaseOrderTitle} disabled={isPublishing} onChange={(event) => setPurchaseOrderTitle(event.target.value)} /> : null}
              <label className="flex min-h-10 items-center gap-2.5 text-[13px] text-[var(--text-primary)] has-[:disabled]:text-[var(--text-muted)]"><input type="radio" className="h-4 w-4 accent-[var(--brand-blue)]" checked={targetMode === "existing"} disabled={isPublishing || context.draftPurchaseOrders.length === 0} onChange={() => setTargetMode("existing")} />Append existing Draft PO</label>
              {targetMode === "existing" ? (
                <select aria-label="Draft Purchase Orders" value={purchaseOrderId} disabled={isPublishing} onChange={(event) => {
                  const nextId = event.target.value;
                  setPurchaseOrderId(nextId);
                  const next = context.draftPurchaseOrders.find((option) => option.id === nextId);
                  if (next?.supplierId) setSupplierId(next.supplierId);
                }} className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]">
                  <option value="">Select draft Purchase Order</option>
                  {context.draftPurchaseOrders.map((option) => <option key={option.id} value={option.id}>{option.purchaseOrderNumber} · {option.purchaseOrderTitle}</option>)}
                </select>
              ) : null}
            </section>
          </>
        ) : null}
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPublishing}>Cancel</Button>
        <Button type="button" data-testid="takeoff-add-to-purchase-order-submit" onClick={() => void publish()} disabled={invalid || isPublishing}>{isPublishing ? "Adding…" : "Add to Purchase Order"}</Button>
      </WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}
