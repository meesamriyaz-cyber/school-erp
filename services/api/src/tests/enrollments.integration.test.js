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
import Section from "../models/Section.js";
import Enrollment from "../models/Enrollment.js";
import { createAccessToken } from "../utils/tokens.js";

let server, baseUrl, schoolA, schoolB, adminA, teacherA, adminB, yearA, yearB, classA, classB, sectionA, sectionB, studentA;
const tenantIds = [], userIds = [], studentIds = [], enrollmentIds = [];
const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(baseUrl + path, { ...options, headers: {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
  }});
  return { status: response.status, body: await response.json() };
};
const makeSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const doc = await Tenant.create({ name: `Enrollment Test ${label} ${suffix}`, slug: `enrollment-test-${label}-${suffix}`, status: "active" });
  tenantIds.push(doc._id); return doc;
};
const makeUser = async (tenant, role) => {
  const doc = await User.create({ tenantId: tenant._id, firstName: "Test", lastName: "User", email: `enrollment-test-${randomUUID()}@example.test`, passwordHash: "test-only", role, status: "active", authVersion: 0 });
  userIds.push(doc._id); return { token: createAccessToken(doc) };
};
const makeStudent = async (tenant, label = randomUUID().slice(0, 8)) => {
  const doc = await Student.create({ tenantId: tenant._id, admissionNumber: `ADM-${label}`, firstName: "Test", lastName: "Student", admissionDate: new Date("2026-04-01") });
  studentIds.push(doc._id); return doc;
};
const post = (path, token, body) => request(path, { token, method: "POST", body: JSON.stringify(body) });

describe("Student Enrollment API", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test" || !env.mongoUri) throw new Error("Safety stop: configure the test environment.");
    const match = env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/);
    if (!match || decodeURIComponent(match[1]) !== "school-erp-test") throw new Error("Safety stop: expected school-erp-test database.");
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== "school-erp-test") throw new Error("Safety stop: unexpected database.");
    await Promise.all([Tenant.init(), User.init(), Student.init(), AcademicYear.init(), SchoolClass.init(), Section.init(), Enrollment.init()]);
    schoolA = await makeSchool("a"); schoolB = await makeSchool("b");
    adminA = await makeUser(schoolA, "school_admin");
    teacherA = await makeUser(schoolA, "teacher");
    adminB = await makeUser(schoolB, "school_admin");
    yearA = await AcademicYear.create({ tenantId: schoolA._id, name: `AY-${randomUUID().slice(0, 8)}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    yearB = await AcademicYear.create({ tenantId: schoolB._id, name: `AY-${randomUUID().slice(0, 8)}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    classA = await SchoolClass.create({ tenantId: schoolA._id, academicYearId: yearA._id, name: "Class 1" });
    classB = await SchoolClass.create({ tenantId: schoolB._id, academicYearId: yearB._id, name: "Class 1" });
    sectionA = await Section.create({ tenantId: schoolA._id, classId: classA._id, name: "A" });
    sectionB = await Section.create({ tenantId: schoolB._id, classId: classB._id, name: "A" });
    studentA = await makeStudent(schoolA, "primary");
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (tenantIds.length) {
        await Enrollment.deleteMany({ tenantId: { $in: tenantIds } });
        await Section.deleteMany({ tenantId: { $in: tenantIds } });
        await SchoolClass.deleteMany({ tenantId: { $in: tenantIds } });
        await AcademicYear.deleteMany({ tenantId: { $in: tenantIds } });
        await Student.deleteMany({ _id: { $in: studentIds } });
        await User.deleteMany({ _id: { $in: userIds } });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  it("creates a placement and returns populated school-scoped enrollment history", async () => {
    const created = await post("/enrollments", adminA.token, {
      studentId: String(studentA._id), academicYearId: String(yearA._id),
      classId: String(classA._id), sectionId: String(sectionA._id),
    });
    expect(created.status).toBe(201);
    expect(String(created.body.data.tenantId)).toBe(String(schoolA._id));
    expect(created.body.data.status).toBe("active");
    expect(String(created.body.data.sectionId)).toBe(String(sectionA._id));
    enrollmentIds.push(created.body.data._id);

    const list = await request(`/enrollments?studentId=${studentA._id}`, { token: adminA.token });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].studentId.admissionNumber).toBe(studentA.admissionNumber);
    expect(list.body.data[0].classId.name).toBe("Class 1");
    expect((await request(`/enrollments/${created.body.data._id}`, { token: adminB.token })).status).toBe(404);
  });

  it("rejects invalid parent combinations, forged tenant IDs, and teacher writes", async () => {
    expect((await post("/enrollments", adminA.token, {
      studentId: String(studentA._id), academicYearId: String(yearA._id), classId: String(classB._id),
    })).status).toBe(400);
    expect((await post("/enrollments", adminA.token, {
      tenantId: String(schoolB._id), studentId: String(studentA._id), academicYearId: String(yearA._id), classId: String(classA._id),
    })).status).toBe(400);
    expect((await post("/enrollments", teacherA.token, {
      studentId: String(studentA._id), academicYearId: String(yearA._id), classId: String(classA._id),
    })).status).toBe(403);
    expect((await post("/enrollments", adminA.token, {
      studentId: String(studentA._id), academicYearId: String(yearA._id), classId: String(classA._id), sectionId: String(sectionB._id),
    })).status).toBe(400);
  });

  it("preserves a transfer record and permits a new active placement", async () => {
    const student = await makeStudent(schoolA, "transfer");
    const first = await post("/enrollments", adminA.token, {
      studentId: String(student._id), academicYearId: String(yearA._id), classId: String(classA._id), sectionId: String(sectionA._id),
    });
    expect(first.status).toBe(201);
    enrollmentIds.push(first.body.data._id);
    const ended = await request(`/enrollments/${first.body.data._id}`, {
      token: adminA.token, method: "PATCH", body: JSON.stringify({ status: "transferred" }),
    });
    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe("transferred");
    expect(ended.body.data.endedAt).toBeTruthy();

    const second = await post("/enrollments", adminA.token, {
      studentId: String(student._id), academicYearId: String(yearA._id), classId: String(classA._id),
    });
    expect(second.status).toBe(201);
    enrollmentIds.push(second.body.data._id);
    const history = await request(`/enrollments?studentId=${student._id}`, { token: adminA.token });
    expect(history.body.data.map((item) => item.status).sort()).toEqual(["active", "transferred"]);
  });

  it("prevents a second active enrollment for the same student", async () => {
    const student = await makeStudent(schoolA, "duplicate");
    const payload = { studentId: String(student._id), academicYearId: String(yearA._id), classId: String(classA._id) };
    const first = await post("/enrollments", adminA.token, payload);
    expect(first.status).toBe(201);
    enrollmentIds.push(first.body.data._id);
    const second = await post("/enrollments", adminA.token, payload);
    expect(second.status).toBe(409);
  });

  it("enforces section capacity for new enrollments and capacity reductions", async () => {
    const suffix = randomUUID().slice(0, 6);
    const section = await Section.create({
      tenantId: schoolA._id, classId: classA._id, name: `Capacity ${suffix}`, capacity: 2,
    });
    const students = [
      await makeStudent(schoolA, `capacity-a-${suffix}`),
      await makeStudent(schoolA, `capacity-b-${suffix}`),
      await makeStudent(schoolA, `capacity-c-${suffix}`),
    ];
    for (const student of students.slice(0, 2)) {
      const created = await post("/enrollments", adminA.token, {
        studentId: String(student._id), academicYearId: String(yearA._id),
        classId: String(classA._id), sectionId: String(section._id),
      });
      expect(created.status).toBe(201);
      enrollmentIds.push(created.body.data._id);
    }
    const overCapacity = await post("/enrollments", adminA.token, {
      studentId: String(students[2]._id), academicYearId: String(yearA._id),
      classId: String(classA._id), sectionId: String(section._id),
    });
    expect(overCapacity.status).toBe(409);
    expect(overCapacity.body.message).toMatch(/reached its capacity/i);

    const shrink = await request(`/sections/${section._id}`, {
      token: adminA.token, method: "PATCH", body: JSON.stringify({ capacity: 1 }),
    });
    expect(shrink.status).toBe(409);
    expect(shrink.body.message).toMatch(/cannot be lower than its active enrollment count/i);
  });

  it("prevents class or section deactivation while active placements use them", async () => {
    const suffix = randomUUID().slice(0, 6);
    const student = await makeStudent(schoolA, `guard-${suffix}`);
    const unsectionedClass = await SchoolClass.create({
      tenantId: schoolA._id, academicYearId: yearA._id, name: `Class guard ${suffix}`,
    });
    const classEnrollment = await post("/enrollments", adminA.token, {
      studentId: String(student._id), academicYearId: String(yearA._id), classId: String(unsectionedClass._id),
    });
    expect(classEnrollment.status).toBe(201);
    enrollmentIds.push(classEnrollment.body.data._id);
    expect((await request(`/classes/${unsectionedClass._id}`, {
      token: adminA.token, method: "PATCH", body: JSON.stringify({ status: "inactive" }),
    })).status).toBe(409);

    await request(`/enrollments/${classEnrollment.body.data._id}`, {
      token: adminA.token, method: "PATCH", body: JSON.stringify({ status: "completed" }),
    });
    expect((await request(`/classes/${unsectionedClass._id}`, {
      token: adminA.token, method: "PATCH", body: JSON.stringify({ status: "inactive" }),
    })).status).toBe(200);

    const section = await Section.create({ tenantId: schoolA._id, classId: classA._id, name: `Guard ${suffix}` });
    const sectionStudent = await makeStudent(schoolA, `secguard-${suffix}`);
    const sectionEnrollment = await post("/enrollments", adminA.token, {
      studentId: String(sectionStudent._id), academicYearId: String(yearA._id),
      classId: String(classA._id), sectionId: String(section._id),
    });
    expect(sectionEnrollment.status).toBe(201);
    enrollmentIds.push(sectionEnrollment.body.data._id);
    expect((await request(`/sections/${section._id}`, {
      token: adminA.token, method: "PATCH", body: JSON.stringify({ status: "inactive" }),
    })).status).toBe(409);
    await request(`/enrollments/${sectionEnrollment.body.data._id}`, {
      token: adminA.token, method: "PATCH", body: JSON.stringify({ status: "completed" }),
    });
    expect((await request(`/sections/${section._id}`, {
      token: adminA.token, method: "PATCH", body: JSON.stringify({ status: "inactive" }),
    })).status).toBe(200);
  });

  it("requires active enrollments to end before an academic year can close", async () => {
    const student = await makeStudent(schoolB, "year-close");
    const created = await post("/enrollments", adminB.token, {
      studentId: String(student._id), academicYearId: String(yearB._id), classId: String(classB._id),
    });
    expect(created.status).toBe(201);
    enrollmentIds.push(created.body.data._id);
    expect((await request(`/academic-years/${yearB._id}`, {
      token: adminB.token, method: "PATCH", body: JSON.stringify({ status: "closed" }),
    })).status).toBe(409);
    await request(`/enrollments/${created.body.data._id}`, {
      token: adminB.token, method: "PATCH", body: JSON.stringify({ status: "completed" }),
    });
    expect((await request(`/academic-years/${yearB._id}`, {
      token: adminB.token, method: "PATCH", body: JSON.stringify({ status: "closed" }),
    })).status).toBe(200);
  });


  it("records completed, transferred, and withdrawn transitions without losing history", async () => {
    for (const status of ["completed", "transferred", "withdrawn"]) {
      const student = await makeStudent(schoolA, `terminal-${status}`);
      const created = await post("/enrollments", adminA.token, {
        studentId: String(student._id),
        academicYearId: String(yearA._id),
        classId: String(classA._id),
      });
      expect(created.status).toBe(201);
      enrollmentIds.push(created.body.data._id);

      const ended = await request(`/enrollments/${created.body.data._id}`, {
        token: adminA.token,
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      expect(ended.status).toBe(200);
      expect(ended.body.data.status).toBe(status);
      expect(ended.body.data.endedAt).toBeTruthy();

      const history = await request(`/enrollments?studentId=${student._id}`, {
        token: adminA.token,
      });
      expect(history.status).toBe(200);
      expect(history.body.data).toHaveLength(1);
      expect(history.body.data[0].status).toBe(status);
      expect(history.body.data[0].endedAt).toBeTruthy();

      const newPlacement = await post("/enrollments", adminA.token, {
        studentId: String(student._id),
        academicYearId: String(yearA._id),
        classId: String(classA._id),
      });
      expect(newPlacement.status).toBe(201);
      enrollmentIds.push(newPlacement.body.data._id);

      const updatedHistory = await request(`/enrollments?studentId=${student._id}`, {
        token: adminA.token,
      });
      expect(updatedHistory.body.data.map((item) => item.status).sort()).toEqual([status, "active"].sort());
    }
  });
});
