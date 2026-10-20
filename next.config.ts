import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 市区町村境界は実行時に読むので、サーバー関数に同梱する
  outputFileTracingIncludes: {
    "/api/atlas": ["./data/boundaries/**"],
    "/api/areas/[id]/places": ["./data/boundaries/**"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
