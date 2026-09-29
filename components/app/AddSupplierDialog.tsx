"use client";

import { useState } from "react";
import type { FormEvent, ReactNode, RefObject } from "react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveSupplierAction } from "@/app/app/(workspace)/company/suppliers/actions";
import { normalizeSupplierWebsite, type SupplierPaymentTermsType } from "@tradesstack/suppliers";
import type { OrganizationSupplierRow, SupplierDuplicateWarning } from "@/lib/suppliers";

type AddSupplierDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (supplier: OrganizationSupplierRow) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

type SupplierFormState = {
  name: string;
  legalName: string;
  primaryContactFirstName: string;
  primaryContactLastName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  website: string;
  legacyAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  companyRegistrationNumber: string;
  taxNumber: string;
  taxNumberType: string;
  defaultCurrencyCode: string;
  legacyPaymentTerms: string;
  paymentTermsType: SupplierPaymentTermsType | "";
  paymentTermsDay: string;
  isActive: boolean;
};

const EMPTY_FORM: SupplierFormState = {
  name: "",
  legalName: "",
  primaryContactFirstName: "",
  primaryContactLastName: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  website: "",
  legacyAddress: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "",
  companyRegistrationNumber: "",
  taxNumber: "",
  taxNumberType: "",
  defaultCurrencyCode: "",
  legacyPaymentTerms: "",
  paymentTermsType: "",
  paymentTermsDay: "",
  isActive: true,
};

const FIELD_SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function FieldLabel({ htmlFor, children, required = false }: { htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
      {children}
      {required ? <span className="ml-1 text-[var(--error)]">*</span> : null}
    </label>
  );
}

function FieldError({ message }: { message?: string | null }) {
  return message ? <p className="mt-1.5 text-xs text-[var(--error)]">{message}</p> : null;
}

export function AddSupplierDialog({ open, onOpenChange, onCreated, returnFocusRef }: AddSupplierDialogProps) {
  const [formState, setFormState] = useState<SupplierFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<SupplierDuplicateWarning[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function resetDialog() {
    setFormState(EMPTY_FORM);
    setDuplicateWarnings([]);
    setFieldErrors({});
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetDialog();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setFieldErrors({});
    setError(null);

    try {
      const result = await saveSupplierAction({
        supplierId: null,
        confirmPotentialDuplicates: duplicateWarnings.length > 0,
        input: {
          name: formState.name,
          legalName: formState.legalName,
          primaryContactFirstName: formState.primaryContactFirstName,
          primaryContactLastName: formState.primaryContactLastName,
          primaryContactEmail: formState.primaryContactEmail,
          primaryContactPhone: formState.primaryContactPhone,
          website: formState.website,
          address: formState.legacyAddress,
          addressLine1: formState.addressLine1,
          addressLine2: formState.addressLine2,
          city: formState.city,
          region: formState.region,
          postalCode: formState.postalCode,
          countryCode: formState.countryCode,
          companyRegistrationNumber: formState.companyRegistrationNumber,
          taxNumber: formState.taxNumber,
          taxNumberType: formState.taxNumberType,
          defaultCurrencyCode: formState.defaultCurrencyCode,
          defaultPaymentTerms: formState.legacyPaymentTerms,
          paymentTermsType: formState.paymentTermsType || null,
          paymentTermsDay: formState.paymentTermsDay ? Number(formState.paymentTermsDay) : null,
          isActive: formState.isActive,
        },
      });

      if (!result.ok || !result.supplier) {
        setFieldErrors(result.fieldErrors ?? {});
        setDuplicateWarnings(result.warnings ?? []);
        setError(result.error ?? "Unable to save supplier.");
        return;
      }

      const supplier = result.supplier;
      resetDialog();
      onCreated(supplier);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save supplier.");
    } finally {
      setIsSaving(false);
    }
  }

  const update = <Key extends keyof SupplierFormState>(key: Key, value: SupplierFormState[Key]) =>
    setFormState((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0"
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <form onSubmit={handleSubmit}>
          <div className="px-7 pb-6 pt-7">
            <DialogTitle className="text-2xl tracking-[-0.02em]">Add Supplier</DialogTitle>
            <DialogDescription className="mt-2">
              Add a supplier for purchasing, materials, and accounting workflows.
            </DialogDescription>
          </div>

          <div className="space-y-3.5 px-7 pb-4">
            {error ? <OperationalAlert variant="error" role="alert">{error}</OperationalAlert> : null}
            {duplicateWarnings.length > 0 ? (
              <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--warning)]">Possible duplicate supplier</p>
                <ul className="space-y-1 text-sm text-[var(--warning)]">
                  {duplicateWarnings.map((warning) => <li key={warning.id}>{warning.message}</li>)}
                </ul>
              </div>
            ) : null}

            <div>
              <FieldLabel htmlFor="add-supplier-name" required>Supplier Name</FieldLabel>
              <Input id="add-supplier-name" value={formState.name} onChange={(event) => update("name", event.target.value)} placeholder="Acme Building Supplies" disabled={isSaving} />
              <FieldError message={fieldErrors.name} />
            </div>

            <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Supplier details</p>
              <div>
                <FieldLabel htmlFor="add-supplier-legal-name">Legal Name</FieldLabel>
                <Input id="add-supplier-legal-name" value={formState.legalName} onChange={(event) => update("legalName", event.target.value)} placeholder="Acme Building Supplies Limited" disabled={isSaving} />
                <FieldError message={fieldErrors.legalName} />
              </div>
            </section>

            <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Primary contact</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><FieldLabel htmlFor="add-supplier-contact-first-name">First Name</FieldLabel><Input id="add-supplier-contact-first-name" value={formState.primaryContactFirstName} onChange={(event) => update("primaryContactFirstName", event.target.value)} placeholder="Jane" disabled={isSaving} /><FieldError message={fieldErrors.primaryContactFirstName} /></div>
                <div><FieldLabel htmlFor="add-supplier-contact-last-name">Last Name</FieldLabel><Input id="add-supplier-contact-last-name" value={formState.primaryContactLastName} onChange={(event) => update("primaryContactLastName", event.target.value)} placeholder="Smith" disabled={isSaving} /><FieldError message={fieldErrors.primaryContactLastName} /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><FieldLabel htmlFor="add-supplier-email">Email</FieldLabel><Input id="add-supplier-email" type="email" value={formState.primaryContactEmail} onChange={(event) => update("primaryContactEmail", event.target.value)} placeholder="accounts@supplier.com" disabled={isSaving} /><FieldError message={fieldErrors.primaryContactEmail} /></div>
                <div><FieldLabel htmlFor="add-supplier-phone">Phone</FieldLabel><Input id="add-supplier-phone" value={formState.primaryContactPhone} onChange={(event) => update("primaryContactPhone", event.target.value)} placeholder="+64 21 123 4567" disabled={isSaving} /><FieldError message={fieldErrors.primaryContactPhone} /></div>
              </div>
              <div><FieldLabel htmlFor="add-supplier-website">Website</FieldLabel><Input id="add-supplier-website" value={formState.website} onChange={(event) => update("website", event.target.value)} onBlur={() => update("website", normalizeSupplierWebsite(formState.website) ?? "")} placeholder="www.supplier.co.nz" disabled={isSaving} /><FieldError message={fieldErrors.website} /></div>
            </section>

            <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Address</p>
              <div><FieldLabel htmlFor="add-supplier-address-line-1">Address Line 1</FieldLabel><Input id="add-supplier-address-line-1" value={formState.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} placeholder="11c Airbourne Road" disabled={isSaving} /><FieldError message={fieldErrors.addressLine1} /></div>
              <div><FieldLabel htmlFor="add-supplier-address-line-2">Address Line 2</FieldLabel><Input id="add-supplier-address-line-2" value={formState.addressLine2} onChange={(event) => update("addressLine2", event.target.value)} placeholder="Unit 2" disabled={isSaving} /><FieldError message={fieldErrors.addressLine2} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><FieldLabel htmlFor="add-supplier-city">City</FieldLabel><Input id="add-supplier-city" value={formState.city} onChange={(event) => update("city", event.target.value)} placeholder="Auckland" disabled={isSaving} /><FieldError message={fieldErrors.city} /></div>
                <div><FieldLabel htmlFor="add-supplier-region">Region / State</FieldLabel><Input id="add-supplier-region" value={formState.region} onChange={(event) => update("region", event.target.value)} placeholder="Auckland" disabled={isSaving} /><FieldError message={fieldErrors.region} /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><FieldLabel htmlFor="add-supplier-postal-code">Postcode</FieldLabel><Input id="add-supplier-postal-code" value={formState.postalCode} onChange={(event) => update("postalCode", event.target.value)} placeholder="1060" disabled={isSaving} /><FieldError message={fieldErrors.postalCode} /></div>
                <div><FieldLabel htmlFor="add-supplier-country-code">Country</FieldLabel><Input id="add-supplier-country-code" value={formState.countryCode} onChange={(event) => update("countryCode", event.target.value)} placeholder="NZ" disabled={isSaving} /><FieldError message={fieldErrors.countryCode} /></div>
              </div>
            </section>

            <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Business and tax</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><FieldLabel htmlFor="add-supplier-company-registration-number">Company Registration Number</FieldLabel><Input id="add-supplier-company-registration-number" value={formState.companyRegistrationNumber} onChange={(event) => update("companyRegistrationNumber", event.target.value)} placeholder="1234567" disabled={isSaving} /><FieldError message={fieldErrors.companyRegistrationNumber} /></div>
                <div><FieldLabel htmlFor="add-supplier-currency">Currency</FieldLabel><Input id="add-supplier-currency" value={formState.defaultCurrencyCode} onChange={(event) => update("defaultCurrencyCode", event.target.value)} placeholder="NZD" disabled={isSaving} /><FieldError message={fieldErrors.defaultCurrencyCode} /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><FieldLabel htmlFor="add-supplier-tax-number">Tax Number</FieldLabel><Input id="add-supplier-tax-number" value={formState.taxNumber} onChange={(event) => update("taxNumber", event.target.value)} placeholder="GST123456" disabled={isSaving} /><FieldError message={fieldErrors.taxNumber} /></div>
                <div><FieldLabel htmlFor="add-supplier-tax-number-type">Tax Number Type</FieldLabel><Input id="add-supplier-tax-number-type" value={formState.taxNumberType} onChange={(event) => update("taxNumberType", event.target.value)} placeholder="GST" disabled={isSaving} /><FieldError message={fieldErrors.taxNumberType} /></div>
              </div>
            </section>

            <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Payment terms</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div>
                  <FieldLabel htmlFor="add-supplier-payment-terms-type">Structured Terms</FieldLabel>
                  <select id="add-supplier-payment-terms-type" value={formState.paymentTermsType} onChange={(event) => update("paymentTermsType", event.target.value as SupplierFormState["paymentTermsType"])} disabled={isSaving} className={FIELD_SELECT_CLASS}>
                    <option value="">No structured rule</option><option value="days_after_bill_date">Days after bill date</option><option value="days_after_bill_month">Days after bill month</option><option value="of_current_month">Of current month</option><option value="of_following_month">Of following month</option>
                  </select>
                  <FieldError message={fieldErrors.paymentTermsType} />
                </div>
                <div><FieldLabel htmlFor="add-supplier-payment-terms-day">Day</FieldLabel><Input id="add-supplier-payment-terms-day" inputMode="numeric" value={formState.paymentTermsDay} onChange={(event) => update("paymentTermsDay", event.target.value)} placeholder="20" disabled={isSaving} /><FieldError message={fieldErrors.paymentTermsDay} /></div>
              </div>
            </section>

            <div>
              <FieldLabel htmlFor="add-supplier-status">Status</FieldLabel>
              <select id="add-supplier-status" value={formState.isActive ? "active" : "inactive"} onChange={(event) => update("isActive", event.target.value === "active")} disabled={isSaving} className={FIELD_SELECT_CLASS}><option value="active">Active</option><option value="inactive">Inactive</option></select>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-7 pb-7 pt-5">
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : duplicateWarnings.length > 0 ? "Save Anyway" : "Add Supplier"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
