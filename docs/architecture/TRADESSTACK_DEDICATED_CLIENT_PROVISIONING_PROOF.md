# TradesStack Phase 1Q — Repeatable Dedicated Client Provisioning Proof

## A. Phase 1Q verdict

**PASS 1Q COMPLETE — REPEATABLE DEDICATED CLIENT PROVISIONING PROVEN**

## B. Final architectural answer

**YES — REPEATABLE DEDICATED CLIENT PROVISIONING PROVEN.**

TradesStack can assemble fictional Client Alpha, Client Beta, and a fresh Alpha reprovision from approved local artifacts, the Phase 1P configuration contract, the Phase 1O baseline, forward migrations, and isolated local Supabase projects. Each client independently installs and builds its proof shell, runs Auth/RLS/Supplier acceptance, receives its own database/Auth/data state, and is cleaned up safely. Alpha and Beta use identical core/package/database inputs and differ only through approved client configuration and infrastructure identity.

This is a local disposable integration proof. It is not cloud provisioning, a published full application package, or production readiness.

## C–K. Source and prior-phase inputs

- Branch: `main`.
- Source SHA: `361bf3f094a8abbb58d20606413686cebc242e66`.
- The worktree was already dirty and was preserved. No reset, clean, restore, stash, commit, push, hosted mutation, or production deployment was performed.
- Phase 1L Supplier release used: `@tradesstack/suppliers@0.0.0-phase1m.2`, SHA-256 `769c28cf6e6fec70044a79928e79b3ba8f239caad06e81aed3ac13ca98ca8c22`.
- Phase 1P package used: locally packed `@tradesstack/client-config@0.0.0`, generated from the current package source; final proof artifact SHA-256 `d0c3b67d66b710d616c7cdbc800c8fabac28a289a6bf5b35c3dc5848e85f889f`.
- Phase 1O baseline: `supabase/baselines/phase1o-1/baseline.sql`, SHA-256 `52ac69bea6587301c9d50fca809847bb077f03471406476b1d01ed2520c5a372`.
- Baseline cut: `20260913160000_reconcile_indexes_and_check_contracts.sql`; 504 cut migrations and 3 forward migrations.
- Excluded fixture-only migration: `20260810190000_cleanup_phase1_material_test_fixtures.sql`.

| Phase | Current reusable input | Result |
|---|---|---|
| 1L | External Supplier package consumption | Reused |
| 1M | Pinned Supplier release `0.0.0-phase1m.2` | Reused |
| 1N | Disposable Supabase/Auth/RLS acceptance | Reused |
| 1O | Baseline plus forward migration mechanism | Reused |
| 1P | Portable client-config contract and validator | Reused |

## L–T. Application-shell characterization

The full Master Next application is not currently a versioned external app package. It imports substantial Master-local routes, components, services, aliases, generated database types, and deployment infrastructure. Phase 1Q therefore selected the evidence-backed **orchestrator plus independent proof shell** model:

```text
approved packed portable packages
        + Phase 1P config
        + Phase 1O baseline/forward inputs
        ↓
independently installed lightweight client proof shell
```

The proof shell is not presented as the full TradesStack product. It proves the portable package/config/database/infrastructure boundary without copying the Master repository blindly. A future full dedicated client repository will require an approved Master-derived application template or a later thin-shell extraction.

Master-only material excluded from generated workspaces includes architecture history, proof source, reconciliation scripts, local fixtures, Master aliases, Master `.env` files, Master `node_modules`, and unneeded application internals. The generated client contains only its package manifest, independent lockfile, TypeScript shell, config input, and local deployment binding at runtime.

Client-owned editable material is limited to the approved client configuration, deployment bindings, safe static assets, and future explicitly approved extension locations. Domain semantics, RLS, migrations, package internals, and core workflows remain non-editable Core inputs. No extension API was created.

## U–AM. Provisioning model and safety

The workflow is an **orchestrator**, not a broad scaffolding framework. It validates the baseline checksum, migration cut/count, approved Supplier artifact checksum, client config, output root, package artifacts, isolated ports, and local Supabase identity before provisioning.

Each run:

1. Packs `@tradesstack/client-config` and copies the approved Phase 1M Supplier artifact into a disposable artifact directory.
2. Generates an independent client workspace outside the Master workspace resolution path.
3. Runs `npm install` in that workspace and verifies package resolution is inside the client’s own `node_modules`.
4. Verifies the client lockfile contains no Master repository path and builds the client shell independently.
5. Starts an empty local Supabase project on `127.0.0.1` with a unique project ID and ports.
6. Applies the approved baseline SQL with no migration manifest present.
7. Copies the full migration manifest, repairs only the 504 baseline versions, and applies only the 3 forward migrations.
8. Runs the existing ordinary-user Auth/tenancy/Supplier/RLS acceptance without service-role credentials.
9. Runs the client shell test against its own public Supabase binding and writes a non-secret provisioning manifest.
10. Stops and removes only the guarded disposable client workspace/project.

No client definition contains credentials. No temporary env file is written. Public Supabase bindings are passed only to the disposable test process. Service-role keys are used only by the existing controlled bootstrap fixture, never for RLS assertions, and are never printed or recorded.

Cleanup validates that the target is inside the Phase 1Q `mkdtemp` root before recursive removal. Existing Master Supabase project identity and ports are protected by the existing disposable-target guard. Re-running an existing target is not supported; each generated target is unique and cleanup is explicit/fail-closed.

## AN–AQ. Stage A/B gates

| Gate | Result |
|---|---|
| Prior artifacts inspected from source | PASS |
| Package portability characterized | PASS WITH SAFE DECOUPLING |
| Full application shell limitation identified | PASS |
| Client inputs explicit and non-secret | PASS |
| Baseline identity/checksum verified | PASS |
| Forward target determined from current migrations | PASS |
| Local-only infrastructure and path safety | PASS |
| No hosted/prod action required | PASS |

## AR–BN. Client Alpha result

Alpha definition:

```json
{
  "clientKey": "client-alpha",
  "displayName": "Client Alpha",
  "platformColor": "#123456",
  "actionColor": "#D9480F",
  "locale": "en-NZ",
  "currency": "NZD",
  "timezone": "Pacific/Auckland"
}
```

Alpha used the packed client-config artifact and the pinned Phase 1M Supplier artifact, independently installed 5 packages, built its TypeScript shell, applied the baseline plus all three forward migrations, and passed the existing Auth/organization/membership/Supplier/RLS acceptance. The client shell health-checked Alpha’s own Supabase API, validated Alpha config, and validated the Supplier contract.

Alpha’s non-secret ledger result was 507 migrations, first `20260228173000`, last `20260926100000`, with all three forward versions present. Alpha infrastructure was unique: local project `tradesstack-client-1q-alpha-muiz0ddk`, ports `61721–61723`.

## BO–CQ. Alpha gate table and cleanup

| Gate | Result |
|---|---|
| Alpha config validation | PASS |
| Independent install and lockfile | PASS |
| No Master package/source fallback | PASS |
| Alpha Supabase identity/ports | PASS |
| Phase 1O baseline checksum | PASS |
| 504 baseline ledger repair | PASS |
| 3 forward migrations | PASS |
| Auth/bootstrap | PASS |
| Supplier write/read mapping | PASS |
| Own-org access | PASS |
| Cross-org read/write denial | PASS |
| Insufficient-permission denial | PASS |
| Anonymous behavior | PASS |
| Client shell build/test/Supabase health | PASS |
| Non-secret manifest write/read-back | PASS |
| Alpha cleanup and Master-impact check | PASS |

Alpha’s workspace and local Supabase project were stopped and removed before Beta provisioning. No Master container or source path was removed.

## CR–CO. Client Beta result

Beta used the identical mechanism and inputs, with only the approved client configuration and disposable infrastructure identity changed:

```json
{
  "clientKey": "client-beta",
  "displayName": "Client Beta",
  "platformColor": "#203040",
  "actionColor": "#2F80ED",
  "locale": "en-AU",
  "currency": "AUD",
  "timezone": "Australia/Sydney"
}
```

Beta used local project `tradesstack-client-1q-beta-muiz0ddk`, ports `61731–61733`, the same baseline checksum, the same 504/3 migration target, and the same package artifact hashes. Independent install, build, Supabase health, Auth, Supplier, own-org, cross-org, insufficient-permission, anonymous, and cleanup gates all passed.

## CP–DG. Alpha/Beta comparison and repeatability

| Concern | Alpha | Beta | Result |
|---|---|---|---|
| Core source hash | `705d75ce…30cf48` | `705d75ce…30cf48` | Same |
| Client-config artifact | Same SHA | Same SHA | Same |
| Supplier artifact | Same Phase 1M.2 SHA | Same Phase 1M.2 SHA | Same |
| DB baseline | `phase1o-1`, same SHA | `phase1o-1`, same SHA | Same |
| Forward target | Same 3 files | Same 3 files | Same |
| Migration ledger hash | `5cdafe0b…f23636` | `5cdafe0b…f23636` | Same |
| Application identity | Client Alpha | Client Beta | Different by design |
| Shell branding/defaults | Alpha values | Beta values | Different by design |
| Supabase project/ports | Unique | Unique | Different by design |
| Auth users/data | Alpha disposable state | Beta disposable state | Isolated |
| Secrets | Disposable local only | Disposable local only | Never reported |
| Workflow/security behavior | Same | Same | Equivalent |

The fresh Alpha reprovision used project `tradesstack-1q-ar-muiz0dw1`, ports `61741–61743`, the same config hash, core source hash, package hashes, baseline, migration target, and ledger hash. Its comparison to the first Alpha was fully equal for all non-volatile fields. UUIDs, project IDs, ports, lockfile hashes, timestamps, and local platform internals were intentionally volatile.

No manual rescue step was used in the final clean run. Two early generic harness defects were corrected before the claimed proof: an artifact-relative path, and migration-manifest/start ordering; an overly long reprovision-only project ID was also corrected and the entire sequence was rerun from scratch.

## DH–DR. Stage E/F and acceptance results

| Gate | Result |
|---|---|
| Alpha/Beta same-core comparison | PASS |
| Alpha/Beta config difference | PASS |
| Separate Supabase/Auth/data state | PASS |
| Same baseline/forward target | PASS |
| Alpha reprovision | PASS |
| No manual rescue in final run | PASS |
| Client config tests | PASS |
| Supplier tests | PASS |
| Existing Auth/RLS acceptance per client | PASS, 3 runs |
| Independent client shell install/typecheck/build/test | PASS, 3 runs |
| Package boundary check | PASS |
| Master TypeScript check | PASS |
| Targeted ESLint | PASS |
| Master production build | PASS |
| `git diff --check` | PASS |
| Secret/non-secret manifest scan | PASS |

## DS–EF. Impact and boundaries

| Area | Impact |
|---|---|
| Hosted database | **NONE** |
| Production infrastructure | **NONE** |
| Historical migrations | **NONE** |
| Phase 1O baseline | **NONE**; checksum unchanged |
| Production Auth/RLS/Storage | **NONE** |
| Integrations/provider connections | **NONE** |
| Supplier contract/business logic | **NONE** |
| Client-config contract | **NONE**; consumed only |
| Master UI | **NONE** |

Hosted live-state reconciliation remains deferred from Phase 1O and was not attempted in Phase 1Q. The Phase 1O baseline remains a proven local client-bootstrap baseline, not a cloud production release.

## EG–EM. Repository and deployment readiness

The proof establishes **repository-ready local provisioning inputs** for a dedicated client boundary: portable package artifacts, explicit config, deterministic baseline/forward target, independent client lockfile, local Supabase/Auth/RLS acceptance, and safe cleanup.

It does not establish cloud-deployment readiness. Hosted Supabase creation, Vercel/DNS, domain and OAuth setup, secret-store binding, email/provider connections, backups, monitoring, rollback operations, and a complete externally packaged Next application remain future work.

Documentation created:

- `proofs/dedicated-client-provisioning/scripts/run-repeatable-proof.mjs`
- `proofs/dedicated-client-provisioning/package.json`
- `proofs/dedicated-client-provisioning/README.md`
- this authority document

Documentation updated:

- root `package.json` with `proof:dedicated-client`.

## EN–EU. What this proves, remaining inputs, and next phase

Phase 1Q proves that the approved package/config/baseline/forward/Auth/RLS boundaries can be assembled repeatedly for fictional dedicated clients from a clean disposable location, without Master workspace fallback, manual core edits, production mutation, or secret publication.

It does not prove that every TradesStack module is externally packaged or that the full Master Next application can already be copied into a dedicated repository without a template/extraction decision.

Remaining manual inputs for a future real client are an approved client identity/config, a dedicated repository/app-shell release, cloud Supabase project, secret-store bindings, provider connections, domain/DNS, and explicit production approval. None were supplied or required here.

### Next recommended phase

**Phase 1R — first real dedicated client repository + cloud deployment proof**, only after selecting and packaging the application-shell/template boundary and separately approving hosted infrastructure, secrets, domains, and live-state/database release policy.

### Final safety

All disposable Alpha, Beta, and Alpha-reprovision projects/workspaces were stopped and removed. No Phase 1Q generated workspace, database state, credentials, or customer data remains in the repository. Pre-existing dirty work was preserved; no commit or push was made.
