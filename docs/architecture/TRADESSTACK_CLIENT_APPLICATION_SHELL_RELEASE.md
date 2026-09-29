# TradesStack Phase 1R — Client application-shell release boundary

## Verdict

**PASS 1R COMPLETE — APPLICATION-SHELL RELEASE + CLIENT UPGRADE PROVEN**

Final architectural answer: **YES — DEDICATED CLIENT APPLICATION SHELL RELEASE + UPGRADE PROVEN**.

The local proof establishes a controlled, versioned delivery path for the
current full Next.js product source. It is a downstream release of Master, not
a second Master and not a published package.

## Current architecture and ownership

The full application shell is intentionally still substantial source in the
Master repository. The independent build requires the routes in `app/`, UI and
auth components, hooks, `lib/` services and generated Supabase types, public
assets, styles, workspace packages, root build/test configuration, and the
Supabase config/migrations/functions inputs. The application continues to use
the Phase 1P environment-backed `@tradesstack/client-config` boundary.

| Path/category | Current purpose | Master product-owned | Client-owned | Release to client | Reason |
|---|---|---:|---:|---:|---|
| `app/` | Next routes, server actions, API handlers | Yes | No | Yes | Full product behavior |
| `components/`, `hooks/` | UI/application composition | Yes | No | Yes | Required by routes/build |
| `lib/`, `types/` | Services, permissions, Supabase access/types | Yes | No | Yes | Core runtime and contracts |
| `packages/` | Current workspace package source | Yes | No | Yes | Current build needs workspace resolution |
| `public/`, `styles/` | Product assets and styling | Yes | No | Yes | Product shell assets |
| `supabase/config.toml`, migrations, functions | Deployment/database compatibility inputs | Yes | Client infrastructure owns applied state | Yes | Required inputs; no 1R schema change |
| `proofs/`, `docs/`, `artifacts/` | Master history, proof harnesses, reports, local evidence | No | No | No | Not runtime product material |
| `scripts/` | Master audits, reconciliation and developer tooling | Mostly no | No | No | No client runtime dependency in this release |
| root package/config files | Build, lint, TypeScript, test and workspace contract | Yes | No | Yes | Independent install/build |
| `.env.example` | Non-secret variable names/default examples | Master template | Deployment operator | Yes | Example only; no values/secrets |
| `.env*` local files | Local bindings/secrets | No | Yes, outside release | No | Never release environment state |
| `client/` | Client config/ownership evidence | No | Yes | No | Created and preserved only in client repo |

The release boundary is an allowlist, not a repository copy. It excludes Git
history, local dependencies/build output, Master proof/docs/artifacts,
developer paths, local Supabase state, and secrets. Organization operational
data, Auth data, Storage data, provider connections and infrastructure bindings
remain outside the repository and are not encoded as application config.

## Selected release model

**HYBRID APPLICATION-SHELL RELEASE MODEL**:

```text
Master source state
       ↓
deterministic shell snapshot + manifest + fingerprint
       ↓
separate local Client Alpha Git repository
       ↓
ownership-aware upgrade manifest
       ↓
new shell snapshot, with client material preserved
```

The implementation is deliberately proof-oriented and local. It does not
create a remote repository, publish a registry artifact, or auto-upgrade any
client. The client repository is a deployment/instance repository; Master
remains product authority.

## Release identity and manifest

The proof uses shell identities `0.0.0-phase1r.1` and
`0.0.0-phase1r.2`. These are separate from package versions, the Phase 1O
database baseline/migration target, and the Phase 1P client-config contract.
Each release manifest records:

- Master `HEAD` source SHA and dirty-worktree provenance;
- shell release ID and normalized content fingerprint;
- included file list and per-file SHA-256 values;
- package identities and client-config contract version;
- database compatibility statement;
- explicit exclusion categories.

`lib/application-shell-release.ts` is the Master-owned non-rendered current
release marker. The client’s `release-manifest.json` provides support
traceability from client release to Master SHA and fingerprint.

## Proof executed

`npm run proof:client-shell-release` runs
`proofs/application-shell-release/scripts/run-release-upgrade-proof.mjs`.
It:

1. Generates Release A and B outside the Master tree from the approved
   allowlist; repeats A generation and compares fingerprints.
2. Scans both releases for local build state, credentials, and `/Users/corey/`
   path leakage.
3. Creates a separate Git repository, with local-only commits, from A.
4. Creates fictional Client Alpha config and ownership files, plus an ignored
   local environment binding. No customer identity or secret is used.
5. Runs independent `npm install`, TypeScript, focused package tests, and the
   full Next production build in the client repository. No Master
   `node_modules` or workspace fallback is available.
6. Modifies a release-owned file and proves the upgrade refuses a silent
   overwrite.
7. Modifies client config, client-owned notes, and environment bindings; then
   applies B only after the release-owned state is clean. All client material
   remains byte-identical to its modified pre-upgrade state.
8. Runs the same typecheck, tests and production build after upgrade, then
   creates a fresh B client and compares all non-generated release-owned files.

The generated disposable repositories and installs are removed in `finally`.
The only allowed proof commits are inside those generated local repositories;
Master is never committed or pushed.

## Upgrade policy

Release-owned add/modify/delete operations are applied only after the current
release marker and release-owned hashes validate. A divergence fails closed;
there is no blind overwrite. Client-owned paths (`client/**`) and local
environment files are excluded from release application. `package-lock.json`
and `next-env.d.ts` are classified as generated/volatile during build and are
not treated as product-source equivalence failures.

The current proof demonstrates modify semantics. Future release deletion and
collision cases remain policy requirements: a changed release-owned deletion
must conflict, and a new release-owned path colliding with a client-owned path
must fail closed. No automatic upgrade is implied.

Application-shell rollback means restoring a prior shell snapshot/commit only;
it does not roll back database migrations or client infrastructure. Clients
may temporarily run different approved shell releases. Support-window policy,
remote release storage, and hosted deployment automation are deferred.

## Required separation

```text
MASTER PRODUCT AUTHORITY
  app · components · hooks · lib · packages · public · styles · DB inputs
                         ↓ approved shell release
CLIENT REPOSITORY
  Master-controlled release files + client-owned config/bindings/instance data
```

```text
Release A → Client Alpha → upgrade to B → upgraded B
Release B → fresh Client Alpha → fresh B
                         upgraded B ≈ fresh B
```

No database, historical migration, Phase 1O baseline, Auth, RLS, Storage,
integration, supplier logic, commercial workflow, QA, Files, UI redesign, or
client-config contract change is part of Phase 1R.
