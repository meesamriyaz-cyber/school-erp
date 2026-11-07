import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url), override: false });
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Subject from "../models/Subject.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import { createAccessToken } from "../utils/tokens.js";

const EXPECTED_TEST_DATABASE = "school-erp-test";
let server;
let baseUrl;
const tenantIds = [];
const userIds = [];
let schoolA;
let schoolB;
let adminA;
let teacherA;
let teacherB;
let adminB;
let yearA;
let classA;
let subjectA;

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
  const tenant = await Tenant.create({
    name: `Assignment Test School ${label} ${suffix}`,
    slug: `assignment-test-${label}-${suffix}`,
    status: "active",
  });
  tenantIds.push(tenant._id);
  return tenant;
};

const createUser = async (tenant, role) => {
  const user = await User.create({
    tenantId: tenant._id,
    firstName: "Assignment",
    lastName: "Tester",
    email: `assignment-${randomUUID()}@example.test`,
    passwordHash: "test-only-not-a-real-password-hash",
    role,
    status: "active",
    authVersion: 0,
  });
  userIds.push(user._id);
  return { user, token: createAccessToken(user) };
};

describe("Teacher assignment API integration", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: run tests with NODE_ENV=test");
    const match = typeof env.mongoUri === "string" ? env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/) : null;
    if (!match || decodeURIComponent(match[1]) !== EXPECTED_TEST_DATABASE) throw new Error(`Safety stop: expected ${EXPECTED_TEST_DATABASE}`);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
      await mongoose.disconnect();
      throw new Error(`Safety stop: connected to unexpected database ${mongoose.connection.name}`);
    }
    await Promise.all([Tenant.init(), User.init(), Subject.init(), AcademicYear.init(), SchoolClass.init(), TeacherAssignment.init()]);
    schoolA = await createSchool("alpha");
    schoolB = await createSchool("beta");
    [adminA, teacherA, teacherB, adminB] = await Promise.all([
      createUser(schoolA, "school_admin"),
      createUser(schoolA, "teacher"),
      createUser(schoolA, "teacher"),
      createUser(schoolB, "school_admin"),
    ]);
    yearA = await AcademicYear.create({
      tenantId: schoolA._id, name: `2026-27-${randomUUID().slice(0, 5)}`,
      startDate: "2026-04-01", endDate: "2027-03-31", status: "active",
    });
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
        await TeacherAssignment.deleteMany({ tenantId: { $in: tenantIds } });
        await Subject.deleteMany({ tenantId: { $in: tenantIds } });
        await SchoolClass.deleteMany({ tenantId: { $in: tenantIds } });
        await AcademicYear.deleteMany({ tenantId: { $in: tenantIds } });
        await User.deleteMany({ _id: { $in: userIds } });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  it("requires authentication", async () => {
    expect((await request("/teacher-assignments")).status).toBe(401);
  });

  it("creates a teacher assignment within the school", async () => {
    const response = await request("/teacher-assignments", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({
        teacherId: String(teacherA.user._id), subjectId: String(subjectA._id),
        academicYearId: String(yearA._id), classId: String(classA._id),
      }),
    });
    expect(response.status).toBe(201);
    expect(response.body.data.teacherId.email).toBe(teacherA.user.email);
    expect(String(response.body.data.tenantId)).toBe(String(schoolA._id));
  });

  it("rejects assigning a teacher from another school", async () => {
    const response = await request("/teacher-assignments", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({
        teacherId: String(adminB.user._id), subjectId: String(subjectA._id),
        academicYearId: String(yearA._id), classId: String(classA._id),
      }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a client-supplied tenant or assigning actor", async () => {
    const response = await request("/teacher-assignments", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({
        teacherId: String(teacherB.user._id), subjectId: String(subjectA._id),
        academicYearId: String(yearA._id), classId: String(classA._id),
        tenantId: String(schoolB._id),
      }),
    });
    expect(response.status).toBe(400);
  });

  it("prevents teachers from creating assignments", async () => {
    const response = await request("/teacher-assignments", {
      method: "POST", token: teacherA.token,
      body: JSON.stringify({
        teacherId: String(teacherA.user._id), subjectId: String(subjectA._id),
        academicYearId: String(yearA._id), classId: String(classA._id),
      }),
    });
    expect(response.status).toBe(403);
  });

  it("prevents cross-school reads and duplicate assignments", async () => {
    const payload = {
      teacherId: String(teacherB.user._id), subjectId: String(subjectA._id),
      academicYearId: String(yearA._id), classId: String(classA._id),
    };
    const created = await request("/teacher-assignments", { method: "POST", token: adminA.token, body: JSON.stringify(payload) });
    const duplicate = await request("/teacher-assignments", { method: "POST", token: adminA.token, body: JSON.stringify(payload) });
    const crossSchool = await request("/teacher-assignments", { token: adminB.token });
    expect(created.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(crossSchool.status).toBe(200);
    expect(crossSchool.body.data).toHaveLength(0);
  });
  it("limits teachers to their own assignment directory", async () => {
    const mine = await request("/teacher-assignments?status=active", { token: teacherA.token });
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThan(0);
    expect(mine.body.data.every((item) => String(item.teacherId._id) === String(teacherA.user._id))).toBe(true);
    const other = await request(`/teacher-assignments?teacherId=${teacherB.user._id}`, { token: teacherA.token });
    expect(other.status).toBe(403);
    const own = await request(`/teacher-assignments?teacherId=${teacherA.user._id}`, { token: teacherA.token });
    expect(own.status).toBe(200);
    expect(own.body.data.every((item) => String(item.teacherId._id) === String(teacherA.user._id))).toBe(true);
  });

});
