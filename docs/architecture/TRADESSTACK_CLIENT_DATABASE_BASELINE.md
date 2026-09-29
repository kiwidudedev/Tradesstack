# TradesStack Phase 1O — Client Database Baseline + Forward Migration Proof

## A. Phase 1O verdict

**PASS 1O COMPLETE — CLIENT DATABASE BASELINE + FORWARD MIGRATION PROVEN**

Architectural answer: **YES — BASELINE + FORWARD MIGRATION CLIENT BOOTSTRAP PROVEN.**

The proof established:

```text
PATH A — HISTORICAL REFERENCE
empty disposable DB → 504 migrations through cut → fingerprint A

PATH B — NEW CLIENT
empty disposable DB → versioned baseline Phase1O-1 → 3 forward migrations → fingerprint B

fingerprint A == fingerprint B
Auth/RLS acceptance A == Auth/RLS acceptance B
```

This is a proof baseline, not yet a hosted provisioning service or production release.

## B–F. Source, worktree, authority, and Phase 1N input

### B. Source state

- Branch: `main`
- Source SHA used for the baseline: `361bf3f094a8abbb58d20606413686cebc242e66`
- Hosted/production Supabase was not contacted or mutated.

### C. Pre-existing worktree

The worktree was already dirty before Phase 1O, including application, package, proof, documentation, and migration work from prior phases. It was preserved; no reset, clean, restore, commit, push, or history rewrite was used.

### D. Phase 1O ownership

Phase 1O changes are the baseline artifact, baseline-forward proof runner/package wiring, and this authority document. Existing unrelated dirty changes remain user-owned and were not overwritten.

### E. Authority documents read

`AGENTS.md`, `TRADESSTACK_AI_CONTEXT.md`, Master/database baseline and ownership/foundation documents, fresh-install acceptance, Phase 1N isolated Supabase proof, private package distribution, Supplier public contract, and Supplier public read-model documents were used as guidance and checked against current migrations, source, tests, and the executable proof.

### F. Phase 1N authority

Phase 1N’s disposable-target guard, 507-migration candidate replay, ordinary-user Auth/RLS acceptance, worker denial, Supplier package consumption, and safe cleanup were reused. The Phase 1O proof extends that infrastructure rather than creating a second security model.

## G–O. Migration and reconciliation authority

### G. Current migration count

- Current candidate files: 508
- Candidate replay files: 507
- Committed files: 504

### H. Migration range

The ordered candidate range begins at `20260228173000_create_organization_accounts.sql` and ends at `20260926100000_fix_organization_logo_storage_policy_scope.sql`.

### I. Exclusions

Only `20260810190000_cleanup_phase1_material_test_fixtures.sql` was excluded. It is a data-specific fixture cleanup operation with UUID allowlists and historical fixture assumptions, not a new-client schema operation.

### J. Classification

The current chain contains schema, enum/type, constraint, index, function/RPC, trigger, RLS/policy, permission/reference-data, Storage-policy, legacy-compatibility, and data-transformation operations. The proof treats final schema/security state—not historical SQL concatenation—as the baseline authority.

### K. Fresh-bootstrap authority

For this proof, the strongest executable repository authority is an empty local Supabase environment plus the 507-file candidate replay. No hosted schema or migration ledger was safely available for read-only inspection.

### L. Migration ledger authority

The proof uses Supabase’s supported `migration repair --local --status applied` to represent the exact 504 migrations embodied by the baseline, then `db push --local --include-all` applies only the three unrepresented post-cut migrations. Existing clients continue normal forward migrations.

### M–N. Hosted reconciliation and safety

Hosted live-state reconciliation is **DEFERRED**. No safe, already-established read-only mechanism was available, so no credentials were obtained and no hosted connection was attempted. The live-state safety decision is therefore repository/local authority only; production baseline readiness remains conditional on later live-state reconciliation.

### O. Repository/local reconciliation

The migration-derived full replay and baseline-derived state were compared across 5,073 columns, 2,828 constraints, 1,231 indexes, 867 functions, 601 triggers, 276 RLS relations, 450 policies, and 366 permission/reference rows. No material differences remained.

## P–U. Ownership and data boundaries

### P. Schema ownership

- TradesStack-owned: `public`, `private`, and the TradesStack functions/tables/policies/triggers in those schemas.
- Supabase-managed: `auth`, `storage`, API gateway and platform internals.
- Extension-owned: PostgreSQL/Supabase extensions and generated platform internals.

### Q–R. Supabase vs TradesStack objects

The baseline stores the `public` and `private` TradesStack state. The Supabase-managed Auth internals are not dumped. The one required TradesStack-owned Auth boundary—`on_auth_user_created` on `auth.users` invoking `public.handle_new_user()`—is represented explicitly. Storage platform internals are not owned by the baseline.

### S. Security authority

Security is first-class: functions, triggers, RLS flags, policies, permission catalog, role permissions, and the Auth bootstrap hook are included or compared. Table-only equivalence is not accepted.

### T. Reference-data authority

`app_permissions` and `role_permissions` are baseline-owned product reference data. They are exported from the clean cut-point database and inserted idempotently. Their semantic rows, not just counts, are fingerprinted.

### U. Operational-data exclusion

No organizations, users, suppliers, projects, invoices, QA records, files, customer configuration, or other operational rows are in the baseline. Auth users and proof fixtures exist only inside disposable runtime databases.

## V–X. Fingerprints and normalization

### V. Schema fingerprint

The fingerprint covers columns/types/defaults/nullability, constraints, indexes, functions and normalized definitions, triggers, and RLS enablement/force state in `public` and `private`.

### W. Normalization rules

Object ordering and JSON key ordering are canonicalized. Column ordinal position is intentionally excluded because it changed only through dump/replay representation while column identity, type, default, nullability, constraints, indexes, and behavior matched. Volatile IDs, timestamps, Auth users, and operational rows are excluded.

### X. Security fingerprint

Policies include schema/table/name/command/roles/USING/WITH CHECK expressions. Security fingerprints include function and trigger definitions, RLS flags, policies, and permission/reference rows. A final hash is accepted only when the independent schema, security, and reference-data hashes all match.

## Y. Stage A gate

| Gate | Result |
|---|---|
| Authority reread | PASS |
| Migration count/exclusions verified | PASS |
| Categories and data-dependent operations characterized | PASS |
| Current bootstrap authority identified | PASS WITH SAFE DECOUPLING |
| Hosted live reconciliation | DEFERRED |
| Repository/local security reconciliation | PASS |
| Production mutation required | PASS — NONE |
| Historical migration rewrite required | PASS — NONE |

## Z–AQ. Reference database and Stage B

### Z–AA. Reference identity/isolation

The reference targets were disposable projects `tradesstack-client-1o-ref-cut` and `tradesstack-client-1o-ref-current`, on ports `61521–61533`, with `127.0.0.1` database hosts. The target guard rejected the protected Master identity/ports before each start.

### AB–AF. Reference replay

Both reference databases started empty and replayed the candidate chain. The cut reference applied 504 migrations; the current reference applied 507. The excluded fixture migration was applied to neither. Duration was not treated as an authority metric.

### AG–AI. Reference ledger/fingerprints

The cut ledger contains the 504 historical versions through `20260913160000_reconcile_indexes_and_check_contracts.sql`. The current replay contains all 507 candidate versions. Fingerprints were generated with the method above.

### AJ–AP. Reference acceptance

Reference-at-cut Auth, organization bootstrap, membership, Supplier persistence/mapping, positive own-organization reads, cross-organization read/write denial, worker permission denial, and anonymous denial all passed. The current full replay was the final-state comparison authority.

### AQ. Stage B gate

| Gate | Result |
|---|---|
| Empty reference start | PASS |
| Full accepted replay | PASS |
| Ledger characterized | PASS |
| Schema/security/reference fingerprints | PASS |
| Auth/organization/Supplier/RLS acceptance | PASS |

## AR–BI. Baseline strategy and Stage C

### AR–AS. Strategy and identity

Baseline strategy: versioned proof baseline plus forward migrations. Baseline identity: `TradesStack DB Baseline Phase1O-1` / `phase1o-1`. Database baseline numbering is independent from npm, app, and deployment versions.

### AT–AU. Cut point

The baseline represents the exact state through `20260913160000_reconcile_indexes_and_check_contracts.sql`, 504 migrations. This cut leaves three real candidate forward migrations, making ledger and forward behavior testable without a synthetic product migration.

### AV–AZ. Generation/provenance

- Generated from the clean cut-point reference via Supabase schema dump.
- Artifact: `supabase/baselines/phase1o-1/baseline.sql`
- Source SHA: `361bf3f094a8abbb58d20606413686cebc242e66`
- SHA-256: `52ac69bea6587301c9d50fca809847bb077f03471406476b1d01ed2520c5a372`
- Size: 4,339,849 bytes

### BA–BE. Content and checks

The artifact contains the final `public`/`private` schema and security state, the explicit Auth bootstrap hook, and only the two approved permission/reference tables. Secret scan found no hosted URLs, tokens, JWTs, service-role keys, or customer markers. No operational `COPY` data statements were present.

### BF–BH. Platform treatment

Supabase Auth and Storage internals remain platform-managed. Only the TradesStack Auth trigger is included explicitly. Storage policy behavior is exercised by the post-cut migrations where applicable but a full Files/Storage acceptance remains deferred.

### BI. Stage C gate

| Gate | Result |
|---|---|
| Cut point justified | PASS |
| Baseline generated from disposable authority | PASS |
| Provenance/checksum recorded | PASS |
| Security objects represented | PASS |
| Reference data represented | PASS |
| Operational data/secrets absent | PASS |
| Supabase internals excluded appropriately | PASS WITH SAFE DECOUPLING |

## BJ–CB. Baseline database and Stage D

### BJ–BL. Empty baseline target

The baseline target was a separate empty disposable project `tradesstack-client-1o-baseline`, ports `61541–61543`, host `127.0.0.1`. It was not the cut or current reference database.

### BM–BP. Apply and equivalence

Baseline SQL applied cleanly. Independent fingerprints at the cut matched exactly:

- schema: `19680ff05ecc3fdff2ff6529201b6711b55fcfa13f8f4d33be7d0f0d2904c548`
- security: `01e5a7bfc4d7f6db173b1efaf042bb1a1f8ade1e1dd7cc412bf74e94235a00c9`
- reference data: `22df61b0a54264e4e71840c03e8a8a3a150ba4a7c170534f505329196a9c195e`

The authority runner also confirmed zero only-left/only-right differences for every fingerprint category.

### BQ–BT. Equivalence classification

No unresolved material difference remained. The only observed representation difference was column ordinal position in an intermediate normalization pass; it was excluded under the documented normalization rule after all column identities/types/defaults/nullability and security objects matched.

### BU–CA. Baseline acceptance

Baseline-at-cut Auth bootstrap, two organizations, membership invitation, Supplier package validation/mapping, positive reads, cross-org reads/writes, worker denial, and anonymous denial passed using ordinary authenticated sessions for RLS operations.

### CB. Stage D gate

| Gate | Result |
|---|---|
| Empty baseline database | PASS |
| Baseline applies cleanly | PASS |
| Cut schema/security/reference equivalence | PASS |
| Auth/organization/Supplier/RLS acceptance | PASS |

## CC–CU. Forward migration and Stage E

### CC–CF. Forward strategy and ledger

The baseline target received the exact full migration manifest so Supabase could resolve versions, but `migration repair` marked only the 504 versions represented by the baseline. The proof then ran `db push --local --include-all`; only these three files applied:

1. `20260913170000_fix_commercial_item_takeoff_reference_read_permission.sql`
2. `20260913180000_align_supplier_invoice_accounting_resolution_status.sql`
3. `20260926100000_fix_organization_logo_storage_policy_scope.sql`

No pre-baseline migration was rerun.

### CG–CT. Final state

Final baseline-plus-forward hashes equaled the full current replay:

- current schema/security/reference fingerprint: `716a905ec2fb122d9d98f7d7f472f1442510ed6d01b4080b46ad236945091c2b` (composite reporting hash)
- baseline-plus-forward composite reporting hash: identical
- forward migrations: PASS
- final Auth/RLS/Supplier acceptance: PASS
- pre-baseline rerun check: PASS — ledger repair represented them and `db push` applied only the three post-cut files.

### CU. Stage E gate

| Gate | Result |
|---|---|
| Supported ledger strategy | PASS |
| Only post-cut migrations applied | PASS |
| Final schema/security/reference equivalence | PASS |
| Final Auth/RLS/Supplier acceptance | PASS |
| Pre-baseline migrations rerun | PASS — NO |

## CV–DG. Reproducibility and Stage F

### CV–CX. Reproducibility/performance

The runner creates fresh source copies and fresh project identities on every run, uses a deterministic baseline artifact path/checksum, and removes only its own temporary roots. Timing comparison was not used as a gate; the three-target run is informationally slower than one replay because it intentionally proves independent states.

### CY–DF. Regression results

Phase 1O runner: PASS. Supplier package build, proof TypeScript build, and both reference/baseline Auth/RLS acceptance runs: PASS. Previously run Phase 1N checks remain passing; final focused regression rerun after Phase 1O should include package build/tests, boundary check, root TypeScript, targeted ESLint, Next build, and `git diff --check`.

### DG. Stage F gate

| Gate | Result |
|---|---|
| Database proof | PASS |
| Supplier package/proof build | PASS |
| Auth/RLS acceptance | PASS |
| Hosted Master untouched | PASS |
| Historical migrations unchanged | PASS |
| Dirty worktree preserved | PASS |

## DH–DS. Impact and non-goals

- Hosted Master database impact: **NONE**
- Historical migration impact: **NONE**
- Production Auth/RLS/Storage behavior impact: **NONE**
- Supplier business logic/public API impact: **NONE**
- UI, Xero/OpenAI/Resend, workers, Files/QA/commercial workflows: **NONE**

No hosted project was created, no production credentials were obtained, and no provisioning workflow was automated.

## DT–EA. Future operating model and remaining drift

### DT. New-client model

```text
                 TRADESSTACK DB AUTHORITY
                         │
                         ↓
                  BASELINE CUT N
                         │
               ┌─────────┴─────────┐
               ↓                   ↓
        NEW CLIENT A          NEW CLIENT B
        Baseline N            Baseline N
        Forward N+1           Forward N+1
               ↓                   ↓
         current schema       current schema
               │                   │
         Supabase A            Supabase B
```

### DU. Existing-client model

Existing clients continue from their current migration ledger and receive forward migrations. They do not jump between baselines.

### DV. Versioning model

Package version, database baseline version, migration version, app version, and deployment version remain independent. The proof baseline is `phase1o-1`, not npm `v1.0.0`.

### DW–DX. Baseline creation/retention policy

Create a new baseline only after a major schema/security milestone, materially burdensome replay cost, or a reviewed architecture boundary. Retain old approved baselines for reproducibility/audit; do not delete historical migrations.

### DZ–EA. Live-state status

Hosted live-state drift is unresolved because it was not safely inspectable. The proof establishes repository/local migration-derived equivalence only. A production baseline release must first reconcile the hosted Master schema, ledger, Storage policies, extensions, and final function catalog read-only.

## EB–EJ. Readiness, cleanup, and next phase

### EB. Production readiness

The database mechanics are proven, but the baseline is **PROOF BASELINE**, not production-ready provisioning. Hosted reconciliation, deployment policy, backup/restore, Storage acceptance, and operational provisioning remain deferred.

### EC. Cleanup

Every run uses guarded project identities/ports, local `127.0.0.1` databases, `supabase stop --no-backup`, and removal of only its own temporary source-copy root. Final Docker inspection showed no Phase 1O containers.

### ED–EE. Documentation

Created: this document and `supabase/baselines/phase1o-1/baseline.sql`. Extended: `proofs/isolated-client-supabase/` with the baseline-forward runner and package script. Phase 1N history was not rewritten.

### EF–EG. What Phase 1O proves/does not prove

It proves a versioned clean baseline plus supported ledger representation plus real forward migrations can reach the same material repository-derived schema/security/reference state and preserve Phase 1N Auth/tenancy/RLS behavior. It does not prove hosted live-state equivalence, cloud provisioning, Storage/files completeness, backups, data residency, email delivery, or production secrets/configuration.

### EH. Human decisions required

Approve the future baseline release process, reconcile hosted Master state, decide Storage baseline ownership, and approve the first production baseline publication after those checks.

### EI. Phase 1O status

**Complete as a disposable repository/local proof; production release deferred pending live-state reconciliation.**

### EJ. Next recommended phase

Phase 1P established the dedicated-client configuration boundary in [TRADESSTACK_CLIENT_CONFIGURATION_BOUNDARY.md](TRADESSTACK_CLIENT_CONFIGURATION_BOUNDARY.md). The next operational bottleneck remains a read-only hosted Master reconciliation and then the first safe client provisioning workflow. Do not automate hosted provisioning until that reconciliation is approved.

## EK–EL. Final safety

Pre-existing dirty work was preserved. No destructive Git operation, commit, push, hosted mutation, historical migration rewrite, UI change, Supplier API change, or production behavior change was made.
