import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  {
    ignores: ["public/pdf.worker.min.mjs"],
  },
  ...nextVitals,
  ...nextTs,
];

export default config;
