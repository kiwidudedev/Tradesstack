# TradesStack Codex Operating Instructions

## Authority and preparation

- Before any substantial TradesStack work, read `docs/architecture/TRADESSTACK_AI_CONTEXT.md` in full.
- Treat that document as architectural and product guidance, not as proof of current implementation, schema, deployment, or test state. Verify current claims against repository code, migrations, generated types, tests, and other direct evidence. The current repository, applied database state where available, and current tests override it when they conflict.
- Before substantial implementation, inspect the relevant routes, components, server actions, services, RPCs, migrations, permissions, tests, and architecture documents. Identify the owning organization/project/opportunity boundary and the canonical source-of-truth table or service.
- Check both current and legacy paths before extending or replacing behavior. If an architecture document, implementation, migration, or test conflicts, stop and explain the conflict before making a destructive architectural decision.

## Preserve TradesStack architecture

- Preserve existing domain terminology, source-of-truth boundaries, organization tenancy, server/database permissions, RLS, storage privacy, revision and snapshot semantics, provenance, idempotency, and current-vs-legacy distinctions.
- Treat `organization_id` isolation and permission enforcement as mandatory. UI visibility is not security; preserve membership checks, server authorization, RPC guards, RLS, and storage policies. Keep service-role credentials and provider secrets server-only.
- Preserve commercial lineage and historical evidence. Do not overwrite awarded quotes, pricing evidence, completed QA/accounting evidence, or other immutable records; use the established revision, supersession, snapshot, or corrective-record patterns.
- Preserve takeoff drawing-set ownership, calibrated normalized geometry, measurement lineage, private signed URLs, render-job idempotency, and fallback behavior.
- Preserve the distinction between estimates, quotes, purchase orders, variations, costs, accounting records, QA definitions/runs, and legacy quality records. Do not create parallel commercial, QA, files, accounting, or intelligence concepts without proving the existing path cannot satisfy the task.
- Prefer existing components, route shells, contracts, RPCs, validation, permission helpers, design tokens, status patterns, and abstractions. Preserve the existing TradesStack UI and theme unless the task explicitly requires a change.

## High-risk changes

- Treat database changes, migrations, RLS, organization tenancy, permissions, immutable records, revision history, provenance, storage policy, accounting, and external-provider synchronization as high-risk. Trace callers, constraints, policies, RPCs, and characterization tests before changing them.
- Add forward migrations; do not edit applied migrations. Keep mutations validated, authorized, atomic where required, and retry/idempotency-safe.
- Do not perform unrelated cleanup, broad refactors, duplicate extraction, or speculative modernization. Make the smallest coherent change required by the task.

## Validation and handoff

- After changes, run focused tests for the affected contracts and proportionate lint, typecheck, build, migration/security, or browser validation. Do not claim validation that was not run.
- Final reports must clearly state: files changed; tests and checks run with results; build/typecheck status; whether database or migration files changed; limitations; and anything not verified.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
