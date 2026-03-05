import { createDatabase } from "../db/index.js";
import { buildApp } from "../app.js";

export function createTestApp() {
  const { db, pool } = createDatabase();
  const app = buildApp({ db, dbPool: pool });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return app;
}
