# TradesStack current infrastructure audit

Status: updated 2026-10-13 after the first controlled Cloudflare Alpha deployment. Vercel is rollback-only for Alpha; Cloudflare is the active deployment provider.

## Executive finding

TradesStack Main is the authoritative Next.js 16.3.8 App Router product and release source using Supabase Auth/PostgreSQL/Storage, private signed URLs, server actions, streaming assistant routes, PDF/Excel processing, and the shared takeoff contract. Main is not a permanent customer-facing application. Alpha is the operational reference implementation under `tradesstack-client-alpha/`, deployed at `https://tradesstack-alpha.tradesstack.workers.dev`; its existing Vercel deployment is retained only as rollback.

The repository now has OpenNext/Cloudflare configuration, an R2 binding adapter and an opt-in R2 document upload/download path. Supabase remains the authoritative database/Auth/RLS/metadata provider. It also has release manifests, client registry/provisioning proofs, historical Vercel commissioning evidence, Supabase migrations, and a Cloudflare Alpha deployment path. Heavy PDF rendering remains external Node-compatible compute until a runtime proof passes.

## Verified inventory

| Area | Evidence | Finding |
|---|---|---|
| Main app | `package.json`, `next.config.ts`, `app/`, `proxy.ts` | Next.js 16.3.8, React 19, App Router, proxy/auth, server actions and route handlers. |
| Alpha | `tradesstack-client-alpha/`, `ops/commissioning/client-alpha.json` | Dedicated Cloudflare reference implementation with private R2, Supabase Auth/RLS, and bounded Node takeoff execution. |
| Database/Auth | `lib/supabase/*`, `supabase/migrations/` | Supabase is the application database, Auth and current private Storage provider. |
| Storage | `lib/documents/server.ts`, `lib/documents/upload-client.ts`, document migrations | `organization-documents` private bucket, TUS uploads, RPC authorization, signed download URLs. Drawing, QA and supplier-invoice storage also have domain-specific paths. |
| Takeoff | `app/api/takeoff/render-jobs/run/route.ts`, `scripts/run_takeoff_render_worker.sh`, `lib/takeoff-pdf-preview-renderer.ts` | Authenticated polling worker; PDF.js + `@napi-rs/canvas`, filesystem temp/output usage; not a normal edge request workload. |
| AI | `app/api/assistant/route.ts`, `app/api/chat/*`, `lib/assistant/*`, provider adapters | Server-side provider calls, project/org context and persisted usage/conversation paths. Live provider access was not exercised in this audit. |
| Release governance | `ops/releases/*.json`, `scripts/ops/*`, `ops/clients.json`, `proofs/*` | Main release manifests and client promotion/provisioning proofs exist; provider deployment state is not recorded as verified. |
| Hosting | `wrangler.jsonc`, `open-next.config.ts`, Cloudflare deployment output | Cloudflare Workers is the active Alpha hosted path; Vercel is retained only as rollback. |
| Mobile | repository search for Edge/mobile contracts and architecture docs | Native/mobile integration is represented by backend contracts/proofs; no native app source repository was found in this workspace. |

## Runtime risks

1. Cloudflare Workers uses a workerd runtime and 128 MB memory/5-minute paid-request limits. PDF parsing/rendering, Sharp and native canvas dependencies must be tested separately; they are not assumed compatible.
2. The app has multiple storage domains. Moving only `organization-documents` does not migrate drawings, QA evidence, invoices, generated documents or legacy attachments.
3. R2 does not enforce Supabase RLS. Every R2 operation must be preceded by the existing organization/project authorization path.
4. Alpha commissioning explicitly records the takeoff worker as `OFF_NOT_COMMISSIONED`; deployment compatibility must not be inferred from a successful static build.
5. The working tree is dirty with user changes and untracked artifacts. This audit did not clean, reset, delete or overwrite unrelated material.

## Verified versus unverified

Verified: repository code/configuration, local dependency versions, storage paths in code/migrations, release/provisioning artifacts, worker protocol, Cloudflare Alpha deployment output and HTTP reachability.

Unverified: representative authenticated Cloudflare browser workflows, live R2 object flows, live Supabase migration ledger, production database backups, real AI provider calls, Xero, email, native takeoff execution, and third-party observability.

## Current recommendation

Use the explicit `CLOUDFLARE_ENV=alpha` Worker deployment path for Alpha. Keep PostgreSQL/Auth/RLS and document lifecycle metadata on Supabase. Keep R2 isolated to Alpha until migration-ledger and private-route checks are reverified. Run takeoff/PDF-heavy jobs on dedicated Node-compatible compute until the configured Cloudflare container/queue path passes a representative render proof.

## Local compatibility result

The OpenNext build and first Cloudflare Alpha deployment completed; the public Worker health path must still be exercised through authenticated browser workflows. Wrangler warned that `TakeoffRendererContainer` is configured as a Durable Object but is not exported by the Worker, so native takeoff execution remains unverified and may be unavailable until that binding is reconciled.
