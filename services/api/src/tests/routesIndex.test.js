
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { getDatabaseStatus } = vi.hoisted(() => ({
  getDatabaseStatus: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  getDatabaseStatus,
}));

vi.mock("../routes/authRoutes.js", () => ({
  default: express.Router(),
}));

vi.mock("../routes/platformRoutes.js", () => ({
  default: express.Router(),
}));

vi.mock("../routes/schoolRoutes.js", () => ({
  default: express.Router(),
}));

vi.mock("../routes/studentRoutes.js", () => ({
  default: express.Router(),
}));

import router from "../routes/index.js";

describe("API route index", () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = express();
    app.use(router);

    server = app.listen(0);

    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
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

  it("responds successfully to the health endpoint", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.message).toBe("School ERP API is running");
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  it("reports ready when the database is connected", async () => {
    getDatabaseStatus.mockReturnValue("connected");

    const response = await fetch(`${baseUrl}/health/ready`);
    const payload = await response.json();

    expect(getDatabaseStatus).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      status: "ready",
      database: "connected",
    });
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  it.each(["disconnected", "connecting", "disconnecting", "unknown"])(
    "reports not ready when the database is %s",
    async (databaseStatus) => {
      getDatabaseStatus.mockReturnValue(databaseStatus);

      const response = await fetch(`${baseUrl}/health/ready`);
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload).toMatchObject({
        success: false,
        status: "not_ready",
        database: databaseStatus,
      });
    },
  );

  it.each(["/auth", "/platform", "/school", "/students"])(
    "mounts the %s route group",
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`);

      // The mocked routers contain no endpoints, so Express should return 404.
      expect(response.status).toBe(404);
    },
  );
});
