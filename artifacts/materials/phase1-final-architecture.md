# TradesStack Material Catalogue — Phase 1 Reference Architecture

```text
Canonical Material
    └── Supplier Product (durable supplier identity; preferred flag authority)
          ├── Effective Price at timestamp (canonical half-open resolver)
          ├── Price History (immutable commercial and provenance evidence)
          └── Assignment History (append-only material linkage evidence)

Raw File → Import Batch → Import Row → Material → Supplier Product → Price
```

## Final authority

- `organization_materials` is the canonical material identity.
- `organization_material_supplier_products` is the durable supplier-facing product identity.
- `organization_material_supplier_products.is_preferred` is preference authority.
- `resolve_material_supplier_product_prices` is effective-price authority using `[effective_from, effective_to)`.
- Every price has a non-null `supplier_product_id`; composite foreign keys enforce tenant, material, supplier, and predecessor consistency.
- Price commercial facts and source-time SKU, description, unit, and provenance are immutable after insert.
- Price lifecycle fields may close an interval; legacy `is_current` and price `is_preferred` remain compatibility caches only.
- Authenticated commercial Product/Price mutations use security-definer atomic RPCs. Direct table mutation is revoked while RLS-protected reads remain available.
- Supplier Product assignment history is append-only.

## Read baseline

The Material Library uses eight concurrent set-based calls: materials, full price history, Supplier Products, effective-price resolver, suppliers, cost codes, import batches, and import rows. There is no per-product/N+1 price resolution. Filtering and summary projection remain in the application, and pagination is deferred.

## Deferred beyond Phase 1

AI/fuzzy matching, aliases, automatic merging, pack/unit conversion, FX conversion, future-price UI and writer scheduling, backdated history editing, Pricing Worksheet integration, Purchase Orders, Supplier Quotes, Supplier Invoices, brand/manufacturer catalogue, and Supplier Product management redesign.
