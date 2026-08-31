import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/support/server-only.ts", import.meta.url),
      ),
    },
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: [
      "tests/integration/**/*.test.ts",
      "src/**/*.integration.test.ts",
    ],
    pool: "forks",
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
