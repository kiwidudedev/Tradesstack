# Worksheet Memory Derivation: AI-Assisted Design

## Status

This is a design note only.

No implementation is proposed in this document.

## Current State

The worksheet learning pipeline is now:

`Worksheet Edit -> intelligence_events -> worksheet_event_classifications -> interpretation_payload -> worksheet memory derivation`

The interpretation layer is working as intended:

- It preserves observed estimator behavior.
- It preserves direct worksheet and pricing impacts.
- It avoids unsupported engineering, compliance, and business motive claims.
- It stores reusable `futureUse` guidance.

The current derivation layer in [lib/worksheet-memory-derivation.ts](/Users/corey/Desktop/Tradesstack-ai/lib/worksheet-memory-derivation.ts) is not broken, but it is still built around deterministic aggregation and older memory families.

## Audit Findings

### Confirmed working

- Classified worksheet rows are being fetched through `list_classified_worksheet_memory_events`.
- Interpretation payloads are present and readable.
- Derivation is receiving those interpreted rows.
- Persistence into `organization_memory_items` is functional.

### Current bottlenecks

1. `MINIMUM_EVIDENCE_FOR_MEMORY = 3` is intentionally conservative.
   This should stay. One edit should not become durable memory.

2. Scope keys are too brittle.
   `buildScopeKey()` currently combines many exact fields such as `pageType`, `itemCategory`, `normalizedUnit`, `measurementBasis`, `costRole`, and normalized labels.

3. Similar events fragment into separate groups.
   Small wording differences like `meter` vs `metres`, `waste_factor` vs `waste_allowance`, and `material_and_labour_driver` vs `material_and_labour_multiplier` stop aggregation.

4. The derivation layer still expects legacy memory families.
   `isAssumptionEvent`, `isRateEvent`, and `isFormulaEvent` mostly map toward:
   - `assumption_pattern`
   - `rate_override_pattern`
   - `formula_pattern`

5. The interpretation layer is already richer than the derivation layer.
   [lib/worksheet-event-semantic-classification.ts](/Users/corey/Desktop/Tradesstack-ai/lib/worksheet-event-semantic-classification.ts) now emits `futureUse.memoryCandidate`, `futureUse.memoryType`, `retrievalGuidance`, and cautious business/context summaries, but derivation only partially consumes that signal.

## Root Cause

The system has shifted from tag-first classification to interpretation-first classification, but memory derivation still behaves like a deterministic classifier reducer.

That mismatch shows up in two places:

- Grouping relies on exact normalized tags instead of semantic similarity.
- Memory persistence relies on a narrow set of fixed memory types instead of interpreting repeated estimator behavior across loosely similar contexts.

## Design Goal

Replace exact-rule memory derivation with AI-assisted memory proposal generation while preserving deterministic safeguards around evidence and persistence.

Anthropic should determine semantic meaning and semantic sameness.

TradesStack should validate evidence integrity and decide whether proposed memories are safe to store.

## Recommended Architecture

### Phase 1: evidence collection

Do not send raw organization-wide history directly to the model.

First, assemble bounded evidence batches from interpreted events without trying to decide semantic sameness in application code.

Allowed batching rules should stay non-semantic and safety-oriented:

- `organizationId` required
- bounded batch size
- recent-first or deterministic pagination
- optional coarse technical partitioning only when required by prompt size or data-shape safety:
  - formula-bearing events separated from non-formula events
  - workbook flow events separated from single-cell edit events

This stage must not attempt to determine whether events mean the same thing.

TradesStack should not use construction-specific keyword matching, synonym maps, item-category mappings, label dictionaries, trade-specific normalization rules, or other domain-specific interpretation logic to decide what belongs together conceptually.

### Phase 2: AI memory proposal

For each bounded evidence batch, ask Anthropic to decide whether any subset of the interpreted events represents a repeated pattern worthy of durable memory.

The prompt should ask Anthropic to determine:

- repeated estimator behavior
- repeated company preference
- repeated worksheet pattern
- repeated formula correction behavior
- repeated pricing behavior
- whether multiple interpreted events represent the same business, estimating, pricing, worksheet, formula, workflow, or construction concept

The model should return structured proposals, not free text.

Recommended output shape:

```ts
type ProposedWorksheetMemoryCandidate = {
  memoryCategory:
    | "worksheet_pricing"
    | "worksheet_formula"
    | "worksheet_structure"
    | "worksheet_workflow";
  memoryType: string;
  proposalKind:
    | "assumption_preference"
    | "rate_preference"
    | "formula_correction_pattern"
    | "structure_pattern"
    | "workflow_pattern"
    | "no_memory";
  title: string;
  summary: string;
  confidence: number;
  evidenceEventIds: string[];
  contradictoryEventIds: string[];
  retrievalGuidance: string | null;
  memoryValue: Record<string, Json | null>;
  scope: {
    organizationId: string;
    tradePackage: string | null;
    pageType: string | null;
    itemFamily: string | null;
    unitFamily: string | null;
  };
};
```

Important constraints:

- The model should not be asked to invent engineering rationale or root-cause theory.
- The model should summarize repeated estimator behavior from the provided interpreted events.
- The model should decide semantic sameness.
- The backend should not try to independently recreate that judgement.

### Phase 3: deterministic persistence gate

Persistence should remain code-controlled.

A proposal is only persisted when:

- it contains at least `3` supporting events
- evidence IDs are valid and unique
- all evidence belongs to the same organization
- the proposal confidence is above a minimum threshold
- the proposal is internally consistent
- contradiction levels stay within accepted limits
- the proposal memory type is allowed by TradesStack
- persistence safety rules pass

This preserves the current governance rule:

One edit should not create a durable memory.

### Phase 4: canonical internal memory families

Do not persist raw LLM memory labels directly as the long-term storage contract.

Instead, allow the LLM to reason in richer language, then map accepted proposals into a stable internal family set for storage and retrieval.

Recommended internal storage families:

- `assumption_preference`
- `rate_preference`
- `formula_preference`
- `worksheet_structure_pattern`
- `worksheet_workflow_pattern`

Interpretation-side labels such as:

- `input_assumption_adjustment`
- `structural_design_assumption`
- `assumption_correction`
- `trade_assumption_refinement`
- `construction_assumption_correction`

should be treated as AI-provided evidence hints, not as the final persisted taxonomy.

This avoids replacing one brittle enum problem with another.

## System Boundary

Anthropic owns meaning.

TradesStack owns validation.

That boundary should be strict.

Anthropic decides:

- whether two interpreted events represent the same concept
- whether repeated behavior exists
- whether a proposed memory is best understood as pricing, worksheet, formula, workflow, business, estimating, or construction-related behavior
- which evidence events support or contradict the proposal

TradesStack validates:

- evidence IDs exist
- evidence IDs belong to the same organization
- evidence counts satisfy thresholds
- proposal payloads are structurally valid
- proposal consistency rules pass
- contradiction levels are within policy
- persistence safety rules pass

TradesStack must not attempt to independently determine whether two interpreted events represent the same business, estimating, pricing, worksheet, formula, workflow, or construction concept.

TradesStack must not rely on:

- construction-specific keyword matching
- synonym maps
- item-category mappings
- label dictionaries
- trade-specific normalization rules
- other domain-specific semantic interpretation logic

## Why This Is Better Than More Deterministic Normalization

Pure deterministic normalization is the wrong place to solve construction-language ambiguity.

Reasons:

- terminology drift is large and ongoing
- worksheet labels are local and estimator-specific
- the interpretation layer already captures meaning in natural language
- grouping correctness depends more on semantic sameness than exact token sameness

Deterministic code should still enforce:

- organization boundaries
- evidence thresholds
- evidence batch assembly
- persistence validation
- idempotent memory keys

The LLM should decide semantic sameness within a bounded evidence batch.

## Recommended Evidence Batching Strategy

Use a bounded evidence batch model.

### 1. Hard guardrails

Events must match on:

- `organizationId`

Optional technical partitions are acceptable only to keep prompts coherent and bounded:

- formula events should not mix with non-formula events
- page-flow and structure patterns should remain separate from value-preference patterns

These are batching constraints, not semantic classification decisions.

### 2. Evidence supplied to the model

Events may differ on any semantic dimension. That is acceptable because Anthropic, not backend code, should determine whether they belong together conceptually.

Include as evidence features:

- `semanticFields`
- `futureUse.memoryType`
- `futureUse.retrievalGuidance`
- `observed`
- `knownImpact`
- `interpretation`
- raw worksheet labels and units
- workbook and sheet context
- event type
- interpretation confidence detail

This gives the model room to decide whether:

- `post spacing`
- `structural spacing`
- `stud spacing`

represent the same repeated estimator preference in context, without backend synonym logic.

## Proposed Memory Key Strategy

Do not build the final persisted `memory_key` from raw exact scope fields alone.

Recommended approach:

1. Persist accepted proposals with a stable canonical scope payload in `memory_value`.
2. Build `memory_key` from that canonical scope plus the chosen preference target.
3. Include a `derivationMethod` field such as:
   - `deterministic_v1`
   - `ai_assisted_v1`

Example canonical key inputs:

- behavior class
- canonical scope family
- canonical field family
- canonical preferred target

That reduces accidental duplication when two pools surface the same durable memory.

## Prompt Design Guidance

The derivation prompt should explicitly instruct the model to:

- identify repeated estimator behavior, not correctness
- separate strong repeated preference from one-off edits
- reject memory creation when evidence is weak or mixed
- use only supplied interpreted events
- avoid unsupported engineering, compliance, or commercial motive claims
- return `no_memory` when the pool is noisy or contradictory
- explicitly decide whether evidence events do or do not represent the same concept

The prompt should also ask for contradiction handling:

- if two common preferred targets both appear in the same scope, do not force a single winner unless evidence is dominant

## Persistence Policy

The current `organization_memory_items` model is compatible with this direction.

Good existing fields:

- `memory_value`
- `evidence_summary`
- `confidence_score`
- `reinforcement_count`
- `contradiction_count`
- `is_active`
- `is_user_confirmed`

Recommended additions for AI-assisted derivation:

- store `derivationMethod` in `memory_value`
- store `proposalConfidence` in `evidence_summary`
- store `supportingEventIds` and `contradictoryEventIds` in `evidence_summary`
- store pool metadata such as `poolBehaviorClass` and `poolVersion`

No user-confirmation requirement should be added for initial persistence unless product policy changes. The current evidence threshold already provides a reasonable first gate.

## Rollout Plan

### Step 1

Keep the current deterministic derivation in place.

Add a parallel AI proposal path that runs in shadow mode and writes no memories.

### Step 2

Compare:

- deterministic candidate count
- AI proposed candidate count
- overlap in source events
- false fragmentation rate
- rejected noisy pools

### Step 3

Enable persistence only for the safest proposal classes first:

- assumption preferences
- formula correction patterns

### Step 4

Expand to:

- rate preferences
- worksheet structure patterns
- workflow patterns

## Implementation Notes For Later

When implementation begins, likely changes will center on:

- [lib/worksheet-memory-derivation.ts](/Users/corey/Desktop/Tradesstack-ai/lib/worksheet-memory-derivation.ts)
- [lib/worksheet-event-semantic-classification.ts](/Users/corey/Desktop/Tradesstack-ai/lib/worksheet-event-semantic-classification.ts)
- a new AI derivation prompt/schema helper near the worksheet AI provider stack
- tests that cover pool construction, proposal validation, and persistence gating

The current deterministic path is still useful as:

- a temporary fallback during rollout
- a baseline comparison
- a regression reference for evidence validation and persistence mechanics

## Recommendation

Proceed with AI-assisted memory derivation.

Do not remove the evidence threshold.

Do not add construction-specific semantic normalization into the backend.

Use backend logic only to assemble bounded evidence batches, validate evidence integrity, enforce contradiction and persistence policy, and persist accepted proposals.

Use Anthropic to determine meaning, sameness, and proposed memory structure.
