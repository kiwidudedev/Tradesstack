# Trade Pack Workspace Migration (Safe, Backward-Compatible)

## Phase 1 Audit (A/B/C/D)

### A. User-facing copy only
- Navigation/dashboard/workspace labels:
  - `lib/nav.ts`
  - `components/app/Sidebar.tsx`
  - `components/app/Topbar.tsx`
  - `components/app/EditableProjectGrid.tsx`
  - `components/app/ActivityCard.tsx`
  - `app/app/projects/page.tsx`
  - `app/app/projects/new/page.tsx`
  - `app/app/projects/[projectId]/layout.tsx`
  - `app/app/projects/[projectId]/dashboard/page.tsx`
  - `components/auth/AuthDialog.tsx`
- Pricing/plan copy:
  - `components/marketing/Sections.tsx`

### B. App/domain logic
- Legacy project-centric data access and route params:
  - `lib/projects-server.ts`
  - `app/app/projects/*`
  - `hooks/use-organization-projects.ts`
  - `components/app/TradePackBuilderUploader.tsx`
  - `components/app/ScopeBuilderWorkbench.tsx`
  - `components/app/ChangeDetectionWorkbench.tsx`
  - `app/api/chat/route.ts`
  - `app/api/scope-builder/route.ts`
  - `app/api/change-detection/run/route.ts`
  - `app/api/trade-pack/classify-page/route.ts`
- New domain adapters introduced:
  - `lib/trade-pack-workspaces.ts`
  - `lib/trade-pack-workspaces-server.ts`

### C. Supabase schema dependencies
- Core legacy workspace table:
  - `public.organization_projects` (kept)
- Project-linked dependent tables:
  - `public.project_drawing_sets`
  - `public.project_trade_pack_page_index`
  - `public.project_trade_pack_reason_snapshots`
  - `public.scope_runs` (`project_id`)
  - `public.change_detection_runs` (`project_id`)
  - `public.trade_packs` (generated trade-pack outputs, not workspace unit)
- RLS/policy dependencies:
  - `organization_projects` insert/select/update/delete policies
  - project-based membership checks via `is_member_of_organization`

### D. Risky areas intentionally kept backward-compatible
- Kept `/app/projects/*` as primary runtime routes.
- Kept `organization_projects` as source-of-truth.
- Did not rename/drop `project_id` columns.
- Did not remove existing RLS policies or relations.
- Added compatibility structures and adapters instead of destructive rewrites.

## What Changed

1. User-facing terminology
- Updated core app copy from `Project(s)` to `Trade Pack Workspace(s)` in navigation, dashboard cards, workspace pages, create flow, and key API/user error messages.
- Pricing copy now uses:
  - `4 total trade packs per month`
  - `12 total trade packs per month`
  - `30 total trade packs per month`

2. Domain compatibility layer
- Added `lib/trade-pack-workspaces.ts` (domain types/helpers).
- Added `lib/trade-pack-workspaces-server.ts` (server adapters) that map trade-pack-workspace domain calls to existing `organization_projects` data access.
- Updated major app pages to use the new domain adapters while retaining legacy storage.

3. Supabase safe evolution
- Added migration: `20260311113000_trade_pack_workspace_compat_and_quota.sql`.
- Introduced `public.organization_plan_settings` (non-destructive) to store plan tier and monthly trade pack workspace limit.
- Added default plan row creation for new/existing organizations.
- Added helper functions:
  - `default_trade_pack_monthly_limit`
  - `get_trade_pack_monthly_limit_for_organization`
  - `count_trade_pack_workspaces_created_in_month`
  - `can_create_trade_pack_workspace`
  - `get_trade_pack_workspace_quota`
- Updated `organization_projects` insert policy to enforce monthly creation quotas safely at DB/RLS level.
- Introduced `public.trade_pack_workspaces` as compatibility table synced from `organization_projects` via trigger.

4. Usage limit enforcement
- Monthly creation limits now enforced at DB level for legacy `organization_projects` writes:
  - Starter: 4
  - Professional: 12
  - Business: 30
- Create workspace UI now shows monthly usage and handles quota-reached messaging.
- Per Trade Pack workspace module caps are enforced server-side:
  - Trade Pack Builder: 1 generated trade pack save per workspace
  - Scope Builder: 1 complete run per workspace
  - Change Detection: 1 complete run per workspace
- AI Assistant limits remain unchanged.

5. Route compatibility
- Added forward-compatible aliases:
  - `/app/trade-packs`
  - `/app/trade-packs/new`
  - `/app/trade-packs/[tradePackSlug]`
  - `/app/trade-packs/[tradePackSlug]/[segment]`
- Aliases redirect to current `/app/projects/*` routes to avoid breakage.

## What Remains Legacy (By Design)

- `public.organization_projects` remains active source-of-truth for workspace CRUD.
- Existing `project_id` foreign keys in drawing sets/scope/change detection remain unchanged.
- Existing `/app/projects/*` route structure remains primary runtime path.
- Existing RLS and relational links are preserved to avoid production regressions.

## Backward Compatibility Guarantees

- No destructive schema changes (no drops/renames of legacy tables/columns/policies).
- Existing records remain intact and continue to work.
- Existing app flows keep functioning through legacy tables/routes.
- New compatibility structures are additive and synchronized from legacy project writes.

## Full Retirement Plan (Future)

To fully retire legacy `projects` naming later:
1. Move app reads/writes from `organization_projects` to `trade_pack_workspaces`.
2. Migrate all dependent tables to `trade_pack_workspace_id` (with dual columns during cutover).
3. Update all API payload names from `projectId/projectSlug` to workspace equivalents.
4. Cut over route hierarchy from `/app/projects/*` to `/app/trade-packs/*`.
5. Remove legacy aliases and project-based policy/functions only after full parity and data migration verification.
