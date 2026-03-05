import "dotenv/config";
import { config } from "./lib/config.js";
import { createDatabase } from "./db/index.js";
import { buildApp } from "./app.js";

const { db, pool } = createDatabase();
const app = buildApp({ db, dbPool: pool });

const host = "0.0.0.0";

app.listen({ port: config.port, host }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
