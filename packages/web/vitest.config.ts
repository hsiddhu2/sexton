import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __SEXTON_E2E__: false },
  test: {
    environment: "jsdom",
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    testTimeout: 20000,
  },
});
