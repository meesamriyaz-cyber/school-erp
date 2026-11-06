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
import Subject from "../models/Subject.js";
import Examination from "../models/Examination.js";
import ExamSubject from "../models/ExamSubject.js";
import { createAccessToken } from "../utils/tokens.js";

const EXPECTED_TEST_DATABASE = "school-erp-test";
let server, baseUrl, schoolA, schoolB, adminA, teacherA, adminB, yearA, classA, subjectA;
const tenantIds = [], userIds = [];

const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return { status: response.status, body: await response.json() };
};
const createSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenant = await Tenant.create({ name: `Exam Test ${label} ${suffix}`, slug: `exam-test-${label}-${suffix}`, status: "active" });
  tenantIds.push(tenant._id);
  return tenant;
};
const createUser = async (tenant, role) => {
  const user = await User.create({
    tenantId: tenant._id, firstName: "Exam", lastName: "Tester",
    email: `exam-${randomUUID()}@example.test`, passwordHash: "test-only-not-a-real-password-hash",
    role, status: "active", authVersion: 0,
  });
  userIds.push(user._id);
  return { user, token: createAccessToken(user) };
};

describe("Examination API integration", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: run tests with NODE_ENV=test");
    const match = typeof env.mongoUri === "string" ? env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/) : null;
    if (!match || decodeURIComponent(match[1]) !== EXPECTED_TEST_DATABASE) throw new Error(`Safety stop: expected ${EXPECTED_TEST_DATABASE}`);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
      await mongoose.disconnect();
      throw new Error(`Safety stop: connected to unexpected database ${mongoose.connection.name}`);
    }
    await Promise.all([Tenant.init(), User.init(), AcademicYear.init(), SchoolClass.init(), Section.init(), Subject.init(), Examination.init(), ExamSubject.init()]);
    schoolA = await createSchool("alpha");
    schoolB = await createSchool("beta");
    [adminA, teacherA, adminB] = await Promise.all([
      createUser(schoolA, "school_admin"), createUser(schoolA, "teacher"), createUser(schoolB, "school_admin"),
    ]);
    yearA = await AcademicYear.create({ tenantId: schoolA._id, name: `2026-27-${randomUUID().slice(0, 5)}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    classA = await SchoolClass.create({ tenantId: schoolA._id, academicYearId: yearA._id, name: "Class 5" });
    subjectA = await Subject.create({ tenantId: schoolA._id, name: `Mathematics ${randomUUID().slice(0, 5)}` });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (tenantIds.length) {
        await ExamSubject.deleteMany({ tenantId: { $in: tenantIds } });
        await Examination.deleteMany({ tenantId: { $in: tenantIds } });
        await Subject.deleteMany({ tenantId: { $in: tenantIds } });
        await Section.deleteMany({ tenantId: { $in: tenantIds } });
        await SchoolClass.deleteMany({ tenantId: { $in: tenantIds } });
        await AcademicYear.deleteMany({ tenantId: { $in: tenantIds } });
        await User.deleteMany({ _id: { $in: userIds } });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  const createPayload = () => ({
    academicYearId: String(yearA._id), classId: String(classA._id),
    name: `Mid Term ${randomUUID().slice(0, 6)}`,
    startDate: "2026-09-01", endDate: "2026-09-10",
  });

  it("requires authentication and limits exam creation to administrators", async () => {
    expect((await request("/examinations")).status).toBe(401);
    expect((await request("/examinations", { method: "POST", token: teacherA.token, body: JSON.stringify(createPayload()) })).status).toBe(403);
  });

  it("creates a tenant-scoped examination and rejects cross-school access", async () => {
    const created = await request("/examinations", { method: "POST", token: adminA.token, body: JSON.stringify(createPayload()) });
    expect(created.status).toBe(201);
    expect(String(created.body.data.tenantId)).toBe(String(schoolA._id));
    const hidden = await request(`/examinations/${created.body.data._id}`, { token: adminB.token });
    expect(hidden.status).toBe(404);
  });

  it("rejects invalid class/year relationships and client-controlled fields", async () => {
    const badScope = { ...createPayload(), academicYearId: String(new mongoose.Types.ObjectId()) };
    expect((await request("/examinations", { method: "POST", token: adminA.token, body: JSON.stringify(badScope) })).status).toBe(400);
    expect((await request("/examinations", { method: "POST", token: adminA.token, body: JSON.stringify({ ...createPayload(), tenantId: String(schoolB._id) }) })).status).toBe(400);
  });

  it("configures subjects, prevents duplicates, and requires subjects before scheduling", async () => {
    const created = await request("/examinations", { method: "POST", token: adminA.token, body: JSON.stringify(createPayload()) });
    const id = created.body.data._id;
    expect((await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "scheduled" }) })).status).toBe(409);
    const subjectPayload = { subjectId: String(subjectA._id), examDate: "2026-09-03", maxMarks: 100, passMarks: 35, durationMinutes: 180 };
    expect((await request(`/examinations/${id}/subjects`, { method: "POST", token: adminA.token, body: JSON.stringify(subjectPayload) })).status).toBe(201);
    expect((await request(`/examinations/${id}/subjects`, { method: "POST", token: adminA.token, body: JSON.stringify(subjectPayload) })).status).toBe(409);
    expect((await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "scheduled" }) })).status).toBe(200);
  });

  it("rejects invalid subject mark ranges and lifecycle skips", async () => {
    const created = await request("/examinations", { method: "POST", token: adminA.token, body: JSON.stringify(createPayload()) });
    const id = created.body.data._id;
    const invalidMarks = { subjectId: String(subjectA._id), examDate: "2026-09-03", maxMarks: 50, passMarks: 60 };
    expect((await request(`/examinations/${id}/subjects`, { method: "POST", token: adminA.token, body: JSON.stringify(invalidMarks) })).status).toBe(400);
    expect((await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "completed" }) })).status).toBe(409);
  });
});
