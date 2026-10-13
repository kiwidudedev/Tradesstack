# AI and background worker architecture

## Current state

The takeoff renderer is an authenticated Node-compatible worker boundary invoked by the bounded Alpha GitHub Actions schedule. It processes queued jobs through `lib/takeoff-server` and uses PDF.js plus `@napi-rs/canvas` and filesystem output. The Cloudflare web Worker does not run native PDF/canvas rendering. Alpha has passed a real two-page render and output retrieval proof; the scheduled worker runs one bounded job per invocation and leaves the application responsible for queue/status persistence.

## Target

Keep the web application responsible for authenticated job creation, status and result persistence. Dispatch work to a durable queue or external scheduler. Run PDF/native/image workloads on a dedicated Node-compatible worker with bounded concurrency, leases, idempotent job IDs, retry count, timeout, progress/status updates and a dead-letter state. Store source/results in private Supabase Storage initially or the R2 provider boundary after migration proof.

Cloudflare Queues or Workflows may become the dispatcher/orchestrator. They should not be treated as proof that PDF.js/native canvas can execute in the Worker runtime. The first replacement proof must process a representative multi-page PDF, survive a duplicate delivery, recover a lease timeout, preserve organization ownership and produce identical page metadata/output.

## Reliability contract

- Claim one job atomically with an expiry lease.
- Never process a job without organization/drawing-set ownership checks.
- Make render output keys deterministic by job/page/version.
- Mark completion only after object persistence and metadata transaction succeed.
- Retry transient provider errors with backoff; quarantine invalid PDFs and repeated failures.
- Expose progress and error state to the existing UI; preserve the preparing/fallback state.
- Keep worker credentials server-only and rotate the bearer token through the deployment secret store.

## Cost/placement decision

The heavy worker remains dedicated Node compute because current code requires Node filesystem/native canvas behavior and construction PDFs can exceed edge memory/CPU budgets. Cloudflare Workers remains appropriate for request handling, dispatch, status APIs and lightweight orchestration. This preserves the working path while allowing a future measured migration.
