import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@tradesstack/core-contracts": path.resolve(
        __dirname,
        "packages/core-contracts/src/index.ts",
      ),
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
  },
});
