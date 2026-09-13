"use client";

export type FilesEntityKind = "project" | "opportunity";

export function prefetchFilesOnIntent({
  href,
  kind,
  slug,
  prefetchedHrefs,
  prefetch,
}: {
  href: string;
  kind: FilesEntityKind;
  slug: string;
  prefetchedHrefs: Set<string>;
  prefetch: (href: string) => void;
}) {
  if (!href || !slug || prefetchedHrefs.has(href)) return;
  prefetchedHrefs.add(href);

  const params = new URLSearchParams({ kind, slug });
  void fetch(`/api/documents/files-context/prefetch?${params}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  }).catch(() => undefined).finally(() => {
    // Let Next warm the supported RSC route/client chunks after the secure
    // server resolver has primed the short-lived Files context.
    prefetch(href);
  });
}
