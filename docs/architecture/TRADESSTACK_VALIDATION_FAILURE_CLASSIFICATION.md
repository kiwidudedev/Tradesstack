# TradesStack Phase 1V-G — Validation Failure Classification

Phase 1V-G is local-only. It does not log in to a provider, connect to Vercel, create hosted resources, deploy, publish, or inspect customer data.

Authoritative commands:

```text
corepack npm run ops:validate-release
corepack npm run ops:prehosting
corepack npm run lint:release
corepack npm run test:release
corepack npm run typecheck:release
```

| Category | Meaning | Final treatment |
| --- | --- | --- |
| A | Genuine product regression | Fixed only with direct evidence. |
| B | Tooling, fixture, mock, or validation regression | Repaired at the owning boundary. |
| C | Stale or incorrect test contract | Updated only where current source proved the old assertion obsolete. |
| D | Generated or temporary artifact | Kept outside the release tier by narrow path rules. |
| E | External credential required | Not run; never treated as passed. |
| F | Local infrastructure required | Separate gate; no hosted inference. |
| G | Hosted/E2E validation | Not run in this phase. |
| H | Live/manual validation | Not run in this phase. |
| I | Obsolete test or path | Retired only with direct repository evidence. |
| J | Unknown blocker | Zero remaining. |

The complete inventory is `ops/validation/failure-inventory.json`. All 32 originally observed test failures are resolved, with zero open failures and zero J records. Release lint has zero blocking errors and 156 non-blocking warnings; warnings remain visible and are not converted into a false zero-diagnostic claim.

No E, F, G, or H result is treated as a successful hosted/customer result. The client registry is intentionally empty, no provider login occurred, no Vercel connection occurred, and no database or migration change was made for this remediation.

A local PASS requires zero unexplained deterministic test failures, zero release-lint errors, passing TypeScript/build/proofs, and passing operational preflight. Hosted, credentialed, customer, and future Phase 1W work remain separate decisions.
