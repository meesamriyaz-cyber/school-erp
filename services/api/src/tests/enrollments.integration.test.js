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
import Attendance from "../models/Attendance.js";
import Subject from "../models/Subject.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
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
  userIds.push(doc._id); return { user: doc, token: createAccessToken(doc) };
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
    await Promise.all([Tenant.init(), User.init(), Student.init(), AcademicYear.init(), SchoolClass.init(), Section.init(), Enrollment.init(), Attendance.init(), Subject.init(), TeacherAssignment.init()]);
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
        await Attendance.deleteMany({ tenantId: { $in: tenantIds } });
        await TeacherAssignment.deleteMany({ tenantId: { $in: tenantIds } });
        await Subject.deleteMany({ tenantId: { $in: tenantIds } });
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

  it("rejects enrollment dates outside the selected academic year", async () => {
    const student = await makeStudent(schoolA, "date-range");
    const base = {
      studentId: String(student._id),
      academicYearId: String(yearA._id),
      classId: String(classA._id),
    };

    const beforeYear = await post("/enrollments", adminA.token, {
      ...base,
      enrollmentDate: "2026-03-31",
    });
    expect(beforeYear.status).toBe(400);
    expect(beforeYear.body.message).toMatch(/within the selected academic year/i);

    const afterYear = await post("/enrollments", adminA.token, {
      ...base,
      enrollmentDate: "2027-04-01",
    });
    expect(afterYear.status).toBe(400);
    expect(afterYear.body.message).toMatch(/within the selected academic year/i);

    const firstDay = await post("/enrollments", adminA.token, {
      ...base,
      enrollmentDate: "2026-04-01",
    });
    expect(firstDay.status).toBe(201);
    enrollmentIds.push(firstDay.body.data._id);
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

    await Student.updateOne({ _id: student._id, tenantId: schoolA._id }, { $set: { status: "active" } });
    const second = await post("/enrollments", adminA.token, {
      studentId: String(student._id), academicYearId: String(yearA._id), classId: String(classA._id),
      reAdmissionReason: "Returning after an external transfer",
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
  }, 15000);

  it("does not exceed section capacity when enrollment requests arrive concurrently", async () => {
    const suffix = randomUUID().slice(0, 6);
    const section = await Section.create({
      tenantId: schoolA._id,
      classId: classA._id,
      name: `Concurrent ${suffix}`,
      capacity: 1,
    });
    const students = [
      await makeStudent(schoolA, `concurrent-a-${suffix}`),
      await makeStudent(schoolA, `concurrent-b-${suffix}`),
    ];

    const results = await Promise.all(students.map((student) => post("/enrollments", adminA.token, {
      studentId: String(student._id),
      academicYearId: String(yearA._id),
      classId: String(classA._id),
      sectionId: String(section._id),
    })));

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const activeCount = await Enrollment.countDocuments({
      tenantId: schoolA._id,
      sectionId: section._id,
      status: "active",
    });
    expect(activeCount).toBe(1);
    const created = results.find((result) => result.status === 201);
    enrollmentIds.push(created.body.data._id);
  }, 20000);

  it("keeps section capacity valid when a capacity reduction races with enrollment creation", async () => {
    const suffix = randomUUID().slice(0, 6);
    const section = await Section.create({
      tenantId: schoolA._id,
      classId: classA._id,
      name: `Capacity race ${suffix}`,
      capacity: 2,
    });
    const students = [
      await makeStudent(schoolA, `caprace-a-${suffix}`),
      await makeStudent(schoolA, `caprace-b-${suffix}`),
    ];
    const first = await post("/enrollments", adminA.token, {
      studentId: String(students[0]._id),
      academicYearId: String(yearA._id),
      classId: String(classA._id),
      sectionId: String(section._id),
    });
    expect(first.status).toBe(201);
    enrollmentIds.push(first.body.data._id);

    const [capacityUpdate, secondEnrollment] = await Promise.all([
      request(`/sections/${section._id}`, {
        token: adminA.token,
        method: "PATCH",
        body: JSON.stringify({ capacity: 1 }),
      }),
      post("/enrollments", adminA.token, {
        studentId: String(students[1]._id),
        academicYearId: String(yearA._id),
        classId: String(classA._id),
        sectionId: String(section._id),
      }),
    ]);

    expect(
      (capacityUpdate.status === 200 && secondEnrollment.status === 409) ||
      (capacityUpdate.status === 409 && secondEnrollment.status === 201)
    ).toBe(true);
    if (secondEnrollment.status === 201) enrollmentIds.push(secondEnrollment.body.data._id);

    const [finalSection, activeCount] = await Promise.all([
      Section.findOne({ _id: section._id, tenantId: schoolA._id }).lean(),
      Enrollment.countDocuments({
        tenantId: schoolA._id,
        sectionId: section._id,
        status: "active",
      }),
    ]);
    expect(finalSection.capacity).not.toBeNull();
    expect(activeCount).toBeLessThanOrEqual(finalSection.capacity);
  }, 20000);

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
  }, 20000);

  it("keeps academic-year closure consistent when closure races with enrollment creation", async () => {
    const raceSchool = await makeSchool("year-race");
    const raceAdmin = await makeUser(raceSchool, "school_admin");
    const raceYear = await AcademicYear.create({
      tenantId: raceSchool._id,
      name: `AY-race-${randomUUID().slice(0, 6)}`,
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      status: "active",
    });
    const raceClass = await SchoolClass.create({
      tenantId: raceSchool._id,
      academicYearId: raceYear._id,
      name: "Race Class",
    });
    const student = await makeStudent(raceSchool, `year-race-${randomUUID().slice(0, 6)}`);

    const [closure, enrollment] = await Promise.all([
      request(`/academic-years/${raceYear._id}`, {
        token: raceAdmin.token,
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      }),
      post("/enrollments", raceAdmin.token, {
        studentId: String(student._id),
        academicYearId: String(raceYear._id),
        classId: String(raceClass._id),
      }),
    ]);

    expect(
      (closure.status === 200 && enrollment.status === 400) ||
      (closure.status === 409 && enrollment.status === 201)
    ).toBe(true);
    if (enrollment.status === 201) enrollmentIds.push(enrollment.body.data._id);

    const [finalYear, activeCount] = await Promise.all([
      AcademicYear.findOne({ _id: raceYear._id, tenantId: raceSchool._id }).lean(),
      Enrollment.countDocuments({
        tenantId: raceSchool._id,
        academicYearId: raceYear._id,
        status: "active",
      }),
    ]);
    if (finalYear.status === "closed") {
      expect(activeCount).toBe(0);
    } else {
      expect(finalYear.status).toBe("active");
      expect(activeCount).toBe(1);
    }
  }, 20000);

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
  }, 20000);


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

      if (status === "transferred" || status === "withdrawn") {
        await Student.updateOne({ _id: student._id, tenantId: schoolA._id }, { $set: { status: "active" } });
      }
      const newPlacement = await post("/enrollments", adminA.token, {
        studentId: String(student._id),
        academicYearId: String(yearA._id),
        classId: String(classA._id),
        ...(["transferred", "withdrawn"].includes(status) ? { reAdmissionReason: "Approved return to school" } : {}),
      });
      expect(newPlacement.status).toBe(201);
      enrollmentIds.push(newPlacement.body.data._id);

      const updatedHistory = await request(`/enrollments?studentId=${student._id}`, {
        token: adminA.token,
      });
      expect(updatedHistory.body.data.map((item) => item.status).sort()).toEqual([status, "active"].sort());
    }
  }, 60000);

  it("previews and atomically rolls students into the next academic year", async () => {
    const school = await makeSchool("rollover");
    const admin = await makeUser(school, "school_admin");
    const sourceYear = await AcademicYear.create({
      tenantId: school._id, name: `AY-source-${randomUUID().slice(0, 6)}`,
      startDate: "2026-04-01", endDate: "2027-03-31", status: "active",
    });
    const targetYear = await AcademicYear.create({
      tenantId: school._id, name: `AY-target-${randomUUID().slice(0, 6)}`,
      startDate: "2027-04-01", endDate: "2028-03-31", status: "draft",
    });
    const sourceClass = await SchoolClass.create({ tenantId: school._id, academicYearId: sourceYear._id, name: "Class 4", sortOrder: 4 });
    const targetClass = await SchoolClass.create({ tenantId: school._id, academicYearId: targetYear._id, name: "Class 5", sortOrder: 5 });
    const targetSection = await Section.create({ tenantId: school._id, classId: targetClass._id, name: "A", capacity: 2 });
    const cases = [];
    for (const outcome of ["promote", "retain", "transfer", "withdraw"]) {
      const student = await makeStudent(school, `roll-${outcome}-${randomUUID().slice(0, 5)}`);
      const created = await post("/enrollments", admin.token, {
        studentId: String(student._id), academicYearId: String(sourceYear._id), classId: String(sourceClass._id),
      });
      expect(created.status).toBe(201);
      enrollmentIds.push(created.body.data._id);
      cases.push({ student, enrollmentId: created.body.data._id, outcome });
    }

    const preview = await request(`/enrollments/promotion-preview?sourceAcademicYearId=${sourceYear._id}&targetAcademicYearId=${targetYear._id}`, { token: admin.token });
    expect(preview.status).toBe(200);
    expect(preview.body.data.eligibleCount).toBe(4);
    expect(preview.body.data.targetClasses.some((item) => String(item._id) === String(targetClass._id))).toBe(true);
    expect(preview.body.data.targetSections.some((item) => String(item._id) === String(targetSection._id))).toBe(true);

    const placements = cases.map((item) => ({
      enrollmentId: item.enrollmentId, outcome: item.outcome,
      ...( ["promote", "retain"].includes(item.outcome) ? { classId: String(targetClass._id), sectionId: String(targetSection._id) } : {}),
    }));
    const incomplete = await request("/enrollments/rollover", {
      token: admin.token, method: "POST",
      body: JSON.stringify({ sourceAcademicYearId: String(sourceYear._id), targetAcademicYearId: String(targetYear._id), placements: placements.slice(0, 3) }),
    });
    expect(incomplete.status).toBe(400);
    expect((await AcademicYear.findById(sourceYear._id).lean()).status).toBe("active");

    const completed = await request("/enrollments/rollover", {
      token: admin.token, method: "POST",
      body: JSON.stringify({ sourceAcademicYearId: String(sourceYear._id), targetAcademicYearId: String(targetYear._id), placements }),
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ processed: 4, promoted: 1, retained: 1, transferred: 1, withdrawn: 1 });
    expect((await AcademicYear.findById(sourceYear._id).lean()).status).toBe("closed");
    expect((await AcademicYear.findById(targetYear._id).lean()).status).toBe("active");
    expect(await Enrollment.countDocuments({ tenantId: school._id, academicYearId: targetYear._id, status: "active" })).toBe(2);
    const history = await Enrollment.find({ tenantId: school._id, studentId: { $in: cases.map((item) => item.student._id) } }).lean();
    expect(history.filter((item) => item.academicYearId.equals(sourceYear._id) && item.status === "completed")).toHaveLength(2);
    expect(history.filter((item) => item.academicYearId.equals(sourceYear._id) && item.status === "transferred")).toHaveLength(1);
    expect(history.filter((item) => item.academicYearId.equals(sourceYear._id) && item.status === "withdrawn")).toHaveLength(1);
    expect(history.filter((item) => item.academicYearId.equals(targetYear._id) && item.status === "active")).toHaveLength(2);
    expect((await Student.findById(cases.find((item) => item.outcome === "transfer").student._id).lean()).status).toBe("inactive");
    expect((await Student.findById(cases.find((item) => item.outcome === "withdraw").student._id).lean()).status).toBe("withdrawn");
  }, 60000);

  it("rejects rollover when target section capacity is insufficient without changing either year", async () => {
    const school = await makeSchool("rollover-capacity");
    const admin = await makeUser(school, "school_admin");
    const sourceYear = await AcademicYear.create({
      tenantId: school._id, name: `AY-src-${randomUUID().slice(0, 6)}`,
      startDate: "2026-04-01", endDate: "2027-03-31", status: "active",
    });
    const targetYear = await AcademicYear.create({
      tenantId: school._id, name: `AY-dst-${randomUUID().slice(0, 6)}`,
      startDate: "2027-04-01", endDate: "2028-03-31", status: "draft",
    });
    const sourceClass = await SchoolClass.create({ tenantId: school._id, academicYearId: sourceYear._id, name: "Class 1" });
    const targetClass = await SchoolClass.create({ tenantId: school._id, academicYearId: targetYear._id, name: "Class 2" });
    const section = await Section.create({ tenantId: school._id, classId: targetClass._id, name: "A", capacity: 1 });
    const students = [await makeStudent(school, `cap1-${randomUUID().slice(0, 5)}`), await makeStudent(school, `cap2-${randomUUID().slice(0, 5)}`)];
    const placements = [];
    for (const student of students) {
      const created = await post("/enrollments", admin.token, { studentId: String(student._id), academicYearId: String(sourceYear._id), classId: String(sourceClass._id) });
      expect(created.status).toBe(201);
      enrollmentIds.push(created.body.data._id);
      placements.push({ enrollmentId: created.body.data._id, outcome: "promote", classId: String(targetClass._id), sectionId: String(section._id) });
    }
    const response = await request("/enrollments/rollover", {
      token: admin.token, method: "POST",
      body: JSON.stringify({ sourceAcademicYearId: String(sourceYear._id), targetAcademicYearId: String(targetYear._id), placements }),
    });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/capacity/i);
    expect((await AcademicYear.findById(sourceYear._id).lean()).status).toBe("active");
    expect((await AcademicYear.findById(targetYear._id).lean()).status).toBe("draft");
    expect(await Enrollment.countDocuments({ tenantId: school._id, academicYearId: sourceYear._id, status: "active" })).toBe(2);
    expect(await Enrollment.countDocuments({ tenantId: school._id, academicYearId: targetYear._id })).toBe(0);
  }, 30000);


  it("validates the complete date range when only one academic-year boundary is patched", async () => {
    const year = await AcademicYear.create({
      tenantId: schoolA._id,
      name: `AY-partial-${randomUUID().slice(0, 6)}`,
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      status: "draft",
    });

    const invalidStart = await request(`/academic-years/${year._id}`, {
      token: adminA.token,
      method: "PATCH",
      body: JSON.stringify({ startDate: "2027-04-01" }),
    });
    expect(invalidStart.status).toBe(400);
    expect(invalidStart.body.message).toMatch(/end date must be after its start date/i);
    expect((await AcademicYear.findById(year._id).lean()).startDate.toISOString().slice(0, 10)).toBe("2026-04-01");

    const invalidEnd = await request(`/academic-years/${year._id}`, {
      token: adminA.token,
      method: "PATCH",
      body: JSON.stringify({ endDate: "2026-03-31" }),
    });
    expect(invalidEnd.status).toBe(400);
    expect(invalidEnd.body.message).toMatch(/end date must be after its start date/i);

    const validStart = await request(`/academic-years/${year._id}`, {
      token: adminA.token,
      method: "PATCH",
      body: JSON.stringify({ startDate: "2026-05-01" }),
    });
    expect(validStart.status).toBe(200);
    expect(new Date(validStart.body.data.startDate).toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("prevents academic-year date changes from excluding existing historical enrollments", async () => {
    const school = await makeSchool("history-date");
    const admin = await makeUser(school, "school_admin");
    const year = await AcademicYear.create({
      tenantId: school._id,
      name: `AY-history-${randomUUID().slice(0, 6)}`,
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      status: "active",
    });
    const schoolClass = await SchoolClass.create({
      tenantId: school._id,
      academicYearId: year._id,
      name: `History class ${randomUUID().slice(0, 5)}`,
    });
    const student = await makeStudent(school, `history-${randomUUID().slice(0, 5)}`);
    const created = await post("/enrollments", admin.token, {
      studentId: String(student._id),
      academicYearId: String(year._id),
      classId: String(schoolClass._id),
      enrollmentDate: "2026-04-01",
    });
    expect(created.status).toBe(201);
    enrollmentIds.push(created.body.data._id);

    const ended = await request(`/enrollments/${created.body.data._id}`, {
      token: admin.token,
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    expect(ended.status).toBe(200);

    const changed = await request(`/academic-years/${year._id}`, {
      token: admin.token,
      method: "PATCH",
      body: JSON.stringify({ startDate: "2026-04-02" }),
    });
    expect(changed.status).toBe(409);
    expect(changed.body.message).toMatch(/cannot exclude existing enrollment dates/i);
    expect((await AcademicYear.findById(year._id).lean()).startDate.toISOString().slice(0, 10)).toBe("2026-04-01");
  }, 20000);

  it("serializes academic-year date changes with enrollment creation", async () => {
    const school = await makeSchool("date-race");
    const admin = await makeUser(school, "school_admin");
    const year = await AcademicYear.create({
      tenantId: school._id,
      name: `AY-date-race-${randomUUID().slice(0, 5)}`,
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      status: "active",
    });
    const schoolClass = await SchoolClass.create({
      tenantId: school._id,
      academicYearId: year._id,
      name: "Date Race Class",
    });
    const student = await makeStudent(school, `date-race-${randomUUID().slice(0, 5)}`);

    const [dateChange, placement] = await Promise.all([
      request(`/academic-years/${year._id}`, {
        token: admin.token,
        method: "PATCH",
        body: JSON.stringify({ startDate: "2026-04-02" }),
      }),
      post("/enrollments", admin.token, {
        studentId: String(student._id),
        academicYearId: String(year._id),
        classId: String(schoolClass._id),
        enrollmentDate: "2026-04-01",
      }),
    ]);

    expect(
      (dateChange.status === 200 && placement.status === 400) ||
      (dateChange.status === 409 && placement.status === 201)
    ).toBe(true);
    if (placement.status === 201) enrollmentIds.push(placement.body.data._id);

    const [finalYear, history] = await Promise.all([
      AcademicYear.findById(year._id).lean(),
      Enrollment.find({ tenantId: school._id, academicYearId: year._id }).lean(),
    ]);
    if (finalYear.startDate.toISOString().slice(0, 10) === "2026-04-02") {
      expect(history).toHaveLength(0);
    } else {
      expect(finalYear.startDate.toISOString().slice(0, 10)).toBe("2026-04-01");
      expect(history).toHaveLength(1);
      expect(history[0].enrollmentDate.toISOString().slice(0, 10)).toBe("2026-04-01");
    }
  }, 20000);



  it("limits teacher enrollment and student reads to active assigned sections and class-wide assignments", async () => {
    const scopedClass = await SchoolClass.create({ tenantId: schoolA._id, academicYearId: yearA._id, name: "Scoped Class" });
    const scopedSectionA = await Section.create({ tenantId: schoolA._id, classId: scopedClass._id, name: "A" });
    const scopedSectionB = await Section.create({ tenantId: schoolA._id, classId: scopedClass._id, name: "B" });
    const classWide = await SchoolClass.create({ tenantId: schoolA._id, academicYearId: yearA._id, name: "Class 2" });
    const wideSectionA = await Section.create({ tenantId: schoolA._id, classId: classWide._id, name: "A" });
    const wideSectionB = await Section.create({ tenantId: schoolA._id, classId: classWide._id, name: "B" });
    const assignedStudent = await makeStudent(schoolA, "teacher-assigned");
    const siblingStudent = await makeStudent(schoolA, "teacher-sibling");
    const wideStudentA = await makeStudent(schoolA, "teacher-wide-a");
    const wideStudentB = await makeStudent(schoolA, "teacher-wide-b");
    const placements = [
      [assignedStudent, scopedClass, scopedSectionA],
      [siblingStudent, scopedClass, scopedSectionB],
      [wideStudentA, classWide, wideSectionA],
      [wideStudentB, classWide, wideSectionB],
    ];
    const placementIds = {};
    for (const [student, schoolClass, section] of placements) {
      const response = await post("/enrollments", adminA.token, {
        studentId: String(student._id), academicYearId: String(yearA._id),
        classId: String(schoolClass._id), sectionId: String(section._id),
      });
      expect(response.status).toBe(201);
      placementIds[String(student._id)] = response.body.data._id;
      enrollmentIds.push(response.body.data._id);
    }
    const subject = await Subject.create({ tenantId: schoolA._id, name: `Teacher Scope ${randomUUID().slice(0, 6)}` });
    const sectionAssignment = await TeacherAssignment.create({
      tenantId: schoolA._id, teacherId: teacherA.user._id, subjectId: subject._id,
      academicYearId: yearA._id, classId: scopedClass._id, sectionId: scopedSectionA._id,
      assignedBy: adminA.user._id,
    });
    await TeacherAssignment.create({
      tenantId: schoolA._id, teacherId: teacherA.user._id, subjectId: subject._id,
      academicYearId: yearA._id, classId: classWide._id, sectionId: null,
      assignedBy: adminA.user._id,
    });
    const attendanceStatuses = ["present", "absent", "late", "excused"];
    for (let index = 0; index < placements.length; index += 1) {
      const [student, schoolClass, section] = placements[index];
      const enrollmentId = placementIds[String(student._id)];
      await Attendance.create({
        tenantId: schoolA._id, studentId: student._id, enrollmentId,
        academicYearId: yearA._id, classId: schoolClass._id, sectionId: section._id,
        date: new Date("2026-04-10T00:00:00.000Z"), status: attendanceStatuses[index],
        markedBy: teacherA.user._id,
      });
    }

    const report = await request(`/attendance/reports?academicYearId=${yearA._id}&from=2026-04-01&to=2026-04-30`, { token: teacherA.token });
    expect(report.status).toBe(200);
    expect(report.body.summary.students).toBe(3);
    expect(new Set(report.body.students.map((item) => String(item.studentId)))).toEqual(new Set([
      String(assignedStudent._id), String(wideStudentA._id), String(wideStudentB._id),
    ]));
    expect(report.body.summary.absent).toBe(0);
    const classReport = await request(`/attendance/reports?academicYearId=${yearA._id}&from=2026-04-01&to=2026-04-30&classId=${scopedClass._id}`, { token: teacherA.token });
    expect(classReport.status).toBe(200);
    expect(classReport.body.summary.students).toBe(1);
    const deniedReport = await request(`/attendance/reports?academicYearId=${yearA._id}&from=2026-04-01&to=2026-04-30&classId=${classA._id}`, { token: teacherA.token });
    expect(deniedReport.status).toBe(403);

    const list = await request("/enrollments", { token: teacherA.token });
    expect(list.status).toBe(200);
    expect(new Set(list.body.data.map((item) => String(item.studentId._id)))).toEqual(new Set([
      String(assignedStudent._id), String(wideStudentA._id), String(wideStudentB._id),
    ]));
    const narrowed = await request(`/enrollments?classId=${scopedClass._id}`, { token: teacherA.token });
    expect(narrowed.body.data.map((item) => String(item.studentId._id))).toEqual([String(assignedStudent._id)]);
    const siblingQuery = await request(`/enrollments?sectionId=${scopedSectionB._id}`, { token: teacherA.token });
    expect(siblingQuery.body.data).toHaveLength(0);
    expect((await request(`/enrollments/${placementIds[String(assignedStudent._id)]}`, { token: teacherA.token })).status).toBe(200);
    expect((await request(`/enrollments/${placementIds[String(siblingStudent._id)]}`, { token: teacherA.token })).status).toBe(404);
    expect((await request(`/enrollments/${placementIds[String(wideStudentB._id)]}`, { token: teacherA.token })).status).toBe(200);

    const studentList = await request("/students?limit=100", { token: teacherA.token });
    expect(studentList.status).toBe(200);
    expect(new Set(studentList.body.data.map((item) => String(item._id)))).toEqual(new Set([
      String(assignedStudent._id), String(wideStudentA._id), String(wideStudentB._id),
    ]));
    expect(studentList.body.data[0]).not.toHaveProperty("guardianPhone");
    expect(studentList.body.data[0]).not.toHaveProperty("address");
    const assignedStudentRead = await request(`/students/${assignedStudent._id}`, { token: teacherA.token });
    expect(assignedStudentRead.status).toBe(200);
    expect(assignedStudentRead.body.data).not.toHaveProperty("guardianPhone");
    expect(assignedStudentRead.body.data).not.toHaveProperty("address");
    expect((await request(`/students/${siblingStudent._id}`, { token: teacherA.token })).status).toBe(404);

    await TeacherAssignment.updateOne({ _id: sectionAssignment._id }, { $set: { status: "inactive" } });
    const afterRevocation = await request(`/enrollments?classId=${scopedClass._id}`, { token: teacherA.token });
    expect(afterRevocation.body.data).toHaveLength(0);
    expect((await request(`/students/${assignedStudent._id}`, { token: teacherA.token })).status).toBe(404);
    const reportAfterRevocation = await request(`/attendance/reports?academicYearId=${yearA._id}&from=2026-04-01&to=2026-04-30`, { token: teacherA.token });
    expect(reportAfterRevocation.status).toBe(200);
    expect(reportAfterRevocation.body.summary.students).toBe(2);
  });

});
