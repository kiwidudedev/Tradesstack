export function selectScopedTakeoffPage<T extends { id: string }>(
  pages: readonly T[],
  requestedPageId?: string | null,
): T | null {
  if (requestedPageId) {
    return pages.find((page) => page.id === requestedPageId) ?? pages[0] ?? null;
  }

  return pages[0] ?? null;
}
