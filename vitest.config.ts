import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // Keeps the JSON log lines of unrelated tests out of the output; a test that asserts on log
    // output stubs LOG_LEVEL itself.
    env: { LOG_LEVEL: "error" },
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
