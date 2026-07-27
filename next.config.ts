import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.PAYMENT_CLAIM_PLAYWRIGHT_DIST_DIR
    ? { distDir: process.env.PAYMENT_CLAIM_PLAYWRIGHT_DIST_DIR }
    : {}),
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
