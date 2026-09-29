# TradesStack Bootstrap Contract

## Purpose

This document defines what must exist or be configured after the candidate TradesStack schema has replayed on a new Supabase project. It preserves the current product and does not introduce demo data, client architecture, or production changes.

## Authority rule

The bootstrap contract is subordinate to the approved candidate schema history:

```text
504 committed migrations
        + Migration B
        + Migration C
        - Migration A
        ↓
schema and migration-owned reference data
        ↓
runtime Auth and organization bootstrap
        ↓
external Supabase/provider configuration
```

Do not duplicate migration-owned reference rows in a seed file. Do not use bootstrap for customer, historical, reconciliation, demo, or test data.

## Schema prerequisite

The candidate schema must replay successfully from empty state before bootstrap validation. Phase 0B.1 proved the 504 committed migrations plus B and C replay on disposable PostgreSQL 17.6/Supabase infrastructure. Migration A remains excluded.

## Seed strategy

**No production seed data is required.**

The repository has no `supabase/seed.sql`. Permission and role reference data are migration-owned; first-user and organization defaults are trigger-owned; business records are user-created or integration-created. `supabase/config.toml` therefore disables the absent seed path rather than pointing resets at a meaningless file.

## Reference data

| Data set | Authority | Fresh-install requirement | Ownership | Treatment |
|---|---|---|---|---|
| Permission catalog | Versioned migrations | Required | System-owned | Keep in migrations; 61 rows replayed |
| Role-permission mappings | Versioned migrations | Required | System-owned | Keep in migrations; five roles × 61 rows replayed |
| Statuses and allowed values | Columns, checks, enums and RPC contracts | Required | System-owned | Do not duplicate in seed |
| Storage bucket metadata | Versioned migrations/managed Storage schema | Required for active buckets | System-owned configuration | Replay-created buckets documented below |
| Plan defaults | Organization insert trigger | Per organization | System default | Starter plan, monthly trade-pack limit 4 |
| Retention capability | Organization insert trigger | Per organization | System default, configurable later | `retention_management = true` |
| Accounting Phase 2B settings | Organization insert trigger | Per organization | System default, configurable later | Both current flags default true |
| QA permissions | Versioned migration | Required | System-owned | No company QA templates seeded |
| Materials, suppliers and prices | User/import/integration workflows | Not required | Organization/user-owned | No production material rows |
| Cost codes and mappings | Organization configuration/import | Not required for empty organization | Client/organization-owned | No generic chart of accounts invented |
| Xero connections/tokens | User OAuth and external provider | Not required | Organization/integration-owned | Never seed fake connections or secrets |
| Notifications | Runtime/application events | No general notification seed found | Runtime/user-owned | Provider configuration remains external |
| AI/learning queues and records | Versioned schema plus runtime workers | No organization rows required | Runtime/organization-owned | Secrets and model configuration remain external |

## Permission catalog

The fresh replay created 61 `app_permissions` rows and 61 mappings for each current role: `owner`, `admin`, `qs`, `project_manager`, and `worker`.

Application permission calls were compared against the catalog. Active keys such as `leads.clients.write`, `leads.opportunities.write`, `materials.*`, `purchase_orders.write`, `qa.*`, `quotes.write`, `settings.organization.update`, `supplier_invoices.*`, `suppliers.write`, `variations.write`, accounting permissions, and retention permissions are represented.

The catalog also preserves legacy/system keys that are not necessarily active in current UI paths, including `retention.claims.xero_manage`, `retention.claims.xero.manage`, intelligence keys, file-monitoring, and settings-view keys. No permission key was removed.

## Role defaults

Membership roles are constrained to:

```text
owner
admin
qs
project_manager
worker
```

New self-signup creates an `owner`. Invites preserve the role on the pending invite, defaulting to `worker`. Role permissions are migration-owned and member-specific overrides remain organization data.

The org-scoped permission helper resolved representative owner permissions in the disposable bootstrap test. Active application callers now route through the current organization-aware server helper; the legacy global `has_permission(text)` SQL function remains preserved for compatibility and is not used as the current organization authorization path.

## First user

Normal signup creates:

1. the Auth user;
2. a new organization, using `raw_user_meta_data.organization_name` or `<email local part> Organization`;
3. an owner membership, using `raw_user_meta_data.full_name` or the email local part;
4. organization plan settings;
5. retention capability defaults;
6. accounting Phase 2B settings.

The database does not create a separate profile row in the current final contract. The first-user test produced no clients, projects, materials, QA templates, document workspaces, or AI interaction rows.

## Organization defaults

Current organization column defaults are:

- timezone: `Pacific/Auckland`;
- tax registration status: `unknown`;
- default currency: `NZD`;
- default tax mode: `GST Inclusive`;
- default tax rate: `15.00`.

Branding, contact, address, business number, GST number, bank details, and construction profile remain nullable/user-configured values. The NZD/GST defaults are current Master behavior, not an internationalization decision.

## Invitation bootstrap

The invite path requires:

```text
existing organization
  + pending organization_invites row
  + matching email
  + valid, unexpired invite token
        ↓
Auth user with matching invite_token metadata
        ↓
membership using invite role
        ↓
invite marked accepted
```

The disposable test created a `qs` invite, accepted it through the Auth trigger, and produced the expected membership and display name. Email delivery, redirect URLs, and invite Edge Function configuration remain external.

## Accounting defaults

No generic construction chart of accounts or fake accounting mappings are seeded. The organization insert trigger creates the current accounting Phase 2B settings. Cost codes, accounting mappings, tax-rate mappings, suppliers, and ledger data are organization/client configuration or user/import/integration data.

Xero OAuth credentials and tokens are never bootstrap rows.

## QA defaults

QA permissions and QA schema constraints are system reference data. QA templates, sections, fields, evidence rules, and project QA definitions are company-created through current RPCs. No sample QA checklist is part of production bootstrap.

## Materials defaults

No production materials, suppliers, products, prices, tax evidence, or development fixtures are required for an empty installation. Material libraries are imported or configured by an organization. Migration A remains excluded and must never become seed data.

## Commercial defaults

Quote, commercial-item, purchase-order, variation, claim, retention, supplier-invoice, and accounting statuses are owned by migrations, constraints, and application contracts. They do not require duplicated seed rows. Current candidate statuses from Migration C are schema-owned.

## Projects and opportunities

New installations require no sample projects, opportunities, numbering rows, pipeline records, or templates. Project/opportunity records and numbering are created by normal workflows and database functions when the organization uses those modules.

## Files and documents

No global organization document root or default folder is created by first signup. Document workspaces, nodes, versions, drawings, and attachments are created lazily by their current workflows. Storage buckets are installation configuration, not demo content.

## Notifications

No general notification-preference or notification-template table/default was identified in the current migration/application inventory. Current notifications are runtime/application behavior. Email provider and sender configuration are external.

## AI and Universal Learning

AI, memory, learning, observability, and queue tables are migration-owned schema. No organization AI settings row, model row, prompt row, budget row, or learning corpus is required for clean installation. API keys, model selections, worker allowlists, budgets, and provider enablement are environment/operator configuration.

## Xero and integrations

The schema and permission catalog must exist before integration use. A new installation must not contain fake Xero connections, OAuth states, tokens, contacts, bills, or sync history. Users connect Xero later using configured client ID, secret, redirect URI, scopes, and token-encryption key.

## Storage bootstrap matrix

| Bucket | Required | Created by | Access model | Policy authority | Result |
|---|---|---|---|---|---|
| `organization-documents` | Yes for document workspace | Migration | Private; server/reservation-mediated | Exact reservation INSERT plus service-role lifecycle functions | Present; no direct authenticated read policy required |
| `project-drawing-sets` | Yes for drawings | Migration | Private, organization/project path | Storage object policies plus project lineage | Present |
| `project-qa-evidence` | Yes for QA evidence | Migration | Private; signed/admin-mediated | QA database authorization plus service-role Storage operations | Present; no direct member object policy required |
| `project-quality-photos` | Yes for legacy quality | Migration | Private, project-scoped | Storage object helper policies | Present |
| `project-variation-attachments` | Yes for variations/PO attachments | Migration | Private, organization/project-scoped | Storage object helper policies | Present |
| `supplier-invoice-documents` | Yes for supplier invoices | Migration | Private, invoice-scoped | Permission-aware Storage object policies | Present |
| `material-library-imports` | Yes for material imports | Migration | Private, organization/import-scoped | Permission-aware Storage object policies | Present |
| `task-attachments` | Yes for tasks | Migration | Private, task-scoped | Storage object helper policies | Present |
| `organization-logos` | Yes for branding | Migration | Public URL read, privileged writes | Organization permission policies | Present |
| `retention-claim-documents` | Yes for retention documents | Migration | Private; service-role/application-mediated | Retention RPC authorization and admin Storage operations | Present; no direct member object policy identified |
| `project-images` | No confirmed active caller | None | Undefined | None | Legacy constant/helper only; no active upload/read call found |

`organization-documents`, `project-qa-evidence`, and `retention-claim-documents` are not automatically insecure merely because they lack ordinary bucket-specific member policies. Current code uses reservation or server/service-role paths for those workflows. Full Storage acceptance remains a later validation concern.

## Auth external configuration

Future provisioning must configure, without storing secrets in this document:

- Supabase site URL;
- application redirect URLs;
- signup/email-confirmation behavior;
- invitation redirect behavior;
- SMTP/provider behavior if email is enabled;
- Supabase project URL and public/anon key;
- service-role access only in server/Edge Function environments.

## Edge Functions

Current functions are deployed capabilities, not seed rows:

- `mobile_app_bootstrap` — Supabase URL/keys and mobile database contract;
- `mobile_clock_in_v2` — Supabase URL/keys and mobile/time-sheet contract;
- `mobile_clock_out_v2` — Supabase URL/keys and mobile/time-sheet contract;
- `send-invite-email` — Supabase URL/keys, Resend key, sender address, and application base URL;
- `time-sheets-rules` — Supabase URL/keys, cron secret, and explicit enablement.

No function was deployed during Phase 0C.

## Cron and workers

Vercel cron routes and Supabase/Node workers are deployment configuration. Database queues and lease tables are migration-owned and begin empty. Background jobs remain disabled unless their exact names are listed in `TRADESSTACK_ENABLED_BACKGROUND_JOBS`. Time-sheet rules additionally require `TIME_SHEETS_RULES_ENABLED` and `TIME_SHEETS_CRON_SECRET`.

## Environment inputs

| Category | Representative inputs | Bootstrap requirement |
|---|---|---|
| Required to boot | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, site URL | Required |
| Server database/Auth | server Supabase URL/key or database URL where used | Required for server paths; never commit values |
| Invites | `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `APP_BASE_URL` | Required only when invite email is enabled |
| Storage | Supabase URL/keys and server service-role access | Required for server-managed Storage workflows |
| AI | OpenAI/Anthropic keys and model/provider selections | Optional until AI modules are enabled |
| Xero | client ID/secret, redirect URI, scopes, token encryption key | Optional until an organization connects Xero |
| Workers | background-job allowlist, cron secrets, worker tokens | Optional and disabled by default |
| Development/test | E2E credentials, characterization DB URLs, live-test flags | Never production bootstrap |

## Client-configurable values

Future dedicated clients may configure branding, terminology, currency/tax values, company contact/address data, module enablement, approval thresholds, numbering conventions, templates, AI provider/model choices, worker enablement, and integrations. No client-configuration system is implemented by Phase 0C.

## Development/demo exclusions

Never include in production bootstrap:

- sample users or organizations;
- sample clients, opportunities, projects, suppliers, invoices, materials, QA templates, or files;
- Migration A fixture cleanup data or UUID allowlists;
- reconciliation SQL or customer/project-specific data;
- E2E fixture accounts and passwords;
- fake Xero connections, OAuth tokens, provider keys, or AI keys;
- local artifacts, generated candidates, or synthetic bootstrap records.

## Bootstrap acceptance

Disposable evidence supports:

- schema replay from empty state;
- migration-owned permission and role data;
- first-user organization/owner bootstrap;
- organization plan, retention, accounting, tax, currency, and timezone defaults;
- invite-role acceptance;
- clean absence of demo/business data;
- replay-created Storage bucket inventory.

Deferred acceptance items are complete Storage workflow coverage beyond organization logos, `project-images` final disposition, external Auth/provider configuration, Edge Function deployment, and full downstream Phase 0D workflow validation.

## Known deferred items

- Confirm hosted Auth/Storage configuration through a later approved metadata-only comparison.
- Resolve whether the legacy `project-images` constant should remain as an unused compatibility artifact or receive a separately approved migration.
- Preserve the legacy global `has_permission(text)` contract while keeping active application authorization organization-scoped.
- Complete the remaining Phase 0D.2 downstream application workflow validation.
