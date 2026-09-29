# `@tradesstack/shared-ui`

Private, source-consumed shared UI primitives for the TradesStack Master reference application.

The package owns dependency-light presentation primitives only. It may depend on React, Radix Slot, class-variance-authority, clsx and tailwind-merge. It must not import application routes, domain services, Supabase, server actions, client-specific code or environment secrets.

The host application must provide React and the existing TradesStack CSS/Tailwind contract from `styles/globals.css`. Branding, fonts, global theme ownership and public assets remain application-owned.

The reference app currently consumes the package through compatibility re-exports at `components/ui/*`. Future consumers should import from `@tradesstack/shared-ui` directly.
