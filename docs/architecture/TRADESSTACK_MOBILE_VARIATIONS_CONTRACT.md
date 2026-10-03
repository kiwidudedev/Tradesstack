# Mobile Variations Contract v1

TradesStack Main remains the source of truth for project Variations. WorkApp
must use the mobile RPCs below and must not mutate Variation tables directly.

All operations require an authenticated Supabase user. The RPCs accept a
project ID, derive the organization from that project, and require active
project membership through `resolve_mobile_project_member_context_v2`.

## Read operations

### `get_mobile_project_variation_capabilities_v1(p_project_id)`

Returns project-scoped capability flags derived from the authenticated project
membership and the Main `variations.write` permission. WorkApp uses
`can_create` to decide whether to show the create action even when the project
has no existing Variations.

```ts
{
  project_id: string
  can_create: boolean
  can_edit: boolean
  can_change_status: boolean
}
```

### `list_mobile_project_variations_v1(p_project_id)`

Returns one row per Variation:

```ts
{
  variation_id: string
  project_id: string
  variation_number: string
  variation_title: string
  status: string
  origin: string
  requested_by: string
  requested_date: string | null
  due_date: string | null
  total_variation_price: number
  invoice_ready: boolean
  can_edit: boolean
  can_change_status: boolean
  created_at: string
  updated_at: string
}
```

### `get_mobile_project_variation_detail_v1(p_project_id, p_variation_id)`

Returns one authoritative detail row. Financial summary fields are returned
from `project_variations`; WorkApp must not recalculate them.

`line_items`, `attachments`, and `status_events` are JSON arrays. Each line
includes backend-owned `is_manual`, `is_editable`, `is_deletable`, `is_locked`,
and `lock_reason` capability metadata. Attachment metadata contains file
name/kind, notes, creation time, and boolean file/url availability flags. Raw
private Storage paths are not returned.

### `get_project_variation_mobile_edit_snapshot_v1(p_project_id, p_variation_id)`

Returns the backend-owned capability snapshot, current `updated_at`, lock
state, editable header fields, and supported actions. WorkApp must use these
capabilities instead of reconstructing role or status rules.

## Mutations

### `create_mobile_project_variation_v1(p_project_id, p_title)`

Requires `variations.write`. Creates a Draft through the existing authoritative
`create_project_variation_draft` RPC, including database-generated numbering.

### `update_mobile_project_variation_header_v1(...)`

Requires `variations.write` and the current `p_expected_updated_at`. Updates
only the supported header/terms fields and returns the complete authoritative
detail as JSON. A stale timestamp raises SQLSTATE `40001`.

### `update_mobile_project_variation_status_v1(...)`

Requires `variations.write` and the current `p_expected_updated_at`. Supported
status values are the existing Main values:

```text
Draft, Priced, Sent, Client Review, Approved, Rejected, Invoiced
```

The operation atomically updates status effects, records a status event,
maintains invoice-ready state and invoice-item state, recalculates project
claim snapshots, and returns the complete authoritative detail as JSON.

Main did not previously define a formal narrower transition graph. V1 therefore
preserves the existing desktop enum contract: every listed existing status is
validated server-side, while invalid status values are rejected. A narrower
business transition graph should be added only after the product owner defines
it and the desktop path is migrated consistently.

No mobile delete/archive operation is exposed in v1.

### `mobile_mutate_project_variation_manual_line_v1(...)`

Adds, edits, or deletes one Variation line through the existing Main save
boundary:

```text
(
  p_project_id,
  p_variation_id,
  p_expected_updated_at,
  p_operation,       -- add | edit | delete
  p_line_item_id,    -- required for edit/delete; null for add
  p_section,         -- Labour | Materials | Subcontractors | Plant | Margin
  p_description,
  p_quantity,
  p_unit,
  p_rate,
  p_sort_order
)
```

Only manually entered lines may be changed. A line is manual when all current
quote and purchase-order provenance fields are null. Provenance-bearing lines
are returned with `is_locked: true`, `is_editable: false`,
`is_deletable: false`, and a `lock_reason` of `quote_lineage` or
`purchase_order_lineage`. The mutation accepts no organization ID, source ID,
total, or client provenance fields.

The RPC returns the fresh authoritative Variation detail. It validates the
derived organization, project membership, `variations.write`, Variation
ownership, line ownership, and the expected `updated_at`. A stale write raises
SQLSTATE `40001`. Totals, section totals, and the Variation cost-item revision
are produced by `save_project_variation_draft`; the client cannot supply a
total. Existing Main status semantics are preserved, including the current
absence of a narrower status lock in the canonical save path.

## Attachment boundary

The detail operation returns safe attachment metadata only. WorkApp must not
persist or expose raw Storage paths. Upload and signed-download operations are
not part of v1 because Main does not currently have a Variation-specific safe
signed-URL RPC for this bucket.

## Concurrency

Every update requires the `updated_at` value returned by the previous read or
mutation. Main locks the Variation row, rejects stale writes, and returns the
fresh authoritative state after a successful mutation.
