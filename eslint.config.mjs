import path from "node:path";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// lib/log.ts writes to process.stdout and must never be bundled for the browser. Flat config
// cannot select files by directive, so this rule reads the "use client" directive itself and
// reports any import that resolves to lib/log, whether written as "@/lib/log" or relatively.
// It sees direct imports only: a client file importing a server module that imports the logger
// is not caught here.
const logModule = path.resolve(import.meta.dirname, "lib/log");
const noClientLogImport = {
  meta: { type: "problem", schema: [] },
  create(context) {
    let isClient = false;

    return {
      Program(node) {
        isClient = node.body.some(
          (statement) =>
            statement.type === "ExpressionStatement" && statement.directive === "use client"
        );
      },
      ImportDeclaration(node) {
        const source = node.source.value;
        const target = source.startsWith("@/")
          ? path.resolve(import.meta.dirname, source.slice(2))
          : path.resolve(path.dirname(context.filename), source);

        if (isClient && target.replace(/\.ts$/, "") === logModule) {
          context.report({
            node,
            message: 'lib/log is server-only and cannot be imported from a "use client" file.',
          });
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { local: { rules: { "no-client-log-import": noClientLogImport } } },
    rules: { "local/no-client-log-import": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
