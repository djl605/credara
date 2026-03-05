import { describe, it, expect, afterAll } from "vitest";
import { createTestApp } from "../helpers.js";

const app = createTestApp();

afterAll(async () => {
  await app.close();
});

describe("Health check", () => {
  it("GET /health returns ok", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
