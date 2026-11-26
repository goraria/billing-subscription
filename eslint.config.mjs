import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // ...nextVitals,
  // ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".express/**",
    "out/**",
    "build/**",
    "express-env.d.ts",
  ]),
]);
