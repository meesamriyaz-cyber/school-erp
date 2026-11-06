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
import TimetableEntry from "../models/TimetableEntry.js";
import { createAccessToken } from "../utils/tokens.js";

const EXPECTED_TEST_DATABASE = "school-erp-test";
let server;
let baseUrl;
const tenantIds = [];
const userIds = [];
let schoolA, schoolB, adminA, adminB, teacherA, teacherB;
let yearA, classA, classB, subjectA, subjectB, assignmentA, assignmentB, assignmentOtherClass;

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
  const tenant = await Tenant.create({ name: `Timetable Test ${label} ${suffix}`, slug: `timetable-${label}-${suffix}`, status: "active" });
  tenantIds.push(tenant._id);
  return tenant;
};
const createUser = async (tenant, role) => {
  const user = await User.create({
    tenantId: tenant._id, firstName: "Timetable", lastName: "Tester",
    email: `timetable-${randomUUID()}@example.test`, passwordHash: "test-only-not-a-real-password-hash",
    role, status: "active", authVersion: 0,
  });
  userIds.push(user._id);
  return { user, token: createAccessToken(user) };
};
const entryPayload = (assignmentId, classId = classA._id, periodNumber = 1) => ({
  academicYearId: String(yearA._id), classId: String(classId), assignmentId: String(assignmentId),
  dayOfWeek: 1, periodNumber, startTime: "09:00", endTime: "09:45",
});

describe("Timetable API integration", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: run tests with NODE_ENV=test");
    const databaseName = typeof env.mongoUri === "string" ? env.mongoUri.split("/").at(-1)?.split("?")[0] : null;
    if (decodeURIComponent(databaseName || "") !== EXPECTED_TEST_DATABASE) throw new Error(`Safety stop: expected ${EXPECTED_TEST_DATABASE}`);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
      await mongoose.disconnect();
      throw new Error(`Safety stop: connected to unexpected database ${mongoose.connection.name}`);
    }
    await Promise.all([Tenant.init(), User.init(), Subject.init(), AcademicYear.init(), SchoolClass.init(), TeacherAssignment.init(), TimetableEntry.init()]);
    schoolA = await createSchool("alpha");
    schoolB = await createSchool("beta");
    [adminA, teacherA, teacherB, adminB] = await Promise.all([
      createUser(schoolA, "school_admin"), createUser(schoolA, "teacher"),
      createUser(schoolA, "teacher"), createUser(schoolB, "school_admin"),
    ]);
    yearA = await AcademicYear.create({
      tenantId: schoolA._id, name: `2026-27-${randomUUID().slice(0, 5)}`,
      startDate: "2026-04-01", endDate: "2027-03-31", status: "active",
    });
    [classA, classB] = await Promise.all([
      SchoolClass.create({ tenantId: schoolA._id, academicYearId: yearA._id, name: "Class 5" }),
      SchoolClass.create({ tenantId: schoolA._id, academicYearId: yearA._id, name: "Class 6" }),
    ]);
    [subjectA, subjectB] = await Promise.all([
      Subject.create({ tenantId: schoolA._id, name: `Maths ${randomUUID().slice(0, 5)}` }),
      Subject.create({ tenantId: schoolA._id, name: `Science ${randomUUID().slice(0, 5)}` }),
    ]);
    [assignmentA, assignmentB, assignmentOtherClass] = await Promise.all([
      TeacherAssignment.create({ tenantId: schoolA._id, teacherId: teacherA.user._id, subjectId: subjectA._id, academicYearId: yearA._id, classId: classA._id, assignedBy: adminA.user._id }),
      TeacherAssignment.create({ tenantId: schoolA._id, teacherId: teacherB.user._id, subjectId: subjectB._id, academicYearId: yearA._id, classId: classA._id, assignedBy: adminA.user._id }),
      TeacherAssignment.create({ tenantId: schoolA._id, teacherId: teacherA.user._id, subjectId: subjectB._id, academicYearId: yearA._id, classId: classB._id, assignedBy: adminA.user._id }),
    ]);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (tenantIds.length) {
        await TimetableEntry.deleteMany({ tenantId: { $in: tenantIds } });
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
    expect((await request("/timetable")).status).toBe(401);
  });

  it("creates a timetable entry using a valid teacher assignment", async () => {
    const response = await request("/timetable", { method: "POST", token: adminA.token, body: JSON.stringify(entryPayload(assignmentA._id)) });
    expect(response.status).toBe(201);
    expect(response.body.data.assignmentId.teacherId.email).toBe(teacherA.user.email);
    expect(response.body.data.dayOfWeek).toBe(1);
  });

  it("allows administrators to edit a timetable period without bypassing assignment scope", async () => {
    const listed = await request("/timetable", { token: adminA.token });
    const entry = listed.body.data.find((item) => String(item.assignmentId._id) === String(assignmentA._id));
    const updated = await request(`/timetable/${entry._id}`, {
      method: "PATCH", token: adminA.token,
      body: JSON.stringify({ dayOfWeek: 3, periodNumber: 2, startTime: "11:00", endTime: "11:45", room: "Lab 1" }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.dayOfWeek).toBe(3);
    expect(updated.body.data.periodNumber).toBe(2);
    expect(updated.body.data.room).toBe("Lab 1");

    const reassigned = await request(`/timetable/${entry._id}`, {
      method: "PATCH", token: adminA.token,
      body: JSON.stringify({ assignmentId: String(assignmentB._id) }),
    });
    expect(reassigned.status).toBe(200);
    expect(String(reassigned.body.data.assignmentId._id)).toBe(String(assignmentB._id));

    const restoredAssignment = await request(`/timetable/${entry._id}`, {
      method: "PATCH", token: adminA.token,
      body: JSON.stringify({ assignmentId: String(assignmentA._id) }),
    });
    expect(restoredAssignment.status).toBe(200);

    const invalidAssignment = await request(`/timetable/${entry._id}`, {
      method: "PATCH", token: adminA.token,
      body: JSON.stringify({ assignmentId: String(assignmentOtherClass._id) }),
    });
    expect(invalidAssignment.status).toBe(400);

    // Restore the original fixture so later collision tests remain independent.
    const restored = await request(`/timetable/${entry._id}`, {
      method: "PATCH", token: adminA.token,
      body: JSON.stringify({ dayOfWeek: 1, periodNumber: 1, startTime: "09:00", endTime: "09:45", room: "" }),
    });
    expect(restored.status).toBe(200);
  });

  it("rejects an edited timetable period that overlaps the teacher's other class", async () => {
    const created = await request("/timetable", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ ...entryPayload(assignmentOtherClass._id, classB._id, 3), dayOfWeek: 1, startTime: "09:15", endTime: "10:00" }),
    });
    expect(created.status).toBe(409);
  });

  it("limits teacher timetable reads to their own active assignments", async () => {
    const secondEntry = {
      ...entryPayload(assignmentB._id, classA._id, 1),
      dayOfWeek: 2,
      startTime: "10:00",
      endTime: "10:45",
    };
    const created = await request("/timetable", {
      method: "POST", token: adminA.token, body: JSON.stringify(secondEntry),
    });
    expect(created.status).toBe(201);

    const [teacherAView, teacherBView, adminView] = await Promise.all([
      request("/timetable", { token: teacherA.token }),
      request("/timetable", { token: teacherB.token }),
      request("/timetable", { token: adminA.token }),
    ]);
    expect(teacherAView.body.data).toHaveLength(1);
    expect(String(teacherAView.body.data[0].assignmentId._id)).toBe(String(assignmentA._id));
    expect(teacherBView.body.data).toHaveLength(1);
    expect(String(teacherBView.body.data[0].assignmentId._id)).toBe(String(assignmentB._id));
    expect(adminView.body.data).toHaveLength(2);
  });

  it("rejects a class period collision even when another teacher is assigned", async () => {
    const response = await request("/timetable", { method: "POST", token: adminA.token, body: JSON.stringify(entryPayload(assignmentB._id)) });
    expect(response.status).toBe(409);
  });

  it("rejects a teacher time overlap across different classes", async () => {
    const response = await request("/timetable", { method: "POST", token: adminA.token, body: JSON.stringify(entryPayload(assignmentOtherClass._id, classB._id, 2)) });
    expect(response.status).toBe(409);
  });

  it("rejects teachers from managing timetable and isolates school reads", async () => {
    const forbidden = await request("/timetable", { method: "POST", token: teacherA.token, body: JSON.stringify(entryPayload(assignmentA._id, classA._id, 3)) });
    const crossSchool = await request("/timetable", { token: adminB.token });
    expect(forbidden.status).toBe(403);
    expect(crossSchool.status).toBe(200);
    expect(crossSchool.body.data).toHaveLength(0);
  });

  it("rejects invalid times and client-supplied school scope", async () => {
    const invalidTime = await request("/timetable", { method: "POST", token: adminA.token, body: JSON.stringify({ ...entryPayload(assignmentA._id, classA._id, 3), startTime: "10:00", endTime: "09:00" }) });
    const spoofedTenant = await request("/timetable", { method: "POST", token: adminA.token, body: JSON.stringify({ ...entryPayload(assignmentA._id, classA._id, 3), tenantId: String(schoolB._id) }) });
    expect(invalidTime.status).toBe(400);
    expect(spoofedTenant.status).toBe(400);
  });
});
