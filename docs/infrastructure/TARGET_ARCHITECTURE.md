# TradesStack target architecture

Status: implementation target, with Alpha operational and Main retained as the private authoritative product/release source on 2026-10-10.

## Decisions

| Component | Target | Decision |
|---|---|---|
| Main | Private repository and release pipeline | Local development, CI, and disposable previews; no permanent public application is required. |
| Alpha | Cloudflare Workers Paid | Operational reference implementation validated against an approved Main release. |
| Owner Control Plane | Deferred | No customer provisioning or management service is commissioned in this task. |
| Marketing | Cloudflare static/Workers | Static export only if the route remains server-independent; otherwise the same adapter path. |
| PostgreSQL/Auth/RLS | Supabase | Remains authoritative. No D1 migration. |
| Documents | R2 Standard, private binding | Opt-in provider boundary; dedicated bucket or strongly isolated prefix per customer after account-limit review. |
| Heavy takeoff/PDF jobs | Dedicated Node-compatible worker | Existing job contract retained; Cloudflare Queue/Workflow may dispatch but should not perform native PDF rendering until proven. |
| Customer provisioning | Owner Control Plane | Extend existing release/client registry and idempotent lifecycle proofs; provider adapters record desired and observed state. |
| Mobile | Existing native architecture | Preserve API contracts and Supabase Auth/session behavior. |

## Worker compatibility boundary

The root `wrangler.jsonc`, `open-next.config.ts`, `cloudflare-env.d.ts`, package scripts and `deploymentId` configuration prepare an explicit Cloudflare build path. This is not a deployment claim. The first gate is `npm run cloudflare:preview`, followed by authenticated browser workflows covering login, dashboard, Files, Takeoff preparation fallback and streamed assistant responses.

Cloudflare's current documentation reports OpenNext support for App Router, Route Handlers, RSC, SSR, Server Actions, streaming and middleware, while Node.js middleware is not supported. The app uses proxy/auth and Node-oriented libraries, so compatibility must be proven from the generated Worker, not assumed from the feature table.

## Isolation model

Supabase authorization remains the first decision point. The database stores organization/project/file relationships and RLS remains active. R2 stores opaque keys only. An authorized server route obtains or streams an object through a private binding; browsers never receive account-wide R2 credentials. A customer-specific bucket is preferred when operational limits permit; otherwise the key namespace must include a cryptographically unguessable customer/environment identifier and the Owner Control Plane must record the mapping.

## Deployment/release flow

1. Select an approved `ops/releases/*.json` manifest.
2. Build from the manifest source SHA with `DEPLOYMENT_VERSION`/`GIT_SHA` set.
3. Run typecheck, focused tests, Cloudflare preview and authenticated workflow checks.
4. Deploy Alpha only after an approval; record Worker URL/version and health evidence.
5. Keep Main deploys explicit and limited to disposable previews or approved infrastructure checks; never treat Main as a customer-facing production application.
6. Derive future customer implementations only from an approved Main release through the deferred Control Plane process.
7. Retain the previous Alpha deployment and Supabase Storage objects during the rollback window.

The root Wrangler configuration deliberately has no default R2 binding and disables unqualified workers.dev deployment. Alpha or a disposable preview must be selected explicitly with `CLOUDFLARE_ENV`/`--env`; this prevents Main automation from accidentally using Alpha storage or publishing a permanent Main application.

## Explicit non-decisions

Do not move PostgreSQL to D1, make construction storage public, run PDF.js/native canvas inside the web request path, delete Supabase Storage during initial R2 migration, or bypass the existing release manifests and client registry.
