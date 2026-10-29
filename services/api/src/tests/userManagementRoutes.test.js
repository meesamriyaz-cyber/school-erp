import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { handlers } = vi.hoisted(() => ({
  handlers: {
    listUsers: vi.fn((_req, res) => res.status(200).json({ endpoint: "listUsers" })),
    createUser: vi.fn((_req, res) => res.status(201).json({ endpoint: "createUser" })),
    getUserDetails: vi.fn((_req, res) => res.status(200).json({ endpoint: "getUserDetails" })),
    updateUser: vi.fn((_req, res) => res.status(200).json({ endpoint: "updateUser" })),
    updateUserStatus: vi.fn((_req, res) => res.status(200).json({ endpoint: "updateUserStatus" })),
    updateUserRole: vi.fn((_req, res) => res.status(200).json({ endpoint: "updateUserRole" })),
    listAuditLogs: vi.fn((_req, res) => res.status(200).json({ endpoint: "listAuditLogs" })),
  },
}));

vi.mock("../middleware/requireTrustedOrigin.js", () => ({ default: (_req, _res, next) => next() }));
vi.mock("../middleware/requireActiveTenant.js", () => ({ default: (_req, _res, next) => next() }));
vi.mock("../middleware/authenticate.js", () => ({
  default: (req, res, next) => {
    const role = req.get("x-test-role");
    if (!role) return res.status(401).json({ success: false, message: "Authentication required" });
    req.auth = { userId: "test-user", tenantId: role === "platform_admin" ? null : "507f1f77bcf86cd799439011", role };
    return next();
  },
}));
vi.mock("../controllers/userManagementController.js", () => handlers);
vi.mock("../controllers/auditLogController.js", () => ({ listAuditLogs: handlers.listAuditLogs }));

import platformRoutes from "../routes/platformRoutes.js";
import schoolRoutes from "../routes/schoolRoutes.js";

describe("user-management route authorization", () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/platform", platformRoutes);
    app.use("/api/v1/school", schoolRoutes);
    server = app.listen(0);
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => vi.clearAllMocks());

  it("restricts platform user endpoints to platform admins", async () => {
    const response = await fetch(`${baseUrl}/platform/users`, { headers: { "x-test-role": "school_admin" } });
    expect(response.status).toBe(403);
    expect(handlers.listUsers).not.toHaveBeenCalled();
  });

  it("allows platform admins to reach platform user endpoints", async () => {
    const response = await fetch(`${baseUrl}/platform/users`, { headers: { "x-test-role": "platform_admin" } });
    expect(response.status).toBe(200);
    expect(handlers.listUsers).toHaveBeenCalledOnce();
  });

  it("restricts school user endpoints to school admins", async () => {
    const response = await fetch(`${baseUrl}/school/users`, { headers: { "x-test-role": "teacher" } });
    expect(response.status).toBe(403);
    expect(handlers.listUsers).not.toHaveBeenCalled();
  });

  it("allows school admins to reach school-scoped user endpoints", async () => {
    const response = await fetch(`${baseUrl}/school/users`, { headers: { "x-test-role": "school_admin" } });
    expect(response.status).toBe(200);
    expect(handlers.listUsers).toHaveBeenCalledOnce();
  });

  it("restricts platform audit logs to platform admins", async () => {
    const response = await fetch(`${baseUrl}/platform/audit-logs`, {
      headers: { "x-test-role": "school_admin" },
    });
    expect(response.status).toBe(403);
    expect(handlers.listAuditLogs).not.toHaveBeenCalled();
  });

  it("allows platform admins to access audit logs", async () => {
    const response = await fetch(`${baseUrl}/platform/audit-logs`, {
      headers: { "x-test-role": "platform_admin" },
    });
    expect(response.status).toBe(200);
    expect(handlers.listAuditLogs).toHaveBeenCalledOnce();
  });

  it("allows school admins to access the school audit-log route", async () => {
    const response = await fetch(`${baseUrl}/school/audit-logs`, {
      headers: { "x-test-role": "school_admin" },
    });
    expect(response.status).toBe(200);
    expect(handlers.listAuditLogs).toHaveBeenCalledOnce();
  });

  it("rejects teachers from the school audit-log route", async () => {
    const response = await fetch(`${baseUrl}/school/audit-logs`, {
      headers: { "x-test-role": "teacher" },
    });
    expect(response.status).toBe(403);
    expect(handlers.listAuditLogs).not.toHaveBeenCalled();
  });

  it("does not expose a school-level role-change route", async () => {
    const response = await fetch(`${baseUrl}/school/users/507f1f77bcf86cd799439011/role`, {
      method: "PATCH",
      headers: { "x-test-role": "school_admin", "content-type": "application/json" },
      body: JSON.stringify({ role: "principal" }),
    });
    expect(response.status).toBe(404);
    expect(handlers.updateUserRole).not.toHaveBeenCalled();
  });
});
