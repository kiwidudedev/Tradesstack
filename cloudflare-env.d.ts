/** Generated with `npm run cloudflare:typegen` in an authenticated Cloudflare account. */
interface CloudflareEnv {
  ASSETS: Fetcher;
  TRADESSTACK_R2_BUCKET?: R2Bucket;
  TRADESSTACK_TAKEOFF_QUEUE?: unknown;
  TAKEOFF_CONTAINER?: DurableObjectNamespace;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TAKEOFF_CONTAINER_TOKEN?: string;
}
