import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The whole app is dynamic (Clerk session + live Convex queries), so
  // prerender-time caching adds constraints without benefit.
  cacheComponents: false,
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
