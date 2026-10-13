# TradesStack AI Assistant — Audit and V2 Implementation Plan

Audit date: 6 October 2026 (Pacific/Auckland)

Scope: read-only repository inspection plus live Computer Use against the local TradesStack application and Air NZ Fitout project `air-nz-fitout` / project 26028. No project records, production configuration, approvals, claims, POs, variations or migrations were changed by this audit.

## A. Executive summary

The Assistant is a useful read-only prototype, not yet a dependable daily construction project colleague.

What works:

- The visible orange robot opens the real project-aware Assistant drawer.
- The drawer posts to `/api/assistant`, streams a response, persists conversations/messages, applies route throttling and quota reservation, and emits source links.
- Project context is resolved server-side from the project slug and re-checked before each tool call.
- Financial summary data is produced by the existing deterministic financial service and was accurate for the tested project.
- Current V1 is read-only; no AI-only mutation path exists.

What prevents daily use:

- The tool surface is only ten bounded read selectors and does not represent the whole project operating model.
- Tool failures are swallowed and logged as denied, so the model receives no distinction between “no records” and “query failed”.
- The live Assistant could not answer a PO-status question even though the project UI showed nine Draft POs totaling `$7,656,186.78`.
- The variation tool uses `title`, while the canonical table/UI field is `variation_title`; this causes a real variation query to fail.
- The model gave an unsafe profitability conclusion by comparing revenue to current budget, despite committed and actual costs being zero. Revenue minus budget is not project profit.
- Citations are project-level in the tested responses; individual records were not linked for the failing PO/variation answers, and the supplied citation label is rendered as plain source text plus a project dashboard link.
- Existing `/api/chat` and `/api/assistant` architecture overlaps, while `/api/chat` still owns the visible panel’s history/conversation endpoints.
- There is no action/confirmation workflow, no deterministic cross-module briefing service, no proactive signal model, and no complete audit trail for failed tool diagnostics.

Overall assessment: 3/10 for daily construction use today. The foundation is worth extending, but the next step should be a permission-aware domain read layer and deterministic briefing calculations, not a larger prompt.

## B. Current architecture and runtime map

```text
User
  ↓ clicks orange robot / project Assistant
AssistantShellProvider
  ↓ selects project from current pathname and authorized project list
AiChatbotPanel
  ↓ POST /api/assistant { projectSlug, message, route, module, conversationId }
POST /api/assistant
  ↓ getCurrentOrganizationMember
  ↓ resolveAssistantContext → getTradePackWorkspaceBySlugForCurrentUser
  ↓ enforceRouteGuard
  ↓ assistant_configuration + quota reservation RPC
  ↓ selectAssistantTools(message, enabledModules)
  ↓ runAssistantTool (re-check project + org + module permission)
  ↓ existing services / Supabase reads
  ↓ ai_chat_messages + assistant_tool_calls + AI lifecycle interaction
  ↓ OpenAI Responses stream or Anthropic Messages stream
  ↓ SSE delta/citations/done events
AiChatbotPanel
  ↓ renders answer, Sources, and links
```

Primary files:

- UI shell: `components/app/AssistantShell.tsx`.
- Chat UI/history/stream parser: `components/app/AiChatbotPanel.tsx`.
- Project redirect: `app/app/(workspace)/projects/[projectId]/ai-chatbot/page.tsx`.
- Current Assistant route: `app/api/assistant/route.ts`.
- Context: `lib/assistant/context.ts` and `lib/assistant/types.ts`.
- Tool selection/data access: `lib/assistant/tools.ts`.
- Provider adapters: `lib/assistant/providers.ts`.
- History/conversation compatibility routes: `app/api/chat/conversations/route.ts` and `app/api/chat/messages/route.ts`.
- Legacy/general construction route still present: `app/api/chat/route.ts`.
- Assistant foundation migration: `supabase/migrations/20261004123000_add_assistant_v1_foundation.sql`.

Important runtime observations:

- `AssistantShell` chooses the project from the URL pathname, falling back to the first authorized project. On a non-project route, this is potentially ambiguous and should be explicit in the UX.
- `resolveAssistantContext` uses a server-side visible-project lookup; client-supplied project IDs are not trusted.
- `/api/assistant` caps message length at 4,000 chars, history at 12 messages, tool calls at 4 per turn, and provider time at 35 seconds.
- Tools are selected by regex intent matching, not model tool calling or a typed intent plan.
- Tools run sequentially, even when independent; the route stores `status: denied` for every caught error without recording the error class/message.
- Customer configuration exists for provider, model, enabled modules, roles, financial/document flags, monthly limit and tool-call cap.
- `assistant_configuration` and `assistant_tool_calls` have forced RLS and organization membership policies. Conversation/message RLS remains user/project based in the earlier chat migrations.

## C. Current tool inventory

| Tool | Read/write | Current source | Scope/permission | Output/citation | Audit finding |
|---|---|---|---|---|---|
| `project_overview` | Read | `getProjectDashboardMetricsForCurrentUser`; `getProjectFinancialSummary` | Project re-check; financial fields gated by `accounting.sales_invoices.view` | Dashboard citation only | Strongest current tool; deterministic summary is useful but not enough for a PM briefing. |
| `project_activity` | Read | `organization_projects`, `project_drawing_sets` direct reads | Project/org filters; no separate module permission | Project/drawing links | Activity is only project-created and drawing-upload events, not tasks, variations, POs, claims, QA or comments. |
| `quotes` | Read | `project_quotes` direct read | Project/org filters; no explicit read key | Quote register link | Does not expose line items, accepted basis, estimate/workbook lineage, source revisions or contract semantics. |
| `purchase_orders` | Read | `project_purchase_orders` direct read | Project/org filters; no explicit read key | PO links intended | Live test returned no data to the model although the UI showed nine Draft POs; error detail is discarded. |
| `variations` | Read | `project_variations` direct read | Project/org filters; no explicit read key | Variation links intended | Query requests `title`; canonical field is `variation_title`. Live VO question therefore reported no data. |
| `payment_claims` | Read | `project_claims` direct read | `accounting.sales_invoices.view` | Claim register links | Does not expose claim lines, revision status, paid/provider status or claim-vs-contract deterministic analysis. |
| `retentions` | Read | `getProjectRetentionPosition` | `accounting.sales_invoices.view` | Retention route link | Good reuse of a domain service; only one aggregate citation. |
| `contacts` | Read | `organization_clients`, active `organization_suppliers` | Org/project context is not actually project relationship scope | Company-directory links | Returns organization-wide client/supplier records, not key contacts/roles on the project. |
| `qa` | Read | `project_qas` direct read | `qa.view` | QA register links | New QA only; no legacy `project_quality_*` issues/inspections/photos/work proof and no run/response/hold-point state. |
| `documents` | Read metadata only | shared Files workspace | `files.view`; document content disabled by default | File links | Explicitly avoids sending file contents or signed URLs; drawings/evidence registries are omitted. |

There are no Assistant write tools, typed tool schemas, model-selected tool calls, action proposals, confirmations, or domain mutation adapters today.

## D. Project 26028 live test results

Ground truth was independently read from the visible project modules using Computer Use. The live app exposed the following relevant facts:

- Financials: current budget `$30,543.13` excl. GST; original budget `$5,314.15`; approved variations `$25,228.98`; committed `$0.00`; spent `$0.00`; revenue/claims `$29,266.30`.
- Variations: `VAR-02` Draft at `$0.00`; `VAR-03`, `VAR-04`, and `VAR-05` Approved; total `$25,228.98` excl. GST.
- Purchase orders: nine visible POs, all Draft; register total `$7,656,186.78` excl. GST. These Draft records are not counted as committed by the financial report, which correctly defines commitment as approved/issued/received/invoiced PO lines.
- Payment claims: four submitted claims totaling `$29,266.30`; paid `$0`; outstanding `$29,266`; retention current `$2,926.63`, with `$1,961.50` pushed to Xero and `$965.13` new since last push.
- QA: current Project QA tab showed “No Project QA yet”; the separate Existing QA Activity path is a distinct legacy/current surface and was not represented by the Assistant tool.
- Dashboard: the live project page showed a high-priority “Cashflow pressure: $29,266 remains unpaid” item due today, plus four submitted claims in the upcoming activity list.

| Question | Assistant result | Expected / ground truth | Classification |
|---|---|---|---|
| “Give me a commercial summary of this job.” | Returned original budget `$5,314.15`, approved variations `$25,228.98`, current budget `$30,543.13`, revenue `$29,266.30`, retention `$2,926.63`, committed `$0`, actual `$0`. | Matches Financials screen and deterministic financial summary. | PASS for figures; PARTIAL for usefulness because it omits claims status, PO drafts and package detail. |
| “What have we got committed, and are we making money?” | Correctly returned committed `$0`, but concluded revenue below budget “suggests the project is not currently making money.” | Committed and actual cost are both `$0`; profitability cannot be concluded from revenue vs budget. | REASONING ISSUE / BAD UX. Must say margin/profit is not determinable from current evidence. |
| “What VO’s haven’t been signed off?” | Said no variation records or approval status were available. | Four variations are visible; three approved and `26028-VAR-02` is Draft. | TOOL ISSUE / MISSING CAPABILITY. The tool’s `title` field does not match canonical `variation_title`, and the error is hidden. |
| “What POs have not been approved?” | Said no PO information was available. | Nine POs are visible and all are Draft; register total `$7,656,186.78`. | TOOL ISSUE. The route swallows the failing tool result and the model cannot distinguish failure from empty data. |
| “What is the current contract value?” | Not separately tested as a clean new conversation; overview supplies current budget/revenue but prompt does not define contract-value authority. | Must distinguish accepted quote, current budget, approved variation value, and claimed revenue. | MISSING CAPABILITY / SOURCE-OF-TRUTH AMBIGUITY. |
| “Any QA stuff holding us up?” | Not separately tested in the final run. | Current Project QA has no records; existing QA activity is a separate legacy surface. | MISSING CAPABILITY risk: tool only reads `project_qas`. |
| “What needs my attention today?” | Said there were no tasks, issues, deadlines or actionable alerts. | Dashboard visibly showed a high-priority cashflow item: `$29,266` unpaid, due today. | MISSING CAPABILITY / CONTEXT ISSUE. `project_overview` does not include dashboard priorities or claims activity. |

The first live response arrived after roughly 19 seconds; subsequent responses took approximately 26–37 seconds end-to-end including tool reads and model streaming. This is acceptable for an early prototype but too slow for repeated Monday-morning operational use, especially when several independent reads are required.

## E. Construction-role assessment

| Role | Score | Why |
|---|---:|---|
| Project Manager | 3/10 | Can obtain a basic financial snapshot; cannot reliably synthesize tasks, activity, procurement, variations, QA, risks or next actions. |
| Quantity Surveyor | 3/10 | Contract/variation/claim aggregates exist, but no line-level commercial reasoning, cost-code drilldown, forecast or reliable profitability conclusion. |
| Estimator | 1/10 | No estimate workbook, takeoff, commercial-item, scope, exclusions, clarifications or package-risk tools. |
| Project Coordinator | 1/10 | No task/todo, assignment, due-date, comments, communication or “waiting on” tool. |
| Procurement Assistant | 2/10 | A PO selector exists in theory, but live PO retrieval failed and supplier/package readiness is absent. |
| Commercial Manager | 3/10 | Financial summary and retention are reusable; claims, variations, PO commitments, actuals and source lineage are not synthesized safely. |
| Project Accountant | 2/10 | Claims/retention aggregates are available, but Xero/provider observations, supplier invoices, payment status and accounting revisions are not. |
| QA Assistant | 1/10 | Only project QA definition headers are read; no QA runs, evidence, hold points, signoffs, legacy defects or overdue logic. |

## F. Critical problems

### P0 — correctness and trust

1. Fix tool/schema mismatches and stop treating tool exceptions as empty results. `variation_title` is a confirmed mismatch. Every tool result must be `ok`, `empty`, `denied`, or `failed` with a safe diagnostic reference.
2. Remove unsupported profitability conclusions. Profit/margin/forecast must come from deterministic services and must return “not determinable” where cost authority is incomplete.
3. Create a canonical, permission-aware read contract for POs, variations, claims and QA instead of ad hoc direct selects.
4. Add tests that execute the real selectors against a fixture containing project 26028-like Draft POs and Draft/Approved variations.

### P1 — daily usefulness

1. Add deterministic project briefing/read-model services covering contract basis, approved variations, PO status/commitment, claims, retention, actual costs, tasks, QA and recent activity.
2. Add line-level and package-level results with exact record citations and deep links.
3. Include both current QA engine and legacy quality/defect records with explicit source labels.
4. Resolve the `/api/chat` compatibility overlap and define one Assistant conversation contract.

### P2 — capability expansion

1. Add estimate/workbook/takeoff/commercial-item lineage reads.
2. Add supplier invoices, actual costs, Xero observations, tasks, contacts assigned to project, files/drawings and activity feeds.
3. Replace regex-only selector routing with typed intent classification plus a bounded, auditable execution plan.

### P3 — experience and proactive operation

1. Add role-aware briefing modes (PM, QS, estimator, accounts, QA).
2. Add proactive signals and digest delivery only after read-model accuracy is proven.
3. Add action proposals, confirmations, normal domain mutations and result audit links.

## G. Security findings

Positive evidence:

- Authentication is checked before project resolution.
- Project visibility is resolved server-side and re-checked inside every tool.
- Organization IDs are compared before proceeding.
- Financial, document, QA and retention modules have server-side permission gates.
- Configuration and tool-call tables use forced RLS; service/provider secrets are server-side.
- Prompt text explicitly treats retrieved records as untrusted source material and blocks V1 mutation claims.
- Route guard, quota reservation, provider timeout, message limits and conversation ownership checks exist.

Risks/gaps:

- Several commercial read tools have no explicit read permission key and rely on project visibility/RLS. This may be correct for current permission design, but it should be documented and tested against the live permission catalog.
- `contacts` is organization-wide and not project-scoped; the answer could expose unrelated company directory information to a project conversation.
- On non-project routes, `AssistantShell` falls back to the first authorized project; this is a context ambiguity, not a database isolation bypass, but the UI should require project selection.
- Tool error details are discarded; audit records say `denied` even for schema/query failures, reducing security observability and incident diagnosis.
- There is no adversarial E2E coverage for malicious project text/documents, forged conversation IDs, cross-project citations or “show every project” prompts.
- Document content is correctly disabled by default, but if enabled later it needs a strict content boundary and prompt-injection tests.

No cross-organization leakage was observed in the static security tests or live read-only testing. The live adversarial prompt was not run because the visible tool failures already established a safer high-value path for this audit; it remains a required acceptance test before rollout.

## H. Performance findings

- Current tool execution is sequential in `app/api/assistant/route.ts`; independent reads should be parallelized after authorization.
- The first commercial-summary response took approximately 19 seconds; the PO question took approximately 27 seconds to reach a final answer. Provider latency dominates, but avoidable sequential tool calls and large serialized context add cost.
- The route serializes all selected tool results into one bounded JSON payload of up to 36,000 characters. This is safer than unlimited context, but it is not a structured evidence contract and may truncate important rows.
- The provider receives up to 12 prior messages plus the retrieved data; no conversation summarization or evidence deduplication exists.
- `MAX_ROWS = 20` is a hard limit and can omit records without telling the model that the result is truncated.
- The project financial service already reports query count/performance metadata; the Assistant does not expose or aggregate that data into tool telemetry.

## I. UX findings

Positive:

- The orange robot is discoverable and consistently opens a project-aware drawer.
- Streaming, loading/thinking state, New Chat, history and source links are present.
- The project name is shown in the Assistant header.

Problems:

- A “Source: Air NZ Fitout” project link is not enough for a claim about a specific PO, VO, claim or QA item.
- The UI renders markdown-like `**` literally in at least one answer; formatting is not a reliable construction report surface.
- There are no suggested construction prompts such as “What’s outstanding?”, “QS view” or “What should I chase first?”.
- No explicit “data unavailable because this module failed” state is shown.
- No display of which modules were checked, what period was used, or whether results are truncated.
- Financial responses do not visually separate contract value, revenue claimed, commitment, actual cost, retention and margin.
- There is no role/profile mode and no concise briefing card for mobile/site use.

## J. Target V2 architecture

```text
Assistant UI
  ↓ explicit project context + role/mode + conversation
Assistant API/orchestrator
  ↓ auth, membership, project boundary, rate/quota, request ID
Intent planner (typed, bounded, no direct SQL)
  ↓ required evidence plan
TradesStack AI read registry
  ↓ each tool declares scope, permission, source authority, truncation, citations
Permission-aware domain read services / existing report services
  ↓ parallel evidence retrieval
Deterministic calculators and cross-module read models
  ↓ contract, variation, commitment, cost, claim, retention, QA and task facts
Structured evidence envelope
  ↓ facts, unavailable/failed modules, source refs, as-of time, confidence
Provider synthesis
  ↓ construction-language response only; no invented totals
Response renderer
  ↓ briefing cards, tables, exact deep links, limitations
Optional action planner
  ↓ proposed action → permission check → confirmation → existing domain action/RPC → audit result
```

Design decisions:

- Keep relational TradesStack records authoritative; the model explains evidence.
- Reuse `getProjectFinancialSummary`, `getProjectCostReport`, retention services, procurement services, QA servers, document workspace services, task services and existing RPCs.
- Prefer read-model/service adapters over direct table names in the Assistant route.
- Preserve opportunity/project quote distinctions, commercial lineage, immutable claim/accounting evidence, current/legacy QA distinctions and private Files semantics.
- Treat empty, denied, failed, truncated and not-applicable as distinct states.
- Make every returned fact carry a source authority and exact deep link where one exists.

## K. Tool expansion plan

Read tools should be added in this order:

1. `project_briefing`: deterministic PM/QS summary from existing project dashboard, financial, task, QA, variation, PO, claim and activity services.
2. `project_contract_position`: accepted quote/current project quote, approved variations, claim totals and retention; clearly labels contract value vs current budget vs revenue claimed.
3. `project_variations_register`: variation number/title/status/value/requester/due/approved date/claim linkage; use canonical fields and existing variation route links.
4. `project_purchase_orders_register`: PO number/title/supplier/status/value/commitment eligibility/variation or quote lineage; reuse procurement service normalization.
5. `project_claims_position`: claim revisions/status/submitted/paid/provider state/retention, with Xero provider observations clearly separated.
6. `project_cost_position`: committed, actual, forecast and remaining by cost item/package using existing cost report authority; never infer profit from revenue vs budget.
7. `project_tasks_and_activity`: tasks, due dates, owners, overdue state, comments/activity and recent changes.
8. `project_qa_position`: current definitions/runs/responses/evidence/hold points/signoffs plus legacy quality issues/inspections/work proof, with source generation labels.
9. `project_contacts`: only project-linked contacts/companies and roles, not the entire organization directory by default.
10. `project_files_and_drawings`: metadata, drawing-set/page references and authorized signed-link actions; keep file content out of provider context unless explicitly designed and tested.
11. `estimate_and_takeoff_lineage`: accepted estimate/workbook/takeoff/commercial-item package and source references, preserving revisions and snapshots.
12. `supplier_invoice_and_accounting_position`: invoice capture/review/approval, allocated cost, accounting revision and Xero sync observations.

## L. End-to-end implementation update

The Assistant now includes the Phase 0/1 read-contract hardening plus a reusable deterministic construction-brain layer in `lib/assistant/briefing.ts`. A briefing turn retrieves the authorised overview, variations, procurement, claims, QA and activity evidence concurrently, calculates explicit priority/risk signals, preserves unavailable-module states, and exposes source citations without asking the model to calculate commercial truth.

The UI now offers project-aware construction prompts and PM, QS, estimator, procurement, QA and accounts modes. Natural-language draft/create requests are converted into confirmation-required structured proposals with an idempotency key; no proposal mutates data. High-risk approval, issue, submit, accounting and delete actions remain non-executable.

The status migration is additive and also enables `project_briefing` for existing Assistant configurations. On 2026-10-06, the linked hosted Supabase ledger was reconciled and migrations `20261004123000_add_assistant_v1_foundation.sql` and `20261006120000_harden_assistant_tool_execution_status.sql` were applied in order. The Supabase dry-run selected only those two migrations; unrelated pending migrations were not applied.

Future action tools should be adapters to existing actions/RPCs: create draft variation, create draft PO, create task, add project note, create QA definition/run, prepare claim, and generate report. No action should write directly from model output.

## L. Action safety model

| Risk | Examples | Required behavior |
|---|---|---|
| Low | Search, summarize, navigate, prepare report text | Execute read-only; show sources and limitations. |
| Medium | Create draft variation/PO/task/note/QA record | Generate structured proposal, validate inputs, show preview, require confirmation unless organization policy explicitly permits auto-drafts. |
| High | Approve variation, issue PO, submit claim, push Xero, alter approved value, send external communication, delete financial data | Explicit confirmation every time, normal permission/RPC/state checks, idempotency key, immutable audit record, result deep link. |

Required action envelope:

```text
request → interpreted intent → normalized arguments → permission/state check
→ proposed action + affected records + financial impact → user confirmation
→ existing domain service/RPC → audit event → result + deep link
```

## M. Implementation roadmap

### Phase 0 — Correctness and observability

Objective: make V1 honest and diagnosable.

Files/systems: `lib/assistant/tools.ts`, `app/api/assistant/route.ts`, `lib/assistant/types.ts`, `components/app/AiChatbotPanel.tsx`, assistant tests, current migration/table telemetry.

Work: fix canonical field names; replace catch-and-denied with typed result states; record safe error codes and request IDs; surface failed/truncated modules; add exact citations; correct profitability wording and tests.

Tests/acceptance: 26028 fixture returns Draft POs and Draft/Approved variations; no tool failure is rendered as “no records”; unsupported profit questions return “not determinable”; each record citation opens the correct project route.

Risk: live schema drift. Mitigate by reusing generated types/service normalizers and adding characterization tests.

### Phase 1 — Canonical read registry

Objective: replace ad hoc table selectors with permission-aware domain adapters.

Systems: procurement, variation, claims, retention, financial report, QA definition/execution, tasks, activity, Files and contacts services.

Work: define typed tool contracts with source authority, organization/project scope, permission, max rows, truncation and citation builders; parallelize independent reads; preserve current/legacy boundaries.

Tests/acceptance: cross-tenant, cross-project, permission-denied, empty, failed and truncated cases; fixture parity against 26028 module screens.

Database: no migration required if existing services/tables suffice.

### Phase 2 — Deterministic project briefings

Objective: answer “How’s the job looking?”, “What should I chase first?” and “Give me the QS view.”

Systems: new read-model/orchestration services built on existing financial/cost/claims/retention/procurement/QA/task/activity services.

Work: define contract position, committed-vs-draft PO position, approved/pending variations, claims/retention, actual cost, QA hold/overdue, task urgency and evidence freshness. Add as-of timestamps and explicit unavailable modules.

Tests/acceptance: golden project fixtures with deterministic totals; model is only asked to explain structured facts; no financial total is calculated in prompt text.

Database: prefer no migration; add a read model only if query performance evidence requires it.

### Phase 3 — Construction UX

Objective: make results usable in daily project work.

Files: `AiChatbotPanel.tsx`, `AssistantShell.tsx`, shared cards/tables/link components.

Work: suggested prompts; briefing cards; separate budget/revenue/commitment/actual/profitability labels; exact record links; module status chips; role modes; mobile-friendly concise summaries; visible “checked modules” and “as of” information.

Tests/acceptance: browser tests from dashboard, PO, variation, claims, QA and non-project routes; no accidental first-project fallback without visible selection.

### Phase 4 — Safe action proposals

Objective: prepare operational work without bypassing domain controls.

Systems: action registry, confirmation UI, existing domain actions/RPCs, audit/lifecycle events.

Work: draft variation/PO/task/note/QA/claim/report proposals; confirmation by risk; idempotency; existing permission and state transitions; immutable evidence preservation.

Tests/acceptance: denied permissions, stale records, duplicate requests, cancellation, confirmation boundaries and deep-link result verification; no production write tests on 26028.

### Phase 5 — Proactive signals

Objective: move from user-asked answers to trustworthy “detect → explain → act”.

Systems: scheduled/read-model signal jobs, notification preferences, signal history, lifecycle/audit events.

Work: overdue QA, pending variations, draft/unissued POs, commitment-vs-budget thresholds, claim cadence, missing supplier information and activity changes. Signals must be evidence-backed and deduplicated.

Database: add signal/event tables only after Phase 2 proves source authority and idempotent calculation.

## N. Validation run

Executed: `npx vitest run lib/assistant app/api/assistant/route.test.ts`.

Result: 5 test files passed, 13 tests passed. Vitest emitted the existing Vite native-config warning; no test failure.

Not run: full lint, typecheck, build, full E2E, live database migration application, cross-tenant adversarial E2E, and production deployment checks. The audit did not modify source code or database state.

## O. Handoff conclusion

## P. Migration reconciliation and release gate

Hosted Supabase verification after application confirmed that `assistant_configuration`, `assistant_tool_calls`, and the additive `ai_chat_messages.citations`/`metadata` columns are present. The Assistant migration defines forced RLS, organization membership policies, owner-only configuration management, actor-bound tool-call inserts, and the expanded execution-status constraint. No existing Assistant configuration rows or tool-call rows were present to backfill; existing conversations remained intact.

Post-migration validation: 11 focused test files passed with 36 tests, full release ESLint completed with 0 errors and 158 pre-existing warnings, release typecheck passed, and the production build passed. Live Air NZ Fitout smoke tests confirmed draft PO/commitment reasoning, unsupported profitability handling, project briefing, proposal-only action behavior, suggested prompts, and the register total of `$7,656,186.78 excl. GST`.

The current release does not execute real domain mutations from Assistant action proposals. That is intentional and remains the next controlled workstream.

The correct next implementation is Phase 0 followed by Phase 1. Do not expand the system prompt or add write actions before the Assistant can reliably distinguish “zero”, “not authorized”, “not implemented”, “query failed” and “truncated”, and before every financial conclusion is derived from an existing deterministic authority.
