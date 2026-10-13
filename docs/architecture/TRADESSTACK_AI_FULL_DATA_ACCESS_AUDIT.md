# TradesStack AI — Full Data Access Architecture Audit

Audit date: 6 October 2026 (Pacific/Auckland)

Scope: read-only repository inspection, read-only Supabase inspection of Air NZ Fitout project `air-nz-fitout` / project code `26028`, and one read-only OpenAI broad-context smoke test. No project records, production configuration, approvals, claims, POs, variations, migrations or domain actions were changed.

This document evaluates the governing principle:

> TradesStack owns secure access to project data. OpenAI owns reasoning over that data. TradesStack does not pre-program the user's questions.

The existing `docs/architecture/TRADESSTACK_AI_ASSISTANT_AUDIT.md` remains useful historical evidence about the bounded-tool V1 and its live defects. It is not treated as the target architecture here because it recommends adding more question-shaped read tools.

## A. Executive summary

The full project context architecture is viable for V1, with one important qualification: the context must be a compact, normalized, permission-filtered domain serialization, not a raw dump of every database row or workbook blob.

Evidence:

- The current runtime is already server-mediated and read-only, but it selects up to four bounded tools using regex/keyword routing and sends a 36,000-character slice of their results.
- Project 26028 contains enough structured commercial data to answer materially different questions without adding a new question-specific path: quotes, quote lines, variations, variation lines, POs, PO lines, claims, claim lines, commercial items, lineage and pricing workbooks.
- A raw candidate serialization of the measured tables was 392,994 bytes, approximately 98,249 tokens by the four-bytes-per-token estimate.
- A compact domain serialization was 194,127 bytes, approximately 48,532 tokens by that estimate. A more selective normalized proof payload was 54,898 bytes and 20,832 actual input tokens when sent to the configured OpenAI model.
- The configured `gpt-4.1` has a 1,047,576-token context window, so model context capacity is not the V1 blocker. The live organization returned a 30,000-token-per-minute error for the larger request; throughput, cost and serialization quality are the practical constraints.
- The normalized broad-context smoke test answered all ten requested representative questions in one request, including material/labour totals, Draft POs, committed cost, estimate-versus-bought comparison, commercial exposure, unusual data and recent changes. It did not need a question-specific selector.

Recommendation: build one permission-safe `ProjectAIContext` builder, initially from existing domain services and authoritative calculators, then pass that context to OpenAI. Keep the current Assistant behind a parity flag until the broad-context path proves correctness, security and latency.

**RECOMMEND FULL PROJECT CONTEXT ARCHITECTURE**

## B. Current architecture

```text
User opens Assistant
  ↓
AssistantShell selects an authorized project from the route/project list
  ↓
AiChatbotPanel POSTs projectSlug, message, route, module, mode and conversationId
  ↓
/api/assistant
  ├─ current organization member check
  ├─ resolveAssistantContext(projectSlug) using server-side project visibility
  ├─ route guard, rate/concurrency limits and quota reservation
  ├─ assistant_configuration: roles, modules, provider, model and limits
  ├─ selectAssistantTools(message, enabledModules)
  │    └─ regex/keyword selection in lib/assistant/tools.ts
  ├─ planAssistantQuestion(message, selectedTools, mode)
  │    └─ regex/keyword classification in lib/assistant/planner.ts
  ├─ runAssistantTool for each selected bounded read
  │    ├─ project/org visibility re-check
  │    ├─ selected module permission check
  │    └─ direct service/table reads and selected aggregations
  ├─ assistant_tool_calls and AI lifecycle telemetry
  ├─ JSON.stringify(tool results), then slice to MAX_CONTEXT_CHARS = 36,000
  ├─ prior conversation messages, max 12
  ├─ OpenAI Responses API or Anthropic Messages API
  └─ SSE answer, citations, quota commit and persisted assistant message
  ↓
AiChatbotPanel renders streamed answer, sources and links
```

Primary runtime files:

| Concern | Current file(s) | Finding |
|---|---|---|
| Shell/project selection | `components/app/AssistantShell.tsx` | Project-aware, but non-project routes can fall back to the first authorized project. |
| Chat UI/history | `components/app/AiChatbotPanel.tsx`, `app/api/chat/conversations/route.ts`, `app/api/chat/messages/route.ts` | Visible Assistant uses `/api/assistant` for turns but retains `/api/chat` compatibility history routes. |
| Assistant API | `app/api/assistant/route.ts` | Owns auth, quota, selection, reads, prompt assembly, provider streaming and persistence. |
| Context | `lib/assistant/context.ts`, `lib/assistant/types.ts` | Carries organization/project/route/module/recordId, but not structured page data. |
| Tool selection | `lib/assistant/tools.ts` | Registry has 14 read entries, plus detail variants; this is the main question-shaped boundary. |
| Planner | `lib/assistant/planner.ts` | Classifies answer type, required facts and depth with regexes. It does not retrieve data. |
| Briefing | `lib/assistant/briefing.ts` | Deterministically combines six current tools, but is itself a preselected path and not a full project context. |
| Provider | `lib/assistant/providers.ts` | Defaults to `gpt-4.1` or configured model; 35-second timeout; Responses API streaming for OpenAI. |
| Actions | `lib/assistant/actions.ts` | Regex-detects proposal-shaped requests; proposals are not executed. |
| Persistence/limits | `ai_chat_*` tables, quota RPCs, `assistant_configuration`, `assistant_tool_calls`, AI lifecycle tables | Useful controls to preserve during migration. |

Question-specific behavior exists in `selectAssistantTools`, `planAssistantQuestion`, `buildProjectBriefing`, role-mode prompt branches, cost/commitment instructions in the system prompt, and the separate action regexes. Some of this is safety or presentation logic; the data-selection portion is the scalability constraint.

## C. Current complexity: keep, remove, replace, optimize

| Current behavior | Decision | Reason |
|---|---|---|
| Authentication, member lookup and project visibility | KEEP | Security boundary, not reasoning. |
| Organization/project filters, RLS and module permissions | KEEP | OpenAI must never become the authorization layer. |
| Financial, retention, commitment and GST domain calculations | KEEP | Authoritative business rules belong in TradesStack. |
| Quota, abuse guard, provider timeout and usage telemetry | KEEP | Operational controls remain necessary. |
| Read-only action proposal and future confirmation boundary | KEEP | Writes remain separate from reasoning. |
| Citation envelope and deep links | KEEP, broaden | Every normalized record and derived fact should carry provenance. |
| `selectAssistantTools(message, enabledModules)` | REPLACE | Replace question-to-tool prediction with context assembly; retain a module registry only for authorization and serialization policy. |
| `planAssistantQuestion` | SIMPLIFY | Keep optional answer metadata for telemetry, not data retrieval or correctness. |
| `buildProjectBriefing` | REPLACE with context-derived briefing view | Deterministic risk signals may remain, but they should consume the same broad context and never be the only route. |
| Variation/PO/claim detail tools | TEMPORARY FALLBACK | Keep during parity testing, then simplify into domain readers or remove after evidence proves equivalence. |
| Regex role-mode prompt branches | RETAIN AS OPTIMIZATION | Role preference may reorder emphasis, but must not hide authorized project data or determine correctness. |
| Regex action detection | KEEP temporarily | It protects the read/write boundary; later replace with typed proposal interpretation, not with unrestricted model writes. |
| `/api/chat` duplicate turn route | SIMPLIFY | Define one turn contract; retain history endpoints only while clients migrate. |
| 36,000-character `boundedData` slice | REMOVE | Replace with explicit byte/token budgets and module-aware serialization that reports truncation. |

## D. Full TradesStack project data map

The product has broad structured data already. The table names below are verified in migrations and/or the live database; a module being present in the product does not mean it is currently exposed to the Assistant.

| Domain | Verified sources / services | Current Assistant exposure | Recommended context representation |
|---|---|---|---|
| Project | `organization_projects`, project/workspace visibility services | Basic project name/id/slug and dashboard metrics | Metadata, client, stage, dates, members/roles, project citation. |
| Contacts/companies | organization clients, suppliers, contacts, `project_members` | Organization-wide contacts tool, not project relationship scoped | Only project-linked client/supplier contacts, roles and contact citations. |
| Estimating | `opportunity_pricing_worksheets`, workbook/sheet structures, pricing services | Not exposed in normal Assistant reads | Active/accepted workbook revisions, package summaries, line items and clarifications/exclusions; omit formula internals unless needed. |
| Quotes | `project_quotes`, `project_quote_line_items`, opportunity quote series/revisions | Quote register only | Accepted/current basis, quote revision, scope, exclusions, clarifications, line values, provenance. |
| Takeoff | `project_drawing_sets`, `takeoff_pages`, calibrations, measurements, geometry tables, publication RPCs | Not exposed | Drawing/page/measurement metadata, normalized quantities and source links; not raw geometry unless the page question needs it. |
| Commercial layer | `commercial_items`, `commercial_lineage_edges`, source/version fields | Not exposed as a broad source | Canonical commercial items with cost/sell/category/source revision and lineage edges. |
| Variations | `project_variations`, `project_variation_line_items`, status events, attachments, invoice links | Register/detail tools, selected by question | Header, status, requester, approvals, line categories, totals, claim/PO/source lineage, exact variation links. |
| Purchase orders | `project_purchase_orders`, line items, assignments, status events, invoice links | Register/detail tools, selected by question | Header, supplier, status, commitment eligibility, category totals, lines, source relationships, exact PO links. |
| Supplier invoices/actuals | `supplier_invoices`, `supplier_invoice_lines`, allocation/match/approval tables, `project_actual_cost_events`, accounting services | Not exposed as a complete source | Invoice state, allocated actual, PO linkage, approval/provider state and authoritative cost facts; no credentials or raw tokens. |
| Claims/retention | `project_claims`, claim lines/revisions, retention services and accounting snapshots | Register/detail plus retention aggregate | Contract basis, current/previous/cumulative/paid/outstanding, retention and provider state, revision lineage. |
| QA current | `project_qas`, sections, fields, runs, responses, evidence, hold releases, signoffs | Only current QA definition headers | Definition/run/response/evidence/hold/signoff state with current-generation labels. |
| QA legacy | `project_quality_issues`, inspections, photos, work proofs, signoffs and activity | Not exposed | Include as a separate `legacyQuality` source; never merge empty current QA with “no defects”. |
| Tasks/coordination | `project_job_todos`, comments, attachments, activity | Not exposed | Assigned person, due date, status, comments, blockers, links and activity dates. |
| Files/drawings | `document_workspaces`, nodes/versions/activity, drawing sets/pages | Metadata-only documents tool; no content by default | File name/type/version/linkage and signed-link capability; no signed URL in model context unless explicitly needed. |
| Activity | domain status events, task/activity, document activity, approvals/uploads/assignments | Only project creation and drawing uploads | Normalized record-change events with entity citation and as-of time. |

The current/legacy distinctions are important: project quotes are not the same as estimates; POs are commitments, not actual costs; claims are not payments; current QA is not the legacy quality system; file metadata is not file content; commercial items preserve lineage but are not a replacement for every destination record.

## E. What the Assistant currently receives

The current request carries:

```json
{
  "projectSlug": "...",
  "message": "...",
  "route": "/app/...",
  "module": "project",
  "recordId": null,
  "mode": "auto",
  "conversationId": "..."
}
```

The server resolves `projectSlug` to a visible project and derives organization/project identity. The client-supplied route, module and record ID are context hints only; they are not authorization. In the visible project panel, `module` is currently set to `project` and no structured page payload is sent. `recordId` is available in the contract but is not meaningfully populated by the current panel.

The provider receives:

- a long system prompt with role-mode and module-specific instructions;
- the selected tool results, serialized as JSON;
- a 36,000-character substring of that JSON;
- up to 12 prior user/assistant messages; and
- a separately rendered source list.

Therefore the current model does not receive the full project, the current page's structured data, or a stable normalized dataset. It receives a question-dependent evidence slice.

## F. Proposed `ProjectAIContext`

The context should be a read-only serialization boundary, not a second database and not an arbitrary query language.

```ts
type ProjectAIContext = {
  schemaVersion: "project-ai-context.v1";
  generatedAt: string;
  asOf: string;
  project: ProjectSummary;
  currentPage: {
    route: string | null;
    module: string | null;
    record?: EntityRef | null;
    data?: unknown;
  };
  contacts: { records: ContactSummary[]; state: ReadState };
  estimate: { workbooks: EstimateSummary[]; packages: EstimatePackage[]; state: ReadState };
  takeoff: { drawingSets: DrawingSetSummary[]; measurements: MeasurementSummary[]; state: ReadState };
  quotes: { records: QuoteSummary[]; lines: QuoteLine[]; state: ReadState };
  variations: { records: VariationSummary[]; lines: VariationLine[]; state: ReadState };
  purchaseOrders: { records: PurchaseOrderSummary[]; lines: PurchaseOrderLine[]; state: ReadState };
  supplierInvoices: { records: SupplierInvoiceSummary[]; allocations: InvoiceAllocation[]; state: ReadState };
  claims: { records: ClaimSummary[]; lines: ClaimLine[]; state: ReadState };
  qa: { current: QAContext; legacy: LegacyQualityContext; state: ReadState };
  tasks: { records: TaskSummary[]; comments: TaskComment[]; state: ReadState };
  files: { records: FileMetadata[]; state: ReadState };
  activity: { events: ActivityEvent[]; state: ReadState };
  financialSummary: {
    authoritative: AuthoritativeMetric[];
    contractValue: MoneyMetric | null;
    currentBudget: MoneyMetric | null;
    approvedVariations: MoneyMetric | null;
    committedCost: MoneyMetric | null;
    actualCost: MoneyMetric | null;
    claimed: MoneyMetric | null;
    paid: MoneyMetric | null;
    retention: MoneyMetric | null;
    profitability: { status: "available" | "not_determinable"; value?: MoneyMetric; reason?: string };
  };
  diagnostics: { omittedFields: string[]; truncatedModules: string[]; unavailableModules: string[] };
};

type EntityRef = {
  entity: string;
  id: string;
  label: string;
  href: string;
  projectId: string;
};

type ReadState = {
  status: "ok" | "empty" | "denied" | "failed" | "unavailable" | "truncated";
  sourceService: string;
  reason?: string;
  returnedRows?: number;
  totalRows?: number | null;
  asOf?: string;
};
```

Each record should be JSON-safe and small. It should carry an `EntityRef`, structured categories, source/version lineage and stored totals. The builder should include raw structured values plus authoritative derived values, but should not include secrets, auth tokens, provider metadata, arbitrary internal diagnostics, storage paths or raw worksheet blobs unless a separately authorized document-content boundary exists.

## G. Context-size measurement: project 26028

The live read-only measurement used these project-scoped tables: `organization_projects`, `project_quotes`, `project_quote_line_items`, `project_variations`, `project_variation_line_items`, `project_purchase_orders`, `project_purchase_order_line_items`, `project_claims`, `project_claim_line_items`, `commercial_items`, `commercial_lineage_edges`, and `opportunity_pricing_worksheets`.

| Module | Rows | Raw JSON bytes | Compact bytes |
|---|---:|---:|---:|
| Project | 1 | 498 | 293 |
| Quotes | 2 | 4,047 | 3,637 |
| Quote lines | 14 | 8,321 | 6,179 |
| Variations | 4 | 4,611 | 3,793 |
| Variation lines | 6 | 3,912 | 3,000 |
| Purchase orders | 9 | 10,219 | 8,375 |
| Purchase-order lines | 14 | 8,440 | 6,298 |
| Claims | 4 | 4,797 | 3,977 |
| Claim lines | 40 | 38,292 | 32,184 |
| Commercial items | 21 | 121,208 | 114,553 |
| Commercial lineage | 14 | 11,613 | 9,415 |
| Pricing workbooks | 3 | 176,864 | 2,251 |
| **Total candidate payload** | **132** | **392,994** | **194,127** |

The raw estimate is approximately 98,249 tokens using a conservative four-bytes-per-token approximation. The compact measurement is approximately 48,532 tokens by the same approximation. The largest compact sources are commercial items and claim lines. Pricing workbooks contain large JSON blobs; the compact candidate deliberately keeps workbook summary/version/package fields rather than sending the raw workbook blob.

The actual smoke-test serialization projected only the fields needed for broad reasoning, retained citation and lineage identifiers, omitted organization/audit boilerplate, and omitted raw workbook blobs. It was 54,898 bytes and produced 20,832 input tokens at the OpenAI API.

Conclusion:

- The complete structured dataset for this project fits well within `gpt-4.1`'s documented 1,047,576-token context window. [Official OpenAI GPT-4.1 model documentation](https://developers.openai.com/api/docs/models/gpt-4.1) documents the 1,047,576-token context window and Responses API support.
- The first raw broad request was rejected with HTTP 429 because the organization TPM limit was 30,000 and the request was estimated at 67,759 tokens. This is a throughput/rate-limit issue, not a model context issue.
- The normalized 20,832-input-token request succeeded. V1 should therefore use normalized context and check provider TPM/cost budgets. Progressive loading is not required for normal 26028-sized projects, but should remain a later optimization for larger projects or large conversation histories.

## H. Current page context and page-first priority

Recommended request shape:

```json
{
  "project": { "id": "verified-server-value", "slug": "verified-server-value" },
  "route": "/app/projects/air-nz-fitout/preconstruction/variations/…",
  "module": "variations",
  "recordType": "variation",
  "recordId": "verified-or-null",
  "pageContext": {
    "source": "same-server-loader-or-safe-client-projection",
    "data": "structured page data, never authorization evidence"
  }
}
```

The server should resolve the project and record again, confirm organization membership and module permission, and rebuild or validate page context from the canonical service. A client-provided page payload can improve latency but cannot grant access.

Default priority should be:

```text
current-page structured data
  +
full authorized project context
  +
conversation history without repeated project dumps
```

If the user is looking at VAR-03, the Assistant should receive its lines and totals before the question is interpreted. That makes “how much is materials?” a normal reasoning operation. “How does this compare with what we allowed?” can then use the estimate/quote/commercial-item context already present.

## I. Security and customer isolation

The broad context is safe only if the builder is a server-side capability boundary.

Required controls:

- Resolve authenticated user and organization member on the server.
- Resolve project by a server-side visible-project service; never trust a client project ID or slug for authorization.
- Re-check organization and project identity in the builder and in sensitive module readers.
- Apply module permissions before serialization: financial/accounting, QA, Files, contacts, and any future sensitive module.
- Prefer existing domain services and RLS-backed Supabase clients. Do not use the service-role key in the request path; use it only in controlled operational measurement or server jobs where already authorized.
- Never send OpenAI service secrets, Supabase keys, auth tokens, Xero refresh/access tokens, storage signing secrets, infrastructure metadata or unrestricted SQL capabilities.
- Redact or omit irrelevant internal IDs while retaining stable entity IDs required for server-side citations; do not send opaque IDs that reveal unrelated entities.
- Keep customer implementation/database boundaries intact. A context must contain one organization and one explicitly authorized project; no organization-wide contacts by default and no cross-project aggregation unless a future feature explicitly authorizes it.
- Keep `failed`, `denied`, `unavailable`, `empty` and `truncated` distinct. “No records” is only valid for `empty`.
- Treat all record text, file names and supplied document text as untrusted data, not instructions.
- Keep file contents separate. V1 may send file metadata and drawing linkage, but must not claim to have read a PDF/drawing unless authorized content is actually supplied.

Current positive evidence includes server-side project visibility checks in `lib/assistant/context.ts` and `lib/assistant/tools.ts`, financial/QA/Files gates, forced RLS for Assistant foundation tables, quota reservations and server-only provider keys. Current gaps include the organization-wide contacts read, ambiguous first-project fallback on non-project routes, and the lack of a single serialized permission audit for every context module.

## J. Authoritative calculations

These remain TradesStack-owned:

- accepted quote/current contract basis and revision selection;
- approved variation totals and status semantics;
- committed cost definition and Draft-versus-commitment eligibility;
- actual cost and supplier-invoice allocation;
- claim current/previous/cumulative/paid/outstanding values;
- retention calculations and accounting/provider state;
- GST/tax-basis calculations where canonical;
- cost-code and section classification;
- immutable accounting, quote, claim, variation and revision evidence;
- organization membership, project/module permissions, RLS and storage privacy;
- action validation, state transitions, idempotency and writes.

The context should include both raw structured lines and authoritative metrics. OpenAI should not recompute a canonical financial total from ambiguous rows when TradesStack already provides it.

## K. OpenAI reasoning responsibilities

OpenAI should receive the question, conversation, page context and broad structured evidence, then decide:

- which records matter to the question;
- how to connect quote, variation, PO, claim, cost and lineage records conceptually;
- what is unusual or commercially exposed;
- what deserves attention and why;
- how to explain comparisons and uncertainty in construction language;
- which supplied citations support the answer.

The model should not decide whether a user may see a record, invent a total, classify a line from its description when a stored section exists, claim to have read an absent file, or execute a mutation.

## L. Broad-context smoke test

The normalized 26028 context was sent once to the configured OpenAI Responses API model (`gpt-4.1`, resolved snapshot `gpt-4.1-2025-04-14`) with all ten questions in one request. Actual usage was 20,832 input tokens and 1,227 output tokens.

Observed capabilities:

| Question | Result from broad context | Limitation |
|---|---|---|
| How are we looking? | Identified Pricing stage, approved/draft variations, submitted claims and all Draft POs. | Authoritative financial summary was not included in this isolated table-based proof, so cost/profit remained limited. |
| What should I chase? | Prioritized moving Draft POs forward and variation approvals. | No task/communication data was present in the proof context. |
| Total material value in variations? | Summed material-tagged variation lines to `$21,862.38`. | This is a raw-line reasoning result; production should include authoritative category totals and an explicit status basis. |
| Labour value? | Identified `$1,500` variation labour and `$4,500` PO labour, and warned of possible overlap. | Production should label whether the question means variations, POs, estimate, actuals or all sources. |
| What POs are Draft? | Listed all nine Draft POs by number. | Exact deep-link citations were not rendered in this isolated CLI proof. |
| What have we got committed? | Correctly reasoned that Draft POs are not committed. | Production should include the authoritative committed metric directly. |
| Allowance versus bought? | Connected quote lines, variation lines and PO lines and identified quantity/value differences. | Matching remains an evidence-quality problem when units/descriptions are not lineaged. |
| Where commercially exposed? | Identified all-Draft procurement and high-value uncommitted lines. | Needs cost/claim/contract metrics and deterministic thresholds for a production risk view. |
| What looks unusual? | Flagged PO-02 / `Board Supply Cost` at approximately `$7.6m` as an outlier. | The model correctly called it an outlier, not proof of an error; production should surface the underlying citation and confidence. |
| What changed recently? | Used available approval/claim dates to identify recent events. | Activity tables and status-event readers are required for complete change history. |

This is the key result: the model selected relevant evidence across quotes, variations, POs, claims, commercial items and pricing without a predefined path for each question. The limitations are missing data in the proof context, not a need for more question regexes.

## M. Performance, caching and conversation

V1 performance plan:

1. Build the context from existing services in parallel after one authorization decision.
2. Batch child records by parent IDs; avoid per-record service calls and N+1 queries.
3. Serialize summaries, lines and lineage once; omit duplicated header/organization/audit fields.
4. Include `asOf`, row counts, truncation and module state in the envelope.
5. Keep the first version per-request and fresh. Add short-lived per-project caching only after measuring repeated context-build cost and defining invalidation/freshness rules.
6. Keep conversation history separate from project data. Send a bounded recent conversational window or a compact conversation summary, not repeated historical project JSON.
7. Keep a provider budget below the organization TPM limit. A 20k-input compact context succeeded; a 67k-estimated raw request did not.

Progressive loading is a conditional optimization, not the default architecture. If a larger project exceeds the configured input/token budget, send project summaries/indexes plus current-page data first, then allow a generic context expansion request for datasets by entity/module. The expansion mechanism should be typed and permission-checked, but must not contain a hand-written mapping for every natural-language question.

## N. Actions remain separate

This audit is about read/reasoning architecture. Current proposal-only behavior can remain. The future write sequence is:

```text
OpenAI interpretation
  → normalized proposal
  → TradesStack permission/state check
  → affected-record preview and financial impact
  → explicit confirmation
  → existing domain service/RPC with idempotency
  → audit event and deep-link result
```

OpenAI must not receive direct unrestricted write access or service-role credentials.

## O. Current code changes by migration role

### Remain

- `components/app/AssistantShell.tsx` and `components/app/AiChatbotPanel.tsx` as the UI shell, with explicit page context added.
- `app/api/assistant/route.ts` as the authenticated orchestration boundary, initially behind a feature flag.
- `lib/assistant/context.ts` and `lib/assistant/types.ts` as the server context contract, expanded to `ProjectAIContext`.
- `lib/assistant/providers.ts` as the provider adapter, subject to input-budget and telemetry improvements.
- quota/abuse guards, AI lifecycle logging, conversation persistence, citations and action proposal safety.
- deterministic domain services such as financial summary, cost report, procurement normalization, retention and QA services.

### Simplify

- `lib/assistant/planner.ts`: retain answer classification only for observability and optional response emphasis.
- `lib/assistant/briefing.ts`: consume the broad context rather than invoking a fixed six-tool set.
- `lib/assistant/tools.ts`: become a permission-aware module reader/serializer registry rather than a question selector.
- `/api/chat` and its compatibility routes: converge on one Assistant conversation/turn contract.

### Replace or add

- Add `lib/assistant/project-context.ts` (or equivalent) for `buildProjectAIContext(user, project, pageContext)`.
- Add typed domain adapters for quote/estimate, commercial items, variations, POs, invoices/actuals, claims/retention, QA current/legacy, tasks/activity, contacts and Files metadata.
- Add a serialization/redaction layer with entity refs, authoritative metrics, module state and token/byte measurement.
- Add a citation renderer that links exact record IDs, not only the project dashboard.
- Add project/page browser tests and a 26028-shaped fixture/evaluation corpus.

### Temporary fallback

- Existing bounded tools and `project_briefing` remain available during parity testing.
- No deletion is recommended until the new context path passes record-level correctness, permissions, failure-state and citation tests.

No database migration is required for the first context builder if existing services and tables are sufficient. A migration should be proposed only for measured performance/read-model needs, not to create a second source of truth.

## P. Ordered migration plan

### Phase 1 — Context contract and authorization

Define `ProjectAIContext`, `ReadState`, `EntityRef`, redaction rules, source authority and page-context validation. Reuse current project/member/module checks. Add tests for cross-org, cross-project, denied, failed, empty and truncated states.

### Phase 2 — Broad context builder

Implement the builder from existing domain services. Start with project, financial summary, quotes, variations, POs, claims, retention, commercial items, tasks/activity, QA current/legacy and Files metadata. Add estimate/takeoff/invoices as their canonical readers are identified. Run readers in parallel and include explicit module states.

### Phase 3 — Shadow provider path

Keep current V1 production behavior. Build the broad context for the same request, measure bytes, actual tokens, query count, duration and omitted modules, but do not change the user-facing answer. Compare facts and citations against current UI/service ground truth.

### Phase 4 — Broad-context answer path

Send the normalized context plus question and conversation to OpenAI. Remove data-selection dependence on `selectAssistantTools` and `planAssistantQuestion`; retain them only as fallback/telemetry. Use deterministic authoritative metrics for commercial values and let the model explain relationships and priorities.

### Phase 5 — Page-first context

Add structured current-page context to the shell/request for variation, PO, claim, QA, quote, estimate, takeoff and task pages. The server verifies record ownership and permissions and rebuilds sensitive page data.

### Phase 6 — Parity and cutover

Run the ten-question corpus across 26028-shaped fixtures and representative role permissions. Require exact totals, correct Draft/committed semantics, no unsupported profitability claims, no false “empty” claims, and record-level citations. Cut over by organization/configuration, with the bounded path as a temporary fallback.

### Phase 7 — Remove unnecessary routing

After parity, remove regex-based data selection, narrow deep-read duplication and the fixed briefing retrieval path. Keep safety checks, role preference, provider controls, quota, citations and action proposal boundaries.

### Phase 8 — Large-project optimization only if measured

If real projects exceed the agreed input/latency budget, add module indexes and generic context expansion. Do not add question-specific tools or arbitrary SQL generation.

## Q. Risks and controls

- Incorrect authority or duplicated business logic: use existing domain services and authoritative metrics; make source authority explicit in the context.
- Sensitive module overexposure: authorize each module before serialization and test permission combinations.
- Cross-tenant or cross-project leakage: server-resolve project/org and add adversarial tests with forged slugs, record IDs and conversation IDs.
- Large payload cost/TPM pressure: normalize, omit blobs/duplicates, measure actual provider tokens and enforce per-request budgets.
- Stale data: include `asOf`, revision/version and freshness state; do not imply real-time certainty.
- Model arithmetic or classification errors: send stored totals and structured sections; require citations; use deterministic calculations for canonical numbers.
- Missing legacy/current data: preserve separate module generations and explicit unavailable states.
- Prompt injection through record/file text: treat retrieved text as untrusted source material and keep action authorization outside the model.
- Citation mismatch: generate links from server-known entity refs, not model-invented hrefs.
- Conversation duplication: do not repeat full project context inside stored messages or historical turns.
- Customer source divergence: implement the reusable builder in TradesStack Main and use configuration/permissions for customer differences.

## R. Checks performed and limitations

Performed:

- Read `AGENTS.md`, `TRADESSTACK_BUSINESS_MODEL.md` and `TRADESSTACK_AI_CONTEXT.md`.
- Inspected Assistant UI, route, context, types, planner, tools, briefing, actions, providers, history routes, migrations and tests.
- Read-only queried the configured Supabase project for Air NZ Fitout / project code 26028.
- Measured raw and compact context sizes by module.
- Sent one normalized broad-context read-only smoke test to the configured OpenAI Responses API model.

Not performed:

- No production code or database changes.
- No browser/live UI interaction in this run beyond repository and database evidence.
- No full file/PDF/drawing content was sent to OpenAI.
- The smoke test used a deliberately normalized table projection, not the final production `ProjectAIContext` builder, and did not include all authoritative financial-service outputs, current-page data, tasks, QA, invoices or file metadata where the live project had no matching rows or direct project filter.
- No cross-tenant adversarial E2E run, full release lint/typecheck/build, or production deployment validation was performed in this audit.

The successful smoke test proves feasibility of broad structured reasoning, not production readiness. The migration should begin with the permission-safe context contract and shadow validation.
