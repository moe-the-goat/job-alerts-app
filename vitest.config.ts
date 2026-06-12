import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./QA/setup.ts"],
    include: ["QA/**/*.test.{ts,tsx}"],
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws if imported outside a React Server Component;
      // under vitest we swap it for an empty module so server-side libs that
      // guard themselves with it (admin client, SMTP sender) remain testable.
      "server-only": path.resolve(__dirname, "./QA/stubs/server-only.ts"),
    },
  },
});
