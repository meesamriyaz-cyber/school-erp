import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { listSchools, getSchoolDetails, updateSchoolStatus, createSchool } = vi.hoisted(() => ({
  listSchools: vi.fn((_req, res) => res.status(200).json({ endpoint: "listSchools" })),
  getSchoolDetails: vi.fn((_req, res) => res.status(200).json({ endpoint: "getSchoolDetails" })),
  updateSchoolStatus: vi.fn((_req, res) => res.status(200).json({ endpoint: "updateSchoolStatus" })),
  createSchool: vi.fn((_req, res) => res.status(201).json({ endpoint: "createSchool" })),
}));

vi.mock("../middleware/requireTrustedOrigin.js", () => ({
  default: (_req, _res, next) => next(),
}));

vi.mock("../middleware/authenticate.js", () => ({
  default: (req, res, next) => {
    const role = req.get("x-test-role");
    if (!role) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    req.auth = { userId: "test-user", tenantId: role === "platform_admin" ? null : "test-tenant", role };
    return next();
  },
}));

vi.mock("../controllers/platformController.js", () => ({
  listSchools,
  getSchoolDetails,
  updateSchoolStatus,
  createSchool,
}));

import platformRoutes from "../routes/platformRoutes.js";

describe("platform school-management route authorization", () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/platform", platformRoutes);
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
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const protectedRequests = [
    ["GET", "/schools", undefined, listSchools],
    ["GET", "/schools/507f1f77bcf86cd799439011", undefined, getSchoolDetails],
    ["PATCH", "/schools/507f1f77bcf86cd799439011/status", { status: "suspended" }, updateSchoolStatus],
    ["POST", "/schools", { school: {}, admin: {} }, createSchool],
  ];

  it.each(protectedRequests)(
    "%s %s denies a school administrator before reaching the controller",
    async (method, path, body, controller) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "x-test-role": "school_admin",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.success).toBe(false);
      expect(controller).not.toHaveBeenCalled();
    },
  );

  it.each(protectedRequests)(
    "%s %s allows platform administrators through to the controller",
    async (method, path, body, controller) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "x-test-role": "platform_admin",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      expect(response.status).toBe(method === "POST" ? 201 : 200);
      expect(controller).toHaveBeenCalledOnce();
    },
  );

  it("rejects requests without an authenticated role", async () => {
    const response = await fetch(`${baseUrl}/schools`);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.success).toBe(false);
    expect(listSchools).not.toHaveBeenCalled();
  });
});
