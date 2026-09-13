# Opportunity Master Quote and Tender Clients — Implementation Assessment

## Verdict

The existing architecture supports the approved model with a small additive extension. `project_quotes` is already the canonical commercial header/line-item record and can safely hold one internal Master Quote per Opportunity, provided that the row is explicitly identified and excluded from Quote Series, client-facing reads, acceptance, conversion, and public numbering.

## A. Can `project_quotes` safely hold the Master Quote?

**PARTIAL before implementation; YES with an explicit Master role.**

The table already owns all commercial fields, line items, worksheet links, commercial-item links, save concurrency, totals, and PDF projection used by the existing editor. A series-null Opportunity tender row cannot be reused implicitly because `require_series_for_opportunity_quote_insert` deliberately rejects that shape. The safe extension is an `is_master_quote` discriminator, one partial unique index per Opportunity, a Draft-only invariant, and a private `MASTER-<opportunity-id>` storage identity that is never presented as a public quote number.

## B. Best Tender Client storage model

No reusable join model exists. Add `opportunity_tender_clients` with organization-scoped Opportunity/client foreign keys, `is_primary`, audit fields, and `archived_at`. Keep `organization_opportunities.client_id` as the backwards-compatible primary/default CRM client. Tender Clients are the complete potential recipient set; the winner remains derived from the accepted series revision.

## C. Best Master Quote storage model

Use one explicitly marked `project_quotes` row. A dedicated table would duplicate the mature commercial persistence/editor model. Worksheet-only storage would lose the quote-level commercial fields, review state, terms, and stable snapshot source required for distribution.

## D. Required schema changes

- `opportunity_tender_clients` table, RLS, indexes, and active uniqueness.
- `project_quotes.is_master_quote`.
- `project_quotes.source_master_quote_id`, source timestamp, and source snapshot hash for immutable distribution provenance.
- One active series per Opportunity/recipient.
- One Master Quote per Opportunity.
- Master Draft/series-null invariants and exclusion from accepted authority.
- Atomic tender-client synchronization, Master creation, single distribution, bulk missing distribution, and one-query quotation workspace read model.

## E. Required migrations and backfills

- Backfill every non-null `organization_opportunities.client_id` as an active Tender Client and mark it primary.
- Backfill every non-null Quote Series recipient as a Tender Client.
- Do not recreate or renumber existing Quote Series.
- Preserve unresolved legacy series recipients as existing anomalies; do not invent client identity.
- Existing Master rows do not exist and therefore require no historical conversion.

## F. Existing components and functions to reuse

- `components/app/QuoteEditorShared.tsx` and `components/app/OpportunityQuoteRevisionEditor.tsx` for Master editing.
- `save_commercial_quote_draft` for header, totals, line-item persistence, and optimistic concurrency.
- `project_quote_line_items`, `commercial_item_document_links`, and quote-linked pricing worksheets for snapshot content/provenance.
- `create_opportunity_quote_revision_v1` for independent client revisions after distribution.
- `get_opportunity_quote_register_v1` and `get_opportunity_quote_revision_history_v1` for client revision navigation.
- `select_opportunity_accepted_quote_revision_v1` and `award_opportunity_by_lifecycle_v1` remain the sole acceptance/conversion authority.
- `lib/project-quote-pdf-snapshot.ts` remains the exact persisted revision PDF source.

## Existing single-client assumptions

`organization_opportunities.client_id` is nullable in the original schema but normal creation currently requires exactly one existing or newly created client. It drives Opportunity detail display/editing, client conversion metrics, workspace `client_id`, worksheet quote defaults, board/table rows, legacy Outstanding Quotes fallbacks, and several project/work-context readers. Removing or redefining it would be unsafe. The implementation therefore treats it only as the primary/default client and adds the full Tender Client set alongside it.

## Downstream boundaries

Master Quotes remain series-null and are excluded by the canonical series-based Outstanding Quotes and Client Quotes reads. They cannot be selected as accepted revisions, cannot drive conversion, and are never live-linked to distributed revisions. Distribution copies persisted commercial state into a new client Rev 1 and records immutable source evidence.
