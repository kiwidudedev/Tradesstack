# TradesStack Worker App operations runbook

This runbook is for TradesStack operators maintaining dedicated Worker App
implementations. Architecture authority:
`docs/architecture/TRADESSTACK_WORKER_APP_ARCHITECTURE.md`.

Commands run from TradesStack Main unless stated otherwise. Nothing here
creates provider infrastructure, deploys, signs or publishes a store app.

## 0. Prerequisites

- Node.js 22.22.2 (`.nvmrc`) in both repositories.
- A checkout of the Worker repository next to Main, by default
  `../tradesstack-worker-app/tradesstack-worker-app`.
- `npm run build:worker-config` in Main (the tooling imports the built contract).
- No secrets are required for any validation command.

## 1. Provision a new customer Worker App

**Step 1 — create the profile.** Copy the documented fixture and edit it:

```bash
cp ops/worker/fixtures/wilson-construction.json /tmp/<client-id>.json
# edit clientKey, identity, distribution, environment, branding, modules,
# navigation, features, extensions, defaults
node -e "JSON.parse(require('fs').readFileSync('/tmp/<client-id>.json'))" # syntax check
```

Required choices:

| Field | Rule |
|---|---|
| `clientKey` | must equal the registry `clientId` |
| `environment.supabaseProjectRef` | the customer's dedicated Supabase project ref |
| `environment.environmentId` | globally unique per customer |
| `distribution.iosBundleIdentifier` / `androidPackage` | globally unique |
| `identity.scheme`, `distribution.updateChannel` | globally unique |
| `modules` | declare every module explicitly; dashboard must stay enabled |
| `features` | only implemented features (`notifications`) |
| `extensions` | only registered extension IDs |

**Step 2 — plan (no writes):**

```bash
node scripts/ops/worker-provision.mjs \
  --client-id <client-id> \
  --display-name "<Customer Name>" \
  --profile /tmp/<client-id>.json \
  --worker-release <approved version> \
  --target-release <customer web release>
```

**Step 3 — apply once the plan is clean:**

```bash
node scripts/ops/worker-provision.mjs ... --apply
```

This writes, atomically from the tool's perspective:

- `ops/worker/profiles/<client-id>.json`
- the `worker` binding in `ops/clients.json` (lifecycle `PENDING`)
- `ops/worker/provisioning/<client-id>.json` (steps, fingerprints, external actions)

Re-running with identical inputs reports `ALREADY_PROVISIONED` and writes
nothing. Conflicting inputs are `BLOCKED` with no writes. An existing customer
profile with different content is never overwritten.

**Step 4 — external actions** (no automation; require approval and provider
access; recorded as `NOT_PERFORMED`):

1. create the customer Supabase project; apply the Phase 1O baseline and
   approved migrations;
2. deploy mobile Edge Functions (`mobile_app_bootstrap`,
   `mobile_clock_in_v2`, `mobile_clock_out_v2`, plus any additional approved
   functions);
3. bind build secrets `EXPO_PUBLIC_SUPABASE_URL` /
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public anon key only) in the build
   environment;
4. create signing credentials and, for `store` customers, store listings;
5. configure push credentials if `notifications` is enabled;
6. build and distribute the Worker App through the approved channel.

**Step 5 — validate the build:**

```bash
cd ../tradesstack-worker-app/tradesstack-worker-app
TRADESSTACK_WORKER_PROFILE=../Tradesstack-ai/ops/worker/profiles/<client-id>.json \
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<public anon key> \
npm run config:validate -- --strict
```

A foreign project, non-https URL, path-bearing URL, service-role key or invalid
profile fails the gate.

**Step 6 — verify the control plane:**

```bash
npm run ops:worker
npm run ops:registry
```

## 2. Release a new Worker App Main version

1. Land the change in the Worker repository with typecheck, lint, tests and a
   build run. The CI workflow (`.github/workflows/worker-app-ci.yml`) enforces:
   vendor integrity, profile validation, typecheck, lint, tests, plus passing
   and failing environment-gate cases.
2. Confirm the contract is current: `npm run worker:sync-config -- --worker-root <path>`
   (or `worker:sync-config:check`), and commit the vendored artifact if it moved.
3. Create the immutable release manifest in Main:

```bash
node scripts/ops/worker-release.mjs --create --version <X.Y.Z> \
  --worker-root ../tradesstack-worker-app/tradesstack-worker-app \
  --sha <worker commit> \
  --typecheck PASS --lint PASS --tests PASS --build PASS_WEB_EXPORT \
  [--allow-dirty] --write
```

`--build PASS_WEB_EXPORT` means a static web export passed; it does **not**
claim a native or store build. `--allow-dirty` is only for a working tree that
contains unrelated uncommitted work; the snapshot is taken from the commit and
the excluded paths are recorded in the manifest.

4. Verify the manifest against the commit:

```bash
node scripts/ops/worker-release.mjs --verify --version <X.Y.Z> --worker-root <path>
```

5. Update `ops/worker/product-version.json` to the new release and run
   `npm run ops:worker`.

## 3. Upgrade one customer to a new Worker release

```bash
# plan (no writes)
node scripts/ops/worker-upgrade.mjs --client <client-id> --to <X.Y.Z>

# record the decision and move the pin
node scripts/ops/worker-upgrade.mjs --client <client-id> --to <X.Y.Z> --apply
```

The tool checks, in order: registry profile fingerprint, direct release
succession (`to.previousRelease === from`), release approval, profile/environment
compatibility, supported capability surface, web release minimum, database
migration floor, and distribution channel support.

Outcomes:

| Status | Meaning | Writes |
|---|---|---|
| `ALREADY_CURRENT` | customer is already on the target | none |
| `READY_FOR_CONTROLLED_UPGRADE` | all checks pass | none unless `--apply` |
| `UPGRADE_RECORDED` | audit record written, registry pin moved | `ops/worker/upgrades/...`, registry |
| `BLOCKED` | one or more conflicts | audit record only on `--apply`; pin unchanged |

Upgrades never rewrite the customer profile. Preserved modules, features,
extensions, tabs and quick actions are listed in the record. An existing record
with a different decision is never overwritten.

Rollback:

1. run the upgrade tool with `--to <previous approved version>` after confirming
   the release chain and database floor still hold (the tool refuses downgrades,
   so record the rollback as a new forward decision in the audit log and update
   the pin through a reviewed change);
2. rebuild and redistribute the previous binary;
3. verify with `npm run ops:worker`.

## 4. Compatibility policy

| Field | Meaning | Current value |
|---|---|---|
| `compatibility.mobileApiContractVersion` | Edge Function / mobile RPC contract | `2` |
| `compatibility.minimumMainRelease` | earliest web release carrying the mobile contract | `1.0.0` |
| `compatibility.databaseMigrationFloor` | migration introducing the current mobile Variations contract | `20261003160000_add_mobile_project_variation_capabilities_v1.sql` |

Raise these only when the mobile contract genuinely changes, and record the
reason in the release review.

## 5. Alpha validation record (read-only)

Probes performed from this environment on 2026-10-17 (no credentials, no
mutations):

| Check | Result | Interpretation |
|---|---|---|
| `https://tradesstack-alpha.tradesstack.workers.dev/` | HTTP 200 | Alpha web deployment is live |
| `https://ibjyzpyuqupsxqakpzxj.supabase.co/auth/v1/health` | HTTP 401 `UNAUTHORIZED_MISSING_API_KEY` | Alpha Supabase project is live; endpoint requires the anon key |
| `POST /functions/v1/mobile_app_bootstrap` on Alpha | HTTP 404 | **Mobile Edge Function is not deployed** |
| `POST /functions/v1/mobile_clock_in_v2` on Alpha | HTTP 404 | Not deployed |
| `POST /functions/v1/mobile_clock_out_v2` on Alpha | HTTP 404 | Not deployed |
| Same probes on the reference project `mvxyxvrxaorzglppxzzz` | HTTP 401 | Functions exist there; confirms the probe method |

Conclusion: Alpha configuration is prepared (`ops/worker/profiles/client-alpha.json`
targets project `ibjyzpyuqupsxqakpzxj`), but the Worker App cannot operate
against Alpha until the mobile Edge Functions are deployed there. That
deployment is an external, approval-gated action; it was not performed and no
Alpha database, migration, function or customisation was modified.

Also required before declaring Alpha Worker-ready:

1. confirm Alpha's applied migration ledger is at or beyond
   `20261003160000_add_mobile_project_variation_capabilities_v1.sql` (recorded
   registry target is `20261010123000_…`, but the live ledger must be re-read);
2. verify the mobile RPCs and RLS behaviour with an Alpha test worker account;
3. deploy the approved Worker build to the internal channel and record the
   build/version in `ops/clients.json` provenance.

## 6. Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| App shows "cannot start safely" | compiled environment invalid or mismatched | rebuild with the correct profile and strict validation |
| Session rejected on login | token not minted by the bound project | sign in again; if it repeats, the build/profile binding is wrong |
| `worker release blocked: secret-like content` | a real or synthetic credential pattern reached the snapshot | remove it; synthetic test fixtures must not resemble credential assignments |
| `profile fingerprint is stale` | profile edited without re-provisioning | re-run provisioning/upgrade to refresh the registry binding |
| `does not support: module …` on upgrade | enabled customisation no longer supported | keep the current release or reimplement the capability in Main first |
| `worker profile not found` in build | `TRADESSTACK_WORKER_PROFILE` wrong or missing | point at the Main-owned profile or a bundled profile |

## 7. Audit trail

| Record | Path |
|---|---|
| Approved Worker releases | `ops/worker/releases/<version>.json` |
| Current Worker release pointer | `ops/worker/product-version.json` |
| Customer profiles | `ops/worker/profiles/<client>.json` |
| Provisioning records | `ops/worker/provisioning/<client>.json` |
| Upgrade decisions | `ops/worker/upgrades/<client>/<from>__<to>.json` |
| Customer binding | `ops/clients.json` → `clients[].worker` |
| Operational contract export | `ops:control-plane` / published control-plane contract |

All records are append-only in practice: official releases are immutable and
existing upgrade/provisioning records are never overwritten.
