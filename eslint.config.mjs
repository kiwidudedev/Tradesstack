import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      "public/pdf.worker.min.mjs",
      "**/.next*/**",
      "**/.tmp/**",
      "artifacts/**",
      "coverage/**",
      "packages/**/dist/**",
      "proofs/**/dist/**",
      "proofs/**/node_modules/**",
      "supabase/.temp/**",
    ],
  },
  ...nextVitals,
  ...nextTs,
];

export default config;
