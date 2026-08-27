import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
  migrations: {
    prefix: "index",
    table: "__propeptiq_migrations",
    schema: "drizzle",
  },
  strict: true,
  verbose: true,
});
