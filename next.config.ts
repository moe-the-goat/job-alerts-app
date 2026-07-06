import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next/Turbopack doesn't pick up unrelated
  // package-lock.json files sitting elsewhere on the machine.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // PDF parsing uses `unpdf` (a self-contained serverless pdf.js build) which
  // bundles cleanly — no serverExternalPackages needed. The previous engine
  // (pdf-parse) had to be externalized and then wasn't reliably included in
  // the deployed Vercel function, so PDF uploads failed in production.
};

export default nextConfig;
