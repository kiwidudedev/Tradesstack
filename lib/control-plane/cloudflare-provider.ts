export type CloudflareFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type CloudflareProviderOptions = {
  accountId: string;
  apiToken: string;
  fetchImpl?: CloudflareFetch;
};

export type CloudflareBucket = {
  name?: string;
  jurisdiction?: string;
  location?: string;
  storage_class?: string;
};

export function customerResourceName(customerId: string, suffix: "worker" | "documents"): string {
  const normalized = customerId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("customerId must contain an alphanumeric character");
  return `tradesstack-${normalized}-${suffix}`.slice(0, 63);
}

/**
 * Thin, injectable Cloudflare control-plane client. It records no state and
 * does not decide lifecycle readiness; callers must reconcile its responses
 * into the existing control-plane contract and release evidence.
 */
export class CloudflareProvider {
  private readonly fetchImpl: CloudflareFetch;

  constructor(private readonly options: CloudflareProviderOptions) {
    if (!options.accountId || !options.apiToken) throw new Error("Cloudflare accountId and apiToken are required");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${this.options.accountId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.options.apiToken}`, "Content-Type": "application/json", ...init?.headers },
    });
    const payload = await response.json() as { success?: boolean; result?: T; errors?: Array<{ message?: string }> };
    if (!response.ok || payload.success === false) {
      throw new Error(`Cloudflare API ${response.status}: ${payload.errors?.map((error) => error.message).join(", ") || "request failed"}`);
    }
    return payload.result as T;
  }

  listR2Buckets(): Promise<{ buckets?: CloudflareBucket[] }> {
    return this.request("/r2/buckets");
  }

  getR2Bucket(bucketName: string): Promise<CloudflareBucket> {
    return this.request(`/r2/buckets/${encodeURIComponent(bucketName)}`);
  }

  createR2Bucket(bucketName: string, locationHint?: string): Promise<CloudflareBucket> {
    return this.request("/r2/buckets", { method: "POST", body: JSON.stringify({ name: bucketName, ...(locationHint ? { locationHint } : {}) }) });
  }

  getWorkerSettings(scriptName: string): Promise<Record<string, unknown>> {
    return this.request(`/workers/scripts/${encodeURIComponent(scriptName)}/script-settings`);
  }
}

