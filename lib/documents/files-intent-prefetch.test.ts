import { afterEach, describe, expect, it, vi } from "vitest";
import { prefetchFilesOnIntent } from "@/lib/documents/files-intent-prefetch";

describe("Files intent prefetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("warms the secure context endpoint before asking Next to prefetch the route", async () => {
    let resolveWarmup!: () => void;
    const warmup = new Promise<void>((resolve) => { resolveWarmup = resolve; });
    const fetchMock = vi.fn(() => warmup.then(() => new Response(null, { status: 204 })));
    const nextPrefetch = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const seen = new Set<string>();

    prefetchFilesOnIntent({
      href: "/app/projects/project-a/files",
      kind: "project",
      slug: "project-a",
      prefetchedHrefs: seen,
      prefetch: nextPrefetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/files-context/prefetch?kind=project&slug=project-a",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
    expect(nextPrefetch).not.toHaveBeenCalled();
    resolveWarmup();
    await warmup;
    await vi.waitFor(() => expect(nextPrefetch).toHaveBeenCalledWith("/app/projects/project-a/files"));
  });

  it("deduplicates repeated hover and focus intents", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const seen = new Set<string>();
    const input = {
      href: "/app/leads-clients/opportunities/opportunity-a/files",
      kind: "opportunity" as const,
      slug: "opportunity-a",
      prefetchedHrefs: seen,
      prefetch: vi.fn(),
    };
    prefetchFilesOnIntent(input);
    prefetchFilesOnIntent(input);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
