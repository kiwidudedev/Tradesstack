# TradesStack Scheduler Adapter and Client Dispatcher

## Status

**HOSTED CLIENT DISPATCHER DEPLOYED — SCHEDULER NOT ACTIVATED**

This pass prepares and deploys the provider-independent scheduler boundary for
Alpha and the first customer cohort. It does not purchase or activate Vercel
Pro, add a Vercel Cron registration, enable GitHub schedules, or invoke a
business job from the dispatcher.

## Permanent boundary

```text
scheduler adapter
      ↓
narrow authenticated client dispatcher
      ↓
client-local queues/workers
      ↓
that client's own DB/Auth/Storage
```

The dispatcher is `GET`/`POST /api/cron/dispatch`. A scheduler supplies one
allowlisted `job` and an optional opaque `dispatchId`. The dispatcher invokes
one static target route on the same client deployment. It never accepts an
arbitrary URL, arbitrary route, arbitrary job parameters or a customer
credential.

## Implemented files

- `lib/scheduler/client-dispatcher.ts` — static job catalog, bearer
  authentication helpers, envelope parsing, enablement gate and one-target
  invocation adapter.
- `app/api/cron/dispatch/route.ts` — Node runtime dispatcher route with a
  bounded single-job request and 300-second route ceiling.
- `lib/scheduler/client-dispatcher.test.ts` — provider-independent contract
  tests.
- `app/api/cron/dispatch/route.test.ts` — route authentication, allowlisting,
  disabled-job, success and failure tests.
- `packages/client-config/src/index.ts` — non-secret scheduler adapter/path/
  enabled-job configuration contract.
- `scripts/ops/lib.mjs` — registry validation for non-secret scheduler
  metadata.

Alpha deployment evidence:

- dispatcher promotion commit: `4592cb1`;
- production deployment: `dpl_J4Dgz7d7MW29tXq5DuNLMuTaGvsn`;
- the production route is present and returns `401 Unauthorized` without the
  bearer secret;
- a high-entropy production `CRON_SECRET` was added through Vercel's encrypted
  environment-variable mechanism; its value is not stored in source or this
  document.

## Authentication and secrets

The dispatcher accepts the existing client `CRON_SECRET` as a bearer token and
compares it in constant time. It forwards that same server-only secret only to
the static client-local target route. It does not know or receive:

- Supabase database passwords or service-role keys;
- Auth or Storage credentials;
- Xero tokens;
- backup encryption keys;
- Takeoff worker tokens.

The Takeoff render route remains outside this dispatcher catalog and continues
to require `TAKEOFF_RENDER_WORKER_TOKEN`. The two secrets are not merged.

## Job selection and enablement

The catalog contains only provider-neutral existing cron routes. A job must:

1. be present in the static catalog;
2. pass `TRADESSTACK_ENABLED_BACKGROUND_JOBS` for that client;
3. be invoked through its existing authenticated route.

The dispatcher invokes at most one target per request and forwards no caller
query string or body parameters to the target. Xero routes remain excluded
until their separately approved provider commissioning pass.

## Duplicate delivery and leases

The dispatcher forwards an opaque `x-tradesstack-dispatch-id` and never treats
delivery of a scheduler request as proof that work completed. Duplicate
delivery remains safe only through each existing job's lease, idempotency,
outbox or provider-sync contract. No new database deduplication table or
business-job semantics were introduced.

The dispatcher returns a sanitized `502` for target failure and does not
forward target response bodies or internal error details to the scheduler.

## Adapter replacement

Vercel Cron for Alpha/Customer #1 should call the same dispatcher URL with the
client's `CRON_SECRET`. A future EventBridge or other managed scheduler can
send the same narrow request to the same URL; no client-local worker or
business-job contract needs to change. No Vercel `vercel.json` schedule was
added in this pass because doing so would register hosted scheduling before
the paid-plan decision.

## Registry and provisioning

`ops/clients.json` records the non-secret adapter, dispatcher path, current
activation state and enablement source for Alpha. `@tradesstack/client-config`
can carry the same provider-independent scheduler metadata for future client
repositories. Secrets remain deployment-provider configuration and are never
placed in either artifact.

## Explicit non-claims

This implementation does not prove:

- Vercel Cron delivery or retry behavior;
- 100-client fleet scale;
- centralized worker execution;
- customer-provider activation;
- hosted Alpha recurring execution;
- operational alert delivery for scheduler failures.

Those require a later provider-approved commissioning pass. The deployed
dispatcher proves the client-local authenticated boundary only; it does not
prove Vercel Cron delivery, retry behaviour, recurring execution, alerting or
fleet scale.

## Current validation recheck — 2026-10-03

The current release source was rechecked without provider activation:

- scheduler dispatcher contract and route tests passed;
- document-cleanup, materials-pricing and retention-draft cron route tests
  passed;
- the separate time-sheet worker authentication test passed;
- total focused result: 5 test files, 23 tests passed;
- package-boundary enforcement and release TypeScript validation passed;
- the production build passed and enumerated the dispatcher and existing cron
  routes.

This strengthens the provider-independent boundary evidence. It does not
change the explicit hosted status: recurring scheduler delivery, retry/SLA,
failure alert delivery and multi-client fleet operation remain unproven until
the approved scheduler provider is activated and commissioned.

A current public Alpha check also returned non-empty HTML with HTTP 200, while
an unauthenticated request to the deployed dispatcher returned HTTP 401 with
the sanitized `{"error":"Unauthorized."}` response. No scheduler secret was
used or exposed. This proves the public deployment and rejection boundary,
not authenticated scheduled execution.
