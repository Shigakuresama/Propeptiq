import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";

export async function createMigratedPglite(): Promise<PGlite> {
  const client = new PGlite();
  const database = drizzle(client);

  try {
    await migrate(database, {
      migrationsFolder: path.resolve("src/db/migrations"),
      migrationsTable: "__propeptiq_migrations",
      migrationsSchema: "drizzle",
    });
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}
