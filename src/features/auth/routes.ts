import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { login, logout } from "./service.js";
import { requireAuth } from "../../lib/middleware.js";
import { SESSION_COOKIE, COOKIE_OPTIONS } from "../../lib/auth.js";
import { userRoleEnum } from "../../db/schema.js";

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
        response: {
          200: z.discriminatedUnion("type", [
            z.object({
              type: z.literal("session_created"),
              userSchoolRoleId: z.string(),
            }),
            z.object({
              type: z.literal("context_selection_required"),
              contexts: z.array(
                z.object({
                  id: z.string(),
                  role: z.enum(userRoleEnum.enumValues),
                  schoolId: z.string().nullable(),
                  schoolName: z.string().nullable(),
                  firstName: z.string(),
                  lastName: z.string(),
                }),
              ),
            }),
          ]),
        },
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
    {
      preHandler: [requireAuth],
      schema: {
        response: {
          200: z.object({ message: z.string() }),
        },
      },
    },
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
            role: z.enum(userRoleEnum.enumValues),
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
