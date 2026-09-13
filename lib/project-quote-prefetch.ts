export function shouldPrefetchProjectQuoteHref({
  href,
  projectId,
  prefetchedHrefs,
}: {
  href?: string | null;
  projectId: string;
  prefetchedHrefs: Set<string>;
}) {
  if (!href || !projectId) {
    return false;
  }

  const quotePrefix = `/app/projects/${projectId}/preconstruction/quote/`;
  if (!href.startsWith(quotePrefix)) {
    return false;
  }

  const routeSuffix = href.slice(quotePrefix.length);
  const segments = routeSuffix.split("/");
  const quoteId = segments[0] ?? "";
  if (
    segments.length !== 1
    || !quoteId
    || quoteId === "new"
    || quoteId.includes("?")
    || quoteId.includes("#")
    || prefetchedHrefs.has(href)
  ) {
    return false;
  }

  prefetchedHrefs.add(href);
  return true;
}

export function prefetchProjectQuoteHref({
  href,
  projectId,
  prefetchedHrefs,
  prefetch,
}: {
  href?: string | null;
  projectId: string;
  prefetchedHrefs: Set<string>;
  prefetch: (href: string) => void;
}) {
  if (!href || !shouldPrefetchProjectQuoteHref({ href, projectId, prefetchedHrefs })) {
    return false;
  }

  prefetch(href);
  return true;
}
