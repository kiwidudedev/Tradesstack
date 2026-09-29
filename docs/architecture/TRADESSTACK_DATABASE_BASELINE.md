# TradesStack Database Baseline

## Phase 0B — Database Authority and Migration Reconciliation

Status: **Phase 0B candidate authority established; Phase 0B.1 replay proof completed; Phase 0C bootstrap contract documented; Phase 0D.1 remediation replay completed**

This document records the repository evidence for the database required by the preserved TradesStack product. It does not claim that the current hosted Supabase project matches the repository, and it does not claim that a fresh database replay has passed.

No hosted Supabase database was contacted or modified. No migration, DDL, DML, storage operation, Auth operation or database replay was executed.

## Authority verdict

The closest current authority is a **controlled composite**, not one definitive source:

```text
Committed historical migrations
        +
Forward reconciliation documentation and candidate migrations
        +
Current application/test expectations
        +
Generated database types as evidence only
        ↓
Candidate TradesStack database definition
```

The composite is not yet authoritative because:

- the hosted migration ledger was not safely inspected;
- the hosted schema was not safely inspected;
- no disposable Supabase/Postgres environment was available;
- Docker was unavailable (`supabase status` could not connect to the Colima Docker socket);
- committed migrations do not fully explain the generated/application contract according to `docs/deployment-readiness.md`;
- three untracked migrations affect the effective current database state;
- `supabase/seed.sql` is configured but absent.

The correct future authority should be:

```text
Approved historical migrations
        +
Approved forward reconciliation migrations
        +
Defined system reference-data contract
        ↓
Fresh replay
        ↓
Generated database contract
        ↓
Security and Storage verification
```

That result remains a Phase 0D objective, not an achieved state.

## Current migration ledger

Verified repository state:

```text
Committed migration files: 504
Current migration files:   508
Latest committed file:     20260913160000_reconcile_indexes_and_check_contracts.sql
Latest current file:       20260926100000_fix_organization_logo_storage_policy_scope.sql
```

Untracked migrations:

1. `20260810190000_cleanup_phase1_material_test_fixtures.sql`
2. `20260913170000_fix_commercial_item_takeoff_reference_read_permission.sql`
3. `20260913180000_align_supplier_invoice_accounting_resolution_status.sql`
4. `20260926100000_fix_organization_logo_storage_policy_scope.sql`

No duplicate migration timestamps were detected. The untracked fixture cleanup is chronologically located before later committed migrations, while the two September migrations extend the current committed head.

Static keyword inventory across the current 507 files found, as file counts rather than live-object counts:

- 257 files containing table creation or alteration;
- 343 files containing function creation/replacement;
- 171 files containing RLS or policy statements;
- 141 files containing trigger statements;
- 11 files containing Storage bucket statements;
- 357 files containing data-write statements;
- 182 files containing destructive keywords.

These counts do not prove that all objects survive in the final schema. Later migrations replace or remove earlier objects.

## Migration authority matrix

| Domain | Committed migrations | Generated/app expectations | Current authority status |
|---|---|---|---|
| Auth/bootstrap | Signup triggers, organizations, memberships and invites exist in migrations | `hooks/use-auth.ts`, `lib/projects-server.ts` expect organization membership | Candidate supported; empty-project execution unverified |
| Organizations/settings | Core tables and permission/settings migrations exist | Branding, tax, profile and settings fields are expected | Drift documented; reconciliation required |
| Roles/permissions | Permission catalog, role mappings, overrides and helper RPCs exist | Server helpers call `has_permission` and `has_org_permission` | Candidate supported; final hosted state unverified |
| CRM/clients | Client/contact foundations and later repairs exist | Client, location and contact fields are used by application paths | Reconciliation required; docs identify fresh-replay gaps |
| Opportunities/projects | Lifecycle, promotion, conversion and project migrations exist | Both promotion and legacy conversion remain active | Transitional but product-required |
| Pricing worksheets | Large worksheet schema/RPC history exists | Worksheet services and tests depend on many RPC contracts | Candidate supported; fresh replay unverified |
| Takeoff/drawings | Drawing, page, calibration, geometry and publication migrations exist | `source_takeoff_measurement_id` is used by publication/reload paths | Untracked grant migration is a required candidate |
| Commercial items/quotes | Commercial foundation and hardening migrations exist | App reads provenance while locked metadata remains private | Security contract requires Phase 0B/0D verification |
| Purchase orders/variations | Tables, lineage, publication and status RPCs exist | Current workflows depend on final function bodies and RLS | Candidate supported; hosted state unverified |
| Supplier invoices/accounting | Extensive workflow and accounting migrations exist | Application produces newer accounting-resolution statuses | Untracked constraint migration is a required candidate |
| Claims/retention | Revision, ledger, snapshot and Xero migrations exist | Current financial paths depend on repeated function replacements | Candidate supported; data-dependent history requires replay proof |
| QA/legacy quality | New QA engine and older quality tables both exist | Both remain part of preserved product | Transitional and intentionally retained |
| Files/documents/storage | Document workspace, drawing, QA and attachment storage migrations exist | Multiple private buckets and signed URL paths are used | Bucket/policy manifest still unverified |
| Materials | Material/product/import/price migrations exist | Fixture cleanup and supplier-price compatibility are present | Fixture migration excluded pending human/data decision |
| AI/learning/queues | Usage, quota, interaction, memory and queue migrations exist | Worker/cron RPCs are expected | Candidate supported; worker activation state unverified |
| Mobile/time sheets | Time-sheet and later mobile/assignment reconciliation material exists | Edge Functions expect mobile/worker tables and fields | Explicit reconciliation dependency |
| Notifications/integrations | Xero/OAuth/audit and invite-related structures exist | Provider configuration is external | Schema candidate; hosted/provider setup unverified |

## Untracked migration A

File: `supabase/migrations/20260810190000_cleanup_phase1_material_test_fixtures.sql`

Verdict: **EXCLUDE FROM MASTER MIGRATION HISTORY — HUMAN DECISION REQUIRED FOR ANY DATA OPERATION**

Evidence:

- explicitly labelled controlled development-only cleanup;
- embeds exact UUID allowlists and protected UUID allowlists;
- locks material tables;
- disables and restores an append-only trigger;
- deletes material, supplier-product, price, import, assignment and intelligence records;
- asserts exact populated-row counts and post-cleanup counts;
- depends on a particular historical database fixture state;
- is not required to create the schema or preserve application capability.

It is not a generic Master schema migration. It may be retained as a separately approved data-operation artifact, but it must not be applied to a new client database or current hosted database as part of normal schema replay.

## Untracked migration B

File: `supabase/migrations/20260913170000_fix_commercial_item_takeoff_reference_read_permission.sql`

Verdict: **INCLUDE IN THE CANDIDATE MASTER FORWARD MIGRATION SET, PENDING DISPOSABLE SECURITY VERIFICATION**

Evidence:

- the application reload path includes `source_takeoff_measurement_id`;
- takeoff publication migrations create and return this provenance field;
- `20260707133000_lock_down_commercial_item_reads_and_lineage.sql` restricts authenticated reads to explicit safe columns;
- the untracked migration grants only the missing provenance column;
- it deliberately does not expose `locked_metadata_json`;
- tenant row security remains governed by existing policies.

This is a security/compatibility migration, not a feature redesign. Phase 0D must verify the exact column grant, RLS behavior and cross-organization isolation.

## Untracked migration C

File: `supabase/migrations/20260913180000_align_supplier_invoice_accounting_resolution_status.sql`

Verdict: **INCLUDE IN THE CANDIDATE MASTER FORWARD MIGRATION SET, PENDING DISPOSABLE CONSTRAINT VERIFICATION**

Evidence:

- `lib/accounting/types.ts` and accounting resolvers produce `needs_accounting_mapping`, `needs_accounting_setup` and `invalid_tradesstack_cost_code`;
- supplier invoice allocation writers persist these outcomes;
- the current committed constraint does not clearly include all values used by current application code;
- the untracked test directly exercises the migration and rejects unknown statuses;
- the migration preserves historical statuses and replaces only the status check constraint.

Phase 0D must prove that the candidate constraint supports every current writer while rejecting invalid values.

## Reconciliation SQL

The untracked reconciliation SQL is not generic Master schema:

- `airbourne-road-historical-award-pricing.sql`: customer/project-specific award-pricing reconciliation;
- `backfill-current-organization-award-pricing.sql`: organization-specific pricing backfill;
- `metro-ceilings-fitout-conversion.sql`: project-specific conversion reconciliation;
- `reconcile-bucklands-promoted-project-metadata.sql`: one-record promoted-project repair.

These files contain customer/project identifiers, guarded data mutation or rollback logic. They are classified as **data-specific reconciliation inputs**, not migration history. They must not be applied to a new client database or converted into generic Core migrations.

## Generated types

`lib/supabase/types.ts` is the tracked generated application contract and evidence of an expected schema. It is not currently authoritative because:

- no repository generation script was found;
- no CI regeneration/diff gate was found;
- deployment documentation identifies fields expected by generated contracts but absent from committed fresh replay;
- `lib/supabase/types 2.ts` is an untracked zero-byte duplicate/candidate;
- untracked migrations affect the current database contract.

No types were regenerated or replaced during Phase 0B.

## Application expectation gaps

The highest-confidence gaps requiring reconciliation are:

1. Organization profile/tax fields expected by generated/application contracts but not clearly present in committed replay.
2. Organization client detail and location/contact fields identified in `docs/deployment-readiness.md`.
3. Labour, worker-assignment and time-sheet synchronization fields identified in deployment/reconciliation documentation.
4. `commercial_items.source_takeoff_measurement_id` read access, addressed by untracked migration B.
5. Supplier invoice accounting-resolution status values, addressed by untracked migration C.
6. Storage bucket/policy completeness for all application-referenced buckets.
7. Final function bodies and signatures after hundreds of repeated `CREATE OR REPLACE FUNCTION` migrations.

These are not application changes. The preserved application is evidence of the database contract that the Master database must support.

## Function and RPC authority

The database is an active business-logic layer. Critical families include:

- signup and organization bootstrap;
- membership and permission helpers;
- opportunity/project lifecycle;
- pricing worksheet reads and writes;
- commercial item creation and publication;
- quote, PO and variation publication;
- takeoff publication;
- claims and retention snapshots;
- supplier invoice workflow;
- QA definitions, responses, evidence and signatures;
- accounting revisions and Xero synchronization;
- AI quota, interaction and learning queues;
- cleanup, leasing and dead-letter processing.

Many functions are replaced repeatedly by later migrations. Final authority cannot be established from the first creation file; it requires replay or an authoritative catalog comparison. No hosted function catalog was inspected.

## Trigger authority

Important trigger families include:

- Auth signup and organization bootstrap;
- timestamp synchronization;
- invite audit;
- organization tax/settings synchronization;
- commercial lineage and validation;
- document-version progression;
- QA evidence/signature state;
- immutable accounting/material facts;
- queue/job lifecycle and cleanup.

The final trigger set is not proven because no disposable replay or hosted catalog comparison was performed. Historical trigger replacement and disabling behavior must be evaluated in Phase 0D, especially for destructive/data-dependent migrations.

## RLS and permission authority

Committed migrations provide extensive RLS, FORCE RLS, policies, grants and SECURITY DEFINER helpers. The intended security model is organization membership plus permission checks, not UI-only hiding.

The final security authority remains unverified because:

- hosted policies/grants were not inspected;
- a fresh database was not replayed;
- the final policy state results from many later replacements;
- generated/application contracts and reconciliation documents identify historical policy differences.

Phase 0D.1 replay asserted RLS state, policies, permission catalog completeness, storage policy scope and cross-organization denial behavior. Full security proof remains Phase 0E.

## Storage authority

Application and migration evidence covers these buckets:

- `organization-documents`
- `project-drawing-sets`
- `project-qa-evidence`
- `project-quality-photos`
- `project-variation-attachments`
- `supplier-invoice-documents`
- `material-library-imports`
- `task-attachments`
- `organization-logos`

Application code also references `project-images`; its creation and policy coverage require explicit Phase 0D verification.

Bucket creation and policies are distributed across migrations. No hosted Storage metadata was inspected, so complete fresh-install security is not established.

## Auth dependencies

Migrations depend on Supabase-managed `auth.users` for:

- organization creation;
- membership creation;
- invite acceptance;
- owner/admin role bootstrap;
- audit records;
- permission checks.

Auth trigger ordering and first-user behavior are migration-defined but untested against an empty disposable project in this pass.

## Extensions

The migrations explicitly enable `pgcrypto` in the `extensions` schema in several files. This is the only PostgreSQL extension directly identified by static migration inspection as required. Its availability and schema placement must be asserted in fresh replay.

Supabase-managed Auth, Storage and extension schemas are external dependencies and are not fully represented by application migrations alone.

## Seed dependency

`supabase/seed.sql` is absent. Phase 0C evidence established that no production seed rows are required: permission/reference rows are migration-owned and first-user/organization defaults are trigger-owned. The seed path is now disabled in `supabase/config.toml`; no seed file was created.

Current conclusion:

- migration replay should not require seed data merely to create schema objects;
- permission/reference rows are inserted in multiple migrations;
- first-user organization bootstrap is trigger-driven rather than seed-driven;
- complete onboarding defaults and optional reference data are not yet separated cleanly;
- missing `seed.sql` is a reproducibility/configuration blocker, but was not experimentally tested because no disposable database was available.

The full Phase 0C bootstrap contract is documented in `docs/architecture/TRADESSTACK_BOOTSTRAP_CONTRACT.md`.

## Hosted migration comparison

**NOT VERIFIED**

No hosted migration ledger was inspected. The repository contains local Supabase temporary linkage metadata, but that does not prove safe read-only authorization or establish that the linked project is appropriate to inspect. No hosted connection was attempted.

## Hosted schema comparison

**NOT VERIFIED**

No hosted tables, columns, functions, triggers, policies, grants, extensions or Storage metadata were queried. Existing documentation explicitly states that hosted database presence/schema had not been inspected.

## Fresh replay result

**Phase 0B.1 disposable replay completed for the candidate schema set.**

An isolated temporary Supabase project was created outside the repository with a distinct project ID and ports. It replayed the 504 committed migrations, followed by candidate migrations B and C, with Migration A excluded and seed execution disabled. The normal local `Tradesstack-ai` stack was not reset or reused.

The Phase 0D.1 fresh replay applied the corrected candidate chain, including the logo Storage policy migration. The final disposable migration ledger contained 507 entries, ending at `20260926100000`.

Catalog evidence from the disposable database:

- PostgreSQL 17.6;
- 290 public relations, 800 public functions and 371 non-internal triggers;
- 477 public policies, with RLS enabled on 274 public relations and forced on 253;
- Auth, Storage, Realtime, Extensions and Supabase migration schemas present;
- `pgcrypto` present;
- representative organization, CRM, opportunity, project, takeoff, commercial, procurement, variations, invoices, claims, retention, QA, documents, materials, accounting, AI/learning, mobile and timesheet structures present;
- 61 permission-catalog rows present;
- representative application RPCs resolved, including commercial, takeoff, procurement, QA, accounting, supplier/material, permission and mobile/time-sheet functions.

Migration B passed a controlled two-organization test: the authenticated Org A user read the provenance column on its own commercial item, saw zero Org B rows, and was denied access to `locked_metadata_json`. Migration C accepted all eight current application statuses and rejected an unknown status. The Auth signup trigger was also exercised with a synthetic disposable user and created an organization, owner membership and display name.

Storage metadata created the referenced buckets except `project-images`, which remains referenced by application code but absent from the replay bucket catalog. Policies were present for the replay-created buckets, but full Storage acceptance remains a later pass.

Fresh generated TypeScript types were written only to a temporary file. They differ meaningfully from the tracked contract: the replay generation omits the tracked private-schema/legacy function metadata and includes the standard `graphql_public` contract. The tracked `lib/supabase/types.ts` was not replaced.

Required Phase 0D procedure:

1. Provision or identify a disposable local/temporary Supabase project.
2. Prove it is not production, staging or shared.
3. Replay the approved candidate migration set from zero.
4. Record the first failure without skipping migrations.
5. Inspect resulting schema, migration ledger, functions, triggers, RLS, grants and Storage.
6. Run the fresh-install security and representative application contract suite.

## Recommended Master migration set

The future Master set should be:

```text
504 committed historical migrations
        +
approved forward migrations B and C, if disposable verification passes
        -
development-only fixture cleanup A
        -
customer/project-specific reconciliation SQL
        +
Phase 0C system/reference-data contract
```

This is a candidate recommendation, not an approved migration release. Historical migrations should remain unchanged. Any required correction should be forward-only unless a migration is proven never to have been released or applied.

## Human approval items

- Whether fixture cleanup migration A was applied anywhere and whether it should remain permanently excluded.
- Whether the hosted migration ledger/schema can be inspected safely using an approved read-only credential.
- Whether migrations B and C have already been applied to the hosted environment.
- Whether documented reconciliation target state is the intended current product database.
- Any historical migration requiring rewrite, squash, renumbering or destructive correction.
- Any production data-specific reconciliation operation.

## Phase 0C inputs

- Missing `supabase/seed.sql`.
- Permission/reference data inserted across migrations.
- Organization/accounting/material/QA default data boundaries.
- First-user/default-organization bootstrap behavior.
- Optional demo/test fixture separation.
- Auth and Storage configuration that cannot be represented as generic seed rows.

## Phase 0D inputs

- Candidate migration set and exact ordering.
- Migrations B and C.
- Exclusion of fixture cleanup A.
- Generated type comparison.
- Function and trigger catalog assertions.
- RLS/policy/grant assertions.
- Storage bucket/policy assertions.
- Auth bootstrap test.
- Representative commercial, takeoff, QA and file workflow tests.
