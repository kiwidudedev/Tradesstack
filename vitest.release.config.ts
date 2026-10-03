import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@tradesstack/core-contracts": path.resolve(__dirname, "packages/core-contracts/src/index.ts"),
      "@tradesstack/client-config": path.resolve(__dirname, "packages/client-config/src/index.ts"),
      "@tradesstack/shared-ui": path.resolve(__dirname, "packages/shared-ui/src/index.ts"),
      "@tradesstack/pdf-utils": path.resolve(__dirname, "packages/pdf-utils/src/index.ts"),
      "@tradesstack/suppliers": path.resolve(__dirname, "packages/suppliers/src/index.ts"),
      "server-only": path.resolve(__dirname, "test-support/server-only.ts"),
      "next/font/local": path.resolve(__dirname, "test-support/next-font-local.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
      "packages/**/src/**/*.test.{ts,tsx}",
    ],
    exclude: [
      "**/*.integration.test.{ts,tsx}",
      "**/dist/**",
      "**/node_modules/**",
      "lib/**/live*.test.{ts,tsx}",
      "scripts/ops/promote-release.test.mjs",
      // These characterize Main-only migration/operations scripts. The scripts
      // directory is intentionally not part of a customer release snapshot.
      "lib/accounting/retention-gst-inheritance-phase1-migration.test.ts",
      "lib/material-supplier-price-attachment.test.ts",
      "lib/promoted-project-metadata-migration.test.ts",
      "lib/material-supplier-product-preflight-audit.test.ts",
      "lib/opportunity-promotion-stage7-migration.test.ts",
      "lib/material-supplier-relationship-hardening.test.ts",
      "lib/opportunity-award-pricing-backfill.test.ts",
      "lib/material-supplier-product-backfill.test.ts",
      "lib/opportunity-promotion-stage6-migration.test.ts",
      "proofs/**",
      "tests/**",
      ".tmp/**",
      "artifacts/**",
    ],
  },
});
