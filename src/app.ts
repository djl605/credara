import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type pg from "pg";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { config } from "./lib/config.js";
import { errorHandler } from "./lib/errors.js";
import type { Database } from "./db/index.js";
import { authRoutes } from "./features/auth/routes.js";
import { userRoutes } from "./features/users/routes.js";

interface AppDeps {
  db: Database;
  dbPool: pg.Pool;
}

export function buildApp({ db, dbPool }: AppDeps) {
  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("db", db);
  app.decorate("dbPool", dbPool);

  app.register(cookie, {
    secret: config.sessionSecret,
  });

  app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  app.setErrorHandler(errorHandler);

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.register(authRoutes);
  app.register(userRoutes);

  return app;
}
