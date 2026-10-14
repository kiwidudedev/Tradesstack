import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { tsconfigPath: "tsconfig.build.json" },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  deploymentId: process.env.DEPLOYMENT_VERSION || process.env.GIT_SHA,
  ...(process.env.PAYMENT_CLAIM_PLAYWRIGHT_DIST_DIR
    ? { distDir: process.env.PAYMENT_CLAIM_PLAYWRIGHT_DIST_DIR }
    : {}),
  serverExternalPackages: ["pdfjs-dist"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
