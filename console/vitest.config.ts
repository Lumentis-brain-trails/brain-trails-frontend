import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@console": path.resolve(__dirname, "src"),
      "@apps": path.resolve(__dirname, "apps"),
      // `@` is the product's source, shared with the console (tokens, ui primitives)
      "@": path.resolve(__dirname, "../src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // The security boundary (BFF routes, middleware) and the libraries, the
      // product's rule; pages and components get e2e tests later.
      include: [
        "src/lib/**",
        "src/app/api/**",
        "src/middleware.ts",
        "apps/**/lib/**",
      ],
      exclude: ["src/lib/ops-types.ts", "**/*.test.*"],
      reporter: ["text"],
      thresholds: { lines: 85, functions: 85, statements: 85 },
    },
  },
});
