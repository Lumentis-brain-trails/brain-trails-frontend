import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Unit-tested surface: the BFF (security boundary), auth routes, middleware
      // and shared libraries. Pages/components are covered by e2e tests later.
      include: ["src/lib/**", "src/app/api/**", "src/middleware.ts"],
      exclude: ["src/lib/types.ts", "src/**/*.test.*"],
      reporter: ["text"],
      thresholds: { lines: 85, functions: 85, statements: 85 },
    },
  },
});
