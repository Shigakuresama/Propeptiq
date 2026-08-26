import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/support/server-only.ts", import.meta.url),
      ),
      "catalog-demo-fixtures": fileURLToPath(
        new URL("./src/catalog/demo-fixtures-entry.ts", import.meta.url),
      ),
      "local-auth-driver": fileURLToPath(
        new URL("./src/auth/local-driver.ts", import.meta.url),
      ),
      "local-payment-provider": fileURLToPath(
        new URL("./src/commerce/local-payment-provider.ts", import.meta.url),
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
