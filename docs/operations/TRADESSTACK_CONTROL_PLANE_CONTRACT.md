# TradesStack Main → Owner Control Plane contract

This is the CP-0 repository-native read contract for a future separate
`tradesstack-owner` application. It is an operational index, not a second
source of truth for customer business data, releases, deployments, databases,
Auth, Storage or provider state.

## Consumer

Generate the validated contract with:

```text
npm run ops:control-plane -- --json
```

The command is read-only, deterministic for a given repository state, does not
contact providers, does not inspect customer databases, and exits non-zero if
the assembled contract is invalid.

The implementation is in `scripts/ops/control-plane-contract.mjs`; the CLI is
`scripts/ops/control-plane-state.mjs`.

## Semantics

Each value is either a plain reference or a fact carrying:

- `value` — the value, or `null` when unavailable;
- `classification` — `EXPECTED`, `OBSERVED`, `HISTORICAL`, `MANUAL`,
  `DERIVED`, or `PROVIDER_REFERENCE`;
- `evidence.source` — repository path, provider reference, or explicit
  unavailable marker;
- `evidence.observedAt` — the observation/record timestamp when known;
- `evidence.verification` — `VERIFIED`, `NOT_VERIFIED`, `UNKNOWN`, `STALE`,
  `BLOCKED`, or `ERROR`;
- `evidence.freshness` — `CURRENT`, `STALE`, or `UNKNOWN`;
- `evidence.evidenceType` — repository, historical, recorded metadata, runtime,
  or provider reference.

Main does not apply a global age threshold. Consumers may apply a policy using
`observedAt`, but must not infer freshness merely from a non-null value.

## Authority rules

| Concept | Authority | Contract treatment |
|---|---|---|
| Main release and source SHA | Main Git/release manifest | Expected reference |
| Current Main HEAD | Main Git | Repository observation |
| Customer repository SHA | Customer GitHub repository | Recorded or future live observation |
| Customer release | Customer release manifest | Recorded/observed reference |
| Migration target | Main release manifest | Expected reference |
| Applied migrations | Customer Supabase database | Unknown until runtime inspection |
| Deployment status | Vercel | Historical/provider reference only in CP-0 |
| Supabase runtime | Supabase | Historical/provider reference only in CP-0 |
| Configuration fingerprint | Recorded client metadata | Explicit scope; not source alignment |
| Approved differences | Machine-readable differences register | Known approved records |
| Unexpected drift | Existing release/provenance tooling | Not inferred from differences register |
| Backup evidence | Customer/provider backup process | Historical evidence unless live-observed |
| Implementation state | Future owner application | Not fabricated in Main |

Lifecycle is descriptive metadata. It does not execute pause, resume,
offboarding, deletion, deployment, migration, or provider actions.

## Differences

Machine-readable differences live at `ops/differences/<clientId>.json` and use
the existing customer-differences vocabulary. An empty register is valid. The
register records approved/known differences; mechanical unexpected drift remains
the responsibility of the existing release/provenance tooling.

## Security boundary

The contract contains non-secret metadata only. It must not contain API keys,
service-role keys, database passwords, private tokens, or secret values.

## Future consumer boundary

`tradesstack-owner` may cache this contract and its evidence timestamps. It
should retain references to Main, GitHub, Vercel, Supabase, and customer
repositories rather than copying customer business data or redefining their
runtime truth.
