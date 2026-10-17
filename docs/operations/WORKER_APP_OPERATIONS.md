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

## 3a. Artifact lifecycle (build / distribution / install)

A release pin is only a **target**. It never means a binary exists. Record the
real lifecycle, with evidence, separately:

```bash
# after a customer-specific binary exists
node scripts/ops/worker-artifact.mjs --client <client-id> --release <X.Y.Z> \
  --stage BUILT --channel internal \
  --evidence "EAS build <id> / local iOS Release build" \
  [--artifact-sha256 <sha256>] --apply

# after publishing to a channel
node scripts/ops/worker-artifact.mjs --client <client-id> --release <X.Y.Z> \
  --stage DISTRIBUTED --channel internal \
  --evidence "TestFlight build <n>" --apply

# after observing an installed version
node scripts/ops/worker-artifact.mjs --client <client-id> --release <X.Y.Z> \
  --stage INSTALLED --channel internal \
  --evidence "device reports Worker <X.Y.Z>" --apply
```

Rules enforced by the tool and `npm run ops:worker`:

- DISTRIBUTED requires BUILT for the same release and the customer's current
  target;
- INSTALLED requires DISTRIBUTED, unless the channel is explicitly local
  (`local-simulator`, `local-device`) for local validation;
- events are append-only and live in `ops/worker/distribution/<client>.json`;
- `ops/worker/upgrades/*.json` records the target with
  `artifactState.builtRelease/distributedRelease/installedApplicationVersion`
  set to `null` and a note that no binary was built by the pin change.

Never infer "deployed" from a registry pin.

## 4. Compatibility policy

| Field | Meaning | Current value |
|---|---|---|
| `compatibility.mobileApiContractVersion` | Edge Function / mobile RPC contract | `2` |
| `compatibility.minimumMainRelease` | earliest web release carrying the mobile contract | `1.0.0` |
| `compatibility.databaseMigrationFloor` | migration introducing the current mobile Variations contract | `20261003160000_add_mobile_project_variation_capabilities_v1.sql` |

Raise these only when the mobile contract genuinely changes, and record the
reason in the release review.

## 5. Alpha validation record

Alpha is the controlled Worker validation environment:
`https://tradesstack-alpha.tradesstack.workers.dev`, Supabase project
`ibjyzpyuqupsxqakpzxj`.

### 5.1 Backend deployment (performed 2026-10-17)

The Worker App requires three Edge Functions. Alpha previously had none
(HTTP 404). They were deployed from the committed Main source, explicitly
targeting Alpha:

```bash
supabase functions deploy mobile_app_bootstrap --project-ref ibjyzpyuqupsxqakpzxj --use-api --yes
supabase functions deploy mobile_clock_in_v2   --project-ref ibjyzpyuqupsxqakpzxj --use-api --yes
supabase functions deploy mobile_clock_out_v2  --project-ref ibjyzpyuqupsxqakpzxj --use-api --yes
```

`supabase functions list --project-ref ibjyzpyuqupsxqakpzxj` now reports all
three ACTIVE. Each returns HTTP 401 without a bearer token (proof the gateway is
enforcing auth, not a 404). No database row, policy, secret, migration or
function on another project was changed.

The older v1 functions (`mobile-bootstrap`, `mobile-clock-in`,
`mobile-clock-out`) exist only on the reference project and are unused by the
current Worker App; they were deliberately **not** deployed to Alpha.

### 5.2 Database compatibility

Alpha's migration ledger cannot be read from this workstation because the
database password is not available (the CLI requires it for
`supabase migration list`). Compatibility was therefore verified functionally
instead of by filename:

- every mobile RPC the Worker App calls exists in Alpha
  (`list_tasks`, `list_mobile_project_purchase_orders_v2`,
  `list_mobile_project_variations_v1`,
  `get_mobile_project_variation_capabilities_v1`,
  `resolve_mobile_project_member_context_v2`) and returns an
  authentication-required error rather than "function not found";
- the mobile Variations contract (migration
  `20261003160000_add_mobile_project_variation_capabilities_v1.sql`) is
  therefore applied;
- authenticated calls returned real Alpha rows for tasks, purchase orders and
  variations.

Re-read the live ledger when a database password is available and record the
exact migration versions in this section.

### 5.3 Isolated validation fixture

A dedicated, clearly named fixture was created in Alpha (never reusing or
mutating existing commissioning data):

| Item | Value |
|---|---|
| Worker account | `worker-e2e@tradesstack.invalid` (password held only in the operator's temporary env, never committed) |
| Organization | `worker-e2e Organization` (auto-provisioned by the Alpha user trigger) |
| Membership | role `worker` |
| Project | `Worker E2E Fitout` (`E2E01`), active `project_members` row |
| Records | PO `E2E-PO-001` (Approved, 287.50), task `E2E site check`, variation `E2E-VO-001` (Draft, 138.00) |

Cleanup: delete the auth user `worker-e2e@tradesstack.invalid` (which removes
its organization membership) and the `Worker E2E Fitout` project/records when
the environment is retired. Alpha's single-organization-per-user constraint
means the fixture user cannot join an existing organization.

**Existing Alpha data needed a mobile commissioning step.** Before validation,
Alpha had **zero `project_members` rows** (the reference project has nine). The
mobile bootstrap lists only projects assigned through `project_members`, so any
pre-existing Alpha account saw an empty dashboard and no POs/time clock even
though Alpha owned real purchase orders. Two memberships were created:

| Account | Organization | Project | Result |
|---|---|---|---|
| `alpha-worker.phase1xa3@tradesstack.invalid` | `alpha-owner.phase1w` | `26001 Alpha Fictional Build` | PO `26001-PO-01` (287.50), 1 task, 2 variations |
| `corey` (owner) | `corey Organization` | `Cashel St Office Fitout` (Construction) | PO `26005-PO-01/02` (13,907.64 / 23,184.00), time clock enabled |

A tender-workspace project rejected the membership with "Project is not
delivery-eligible"; assign the awarded/delivery project, not the tender
workspace. This is environment commissioning data, not application code.

Verified in the API, the browser app and the native iOS app:
- Alpha `corey Organization` dashboard with six tabs including Time Clock and
  POs, plus the PO quick action;
- `alpha-owner.phase1w Organization` lists PO `26001-PO-01`, detail total
  287.50 (subtotal 250.00, GST 37.50), 1 task and 2 variations.

### 5.4 Results (2026-10-17)

| Suite | Result |
|---|---|
| `node scripts/verify-worker-alpha.mjs` (read-only readiness) | **19/19 PASS** |
| Alpha API E2E (login, bootstrap, tasks, POs, variations, clock in/out, cross-org denial, worker permission denial) | **20/20 PASS** |
| Browser E2E against the Alpha web build (identity, dashboard, modules, tasks, PO list/detail/financials, variations, clock in/out, persistence, foreign-session rejection) | **32/32 PASS** |
| Native iOS Release build `1.1.1` + install on iPhone 17 Pro simulator | **Build Succeeded**; `CFBundleShortVersionString 1.1.1`, bundle `com.tradesstack.worker.clientalpha`; app launched with the Alpha profile and rendered the Alpha organization, six tabs (including POs and Time Clock) and the PO quick action |
| Android native build | **NOT EXECUTED** — no Android SDK/Java on this workstation and no EAS project configured |
| Store distribution | **NOT EXECUTED / NOT APPROVED** |

Defects found and fixed in Worker Main during live validation (released as
1.1.1):

1. custom request headers broke the Edge Function CORS preflight;
2. purchase order detail failed entirely when the edit snapshot was denied;
3. `total_purchase_order_price` was not mapped for display;
4. the shared bootstrap cache made the time clock render stale state after a
   clock mutation.

Known contract limitation (not a defect): the mobile purchase-order **list** RPC
returns no financial total, so the list shows "Total pending"; the detail screen
shows the authoritative total.

## 6. Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| App shows "cannot start safely" | compiled environment invalid or mismatched | rebuild with the correct profile and strict validation |
| Session rejected on login | token not minted by the bound project | sign in again; if it repeats, the build/profile binding is wrong |
| `worker release blocked: secret-like content` | a real or synthetic credential pattern reached the snapshot | remove it; synthetic test fixtures must not resemble credential assignments |
| `profile fingerprint is stale` | profile edited without re-provisioning | re-run provisioning/upgrade to refresh the registry binding |
| `does not support: module …` on upgrade | enabled customisation no longer supported | keep the current release or reimplement the capability in Main first |
| `worker profile not found` in build | `TRADESSTACK_WORKER_PROFILE` wrong or missing | point at the Main-owned profile or a bundled profile |

## 6a. Known repository access issue

The local Worker repository is configured with the remote
`github:tradesstack/tradesstack-worker-app`. On 2026-10-17 that repository was
not resolvable with the available credentials (`Repository not found`), and no
Worker repository exists under the current owner account. Consequences:

- Worker CI (`.github/workflows/worker-app-ci.yml`) cannot run remotely yet;
  the same checks run locally (`npm run check`).
- The Worker release PR cannot be opened until the remote exists.
- Approved Worker release manifests record the configured repository identity;
  `ops/worker/product-version.json` records the verification status explicitly.

Creating or repointing the remote is an external owner action and was not
performed.

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
