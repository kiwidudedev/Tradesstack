import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterMaterialImportSuppliers,
  materialImportUploadStatus,
  moveMaterialImportSupplierActiveIndex,
  validateMaterialImportUploadFile,
} from "./material-import-upload";

const workspaceSource = readFileSync(
  "app/app/(workspace)/company/materials/CompanyMaterialsWorkspace.tsx",
  "utf8",
);
const processingStateStart = workspaceSource.indexOf("function MaterialImportProgress(");
const processingStateSource = workspaceSource.slice(
  processingStateStart,
  workspaceSource.indexOf("function MaterialImportFailure(", processingStateStart),
);
const importDialogStart = workspaceSource.indexOf("<Dialog open={isImportOpen}");
const importDialogSource = workspaceSource.slice(
  importDialogStart,
  workspaceSource.indexOf("<AddSupplierDialog", importDialogStart),
);
const reviewPanelSource = readFileSync(
  "app/app/(workspace)/company/materials/MaterialImportReviewPanel.tsx",
  "utf8",
);
const uploadStageStart = importDialogSource.indexOf("<MaterialImportUploadZone");
const uploadStageEnd = importDialogSource.indexOf("{error ? (", uploadStageStart);
const uploadStageSource = importDialogSource.slice(uploadStageStart, uploadStageEnd);
const dialogSource = readFileSync("components/ui/dialog.tsx", "utf8");
const invoiceDialogSource = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/NewSupplierInvoiceDialog.tsx",
  "utf8",
);
const invoiceUploadPanelSource = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/NewSupplierInvoiceBatchUploadPanel.tsx",
  "utf8",
);
const invoiceUploaderStyles = readFileSync(
  "components/app/SupplierInvoiceDocumentUploader.module.css",
  "utf8",
);

function uploadFile(
  name: string,
  type: string,
  size = 1024,
): Pick<File, "name" | "size" | "type"> {
  return { name, type, size };
}

describe("Material import upload validation", () => {
  it.each([
    ["prices.csv", "text/csv"],
    ["prices.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["prices.xlsm", "application/vnd.ms-excel.sheet.macroenabled.12"],
    ["prices.pdf", "application/pdf"],
    ["prices.jpg", "image/jpeg"],
    ["prices.jpeg", "image/jpeg"],
    ["prices.png", "image/png"],
    ["prices.webp", "image/webp"],
    ["prices.heic", "image/heic"],
    ["prices.heif", "image/heif"],
  ])("accepts supported Material file %s", (name, type) => {
    expect(validateMaterialImportUploadFile(uploadFile(name, type))).toBeNull();
  });

  it("rejects unsupported file types", () => {
    expect(
      validateMaterialImportUploadFile(uploadFile("prices.gif", "image/gif")),
    ).toContain("Unsupported file type");
  });

  it("rejects files larger than 25 MB", () => {
    expect(
      validateMaterialImportUploadFile(
        uploadFile("prices.csv", "text/csv", 25 * 1024 * 1024 + 1),
      ),
    ).toBe("File is too large. Maximum size is 25 MB.");
  });

  it("rejects empty files", () => {
    expect(
      validateMaterialImportUploadFile(uploadFile("prices.csv", "text/csv", 0)),
    ).toBe("Empty files cannot be uploaded.");
  });
});

describe("Material import upload readiness", () => {
  it("requires both supplier and file", () => {
    expect(
      materialImportUploadStatus({
        supplierId: "",
        fileName: null,
        isUploading: false,
      }),
    ).toBe("Select a supplier and file to continue");
    expect(
      materialImportUploadStatus({
        supplierId: "supplier-1",
        fileName: null,
        isUploading: false,
      }),
    ).toBe("Select a file to continue");
    expect(
      materialImportUploadStatus({
        supplierId: "",
        fileName: "prices.csv",
        isUploading: false,
      }),
    ).toContain("Select a supplier");
    expect(
      materialImportUploadStatus({
        supplierId: "supplier-1",
        fileName: "prices.csv",
        isUploading: false,
      }),
    ).toBe("Ready");
  });

  it("announces the loading state", () => {
    expect(
      materialImportUploadStatus({
        supplierId: "supplier-1",
        fileName: "prices.csv",
        isUploading: true,
      }),
    ).toBe("Creating import batch…");
  });
});

describe("Material import Supplier search", () => {
  const suppliers = [
    { id: "bunnings", company_name: "Bunnings", name: "Bunnings Warehouse", primary_contact_email: null, email: null } as never,
    { id: "mitre-10", company_name: "Mitre 10 Mega", name: "Mitre 10", primary_contact_email: "orders@mitre10.test", email: null } as never,
    { id: "carters", company_name: "Carters", name: "Carters", primary_contact_email: null, email: null } as never,
  ];

  it("filters loaded Suppliers immediately by name or email", () => {
    expect(filterMaterialImportSuppliers(suppliers, "mit").map((supplier) => supplier.id)).toEqual(["mitre-10"]);
    expect(filterMaterialImportSuppliers(suppliers, "orders@").map((supplier) => supplier.id)).toEqual(["mitre-10"]);
    expect(filterMaterialImportSuppliers(suppliers, "nonsense")).toEqual([]);
  });

  it("wraps Supplier keyboard navigation", () => {
    expect(moveMaterialImportSupplierActiveIndex(0, 3, "next")).toBe(1);
    expect(moveMaterialImportSupplierActiveIndex(2, 3, "next")).toBe(0);
    expect(moveMaterialImportSupplierActiveIndex(0, 3, "previous")).toBe(2);
  });
});

describe("Material import upload presentation contract", () => {
  it("opens an accessible Radix dialog and provides Cancel", () => {
    expect(workspaceSource).toContain("<Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>");
    expect(workspaceSource).toContain("setIsImportOpen(true);");
    expect(workspaceSource).toContain("<DialogTitle");
    expect(workspaceSource).toContain("Import Supplier Price List");
    expect(workspaceSource).toMatch(/<DialogClose asChild>[\s\S]*?Cancel[\s\S]*?<\/DialogClose>/);
    expect(dialogSource).toContain("const Dialog = DialogPrimitive.Root");
    expect(dialogSource).toContain("const DialogClose = DialogPrimitive.Close");
  });

  it("preserves supplier selection and single-file feedback", () => {
    expect(workspaceSource).toContain('id="import-supplier"');
    expect(workspaceSource).toContain("selectedSupplierId={importSupplierId}");
    expect(workspaceSource).toContain("setImportSupplierId(supplierId)");
    expect(workspaceSource).toContain('type="file"');
    expect(workspaceSource).not.toContain('id="import-file"');
    expect(workspaceSource).toContain("Selected: {file.name}");
    expect(workspaceSource).toContain('{file ? "Replace File" : "Choose File"}');
  });

  it("supports drop, keyboard activation, and visible focus", () => {
    expect(workspaceSource).toContain("onDrop={handleDrop}");
    expect(workspaceSource).toContain("event.dataTransfer.files?.[0]");
    expect(workspaceSource).toContain('event.key === "Enter" || event.key === " "');
    expect(workspaceSource).toContain("focus-visible:ring-2");
    expect(workspaceSource).toContain('aria-label="Choose a supplier price list"');
  });

  it("disables submission until ready and while loading", () => {
    expect(workspaceSource).toContain(
      "disabled={!importSupplierId || !importFile || isUploadingImport}",
    );
    expect(workspaceSource).toContain(
      '{isUploadingImport ? "Importing..." : "Import"}',
    );
    expect(workspaceSource).toMatch(
      /async function handleStartImport\(\) \{\s+if \(isUploadingImport\) \{\s+return;/,
    );
    expect(workspaceSource).toContain("setIsUploadingImport(true)");
    expect(workspaceSource).toContain("setIsUploadingImport(false)");
  });

  it("renders local errors and transitions successful uploads into the existing review stage", () => {
    expect(workspaceSource).toMatch(
      /<OperationalAlert variant="error" role="alert"[\s\S]*?\{error\}/,
    );
    expect(workspaceSource).toContain("setReviewBatch(payload.batch)");
    expect(workspaceSource).toContain("<MaterialImportReviewPanel");
    expect(workspaceSource).toContain('const isImportReview = Boolean(reviewBatch');
  });

  it("keeps the upload shell responsive with fixed header/footer and internal scrolling", () => {
    const shellClasses =
      "flex h-[92vh] max-h-[92vh] w-[min(1480px,96vw)] max-w-none flex-col overflow-hidden p-0";
    const headerClasses =
      "shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5";
    const bodyClasses = "min-h-0 flex-1 overflow-y-auto";
    const footerClasses =
      "shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4";

    for (const classes of [shellClasses, headerClasses, bodyClasses, footerClasses]) {
      expect(workspaceSource).toContain(classes);
      expect(invoiceDialogSource).toContain(classes);
    }
    expect(workspaceSource).toContain('align="top"');
  });

  it("uses the reference body rhythm and upload-zone dimensions", () => {
    const uploadBodyClasses =
      "mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1";

    expect(workspaceSource).toContain(uploadBodyClasses);
    expect(invoiceUploadPanelSource).toContain(uploadBodyClasses);
    expect(workspaceSource).toContain('"min-h-[260px] flex-none');
    expect(invoiceUploadPanelSource).toContain('"min-h-[260px] flex-none"');
    expect(workspaceSource).toContain("uploaderStyles.dropZone");
    expect(workspaceSource).toContain("uploaderStyles.active");
    expect(workspaceSource).toContain("uploaderStyles.disabled");
    expect(workspaceSource).toContain("uploaderStyles.icon");
    expect(invoiceUploaderStyles).toContain("border: 2px dashed rgba(241, 90, 41, 0.7);");
    expect(invoiceUploaderStyles).toContain("background: #fffaf7;");
    expect(invoiceUploaderStyles).toContain("border-radius: 16px;");
  });

  it("keeps the supplier field full-width below the upload zone", () => {
    expect(workspaceSource).toContain('id="import-supplier"');
    expect(workspaceSource).toContain('placeholder="Search suppliers..."');
    expect(workspaceSource).toContain('data-testid="material-import-supplier-combobox"');
    expect(workspaceSource).toContain('role="listbox"');
    expect(workspaceSource).toContain("No suppliers found");
    expect(workspaceSource).not.toContain('max-w-2xl');
    expect(workspaceSource.indexOf('id="import-supplier"')).toBeGreaterThan(
      workspaceSource.indexOf("<MaterialImportUploadZone"),
    );
    expect(uploadStageSource).not.toContain("Upload a supplier price list for extraction and review.");
    expect(importDialogSource).not.toContain("Upload a supplier file. TradesStack will extract it for review.");
  });

  it("renders the permission-gated + Add Supplier action in the live upload-stage field", () => {
    expect(uploadStageStart).toBeGreaterThan(-1);
    expect(uploadStageEnd).toBeGreaterThan(uploadStageStart);
    expect(uploadStageSource).toMatch(
      /<FieldLabel htmlFor="import-supplier">Supplier<\/FieldLabel>[\s\S]*?\{canCreateSupplier \? \([\s\S]*?data-testid="material-import-add-supplier"[\s\S]*?onClick=\{\(\) => setIsAddSupplierOpen\(true\)\}[\s\S]*?\+ Add Supplier[\s\S]*?\) : null\}/,
    );
    expect(uploadStageSource).not.toContain('<option value="__add_supplier__">');
  });

  it("preserves the Material import payload and review actions", () => {
    expect(workspaceSource).toContain('formData.set("file", importFile)');
    expect(workspaceSource).toContain('formData.set("supplierId", importSupplierId)');
    expect(workspaceSource).toContain('fetch("/api/materials/imports"');
    expect(workspaceSource).toContain('decision: "approve"');
    expect(workspaceSource).toContain('decision: "reject"');
    expect(workspaceSource).toContain("router.refresh()");
  });

  it("continues to rely on the shared dialog for Escape, focus trapping, and focus return", () => {
    expect(importDialogSource).toContain("<DialogContent");
    expect(dialogSource).toContain("<DialogPrimitive.Content");
    expect(importDialogSource).not.toContain("onEscapeKeyDown");
    expect(importDialogSource).not.toContain("onOpenAutoFocus");
    expect(importDialogSource).not.toContain("onCloseAutoFocus");
  });

  it("uses truthful Trade Pack-style processing and hides review actions until rows are ready", () => {
    expect(workspaceSource).toContain("function MaterialImportProgress(");
    expect(processingStateSource).toContain('aria-label="Supplier price list interpretation progress"');
    expect(processingStateSource).toContain('data-testid="material-import-processing-ring"');
    expect(processingStateSource).toContain('className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24"');
    expect(processingStateSource).toContain("animate-spin");
    expect(processingStateSource).toContain('borderTopColor: "var(--orange-primary)"');
    expect(processingStateSource).toContain('borderRightColor: "var(--orange-primary)"');
    expect(processingStateSource).toContain('borderBottomColor: "transparent"');
    expect(processingStateSource).toContain('borderLeftColor: "transparent"');
    expect(processingStateSource).toContain('border-[var(--orange-soft)]');
    expect(processingStateSource).toContain("motion-reduce:animate-none");
    expect(processingStateSource).toContain("Interpreting Supplier Price List");
    expect(processingStateSource).toContain('className="flex flex-col items-center justify-center text-center"');
    expect(processingStateSource).not.toContain('rounded-[var(--radius-lg)] border border-[var(--border)]');
    expect(processingStateSource).not.toContain("Understanding supplier products and pricing...");
    expect(processingStateSource).not.toContain("This can take a little longer for complex supplier documents.");
    expect(processingStateSource).not.toContain("aria-valuenow");
    expect(processingStateSource).not.toContain("strokeDashoffset");
    expect(importDialogSource).toContain("{!isImportProcessing ? (");
    expect(importDialogSource).not.toContain("Interpretation in progress");
    expect(importDialogSource).not.toContain("Extraction:");
    expect(importDialogSource).toMatch(/isImportProcessing \? \([\s\S]*?<MaterialImportProgress[\s\S]*?\) : isImportFailure \? \([\s\S]*?<MaterialImportFailure[\s\S]*?\) : \([\s\S]*?<MaterialImportReviewPanel/);
    expect(importDialogSource).toContain("<MaterialImportProgress />");
    expect(importDialogSource).toContain('isImportProcessing ? "flex h-full items-center justify-center" : ""');
    expect(importDialogSource).toContain('onClick={() => void handleCancelImport()}');
    expect(importDialogSource).toContain("handleReprocessImport()");
    expect(importDialogSource).toContain("{isImportReview ? (");
  });

  it("polls sequentially at four seconds and stops on terminal states", () => {
    const pollingStart = workspaceSource.indexOf("const pollingBatchId");
    const pollingEnd = workspaceSource.indexOf("function handleImportSupplierCreated", pollingStart);
    const pollingSource = workspaceSource.slice(pollingStart, pollingEnd);
    expect(pollingSource).toContain("shouldContinue = payload.batch.status === \"extracting\"");
    expect(pollingSource).toContain("window.setTimeout(() => void poll(), 4_000)");
    expect(pollingSource).not.toContain("setInterval");
    expect(pollingSource.indexOf("await response.json()")).toBeLessThan(pollingSource.indexOf("window.setTimeout"));
    expect(pollingSource).toContain('payload.batch.status === "failed" || payload.batch.status === "cancelled"');
  });

  it("removes Material description from review while preserving identity and supplier wording", () => {
    expect(reviewPanelSource).toContain("value={row.reviewedName}");
    expect(reviewPanelSource).toContain("reviewedName: event.target.value");
    expect(reviewPanelSource).not.toContain("Interpretation confidence");
    expect(reviewPanelSource).not.toContain("row.reviewedDescription");
    expect(reviewPanelSource).not.toContain('placeholder="Description"');
    expect(reviewPanelSource).toContain("value={row.reviewedSupplierDescription}");
    expect(reviewPanelSource).toContain("reviewedSupplierDescription: event.target.value");
    expect(reviewPanelSource).toContain("value={row.reviewedSupplierSku}");
  });

  it("uses compact collapsed rows and mounts heavy editors only inside expanded details", () => {
    expect(reviewPanelSource).toContain('className="hidden items-center lg:grid"');
    expect(reviewPanelSource).toContain('className="space-y-3 px-4 py-4 lg:hidden"');
    expect(reviewPanelSource).toContain("{expanded ? (");
    expect(reviewPanelSource).toContain('aria-expanded={expanded}');
    expect(reviewPanelSource).toContain("Pricing");
    expect(reviewPanelSource).not.toContain("Evidence and Review Notes");
    expect(reviewPanelSource).not.toContain("price.evidence");
    expect(reviewPanelSource).not.toContain("price.dateLabel");
    expect(reviewPanelSource).toContain("selectedPriceKey: \"manual\"");
  });

  it("uses dense stepped detail surfaces, decision grids, and compact price rows", () => {
    expect(reviewPanelSource).toContain('className="border-t border-[var(--border)] bg-[var(--surface-muted)]/35 px-4 py-4"');
    expect(reviewPanelSource).toContain('className="space-y-3"');
    expect(reviewPanelSource).toContain('rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4');
    expect(reviewPanelSource).toContain('data-testid={`review-step-marker-${step}`}');
    expect(reviewPanelSource).toContain('className="grid gap-3 md:grid-cols-2"');
    expect(reviewPanelSource).toContain('"h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5');
    expect(reviewPanelSource).toContain('className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)]"');
    expect(reviewPanelSource).toContain('className="divide-y divide-[var(--border-subtle)]"');
    expect(reviewPanelSource).toContain('bg-[var(--orange-soft)]');
    expect(reviewPanelSource).toContain('Final comparable pricing for this Material.');
  });

  it("uses a single state-aware Details action instead of a separate status badge", () => {
    expect(reviewPanelSource).not.toContain("StatusBadge");
    expect(reviewPanelSource).not.toContain(">Status</span>");
    expect(reviewPanelSource).toContain(">Details</span>");
    expect(reviewPanelSource).toContain("Details — ${details.stateLabel} for ${rowLabel}");
    expect(reviewPanelSource).toContain("status-approved-light");
    expect(reviewPanelSource).toContain("status-overdue-light");
  });

  it("keeps accessible selection, matching, price, and row-detail controls", () => {
    expect(reviewPanelSource).toContain('aria-label="Select all Material import rows"');
    expect(reviewPanelSource).toContain('aria-label={`Select ${rowLabel}`}');
    expect(reviewPanelSource).toContain("indeterminate = someSelected");
    expect(reviewPanelSource).toContain("Existing Material match for ${rowLabel}");
    expect(reviewPanelSource).toContain("Select ${price.label} for ${rowLabel}");
    expect(importDialogSource).toContain("{selectedReviewRowIds.length} of {reviewRows.length} selected");
  });

  it("keeps extracted Material description as an internal approval pass-through", () => {
    expect(workspaceSource).toContain('reviewedDescription: row.reviewed_description ?? row.extracted_description ?? ""');
    expect(workspaceSource).toContain("reviewedDescription: row.reviewedDescription");
  });
});
