import { describe, expect, it } from "vitest";
import { assertSafeStorageKey, createR2StorageProvider } from "@/lib/storage/provider";

describe("storage provider boundary", () => {
  it("rejects traversal and absolute storage keys", () => {
    expect(() => assertSafeStorageKey("../secret.pdf")).toThrow();
    expect(() => assertSafeStorageKey("/absolute.pdf")).toThrow();
    expect(() => assertSafeStorageKey("folder\\file.pdf")).toThrow();
  });

  it("keeps R2 operations behind the provider interface", async () => {
    const objects = new Map<string, { body: ReadableStream<Uint8Array>; size: number; etag: string; uploaded: Date; httpMetadata?: { contentType?: string } }>();
    const bucket = {
      async put(key: string, body: string | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array>, options?: { httpMetadata?: { contentType?: string } }) {
        const stream = body instanceof ReadableStream ? body : new ReadableStream<Uint8Array>();
        const object = { body: stream, size: 1, etag: `etag-${key}`, uploaded: new Date("2026-01-01T00:00:00.000Z"), httpMetadata: options?.httpMetadata };
        objects.set(key, object);
        return object;
      },
      async get(key: string) { return objects.get(key) ?? null; },
      async head(key: string) { return objects.get(key) ?? null; },
      async delete(key: string) { objects.delete(key); },
      async list() { return { objects: [...objects.values()] }; },
    };
    const provider = createR2StorageProvider(bucket);
    const stored = await provider.put({ key: "org-1/file.pdf", body: "pdf", contentType: "application/pdf" });
    expect(stored.key).toBe("org-1/file.pdf");
    expect((await provider.get("org-1/file.pdf"))?.metadata.contentType).toBe("application/pdf");
    await provider.delete("org-1/file.pdf");
    expect(await provider.get("org-1/file.pdf")).toBeNull();
  });
});
