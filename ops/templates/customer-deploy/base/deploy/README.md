# Customer deployment overlay

These files are customer-owned and are preserved by Main release upgrades:

- `deploy/customer.json` — non-secret customer identity (Supabase project, Worker, R2 bucket, release, source SHA).
- `wrangler.jsonc` — Cloudflare environment, bindings and public vars.
- `cloudflare/worker.ts` — Cloudflare entry point (takeoff variant when enabled).
- `cloudflare-env.d.ts` — minimal Cloudflare binding types.
- `open-next.config.ts` — OpenNext configuration.
- `scripts/ops/prepare-cloudflare-assets.mjs` — Worker asset size guard.
- `scripts/ops/validate-cloudflare-deploy.mjs` — customer-only deployment preflight.
- `.github/workflows/customer-ci.yml` — build/typecheck CI with no secrets.
- `.github/workflows/customer-deploy.yml` — manual deploy workflow (secrets configured by the owner).

`deploy/customer.json` is written by `scripts/ops/customer-provision.mjs` in TradesStack Main. Do not edit it by hand. Use `npm run cloudflare:deploy` with `CLOUDFLARE_ENV=production` and the customer's Supabase build variables. The preflight refuses Alpha/Main project references, Worker names, R2 buckets and release aliases.
