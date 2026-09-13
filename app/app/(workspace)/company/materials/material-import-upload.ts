import { getSupplierDisplayName, normalizeSupplierLookupValue, type OrganizationSupplierRow } from "@/lib/suppliers";

export const MATERIAL_IMPORT_ACCEPT =
  ".csv,.xlsx,.xlsm,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";

const MAX_MATERIAL_IMPORT_UPLOAD_BYTES = 25 * 1024 * 1024;
const MATERIAL_IMPORT_UPLOAD_EXTENSIONS = [
  ".csv",
  ".xlsx",
  ".xlsm",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
] as const;
const MATERIAL_IMPORT_UPLOAD_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function filterMaterialImportSuppliers(
  suppliers: OrganizationSupplierRow[],
  query: string,
  limit = 50,
) {
  const normalizedQuery = normalizeSupplierLookupValue(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  return suppliers
    .map((supplier, originalIndex) => {
      const displayName = getSupplierDisplayName(supplier) || "Unknown supplier";
      const normalizedName = normalizeSupplierLookupValue(displayName);
      const searchable = normalizeSupplierLookupValue([
        supplier.company_name,
        supplier.name,
        supplier.primary_contact_email,
        supplier.email,
      ].filter(Boolean).join(" "));
      if (queryTokens.some((token) => !searchable.includes(token))) return null;
      const score = !normalizedQuery
        ? 3
        : normalizedName === normalizedQuery
          ? 0
          : normalizedName.startsWith(normalizedQuery)
            ? 1
            : 2;
      return { supplier, displayName, score, originalIndex };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) =>
      left.score - right.score
      || left.displayName.localeCompare(right.displayName)
      || left.originalIndex - right.originalIndex
    )
    .slice(0, limit)
    .map((candidate) => candidate.supplier);
}

export function moveMaterialImportSupplierActiveIndex(
  currentIndex: number,
  optionCount: number,
  direction: "next" | "previous",
) {
  if (optionCount === 0) return 0;
  return direction === "next"
    ? (currentIndex + 1) % optionCount
    : (currentIndex - 1 + optionCount) % optionCount;
}

export function validateMaterialImportUploadFile(
  file: Pick<File, "name" | "size" | "type">,
) {
  const fileName = file.name.trim().toLowerCase();
  const mimeType = file.type.trim().toLowerCase();
  const hasSupportedExtension = MATERIAL_IMPORT_UPLOAD_EXTENSIONS.some((extension) =>
    fileName.endsWith(extension)
  );

  if (!hasSupportedExtension && !MATERIAL_IMPORT_UPLOAD_MIME_TYPES.has(mimeType)) {
    return "Unsupported file type. Upload CSV, XLSX, XLSM, PDF, JPEG, PNG, WebP, HEIC, or HEIF.";
  }

  if (file.size <= 0) {
    return "Empty files cannot be uploaded.";
  }

  if (file.size > MAX_MATERIAL_IMPORT_UPLOAD_BYTES) {
    return "File is too large. Maximum size is 25 MB.";
  }

  return null;
}

export function materialImportUploadStatus(params: {
  supplierId: string;
  fileName: string | null;
  isUploading: boolean;
}) {
  if (params.isUploading) {
    return "Creating import batch…";
  }
  if (params.supplierId && params.fileName) {
    return "Ready";
  }
  if (params.fileName) {
    return "1 file selected · Select a supplier to continue";
  }
  if (params.supplierId) {
    return "Select a file to continue";
  }
  return "Select a supplier and file to continue";
}
