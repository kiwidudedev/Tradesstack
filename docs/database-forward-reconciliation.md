# Forward database reconciliation — 13 September 2026

This branch defines the intended forward contract from the operator's authoritative schema and migration-history exports, current application usage and the approved product decisions. No hosted database was contacted, no target ledger was repaired, and no workers or deployments were activated.

## Evidence and history

The supplied schema is PostgreSQL 17.6, exported on 2026-09-13 at 18:22:13 NZST. The target ledger contains 498 versions: the 497 base repository versions plus the previously applied fixture cleanup `20260810190000`. Of the shared histories, 482 normalize identically and 15 contain historical differences. Those old files are not edited or reapplied. The excluded cleanup remains outside candidate history. A fresh repository contains 504 migrations; the exported target has seven pending versions: the three existing worker migrations and four reconciliation migrations below.

The mobile foundation was recovered from unmerged `feature/mobile-backend`, commit `6aeec425a38062f92dffd078eb8270cb39d967fd`, where version `20260417170000` was described as applied manually. That old version remains absent from repository candidate history and target ledger. New versions formalize its supported schema without pretending the historical migration ran.

The exports have no application rows, storage metadata or managed role membership topology. They cannot prove historical data recovery, live backlog sizes or backup restorability. Legacy contact/labour creation provenance remains unknown; preserving those objects removes the need to guess or rewrite their history.

## Decisions

[Every one of the original 433 object differences](database-forward-decisions.json) is assigned the newly requested A–F decision vocabulary: A keep target (83), B keep repository (84), C combine (4), D formalize mobile (58), E preserve legacy without dependency (159), F remove from future contract (45). No unresolved G decision remains. These counts are object records, not migration counts. The original audit used different category meanings; this file supersedes those labels.

[The policy review](database-forward-policy-review.json) includes every removed policy's target DDL, retained repository policies and permission keys. The final shared column, function, index, view, enum and trigger definitions match between fresh replay and the upgraded export. Deliberate residual differences are three legacy tables and their objects; three old target RPC overloads/helpers; an unused repository trigger helper; managed bootstrap ACL defaults; and eight CHECKs that are validated on fresh replay but NOT VALID on the upgraded target reconstruction.

## Permissions

The forward migration removes 41 historical permissive write policies on shared client, opportunity, organization, purchase-order, quote and variation tables. Current permission-key policies and intended member reads remain. Four legacy client-location policies are replaced by member SELECT and `leads.clients.write` INSERT/UPDATE/DELETE; new/updated locations must reference a client in the same organization.

Mobile assignments require organization membership and `worker_user_id = auth.uid()` for authenticated reads. Authenticated users cannot create, update or delete assignments; service-role provisioning remains possible. Public/anon table privileges are revoked, and RLS is enabled and forced. Existing worker-owned time-entry policies are unchanged. This captures the database foundation, not a new mobile provisioning API or mobile application.

The current claim RPC still uses authenticated organization membership; reconciliation does not invent a new claim permission key. The older target claim overload has the same membership requirement and is preserved, not recreated. The target-only quote overload already checks `quotes.write`. The old spec-finishes helper is a membership-scoped read check. These legacy signatures are not dependencies of the current generated application contract.

## Selected function contracts

| Function | Forward decision |
| --- | --- |
| `resolve_cost_item_document_context` | Target: require authenticated context and organization authorization even under a database owner/security-definer caller. |
| `log_organization_invite_audit` | Target: deletion audit uses a null invitation FK and retains the deleted invitation ID in metadata. |
| `sync_project_job_todo_completion_fields` | Target: preserve compatible legacy `Complete` handling. |
| Four private supplier-invoice phase-AB procedures | Repository: retain organization checks and existing submission/review/approval idempotency guards. |
| `delete_opportunity_pricing_workbook_sheet` | Repository: deleting the default sheet synchronizes the parent from the selected replacement; deleting a nondefault sheet does not overwrite parent values. |
| `create_takeoff_commercial_item` | Repository: retain `#variable_conflict use_variable` and current publication contract. |
| `sync_organization_tax_policy_version` | Repository: preserve compatibility when optional tax settings are absent from a record, and align the tax trigger. |
| Accounting completion and admin/permission helpers | Repository canonical bodies; equivalent intended checks remain. |
| `set_updated_at_timestamp` | Target timestamp helper for recovered assignment triggers. |

Exact chosen bodies are in `20260913150000`; no wholesale replacement of all database functions occurs. The existing purchase-order assignment validation and timestamp triggers are recovered as well. CREATE OR REPLACE preserves existing function privileges.

## Mobile and active schema

`worker_project_assignments`: `id`, `organization_id`, `worker_user_id`, nullable `worker_member_id`, `project_id`, `is_active`, `created_at`, `updated_at`.

`worker_purchase_order_assignments`: those fields plus `purchase_order_id`. Authoritative primary keys, foreign keys, unique/index definitions and timestamps are retained with guarded creation.

`project_time_sheet_entries` gains `client_entry_id uuid`, `source text NOT NULL DEFAULT 'web'`, `created_from_device_id text`, `synced_at timestamptz`; recovered indexes enforce client-entry deduplication and one open shift per worker according to the exported definitions.

`organization_client_locations` gains the exact exported address, client/org linkage, primary/sort and timestamp contract. `organizations` gains 15 fields: address lines, brand colors, business/GST numbers, city/country/postcode, contact name/email/phone, default currency/tax mode/rate. `organization_clients` gains 11 fields: client status/type, credit risk, default margin, first/last name, lead source, notes, payment terms, primary-name source and referral. Exact types/defaults/nullability are copied from the authoritative DDL, including NZD/GST-inclusive defaults.

`organization_client_contacts`, `project_labour_budgets` and `project_labour_time_entries` remain untouched on target. Fresh replay does not invent them just to satisfy stale generated types. No current production source requires them.

## New migrations

| Version/file suffix | Purpose |
| --- | --- |
| `20260913130000_formalize_active_and_mobile_schema.sql` | Guarded active organization/client/location and mobile schema, indexes, constraints, RLS/grants. |
| `20260913140000_reconcile_permission_key_policies.sql` | Remove legacy policy bypasses; define supported location/mobile access. |
| `20260913150000_reconcile_safe_procedure_contracts.sql` | Selected safer procedure bodies and assignment/tax triggers. |
| `20260913160000_reconcile_indexes_and_check_contracts.sql` | Nine target indexes, existing assignment uniqueness, equivalent status-CHECK rename, eight missing repository CHECK rules. |

No new migration deletes application rows or drops/recreates a table. Guarded DDL assumes the operator-exported existing definitions; the preflight must detect subsequent drift. The eight missing CHECKs are added NOT VALID: existing rows are not scanned/repaired/deleted, but inserted or updated rows must satisfy the rule. A later explicit validation migration requires reviewed data evidence. Existing target uniqueness is already enforced; on other populated baselines, duplicate assignment rows must be checked first. Transactional index/constraint DDL can take locks; schedule a maintenance window appropriate to actual table sizes.

## Local verification and type generation

Three isolated local paths passed: fresh 0→504, restored prior candidate 500→504, and authoritative target schema reconstruction plus all seven pending migrations. Both `tests/sql/deployment-readiness.sql` and `tests/sql/forward-reconciliation.sql` pass on each path. Only a dedicated disposable local container was used. The schema reconstruction uses a synthetic local managed auth/storage/extension bootstrap, not an assertion that hosted platform configuration matches it. Application fixtures are rolled back; no hosted credentials or application data were used.

SQL regressions execute unauthorized and authorized writes, own-worker assignment visibility, denied self-assignment, mobile-entry deduplication, strict cost-item auth, invite-deletion auditing, cross-organization invoice rejection and legacy todo handling. They also inspect actual stored idempotency and takeoff guards. Complex financial idempotency paths are guarded-body assertions plus existing application regressions, not a claim that every financial workflow was executed against exported data.

Types were generated against fresh local replay using Supabase CLI 2.75.0/postgres-meta 0.95.2 for `public,private`. The reviewed generated output retains existing PostgREST 14.5 metadata and six explicit SQL-null argument contracts omitted by that generator: four variation date arguments and the optional organization filters on classification claim/list functions. No runtime casts, disabled checks, or widened unrelated types were introduced. Raw regeneration after the final migration produced identical types.

Production build passes (exit 0), with zero production TypeScript diagnostics. The critical suite is recorded separately in the local validation report; its accepted baseline is 1,545 passed, zero failed, 22 skipped.

## Operator preflight and recovery gate

[deployment-target-preflight-readonly.sql](deployment-target-preflight-readonly.sql) contains 58 SELECT-only statements, parsed with a read-function allowlist and EXPLAIN-validated locally. It is not run against target. It covers ledger state, exact columns/defaults, policies, RLS/grants, mobile/active contracts, selected function body fingerprints, worker RPC ACLs, CHECK violations, assignment duplicates, cross-organization lineage, role topology, storage privacy/reference coverage and queue backlogs. Expected fingerprints describe the post-migration contract, so differences before migration are expected.

Before any later hosted migration decision, an operator must:

1. Reconfirm target identity and export freshness; run preflight with adequate read-only visibility. RLS-filtered zero counts do not prove a globally empty backlog. Do not weaken RLS to run this file.
2. Review actual CHECK violations, lineage anomalies, storage policies/bucket limits, role permission rows and backlog/lease counts. Do not automatically delete or backfill anomalous data. Preserve the NOT VALID state until remediation is separately approved.
3. Obtain a timestamped restorable database backup including application data, auth, migration ledger and appropriate managed-role/configuration evidence; verify restore into an isolated destination. Define RPO/RTO and verify PITR retention if available. Save storage object bytes and metadata separately; database/schema exports alone do not back up object contents.
4. Keep worker/cron activation off through migration verification. Record schema/functions/policies before applying each transaction and assess lock duration. Re-run catalog and security verification afterwards with a separate application rollout decision.
5. Prefer a forward correction if application compatibility fails. A Git revert does not undo database DDL. Restore from the verified backup only under an explicit recovery decision accounting for writes after the backup; do not blindly drop new mobile columns/tables or re-enable broad policies.

No target-data, permission, worker activation or deployment approval is implied by pushing this branch.
