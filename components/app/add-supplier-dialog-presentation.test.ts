import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialogSource = readFileSync("components/app/AddSupplierDialog.tsx", "utf8");
const suppliersSource = readFileSync(
  "app/app/(workspace)/company/suppliers/CompanySuppliersWorkspace.tsx",
  "utf8",
);
const materialsSource = readFileSync(
  "app/app/(workspace)/company/materials/CompanyMaterialsWorkspace.tsx",
  "utf8",
);
const materialsPageSource = readFileSync(
  "app/app/(workspace)/company/materials/page.tsx",
  "utf8",
);
const importUploadStageStart = materialsSource.indexOf("<MaterialImportUploadZone");
const importUploadStageEnd = materialsSource.indexOf("{error ? (", importUploadStageStart);
const importUploadStage = materialsSource.slice(importUploadStageStart, importUploadStageEnd);

describe("shared Add Supplier dialog", () => {
  it("retains the complete supplier creation fields and responsive shell", () => {
    for (const id of [
      "add-supplier-name",
      "add-supplier-legal-name",
      "add-supplier-contact-first-name",
      "add-supplier-contact-last-name",
      "add-supplier-email",
      "add-supplier-phone",
      "add-supplier-website",
      "add-supplier-address-line-1",
      "add-supplier-address-line-2",
      "add-supplier-city",
      "add-supplier-region",
      "add-supplier-postal-code",
      "add-supplier-country-code",
      "add-supplier-company-registration-number",
      "add-supplier-currency",
      "add-supplier-tax-number",
      "add-supplier-tax-number-type",
      "add-supplier-payment-terms-type",
      "add-supplier-payment-terms-day",
      "add-supplier-status",
    ]) {
      expect(dialogSource).toContain(`id="${id}"`);
    }
    expect(dialogSource).toContain("max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0");
    expect(dialogSource).toContain("grid grid-cols-1 gap-3 sm:grid-cols-2");
  });

  it("uses semantic dialog and form primitives", () => {
    expect(dialogSource).toContain("<DialogTitle");
    expect(dialogSource).toContain("<DialogDescription");
    expect(dialogSource).toContain("<form onSubmit={handleSubmit}>");
    expect(dialogSource).toContain('<Button type="submit"');
  });

  it("reuses the existing action and preserves duplicate confirmation", () => {
    expect(dialogSource).toContain("await saveSupplierAction({");
    expect(dialogSource).toContain("supplierId: null");
    expect(dialogSource).toContain("confirmPotentialDuplicates: duplicateWarnings.length > 0");
    expect(dialogSource).toContain("setDuplicateWarnings(result.warnings ?? [])");
    expect(dialogSource).toContain('duplicateWarnings.length > 0 ? "Save Anyway" : "Add Supplier"');
  });

  it("keeps failures open, returns the created row on success, and resets abandoned drafts", () => {
    expect(dialogSource).toMatch(/if \(!result\.ok \|\| !result\.supplier\) \{[\s\S]*?return;/);
    expect(dialogSource).toContain("onCreated(supplier)");
    expect(dialogSource).toContain("if (!nextOpen) resetDialog()");
    expect(dialogSource).toContain("onOpenChange(nextOpen)");
  });

  it("restores focus to a consumer-owned persistent trigger", () => {
    expect(dialogSource).toContain("returnFocusRef?: RefObject<HTMLElement | null>");
    expect(dialogSource).toContain("onCloseAutoFocus={(event) => {");
    expect(dialogSource).toContain("returnFocusRef.current.focus()");
  });
});

describe("shared Add Supplier consumers", () => {
  it("preserves the Suppliers page creation-to-detail transition", () => {
    expect(suppliersSource).toContain("<AddSupplierDialog");
    expect(suppliersSource).toContain("onCreated={handleSupplierCreated}");
    expect(suppliersSource).toContain("upsertSupplier(supplier)");
    expect(suppliersSource).toContain('setModalState({ type: "detail", supplierId: supplier.id })');
    expect(suppliersSource).toContain('setMessage("Supplier created.")');
    expect(suppliersSource).toContain("returnFocusRef={addSupplierTriggerRef}");
    expect(suppliersSource).toContain('const isEditMode = modalState?.type === "edit"');
  });

  it("keeps materials and supplier permissions independent", () => {
    expect(materialsPageSource).toContain('"materials.write"');
    expect(materialsPageSource).toContain('"suppliers.write"');
    expect(materialsPageSource).toContain("canCreateSupplier={canCreateSupplier}");
    expect(importUploadStage).toContain("{canCreateSupplier ? (");
  });

  it("renders the visible permission-gated action in the actual import upload Supplier field", () => {
    expect(importUploadStageStart).toBeGreaterThan(-1);
    expect(importUploadStageEnd).toBeGreaterThan(importUploadStageStart);
    expect(importUploadStage).toContain('<FieldLabel htmlFor="import-supplier">Supplier</FieldLabel>');
    expect(importUploadStage).toMatch(
      /\{canCreateSupplier \? \([\s\S]*?data-testid="material-import-add-supplier"[\s\S]*?\+ Add Supplier[\s\S]*?\) : null\}/,
    );
    expect(importUploadStage).toContain("onClick={() => setIsAddSupplierOpen(true)}");
    expect(importUploadStage).not.toContain('<option value="__add_supplier__">');
  });

  it("retains the native select and mounts the shared dialog as its sibling", () => {
    const importStart = materialsSource.indexOf("<Dialog open={isImportOpen}");
    const addSupplierStart = materialsSource.indexOf("<AddSupplierDialog", importStart);
    expect(materialsSource).toContain('id="import-supplier"');
    expect(materialsSource).toContain("suppliers={supplierOptions}");
    expect(materialsSource).toContain("onClick={() => setIsAddSupplierOpen(true)}");
    expect(addSupplierStart).toBeGreaterThan(importStart);
    expect(materialsSource.slice(importStart, addSupplierStart)).toContain("</Dialog>");
  });

  it("upserts and auto-selects the returned supplier without touching file state", () => {
    const handlerStart = materialsSource.indexOf("function handleImportSupplierCreated");
    const handlerEnd = materialsSource.indexOf("const selectedMaterialSummary", handlerStart);
    const handler = materialsSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain("current.filter((option) => option.id !== supplier.id)");
    expect(handler).toContain("setImportSupplierId(supplier.id)");
    expect(handler).toContain("setIsAddSupplierOpen(false)");
    expect(handler).toContain("router.refresh()");
    expect(handler).not.toContain("setImportFile");
    expect(handler).not.toContain("setIsImportOpen");
    expect(materialsSource).toContain("disabled={!importSupplierId || !importFile || isUploadingImport}");
  });
});
