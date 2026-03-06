import { eq, and, or, isNull, inArray, asc } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import { users, userSchoolRoles } from "../../db/schema.js";
import { hashPassword } from "../../lib/auth.js";
import { AppError } from "../../lib/errors.js";
import type { SessionData, UserRole } from "../../lib/auth.js";
import { ROLE_HIERARCHY } from "../../lib/middleware.js";

function getErrorCode(obj: object): unknown {
  return "code" in obj ? obj.code : undefined;
}

function getDbErrorCode(err: unknown): unknown {
  if (!(err instanceof Error)) return undefined;
  const direct = getErrorCode(err);
  if (direct) return direct;
  return typeof err.cause === "object" && err.cause !== null
    ? getErrorCode(err.cause)
    : undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return getDbErrorCode(err) === "23505";
}

function isForeignKeyViolation(err: unknown): boolean {
  return getDbErrorCode(err) === "23503";
}

// Roles each caller role is allowed to create
const ALLOWED_CREATIONS: Record<UserRole, readonly UserRole[]> = {
  superadmin: ["superadmin", "admin", "teacher", "student"],
  admin: ["admin", "teacher", "student"],
  teacher: ["student"],
  student: [],
};

interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  schoolId?: string;
}

export async function createUser(
  db: Database,
  caller: SessionData,
  input: CreateUserInput,
) {
  const targetRole: UserRole = input.role ?? "student";
  const allowed = ALLOWED_CREATIONS[caller.role];

  if (!allowed.includes(targetRole)) {
    throw new AppError(403, `Your role cannot create ${targetRole} users`);
  }

  // Determine school context
  let schoolId: string | null;
  if (caller.role === "superadmin") {
    if (targetRole === "superadmin") {
      // Superadmins are not school-scoped
      schoolId = null;
    } else if (!input.schoolId) {
      throw new AppError(400, "schoolId is required for non-superadmin roles");
    } else {
      schoolId = input.schoolId;
    }
  } else {
    schoolId = caller.schoolId;
  }

  const email = input.email.toLowerCase();

  // Insert user if email doesn't already exist; if it does, the provided
  // password is ignored and the existing credentials are preserved.
  const passwordHash = await hashPassword(input.password);
  const [inserted] = await db
    .insert(users)
    .values({ email, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning();

  // If onConflictDoNothing fired, returning() is empty — fetch existing user
  const user =
    inserted ??
    (await db.query.users.findFirst({ where: eq(users.email, email) }));

  if (!user) {
    throw new AppError(500, "Failed to create or find user");
  }

  // Check if this exact role assignment already exists
  const existingRole = await db.query.userSchoolRoles.findFirst({
    where: and(
      eq(userSchoolRoles.userId, user.id),
      schoolId
        ? eq(userSchoolRoles.schoolId, schoolId)
        : isNull(userSchoolRoles.schoolId),
      eq(userSchoolRoles.role, targetRole),
    ),
  });

  const created = !existingRole;

  if (created) {
    try {
      await db.insert(userSchoolRoles).values({
        userId: user.id,
        schoolId,
        role: targetRole,
        firstName: input.firstName,
        lastName: input.lastName,
      });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new AppError(400, "Invalid school ID");
      }
      throw err;
    }
  }

  const result = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { passwordHash: false },
    with: {
      schoolRoles: {
        where: schoolId
          ? eq(userSchoolRoles.schoolId, schoolId)
          : isNull(userSchoolRoles.schoolId),
        with: { school: true },
      },
    },
  });

  return { ...result!, created };
}

/**
 * Build a filter for the schoolRoles relation that restricts which roles
 * the caller is allowed to see: superadmins see all, admins see their school,
 * teachers see only student roles + their own.
 */
function visibleRolesFilter(caller: SessionData) {
  if (caller.role === "superadmin") return undefined;
  if (!caller.schoolId) return undefined;

  const schoolEq = eq(userSchoolRoles.schoolId, caller.schoolId);

  if (caller.role === "teacher") {
    return and(
      schoolEq,
      or(
        eq(userSchoolRoles.role, "student"),
        eq(userSchoolRoles.userId, caller.userId),
      ),
    );
  }

  return schoolEq;
}

interface ListUsersOptions {
  limit: number;
  offset: number;
}

export async function listUsers(
  db: Database,
  caller: SessionData,
  options: ListUsersOptions,
) {
  const { limit, offset } = options;

  if (caller.role === "superadmin") {
    // Paginate on distinct users, then fetch their roles
    const userIdRows = await db
      .selectDistinct({ userId: userSchoolRoles.userId })
      .from(userSchoolRoles)
      .orderBy(asc(userSchoolRoles.userId))
      .limit(limit)
      .offset(offset);

    if (userIdRows.length === 0) return [];

    return db.query.users.findMany({
      where: inArray(
        users.id,
        userIdRows.map((r) => r.userId),
      ),
      columns: { passwordHash: false },
      with: { schoolRoles: { with: { school: true } } },
      orderBy: asc(users.id),
    });
  }

  if (!caller.schoolId) {
    return [];
  }

  // Admin sees all users in their school; teacher sees students + themselves
  const roleFilter =
    caller.role === "teacher"
      ? or(
          eq(userSchoolRoles.role, "student"),
          eq(userSchoolRoles.userId, caller.userId),
        )
      : undefined;

  // Paginate on distinct users matching the filter
  const userIdRows = await db
    .selectDistinct({ userId: userSchoolRoles.userId })
    .from(userSchoolRoles)
    .where(and(eq(userSchoolRoles.schoolId, caller.schoolId), roleFilter))
    .orderBy(asc(userSchoolRoles.userId))
    .limit(limit)
    .offset(offset);

  if (userIdRows.length === 0) return [];

  return db.query.users.findMany({
    where: inArray(
      users.id,
      userIdRows.map((r) => r.userId),
    ),
    columns: { passwordHash: false },
    with: {
      schoolRoles: {
        where: visibleRolesFilter(caller),
        with: { school: true },
      },
    },
    orderBy: asc(users.id),
  });
}

export async function getUser(
  db: Database,
  caller: SessionData,
  userId: string,
) {
  const schoolFilter =
    caller.role !== "superadmin" && caller.schoolId
      ? eq(userSchoolRoles.schoolId, caller.schoolId)
      : undefined;

  // Teachers can only see students + themselves; admins see everyone in school
  const roleFilter =
    caller.role === "teacher" && userId !== caller.userId
      ? eq(userSchoolRoles.role, "student")
      : undefined;

  // Check that the caller is allowed to see this user
  const visibleRole = await db.query.userSchoolRoles.findFirst({
    where: and(eq(userSchoolRoles.userId, userId), schoolFilter, roleFilter),
  });

  if (!visibleRole) {
    throw new AppError(404, "User not found");
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { passwordHash: false },
    with: {
      schoolRoles: {
        where: visibleRolesFilter(caller),
        with: { school: true },
      },
    },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return user;
}

interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
}

export async function updateUser(
  db: Database,
  caller: SessionData,
  userId: string,
  userSchoolRoleId: string,
  input: UpdateUserInput,
) {
  // Verify the user_school_role exists and caller has access
  const role = await db.query.userSchoolRoles.findFirst({
    where: eq(userSchoolRoles.id, userSchoolRoleId),
    with: { user: true },
  });

  if (!role || role.userId !== userId) {
    throw new AppError(404, "User not found");
  }

  // Non-superadmins can only update users in their school
  if (caller.role !== "superadmin") {
    if (!caller.schoolId) {
      throw new AppError(403, "No school context");
    }
    if (role.schoolId !== caller.schoolId) {
      throw new AppError(404, "User not found");
    }
  }

  // Caller must outrank the target (unless updating themselves)
  const isSelf = caller.userId === userId;
  if (!isSelf && ROLE_HIERARCHY[caller.role] <= ROLE_HIERARCHY[role.role]) {
    throw new AppError(403, "Cannot update a user with equal or higher role");
  }

  await db.transaction(async (tx) => {
    if (input.firstName !== undefined || input.lastName !== undefined) {
      await tx
        .update(userSchoolRoles)
        .set({
          ...(input.firstName !== undefined
            ? { firstName: input.firstName }
            : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        })
        .where(eq(userSchoolRoles.id, userSchoolRoleId));
    }

    if (input.email !== undefined || input.password !== undefined) {
      const userUpdates: Partial<{ email: string; passwordHash: string }> = {};
      if (input.email !== undefined)
        userUpdates.email = input.email.toLowerCase();
      if (input.password !== undefined)
        userUpdates.passwordHash = await hashPassword(input.password);

      try {
        await tx.update(users).set(userUpdates).where(eq(users.id, userId));
      } catch (err) {
        if (isUniqueViolation(err) && input.email !== undefined) {
          throw new AppError(409, "Email already in use");
        }
        throw err;
      }
    }
  });

  const updated = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { passwordHash: false },
    with: {
      schoolRoles: {
        where: visibleRolesFilter(caller),
        with: { school: true },
      },
    },
  });

  if (!updated) {
    throw new AppError(404, "User not found");
  }

  return updated;
}
