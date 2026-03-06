import { eq } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import { users, userSchoolRoles } from "../../db/schema.js";
import {
  verifyPassword,
  hashPassword,
  createSession,
  deleteSession,
} from "../../lib/auth.js";
import type { UserRole } from "../../lib/auth.js";
import { AppError } from "../../lib/errors.js";

// Lazy bcrypt hash for timing normalization on invalid email login attempts.
let dummyHash: string | undefined;
async function getDummyHash() {
  dummyHash ??= await hashPassword("dummy");
  return dummyHash;
}

export interface LoginResult {
  type: "session_created";
  token: string;
  userSchoolRoleId: string;
}

export interface ContextSelectionRequired {
  type: "context_selection_required";
  contexts: {
    id: string;
    role: UserRole;
    schoolId: string | null;
    schoolName: string | null;
    firstName: string;
    lastName: string;
  }[];
}

export async function login(
  db: Database,
  email: string,
  password: string,
  userSchoolRoleId?: string,
): Promise<LoginResult | ContextSelectionRequired> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (!user) {
    // Normalize timing to prevent email enumeration via response latency
    await verifyPassword(password, await getDummyHash());
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const roles = await db.query.userSchoolRoles.findMany({
    where: eq(userSchoolRoles.userId, user.id),
    with: { school: true },
  });

  if (roles.length === 0) {
    throw new AppError(403, "No roles assigned to this user");
  }

  // If a specific context was provided, validate it
  if (userSchoolRoleId) {
    const chosen = roles.find((r) => r.id === userSchoolRoleId);
    if (!chosen) {
      throw new AppError(400, "Invalid context selection");
    }
    const token = await createSession(db, user.id, chosen.id);
    return { type: "session_created", token, userSchoolRoleId: chosen.id };
  }

  // If only one context, auto-select
  if (roles.length === 1) {
    const token = await createSession(db, user.id, roles[0].id);
    return {
      type: "session_created",
      token,
      userSchoolRoleId: roles[0].id,
    };
  }

  // Multiple contexts — client must choose
  return {
    type: "context_selection_required",
    contexts: roles.map((r) => ({
      id: r.id,
      role: r.role,
      schoolId: r.schoolId,
      schoolName: r.school?.name ?? null,
      firstName: r.firstName,
      lastName: r.lastName,
    })),
  };
}

export async function logout(db: Database, token: string): Promise<void> {
  await deleteSession(db, token);
}
