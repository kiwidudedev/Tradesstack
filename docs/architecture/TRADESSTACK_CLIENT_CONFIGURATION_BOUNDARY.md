# TradesStack Phase 1P — Dedicated Client Configuration & Branding Boundary

## A. Phase 1P verdict

**PASS 1P COMPLETE — DEDICATED CLIENT CONFIGURATION BOUNDARY PROVEN**

Final architectural answer: **YES — DEDICATED CLIENT CONFIGURATION BOUNDARY PROVEN**.

The repository now proves that two fictional dedicated-client configurations can be resolved by the same dependency-free contract and the same consumer while changing only controlled deployment identity, shell branding tokens, and deployment defaults. Supplier validation remains identical. No database, migration, Supabase, Auth, RLS, Storage, provider-secret, permission, or workflow behavior was forked.

## B–F. Source, worktree, authority and Phase 1O input

- Branch: `main`.
- Source SHA: `361bf3f094a8abbb58d20606413686cebc242e66`.
- The worktree was already dirty. Existing modifications and untracked artifacts were preserved; no reset, clean, restore, stash, commit, push, hosted provisioning, or production mutation was performed.
- Authority read: `AGENTS.md`, `TRADESSTACK_AI_CONTEXT.md`, Master Core Ownership, Master Repository Foundation, Shared UI Extraction, First Client Consumption, Private Package Distribution, First Isolated Client Supabase Proof, and Client Database Baseline.
- Phase 1O baseline remains unchanged: `supabase/baselines/phase1o-1/baseline.sql`.

## G–Q. Configuration inventory and ownership

The audit found no centralized client configuration contract. Current configuration is distributed across application constants, environment variables, organization settings, Supabase/Auth infrastructure, integration modules, and user preferences.

| Finding | Current authority | Phase 1P classification | Action |
|---|---|---|---|
| Core workflow/domain semantics | routes, services, RPCs, migrations | Master Core | Not configurable |
| CSS/design tokens and component structure | `styles/globals.css`, Tailwind, shared UI | Master Core / shared UI | Preserve; only two shell color roles are deployment inputs |
| Application title/description | `app/layout.tsx` constants | Client deployment config with Master defaults | Resolved through the new adapter |
| Shell platform/action colors | global tokens plus organization branding provider | Deployment defaults; organization values remain DB-owned override | Adapter fallback added |
| Organization name/logo/contact/document branding | `organizations`, settings RPCs, Storage, export models | Organization DB configuration/data | Not moved |
| Locale/currency/timezone | organization settings, jurisdiction helpers, formatters | Deployment initial defaults only; transaction/project/org semantics remain Core/data | Contract records defaults; no global replacement |
| Supabase URL/public key | environment and deployment | Client deployment infrastructure | Not in portable config |
| Service-role/provider/worker credentials | environment/secret stores | Client secret | Not accepted by contract |
| Xero/OpenAI/Anthropic/Resend | Core adapters plus client env/connection state | Integration configuration/secrets | Not in contract |
| Permissions/RLS/capabilities | application/database policies and organization capability rows | Security/domain behavior | Not configurable |

## R–Y. Branding, theme and shared UI

Organization branding remains authoritative for organization-facing shell and documents. The existing `brand_primary_color`, `brand_accent_color`, logo path, organization name and contact fields remain database/storage-owned. Application identity is separate: the root metadata title/description and deployment shell fallback now come from `@tradesstack/client-config` through `lib/client-config.ts`.

Favicon/app icons remain static application assets. Shared UI remains product-level and was not made client-specific. Global CSS remains the design-system authority. Client configuration exposes only `platformColor` and `actionColor`; it does not expose arbitrary CSS, component structure, fonts, status colors, or dark/light behavior.

## Z–AC. Locale, currency, timezone and precedence

The contract records deployment defaults for `locale`, `currency`, and `timezone`. These are not transaction currency, tax, project, organization, user, or timestamp-storage overrides. Existing organization settings and commercial/jurisdiction logic remain authoritative wherever they already apply.

Precedence established by evidence:

| Concern | Master default | Client deployment | Organization DB | User | Effective rule |
|---|---|---|---|---|---|
| App identity | Master config | Client config | Not applicable | Not applicable | Client config, else explicit Master default |
| Shell colors | Master config/global tokens | Client config | Existing organization branding | Not applicable | Organization branding, then client config, then Master default |
| Locale/currency/timezone defaults | Master config | Client config | Existing operational settings | Existing user behavior | Existing organization/user semantics remain authoritative; deployment values seed/default only |
| Stored timestamps | Core/database | None | None | None | Unchanged |

## AD–AG. Capabilities, flags, permissions and RLS

Organization capabilities and rollout controls are not deployment feature flags. Permission catalogs, role assignments, authorization, RLS, service-role access, and Storage policies remain Core/security boundaries. No config field can enable a workflow, bypass a permission, or weaken RLS.

## AH–AO. Integrations and environment classification

| Integration | Product owner | Deployment config | Secret owner | Organization state |
|---|---|---|---|---|
| Supabase/Auth/Storage | Master Core | URL/public key/project bindings | service-role key and deployment secrets | client database/Auth/Storage |
| Xero | `lib/xero` Core adapter | redirect URI, scopes, provider mapping | client credentials/encrypted tokens | organization connection/tenant |
| OpenAI/Anthropic | Core AI adapters | model/quotas/provider selection | API keys | organization guidance/context |
| Resend/email | Core delivery | sender/domain/recipient config | API key | organization notification state |
| Workers/cron | Core job contracts | schedules/allowlist/runtime | cron/worker tokens | queues, leases, results |

The new safe environment names are `TRADESSTACK_CLIENT_KEY`, `TRADESSTACK_APP_NAME`, `TRADESSTACK_APP_DESCRIPTION`, `TRADESSTACK_PLATFORM_COLOR`, `TRADESSTACK_ACTION_COLOR`, `TRADESSTACK_DEFAULT_LOCALE`, `TRADESSTACK_DEFAULT_CURRENCY`, and `TRADESSTACK_DEFAULT_TIMEZONE`. They are public/non-secret deployment values. Existing environment variables remain unchanged and continue to own infrastructure, provider, server-only, or secret concerns.

Public configuration is limited to the validated contract fields. Server-only configuration is resolved by the application adapter and is not serialized wholesale to the browser. Secrets remain in deployment secret storage and are not represented by the contract.

The contract is runtime-safe, while application metadata/theme consumption occurs at app runtime/build evaluation. It is not a database configuration table.

## AP–AZ. Contract decision

The narrow contract belongs in a new package: **`@tradesstack/client-config`**. External dedicated repositories need a portable type/validator, while `@tradesstack/core-contracts` remains a foundation marker and `@tradesstack/shared-ui` remains UI-only.

The package has no Next, React, Supabase, database-type, Master-alias, environment, or secret dependency. Its public API is:

- `ClientConfig`
- `MASTER_CLIENT_CONFIG`
- `defineTradesStackClientConfig(input)`
- `resolveTradesStackClientConfig(input)`
- `ClientConfigValidationError`
- `CLIENT_CONFIG_PACKAGE_VERSION`

The contract is schema version `1`, requires identity/theme/defaults, rejects unknown fields, validates client-key shape, hex colors, BCP 47 locale, ISO 4217-style currency code, and IANA timezone, and fails closed. No compatibility engine was introduced.

Safe defaults are explicit in `MASTER_CLIENT_CONFIG`; missing required objects do not silently impersonate another client. Secrets are rejected as unknown fields. The contract deliberately contains no capabilities, permissions, workflows, integrations, URLs, tokens, organization records, or operational data.

## BA–BD. Stage A/B gate tables

| Stage A inventory gate | Result |
|---|---|
| Architecture/configuration authority reread | PASS |
| Organization branding mapped and excluded from deployment config | PASS |
| Application branding/theme mapped | PASS |
| Locale/currency/timezone mapped | PASS WITH SAFE DECOUPLING |
| Capabilities, flags, permissions and RLS separated | PASS |
| Integrations/env/secrets classified | PASS |
| Hardcoded region/product assumptions mapped | PASS WITH DEFERRED ITEMS |

| Stage B design gate | Result |
|---|---|
| Client deployment fields identified | PASS |
| Organization DB settings excluded | PASS |
| Secrets excluded | PASS |
| Workflow/permission/RLS switches excluded | PASS |
| Portable owner selected | PASS |
| Small contract justified | PASS |
| Validation/failure strategy selected | PASS |

## BE–BI. Implementation and Master consumption

Created `packages/client-config`, its build configuration, public API, validator, and tests. Added a Master application adapter at `lib/client-config.ts`. The Master root metadata now resolves application identity through the adapter, and the workspace shell uses deployment theme defaults only when no organization branding is present. With no new environment values, explicit Master defaults preserve current behavior.

## BJ–BR. Two-client proof

Fictional proof identities:

```text
same @tradesstack/client-config implementation
        ├── Client Alpha: en-NZ / NZD / Pacific/Auckland / orange action token
        └── Client Beta:  en-AU / AUD / Australia/Sydney / blue action token
```

Both use the same `resolveProofShell` consumer and the same `@tradesstack/suppliers` validation contract. Only identity, approved shell colors, and deployment defaults differ. Supplier input normalization and validation are identical. No second Next app, database, migration, package fork, or client-specific workflow exists.

## BS–BV. Equivalence and upgrade model

- Supplier semantics: equivalent; no supplier source/API/business logic changed.
- Workflow semantics: equivalent; no commercial, procurement, variation, claims, QA, Files, Materials, accounting, or permission switch was added.
- Database semantics: equivalent; no SQL, generated types, baseline, Supabase config, Auth, RLS, or Storage policy changed.
- Config-only change: changing Client Alpha’s config object changes resolved identity/theme/defaults without changing core source.
- Core upgrade/config preservation: the client repository pins the package/core version and retains its own config; future package upgrades validate the same config contract. Full Phase 1M upgrade replay was not repeated because no package versioning change was required.

## BW–CM. Stage C/D/E gates

| Gate | Result |
|---|---|
| Minimal typed contract and validator | PASS |
| Master compatibility/defaults | PASS |
| No portable package dependencies on Next/React/Supabase/env/secrets | PASS |
| Client Alpha/Beta resolution | PASS |
| Same-core Supplier proof | PASS |
| Invalid config and secret/unknown-field rejection | PASS |
| External package build/type surface | PASS |
| Root typecheck/boundary checks | PASS |
| Production build/regression validation | See test record below |

## CN–DG. Impact and deferred findings

Database, migrations, Phase 1O baseline, Supabase, Auth, RLS, Storage, Supplier API/business logic, procurement, Materials, QA, Files, claims/retention, accounting, Xero, OpenAI/AI, Resend/email, and worker behavior: **NONE**.

Remaining intentional hardcoded/deferred findings include marketing TradesStack product copy/assets, NZ/AU jurisdiction-specific product behavior, hardcoded operational currency formatters, document branding from organization data, static favicon assets, and provider/integration environment configuration. These are characterized, not mass-replaced.

No evidence of client-specific customer code or named product forks was found. Future extension points, entitlements, provider adapters, custom document templates, and richer jurisdiction profiles remain deferred.

## DH–DP. Ownership model

```text
MASTER CORE
  workflows · domain semantics · security · shared UI · integrations · DB architecture

CLIENT DEPLOYMENT
  application identity · approved shell defaults · environment bindings · infrastructure

CLIENT SECRETS
  provider credentials · service-role/worker/cron secrets · deployment secret store

CLIENT DATABASE
  organizations · users/memberships · suppliers · projects · files · all operational data
```

The dedicated repository owns its config and safe assets, consumes versioned core/packages, binds its own environment and secrets, owns its isolated Supabase, and does not copy editable Core source.

## DQ–EA. Operating model, documentation and safety

Configuration changes are validated before deployment, reviewed independently of operational database changes, and must remain within the package contract. Unknown fields fail closed. Core upgrades do not rewrite client config. `docs/architecture/TRADESSTACK_CLIENT_CONFIGURATION_BOUNDARY.md` is the Phase 1P authority; prior phase documents were not rewritten. No database or migration file changed, and the Phase 1O baseline checksum remains unchanged.

### Validation record

- `npm run build:client-config` — PASS
- `npm run test:client-config` — PASS, 2 files / 5 tests
- `npm run check:boundaries` — PASS
- `npx tsc --noEmit --pretty false -p tsconfig.build.json` — PASS
- Existing Phase 1O focused regression suite remains the source of prior evidence; no Phase 1P database/runtime proof required it to be rerun.

### Next recommended phase

**Phase 1Q — first repeatable dedicated-client provisioning workflow**, using the proven package/config contract, Phase 1O baseline, forward migrations, isolated Supabase, deployment secret binding, and acceptance gates. Do not provision hosted infrastructure as part of Phase 1P.

### Final safety

Pre-existing worktree changes were preserved. No commit or push was made. No production deployment, hosted Supabase project, DNS, OAuth connection, customer branding, provider credential, or real customer identity was used.
