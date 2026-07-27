# Memory Pipeline Dead-Letter Runbook

This runbook covers the TradesStack worksheet intelligence and Learn Over Time worker pipeline:

1. `worksheet_mutation_evidence_v2_outbox`
2. `worksheet_event_classification_queue`
3. `worksheet_memory_evidence_pool_queue`
4. `worksheet_memory_semantic_pool_queue`
5. `worksheet_memory_synthesis_queue`
6. `organization_memory_retirement_queue`

Use this when a row is `dead_lettered`, stuck in `claimed`, or repeatedly cycling through `retry_scheduled`.

## Before Touching A Row

Capture these fields first:

- table name
- row `id`
- `organization_id`
- `queue_state` or `processing_status`
- `attempt_count`
- `last_error_code`
- `last_error_message`
- `claimed_at`
- `claim_expires_at`
- `retry_after`
- any stage-specific source IDs

Also capture the upstream/downstream lineage:

- outbox: `client_mutation_id`, `worksheet_id`, `occurred_at`
- classification: `source_event_id`
- Stage 6: `classification_record_id`, `source_event_id`
- Stage 7: `semantic_pool_id`, `source_revision_hash`
- Stage 8: `semantic_pool_id`, `source_revision_hash`
- retirement: `memory_id`

## Triage Classes

Classify the row into one of three buckets.

### Retryable

Use when the source data is valid and the failure was transient.

Examples:

- expired claim token path
- temporary provider/network failure
- worker crash after claim
- stale `claimed` row whose lease expired

Action:

- reset the row to `pending`
- clear claim and error fields
- rerun the real worker route

### Grandfathered Historical Debt

Use when the row is from an old code path or synthetic audit data and should not remain in live queue health.

Examples:

- historical Stage 8 `no_included_evidence` dead letters from before truthful `no_memory` handling
- synthetic invalid audit fixtures with impossible payloads

Action:

- if safely reprocessable under current code, reset and rerun through the real worker
- if impossible to process and clearly synthetic/dev-only, remove it after capturing evidence

### Product Bug

Use when current code can still reproduce the failure on valid data.

Examples:

- valid worksheet snapshot rejected by current outbox validator
- cross-org data accepted by a writer
- current Stage 8 still dead-letters `no_included_evidence`

Action:

- stop cleanup
- preserve the failing row
- fix code first
- add a regression test
- rerun only after the fix

## Safe Retry Procedure

Use service-role access.

1. Verify the current code path should succeed.
2. Reset the row to `pending`.
3. Clear:
   - `claimed_at`
   - `claim_expires_at`
   - `claimed_by`
   - `claim_token`
   - `retry_after`
   - `last_error_code`
   - `last_error_message`
4. Set `available_at = now()`.
5. Reset `attempt_count` only for historical debt rows being replayed under a newer code path.
6. Run the real worker route.
7. Confirm the row ends in `completed` or a truthful terminal state.
8. Confirm downstream side effects match the stage contract.

## Route Surface

Use the real app-runtime routes whenever possible.

Cron routes:

- `GET /api/cron/worksheet-mutation-evidence-v2/run`
- `GET /api/cron/worksheet-event-classifications/run`
- `GET /api/cron/worksheet-memory-evidence-pools/run`
- `GET /api/cron/worksheet-memory-semantic-pools/run`
- `GET /api/cron/worksheet-memory-synthesis/run`
- `GET /api/cron/organization-memory-retirement/run`

Requirements:

- bearer `CRON_SECRET`

Internal admin routes:

- `POST /api/internal/worksheet-mutation-evidence-v2/run`
- `POST /api/internal/worksheet-event-classifications/run`
- `POST /api/internal/worksheet-memory-evidence-pools/run`
- `POST /api/internal/worksheet-memory-semantic-pools/run`
- `POST /api/internal/worksheet-memory-synthesis/run`
- `POST /api/internal/organization-memory-retirement/run`

Requirements:

- authenticated platform admin

## Stage-Specific Checks

### Outbox

Retry only if both `previous_worksheet` and `next_worksheet` are valid worksheet snapshots.

Do not retry:

- empty `{}` snapshots
- synthetic invalid audit fixtures

Expected downstream result:

- `intelligence_events` written
- outbox row `completed`

### Classification

Retry only if the source `intelligence_event` still exists and belongs to the same organization.

Expected downstream result:

- `worksheet_event_classifications` written or reused
- Stage 6 queue row created

### Stage 6 Evidence Pools

Retry only if the classification row exists and still belongs to the same organization.

Expected downstream result:

- `worksheet_memory_evidence_pools` rebuilt
- `worksheet_memory_evidence_pool_events` rebuilt
- Stage 7 queue rows created only from persisted Stage 6 output

### Stage 7 Semantic Pools

Retry only if persisted Stage 6 pools and pool-event links exist for the target organization.

Expected downstream result:

- `worksheet_memory_semantic_pools` updated
- `worksheet_memory_semantic_pool_events` reconciled
- Stage 8 queue rows created only when eligible

### Stage 8 Synthesis

Retry only if the semantic pool and semantic-pool events still exist.

Expected downstream result for positive memory:

- `organization_memory_items`
- `organization_memory_links`
- `organization_memory_synthesis_history`
- `organization_memory_lifecycle_history`
- optional `organization_memory_confidence_history`

Expected downstream result for non-synthesizable pools:

- queue row `completed`
- synthesis history row with `no_memory`
- no memory item
- no lifecycle row
- no confidence row

### Retirement

Retry only if the memory still exists and the evaluator basis is still coherent.

Expected downstream result:

- `memory_retired` lifecycle row only when the threshold is truly met
- no confidence mutation unless the retirement model explicitly requires it

## When To Mark Resolved

Resolved means one of:

- row was retried and completed truthfully
- row was removed as synthetic/grandfathered historical debt
- row remains preserved as an open product bug with an issue filed

Do not call a row resolved if it is still `dead_lettered` without a clear reason.

## Escalate Immediately When

- the same current-code failure reproduces on valid data
- any cross-org mismatch appears in writer output
- immutable history tables can be updated or deleted
- a worker creates misleading downstream rows
- a retry creates duplicate active memories, duplicate pools, or duplicate queue work

## Evidence To Attach To An Incident

- before/after row snapshots
- route called
- HTTP response
- downstream rows created or not created
- exact queue/run/history IDs
- whether the row was retried, removed, or left for a code fix
