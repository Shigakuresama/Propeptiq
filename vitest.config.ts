import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "catalog-demo-fixtures": fileURLToPath(
        new URL("./src/catalog/demo-fixtures-entry.ts", import.meta.url),
      ),
    },
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["tests/integration/**", "tests/e2e/**"],
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
