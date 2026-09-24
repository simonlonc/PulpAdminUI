import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The fuzz tier is opt-in via `npm run fuzz` and is deliberately not part of
// `npm run check`: property-based runs are slower and their case counts can
// vary, so they must never gate the default `npm test` / `npm run check` path.

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.fuzz.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    // Mirrors the "@/*" path mapping in tsconfig.json.
    alias: {
      "@": repoRoot,
    },
  },
});
