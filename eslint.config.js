import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "**/dist/**", "**/node_modules/**", "private/**", "cdk.out/**", ".kiro/hooks/scripts/**",
      "packages/web/dist-e2e/**", "packages/web/dist-types/**", "packages/web/dist-types-node/**", "packages/web/test-results/**",
      "packages/web/playwright-report/**", "packages/web/e2e-artifacts/**", "packages/web/public/demo/**",
    ],
  },
  { files: ["packages/**/*.ts", "packages/**/*.tsx", "infra/**/*.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { rules: { "no-eval": "error", "no-new-func": "error", "no-implied-eval": "error" } },
  {
    files: ["packages/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "Render untrusted strings as text only." },
        { selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]", message: "Render untrusted strings as text only." },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: "Render untrusted strings as text only." },
      ],
      "no-restricted-imports": ["error", { patterns: ["node:*"] }],
    },
  },
  { files: ["**/scripts/**/*.mjs"], languageOptions: { globals: { fetch: "readonly", console: "readonly", URL: "readonly", process: "readonly" } } },
);
