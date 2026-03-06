import type { FastifyRequest, FastifyReply } from "fastify";
import {
  getSession,
  SESSION_COOKIE,
  type SessionData,
  type UserRole,
} from "./auth.js";
import { AppError } from "./errors.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionData;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) {
    throw new AppError(401, "Authentication required");
  }

  const session = await getSession(request.server.db, token);
  if (!session) {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    throw new AppError(401, "Invalid or expired session");
  }

  request.user = session;
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  student: 0,
  teacher: 1,
  admin: 2,
  superadmin: 3,
};

export function requireRole(minimumRole: UserRole) {
  return async function (request: FastifyRequest): Promise<void> {
    const userLevel = ROLE_HIERARCHY[request.user.role];
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (userLevel < requiredLevel) {
      throw new AppError(403, "Insufficient permissions");
    }
  };
}
