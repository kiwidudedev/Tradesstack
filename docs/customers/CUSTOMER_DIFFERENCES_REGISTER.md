# TradesStack Customer Differences Register

This register answers:

> **What is different about this customer compared with TradesStack Main?**

No meaningful customer-specific behavior should exist only in someone's
memory. Maintain this register for every customer and review it before each
release, support diagnosis and implementation change.

## Difference record

| Field | Value |
|---|---|
| Difference ID | `DIFF-001` |
| Category | Config / Branding / Template / Workflow / Permission / Integration / AI / Module / Extension / Source / Database / Migration / Operations / Limitation / Temporary patch |
| Description | What differs from Main? |
| Business reason | Why is the difference needed? |
| Owner | Customer or TradesStack owner |
| Source location | Configuration, template, repository path, provider or record location; never a secret value |
| Main impact | None / Candidate / Required |
| Upgrade impact | Compatibility or deployment risk |
| Migration impact | Schema, data or ledger implications |
| Test coverage | How is it tested? |
| Permanent? | Yes / No / Temporary |
| Reconciliation plan | How will it return to Main or remain supported? |
| Review date | |
| Status | Active / Removed / Reconciled |

## Categories

Record differences under the following headings:

- configuration and company settings;
- branding and terminology;
- templates and documents;
- workflows and approvals;
- permissions and roles;
- integrations and provider settings;
- AI prompts, context, models and usage arrangements;
- module enablement;
- controlled extensions;
- source-code differences;
- database/data differences;
- migration differences;
- operational differences such as backups, workers and monitoring;
- known limitations; and
- temporary patches.

## Review rules

- Record the difference before or at implementation.
- Record the owner and reason, not just the technical location.
- Treat source and database differences as high-risk.
- Review all active differences before a Main upgrade.
- Every temporary patch needs an expiry or reconciliation decision.
- If a difference would help other customers, create a Main capability
  candidate.
- Remove or mark reconciled differences after the Main release is adopted.
- Never store passwords, tokens, service-role keys or other secret values.

## Customer summary

- Customer:
- Customer ID:
- Main release:
- Main source SHA:
- Client repository SHA:
- Migration target:
- Configuration version/fingerprint:
- Register owner:
- Last review:
- Next review:

## Active differences

| ID | Category | Summary | Owner | Main impact | Upgrade impact | Review date | Status |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

