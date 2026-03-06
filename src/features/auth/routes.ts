import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { login, logout } from "./service.js";
import { requireAuth } from "../../lib/middleware.js";
import { SESSION_COOKIE, COOKIE_OPTIONS } from "../../lib/auth.js";

export async function authRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    "/api/auth/login",
    {
      schema: {
        body: z.object({
          email: z.email(),
          password: z.string().min(1),
          userSchoolRoleId: z.string().uuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { email, password, userSchoolRoleId } = request.body;
      const result = await login(app.db, email, password, userSchoolRoleId);

      if (result.type === "context_selection_required") {
        return reply.status(200).send(result);
      }

      reply.setCookie(SESSION_COOKIE, result.token, COOKIE_OPTIONS);
      return reply.status(200).send({
        type: "session_created",
        userSchoolRoleId: result.userSchoolRoleId,
      });
    },
  );

  typedApp.post(
    "/api/auth/logout",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE]!;
      await logout(app.db, token);
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return reply.status(200).send({ message: "Logged out" });
    },
  );

  typedApp.get(
    "/api/auth/me",
    {
      preHandler: [requireAuth],
      schema: {
        response: {
          200: z.object({
            userId: z.string(),
            email: z.string(),
            userSchoolRoleId: z.string(),
            role: z.string(),
            schoolId: z.string().nullable(),
            firstName: z.string(),
            lastName: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const { sessionId: _sessionId, ...user } = request.user;
      return user;
    },
  );
}
