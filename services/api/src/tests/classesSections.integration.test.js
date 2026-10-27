import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url), override: false });
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import { createAccessToken } from "../utils/tokens.js";

let server, baseUrl, schoolA, schoolB, adminA, teacherA, adminB, yearA, yearB;
const tenantIds = [], userIds = [];
const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(baseUrl + path, { ...options, headers: {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
  }});
  return { status: response.status, body: await response.json() };
};
const makeSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const doc = await Tenant.create({ name: `Class Test ${label} ${suffix}`, slug: `class-test-${label}-${suffix}`, status: "active" });
  tenantIds.push(doc._id); return doc;
};
const makeUser = async (tenant, role) => {
  const doc = await User.create({ tenantId: tenant._id, firstName: "Test", lastName: "User", email: `class-test-${randomUUID()}@example.test`, passwordHash: "test-only", role, status: "active", authVersion: 0 });
  userIds.push(doc._id); return { token: createAccessToken(doc) };
};

describe("Classes and Sections API", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test" || !env.mongoUri) throw new Error("Safety stop: configure the test environment.");
    const match = env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/);
    if (!match || decodeURIComponent(match[1]) !== "school-erp-test") throw new Error("Safety stop: expected school-erp-test database.");
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== "school-erp-test") throw new Error("Safety stop: unexpected database.");
    await Promise.all([Tenant.init(), User.init(), AcademicYear.init(), SchoolClass.init(), Section.init()]);
    schoolA = await makeSchool("a"); schoolB = await makeSchool("b");
    adminA = await makeUser(schoolA, "school_admin");
    teacherA = await makeUser(schoolA, "teacher");
    adminB = await makeUser(schoolB, "school_admin");
    yearA = await AcademicYear.create({ tenantId: schoolA._id, name: `AY-${randomUUID().slice(0, 8)}`, startDate: "2026-04-01", endDate: "2027-03-31" });
    yearB = await AcademicYear.create({ tenantId: schoolB._id, name: `AY-${randomUUID().slice(0, 8)}`, startDate: "2026-04-01", endDate: "2027-03-31" });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);
  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (tenantIds.length) {
        await Section.deleteMany({ tenantId: { $in: tenantIds } });
        await SchoolClass.deleteMany({ tenantId: { $in: tenantIds } });
        await AcademicYear.deleteMany({ tenantId: { $in: tenantIds } });
        await User.deleteMany({ _id: { $in: userIds } });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  it("enforces role access and academic-year tenant ownership", async () => {
    expect((await request("/classes", { token: teacherA.token, method: "POST", body: JSON.stringify({ academicYearId: String(yearA._id), name: "Denied" }) })).status).toBe(403);
    expect((await request("/classes", { token: adminA.token, method: "POST", body: JSON.stringify({ academicYearId: String(yearB._id), name: "Wrong school" }) })).status).toBe(400);
    const result = await request("/classes", { token: adminA.token, method: "POST", body: JSON.stringify({ academicYearId: String(yearA._id), name: "Class 1" }) });
    expect(result.status).toBe(201);
    expect(String(result.body.data.tenantId)).toBe(String(schoolA._id));
  });

  it("creates sections and isolates class/section records by school", async () => {
    const classResult = await request("/classes", { token: adminA.token, method: "POST", body: JSON.stringify({ academicYearId: String(yearA._id), name: `Class ${randomUUID().slice(0, 6)}` }) });
    expect(classResult.status).toBe(201);
    const sectionResult = await request("/sections", { token: adminA.token, method: "POST", body: JSON.stringify({ classId: classResult.body.data._id, name: "A", capacity: 35 }) });
    expect(sectionResult.status).toBe(201);
    expect((await request(`/classes/${classResult.body.data._id}`, { token: adminB.token })).status).toBe(404);
    expect((await request(`/sections/${sectionResult.body.data._id}`, { token: adminB.token })).status).toBe(404);
  });

  it("rejects forged tenant IDs and invalid section capacity", async () => {
    expect((await request("/classes", { token: adminA.token, method: "POST", body: JSON.stringify({ tenantId: String(schoolB._id), academicYearId: String(yearA._id), name: "Forged" }) })).status).toBe(400);
    expect((await request("/sections", { token: adminA.token, method: "POST", body: JSON.stringify({ classId: new mongoose.Types.ObjectId().toString(), name: "Invalid", capacity: 0 }) })).status).toBe(400);
  });
});
