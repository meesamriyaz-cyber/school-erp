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
import AcademicTerm from "../models/AcademicTerm.js";
import SchoolClass from "../models/SchoolClass.js";
import Section from "../models/Section.js";
import Subject from "../models/Subject.js";
import ClassSubject from "../models/ClassSubject.js";
import Enrollment from "../models/Enrollment.js";
import EnrollmentTransferAudit from "../models/EnrollmentTransferAudit.js";
import Examination from "../models/Examination.js";
import ExamSubject from "../models/ExamSubject.js";
import { createAccessToken } from "../utils/tokens.js";

const TEST_DB = "school-erp-test";
let server, baseUrl, school, otherSchool, admin, teacher, otherAdmin, year, classA, classB, sectionA, sectionB, subject, unmappedSubject, student, enrollment;
const userIds = [];
const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(baseUrl + path, { ...options, headers: {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
  }});
  return { status: response.status, body: await response.json() };
};
const createUser = async (tenant, role) => {
  const user = await User.create({ tenantId: tenant._id, firstName: "Phase", lastName: "Seven", email: `phase7-${randomUUID()}@example.test`, passwordHash: "test-only", role, status: "active", authVersion: 0 });
  userIds.push(user._id);
  return { user, token: createAccessToken(user) };
};

describe("Phase 7 academic structure and placement lifecycle", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test" || !env.mongoUri) throw new Error("Safety stop: configure the test environment.");
    const match = env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/);
    if (!match || decodeURIComponent(match[1]) !== TEST_DB) throw new Error(`Safety stop: expected ${TEST_DB}`);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== TEST_DB) throw new Error("Safety stop: connected to an unexpected database.");
    await Promise.all([Tenant.init(), User.init(), Student.init(), AcademicYear.init(), AcademicTerm.init(), SchoolClass.init(), Section.init(), Subject.init(), ClassSubject.init(), Enrollment.init(), EnrollmentTransferAudit.init(), Examination.init(), ExamSubject.init()]);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    school = await Tenant.create({ name: `Phase 7 ${suffix}`, slug: `phase7-${suffix}`, status: "active" });
    otherSchool = await Tenant.create({ name: `Phase 7 Other ${suffix}`, slug: `phase7-other-${suffix}`, status: "active" });
    [admin, teacher, otherAdmin] = await Promise.all([createUser(school, "school_admin"), createUser(school, "teacher"), createUser(otherSchool, "school_admin")]);
    year = await AcademicYear.create({ tenantId: school._id, name: `2026-27-${suffix}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    classA = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class A" });
    classB = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class B" });
    sectionA = await Section.create({ tenantId: school._id, classId: classA._id, name: "A" });
    sectionB = await Section.create({ tenantId: school._id, classId: classB._id, name: "B", capacity: 2 });
    subject = await Subject.create({ tenantId: school._id, name: `Mathematics ${suffix}`, code: `M${suffix.slice(0, 8)}` });
    unmappedSubject = await Subject.create({ tenantId: school._id, name: `History ${suffix}`, code: `H${suffix.slice(0, 8)}` });
    student = await Student.create({ tenantId: school._id, admissionNumber: `P7-${suffix}`, firstName: "Test", lastName: "Learner", status: "active", admissionDate: new Date("2026-04-01") });
    enrollment = await Enrollment.create({ tenantId: school._id, studentId: student._id, academicYearId: year._id, classId: classA._id, sectionId: sectionA._id, enrollmentDate: new Date("2026-04-01"), status: "active" });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (school?._id) {
        await EnrollmentTransferAudit.deleteMany({ tenantId: school._id });
        await Enrollment.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id].filter(Boolean) } });
        await ExamSubject.deleteMany({ tenantId: school._id });
        await Examination.deleteMany({ tenantId: school._id });
        await ClassSubject.deleteMany({ tenantId: school._id });
        await AcademicTerm.deleteMany({ tenantId: school._id });
        await Section.deleteMany({ tenantId: school._id });
        await SchoolClass.deleteMany({ tenantId: school._id });
        await Subject.deleteMany({ tenantId: school._id });
        await Student.deleteMany({ tenantId: school._id });
        await AcademicYear.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id].filter(Boolean) } });
        await User.deleteMany({ _id: { $in: userIds } });
        await Tenant.deleteMany({ _id: { $in: [school._id, otherSchool?._id].filter(Boolean) } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  it("creates flexible terms, prevents overlap, and enforces school/role scope", async () => {
    const created = await request("/academic-terms", { token: admin.token, method: "POST", body: JSON.stringify({
      academicYearId: String(year._id), name: "Semester One", startDate: "2026-04-01", endDate: "2026-07-31",
    }) });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("draft");
    const active = await request(`/academic-terms/${created.body.data._id}`, { token: admin.token, method: "PATCH", body: JSON.stringify({ status: "active" }) });
    expect(active.status).toBe(200);
    const overlap = await request("/academic-terms", { token: admin.token, method: "POST", body: JSON.stringify({
      academicYearId: String(year._id), name: "Quarter One", startDate: "2026-07-01", endDate: "2026-09-30",
    }) });
    expect(overlap.status).toBe(409);
    const outside = await request("/academic-terms", { token: admin.token, method: "POST", body: JSON.stringify({
      academicYearId: String(year._id), name: "Outside", startDate: "2027-04-01", endDate: "2027-06-30",
    }) });
    expect(outside.status).toBe(400);
    const denied = await request("/academic-terms", { token: teacher.token, method: "POST", body: JSON.stringify({
      academicYearId: String(year._id), name: "Teacher Term", startDate: "2026-08-01", endDate: "2026-10-31",
    }) });
    expect(denied.status).toBe(403);
    const crossTenant = await request(`/academic-terms?academicYearId=${year._id}`, { token: otherAdmin.token });
    expect(crossTenant.status).toBe(404);
  });

  it("maps subjects to a class curriculum and freezes that curriculum on examinations", async () => {
    const mapped = await request(`/class-subjects/classes/${classA._id}`, { token: admin.token, method: "PUT", body: JSON.stringify({
      subjectId: String(subject._id), category: "compulsory", weeklyPeriods: 5, sortOrder: 1,
    }) });
    expect(mapped.status).toBe(201);
    expect(mapped.body.data.category).toBe("compulsory");
    const exam = await request("/examinations", { token: admin.token, method: "POST", body: JSON.stringify({
      academicYearId: String(year._id), academicTermId: String((await AcademicTerm.findOne({ tenantId: school._id, status: "active" }))._id),
      classId: String(classA._id), name: "Term One Assessment", startDate: "2026-05-10", endDate: "2026-05-12",
    }) });
    expect(exam.status).toBe(201);
    expect(exam.body.data.curriculumSnapshot).toHaveLength(1);
    expect(exam.body.data.academicTermId.name).toBe("Semester One");
    const notMapped = await request(`/examinations/${exam.body.data._id}/subjects`, { token: admin.token, method: "POST", body: JSON.stringify({
      subjectId: String(unmappedSubject._id), examDate: "2026-05-10", maxMarks: 100, passMarks: 35,
    }) });
    expect(notMapped.status).toBe(409);
  });

  it("moves a student between classes atomically and retains an auditable prior placement", async () => {
    const moved = await request(`/enrollments/${enrollment._id}/transfer`, { token: admin.token, method: "PATCH", body: JSON.stringify({
      targetClassId: String(classB._id), targetSectionId: String(sectionB._id), reason: "Approved class reassignment",
    }) });
    expect(moved.status).toBe(200);
    expect(String(moved.body.data.classId._id)).toBe(String(classB._id));
    const [oldEnrollment, currentEnrollment, audit] = await Promise.all([
      Enrollment.findById(enrollment._id).lean(),
      Enrollment.findOne({ tenantId: school._id, studentId: student._id, status: "active" }).lean(),
      EnrollmentTransferAudit.findOne({ tenantId: school._id, studentId: student._id }).lean(),
    ]);
    expect(oldEnrollment.status).toBe("transferred");
    expect(String(currentEnrollment._id)).toBe(String(moved.body.data._id));
    expect(String(currentEnrollment.classId)).toBe(String(classB._id));
    expect(audit.reason).toBe("Approved class reassignment");
    expect(String(audit.fromEnrollmentId)).toBe(String(enrollment._id));
    const history = await request(`/enrollments/${enrollment._id}/transfers`, { token: admin.token });
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    const crossTenant = await request(`/enrollments/${moved.body.data._id}/transfer`, { token: otherAdmin.token, method: "PATCH", body: JSON.stringify({
      targetClassId: String(classA._id), reason: "Should not cross tenants",
    }) });
    expect(crossTenant.status).toBe(404);
  });
});
