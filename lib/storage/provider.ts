/**
 * Storage provider boundary for private construction documents.
 *
 * Database/RLS authorization stays in the domain service. Providers only
 * store opaque keys and must never decide whether a user may access a file.
 */

export type StorageMetadata = {
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
  uploadedAt?: string;
};

export type StoragePutInput = {
  key: string;
  body: ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array> | string;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
};

export interface StorageProvider {
  readonly kind: "supabase" | "r2";
  put(input: StoragePutInput): Promise<StorageMetadata>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; metadata: StorageMetadata } | null>;
  head(key: string): Promise<StorageMetadata | null>;
  delete(key: string): Promise<void>;
  copy(sourceKey: string, destinationKey: string): Promise<StorageMetadata>;
  list(prefix: string): Promise<StorageMetadata[]>;
}

export function assertSafeStorageKey(key: string): string {
  const normalized = key.trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("\\")) {
    throw new Error("Storage key must be a non-empty relative path.");
  }
  if (normalized.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new Error("Storage key contains an unsafe path segment.");
  }
  return normalized;
}

type R2ObjectLike = {
  key?: string;
  body: ReadableStream<Uint8Array>;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
};

type R2BucketLike = {
  put(key: string, value: StoragePutInput["body"], options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: R2ObjectLike[] }>;
  createMultipartUpload?: never;
};

export function isR2StorageKey(key: string): boolean {
  const segments = key.trim().split("/");
  return key.trim().startsWith("r2/") || segments[2] === "r2";
}

function metadataFromObject(key: string, object: R2ObjectLike): StorageMetadata {
  return {
    key,
    size: object.size,
    contentType: object.httpMetadata?.contentType,
    etag: object.etag,
    uploadedAt: object.uploaded.toISOString(),
  };
}

/** R2 binding adapter. Access is private through the Worker binding. */
export function createR2StorageProvider(bucket: R2BucketLike): StorageProvider {
  const metadata = (key: string, object: R2ObjectLike | null): StorageMetadata => {
    if (!object) throw new Error(`Storage object not found: ${key}`);
    return metadataFromObject(key, object);
  };

  return {
    kind: "r2",
    async put(input) {
      const key = assertSafeStorageKey(input.key);
      const object = await bucket.put(key, input.body, {
        httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
        customMetadata: input.metadata,
      });
      return metadata(key, object);
    },
    async get(key) {
      const safeKey = assertSafeStorageKey(key);
      const object = await bucket.get(safeKey);
      if (!object) return null;
      return { body: object.body, metadata: metadataFromObject(safeKey, object) };
    },
    async head(key) {
      const safeKey = assertSafeStorageKey(key);
      const object = await bucket.head(safeKey);
      return object ? metadataFromObject(safeKey, object) : null;
    },
    async delete(key) {
      await bucket.delete(assertSafeStorageKey(key));
    },
    async copy(sourceKey, destinationKey) {
      const source = await bucket.get(assertSafeStorageKey(sourceKey));
      if (!source) throw new Error(`Storage object not found: ${sourceKey}`);
      const object = await bucket.put(assertSafeStorageKey(destinationKey), source.body, {
        httpMetadata: source.httpMetadata,
      });
      return metadata(destinationKey, object);
    },
    async list(prefix) {
      const safePrefix = prefix ? assertSafeStorageKey(prefix) : "";
      const result = await bucket.list(safePrefix ? { prefix: safePrefix } : undefined);
      return result.objects.map((object) => metadataFromObject(object.key ?? "", object));
    },
  };
}

export function getConfiguredStorageProviderKind(): StorageProvider["kind"] {
  const provider = process.env.TRADESSTACK_STORAGE_PROVIDER || process.env.NEXT_PUBLIC_TRADESSTACK_STORAGE_PROVIDER;
  const enabled = process.env.TRADESSTACK_R2_DOCUMENTS_ENABLED === "1"
    || process.env.NEXT_PUBLIC_TRADESSTACK_R2_DOCUMENTS_ENABLED === "1";
  return enabled
    && provider === "r2"
    ? "r2"
    : "supabase";
}

export async function getConfiguredR2StorageProvider(): Promise<StorageProvider> {
  if (getConfiguredStorageProviderKind() !== "r2") {
    throw new Error("R2 document storage is not enabled for this environment.");
  }
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as { TRADESSTACK_R2_BUCKET?: R2BucketLike }).TRADESSTACK_R2_BUCKET;
  if (!bucket) throw new Error("TRADESSTACK_R2_BUCKET binding is not configured.");
  return createR2StorageProvider(bucket);
}
