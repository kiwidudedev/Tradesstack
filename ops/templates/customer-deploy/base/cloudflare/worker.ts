// @ts-nocheck
/**
 * Customer Cloudflare Worker entry.
 *
 * OpenNext generates `.open-next/worker.js` during `cloudflare:build`. This
 * customer-owned entry is intentionally minimal: the reusable web application is
 * release-owned, and customer infrastructure identity lives in `deploy/customer.json`
 * and `wrangler.jsonc`.
 */
import nextWorker from "../.open-next/worker.js";

export default {
  fetch(request, env, ctx) {
    return nextWorker.fetch(request, env, ctx);
  },
};
