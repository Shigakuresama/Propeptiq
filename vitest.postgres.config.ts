import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/postgres/**/*.postgres.test.ts"],
    pool: "forks",
    fileParallelism: false,
  },
});
