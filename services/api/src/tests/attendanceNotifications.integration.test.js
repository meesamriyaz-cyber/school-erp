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
import Notification from "../models/Notification.js";
import { createAccessToken } from "../utils/tokens.js";

let server, baseUrl, school, admin, year, schoolClass, student, studentUser, enrollment;
const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(baseUrl + path, { ...options, headers: {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
  }});
  return { status: response.status, body: await response.json() };
};
const makeId = () => randomUUID().replaceAll("-", "").slice(0, 10);

describe("Attendance notification integration", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test" || !env.mongoUri) throw new Error("Safety stop: configure the test environment.");
    const uri = env.mongoUri.replace(/^mongodb(?:\\+srv)?:\\/\\//i, "");
    const slash = uri.indexOf("/");
    const databaseName = slash < 0 ? "" : decodeURIComponent(uri.slice(slash + 1).split("?")[0]);
    if (databaseName !== "school-erp-test") throw new Error("Safety stop: expected school-erp-test database.");
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== "school-erp-test") throw new Error("Safety stop: unexpected database.");
    await Promise.all([Tenant.init(), User.init(), Student.init(), AcademicYear.init(), SchoolClass.init(), Enrollment.init(), Attendance.init(), Notification.init()]);
    school = await Tenant.create({ name: `Attendance Notice ${makeId()}`, slug: `attendance-notice-${makeId()}`, status: "active" });
    const adminUser = await User.create({ tenantId: school._id, firstName: "Attendance", lastName: "Admin", email: `attendance-admin-${makeId()}@example.test`, passwordHash: "test-only", role: "school_admin", status: "active", authVersion: 0 });
    admin = { user: adminUser, token: createAccessToken(adminUser) };
    studentUser = await User.create({ tenantId: school._id, firstName: "Portal", lastName: "Student", email: `attendance-student-${makeId()}@example.test`, passwordHash: "test-only", role: "student", status: "active", authVersion: 0 });
    year = await AcademicYear.create({ tenantId: school._id, name: `AY-${makeId()}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    schoolClass = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class 5" });
    student = await Student.create({ tenantId: school._id, userId: studentUser._id, admissionNumber: `ATT-${makeId()}`, firstName: "Test Student", admissionDate: new Date("2026-04-01") });
    enrollment = await Enrollment.create({ tenantId: school._id, studentId: student._id, academicYearId: year._id, classId: schoolClass._id, status: "active" });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (school?._id && mongoose.connection.readyState === 1) {
      await Notification.deleteMany({ tenantId: school._id });
      await Attendance.deleteMany({ tenantId: school._id });
      await Enrollment.deleteMany({ tenantId: school._id });
      await Student.deleteMany({ tenantId: school._id });
      await SchoolClass.deleteMany({ tenantId: school._id });
      await AcademicYear.deleteMany({ tenantId: school._id });
      await User.deleteMany({ tenantId: school._id });
      await Tenant.deleteOne({ _id: school._id });
    }
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  }, 30000);

  it("notifies an eligible student on a new absence and does not duplicate a repeated save", async () => {
    const payload = {
      date: "2026-11-09", academicYearId: String(year._id), classId: String(schoolClass._id),
      records: [{ studentId: String(student._id), status: "absent" }],
    };
    const first = await request("/attendance", { method: "PUT", token: admin.token, body: JSON.stringify(payload) });
    expect(first.status).toBe(200);
    const notice = await Notification.findOne({
      tenantId: school._id, recipientUserId: studentUser._id, eventType: "attendance_absence",
    }).lean();
    expect(notice).toMatchObject({ recipientRole: "student", deliveryStatus: "pending", link: "/portal?tab=attendance" });
    expect(notice.eventKey).toBe(`attendance:${student._id}:2026-11-09:absent`);

    const repeated = await request("/attendance", { method: "PUT", token: admin.token, body: JSON.stringify(payload) });
    expect(repeated.status).toBe(200);
    expect(await Notification.countDocuments({
      tenantId: school._id, recipientUserId: studentUser._id, eventType: "attendance_absence",
    })).toBe(1);
  });
});
