import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url), override: false });

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Staff from "../models/Staff.js";
import Session from "../models/Session.js";
import { createAccessToken } from "../utils/tokens.js";

const EXPECTED_TEST_DATABASE = "school-erp-test";
let server, baseUrl, schoolA, schoolB, adminA, adminB, teacherA, accountantA;
const tenantIds = [], userIds = [];

const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  return { status: response.status, body: await response.json() };
};
const createSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenant = await Tenant.create({ name: `Staff Test School ${label} ${suffix}`, slug: `staff-test-${label}-${suffix}`, status: "active" });
  tenantIds.push(tenant._id); return tenant;
};
const createUser = async (tenant, role) => {
  const user = await User.create({ tenantId: tenant._id, firstName: "Staff", lastName: role, email: `staff-${role}-${randomUUID()}@example.test`, passwordHash: "test-hash", role, status: "active", authVersion: 0 });
  userIds.push(user._id); return { user, token: createAccessToken(user) };
};
const staffPayload = (overrides = {}) => ({
  firstName: "Amina", lastName: "Khan", employeeCode: `EMP-${randomUUID().slice(0, 8)}`,
  employeeType: "non_teaching", designation: "Office Assistant", department: "Administration",
  employmentType: "full_time", joiningDate: "2026-04-01", experienceYears: 2, ...overrides,
});

describe("Staff management API", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: run tests with NODE_ENV=test");
    const match = typeof env.mongoUri === "string" ? env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/) : null;
    if (!match || decodeURIComponent(match[1]) !== EXPECTED_TEST_DATABASE) throw new Error("Safety stop: MONGO_TEST_URI must target school-erp-test");
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) throw new Error("Safety stop: connected to unexpected database");
    await Promise.all([Tenant.init(), User.init(), Staff.init(), Session.init()]);
    schoolA = await createSchool("alpha"); schoolB = await createSchool("beta");
    adminA = await createUser(schoolA, "school_admin"); adminB = await createUser(schoolB, "school_admin");
    teacherA = await createUser(schoolA, "teacher"); accountantA = await createUser(schoolA, "accountant");
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (tenantIds.length) {
        await Staff.deleteMany({ tenantId: { $in: tenantIds } });
        await Session.deleteMany({ userId: { $in: userIds } });
        await User.deleteMany({ _id: { $in: userIds } });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  it("requires authentication and restricts staff management to school administrators and principals", async () => {
    expect((await request("/staff")).status).toBe(401);
    const teacherResponse = await request("/staff", { token: teacherA.token });
    expect(teacherResponse.status).toBe(403);
  });

  it("creates a non-teaching staff profile without requiring a login account", async () => {
    const payload = staffPayload();
    const response = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(payload) });
    expect(response.status).toBe(201);
    expect(response.body.data.employeeType).toBe("non_teaching");
    expect(response.body.data.userId).toBeNull();
    expect(response.body.data.employeeCode).toBe(payload.employeeCode);
  });

  it("requires teaching employees to link to an active teacher account", async () => {
    const missing = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(staffPayload({ employeeType: "teaching", designation: "Teacher" })) });
    expect(missing.status).toBe(400);
    const linked = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(staffPayload({ employeeType: "teaching", userId: String(teacherA.user._id), designation: "Science Teacher" })) });
    expect(linked.status).toBe(201);
    expect(linked.body.data.userId).toBe(String(teacherA.user._id));
  });

  it("prevents cross-school account links and cross-school record access", async () => {
    const invalidLink = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(staffPayload({ employeeType: "teaching", userId: String((await createUser(schoolB, "teacher")).user._id) })) });
    expect(invalidLink.status).toBe(400);
    const created = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(staffPayload()) });
    const foreignRead = await request(`/staff/${created.body.data.id}`, { token: adminB.token });
    expect(foreignRead.status).toBe(404);
  });

  it("rejects duplicate employee codes within the same school", async () => {
    const code = `DUP-${randomUUID().slice(0, 8)}`;
    const first = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(staffPayload({ employeeCode: code })) });
    const second = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(staffPayload({ employeeCode: code })) });
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it("filters staff by category and employment status", async () => {
    const response = await request("/staff?employeeType=non_teaching&status=active&page=1&limit=50", { token: adminA.token });
    expect(response.status).toBe(200);
    expect(response.body.data.every((record) => record.employeeType === "non_teaching" && record.employmentStatus === "active")).toBe(true);
  });

  it("suspends linked account sessions on staff suspension and retains a terminal separation record", async () => {
    const created = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(staffPayload({ userId: String(accountantA.user._id) })) });
    expect(created.status).toBe(201);
    const session = await Session.create({
      userId: accountantA.user._id, tenantId: schoolA._id, authVersion: 0,
      refreshTokenHash: `staff-test-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 3600000), absoluteExpiresAt: new Date(Date.now() + 7200000),
    });
    const suspended = await request(`/staff/${created.body.data.id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "suspended" }) });
    expect(suspended.status).toBe(200);
    const user = await User.findById(accountantA.user._id).lean();
    const updatedSession = await Session.findById(session._id).lean();
    expect(user.status).toBe("suspended");
    expect(user.authVersion).toBe(1);
    expect(updatedSession.revokedAt).toBeTruthy();
    const separated = await request(`/staff/${created.body.data.id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "separated", separationDate: "2026-11-08" }) });
    expect(separated.status).toBe(200);
    expect(separated.body.data.employmentStatus).toBe("separated");
    const reactivated = await request(`/staff/${created.body.data.id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "active" }) });
    expect(reactivated.status).toBe(409);
  });

  it("rejects unknown fields and invalid employment transitions", async () => {
    const bad = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify({ ...staffPayload(), tenantId: String(schoolB._id) }) });
    expect(bad.status).toBe(400);
    const created = await request("/staff", { method: "POST", token: adminA.token, body: JSON.stringify(staffPayload()) });
    const invalid = await request(`/staff/${created.body.data.id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "unknown" }) });
    expect(invalid.status).toBe(400);
  });
});
