import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // The port mirrors PHP controller naming, where `module` is an ordinary
      // local identifier (never CommonJS `module`). This Next rule exists to
      // catch accidental CommonJS shadowing, which does not apply here.
      "@next/next/no-assign-module-variable": "off",
      // Plain anchors intentionally force full-page navigation, matching the
      // PHP request/response cycle (and the generators' post-back flows).
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
