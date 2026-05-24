# Codex Engineering Rules For TradesStack Intelligence

Use this document as an engineering constraint when designing or implementing new TradesStack features.

Follow alongside:

- `docs/intelligence/tradesstack-intelligence-canonical-model.md`

## Core Rules

All new TradesStack features should consider:

- intelligence events
- AI interaction capture
- validation and correction capture
- organization memory
- platform intelligence boundaries
- auditability
- lineage
- privacy classification

## Canonical Data Rule

Relational business tables remain canonical.

AI and intelligence layers should:

- observe
- validate
- assist
- summarize
- recommend
- learn from accepted and corrected outcomes

AI systems should not become the primary source of operational truth.

## Mutation Safety Rule

Do not introduce AI systems that silently mutate live operational data without:

- validation
- approval or review flow where appropriate
- audit capture
- correction path

Preferred pattern:

AI suggestion
-> validation
-> human review or explicit approval
-> apply
-> event captured

## Event Capture Rule

When implementing meaningful business actions, consider whether they should emit an intelligence event.

High-priority candidates include:

- entity creation
- status changes
- approvals and rejections
- AI output acceptance or rejection
- human corrections
- lineage creation
- financial decisions
- file lifecycle changes

Avoid treating low-value UI noise as intelligence events.

## AI Interaction Rule

When a feature uses AI, design for capture of:

- prompt or prompt reference
- context references
- provider and model
- output
- confidence where available
- validation outcome
- accepted, rejected, or edited disposition
- downstream applied result

## Validation And Correction Rule

If a workflow can produce wrong, risky, or ambiguous outcomes, design for:

- validation checks
- exception handling
- approval states
- overrides
- correction events

Human corrections are high-value learning signals and should be captured when practical.

## Memory Rule

Consider whether accepted patterns should become organization-specific memory.

Examples:

- preferred worksheet structures
- preferred cost code mappings
- recurring estimating conventions
- supplier allocation preferences
- accepted classification patterns

Company memory must remain organization-scoped.

## Platform Intelligence Rule

Consider whether anonymized aggregate signals can contribute to platform intelligence.

Platform intelligence must:

- be anonymized
- be aggregated
- avoid tenant leakage
- exclude raw private operational content

Never promote raw customer data into platform intelligence.

## Privacy Rule

When designing new intelligence-related data capture, classify privacy impact early.

Pay special attention to:

- financial data
- personal data
- attachments
- invoice content
- chat content
- customer-specific commercial terms

Default to organization-scoped visibility unless there is a strong reason otherwise.

## Lineage Rule

Where data flows from one module to another, preserve lineage when practical.

Examples:

- opportunity to project
- quote to variation
- purchase order to actual cost
- supplier invoice to allocation
- takeoff to quantity
- AI suggestion to accepted operational change

## Backward Compatibility Rule

Do not break existing workflows to introduce intelligence architecture.

Prefer:

- additive schema
- dual-write adoption
- adapters over rewrites
- gradual rollout

## Implementation Bias

For new backend work, prefer patterns that make later intelligence adoption easier even if the first feature does not fully use all layers yet.

At minimum, think through:

- what happened
- who did it
- what changed
- what it relates to
- whether AI was involved
- whether validation or correction occurred
- what should remain private
