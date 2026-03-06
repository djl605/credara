import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireAuth, requireRole } from "../../lib/middleware.js";
import { createUser, listUsers, getUser, updateUser } from "./service.js";
import { userRoleEnum } from "../../db/schema.js";
import { userWithRolesSchema } from "./schemas.js";

export async function userRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // All user routes require auth
  typedApp.addHook("preHandler", requireAuth);

  typedApp.post(
    "/api/users",
    {
      preHandler: [requireRole("teacher")],
      schema: {
        body: z.object({
          email: z.email(),
          password: z.string().min(8),
          firstName: z.string().min(1).max(100),
          lastName: z.string().min(1).max(100),
          role: z.enum(userRoleEnum.enumValues).optional(),
          schoolId: z.string().uuid().optional(),
        }),
        response: {
          200: userWithRolesSchema.extend({ created: z.boolean() }),
          201: userWithRolesSchema.extend({ created: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const result = await createUser(app.db, request.user, request.body);
      return reply.status(result.created ? 201 : 200).send(result);
    },
  );

  typedApp.get(
    "/api/users",
    {
      preHandler: [requireRole("teacher")],
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.array(userWithRolesSchema),
        },
      },
    },
    async (request) => {
      return listUsers(app.db, request.user, request.query);
    },
  );

  typedApp.get(
    "/api/users/:id",
    {
      preHandler: [requireRole("teacher")],
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: userWithRolesSchema,
        },
      },
    },
    async (request) => {
      return getUser(app.db, request.user, request.params.id);
    },
  );

  typedApp.patch(
    "/api/users/:id",
    {
      preHandler: [requireRole("teacher")],
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z
          .object({
            userSchoolRoleId: z.string().uuid(),
            firstName: z.string().min(1).max(100).optional(),
            lastName: z.string().min(1).max(100).optional(),
            email: z.email().optional(),
            password: z.string().min(8).optional(),
          })
          .refine(
            (b) =>
              b.firstName !== undefined ||
              b.lastName !== undefined ||
              b.email !== undefined ||
              b.password !== undefined,
            { message: "At least one field to update is required" },
          ),
        response: {
          200: userWithRolesSchema,
        },
      },
    },
    async (request) => {
      const { userSchoolRoleId, ...input } = request.body;
      return updateUser(
        app.db,
        request.user,
        request.params.id,
        userSchoolRoleId,
        input,
      );
    },
  );
}
