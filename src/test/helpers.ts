import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { createDatabase } from "../db/index.js";
import { buildApp } from "../app.js";
import { hashPassword, createSession, SESSION_COOKIE } from "../lib/auth.js";
import type { UserRole } from "../lib/auth.js";
import { users, userSchoolRoles, schools } from "../db/schema.js";

export function createTestApp() {
  const { db, pool } = createDatabase();
  const app = buildApp({ db, dbPool: pool });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return app;
}

/**
 * Truncate all tables between tests for isolation.
 */
export async function cleanDatabase(app: FastifyInstance) {
  await app.db.execute(sql`
    TRUNCATE
      student_badges, badge_definitions,
      submission_answers, submissions,
      assignments,
      teacher_favorites,
      collection_lessons, collections,
      media_sources,
      lesson_skills, lessons,
      skills,
      class_students, classes,
      sessions, user_school_roles, users,
      schools,
      question_choices, assessment_questions, assessments
    CASCADE
  `);
}

interface CreateTestUserOptions {
  email?: string;
  password?: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  schoolId?: string | null;
}

export async function createTestUser(
  app: FastifyInstance,
  options: CreateTestUserOptions,
) {
  const email = options.email ?? `${options.role}-${randomUUID()}@test.com`;
  const password = options.password ?? "password123";
  const passwordHash = await hashPassword(password);

  const [user] = await app.db
    .insert(users)
    .values({ email, passwordHash })
    .returning();

  const schoolId =
    options.schoolId === undefined
      ? options.role === "superadmin"
        ? null
        : undefined
      : options.schoolId;

  // If we need a school but none was provided, that's an error
  if (schoolId === undefined) {
    throw new Error(
      `schoolId is required for role ${options.role}. Create a school first.`,
    );
  }

  const [userSchoolRole] = await app.db
    .insert(userSchoolRoles)
    .values({
      userId: user.id,
      schoolId,
      role: options.role,
      firstName: options.firstName ?? "Test",
      lastName: options.lastName ?? options.role,
    })
    .returning();

  return { user, userSchoolRole, password };
}

export async function createTestSchool(app: FastifyInstance, name?: string) {
  const [school] = await app.db
    .insert(schools)
    .values({ name: name ?? `Test School ${randomUUID()}` })
    .returning();
  return school;
}

/**
 * Create a session and return the cookie header value for use in requests.
 */
export async function loginAs(
  app: FastifyInstance,
  userId: string,
  userSchoolRoleId: string,
): Promise<string> {
  const token = await createSession(app.db, userId, userSchoolRoleId);
  return `${SESSION_COOKIE}=${token}`;
}
