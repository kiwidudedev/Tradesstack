# TradesStack Main-to-client release promotion

## Capability

The Main repository is the product authority. Client repositories consume an
approved Main release; they do not independently author core product fixes.

The official product version is stored in `ops/product-version.json`. Each
approved release has one immutable semantic-versioned manifest directly under
`ops/releases/`, such as `ops/releases/1.0.0.json`. The customer-facing label
is the manifest's `displayLabel`, for example `TradesStack 1.0.0`.

The promotion engine is `scripts/ops/promote-release.mjs` and is exposed as:

```text
  npm run release:promote -- --release 1.0.0 --workspace /path/to/client/workspaces
```

The default is a read-only fan-out preflight. It loads enabled clients from
`ops/clients.json`, verifies release provenance, checks the client release
manifest and owned-file hashes, checks the linked migration target when the
client has a linked Supabase project, and reports one isolated result per
client.

## Controlled upgrade

An approved operator may prepare client upgrade branches with:

```text
npm run release:promote -- \
  --release 1.0.0 \
  --workspace /path/to/client/workspaces \
  --apply \
  --output artifacts/release-rollout.json
```

The engine fails closed on dirty worktrees, release-owned drift, missing
migrations, unavailable client repositories, and ambiguous migration state. It
preserves `client/**`, `.env*`, and `.vercel/project.json`. It never uses
`--include-all`, creates a client migration, resets a database, or marks an
unrelated migration applied. With `--apply`, it materializes the exact release
in an isolated temporary worktree and runs the declared `test:release`,
`typecheck:release`, and `build` scripts before changing the client branch.
The command emits a per-client JSON audit containing the previous release,
Main source SHA, fingerprint, branch/commit, migration state, validation
checks, PR state, deployment state, and blocked reason.

`--push` pushes the controlled `shell-upgrade/<release-id>` branch and opens a
client PR when GitHub CLI is available. Production deployment remains approval
gated: merge the PR through the client repository's protected process, then
allow the Git-connected deployment to run. The result records the migration
target, expected repository SHA, expected Main source SHA, deployment target,
and deployment readiness rather than silently deploying an unreviewed branch.
The repository's deployment integration is therefore the final controlled
step; the promotion engine does not bypass protected production approval.

If a forward migration is approved and pending for a client, use `--apply-db`
with `--apply`; the engine invokes only normal `supabase db push --linked`.
If Supabase reports an older deferred or ambiguous migration, that client is
blocked independently and the other clients continue.

## Version rules

Use the version helper before creating a manifest:

```text
npm run ops:version -- --suggest minor
npm run ops:version -- --suggest patch
npm run ops:version -- --suggest major
npm run ops:version -- --version 1.1.0
```

`1.0.0` is the current official baseline established from the already-verified
Main-to-Alpha release. Feature releases increment the minor component, fixes
increment the patch component, and breaking changes increment the major
component. Existing official manifest paths cannot be overwritten. Internal
proof identifiers remain under `ops/releases/internal/` and are never valid
customer release targets.

Every official manifest records the semantic version, customer-facing label,
release date, exact Main source SHA, release fingerprint, migration target,
validation status, and approval state. Customer registry entries reference the
official version, while customer-owned configuration and data remain outside
the release version.

## Registry and onboarding

Each managed client entry in `ops/clients.json` contains non-secret metadata:

- repository reference and default branch;
- deployment and Supabase references;
- release channel and rollout status;
- client-owned path boundaries;
- current release and deployment provenance.

New onboarding adds a client entry, provisions its separate repository/runtime,
creates its approved baseline and client-owned configuration, then runs the
same promotion command. Secrets are supplied by the deployment/provider
systems and never written to the registry or release bundle.

## Proof and failure isolation

`npm run test:client-promotion` creates two disposable client repositories and
one deliberately drifting client. It proves that one Main release produces the
same Main-owned payload in both successful clients, preserves each client-owned
configuration, and blocks the drifting client without modifying the successful
configuration, runs client tests/typecheck/build in an isolated worktree, and
blocks the drifting client without modifying the successful clients.
