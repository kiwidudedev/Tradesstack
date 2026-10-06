# TradesStack AI Data Coverage Map

This is an implementation map for the Assistant read boundary. It records
what the product currently stores, which source is authoritative, what the
Assistant exposes, and where an answer must remain explicitly limited.

## Coverage status

| Domain | Canonical product source | Assistant coverage | Authority / limitation |
| --- | --- | --- | --- |
| Project identity and dashboard | `organization_projects`, dashboard loaders, financial summary service | Full for project overview and bounded briefing | Project-scoped and organization-scoped reads; profitability remains unsupported without authoritative cost/margin evidence |
| Variations | `project_variations` | Register coverage | Header totals and approval state only |
| Variation pricing | `project_variation_line_items` | Deep coverage via `variation_details` | Groups only canonical `section` values: Materials, Labour, Subcontractors, Plant, Margin; sums stored line `total` values excl. GST before variation margin |
| Variation lineage | Variation line source quote/PO IDs | Included in `variation_details` | Exact source IDs are returned; no title/description classification |
| Purchase orders | `project_purchase_orders`, `listPurchaseOrders` | Register coverage | Status and commitment eligibility are explicit |
| Purchase-order pricing | `project_purchase_order_line_items` | Deep coverage via `purchase_order_details` | Uses canonical line `section` and stored line totals; draft status is not treated as committed |
| Payment claims | `project_claims` | Register coverage | Claim amount, status, retention withheld |
| Claim lines and lineage | `project_claim_line_items` | Deep coverage via `claim_details` | Uses stored claim amounts and `source_kind`/`source_line_item_id`; variation claims are returned only when source lineage says so |
| Retention | retention position service and origins | Full bounded retention position | Uses existing permission-aware service; provider state remains separate |
| Quotes | `project_quotes` | Register coverage | Quote detail/line drill-down remains a follow-up capability |
| Estimating / worksheets | pricing worksheet services and workbook tables | Not yet exposed as a general Assistant read adapter | Product contains structured worksheet data; Assistant must not answer allowance questions from quote or project totals |
| Takeoff | takeoff pages, calibrations, measurements, geometry | Not yet exposed as a general Assistant read adapter | Product contains measurement structures; Assistant must disclose unavailable takeoff evidence |
| QA | `project_qas` and QA execution services | Current definition register only | Legacy QA, runs, responses, evidence, hold points and defects are not yet unified in Assistant V1 |
| Tasks / activity | project task services and activity tables | Project activity is bounded; task detail is not yet exposed | No “who are we waiting on?” conclusion from activity alone |
| Files / drawings | Files workspace and drawing-set services | Authorized metadata only | File contents, signed URLs and drawing interpretation are not sent to the provider |
| Supplier invoices / actuals | supplier invoice workflow, actual cost and accounting tables | Not yet exposed as a general Assistant read adapter | No spend or actual-cost claim without a canonical adapter |

## Deep-read contract

Deep commercial tools return structured evidence with:

- project and organization scoping;
- source service and canonical table;
- record and line IDs for citations;
- tax basis and value basis where applicable;
- deterministic component totals;
- source lineage IDs when stored; and
- evidence status or explicit unsupported-inference notes.

The model may explain these results, but it must not infer cost type from a
variation title, line description, supplier name, or file name.

## Remaining product-data gaps

The product does not currently provide one normalized cost-classification and
lineage read model spanning estimate, takeoff, quote, variation, purchase
order, invoice and claim. Existing tables do contain meaningful local
classification and lineage, so the Assistant exposes those local authorities
first and reports cross-module gaps rather than fabricating a unified answer.
