import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url), override: false });
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Enrollment from "../models/Enrollment.js";
import Attendance from "../models/Attendance.js";
import Staff from "../models/Staff.js";
import { createAccessToken } from "../utils/tokens.js";

const TEST_DB = "school-erp-test";
let server, baseUrl, school, otherSchool, admin, otherAdmin, year, student, enrollment;
const tenantIds = [], userIds = [];
const request = async (path, token) => {
  const response = await fetch(baseUrl + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: response.status, body: await response.json() };
};
const createSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const tenant = await Tenant.create({ name: `Dashboard ${label} ${suffix}`, slug: `dashboard-${label}-${suffix}`, status: "active" });
  tenantIds.push(tenant._id);
  return tenant;
};
const createAdmin = async (tenant) => {
  const user = await User.create({ tenantId: tenant._id, firstName: "Dashboard", lastName: "Admin", email: `dashboard-${randomUUID()}@example.test`, passwordHash: "test-only", role: "school_admin", status: "active", authVersion: 0 });
  userIds.push(user._id);
  return { user, token: createAccessToken(user) };
};

describe("Institutional dashboard analytics API", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: NODE_ENV=test is required");
    const match = typeof env.mongoUri === "string" ? env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/) : null;
    if (!match || decodeURIComponent(match[1]) !== TEST_DB) throw new Error(`Safety stop: expected ${TEST_DB}`);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== TEST_DB) throw new Error("Safety stop: unexpected test database");
    await Promise.all([Tenant.init(), User.init(), Student.init(), AcademicYear.init(), SchoolClass.init(), Enrollment.init(), Attendance.init(), Staff.init()]);
    school = await createSchool("A");
    otherSchool = await createSchool("B");
    admin = await createAdmin(school);
    otherAdmin = await createAdmin(otherSchool);
    year = await AcademicYear.create({ tenantId: school._id, name: `AY-${randomUUID().slice(0, 7)}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    student = await Student.create({ tenantId: school._id, admissionNumber: `DASH-${randomUUID().slice(0, 7)}`, firstName: "Amina", admissionDate: "2026-04-01" });
    enrollment = await Enrollment.create({ tenantId: school._id, studentId: student._id, academicYearId: year._id, classId: (await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class 5" }))._id, enrollmentDate: "2026-04-01", status: "active" });
    await Staff.create({ tenantId: school._id, firstName: "Teacher", lastName: "One", employeeType: "teaching", designation: "Teacher", employmentType: "full_time", joiningDate: "2026-04-01", employmentStatus: "active" });
    const today = new Date();
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    await Attendance.create({ tenantId: school._id, studentId: student._id, enrollmentId: enrollment._id, academicYearId: year._id, classId: enrollment.classId, date, status: "present", markedBy: admin.user._id });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      await Attendance.deleteMany({ tenantId: { $in: tenantIds } });
      await Staff.deleteMany({ tenantId: { $in: tenantIds } });
      await Enrollment.deleteMany({ tenantId: { $in: tenantIds } });
      await Student.deleteMany({ tenantId: { $in: tenantIds } });
      await SchoolClass.deleteMany({ tenantId: { $in: tenantIds } });
      await AcademicYear.deleteMany({ tenantId: { $in: tenantIds } });
      await User.deleteMany({ _id: { $in: userIds } });
      await Tenant.deleteMany({ _id: { $in: tenantIds } });
      await mongoose.disconnect();
    }
  }, 30000);

  it("returns tenant-scoped live indicators for the selected academic year", async () => {
    const response = await request(`/reports/dashboard?academicYearId=${year._id}`, admin.token);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      academicYear: { id: String(year._id), name: year.name },
      students: { total: 1, active: 1 },
      enrollments: { active: 1, total: 1 },
      staff: { totalActive: 1, teaching: 1, nonTeaching: 0 },
      attendance: { today: { present: 1, attended: 1, marked: 1, percentage: 100 } },
    });
    expect(response.body.data.attendance.trend).toHaveLength(1);
  });

  it("does not disclose another school's dashboard and rejects invalid year filters", async () => {
    const hidden = await request(`/reports/dashboard?academicYearId=${year._id}`, otherAdmin.token);
    expect(hidden.status).toBe(404);
    expect((await request("/reports/dashboard?academicYearId=invalid", admin.token)).status).toBe(400);
  });

  it("requires authentication and excludes users without school-admin permissions", async () => {
    expect((await request("/reports/dashboard")).status).toBe(401);
    const teacher = await User.create({ tenantId: school._id, firstName: "Teacher", lastName: "User", email: `teacher-${randomUUID()}@example.test`, passwordHash: "test-only", role: "teacher", status: "active", authVersion: 0 });
    userIds.push(teacher._id);
    expect((await request("/reports/dashboard", createAccessToken(teacher))).status).toBe(403);
  });
});
