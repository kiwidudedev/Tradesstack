# TradesStack customer provisioning runbook

Status: 27 October 2026. This runbook covers the reusable provisioning path for
new customers. It is the operating procedure for Business Hub and the Main
control plane; it is not a second provisioning system.

## 1. Authority and supported modes

- TradesStack Main (`github.com/kiwidudedev/Tradesstack`) is the only product
  and release authority.
- Business Hub owns the commercial record, implementation, plan approval and
  audit trail. The Main control plane performs repository/configuration work.
- Customer repository owner: **`tradesstack`**. This is the initially supported
  owner for both web and Worker repositories.
- Supported modes:
  - **web-only** — no TradesStack Worker (mobile) application. No Worker
    repository, Worker release, distribution profile or store signing.
  - **web + Worker** — the existing web and Worker provisioning path.
- Customer repositories are snapshots, not forks. They contain no Main history.

## 2. Business Hub preconditions

Do not start provisioning until the Hub chain is complete:

1. Customer registered (`/sales/new`: company, contact, lead).
2. Discovery, scope, pricing and an approved quotation.
3. Proposal issued and customer acceptance recorded with evidence.
4. Implementation created through `create_implementation_plan` with an active
   `OWNER`/`ADMIN`/`IMPLEMENTATION` lead.
5. Dedicated Supabase project created and its 20-character ref recorded.
6. For Worker customers, the Worker release and profile are approved.

The database refuses an implementation without accepted, matching proposal and
quote evidence. Do not insert an implementation directly.

## 3. Plan inputs

| Input | Web-only | Web + Worker |
| --- | --- | --- |
| Customer key | required (`tradelynk`) | required |
| Display name | required | required |
| Web release | approved official release | approved official release |
| Worker enabled | `false` | `true` |
| Worker release | not used | approved official Worker release |
| Environment id | required (`tradelynk-production`) | required |
| Supabase project ref | required, dedicated | required, dedicated |
| Provider | `github` for real customers | `github` |
| Branding/modules | required | required |
| Worker app name | not used | required |
| Distribution | not used | `internal` or `store` |

The Hub computes the default deployment identity:

- Worker: `tradesstack-<customerKey>`
- R2 bucket: `tradesstack-<customerKey>-documents`
- Initial URL: `https://tradesstack-<customerKey>.tradesstack.workers.dev`
- Health/version endpoint: `<initial URL>/api/health`

These are non-secret values. They are recorded in the customer repository at
`deploy/customer.json` and in `wrangler.jsonc`.

## 4. Provisioning execution

### 4.1 Through Business Hub (authorised path)

1. Open `/implementations/[implementationId]`.
2. In the provisioning panel, uncheck **Include the TradesStack Worker
   application** for a web-only customer.
3. Complete the plan and save it. The job is `PLANNED`; nothing is created.
4. Approve as `OWNER`, `ADMIN` or `IMPLEMENTATION`. The job becomes `QUEUED`.
5. The Cloudflare Queue/container claims the job and runs
   `scripts/ops/customer-provision.mjs --apply`.
6. Watch the steps. `worker-repository` is `SKIPPED` for web-only; all other
   steps must be `PASS` before `READY_FOR_DEPLOYMENT`.
7. Treat `PARTIALLY_PROVISIONED` as a failure to inspect, not a success. Retry
   resumes from the checkpoint.

### 4.2 Direct control-plane command

The Hub is the supported production path. The same engine can be run by an
authorised operator for a disposable test or recovery:

```bash
# Web-only
node scripts/ops/customer-provision.mjs \
  --customer-id acme \
  --display-name "Acme" \
  --web-only \
  --environment-id acme-production \
  --supabase-project-ref <20-character-ref> \
  --provider github \
  --owner tradesstack \
  --apply

# Web + Worker
node scripts/ops/customer-provision.mjs \
  --customer-id acme \
  --display-name "Acme" \
  --worker-profile ops/worker/profiles/acme.json \
  --provider github \
  --owner tradesstack \
  --apply
```

Useful flags:

- `--resume` — continue the same operation after a partial failure. The
  operation id must match; the engine does not recreate valid repositories.
- `--takeoff` — include the optional native takeoff renderer (queue/container).
  Off by default; TradeLynk does not enable it initially.
- `--web-release`, `--worker-release` — pin an approved release; otherwise the
  latest official release is used.
- `--worker-name`, `--r2-bucket`, `--site-url` — override the computed
  non-secret deployment identity.

## 5. What provisioning creates

For a successful run:

- private web repository `tradesstack/tradesstack-client-<key>` from the exact
  approved Main source SHA (no Main history);
- `client/config/<key>.ts` and `client/CLIENT_OWNERSHIP.md`;
- `release-manifest.json` with release id, source SHA, Main fingerprint, file
  hashes, customer config fingerprint and deployment identity;
- a deployable Cloudflare overlay:
  - `wrangler.jsonc` (customer env `production`)
  - `open-next.config.ts`
  - `cloudflare/worker.ts` (or the takeoff variant)
  - `cloudflare-env.d.ts`
  - `scripts/ops/prepare-cloudflare-assets.mjs`
  - `scripts/ops/validate-cloudflare-deploy.mjs`
  - `deploy/customer.json`, `deploy/README.md`
  - `.github/workflows/customer-ci.yml`, `customer-deploy.yml`
  - `client/DEPLOYMENT.md`
- optional Worker repository, profile and distribution config;
- one `ops/clients.json` entry with release provenance and deployment identity;
- durable `ops/provisioning/<key>/operation.json` checkpoint.

The deployment overlay is **customer-owned** and is not part of the release
file hash set, so Main upgrades preserve it. The provisioning engine seeds it
once; `promote-release.mjs` updates only its release/source fields.

## 6. Database bootstrap

Use the approved Phase 1O baseline, not a replay of all migrations. See
[`TRADESSTACK_CUSTOMER_DATABASE_BOOTSTRAP.md`](TRADESSTACK_CUSTOMER_DATABASE_BOOTSTRAP.md).

Summary:

```bash
CUSTOMER_DATABASE_URL=postgresql://... \
node scripts/ops/bootstrap-customer-database.mjs \
  --customer-key acme \
  --project-ref <20-character-ref> \
  --customer-repo /path/to/customer-repo \
  --backup-dir /secure/customer-backups \
  --apply
```

The command refuses platform project refs, a non-empty target, an unapproved
baseline and a mismatched host. It records exactly the baseline-covered versions
and the approved forward migrations, then verifies the ledger.

## 7. Cloudflare resources and secrets

Provisioning **prepares** the repository but does not create paid infrastructure
or deploy. Before deployment:

1. Create the private R2 bucket `tradesstack-<key>-documents` with a Cloudflare
   token that has R2 permission.
2. Set Worker secrets outside Git:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (only if scheduled jobs are enabled)
   - approved Xero/AI/email secrets for the customer scope
3. Set build/CI variables:
   - `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<customer anon key>`
   - `CLOUDFLARE_ENV=production`
   - `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` for the deploy workflow
4. Deploy:

```bash
CLOUDFLARE_ENV=production npm run cloudflare:deploy
```

The deploy preflight reads `deploy/customer.json` and `wrangler.jsonc` and
refuses Alpha/Main project references, Worker names, R2 buckets and release
aliases.

## 8. Verification

The customer app exposes `/api/health` with non-secret evidence:

- `x-tradesstack-release`
- `x-tradesstack-environment` (Supabase project ref)
- `x-tradesstack-environment-id`
- `x-tradesstack-worker`
- JSON `release`, `environment`, `sourceSha`, `releaseFingerprint`,
  `workerName`, `ok`.

Use the Business Hub environment verifier or:

```bash
CUSTOMER_DEPLOYMENT_URL=https://<worker>.tradesstack.workers.dev/api/health \
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
HUB_BASE_URL=... PROVISIONING_WORKER_TOKEN=... \
node scripts/verify-customer-deployment.mjs \
  --implementation-id ... --environment-id ... \
  --project-ref <ref> --release <version> --worker-name <worker>
```

A deployment is not verified until the endpoint reports the expected customer,
project ref, release and Worker, and Cloudflare confirms the Worker exists.
Migration verification is separate (`verify-customer-migrations.mjs`).

## 9. Retry, recovery and upgrades

- A partial job resumes from `operation.json`; existing repositories and
  configuration are reused, not recreated.
- A registry write is atomic (temporary file then rename).
- If the remote `main` diverged from the prepared snapshot, provisioning refuses
  to overwrite it.
- Upgrades use `promote-release.mjs`:
  - read-only preflight;
  - `--apply` materialises the release in a temporary worktree and runs release
    tests/typecheck/build;
  - `--push` creates `shell-upgrade/<release>` and a pull request;
  - merge, deploy explicitly, then optionally `--apply-db`.
- `promote-release.mjs` updates the customer deployment identity's release and
  source fields and preserves project/Worker/bucket/domain identity.
- Customer customisations live in `client/**`, `.env*` and the deployment
  overlay; release-owned drift blocks promotion.

## 10. Evidence levels

- **Code/local tests** — repository inspection, unit tests, E2E with a local
  provisioning provider.
- **Hub E2E** — authenticated operator plan/approve/worker against the hosted Hub
  database, with local repositories. This is not a live customer deployment.
- **Live provider** — created GitHub/Supabase/Cloudflare resources. Record the
  repository, deployment, migration ledger and verification results explicitly;
  do not describe local tests as live provider evidence.
