# TradesStack Scheduler Architecture Assessment

## Status

**READ-ONLY ASSESSMENT — NO SCHEDULER PURCHASE OR ACTIVATION**

This assessment follows the Phase 1Y-D decision to stop testing the current
GitHub scheduled-workflow path. It evaluates the scheduler boundary for:

```text
Alpha → Customer #1 → multiple isolated customer applications
```

No provider account, cron registration, secret, database object, deployment or
customer environment was changed by this document.

## Current implementation authority

TradesStack exposes authenticated HTTP worker boundaries rather than embedding
scheduling in business logic:

- `app/api/cron/**/run/route.ts` contains the application cron endpoints.
- `lib/background-jobs.ts` independently gates each job through
  `TRADESSTACK_ENABLED_BACKGROUND_JOBS`.
- `lib/xero/env.ts` requires a strong `CRON_SECRET` for the Xero cron family.
- Representative non-Xero cron routes also require `CRON_SECRET` and fail
  closed on missing or incorrect bearer authorization.
- `app/api/takeoff/render-jobs/run/route.ts` is intentionally separate and
  requires exactly `TAKEOFF_RENDER_WORKER_TOKEN`; browser Auth is not a
  fallback.
- Jobs use bounded batches, leases/idempotency patterns and server-only
  credentials. A scheduler must invoke these boundaries, not replace them.
- The current local `vercel.json` is `{}`; no Vercel Cron is registered.

The current route inventory includes document cleanup, material supplier
pricing, QA evidence cleanup, retention, universal-learning stages, worksheet
memory/classification stages and Xero synchronization/status families. The
source contains 18 cron route families, with tests covering missing, invalid,
valid-secret and disabled-job behavior where applicable.

## Required scheduler properties

The first real customer requires more than a timer. The selected scheduler
must provide:

1. a bounded cadence appropriate to each queue;
2. authenticated invocation without exposing service-role or provider secrets;
3. retries/observability at the scheduler or job boundary;
4. per-client isolation of schedules and credentials;
5. safe duplicate delivery through existing idempotency/lease controls;
6. an operational owner and failure alert path;
7. a path from one Alpha instance to many separately hosted clients.

The Takeoff renderer is the tightest current cadence constraint: it needs a
short polling interval while a user is waiting for a queued render. Cleanup,
learning and accounting refresh jobs can use slower cadences, but they must
remain independently enabled and protected.

## Option comparison

| Option | Cadence / delivery | Security and isolation | Monitoring / retries | Scaling and complexity | Cost implication | Assessment |
|---|---|---|---|---|---|---|
| GitHub Actions `schedule` | Supports 5-minute minimum; current Alpha has repeatedly produced zero scheduled events. GitHub documents possible schedule delay. | Secrets are repository-scoped, but scheduler ownership is coupled to the source repository/account. | Manual run evidence exists; recurring delivery and operational SLA are not proven. | Simple for a fictional proof; poor production control plane across many clients. | GitHub Free includes a quota for private-repository Actions; exact account allowance must be confirmed. | **Not proven; retain only as development/backup fallback.** |
| Vercel Cron Pro | Per-minute minimum and per-minute precision on Pro; Hobby is once daily with ±59-minute timing. Invokes the deployed Function. | Natural per-client project boundary. `CRON_SECRET` can protect the endpoint; service-role/provider secrets remain in the project server environment. | Vercel provides cron logs, but does not retry failed invocations; application leases/idempotency remain mandatory. | Lowest operational complexity for the existing Next/Vercel client. Each isolated client registers its own schedules; a shared dispatcher route limits cron count. | Vercel Pro is currently listed at **US$20/month**, with US$20 included usage credit, before tax/overage. | **Best first-customer fit, not approved for activation.** |
| Supabase Cron / `pg_cron` + `pg_net` | Supports frequent schedules, including every minute, from the customer project. | Schedule state lives inside each customer database; secrets should be held in Supabase Vault. Strong project isolation, but database becomes part of the scheduler control plane. | `cron.job_run_details` provides run history; retry/HTTP failure handling still needs explicit design. | Good for DB-local maintenance and project-local Edge Functions; weaker fit for Vercel queue workers and cross-provider jobs. | Hosted availability and quota/cost must be confirmed for the exact Alpha plan; no assumption is made here. | **Secondary, domain-specific option; not the default platform scheduler.** |
| Cloudflare Workers Cron Triggers | UTC cron triggers; paid Workers allow long scheduled invocations, while Free has 5 triggers/account and tight CPU limits. | A central Worker can hold routing secrets, but creates a new shared control-plane blast radius. Per-client secrets must be isolated and never bundled into client-visible code. | Workers Logs and Cron Events provide history; application endpoint must handle retries/idempotency. | Strong low-cost central scheduler for many clients, but adds Cloudflare account, deployment and incident surface. | Free has limited quotas; Workers Paid is currently **US$5/month minimum** plus usage. | **Viable scale option after a deliberate control-plane build; not first-customer default.** |
| AWS EventBridge Scheduler | Central managed schedules, flexible windows, retries and failed-invocation retention; scales to very large schedule counts. | IAM execution roles, encrypted payloads and optional KMS; strongest formal isolation, but requires AWS IAM/secrets operations. | Native retry policy, DLQ/CloudWatch integration and schedule history are stronger than the current GitHub path. | Best long-term central scheduler for many isolated clients; highest setup and operational complexity. | AWS documents 14 million Scheduler invocations/month in the Free Tier, then US$1/million invocations; other target/logging/KMS costs may apply. | **Best long-term multi-client control plane if scale justifies AWS operations.** |

## Architecture recommendation

### Customer #1 / Alpha

Use a **per-client scheduler adapter** that invokes a single protected
application dispatcher endpoint, with the job routes remaining the existing
authoritative boundaries. For the first real customer, Vercel Pro Cron is the
recommended target because it keeps scheduler, deployment, environment
secrets and operational logs in the same isolated client project. It is the
smallest blast radius and least new infrastructure for Alpha.

The intended shape is:

```text
Vercel Cron (client project)
        ↓  authenticated CRON_SECRET
client scheduler dispatcher
        ↓  bounded, enabled, idempotent jobs
existing /api/cron/* and takeoff worker boundary
```

The dispatcher must not accept arbitrary job names from an unauthenticated
request. Its schedule-to-job map should be deployment configuration, and each
client should have its own `CRON_SECRET`, job enablement list and logs.

### Multiple isolated clients

Do not centralize customer database credentials or service-role keys in a
shared scheduler merely to reduce cron registrations. Initially keep the
scheduler registration per client. If the number of clients makes per-project
registration operationally expensive, introduce a separately secured central
scheduler control plane—preferably AWS EventBridge Scheduler for its retry,
scale and IAM model, or Cloudflare Workers for a lower-cost but more custom
control plane. The application dispatcher contract should remain unchanged.

This gives the platform an explicit evolution path without coupling business
jobs to Vercel, GitHub or a scheduler vendor:

```text
Scheduler adapter per client
        ↓
authenticated client dispatcher
        ↓
existing durable job/cron contracts
```

## Security decision

The scheduler must know only the minimum client-specific invocation secret.
It must never receive:

- Supabase service-role keys;
- database passwords or connection strings;
- Xero OAuth tokens;
- backup encryption keys;
- worker tokens except where the isolated worker boundary explicitly requires
  them and the scheduler is the approved server-side holder.

The Takeoff worker token remains distinct from `CRON_SECRET`. A browser request
must continue to receive `401`; a scheduler migration must not merge these
boundaries.

## Owner decision

**RECOMMENDATION: Vercel Pro Cron for the first real customer, with a
per-client authenticated dispatcher and existing queue/idempotency controls.**

This is an architecture recommendation only. Vercel Pro was **not purchased
or activated**. GitHub scheduling is recorded as **NOT PROVEN** and is not being
re-tested. Supabase Cron, Cloudflare Workers and AWS EventBridge remain
unactivated alternatives for later evaluation.

## Current readiness effect

This assessment does not close Customer #1 readiness. Until an approved
scheduler is configured and an actual scheduled invocation, failure signal,
retry/lease behavior and operational alert are evidenced, recurring background
execution remains uncommissioned.

## Scale architecture: 10, 50, 100 and 500 isolated clients

The scalable boundary is:

```text
Central scheduler control plane
  ├── schedule metadata: clientId, job, cadence, release/schema compatibility
  ├── per-client invocation credential reference
  └── delivery/retry/DLQ/alert records
             │
             │ narrow authenticated request only
             ↓
Client-local dispatcher
  ├── client-local job enablement
  ├── client-local queue/lease/idempotency
  ├── client-local worker runtime
  └── client-local Supabase DB/Auth/Storage
```

The central plane must not contain customer database passwords, Supabase
service-role keys, Auth credentials, Storage credentials, Xero tokens or backup
keys. It stores only opaque client identifiers, target metadata and references
to separately managed per-client invocation secrets. The actual job continues
to execute inside the client environment and uses that client's own isolated
credentials.

| Instance count | Recommended operating model | Why |
|---:|---|---|
| 10 | One Vercel Pro team may host the separate client projects; register a small number of client-local dispatcher Cron jobs per project and automate registration from the client registry. | Lowest new control-plane risk; one team plan need not mean one paid scheduler subscription per project, subject to provider billing confirmation. Each client retains project-level isolation. |
| 50 | Begin moving schedule delivery to a central scheduler adapter, while retaining the same client-local dispatcher and job contracts. Use per-client schedule groups/tags, bounded concurrency and per-client alert routing. | Manual per-project schedule operations become error-prone; centralized delivery improves fleet visibility without centralizing customer data. |
| 100 | Use a managed central scheduler such as AWS EventBridge Scheduler, with one schedule per client/job or a controlled fan-out model, per-client secret references, retries and DLQs. Keep worker execution client-local. | The schedule fleet is large enough to justify centralized retries, quotas, audit history and automation. |
| 500 | Use EventBridge Scheduler or an equivalent enterprise scheduler as a dedicated operations control plane, partitioned by environment/region and client cohort. Add schedule reconciliation, pause/resume controls, drift detection, per-client circuit breakers and fleet-level alerting. | At this size, per-project cron registration is an operational fleet problem; central scheduling scales while preserving tenant boundaries when the dispatcher remains narrow. |

### Important cost distinction

Duplicated **customer data planes** are intentional: each customer keeps its
own Supabase project, database, Auth, Storage, secrets and deployment.
Duplicated **scheduler infrastructure** is not necessarily required. A single
Vercel Pro team can host multiple isolated projects, and a central scheduler
can serve many client targets. Billing, quotas and operational limits must be
confirmed for the selected provider before activation; no such activation is
authorized by this assessment.

### Why the central scheduler must not become a central worker

Centralizing the scheduler is acceptable; centralizing customer work or
service-role access is not. A central worker that opens every customer
database, Auth system or Storage project would create a high-blast-radius
multi-tenant control plane and undermine the Master → isolated-client model.
The central scheduler should deliver a narrow, authenticated wake-up request.
The client dispatcher should select only deployment-approved jobs and invoke
the existing bounded workers. Every job remains retry-safe and idempotent.

### Recommended final direction

Use a **scheduler adapter abstraction** with two implementations:

1. **Per-client Vercel Cron adapter** for Alpha and the first small cohort.
2. **Central managed scheduler adapter** for fleet scale, preferably
   EventBridge Scheduler when the operational fleet reaches the point where
   per-project registration is costly.

Both adapters call the same client-local dispatcher contract. This avoids a
future rewrite of job semantics and preserves DB/Auth/Storage isolation at all
scales. Cloudflare Workers remains a credible lower-cost central alternative,
but would require more custom secret distribution, fleet reconciliation and
operational tooling than EventBridge.

### Worker topology decision

The scheduler and worker decisions are related but not identical:

- **Alpha and the first small cohort:** retain the client-local worker/runtime
  boundary. This keeps the first production blast radius small and preserves
  the current Takeoff worker-token and application deployment model.
- **Fleet target:** use a shared, stateless worker fleet for jobs that can be
  safely executed from a tenant-scoped job envelope. A worker receives only
  `client_instance_id`, job type, release/schema compatibility and an
  idempotency key; it obtains that client's narrowly scoped credentials just
  in time from the secrets boundary and never places customer data in the
  scheduler or queue.
- **Sensitive or client-specific execution:** retain a client-local endpoint
  or isolated execution cell where a job's security or provider boundary
  makes shared execution inappropriate. This is an exception based on blast
  radius, not a requirement to deploy a permanently dedicated paid worker for
  every customer.

The fleet target is therefore:

```text
Shared scheduler
      ↓
Shared queue + DLQ
      ↓
Stateless worker execution
      ├── client instance A credentials/context
      ├── client instance B credentials/context
      └── client instance N credentials/context
      ↓
Each client's own DB/Auth/Storage or protected client dispatcher
```

Workers must enforce an explicit instance context, per-instance concurrency
and rate limits, credential scoping, no cross-instance object caching, and
structured logs that contain identifiers but never secrets or customer data.
The shared fleet is an execution optimization; it is not permission to merge
customer databases, Auth systems, Storage buckets or provider accounts.

This phased model avoids two opposite mistakes: creating a high-blast-radius
central worker before the boundary is proven, or permanently multiplying paid
worker infrastructure as the number of isolated clients grows.

Email, Supabase Auth SMTP, AI, Xero provider activation and Site Safety remain
outside this pass exactly as previously approved. No provider fixture was
created merely to fill an evidence gap.

## Sources consulted

- Vercel Cron usage/pricing: <https://vercel.com/docs/cron-jobs/usage-and-pricing>
- Vercel Cron management/security/retry behavior: <https://vercel.com/docs/cron-jobs/manage-cron-jobs>
- Vercel current pricing: <https://vercel.com/pricing>
- GitHub scheduled workflow behavior: <https://docs.github.com/en/actions/how-tos/troubleshoot-workflows>
- Supabase Cron and scheduled Edge Functions: <https://supabase.com/docs/guides/cron>
- Cloudflare Cron Triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Cloudflare Workers pricing/limits: <https://developers.cloudflare.com/workers/platform/pricing/>
- AWS EventBridge Scheduler: <https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html>
- AWS EventBridge pricing: <https://aws.amazon.com/eventbridge/pricing/>
