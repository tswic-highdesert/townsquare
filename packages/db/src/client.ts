import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function getDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 5 });
  return drizzle(sql, { schema });
}
export type Db = ReturnType<typeof getDb>;

/** Close the underlying postgres connection pool (call in test afterAll / on shutdown). */
export async function closeDb(db: Db): Promise<void> {
  await db.$client.end();
}
