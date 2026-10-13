# TradesStack current infrastructure audit

Status: verified from the repository on 2026-10-10. This is a code/configuration audit; no Cloudflare account, Supabase project, DNS, production deployment, or live billing account was changed.

## Executive finding

TradesStack Main is the authoritative Next.js 16.3.8 App Router product and release source using Supabase Auth/PostgreSQL/Storage, private signed URLs, server actions, streaming assistant routes, PDF/Excel processing, and the shared takeoff contract. Main is not a permanent customer-facing application. Alpha is the operational reference implementation under `tradesstack-client-alpha/`, deployed at `https://tradesstack-alpha.tradesstack.workers.dev`; its existing Vercel deployment is retained only as rollback.

The repository now has OpenNext/Cloudflare configuration, an R2 binding adapter and an opt-in R2 document upload/download path. Supabase remains the default and authoritative database/Auth/RLS/metadata provider. It also has release manifests, client registry/provisioning proofs, Vercel-oriented commissioning evidence, Supabase migrations, and a working-but-disabled takeoff worker protocol. Heavy PDF rendering remains external Node-compatible compute until a runtime proof passes.

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
| Hosting | `vercel.json`, commissioning JSON | Vercel is the documented/current hosted path; `vercel.json` is empty and there is no Cloudflare config before this change. |
| Mobile | repository search for Edge/mobile contracts and architecture docs | Native/mobile integration is represented by backend contracts/proofs; no native app source repository was found in this workspace. |

## Runtime risks

1. Cloudflare Workers uses a workerd runtime and 128 MB memory/5-minute paid-request limits. PDF parsing/rendering, Sharp and native canvas dependencies must be tested separately; they are not assumed compatible.
2. The app has multiple storage domains. Moving only `organization-documents` does not migrate drawings, QA evidence, invoices, generated documents or legacy attachments.
3. R2 does not enforce Supabase RLS. Every R2 operation must be preceded by the existing organization/project authorization path.
4. Alpha commissioning explicitly records the takeoff worker as `OFF_NOT_COMMISSIONED`; deployment compatibility must not be inferred from a successful static build.
5. The working tree is dirty with user changes and untracked artifacts. This audit did not clean, reset, delete or overwrite unrelated material.

## Verified versus unverified

Verified: repository code/configuration, local dependency versions, storage paths in code/migrations, release/provisioning artifacts, worker protocol, and the existence of current Vercel/Alpha commissioning evidence.

Unverified: Cloudflare account/project names, paid-plan status, current provider bills, DNS, deployed Worker behavior, live R2 buckets, live Supabase migration state, production database backups, real AI provider calls, Xero, email, native mobile runtime, and production cutover.

## Current recommendation

Use Cloudflare Workers for the web edge only after a real OpenNext preview and representative authenticated browser workflow pass. Keep PostgreSQL/Auth/RLS and document lifecycle metadata on Supabase. Enable R2 only for an isolated Alpha bucket after migration ledger, binding, migration application and private-route tests pass; leave original Supabase objects untouched until explicit cutover approval. Run takeoff/PDF-heavy jobs on dedicated Node-compatible compute using the existing authenticated job endpoint until a separate queue/worker proof demonstrates equivalent reliability.

## Local compatibility result

The OpenNext build now passes after removing the native canvas dependency from the static import graph and loading it only from the dedicated Node worker path. Local Wrangler preview also served `/` and `/login` with HTTP 200 after generated assets above Cloudflare's 25 MiB asset limit were excluded. This does not prove native takeoff execution in a Worker: the renderer still requires the separate Node worker, and no production Cloudflare deployment, R2 cutover, live AI call or real takeoff job was commissioned.
