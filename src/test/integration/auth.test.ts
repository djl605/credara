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

describe("Auth", () => {
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

  describe("POST /api/auth/login", () => {
    it("should login with valid credentials and single role", async () => {
      const school = await createTestSchool(app);
      await createTestUser(app, {
        email: "teacher@test.com",
        password: "password123",
        role: "teacher",
        schoolId: school.id,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "teacher@test.com", password: "password123" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.type).toBe("session_created");
      expect(body.userSchoolRoleId).toBeDefined();

      // Should set session cookie
      const cookies = res.cookies;
      const sessionCookie = cookies.find(
        (c: { name: string }) => c.name === "session",
      );
      expect(sessionCookie).toBeDefined();
    });

    it("should reject invalid email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nonexistent@test.com", password: "password123" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid email or password");
    });

    it("should reject invalid password", async () => {
      const school = await createTestSchool(app);
      await createTestUser(app, {
        email: "teacher@test.com",
        password: "password123",
        role: "teacher",
        schoolId: school.id,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "teacher@test.com", password: "wrongpassword" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("should return contexts when user has multiple roles", async () => {
      const school1 = await createTestSchool(app, "School A");
      const school2 = await createTestSchool(app, "School B");

      // Create user with one role
      const { user } = await createTestUser(app, {
        email: "multi@test.com",
        password: "password123",
        role: "teacher",
        schoolId: school1.id,
      });

      // Add another role at a different school
      await app.db.insert(userSchoolRoles).values({
        userId: user.id,
        schoolId: school2.id,
        role: "admin",
        firstName: "Multi",
        lastName: "User",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "multi@test.com", password: "password123" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.type).toBe("context_selection_required");
      expect(body.contexts).toHaveLength(2);
    });

    it("should login with specific context when multiple roles exist", async () => {
      const school1 = await createTestSchool(app, "School A");
      const school2 = await createTestSchool(app, "School B");

      const { user, userSchoolRole } = await createTestUser(app, {
        email: "multi@test.com",
        password: "password123",
        role: "teacher",
        schoolId: school1.id,
      });

      await app.db.insert(userSchoolRoles).values({
        userId: user.id,
        schoolId: school2.id,
        role: "admin",
        firstName: "Multi",
        lastName: "User",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "multi@test.com",
          password: "password123",
          userSchoolRoleId: userSchoolRole.id,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().type).toBe("session_created");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return current user when authenticated", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        email: "teacher@test.com",
        role: "teacher",
        firstName: "Jane",
        lastName: "Doe",
        schoolId: school.id,
      });

      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.email).toBe("teacher@test.com");
      expect(body.role).toBe("teacher");
      expect(body.firstName).toBe("Jane");
      expect(body.lastName).toBe("Doe");
      expect(body.schoolId).toBe(school.id);
    });

    it("should reject unauthenticated requests", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
      });

      expect(res.statusCode).toBe(401);
    });

    it("should reject invalid session cookie", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: "session=invalid-token" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should invalidate session on logout", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "teacher",
        schoolId: school.id,
      });

      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      // Logout
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie },
      });
      expect(logoutRes.statusCode).toBe(200);

      // Session should now be invalid
      const meRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie },
      });
      expect(meRes.statusCode).toBe(401);
    });
  });

  describe("Full login-to-me flow", () => {
    it("should use login cookie to access protected endpoints", async () => {
      const school = await createTestSchool(app);
      await createTestUser(app, {
        email: "teacher@test.com",
        password: "password123",
        role: "teacher",
        schoolId: school.id,
      });

      // Step 1: Login via endpoint
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "teacher@test.com", password: "password123" },
      });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json().type).toBe("session_created");

      // Step 2: Extract cookie from Set-Cookie header
      const setCookieHeader = loginRes.headers["set-cookie"];
      expect(setCookieHeader).toBeDefined();

      // Parse the cookie value from the Set-Cookie header
      const cookieString = Array.isArray(setCookieHeader)
        ? setCookieHeader[0]
        : setCookieHeader!;
      const cookieValue = cookieString.split(";")[0]; // "session=<token>"

      // Step 3: Use cookie to access /me
      const meRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: cookieValue },
      });

      expect(meRes.statusCode).toBe(200);
      expect(meRes.json().email).toBe("teacher@test.com");
    });
  });

  describe("Session persistence", () => {
    it("should maintain session across multiple requests", async () => {
      const school = await createTestSchool(app);
      const { user, userSchoolRole } = await createTestUser(app, {
        role: "teacher",
        schoolId: school.id,
      });

      const cookie = await loginAs(app, user.id, userSchoolRole.id);

      // Multiple requests with same session
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "GET",
          url: "/api/auth/me",
          headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
      }
    });
  });
});
