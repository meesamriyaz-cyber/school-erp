
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authenticate, requireActiveTenant } = vi.hoisted(() => ({
  authenticate: vi.fn((req, res, next) => next()),
  requireActiveTenant: vi.fn((req, res, next) => next()),
}));

vi.mock("../middleware/authenticate.js", () => ({
  default: authenticate,
}));

vi.mock("../middleware/requireActiveTenant.js", () => ({
  default: requireActiveTenant,
}));

import router from "../routes/schoolRoutes.js";

describe("school routes", () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = express();

    app.use((req, res, next) => {
      req.tenantId = "tenant-123";
      req.tenant = {
        name: "Test School",
        slug: "test-school",
        timezone: "Asia/Kolkata",
      };
      next();
    });

    app.use(router);

    server = app.listen(0);

    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it("returns the active school's context", async () => {
    const response = await fetch(`${baseUrl}/context`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: {
        tenantId: "tenant-123",
        school: {
          name: "Test School",
          slug: "test-school",
          timezone: "Asia/Kolkata",
        },
      },
    });

    expect(authenticate).toHaveBeenCalled();
    expect(requireActiveTenant).toHaveBeenCalled();
  });

  it("does not expose the context for an unrelated path", async () => {
    const response = await fetch(`${baseUrl}/unknown`);

    expect(response.status).toBe(404);
  });
});
