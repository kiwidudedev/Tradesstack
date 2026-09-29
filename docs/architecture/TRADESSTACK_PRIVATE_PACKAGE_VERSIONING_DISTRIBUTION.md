# TradesStack Phase 1M — Private Package Distribution, Versioning and Client Upgrade Proof

Status: **PASS 1M COMPLETE WITH NON-BLOCKING BASELINE ITEMS — VERSIONED CLIENT UPGRADE AND ROLLBACK PROVEN**

Date: 2026-09-27

## A. Scope and result

Phase 1M proves the smallest safe local model for releasing, pinning, upgrading and rolling back `@tradesstack/suppliers` without direct Master-source consumption or shared Master persistence.

```text
MASTER DEVELOPMENT
       │
       ↓
workspace @tradesstack/suppliers
       │
       ↓ package build
VERSIONED PRIVATE ARTIFACT
       │
       ├───────────────┐
       ↓               ↓
   CLIENT A         CLIENT B
   pinned vA        pinned vA
       │
       ↓ explicit upgrade
   compatible vB
       │
       ├── validate and keep
       └── restore vA and validate
```

**YES — VERSIONED CLIENT UPGRADE AND ROLLBACK PROVEN.** The proof client installed Version A, upgraded explicitly to Version B, validated without source changes, then rolled back to Version A with the original lockfile identity and checksum restored.

## B. Current versus proof versus target

### CURRENT

- Four private workspace packages exist: `core-contracts`, `shared-ui`, `pdf-utils`, `suppliers`.
- All remain version `0.0.0`.
- No package-to-package dependencies exist.
- Master resolves packages through root workspace/path aliases during development.
- Supplier has package-local ESM/declaration build output from Phase 1L.

### PROOF

- Two local pre-release metadata variants were created:
  - `0.0.0-phase1m.1` — Version A
  - `0.0.0-phase1m.2` — Version B
- Both artifacts were generated from identical compiled output.
- The client used local file artifacts, never a registry or Master source alias.

### TARGET

```text
MASTER
   ↓
approved private package release
   ↓
private registry or controlled artifact distribution
   ↓
client repository with explicit version pin
   ↓
client CI test/build/deploy
```

### DEFERRED

Production registry ownership, authentication, publishing, release automation, support windows, compatibility matrices, package signing and client deployment orchestration.

## C. Versioning decision

### Independent versioning: selected

Independent package versioning is the best fit for the current evidence:

- no package-to-package dependencies exist;
- Supplier is a database-neutral domain contract;
- PDF utilities, shared UI and Core marker have different change cadences;
- lockstep upgrades would force unrelated client changes;
- independent pins give dedicated clients precise upgrade control.

### Lockstep versioning: rejected for now

Lockstep Core versions would simplify one coordinated release but would couple unrelated packages and create unnecessary client upgrades. It may be reconsidered if future cross-package contracts or coordinated database compatibility require it.

## D. SemVer policy

For future published packages:

- PATCH: backward-compatible bug fix or internal correction;
- MINOR: backward-compatible public capability addition;
- MAJOR: breaking public contract change.

Because packages remain pre-1.0, `0.x` changes require stricter review than ordinary SemVer expectations. No package was promoted to `1.0.0`.

Supplier examples:

| Change | Classification |
|---|---|
| Add optional input or read field | MINOR, after consumer review |
| Add payment-term literal | MINOR, compatibility review required |
| Remove/rename a public field | MAJOR |
| Change `displayName` or `isActive` meaning | MAJOR |
| Make an optional write input required | MAJOR |
| Change validation/error behavior relied upon by clients | MAJOR unless explicitly compatible |
| Remove a payment-term literal | MAJOR |

Package version is separate from client application version and database schema version.

## E. Distribution options

| Option | Assessment |
|---|---|
| Private npm registry | Strong production candidate; standard SemVer, lockfiles and CI support; requires scope/account/auth decisions. |
| GitHub Packages | Strong candidate because the repository is hosted on GitHub; integrates with repository permissions and CI, but requires package-registry/auth decisions. |
| Git dependency | Not recommended as the primary model; couples clients to repository access and Git history rather than a package release boundary. |
| Packed artifact/release asset | Excellent proof and controlled emergency distribution; weaker long-term discovery and lifecycle management. |
| Monorepo/workspace | Appropriate for Master development only; does not prove dedicated-repository distribution. |

Recommended production target: a private registry, with GitHub Packages the leading candidate to evaluate first because the current origin is GitHub-hosted. No external service was configured.

## F. Manifest and package ownership audit

All four packages currently use:

- intended `@tradesstack/*` names;
- private `0.0.0` versions;
- ESM package type;
- no package-specific repository, license, engines or publish configuration;
- source-oriented exports except Supplier, which now exports `dist`.

Actual package-to-package dependency graph:

```text
core-contracts  → none
shared-ui       → React peer; Radix/CVA/clsx/tailwind-merge
pdf-utils       → pdf-lib
suppliers       → none at runtime
```

The package identity `@tradesstack/suppliers` remains correct. The npm scope is not claimed or configured.

## G. Release content and provenance

Supplier releases contain only:

```text
package.json
dist/index.js
dist/index.d.ts
dist/index.d.ts.map
```

Each local release manifest records:

- package name and version;
- artifact filename;
- SHA-256 checksum;
- compressed/unpacked sizes;
- exact artifact files;
- source Git SHA;
- dirty-worktree flag;
- build command;
- public API list.

The recorded source SHA is `361bf3f094a8abbb58d20606413686cebc242e66`; `sourceWorkingTreeDirty: true` is recorded because this proof is being performed on an intentionally dirty worktree.

Byte-for-byte reproducibility was not claimed. Version A and Version B have equal compiled content and sizes, but different package metadata and therefore different artifact checksums.

## H. Local release simulation

The generator is:

`proofs/client-consumption/scripts/create-versioned-releases.mjs`

It stages the already-built `dist`, changes only the staged package metadata version, packs each artifact, computes SHA-256, and writes ignored release manifests. It does not modify the real Supplier source or public API.

Version A:

- version: `0.0.0-phase1m.1`;
- artifact: `tradesstack-suppliers-0.0.0-phase1m.1.tgz`;
- SHA-256: `e4786755cbeb0b17df80b2e30be9f946e22408789d8f97b24545db6965092852`;
- compressed/unpacked: `3428 / 13444` bytes.

Version B:

- version: `0.0.0-phase1m.2`;
- artifact: `tradesstack-suppliers-0.0.0-phase1m.2.tgz`;
- SHA-256: `769c28cf6e6fec70044a79928e79b3ba8f239caad06e81aed3ac13ca98ca8c22`;
- compressed/unpacked: `3428 / 13444` bytes.

## I. Stage A gate table

All passed, with safe decoupling for the package-local build and declarations:

- package inventory and versions verified;
- cross-package dependencies mapped;
- Supplier build independently passed;
- Supplier artifact remained Master-neutral;
- versioning options characterized;
- client pinning and lockfile policy identified;
- local release simulation passed;
- no external publication, database or security changes required.

## J. Stage B gate table

All passed:

- Version A metadata, checksum and contents verified;
- Version B metadata, checksum and contents verified;
- both artifacts contained only intended files;
- no Supplier behavior or public API difference;
- no registry or external publication used.

## K. Stage C upgrade and rollback evidence

Initial state:

- client manifest pinned to `file:.artifacts/releases/0.0.0-phase1m.1/...tgz`;
- client lockfile resolved Version A;
- installed package metadata reported Version A;
- independent typecheck and test passed.

Upgrade:

- manifest explicitly changed to Version B;
- `npm install` updated the client lockfile and integrity;
- installed metadata reported `0.0.0-phase1m.2`;
- independent typecheck and test passed;
- client source hashes were unchanged.

Rollback:

- manifest explicitly restored to Version A;
- lockfile restored Version A path and integrity;
- installed metadata reported `0.0.0-phase1m.1`;
- Version A SHA-256 identity was restored;
- independent typecheck and test passed;
- client source hashes remained unchanged.

No resolution fell back to `packages/suppliers/src`.

## L. Client upgrade and rollback policy

Minimal future upgrade:

```text
approved package release
→ client dependency change
→ lockfile update
→ client tests/typecheck/build
→ review and deploy
```

Minimal rollback:

```text
known-good package version
→ dependency revert
→ lockfile restore/update
→ client tests/typecheck/build
→ redeploy
```

Package rollback is not database rollback. Any future package release with database expectations requires separately documented forward-compatible migration rules.

Clients may remain on different supported package versions; simultaneous upgrades are not required by the model.

## M. Breaking-change model

Breaking releases should require a major version, explicit client dependency change, compatibility review, client test/build validation and deliberate deployment approval. No breaking release was simulated.

## N. Stage D validation

Passed:

- Supplier/package tests;
- all existing package tests;
- package boundary check;
- root TypeScript build check;
- targeted ESLint;
- Master production build;
- `git diff --check`.

Known baseline remains unchanged: manifest Next.js `16.3.3` versus installed `16.1.6`, and manifest npm requirement `>=11.6.2` versus installed npm `10.9.7`.

## O. Lockfile finding

The root `package-lock.json` still lacks the `@tradesstack/suppliers` workspace entry. It was not rewritten because it was pre-existing dirty work, npm is below the declared engine requirement, and the Phase 1M proof uses a client-owned lockfile plus local artifacts. This remains a baseline item for future package workspace cleanup.

## P. Security and product impact

No database, migration, Supabase, Auth, permissions, RLS, Storage, integration, worker, retention, QA, Files, Materials, procurement, supplier-invoice, accounting, Xero or UI behavior changed.

Registry installation credentials, if later used, are CI/deployment secrets—not application runtime secrets—and should be least-privilege read-only credentials.

## Q. Deferred operational decisions

Human/product decisions remain limited to:

- private registry provider and scope ownership;
- package publication approval authority;
- CI read-token ownership and rotation;
- supported package-version window.

Release automation, Changesets/semantic-release, changelog policy and compatibility matrices are deferred until package count and release cadence justify them.

## R. Limits and next phase

Phase 1M does not prove:

- production registry publication;
- package signing;
- CI release automation;
- real client Supabase/Auth/RLS/Storage;
- database compatibility across package upgrades;
- deployment rollback orchestration.

The next recommended phase is **Phase 1N — First Isolated Client Supabase/Auth/RLS Bootstrap Proof**, because local package distribution and controlled version movement are now proven. It must remain separate from production registry publication unless separately authorized.
