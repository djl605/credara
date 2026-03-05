import dotenv from "dotenv";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  override: true,
});

const dbName = "credara_test";
const baseUrl = process.env.DATABASE_URL!.replace(`/${dbName}`, "/postgres");

async function ensureTestDatabase() {
  const client = new pg.Client({ connectionString: baseUrl });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

async function runMigrations() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle"),
  });
  await pool.end();
}

await ensureTestDatabase();
await runMigrations();
