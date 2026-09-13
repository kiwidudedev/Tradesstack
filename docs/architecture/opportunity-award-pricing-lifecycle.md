# Opportunity award pricing lifecycle invariants

This document defines the commercial safety boundary for carrying tender pricing into a Project.

1. The quote selected by `opportunity_final_projects.accepted_quote_id` becomes immutable when the award completes.
2. The workbook versions and commercial ranges that formed that quote become immutable tender evidence.
3. Every award records explicit quote-line provenance; workbook selection is never inferred from timestamps, array order, or “latest” records.
4. Award creates separate Project-owned `project_workspace` workbook continuations with lineage to the accepted tender basis; it does not create a quote revision.
5. Persisted quote revision metadata, lines, and totals—not a live worksheet or unsaved React state—are the customer-facing quote and PDF authority.
6. Worksheet publication may update an unlocked draft or create a successor revision; it cannot mutate an award-locked quote.
7. Award conversion, manifest creation, source recording, and Project workspace cloning are idempotent and tenant-scoped.
8. Historical records whose source basis cannot be proven are classified for reconciliation and are never repaired by guessing.
9. A Draft Project quote and its quote-owned worksheet snapshots are created only by the explicit `create_project_quote_revision_v1` action.

The original Opportunity workbook remains tender history. Project-side edits must not change it, its accepted snapshot, or the accepted quote.
