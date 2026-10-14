import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // Keeps the JSON log lines of unrelated tests out of the output; a test that asserts on log
    // output stubs LOG_LEVEL itself. PULP_BACKENDS_FILE points at a path that can never exist so
    // a developer's local data/pulp-backends.json never leaks into a run; a test that needs the
    // server list stubs its own temp file.
    env: { LOG_LEVEL: "error", PULP_BACKENDS_FILE: "/nonexistent/pulp-backends.json" },
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/*.fuzz.test.ts"],
  },
  resolve: {
    // Mirrors the "@/*" path mapping in tsconfig.json.
    alias: {
      "@": repoRoot,
    },
  },
});
