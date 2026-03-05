import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../lib/config.js";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase() {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    dbPool: pg.Pool;
  }
}
