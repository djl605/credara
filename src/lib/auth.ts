import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { eq, and, gt } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  sessions,
  users,
  userSchoolRoles,
  userRoleEnum,
} from "../db/schema.js";

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const SESSION_COOKIE = "session";
const SALT_ROUNDS = 10;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Database,
  userId: string,
  userSchoolRoleId: string,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    userSchoolRoleId,
    expiresAt,
  });

  return token;
}

export async function deleteSession(
  db: Database,
  token: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export interface SessionData {
  sessionId: string;
  userId: string;
  email: string;
  userSchoolRoleId: string;
  role: UserRole;
  schoolId: string | null;
  firstName: string;
  lastName: string;
}

export async function getSession(
  db: Database,
  token: string,
): Promise<SessionData | null> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      email: users.email,
      userSchoolRoleId: sessions.userSchoolRoleId,
      role: userSchoolRoles.role,
      schoolId: userSchoolRoles.schoolId,
      firstName: userSchoolRoles.firstName,
      lastName: userSchoolRoles.lastName,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(
      userSchoolRoles,
      eq(sessions.userSchoolRoleId, userSchoolRoles.id),
    )
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
