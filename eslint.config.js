import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "private/**", "cdk.out/**", ".kiro/hooks/scripts/**"] },
  { files: ["packages/**/*.ts", "packages/**/*.tsx", "infra/**/*.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { rules: { "no-eval": "error", "no-new-func": "error", "no-implied-eval": "error" } },
  { files: ["**/scripts/**/*.mjs"], languageOptions: { globals: { fetch: "readonly", console: "readonly", URL: "readonly", process: "readonly" } } },
);
