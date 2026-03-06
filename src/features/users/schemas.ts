import { z } from "zod/v4";

export const schoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const schoolRoleBase = {
  id: z.string(),
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  createdAt: z.date(),
};

export const schoolRoleSchema = z.discriminatedUnion("role", [
  z.object({
    ...schoolRoleBase,
    role: z.literal("superadmin"),
    school: z.null(),
  }),
  z.object({
    ...schoolRoleBase,
    role: z.literal("admin"),
    school: schoolSchema,
  }),
  z.object({
    ...schoolRoleBase,
    role: z.literal("teacher"),
    school: schoolSchema,
  }),
  z.object({
    ...schoolRoleBase,
    role: z.literal("student"),
    school: schoolSchema,
  }),
]);

export const userWithRolesSchema = z.object({
  id: z.string(),
  email: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  schoolRoles: z.array(schoolRoleSchema),
});
