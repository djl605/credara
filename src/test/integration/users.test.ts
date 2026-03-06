import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanDatabase,
  createTestUser,
  createTestSchool,
  loginAs,
} from "../helpers.js";
import { userSchoolRoles } from "../../db/schema.js";

describe("Users", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  describe("POST /api/users", () => {
    it("superadmin can create admin", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "superadmin",
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "newadmin@test.com",
          password: "password123",
          firstName: "New",
          lastName: "Admin",
          role: "admin",
          schoolId: school.id,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.email).toBe("newadmin@test.com");
      expect(body.schoolRoles[0].role).toBe("admin");
      expect(body.schoolRoles[0].schoolId).toBe(school.id);
      expect(body.created).toBe(true);
    });

    it("superadmin can create another superadmin", async () => {
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "superadmin",
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "newsuper@test.com",
          password: "password123",
          firstName: "New",
          lastName: "Super",
          role: "superadmin",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.schoolRoles[0].role).toBe("superadmin");
      expect(body.schoolRoles[0].schoolId).toBeNull();
    });

    it("admin can create teacher", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "admin",
        schoolId: school.id,
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "newteacher@test.com",
          password: "password123",
          firstName: "New",
          lastName: "Teacher",
          role: "teacher",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.schoolRoles[0].role).toBe("teacher");
      expect(body.schoolRoles[0].schoolId).toBe(school.id);
    });

    it("admin can create another admin in their school", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "admin",
        schoolId: school.id,
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "newadmin@test.com",
          password: "password123",
          firstName: "New",
          lastName: "Admin",
          role: "admin",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().schoolRoles[0].role).toBe("admin");
    });

    it("teacher can create student", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "teacher",
        schoolId: school.id,
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "newstudent@test.com",
          password: "password123",
          firstName: "New",
          lastName: "Student",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.schoolRoles[0].role).toBe("student");
      expect(body.schoolRoles[0].schoolId).toBe(school.id);
    });

    it("student cannot create users", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "student",
        schoolId: school.id,
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "another@test.com",
          password: "password123",
          firstName: "Another",
          lastName: "Student",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns existing record if duplicate email+school+role", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "teacher",
        schoolId: school.id,
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const payload = {
        email: "student@test.com",
        password: "password123",
        firstName: "Test",
        lastName: "Student",
      };

      // Create first time
      const res1 = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload,
      });
      expect(res1.statusCode).toBe(201);

      // Create again — should return existing
      const res2 = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload,
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().created).toBe(false);
    });

    it("superadmin must provide schoolId for non-superadmin roles", async () => {
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "superadmin",
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "admin@test.com",
          password: "password123",
          firstName: "Admin",
          lastName: "User",
          role: "admin",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("teacher cannot create a teacher", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "teacher",
        schoolId: school.id,
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "another@test.com",
          password: "password123",
          firstName: "Another",
          lastName: "Teacher",
          role: "teacher",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("role defaults to student when not specified", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "admin",
        schoolId: school.id,
      });
      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "default@test.com",
          password: "password123",
          firstName: "Default",
          lastName: "Role",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().schoolRoles[0].role).toBe("student");
    });
  });

  describe("GET /api/users", () => {
    it("teacher sees students and themselves in their school", async () => {
      const school = await createTestSchool(app);
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          role: "teacher",
          schoolId: school.id,
        });

      // Create students in this school
      await createTestUser(app, {
        email: "s1@test.com",
        role: "student",
        schoolId: school.id,
      });
      await createTestUser(app, {
        email: "s2@test.com",
        role: "student",
        schoolId: school.id,
      });

      // Create user in another school — should not appear
      const otherSchool = await createTestSchool(app, "Other School");
      await createTestUser(app, {
        email: "s3@test.com",
        role: "student",
        schoolId: otherSchool.id,
      });

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Teacher sees 2 students + themselves = 3 users
      expect(body).toHaveLength(3);
      // Each entry should have user-centric shape
      expect(body[0]).toHaveProperty("id");
      expect(body[0]).toHaveProperty("email");
      expect(body[0]).toHaveProperty("schoolRoles");
      const allRoles = body.flatMap((u: { schoolRoles: { role: string }[] }) =>
        u.schoolRoles.map((r) => r.role),
      );
      expect(allRoles.filter((r: string) => r === "student")).toHaveLength(2);
      expect(allRoles.filter((r: string) => r === "teacher")).toHaveLength(1);
    });

    it("admin sees all users in their school", async () => {
      const school = await createTestSchool(app);
      const { user: admin, userSchoolRole: adminRole } = await createTestUser(
        app,
        { role: "admin", schoolId: school.id },
      );

      await createTestUser(app, {
        email: "t@test.com",
        role: "teacher",
        schoolId: school.id,
      });
      await createTestUser(app, {
        email: "s@test.com",
        role: "student",
        schoolId: school.id,
      });

      const cookie = await loginAs(app, admin.id, adminRole.id);
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Admin sees admin + teacher + student in their school
      expect(body.length).toBeGreaterThanOrEqual(3);
      // passwordHash must not be leaked
      expect(body[0].passwordHash).toBeUndefined();
    });

    it("unauthenticated request is rejected", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/users/:id", () => {
    it("should return user detail", async () => {
      const school = await createTestSchool(app);
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          role: "teacher",
          schoolId: school.id,
        });
      const { user: student } = await createTestUser(app, {
        email: "s@test.com",
        role: "student",
        firstName: "Alex",
        lastName: "Student",
        schoolId: school.id,
      });

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "GET",
        url: `/api/users/${student.id}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.email).toBe("s@test.com");
      expect(body.schoolRoles).toHaveLength(1);
      expect(body.schoolRoles[0].firstName).toBe("Alex");
    });

    it("cannot see user in different school", async () => {
      const school1 = await createTestSchool(app, "School A");
      const school2 = await createTestSchool(app, "School B");

      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          role: "teacher",
          schoolId: school1.id,
        });
      const { user: otherStudent } = await createTestUser(app, {
        email: "other@test.com",
        role: "student",
        schoolId: school2.id,
      });

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "GET",
        url: `/api/users/${otherStudent.id}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(404);
    });

    it("teacher can view their own profile", async () => {
      const school = await createTestSchool(app);
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          role: "teacher",
          firstName: "Jane",
          schoolId: school.id,
        });

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "GET",
        url: `/api/users/${teacher.id}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.email).toBe(teacher.email);
      expect(body.schoolRoles[0].firstName).toBe("Jane");
    });

    it("teacher only sees student roles, not other roles of the same user", async () => {
      const school = await createTestSchool(app);
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          role: "teacher",
          schoolId: school.id,
        });

      // Create a user who is both a student and an admin in the same school
      const { user: dualUser } = await createTestUser(app, {
        email: "dual@test.com",
        role: "student",
        schoolId: school.id,
      });
      // Add a second role to the same user directly
      await app.db.insert(userSchoolRoles).values({
        userId: dualUser.id,
        schoolId: school.id,
        role: "admin",
        firstName: "Dual",
        lastName: "User",
      });

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "GET",
        url: `/api/users/${dualUser.id}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Teacher should only see the student role, not the admin role
      expect(body.schoolRoles).toHaveLength(1);
      expect(body.schoolRoles[0].role).toBe("student");
    });

    it("teacher cannot see another teacher", async () => {
      const school = await createTestSchool(app);
      const { user: teacher1, userSchoolRole: teacher1Role } =
        await createTestUser(app, {
          email: "t1@test.com",
          role: "teacher",
          schoolId: school.id,
        });
      const { user: teacher2 } = await createTestUser(app, {
        email: "t2@test.com",
        role: "teacher",
        schoolId: school.id,
      });

      const cookie = await loginAs(app, teacher1.id, teacher1Role.id);
      const res = await app.inject({
        method: "GET",
        url: `/api/users/${teacher2.id}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/users/:id", () => {
    it("should update user name", async () => {
      const school = await createTestSchool(app);
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          role: "teacher",
          schoolId: school.id,
        });
      const { user: student, userSchoolRole: studentRole } =
        await createTestUser(app, {
          email: "s@test.com",
          role: "student",
          firstName: "Old",
          lastName: "Name",
          schoolId: school.id,
        });

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${student.id}`,
        headers: { cookie },
        payload: {
          userSchoolRoleId: studentRole.id,
          firstName: "New",
          lastName: "Name",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.schoolRoles[0].firstName).toBe("New");
      expect(body.schoolRoles[0].lastName).toBe("Name");
    });

    it("teacher cannot update another teacher", async () => {
      const school = await createTestSchool(app);
      const { user: teacher1, userSchoolRole: teacher1Role } =
        await createTestUser(app, {
          email: "t1@test.com",
          role: "teacher",
          schoolId: school.id,
        });
      const { user: teacher2, userSchoolRole: teacher2Role } =
        await createTestUser(app, {
          email: "t2@test.com",
          role: "teacher",
          schoolId: school.id,
        });

      const cookie = await loginAs(app, teacher1.id, teacher1Role.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${teacher2.id}`,
        headers: { cookie },
        payload: {
          userSchoolRoleId: teacher2Role.id,
          firstName: "Hacked",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("teacher can update their own name", async () => {
      const school = await createTestSchool(app);
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          role: "teacher",
          firstName: "Old",
          lastName: "Name",
          schoolId: school.id,
        });

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${teacher.id}`,
        headers: { cookie },
        payload: {
          userSchoolRoleId: teacherRole.id,
          firstName: "New",
          lastName: "Name",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().schoolRoles[0].firstName).toBe("New");
    });

    it("teacher cannot update an admin", async () => {
      const school = await createTestSchool(app);
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          email: "t@test.com",
          role: "teacher",
          schoolId: school.id,
        });
      const { user: admin, userSchoolRole: adminRole } = await createTestUser(
        app,
        {
          email: "a@test.com",
          role: "admin",
          schoolId: school.id,
        },
      );

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${admin.id}`,
        headers: { cookie },
        payload: {
          userSchoolRoleId: adminRole.id,
          firstName: "Hacked",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects duplicate email on update", async () => {
      const school = await createTestSchool(app);
      const { user: admin, userSchoolRole: adminRole } = await createTestUser(
        app,
        { role: "admin", schoolId: school.id },
      );
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          email: "teacher@test.com",
          role: "teacher",
          schoolId: school.id,
        });
      await createTestUser(app, {
        email: "taken@test.com",
        role: "teacher",
        schoolId: school.id,
      });

      const cookie = await loginAs(app, admin.id, adminRole.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${teacher.id}`,
        headers: { cookie },
        payload: {
          userSchoolRoleId: teacherRole.id,
          email: "taken@test.com",
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("Email already in use");
    });

    it("can update email and password", async () => {
      const school = await createTestSchool(app);
      const { user: admin, userSchoolRole: adminRole } = await createTestUser(
        app,
        { role: "admin", schoolId: school.id },
      );
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          email: "old@test.com",
          password: "oldpassword123",
          role: "teacher",
          schoolId: school.id,
        });

      const cookie = await loginAs(app, admin.id, adminRole.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${teacher.id}`,
        headers: { cookie },
        payload: {
          userSchoolRoleId: teacherRole.id,
          email: "new@test.com",
          password: "newpassword123",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().email).toBe("new@test.com");

      // Verify new credentials work by logging in
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "new@test.com", password: "newpassword123" },
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json().type).toBe("session_created");
    });

    it("rejects empty update", async () => {
      const school = await createTestSchool(app);
      const { user: teacher, userSchoolRole: teacherRole } =
        await createTestUser(app, {
          role: "teacher",
          schoolId: school.id,
        });
      const { userSchoolRole: studentRole } = await createTestUser(app, {
        email: "s@test.com",
        role: "student",
        schoolId: school.id,
      });

      const cookie = await loginAs(app, teacher.id, teacherRole.id);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/users/${studentRole.userId}`,
        headers: { cookie },
        payload: {
          userSchoolRoleId: studentRole.id,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
