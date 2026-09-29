# TradesStack Phase 1L — First Dedicated Client Consumption Proof

Status: **PASS 1L COMPLETE WITH NON-BLOCKING BASELINE ITEMS — FIRST DEDICATED CLIENT CONSUMPTION PROOF ESTABLISHED**

Date: 2026-09-27

This proof establishes that a separate client-style TypeScript application can consume the real `@tradesstack/suppliers` business-domain package through a local distributable artifact, without importing Master application internals or sharing Master persistence.

## A. Proof architecture

```text
TRADESSTACK MASTER REPOSITORY
          │
          ↓
@tradesstack/suppliers source
          │
          ↓ package-local TypeScript build
packed local artifact
          │
          X no source alias / no Master source
          │
          ↓
proofs/client-consumption
          │
          ├── client-owned in-memory persistence
          ├── client-owned persistence → SupplierReference mapping
          └── package-owned Supplier semantics
```

The proof is disposable and is not a production customer repository. It uses the identity `TradesStack Client Proof` conceptually and contains no customer data, Auth, Storage, Supabase, provider credentials or production secrets.

## B. Stage A — package distribution characterization

| Gate | Result | Evidence |
|---|---|---|
| Supplier semantics already proven | PASS | Phase 1J/1K package and compatibility tests |
| Supplier source is Master-neutral | PASS | no `@/`, app, components, lib, Supabase, Next, React or environment imports |
| Standalone artifact | PASS WITH SAFE DECOUPLING | package-local `tsconfig.build.json` and `build` script |
| Declarations | PASS | `dist/index.d.ts` and declaration map |
| Runtime exports | PASS | `dist/index.js` and package exports map |
| Master aliases required | PASS | artifact consumer uses normal package resolution only |
| Master environment required | PASS | no environment reads |
| Master DB types required | PASS | no generated types or persistence aliases |
| Provider dependency required | PASS | no Xero/OpenAI/Resend dependency |
| Local distribution without registry | PASS | `npm pack` plus local file dependency |
| Existing Master consumption preserved | PASS | Master build and focused tests pass |

### Selected distribution method

The proof uses:

```text
npm run build                   # packages/suppliers
npm pack ./packages/suppliers   # local tarball only
proof client dependency         # file:.artifacts/tradesstack-suppliers-0.0.0.tgz
```

This was selected because it crosses a real package boundary while avoiding npm publication, registry configuration and production release policy. The first pack attempt used an ambiguous npm path and attempted GitHub access; the explicit `./packages/suppliers` path produced the intended local artifact.

## C. Package changes

`packages/suppliers/package.json` now contains only the minimum distribution metadata:

- package-local `build` script;
- `main` pointing to compiled ESM;
- `types` pointing to declarations;
- `exports` pointing to `dist`;
- `files: ["dist"]`.

`packages/suppliers/tsconfig.build.json` independently emits ESM JavaScript and TypeScript declarations from `src/index.ts`. The package remains private and version `0.0.0`; no production SemVer policy was introduced.

Runtime dependencies remain empty. TypeScript is a build-time tool supplied by the Master development environment; the artifact itself has no Master or runtime dependency.

## D. Packed artifact

Artifact used:

```text
proofs/client-consumption/.artifacts/tradesstack-suppliers-0.0.0.tgz
```

The artifact is ignored and disposable. `npm pack` reported:

- compressed size: approximately 3.4 kB;
- unpacked size: 13.4 kB;
- files: 4.

Exact contents:

```text
package/package.json
package/dist/index.js
package/dist/index.d.ts
package/dist/index.d.ts.map
```

Inspection confirmed no source tree, Master application files, `.env` files, secrets, database schema, generated Supabase types, tests or unrelated fixtures.

## E. Stage B — external client proof

Proof location:

```text
proofs/client-consumption/
```

Files:

- `package.json` — independent client proof manifest with a local tarball dependency;
- `package-lock.json` — client-owned install lockfile;
- `tsconfig.json` — independent NodeNext TypeScript configuration;
- `src/index.ts` — client-owned persistence model, mapping and proof flow;
- `src/index.test.ts` — independent Node test;
- `.gitignore` — excludes disposable install/build/artifact output.

Client dependency graph:

```text
tradesstack-client-consumption-proof
  ├── @tradesstack/suppliers@0.0.0  (local packed artifact)
  ├── typescript                    (client dev dependency)
  └── @types/node                   (client dev dependency)
```

The client source imports only `@tradesstack/suppliers` and Node built-ins in its test. It contains no `@/` aliases, Master-relative imports, app/components/lib imports, absolute Master paths, environment access or provider references.

## F. Client persistence ownership

The proof owns this deliberately non-Master representation:

```ts
type ClientSupplierRecord = {
  clientKey: string;
  label: string;
  enabled: boolean;
  validatedWrite: ValidatedSupplierWriteInput;
};
```

The package does not know this record, does not own the `Map`, and does not provide a repository/service abstraction. The client maps its own record to:

```ts
SupplierReference {
  id,
  displayName,
  isActive
}
```

This is not `organization_suppliers`, not a Supabase row, not an authorization result and not a Master display-name helper.

## G. Proof behavior

The client proves:

- valid `SupplierWriteInput` is accepted;
- `ValidatedSupplierWriteInput` is returned;
- blank supplier name produces the existing `SupplierValidationError` behavior;
- website normalization produces `https://supplier.example`;
- `SupplierPaymentTermsType` and `SUPPLIER_PAYMENT_TERMS_TYPES` resolve from the artifact;
- validated data is stored in client-owned disposable persistence;
- client-owned mapping produces `SupplierReference` with active state and display name.

## H. Stage B gates

All passed:

- own client package manifest;
- own TypeScript config;
- local artifact installation;
- package-name-only import;
- write, validation, invalid-input, normalization and payment-term consumption;
- `SupplierReference` consumption;
- client-owned persistence and mapping;
- no Master database, secrets, aliases or internals;
- independent typecheck and test execution.

## I. Stage C — Master regression validation

Passed:

- focused Supplier tests: 13 tests passed across the Supplier package and compatibility suite;
- existing package suite: 12 tests passed across all four packages;
- package boundary check: passed;
- root TypeScript build check: passed;
- targeted ESLint: passed;
- Master production build: passed, 124 pages generated using installed Next.js 16.1.6;
- `git diff --check`: passed;
- existing dirty worktree preserved.

The separate client proof test passed independently with Node’s test runner.

## J. Lockfile finding

The pre-existing root `package-lock.json` still lacks the `@tradesstack/suppliers` workspace entry. It was not rewritten in Phase 1L because the root lockfile was already dirty, the local proof does not depend on root workspace resolution, and npm 10 would risk unrelated lockfile churn against the repository’s npm 11 engine requirement.

The client proof has its own lockfile for its local artifact installation.

## K. Security and infrastructure boundary

Phase 1L intentionally does not implement production Auth, RLS, Storage, workers, integrations, secrets, Supabase or deployment infrastructure. Their absence in this disposable proof is not a production security design.

A dedicated production client remains required to own its own Auth, database, RLS, Storage, secrets, integrations, backups and deployment configuration.

No database, migration, Supabase, Auth, permissions, RLS, Storage, worker, integration, retention, QA, Files, Materials, procurement, supplier-invoice, accounting, Xero or UI behavior was changed.

## L. Proof limitations

This phase does not prove:

- a real client Supabase/Auth/RLS deployment;
- production package registry or private distribution;
- release/version rollout, upgrade or rollback policy;
- client-specific extensions;
- a complete client configuration model;
- production deployment or integration wiring.

## M. Result and next recommendation

**YES — EXTERNAL CLIENT CONSUMPTION PROVEN.**

TradesStack has now proven that a dedicated client-style application can consume a real business-domain package through a distributable artifact, validate Supplier writes, use read semantics, own its persistence representation and run independently without Master application internals or Master persistence.

Phase 1M continues this boundary with a local versioned release, explicit client pin, compatible upgrade and rollback proof. Production registry distribution and client Supabase/Auth/RLS remain separate future concerns.
