import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next/Turbopack doesn't pick up unrelated
  // package-lock.json files sitting elsewhere on the machine.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Keep `pdf-parse` (and its pdf.js internals) as a real server-side Node
  // module instead of letting Next/Turbopack trace-and-bundle it. Bundling it
  // mangled its internals and made PDF parsing throw on many real CVs, so
  // uploads only worked as DOCX. Externalizing fixes text-based PDF uploads.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
