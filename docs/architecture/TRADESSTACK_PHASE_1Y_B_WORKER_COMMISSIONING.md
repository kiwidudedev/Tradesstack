# TradesStack Phase 1Y-B — Worker and asynchronous processing commissioning

## Status

**PASS — Alpha Takeoff preview worker commissioned with bounded hosted polling.**

This document records the first Phase 1Y-B worker proof. It does not claim that
all TradesStack workers, cron routes, Edge Functions, integrations, or the
complete Customer #1 platform are commissioned.

## Scope

Phase 1Y-B began with the Takeoff render path because the hosted Alpha proof
had already demonstrated that drawing upload and queue persistence worked while
the drawing remained in `Preparing` with the worker disabled.

The scope was limited to:

- the existing `takeoff_render_jobs` queue;
- the existing token-authenticated worker route;
- the existing preview Storage path and page status updates;
- a bounded Alpha GitHub Actions invocation;
- the smallest renderer portability fix required by the hosted runtime.

No migration, schema, RLS, permission, Auth, Storage-policy, or commercial
behavior change was made.

## Current implementation

The Master implementation is authoritative in:

- `lib/takeoff-server.ts`;
- `lib/takeoff-pdf-preview-renderer.ts`;
- `app/api/takeoff/render-jobs/run/route.ts`.

The renderer now uses PDF.js and `@napi-rs/canvas`, which are available to the
Linux hosted runtime. The previous renderer invoked Apple PDFKit through Swift;
that could not run inside Vercel’s Linux serverless runtime. The renderer also
normalizes Node `Buffer` values to `Uint8Array` and creates its output
directories before writing PNGs.

The authoritative Master commits for this fix are:

- `28bf19b` — portable PDF.js/canvas renderer and renderer-version change;
- `37c47fe` — PDF.js byte normalization;
- `ba798dd` — output-directory creation and characterization coverage.

The Alpha promotion commits are:

- `52336e9` — bounded worker workflow;
- `ed27a3c` — hosted renderer promotion;
- `e0659fe` — preserve worker failure signals;
- `629de8a` — output-directory fix.

## Hosted worker model

Alpha uses `.github/workflows/client-alpha-takeoff-worker.yml`:

- manual dispatch for controlled operations;
- five-minute schedule for the fictional Alpha proof;
- at most two jobs per invocation;
- four-minute job timeout;
- no checkout or application secret exposure in logs;
- server-only `TAKEOFF_RENDER_WORKER_TOKEN`;
- `contents: read` workflow permission;
- non-2xx worker responses fail the workflow;
- no retry that could mask a failed job as a later idle response.

The workflow calls the existing production route. It does not bypass the
application queue or write database rows directly during normal operation.

## Characterization and failure evidence

Focused Master and Alpha tests passed:

- PDF preview renderer test;
- worker route authentication/idle behavior tests;
- 3 tests across 2 files.

The first live invocation (`37055419678`) reached the route and exposed the
pre-existing hosted renderer defect. A later controlled recovery invocation
(`37057153838`) proved that the workflow now fails on a real renderer error
instead of masking it. The failure was classified as:

- Apple-only Swift/PDFKit execution in Vercel Linux;
- then Node `Buffer` rejected by PDF.js;
- then missing PNG output directory.

Each defect was fixed narrowly and retested. The recovery touched only the
identified fictional Alpha synthetic fixture for this proof; it did not delete
data or alter schema.

## Final live proof

Successful worker run: `37057455130`.

Authoritative Alpha database and private Storage verification after the run:

| Evidence | Result |
|---|---|
| `takeoff_render_jobs` status | `completed` |
| attempt count | `1` |
| renderer version | `pdfjs-canvas-v1` |
| page count | 3 |
| page statuses | all `ready` |
| page errors | none |
| page byte metadata | 24,012; 547,798; 526,865 |
| private Storage reads | all succeeded |
| Storage byte lengths | exactly matched database metadata for all 3 pages |

This proves the hosted worker can claim a queued Takeoff job, render pages,
write private preview objects, update page state, complete the job, and expose
the resulting data through the existing application-owned path.

## Security and product preservation

The proof changed none of:

- organization tenancy or ownership checks;
- RLS or Storage policies;
- Auth or permissions;
- service-role scope;
- worker-token boundary;
- drawing-set source files or measurement data;
- commercial lineage;
- database schema or migrations.

Secret values were not recorded in this document or committed to either
repository.

## Remaining limitation

GitHub Actions scheduled polling is sufficient for the fictional Alpha proof,
but it is not yet the final dedicated always-on worker platform for a real
customer. GitHub schedule latency, billing/runner capacity, alert routing,
concurrency under sustained workload, and multi-client worker isolation still
need explicit production decisions. The remaining 1Y phases must also
commission other required workers, cron routes, providers, email, integrations,
and operational coverage.

Therefore:

**Takeoff worker proof: PASS.**

**Complete Customer #1 production readiness: NOT YET ESTABLISHED.**

## Next recommended capability

Continue with the next smallest independent Phase 1Y commissioning boundary:

1. scheduled/cron operations and failure alerting, or
2. transactional Auth/invite email delivery,

while retaining this Takeoff worker proof as the baseline for future worker
runtime selection.
