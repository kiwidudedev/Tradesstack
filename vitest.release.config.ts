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
      "server-only": path.resolve(__dirname, "scripts/test-stubs/server-only.ts"),
      "next/font/local": path.resolve(__dirname, "scripts/test-stubs/next-font-local.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
      "packages/**/src/**/*.test.{ts,tsx}",
      "scripts/ops/**/*.test.mjs",
    ],
    exclude: [
      "**/*.integration.test.{ts,tsx}",
      "**/dist/**",
      "**/node_modules/**",
      "lib/**/live*.test.{ts,tsx}",
      "scripts/ops/promote-release.test.mjs",
      "proofs/**",
      "tests/**",
      ".tmp/**",
      "artifacts/**",
    ],
  },
});
