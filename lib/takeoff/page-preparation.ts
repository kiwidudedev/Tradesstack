export const DEFAULT_TAKEOFF_PAGE_PREPARATION_MAX_BYTES = 256 * 1024 * 1024;
export const DEFAULT_TAKEOFF_PAGE_PREPARATION_MAX_PAGES = 5000;

export function validateTakeoffPdfPreparationBounds(params: {
  byteLength: number;
  pageCount?: number;
  maxBytes?: number;
  maxPages?: number;
}) {
  const maxBytes = params.maxBytes ?? DEFAULT_TAKEOFF_PAGE_PREPARATION_MAX_BYTES;
  const maxPages = params.maxPages ?? DEFAULT_TAKEOFF_PAGE_PREPARATION_MAX_PAGES;
  if (params.byteLength > maxBytes) {
    throw new Error(`This PDF exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB Takeoff preparation limit.`);
  }
  if (params.pageCount !== undefined && params.pageCount > maxPages) {
    throw new Error(`This PDF exceeds the ${maxPages}-page Takeoff preparation limit.`);
  }
}
