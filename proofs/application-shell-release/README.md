# Phase 1R application-shell release proof

`npm run proof` creates two deterministic, local-only shell snapshots from the
Master workspace, initializes a disposable Client Alpha Git repository from
Release A, exercises ownership-aware conflict handling, upgrades it to Release
B, and compares the upgraded source with a fresh Release B repository.

The generated repository is outside this workspace, has its own install and
`node_modules`, and is removed on completion. No remote Git, package registry,
hosted infrastructure, customer data, or secrets are used.
