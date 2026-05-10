# Tradesstack Commercial Intelligence Architecture

## Purpose

This document defines the Commercial Intelligence Source of Truth for Tradesstack.

The goal is to protect the separation between Tradesstack’s internal intelligence layer and each company’s own accounting or cost-code structure.

Tradesstack is not an accounting-led system. It is an intelligence-led commercial operating system for construction, with accounting/export mappings sitting downstream.

---

## Core Principle

**CostItems are the Commercial Intelligence Source of Truth in Tradesstack.**

A finalized CostItem represents Tradesstack’s authoritative understanding of what a commercial construction cost actually means.

This includes:

* work type
* cost type
* Tradesstack internal cost code
* classification confidence
* review state
* lineage
* revision history
* inherited classification context

Company cost codes, Xero account codes, accounting exports, and financial reporting labels must never replace or redefine this intelligence layer.

---

## Two-Layer Model

Tradesstack must be treated as a two-layer model, not a shared cost-code system.

### Layer 1 — Tradesstack Commercial Intelligence Layer

This is the internal semantic layer owned by Tradesstack.

Examples:

```txt
07.01.MAT
07.01.LAB_MAT
```

This layer powers:

* AI
* forecasting
* benchmarking
* historical cost analysis
* profitability intelligence
* lineage
* supplier insights
* commercial reporting
* semantic classification
* project intelligence

This layer must remain:

* standardized
* controlled by Tradesstack
* organization-agnostic
* versioned carefully
* independent from accounting systems
* protected from customer-specific edits

### Layer 2 — Organization / Company Accounting Codes

This is the company-specific accounting/export layer.

Examples:

```txt
100 Labour
200 Material
201 Plasterboard Material
```

These codes may come from:

* Xero
* CSV import
* manual setup
* existing company estimating structures

This layer is used for:

* Xero/export mapping
* company accounting workflows
* company reporting labels
* finance/admin visibility

This layer is not the commercial intelligence source of truth.

---

## Correct Data Pipeline

The correct Tradesstack pipeline is:

```txt
Natural language line item
→ Tradesstack CostItem classification
→ finalized internal intelligence code
→ organization accounting-code resolver
→ export/accounting/reporting output
```

Example:

```txt
User enters:
13mm GIB plasterboard 2400mm sheet 10 no.

Tradesstack classifies:
Work Type = Wall Linings
Cost Type = MAT
CostItem = 07.01.MAT

Organization resolver applies:
Company Cost Code = 200 Material
```

The user does not manually assign detailed CostItems line by line.

Tradesstack classifies the commercial meaning first, then resolves the company/accounting code afterwards.

---

## Incorrect Data Pipeline

The following pipeline must be avoided:

```txt
Natural language line item
→ organization accounting code
→ commercial meaning inferred from accounting code
```

This is incorrect because company accounting codes are often:

* broad
* inconsistent
* shallow
* incomplete
* customer-specific
* designed for accounting, not intelligence

Using company accounting codes as the intelligence source would weaken AI, reporting, benchmarking, forecasting, and historical analysis.

---

## Source of Truth Rules

### 1. Commercial Meaning Rule

All AI, analytics, forecasting, benchmarking, lineage, and profitability systems must derive commercial meaning from finalized CostItems.

They must not rely on:

* Xero codes
* company cost codes
* raw descriptions alone
* export labels
* accounting categories

---

### 2. Classification Authority Rule

Finalized CostItems represent the authoritative classification of a commercial line item inside Tradesstack.

The authoritative classification includes:

* work_type
* cost_type
* cost_code
* classification_confidence
* needs_review
* classification_source
* original_classification
* final_classification
* parent_cost_item_id lineage
* revision state

---

### 3. Accounting Separation Rule

Organization/company accounting codes are downstream representations of CostItems.

They must never:

* replace CostItems
* redefine CostItem meaning
* overwrite `cost_items.cost_code`
* participate in semantic lineage
* alter classification confidence
* alter review state
* become the basis for AI intelligence

---

### 4. Lineage Rule

Commercial lineage must propagate through CostItems, not accounting mappings.

Quote → Variation → Purchase Order → Claim relationships should preserve commercial meaning through CostItem lineage.

Accounting mappings may be resolved from that lineage, but must not create or alter it.

---

### 5. Resolver Rule

The organization accounting-code resolver may consume finalized CostItems, but may never mutate CostItem semantics.

The resolver’s role is translation only:

```txt
CostItem intelligence → organization accounting/export code
```

It must not feed back into classification.

---

### 6. Override Rule

User overrides to CostItem classifications are allowed only as explicit classification actions.

Overrides must be:

* auditable
* traceable
* separated from accounting mapping changes
* stored as classification governance, not accounting configuration

Changing a company accounting code mapping must not silently change the underlying CostItem classification.

---

### 7. Organization Isolation Rule

Organization-specific accounting structures must remain isolated from the global Tradesstack intelligence ontology.

Company cost codes are organization-specific.

Tradesstack CostItems are platform-level intelligence structures.

One company’s accounting structure must never change the semantic meaning of the global Tradesstack layer.

---

### 8. Export Rule

Exports and accounting integrations are derived outputs of commercial intelligence.

They are not authoritative inputs to commercial intelligence.

Xero, accounting exports, and company cost-code reports should consume resolved CostItem intelligence, not define it.

---

## Ontology Structure

Tradesstack’s commercial intelligence should be structured as a controlled hierarchy.

Recommended hierarchy:

```txt
Trade Group
→ Work Type
→ Cost Type
→ Detailed CostItem
```

Example:

```txt
Trade Group: Wall Linings
→ Work Type: Plasterboard
→ Cost Type: MAT
→ CostItem: 07.01.MAT
```

Another example:

```txt
Trade Group: Wall Linings
→ Work Type: Acoustic Linings
→ Cost Type: LAB_MAT
→ CostItem: 07.03.LAB_MAT
```

This ontology is the semantic foundation of Tradesstack.

It should be:

* controlled
* consistent
* reviewed carefully before changes
* versioned over time
* protected from organization-specific customization

---

## Lifecycle Ownership

| Stage                    | Description                         | Authority                  |
| ------------------------ | ----------------------------------- | -------------------------- |
| Raw line item            | User-entered text or imported line  | Not authoritative          |
| Classifier output        | System-predicted commercial meaning | Proposed intelligence      |
| Review/override          | Human or system confirmation        | Finalized intelligence     |
| CostItem                 | Structured semantic record          | Commercial source of truth |
| Accounting resolver      | Maps intelligence to org code       | Downstream translation     |
| Export/accounting output | Xero/reporting representation       | Derived output             |

---

## Company Cost Code Mapping Philosophy

Companies may have very broad accounting codes.

Examples:

```txt
100 Labour
200 Material
```

Tradesstack should still classify detailed commercial meaning underneath.

Example:

```txt
Line item:
13mm GIB plasterboard 2400mm sheet 10 no.

Tradesstack Intelligence:
Work Type = Wall Linings
Cost Type = MAT
CostItem = 07.01.MAT

Company Accounting Code:
200 Material
```

This allows companies to keep simple accounting structures while Tradesstack builds rich commercial intelligence.

---

## Mapping Rule Levels

Organization accounting mappings may resolve at different levels.

Recommended priority order:

1. Direct internal CostItem code mapping
2. Work Type + Cost Type mapping
3. Work Type mapping
4. Cost Type mapping
5. Organization default/fallback
6. Unresolved / needs accounting review

Example for a simple company:

```txt
LAB → 100 Labour
MAT → 200 Material
SUB → 300 Subcontractors
```

Example for a more detailed company:

```txt
Wall Linings + MAT → 201 Plasterboard Material
Ceilings + MAT → 202 Ceiling Materials
Painting + LAB → 301 Painting Labour
```

The resolver should always consume the finalized CostItem first, then resolve the organization code.

---

## Review Separation

Tradesstack should maintain two separate review concepts.

### Classification Review

Question:

```txt
Did Tradesstack understand the commercial meaning correctly?
```

This affects:

* work_type
* cost_type
* CostItem
* intelligence accuracy
* AI/reporting/forecasting

### Accounting Mapping Review

Question:

```txt
Which company/Xero code should this classified CostItem resolve to?
```

This affects:

* export
* accounting labels
* company reporting
* Xero mapping

These workflows must not be merged.

A classification issue is not the same as an accounting mapping issue.

---

## What Must Not Be Changed

The following must not be repurposed for organization/company accounting codes:

* `cost_items.cost_code`
* `cost_items.work_type`
* `cost_items.cost_type`
* `parent_cost_item_id`
* lineage rules
* revision mechanics
* source revision keys
* supersede flow
* classification confidence
* classification review state
* inherited classification logic
* CostItem review queue semantics

Any future accounting mapping layer must be additive, downstream-only, organization-scoped, and non-destructive.

---

## Implementation Direction

The safest future implementation path is:

### Phase 1 — Additive Accounting Catalog + Mapping Rules

Add organization-scoped tables such as:

```txt
organization_cost_codes
organization_cost_code_mapping_rules
```

Do not touch CostItems.

Do not materialize accounting codes onto document lines yet.

Resolve at read/export time first.

---

### Phase 2 — Settings UI

Add company cost-code setup under Financial Settings.

Support:

* manual company code creation
* simple mapping rules
* default/fallback codes
* unresolved accounting mapping review
* simple mode for companies with only Labour/Material codes

---

### Phase 3 — CSV / Xero Import

After manual setup works, add:

* CSV import
* Xero import
* provider-specific external codes
* sync metadata

---

### Phase 4 — Export / Accounting Output

Use resolved organization accounting codes in:

* exports
* Xero sync
* accounting reports
* finance-facing views

CostItems remain the intelligence source underneath.

---

### Phase 5 — Optional Materialization

Only if performance requires it, consider storing resolved organization accounting codes on specific export snapshots or derived reporting tables.

Do not add this until real export/reporting performance requires it.

---

## Architectural Warning

The biggest risk is semantic mixing.

Tradesstack must never treat company cost codes and Tradesstack CostItems as the same thing.

Correct relationship:

```txt
Company Accounting Code
← resolved from
Tradesstack CostItem
```

Incorrect relationship:

```txt
Company Accounting Code = Tradesstack CostItem
```

If this distinction is lost, Tradesstack’s AI, benchmarking, forecasting, and commercial intelligence layer will degrade.

---

## Final Definition

**The Commercial Intelligence Source of Truth in Tradesstack is the finalized CostItem layer.**

Company cost codes, Xero codes, accounting mappings, and exports are downstream representations of that intelligence.

Tradesstack’s long-term value comes from preserving this separation while automatically translating detailed commercial meaning into each company’s accounting language.
