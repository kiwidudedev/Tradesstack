# Supplier Invoice UCL debug runner

This development-only command runs the real `supplier_invoice` / `supplier_bill.v2`
Universal Construction Learning pipeline from a terminal. It is not an API route
and is not part of scheduled or worker execution.

The runner loads the existing local project environment, connects with the
configured Supabase service role, and reuses the production builder, validator,
prompt projection, Anthropic adapter, response validation and normalization,
memory-action path, review records, and cursor implementation.

## Safest first run

Start with both write and provider calls disabled:

```bash
npx tsx scripts/debug-supplier-invoice-ucl.ts \
  --organization=5c5de347-9f21-48fa-aac9-ba87e91fe92a \
  --dry-run \
  --skip-anthropic
```

This connects to Supabase, uses the production monthly selection and builder,
validates and prints the canonical UCL records, and prints the prompt projection.
It does not call Anthropic or write review runs, run records, memories, or
cursors.

## Arguments

- `--organization=<uuid>`: required organization UUID.
- `--invoice=<uuid>`: optional exact Supplier Invoice UUID. Exact invoice runs
  use the production targeted Supplier Invoice builder and an isolated
  `debug_supplier_invoice:<invoice-id>` review scope.
- `--review-month=YYYY-MM`: optional; defaults to the current UTC month.
- `--limit=<1-12>`: optional maximum effective-cursor prefix; defaults to `1`.
- `--dry-run`: calls the read-only builder and, unless skipped, Anthropic, but
  never creates review runs, run records, memory writes, or cursor writes.
- `--skip-memory`: runs the normal persisted review and cursor path but does not
  apply generated memory actions.
- `--skip-anthropic`: stops immediately after prompt projection and performs no
  review, memory, or cursor writes.

Unknown arguments and malformed UUIDs or review months fail closed.

## Dry run with Anthropic

```bash
npx tsx scripts/debug-supplier-invoice-ucl.ts \
  --organization=5c5de347-9f21-48fa-aac9-ba87e91fe92a \
  --review-month=2026-07 \
  --limit=1 \
  --dry-run
```

This calls the configured Anthropic model and may incur provider cost. It prints
the credential-free request body, exact raw text response, normalized response,
and proposed memory actions. It does not write any UCL state.

## Exact Supplier Invoice

```bash
npx tsx scripts/debug-supplier-invoice-ucl.ts \
  --organization=5c5de347-9f21-48fa-aac9-ba87e91fe92a \
  --invoice=<supplier_invoice_uuid> \
  --dry-run
```

The organization boundary remains mandatory even with an exact invoice ID. An
invoice outside that organization is not returned by the production builder.

## Write-enabled mode

Omitting `--dry-run` and `--skip-anthropic` runs the shared persisted monthly UCL
runner. It can:

- call Anthropic and incur cost;
- create or update review-run metadata;
- write reviewed-record metadata;
- apply generated memory actions unless `--skip-memory` is supplied;
- advance the selected review scope cursor after success.

Use write-enabled mode only against an approved development or test organization.
For an exact invoice, the isolated debug scope prevents changing the normal
`organization` monthly cursor.

## Output safety

The runner never prints provider headers or credentials. Before printing
structured content, it rejects keys associated with service-role keys, API keys,
authorization, cookies, signed URLs, storage paths, raw OCR, refresh tokens, and
PDF or image bytes. It also refuses to print configured Anthropic, Supabase, or
Xero secret values if they appear in output.
