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
import Homework from "../models/Homework.js";
import HomeworkSubmission from "../models/HomeworkSubmission.js";
import ExamSubject from "../models/ExamSubject.js";
import ExamMark from "../models/ExamMark.js";
import Enrollment from "../models/Enrollment.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import { createAccessToken } from "../utils/tokens.js";

const EXPECTED_TEST_DATABASE = "school-erp-test";
let server, baseUrl, schoolA, schoolB, adminA, teacherA, adminB, yearA, classA, subjectA, studentA, enrollmentA;
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
    await Promise.all([Tenant.init(), User.init(), AcademicYear.init(), SchoolClass.init(), Section.init(), Subject.init(), Student.init(), Guardian.init(), StudentGuardian.init(), Enrollment.init(), Examination.init(), ExamSubject.init(), ExamMark.init(), TeacherAssignment.init(), Homework.init(), HomeworkSubmission.init()]);
    schoolA = await createSchool("alpha");
    schoolB = await createSchool("beta");
    [adminA, teacherA, adminB] = await Promise.all([
      createUser(schoolA, "school_admin"), createUser(schoolA, "teacher"), createUser(schoolB, "school_admin"),
    ]);
    yearA = await AcademicYear.create({ tenantId: schoolA._id, name: `2026-27-${randomUUID().slice(0, 5)}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    classA = await SchoolClass.create({ tenantId: schoolA._id, academicYearId: yearA._id, name: "Class 5" });
    subjectA = await Subject.create({ tenantId: schoolA._id, name: `Mathematics ${randomUUID().slice(0, 5)}` });
    studentA = await Student.create({ tenantId: schoolA._id, admissionNumber: `EX-${randomUUID().slice(0, 8)}`, firstName: "Test Student" });
    enrollmentA = await Enrollment.create({ tenantId: schoolA._id, studentId: studentA._id, academicYearId: yearA._id, classId: classA._id, status: "active" });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (tenantIds.length) {
        await ExamMark.deleteMany({ tenantId: { $in: tenantIds } });
        await HomeworkSubmission.deleteMany({ tenantId: { $in: tenantIds } });
        await Homework.deleteMany({ tenantId: { $in: tenantIds } });
        await TeacherAssignment.deleteMany({ tenantId: { $in: tenantIds } });
        await Enrollment.deleteMany({ tenantId: { $in: tenantIds } });
        await StudentGuardian.deleteMany({ tenantId: { $in: tenantIds } });
        await Guardian.deleteMany({ tenantId: { $in: tenantIds } });
        await Student.deleteMany({ tenantId: { $in: tenantIds } });
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

  it("creates and lists tenant-scoped homework with valid class and subject scope", async () => {
    const payload = {
      academicYearId: String(yearA._id), classId: String(classA._id), subjectId: String(subjectA._id),
      title: "Complete exercise 1", instructions: "Solve questions 1 to 10 in your notebook.",
      assignedDate: "2026-09-02", dueDate: "2026-09-05", status: "published",
    };
    const created = await request("/homework", { method: "POST", token: adminA.token, body: JSON.stringify(payload) });
    expect(created.status).toBe(201);
    expect(String(created.body.data.tenantId)).toBe(String(schoolA._id));
    expect(String(created.body.data.teacherId._id)).toBe(String(adminA.user._id));
    const listed = await request("/homework", { token: adminA.token });
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((item) => item.title === payload.title)).toBe(true);
    const hidden = await request("/homework", { token: adminB.token });
    expect(hidden.body.data).toHaveLength(0);
  });

  it("rejects invalid homework dates and unassigned teacher creation", async () => {
    const base = {
      academicYearId: String(yearA._id), classId: String(classA._id), subjectId: String(subjectA._id),
      title: "Homework task", instructions: "Complete the worksheet.",
      assignedDate: "2026-09-05", dueDate: "2026-09-04",
    };
    const invalidDates = await request("/homework", { method: "POST", token: adminA.token, body: JSON.stringify(base) });
    expect(invalidDates.status).toBe(400);
    const teacherAttempt = await request("/homework", {
      method: "POST", token: teacherA.token,
      body: JSON.stringify({ ...base, dueDate: "2026-09-06" }),
    });
    expect(teacherAttempt.status).toBe(403);
  });

  it("accepts student homework submissions and allows the assigned teacher to review them", async () => {
    const studentAccount = await createUser(schoolA, "student");
    const submissionStudent = await Student.create({
      tenantId: schoolA._id, userId: studentAccount.user._id,
      admissionNumber: `HW-${randomUUID().slice(0, 8)}`, firstName: "Homework Student",
    });
    const submissionEnrollment = await Enrollment.create({
      tenantId: schoolA._id, studentId: submissionStudent._id, academicYearId: yearA._id,
      classId: classA._id, status: "active",
    });
    const homeworkAssignment = await TeacherAssignment.create({
      tenantId: schoolA._id, teacherId: teacherA.user._id, subjectId: subjectA._id,
      academicYearId: yearA._id, classId: classA._id, sectionId: null, assignedBy: adminA.user._id,
    });
    const created = await request("/homework", {
      method: "POST", token: teacherA.token,
      body: JSON.stringify({
        academicYearId: String(yearA._id), classId: String(classA._id), subjectId: String(subjectA._id),
        title: "Written assignment", instructions: "Answer the questions.",
        assignedDate: "2026-09-02", dueDate: "2026-09-10", status: "published",
      }),
    });
    expect(created.status).toBe(201);
    const homeworkId = created.body.data._id;
    const submitted = await request(`/homework/${homeworkId}/submissions`, {
      method: "POST", token: studentAccount.token, body: JSON.stringify({ answer: "My completed answers." }),
    });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe("submitted");
    expect(String(submitted.body.data.studentId)).toBe(String(submissionStudent._id));
    const listed = await request(`/homework/${homeworkId}/submissions`, { token: teacherA.token });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    const submissionId = listed.body.data[0]._id;
    const reviewed = await request(`/homework/${homeworkId}/submissions/${submissionId}/review`, {
      method: "PATCH", token: teacherA.token,
      body: JSON.stringify({ marksObtained: 8, maxMarks: 10, feedback: "Good work." }),
    });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.status).toBe("reviewed");
    const history = await request("/portal/homework-submissions", { token: studentAccount.token });
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].feedback).toBe("Good work.");
    const locked = await request(`/homework/${homeworkId}/submissions`, {
      method: "POST", token: studentAccount.token, body: JSON.stringify({ answer: "Attempt to replace reviewed answer." }),
    });
    expect(locked.status).toBe(409);
    const hidden = await request(`/homework/${homeworkId}/submissions`, { token: adminB.token });
    expect(hidden.status).toBe(404);

    await HomeworkSubmission.deleteMany({ tenantId: schoolA._id, homeworkId });
    await Homework.deleteOne({ _id: homeworkId, tenantId: schoolA._id });
    await TeacherAssignment.deleteOne({ _id: homeworkAssignment._id });
    await Enrollment.deleteOne({ _id: submissionEnrollment._id });
    await Student.deleteOne({ _id: submissionStudent._id });
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
    const anotherSubject = await Subject.create({ tenantId: schoolA._id, name: `History ${randomUUID().slice(0, 5)}` });
    const lateSubject = await request(`/examinations/${id}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(anotherSubject._id), examDate: "2026-09-04", maxMarks: 100, passMarks: 35 }),
    });
    expect(lateSubject.status).toBe(409);
    expect(lateSubject.body.message).toMatch(/only be configured while.*draft/i);
  });

  it("requires complete exam times and rejects overlapping subject sessions", async () => {
    const created = await request("/examinations", {
      method: "POST", token: adminA.token, body: JSON.stringify(createPayload()),
    });
    const id = created.body.data._id;
    const secondSubject = await Subject.create({
      tenantId: schoolA._id, name: `English ${randomUUID().slice(0, 5)}`,
    });
    const missingTime = await request(`/examinations/${id}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(subjectA._id), examDate: "2026-09-03", startTime: "09:00", maxMarks: 100, passMarks: 35 }),
    });
    expect(missingTime.status).toBe(400);
    expect(missingTime.body.message).toMatch(/both exam start and end/i);

    const first = await request(`/examinations/${id}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(subjectA._id), examDate: "2026-09-03", startTime: "09:00", endTime: "10:00", maxMarks: 100, passMarks: 35 }),
    });
    expect(first.status).toBe(201);
    const overlap = await request(`/examinations/${id}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(secondSubject._id), examDate: "2026-09-03", startTime: "09:45", endTime: "10:30", maxMarks: 100, passMarks: 35 }),
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body.message).toMatch(/overlaps another subject/i);
  });

  it("rejects invalid subject mark ranges and lifecycle skips", async () => {
    const created = await request("/examinations", { method: "POST", token: adminA.token, body: JSON.stringify(createPayload()) });
    const id = created.body.data._id;
    const invalidMarks = { subjectId: String(subjectA._id), examDate: "2026-09-03", maxMarks: 50, passMarks: 60 };
    expect((await request(`/examinations/${id}/subjects`, { method: "POST", token: adminA.token, body: JSON.stringify(invalidMarks) })).status).toBe(400);
    expect((await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "completed" }) })).status).toBe(409);
  });

  it("supports incremental mark saves while keeping incomplete results unpublished", async () => {
    const secondStudent = await Student.create({
      tenantId: schoolA._id, admissionNumber: `EX-${randomUUID().slice(0, 8)}`, firstName: "Second Student",
    });
    const secondEnrollment = await Enrollment.create({
      tenantId: schoolA._id, studentId: secondStudent._id, academicYearId: yearA._id,
      classId: classA._id, status: "active",
    });
    const secondSubject = await Subject.create({ tenantId: schoolA._id, name: `Science ${randomUUID().slice(0, 5)}` });
    const created = await request("/examinations", {
      method: "POST", token: adminA.token, body: JSON.stringify(createPayload()),
    });
    const examId = created.body.data._id;
    const subjectOne = await request(`/examinations/${examId}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(subjectA._id), examDate: "2026-09-03", maxMarks: 100, passMarks: 35 }),
    });
    const subjectTwo = await request(`/examinations/${examId}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(secondSubject._id), examDate: "2026-09-04", maxMarks: 100, passMarks: 35 }),
    });
    expect(subjectOne.status).toBe(201);
    expect(subjectTwo.status).toBe(201);
    await request(`/examinations/${examId}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "scheduled" }) });
    await request(`/examinations/${examId}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "in_progress" }) });
    const partial = await request(`/examinations/${examId}/marks`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ marks: [{ examSubjectId: subjectOne.body.data._id, enrollmentId: String(enrollmentA._id), marksObtained: 76 }] }),
    });
    expect(partial.status).toBe(200);
    expect(partial.body.count).toBe(1);
    expect((await request(`/examinations/${examId}/marks`, { token: adminA.token })).body.data).toHaveLength(1);
    await request(`/examinations/${examId}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "completed" }) });
    const result = await request(`/examinations/${examId}/results`, { token: adminA.token });
    expect(result.status).toBe(200);
    expect(result.body.summary.publishable).toBe(false);
    expect(result.body.summary.incompleteCount).toBe(2);
    const publish = await request(`/examinations/${examId}/publish`, { method: "POST", token: adminA.token });
    expect(publish.status).toBe(409);
    await Enrollment.deleteOne({ _id: secondEnrollment._id, tenantId: schoolA._id });
    await Student.deleteOne({ _id: secondStudent._id, tenantId: schoolA._id });
  });

  it("calculates consolidated results and publishes only complete results", async () => {
    const created = await request("/examinations", { method: "POST", token: adminA.token, body: JSON.stringify(createPayload()) });
    const id = created.body.data._id;
    const subject = await request(`/examinations/${id}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(subjectA._id), examDate: "2026-09-03", maxMarks: 100, passMarks: 35 }),
    });
    expect(subject.status).toBe(201);
    expect((await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "scheduled" }) })).status).toBe(200);
    expect((await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "in_progress" }) })).status).toBe(200);
    expect((await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "completed" }) })).status).toBe(200);

    const incomplete = await request(`/examinations/${id}/publish`, { method: "POST", token: adminA.token });
    expect(incomplete.status).toBe(409);
    expect(incomplete.body.incompleteCount).toBe(1);

    const saved = await request(`/examinations/${id}/marks`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ marks: [{ examSubjectId: subject.body.data._id, enrollmentId: String(enrollmentA._id), marksObtained: 82 }] }),
    });
    expect(saved.status).toBe(200);

    const results = await request(`/examinations/${id}/results`, { token: adminA.token });
    expect(results.status).toBe(200);
    expect(results.body.summary.publishable).toBe(true);
    expect(results.body.data).toHaveLength(1);
    expect(results.body.data[0]).toMatchObject({
      totalObtained: 82, totalMaximum: 100, percentage: 82, status: "passed",
    });
    expect(results.body.data[0].subjects[0].status).toBe("passed");

    const published = await request(`/examinations/${id}/publish`, { method: "POST", token: adminA.token });
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe("published");
    const studentAccount = await createUser(schoolA, "student");
    const parentAccount = await createUser(schoolA, "parent");
    const guardian = await Guardian.create({ tenantId: schoolA._id, firstName: "Parent", lastName: "Tester", email: parentAccount.user.email });
    await StudentGuardian.create({ tenantId: schoolA._id, studentId: studentA._id, guardianId: guardian._id, relationship: "father", status: "active" });
    expect((await request("/students/" + studentA._id + "/account", { method: "POST", token: adminA.token, body: JSON.stringify({ userId: String(studentAccount.user._id) }) })).status).toBe(200);
    expect((await request("/guardians/" + guardian._id + "/account", { method: "POST", token: adminA.token, body: JSON.stringify({ userId: String(parentAccount.user._id) }) })).status).toBe(200);
    const studentResults = await request("/portal/results", { token: studentAccount.token });
    expect(studentResults.status).toBe(200);
    expect(studentResults.body.data).toHaveLength(1);
    expect(studentResults.body.data[0].result.totalObtained).toBe(82);
    const parentResults = await request("/portal/results", { token: parentAccount.token });
    expect(parentResults.status).toBe(200);
    expect(parentResults.body.data).toHaveLength(1);
    expect(String(parentResults.body.data[0].student._id)).toBe(String(studentA._id));
    expect((await request("/portal/results?studentId=" + new mongoose.Types.ObjectId(), { token: studentAccount.token })).status).toBe(403);
    expect((await request("/portal/results?studentId=" + new mongoose.Types.ObjectId(), { token: parentAccount.token })).status).toBe(403);

    const locked = await request(`/examinations/${id}/marks`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ marks: [{ examSubjectId: subject.body.data._id, enrollmentId: String(enrollmentA._id), marksObtained: 91 }] }),
    });
    expect(locked.status).toBe(409);
    expect((await request(`/examinations/${id}/results`, { token: adminB.token })).status).toBe(404);
  }, 15000);

  it("does not publish an examination without subjects or enrolled students fully marked", async () => {
    const created = await request("/examinations", { method: "POST", token: adminA.token, body: JSON.stringify(createPayload()) });
    const id = created.body.data._id;
    await request(`/examinations/${id}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(subjectA._id), examDate: "2026-09-03", maxMarks: 100, passMarks: 35 }),
    });
    await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "scheduled" }) });
    await request(`/examinations/${id}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "completed" }) });
    const published = await request(`/examinations/${id}/publish`, { method: "POST", token: adminA.token });
    expect(published.status).toBe(409);
    expect(published.body.incompleteCount).toBe(1);
  });
  it("serializes mark saves and result publication with an expiring examination lock", async () => {
    const created = await request("/examinations", {
      method: "POST", token: adminA.token, body: JSON.stringify(createPayload()),
    });
    const examId = created.body.data._id;
    const subject = await request(`/examinations/${examId}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(subjectA._id), examDate: "2026-09-03", maxMarks: 100, passMarks: 35 }),
    });
    expect(subject.status).toBe(201);
    await request(`/examinations/${examId}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "scheduled" }) });
    await request(`/examinations/${examId}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "completed" }) });

    await Examination.updateOne(
      { _id: examId, tenantId: schoolA._id },
      { $set: { resultLockToken: "active-test-lock", resultLockExpiresAt: new Date(Date.now() + 60_000) } }
    );
    const payload = {
      marks: [{ examSubjectId: subject.body.data._id, enrollmentId: String(enrollmentA._id), marksObtained: 74 }],
    };
    const blockedSave = await request(`/examinations/${examId}/marks`, {
      method: "POST", token: adminA.token, body: JSON.stringify(payload),
    });
    expect(blockedSave.status).toBe(409);

    const blockedPublish = await request(`/examinations/${examId}/publish`, {
      method: "POST", token: adminA.token,
    });
    expect(blockedPublish.status).toBe(409);

    await Examination.updateOne(
      { _id: examId, tenantId: schoolA._id },
      { $set: { resultLockExpiresAt: new Date(Date.now() - 1_000) } }
    );
    const recoveredSave = await request(`/examinations/${examId}/marks`, {
      method: "POST", token: adminA.token, body: JSON.stringify(payload),
    });
    expect(recoveredSave.status).toBe(200);

    const published = await request(`/examinations/${examId}/publish`, {
      method: "POST", token: adminA.token,
    });
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe("published");
  });

  it("limits teachers to their assigned section in class-wide exams for both reading and mark entry", async () => {
    const [sectionA, sectionB] = await Promise.all([
      Section.create({ tenantId: schoolA._id, classId: classA._id, name: "Section A" }),
      Section.create({ tenantId: schoolA._id, classId: classA._id, name: "Section B" }),
    ]);
    const [studentSectionA, studentB] = await Promise.all([
      Student.create({ tenantId: schoolA._id, admissionNumber: `EX-${randomUUID().slice(0, 8)}`, firstName: "Section A Student" }),
      Student.create({ tenantId: schoolA._id, admissionNumber: `EX-${randomUUID().slice(0, 8)}`, firstName: "Section B Student" }),
    ]);
    const [enrollmentInA, enrollmentInB] = await Promise.all([
      Enrollment.create({ tenantId: schoolA._id, studentId: studentSectionA._id, academicYearId: yearA._id, classId: classA._id, sectionId: sectionA._id, status: "active" }),
      Enrollment.create({ tenantId: schoolA._id, studentId: studentB._id, academicYearId: yearA._id, classId: classA._id, sectionId: sectionB._id, status: "active" }),
    ]);
    await TeacherAssignment.create({
      tenantId: schoolA._id, teacherId: teacherA.user._id, subjectId: subjectA._id,
      academicYearId: yearA._id, classId: classA._id, sectionId: sectionA._id,
      assignedBy: adminA.user._id, status: "active",
    });
    const created = await request("/examinations", {
      method: "POST", token: adminA.token, body: JSON.stringify(createPayload()),
    });
    const examId = created.body.data._id;
    const subject = await request(`/examinations/${examId}/subjects`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ subjectId: String(subjectA._id), examDate: "2026-09-03", maxMarks: 100, passMarks: 35 }),
    });
    expect(subject.status).toBe(201);
    await request(`/examinations/${examId}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "scheduled" }) });
    await request(`/examinations/${examId}/status`, { method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "in_progress" }) });

    const adminSave = await request(`/examinations/${examId}/marks`, {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ marks: [
        { examSubjectId: subject.body.data._id, enrollmentId: String(enrollmentInA._id), marksObtained: 76 },
        { examSubjectId: subject.body.data._id, enrollmentId: String(enrollmentInB._id), marksObtained: 88 },
      ] }),
    });
    expect(adminSave.status).toBe(200);

    const teacherRead = await request(`/examinations/${examId}/marks`, { token: teacherA.token });
    expect(teacherRead.status).toBe(200);
    expect(teacherRead.body.data).toHaveLength(1);
    expect(String(teacherRead.body.data[0].enrollmentId)).toBe(String(enrollmentInA._id));

    const forbiddenWrite = await request(`/examinations/${examId}/marks`, {
      method: "POST", token: teacherA.token,
      body: JSON.stringify({ marks: [{ examSubjectId: subject.body.data._id, enrollmentId: String(enrollmentInB._id), marksObtained: 90 }] }),
    });
    expect(forbiddenWrite.status).toBe(403);

    const allowedWrite = await request(`/examinations/${examId}/marks`, {
      method: "POST", token: teacherA.token,
      body: JSON.stringify({ marks: [{ examSubjectId: subject.body.data._id, enrollmentId: String(enrollmentInA._id), marksObtained: 79 }] }),
    });
    expect(allowedWrite.status).toBe(200);
  });

});
