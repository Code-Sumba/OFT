import path from "node:path";
import type { NextConfig } from "next";

/** Backend base URL, used for the /api rewrite and server-side fetches. */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // This app has its own lockfile inside the repo; don't treat the repo root as the project root.
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser only talks to this origin; /api is proxied to the backend so the
  // HTTP-only login cookie is first-party in development and production alike.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
