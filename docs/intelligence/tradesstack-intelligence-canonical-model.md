# TradesStack Intelligence Canonical Model (V1)

## Purpose

TradesStack is not positioning AI as a standalone feature.
TradesStack is positioning itself as a construction intelligence platform.

This document defines the long-term intelligence architecture that sits beneath:

- Estimating
- Pricing worksheets
- Takeoff
- Quotes
- Variations
- Purchase orders
- Supplier invoices
- Cost items
- Cost codes
- QA / Safety
- Timesheets
- Projects
- Commercial reporting
- Future AI agents

The goal is:

> Every important business action should be capturable as structured intelligence.

---

# Core Architectural Principle

## Business Data Remains Canonical

Relational business tables remain the source of truth.

AI/intelligence layers:

- observe
- validate
- assist
- learn
- summarize
- recommend
- automate safely

AI must NOT become the primary database.

---

# Intelligence Architecture Layers

## Layer 1 — Relational Business Data

Canonical operational system.

Examples:

- opportunities
- pricing worksheets
- takeoff measurements
- purchase orders
- supplier invoices
- cost items
- claims
- QA records
- timesheets

This layer:

- drives workflows
- powers reports
- stores operational truth
- remains deterministic

---

## Layer 2 — Intelligence Event Layer

Universal append-mostly event system.

Purpose:

Capture important actions, changes, decisions, AI interactions, approvals, corrections, and lineage.

Key principle:

> Intelligence events describe what happened.

Not every UI interaction is an intelligence event.

---

## Layer 3 — AI Interaction Layer

Tracks:

- prompts
- models
- outputs
- confidence
- accepted/rejected actions
- edited AI results
- validation outcomes

Key principle:

> AI actions must be explainable, auditable, and reviewable.

---

## Layer 4 — Validation Layer

Tracks:

- business rule checks
- approvals
- overrides
- exceptions
- conflicts
- corrections

Key principle:

> AI suggestions are not automatically truth.

Validation matters.

---

## Layer 5 — Organization / Company Memory

Private tenant-specific intelligence.

Examples:

- preferred worksheet structures
- preferred cost code mappings
- supplier allocation patterns
- markup patterns
- accepted AI classifications
- recurring exclusions/assumptions
- trade-specific conventions

Key principle:

> Company memory never leaks across tenants.

---

## Layer 6 — Platform Intelligence

Strictly anonymized aggregate intelligence.

Examples:

- common estimating structures
- common classification corrections
- workflow bottlenecks
- approval timing patterns
- supplier invoice match success patterns
- takeoff correction trends

Key principle:

> Platform intelligence must never expose raw customer data.

---

# Intelligence Event Philosophy

## Tier 1 — High-Value Intelligence Events

Always store.

Examples:

- worksheet saved
- AI worksheet accepted
- AI worksheet rejected
- cost code corrected
- supplier invoice allocation approved
- purchase order approved
- takeoff measurement corrected
- variation approved
- quote accepted
- project stage changed

These are high-value learning signals.

---

## Tier 2 — Operational Events

Store selectively or summarized.

Examples:

- draft saves
- repeated recalculations
- intermediate edits
- assignment changes
- attachment changes

These help workflow intelligence but should not flood the system.

---

## Tier 3 — UI Noise

Do NOT store as intelligence.

Examples:

- every keystroke
- every mouse click
- selection changes
- hover state
- temporary focus changes
- scrolling

Key principle:

> Noise destroys intelligence quality.

---

# Canonical Identity Rules

## Source of Truth Rules

### Worksheet identity

Canonical:

- opportunity_pricing_worksheets.name

NOT:

- worksheet_data.sheetName

### Project identity

Canonical:

- organization_projects

### Supplier identity

Canonical:

- organization_suppliers

### Cost code identity

Canonical:

- organization_cost_codes

---

# AI Lifecycle

## Stage 1 — User Request

User asks AI:

Example:

> Build me a suspended ceilings worksheet

Store:

- prompt
- context
- user
- module
- worksheet/project references

---

## Stage 2 — AI Generation

AI returns:

- rows
- formulas
- categories
- assumptions
- formatting
- recommendations

Store:

- structured output
- confidence
- model/provider
- latency
- token usage

---

## Stage 3 — Validation

System validates:

- formula validity
- missing refs
- unsupported functions
- cost-code compatibility
- supplier mapping
- business rules

Store:

- pass/fail
- warnings
- approval requirements

---

## Stage 4 — Human Review

User:

- accepts
- edits
- rejects
- overrides

Store:

- final accepted structure
- edits
- override reason
- rejected output

---

## Stage 5 — Learning

System updates:

### Company memory

Examples:

- this company prefers these worksheet structures
- this company uses these cost-code mappings
- this company rejects these AI suggestions

### Platform intelligence

Only anonymized aggregate patterns.

---

# Privacy Boundaries

## Never Shared Across Organizations

Never promote these into platform intelligence:

- supplier pricing
- labour rates
- project names
- invoice contents
- client names
- bank details
- commercial totals
- raw attachments
- raw chat transcripts

---

## Allowed Platform Intelligence

Allowed only as anonymized aggregates:

- common worksheet structures
- common formula patterns
- common approval flows
- common correction patterns
- AI success/failure rates
- common takeoff correction types

---

# AI Safety Principles

## AI Must Not Silently Mutate Data

Preferred flow:

AI Suggestion
→ Preview
→ Validation
→ Human Approval
→ Apply

NOT:

AI → directly edits live operational data.

---

## Human Corrections Are Gold

Corrections are more valuable than passive usage.

Examples:

- corrected classifications
- corrected mappings
- rejected outputs
- edited formulas
- revised worksheet structures

These should heavily influence organization memory.

---

# Long-Term Spreadsheet Intelligence Strategy

## Spreadsheet Engine

TradesStack owns:

- formulas
- worksheet structure
- formatting
- validations
- persistence
- auditability

This enables:

- AI-generated worksheets
- worksheet intelligence
- template intelligence
- estimating memory
- cross-project benchmarking

---

## Future AI Spreadsheet Flow

Ask AI
→ AI proposes worksheet
→ validation
→ preview
→ apply
→ event captured
→ company memory updated
→ anonymized platform learning

---

# Long-Term Construction Intelligence Vision

TradesStack should become:

- estimating intelligence
- commercial intelligence
- supplier intelligence
- workflow intelligence
- QA intelligence
- project intelligence
- forecasting intelligence
- operational intelligence

Not:

> “construction software with AI”

But:

> “construction intelligence infrastructure.”

---

# Recommended Initial Intelligence Producers

## Highest Value First

### Pricing worksheets

Capture:

- worksheet generation
- formula corrections
- accepted/rejected AI outputs
- worksheet structures

### Supplier invoice AI matching

Capture:

- accepted matches
- rejected matches
- allocation corrections

### Takeoff corrections

Capture:

- measurement corrections
- grouping changes
- calibration adjustments

### Cost item review / cost code mapping

Capture:

- confirmed classifications
- mapping overrides
- approval patterns

---
