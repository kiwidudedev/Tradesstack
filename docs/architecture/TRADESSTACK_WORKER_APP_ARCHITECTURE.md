# TradesStack Worker App Architecture (authoritative)

Status: implemented and locally validated. This document is the authority for
the Worker App implementation model. It supersedes earlier informal assumptions
that the Worker App was a single shared application without a customer
configuration boundary.

Related documents:

- `docs/architecture/TRADESSTACK_BUSINESS_MODEL.md` — business model
- `docs/architecture/TRADESSTACK_CLIENT_CONFIGURATION_BOUNDARY.md` — web client configuration
- `docs/architecture/TRADESSTACK_CLIENT_APPLICATION_SHELL_RELEASE.md` — web shell release
- `docs/operations/WORKER_APP_OPERATIONS.md` — provision/release/upgrade runbooks
- `docs/architecture/TRADESSTACK_MOBILE_VARIATIONS_CONTRACT.md` — mobile Variations API
- Worker repository `docs/WORKER_APP_ARCHITECTURE.md` — mobile core notes

## A. Current architecture (audited, not assumed)

Before this change the Worker App was a single Expo/React Native repository
(`github:tradesstack/tradesstack-worker-app`, Expo SDK 54, expo-router 6,
React Native 0.81, React 19.1) with no customer configuration boundary:

| Area | Audited state | Risk |
|---|---|---|
| Repository | Separate Git repository; not represented in `ops/clients.json` | No release identity, no upgrade path |
| Configuration | Only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL`; the functions variable was declared but unused | Any build could target any project; no customer configuration |
| Application identity | `app.json` with a fixed name/slug/scheme and **no** iOS bundle identifier or Android package | No dedicated app identity; store builds impossible |
| Environment isolation | No project/environment identity, no build validation, no runtime assertion | A misbuilt artifact would silently read another environment's data |
| Sessions | Supabase session in SecureStore (native) / localStorage (web); no issuer/environment check | A stale or foreign session would be accepted |
| Customer data | Home screen fell back to hardcoded `'Studio Avenue'` / `'Caitlyn'` | Placeholder customer identity visible in production builds |
| Modules/navigation | Bottom tabs and quick actions hardcoded; bootstrap `capabilities` fetched but unused | Customer could not configure modules; UI ignored server permissions |
| Formatting | Variations money hardcoded to `NZD` with system locale | Wrong currency for non-NZD customers |
| Release/upgrade | No version manifest, no tests, no CI, no EAS profiles, no upgrade tooling | Main improvements could not be delivered safely |
| Local binding | `EXPO_PUBLIC_SUPABASE_URL` pointed at `mvxyxvrxaorzglppxzzz` (the reference/Main development project) | Confirms the need for an explicit environment binding |

The existing web release system (`ops/releases`, `scripts/ops/promote-release.mjs`,
`packages/client-config`, client-owned `client/**` paths) was already the correct
control plane for web/Main → customer delivery. The Worker App was simply
outside it.

## B. Selected architecture — Option C: separate repositories with a shared contract and one control plane

```text
                    TRADESSTACK MAIN (web + control plane)
        packages/worker-config        ops/worker/*            ops/clients.json
        (portable contract)           (releases, profiles,    (customer registry)
                                       provisioning, upgrades)
                    │                        │                       │
                    │ vendored artifact      │ release + upgrade     │ per-customer binding
                    │ (checksum-recorded)    │ records               │
                    ▼                        ▼                       ▼
                    TRADESSTACK WORKER MAIN (separate Git repo)
                    app/ · src/config · src/providers · vendor/
                    one mobile core, one build per customer environment
                                      │
                    ┌─────────────────┴──────────────────┐
                    ▼                                    ▼
            Customer A build                     Customer B build
            (own profile, bundle IDs,            (own profile, bundle IDs,
             environment, branding,               environment, branding,
             modules, extensions)                 modules, extensions)
```

**Option A** (two independent Mains with no shared contract) was rejected: it
would recreate web/mobile drift and lose the single registry/release/audit
trail the business model requires.

**Option B** (unified monorepo) was rejected for now: the Worker App has a
different toolchain (Expo/Metro/EAS), a different release cadence (store
review), separate signing credentials and native projects, and its own
repository history. Merging would be a large, risky restructuring with no
capability the contract + control plane does not already provide. The control
plane already spans repositories, exactly as it does for customer web repos.

**Option C** is therefore implemented: TradesStack Main owns the portable
contract and all customer/release metadata; TradesStack Worker Main owns the
mobile core; a customer implementation is a validated profile plus a dedicated
environment and an approved release pin. No per-customer source fork exists.

### Ownership matrix

| Artifact | Owner | Editable by customer? |
|---|---|---|
| Worker core (`app/**`, `src/**` except config) | TradesStack Worker Main | No |
| `@tradesstack/worker-config` contract | TradesStack Main | No |
| Vendored contract (`vendor/tradesstack-worker-config/**`) | generated from Main | No (checksum-verified) |
| Customer profile (`ops/worker/profiles/<client>.json`) | TradesStack Main ops | Config only, via change control |
| Registry binding (`ops/clients.json`) | TradesStack Main ops | No |
| Supabase project, secrets, signing, store listings | Customer environment / TradesStack ops | No (outside repositories) |
| Enabled modules/extensions/terminology | Customer profile | Yes (configuration) |

## C. Configuration contract

Implemented in `packages/worker-config` and vendored into Worker Main as a
compiled artifact (`dist/index.js` + `dist/index.d.ts` + checksum manifest).

A profile declares only:

- `clientKey` — must equal the customer's registry `clientId`;
- `identity` — app name (≤30 chars), slug, URL scheme, description;
- `distribution` — `internal` vs `store`, iOS bundle identifier, Android
  package, update channel;
- `environment` — `kind: hosted` with environment ID, display label, Supabase
  project ref (or `kind: local` with a loopback-only environment);
- `branding` — platform colour, action colour, splash colour, optional icon,
  logo and splash asset paths;
- `modules` — explicit enablement of `dashboard`, `time_clock`, `tasks`,
  `purchase_orders`, `variations` (dashboard always enabled);
- `navigation` — ordered tabs and up to six quick actions pointing at
  registered targets;
- `terminology` — optional label overrides for registered keys;
- `features` — explicit booleans for **implemented** features only
  (`notifications`);
- `extensions` — registered extension enablement with validated config
  (`home-notice`);
- `defaults` — optional locale/currency/timezone used only for display
  formatting.

Fail-closed rules enforced by the contract:

1. unknown fields are rejected at every level;
2. secret-shaped field names and values are rejected;
3. navigation targets and extensions must be registered and their modules enabled;
4. asset paths may not traverse outside the app root or use non-image types;
5. two customers may not share an environment ID, Supabase project, bundle
   identifier, Android package, scheme or update channel;
6. permissions, roles, workflow rules, SQL, API URLs beyond the environment
   binding, and secrets cannot be configured.

Precedence for display: organisation branding/data from the customer database
remains authoritative where it exists; the profile supplies deployment
defaults; the contract supplies no business semantics.

## D. Environment isolation (Worker → its own environment only)

```text
profile.environment ──┐
EXPO_PUBLIC_SUPABASE_URL ──► build gate ──► compiled build ──► runtime gate ──► data access
EXPO_PUBLIC_SUPABASE_ANON_KEY ┘   (strict)     (extra.workerBuild)  (URL + JWT iss)
```

- **Build time** (`app.config.ts` + `scripts/validate-build-environment.mjs`):
  the URL must resolve to the profile's Supabase project host, must be https
  (unless a local profile uses loopback), must not embed credentials or a path,
  and the public key must be an `anon`/publishable key. A `service_role` or
  secret key aborts the build. Strict mode (`CI`, `EAS_BUILD` or
  `TRADESSTACK_WORKER_STRICT_ENV=1`) makes a missing environment fatal.
- **Compiled binding**: profile fingerprint, environment ID, project ref,
  contract version and Worker version are embedded in `expo.extra`.
- **Runtime** (`src/config/runtime.ts`): the environment is re-resolved and
  compared with the compiled binding. Any mismatch renders
  `components/environment-error.tsx` before a provider, screen or network call.
- **Session** (`src/config/guards.ts`): the access token must be an
  `authenticated` token issued by `https://<project>/auth/v1`; otherwise the
  session is rejected and signed out.
- **Server**: organisation scoping, project membership, permissions, RLS and
  RPC guards remain the authoritative enforcement. UI gating is convenience
  only. Single-environment builds mean there is no environment-switching path
  to misuse.

## E. Customer-specific functionality model

Priority order (from the business model) is implemented as:

1. **Configuration** — branding, modules, navigation, terminology, feature
   flags, extensions, display defaults.
2. **Reusable Main capability** — new screens or workflows are developed in
   Worker Main and released to every customer from which they can be enabled.
3. **Controlled extension** — an extension ID registered in
   `WORKER_EXTENSIONS` with a validated config schema and a Worker Main
   implementation (currently `home-notice`). A profile may enable a registered
   extension; unknown extensions are rejected, and a release that removes an
   enabled extension blocks the upgrade.
4. **Permanent source divergence** — not implemented and not permitted by the
   release model. There is no per-customer Worker repository or patch layer.

Adding a customer-specific screen therefore means adding a reusable screen or
registered extension to Worker Main (with capability metadata), then enabling
it in that customer's profile. This keeps upgrades safe and preserves the
"improvements flow to Main" rule.

## F. Distribution strategy

Selected model: **hybrid — a dedicated white-label build per customer
environment, distributed through the channel the profile declares.**

- Default for managed customers: `internal` builds (TestFlight / Play internal
  testing / private distribution) with a dedicated bundle identifier.
- `store` builds are supported where commercially required and require explicit
  approval; the profile carries the store identity, and the release manifest
  records `approval.storePublish` (currently `NOT_REQUESTED`).
- One TradesStack-branded app serving many customer databases is **not** used
  as the default: it would require runtime environment switching, which is the
  highest-risk possible control for cross-customer leakage.
- EAS build profiles (`development`, `preview`, `production`) are added with
  strict environment validation. No signing credentials, push credentials or
  store listings exist in the repository, and no store submission was made.
- Over-the-air updates are recorded as unsupported
  (`distribution.supportsOverTheAirUpdate: false`) so that only a reviewed
  binary release can change the runtime.

## G. Release, compatibility and upgrade model

- Worker releases are immutable manifests in `ops/worker/releases/<version>.json`
  produced from a `git archive` snapshot of a Worker commit: sorted file list,
  per-file SHA-256, fingerprint, capability surface, compatibility floors,
  validation evidence and approval state.
- `ops/worker/product-version.json` points at the latest approved release.
- Compatibility is validated before provisioning and before an upgrade:
  - Worker mobile API contract version ↔ release capability version;
  - customer web release ≥ `minimumMainRelease`;
  - customer database migration target ≥ `databaseMigrationFloor` (the
    migration that introduced the mobile Variations contract);
  - every enabled module, feature, extension, tab and quick-action target must
    be supported by the target release.
- Web and Worker versions may differ; their API/database compatibility is what
  is validated.
- An upgrade never rewrites the customer profile. It records the preserved
  customisations, compatibility checks, conflicts, distribution impact and
  approvals in `ops/worker/upgrades/<client>/<from>__<to>.json`, and only then
  moves the registry pin. A conflict leaves the pin unchanged.
- Rollback is a deliberate operation: pin the previous approved release, rebuild
  the customer binary, and confirm the database still satisfies that release's
  floor. Package/Worker rollback is not database rollback.

## H. Risks and scaling to 50–100 customers

Resolved by this change: customer configuration drift, accidental
cross-environment builds, privileged keys in mobile bundles, hardcoded customer
identity, uncontrolled Main upgrades, missing child-product release identity.

Remaining architectural risks and mitigations:

| Risk | Current control | Still required |
|---|---|---|
| Store pipeline per customer | Profile-driven identifiers + EAS profiles | Apple/Google accounts, signing, listings, review strategy |
| Push notification isolation | Feature flag + profile placeholder | APNs/FCM credentials per customer, server-side token scoping |
| Alpha Worker backend | Verified read-only: functions absent (404) | Deploy mobile Edge Functions to Alpha with approval |
| Provider drift | `ops:worker`, `ops:drift` metadata checks | Live provider observation/monitoring |
| Contract distribution | Vendored artifact + checksums + drift check | Private registry decision if cadence grows |
| Database compatibility proof | Recorded migration targets + floor rule | Live ledger verification per environment |

## I. Verification summary

- Main: `ops:worker`, `ops:registry`, `ops:release`, `ops:version`,
  `ops:security`, `ops:drift`, control-plane contract tests, package
  boundary check, `tsc -p tsconfig.build.json`, 25 contract tests and 18
  control-plane tests pass.
- Worker Main: typecheck, ESLint, 22 contract/configuration/guard tests, vendor
  integrity and profile validation pass; `expo export --platform web` builds.
- Alpha: read-only probes only. The web deployment responds 200, but the mobile
  Edge Functions are **not deployed** (404), so the Worker App cannot operate
  against Alpha until that approved deployment happens.
- Not validated: native EAS builds, physical-device testing, store submission,
  hosted Worker deployment, live Supabase RLS/RPC execution for the Worker.
