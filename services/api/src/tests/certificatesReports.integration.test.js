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
import FeeStructure from "../models/FeeStructure.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import Certificate from "../models/Certificate.js";
import CertificateCounter from "../models/CertificateCounter.js";
import { createAccessToken } from "../utils/tokens.js";

const TEST_DB = "school-erp-test";
let server, baseUrl, school, otherSchool, admin, otherAdmin, year, schoolClass, student, activeEnrollment;
const tenantIds = [], userIds = [];
const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(baseUrl + path, { ...options, headers: {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
  }});
  return { status: response.status, body: await response.json() };
};
const post = (path, token, body) => request(path, { token, method: "POST", body: JSON.stringify(body) });
const createSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const tenant = await Tenant.create({ name: `Certificate ${label} ${suffix}`, slug: `cert-${label}-${suffix}`, status: "active" });
  tenantIds.push(tenant._id); return tenant;
};
const createAdmin = async (tenant) => {
  const user = await User.create({ tenantId: tenant._id, firstName: "Cert", lastName: "Admin", email: `cert-${randomUUID()}@example.test`, passwordHash: "test-only", role: "school_admin", status: "active", authVersion: 0 });
  userIds.push(user._id); return { user, token: createAccessToken(user) };
};

describe("Certificates and school reports API", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: NODE_ENV=test is required");
    const match = typeof env.mongoUri === "string" ? env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/) : null;
    if (!match || decodeURIComponent(match[1]) !== TEST_DB) throw new Error(`Safety stop: expected ${TEST_DB}`);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== TEST_DB) throw new Error("Safety stop: unexpected test database");
    await Promise.all([Tenant.init(), User.init(), Student.init(), AcademicYear.init(), SchoolClass.init(), Enrollment.init(), Certificate.init(), CertificateCounter.init(), Attendance.init(), FeeStructure.init(), FeeInvoice.init(), FeePayment.init()]);
    school = await createSchool("A"); otherSchool = await createSchool("B");
    admin = await createAdmin(school); otherAdmin = await createAdmin(otherSchool);
    year = await AcademicYear.create({ tenantId: school._id, name: `AY-${randomUUID().slice(0, 7)}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    schoolClass = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class 7" });
    student = await Student.create({ tenantId: school._id, admissionNumber: `CERT-${randomUUID().slice(0, 7)}`, firstName: "Amina", lastName: "Khan", admissionDate: "2026-04-01" });
    activeEnrollment = await Enrollment.create({ tenantId: school._id, studentId: student._id, academicYearId: year._id, classId: schoolClass._id, enrollmentDate: "2026-04-01", status: "active" });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      await Certificate.deleteMany({ tenantId: { $in: tenantIds } });
      await CertificateCounter.deleteMany({ tenantId: { $in: tenantIds } });
      await Attendance.deleteMany({ tenantId: { $in: tenantIds } });
      await FeePayment.deleteMany({ tenantId: { $in: tenantIds } });
      await FeeInvoice.deleteMany({ tenantId: { $in: tenantIds } });
      await FeeStructure.deleteMany({ tenantId: { $in: tenantIds } });
      await Enrollment.deleteMany({ tenantId: { $in: tenantIds } });
      await Student.deleteMany({ tenantId: { $in: tenantIds } });
      await SchoolClass.deleteMany({ tenantId: { $in: tenantIds } });
      await AcademicYear.deleteMany({ tenantId: { $in: tenantIds } });
      await User.deleteMany({ _id: { $in: userIds } });
      await Tenant.deleteMany({ _id: { $in: tenantIds } });
      await mongoose.disconnect();
    }
  }, 30000);

  it("issues immutable-snapshot bonafide certificates, verifies publicly, and voids with audit reason", async () => {
    const issued = await post("/certificates", admin.token, { studentId: String(student._id), enrollmentId: String(activeEnrollment._id), type: "bonafide" });
    expect(issued.status).toBe(201);
    expect(issued.body.data.certificateNumber).toMatch(/^BON\/\d{4}\/\d{5}$/);
    expect(issued.body.data.snapshot).toMatchObject({ studentName: "Amina Khan", admissionNumber: student.admissionNumber, className: "Class 7" });
    expect(issued.body.data.verificationCode).toMatch(/^[a-f0-9]{36}$/);
    const stored = await Certificate.findById(issued.body.data._id).select("+verificationCode").lean();
    const verified = await request(`/certificates/verify/${stored.verificationCode}`);
    expect(verified.status).toBe(200);
    expect(verified.body.data).toMatchObject({ certificateNumber: issued.body.data.certificateNumber, studentName: "Amina Khan", status: "issued" });
    const concurrent = await Promise.all([1, 2].map(() => post("/certificates", admin.token, { studentId: String(student._id), enrollmentId: String(activeEnrollment._id), type: "bonafide" })));
    expect(concurrent.map((item) => item.status)).toEqual([201, 201]);
    expect(new Set(concurrent.map((item) => item.body.data.certificateNumber)).size).toBe(2);
    const replacement = await post("/certificates", admin.token, { studentId: String(student._id), enrollmentId: String(activeEnrollment._id), type: "bonafide", reissuedFrom: issued.body.data._id, remarks: "Replacement copy" });
    expect(replacement.status).toBe(201);
    expect(String(replacement.body.data.reissuedFrom)).toBe(issued.body.data._id);
    const hidden = await request("/certificates", { token: otherAdmin.token });
    expect(hidden.status).toBe(200); expect(hidden.body.data).toHaveLength(0);
    const forged = await post("/certificates", otherAdmin.token, { studentId: String(student._id), enrollmentId: String(activeEnrollment._id), type: "bonafide" });
    expect(forged.status).toBe(404);
    const voided = await request(`/certificates/${issued.body.data._id}/void`, { token: admin.token, method: "PATCH", body: JSON.stringify({ reason: "Printed with a clerical error" }) });
    expect(voided.status).toBe(200); expect(voided.body.data.status).toBe("void");
    expect((await request(`/certificates/verify/${stored.verificationCode}`)).body.data.status).toBe("void");
  });

  it("issues transfer certificates only from ended enrollment history", async () => {
    const historicalClass = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class 8" });
    const ended = await Enrollment.create({ tenantId: school._id, studentId: student._id, academicYearId: year._id, classId: historicalClass._id, enrollmentDate: "2026-04-01", status: "completed", endedAt: new Date("2026-10-31T00:00:00.000Z") });
    await Attendance.create({ tenantId: school._id, studentId: student._id, enrollmentId: ended._id, academicYearId: year._id, classId: historicalClass._id, sectionId: null, date: new Date("2026-10-15T00:00:00.000Z"), status: "present", markedBy: admin.user._id });
    const issued = await post("/certificates", admin.token, { studentId: String(student._id), enrollmentId: String(ended._id), type: "transfer", reason: "Family relocation" });
    expect(issued.status).toBe(201);
    expect(issued.body.data.certificateNumber).toMatch(new RegExp("^TC/[0-9]{4}/[0-9]{5}$"));
    expect(issued.body.data.snapshot.enrollmentStatus).toBe("completed");
    expect(issued.body.data.snapshot.className).toBe("Class 8");
    expect(issued.body.data.snapshot.transferReason).toBe("Family relocation");
    const attendance = await request(`/attendance/reports?academicYearId=${year._id}&from=2026-10-01&to=2026-10-31`, { token: admin.token });
    expect(attendance.status).toBe(200);
    expect(attendance.body.students.find((item) => String(item.enrollmentId) === String(ended._id)).present).toBe(1);
  });

  it("rejects transfer certificates for active enrollments and rejects forged snapshot fields", async () => {
    const activeTransfer = await post("/certificates", admin.token, { studentId: String(student._id), enrollmentId: String(activeEnrollment._id), type: "transfer", reason: "Leaving school" });
    expect(activeTransfer.status).toBe(409);
    const forged = await post("/certificates", admin.token, { studentId: String(student._id), enrollmentId: String(activeEnrollment._id), type: "bonafide", certificateNumber: "FAKE/1", snapshot: { studentName: "Forged" } });
    expect(forged.status).toBe(400);
    const noPermission = await request("/certificates", {});
    expect(noPermission.status).toBe(401);
  });

  it("returns only this student's tenant-scoped enrollment history", async () => {
    const history = await request(`/reports/student-history?studentId=${student._id}`, { token: admin.token });
    expect(history.status).toBe(200);
    expect(history.body.data.student.admissionNumber).toBe(student.admissionNumber);
    expect(history.body.data.enrollments).toHaveLength(2);
    const hidden = await request(`/reports/student-history?studentId=${student._id}`, { token: otherAdmin.token });
    expect(hidden.status).toBe(404);
    expect((await request("/reports/student-history?studentId=bad", { token: admin.token })).status).toBe(400);
  });

  it("separates posted and reversed fee collections in the financial report", async () => {
    const structure = await FeeStructure.create({ tenantId: school._id, academicYearId: year._id, classId: schoolClass._id, name: `Report Fee ${randomUUID().slice(0, 6)}`, items: [{ name: "Tuition", amount: 500, frequency: "annually" }] });
    const invoice = await FeeInvoice.create({ tenantId: school._id, enrollmentId: activeEnrollment._id, studentId: student._id, academicYearId: year._id, feeStructureId: structure._id, invoiceNumber: `RPT-${randomUUID().slice(0, 8)}`, items: [{ name: "Tuition", amount: 500 }], totalAmount: 500, paidAmount: 75, dueDate: "2026-12-01", status: "partial" });
    await FeePayment.create([
      { tenantId: school._id, invoiceId: invoice._id, receiptNumber: `POST-${randomUUID().slice(0, 8)}`, amount: 100, paymentDate: "2026-11-01", method: "cash", receivedBy: admin.user._id, status: "posted" },
      { tenantId: school._id, invoiceId: invoice._id, receiptNumber: `REV-${randomUUID().slice(0, 8)}`, amount: 25, paymentDate: "2026-11-02", method: "cash", receivedBy: admin.user._id, status: "reversed", reversedAt: new Date("2026-11-03"), reversedBy: admin.user._id, reversalReason: "Duplicate entry" },
    ]);
    const report = await request(`/reports/fees?academicYearId=${year._id}`, { token: admin.token });
    expect(report.status).toBe(200);
    expect(report.body.summary).toMatchObject({ invoiced: 500, outstanding: 425, postedPayments: 100, reversedPayments: 25, postedPaymentsCount: 1, reversedPaymentsCount: 1 });
    expect((await request(`/reports/fees?academicYearId=${year._id}`, { token: otherAdmin.token })).status).toBe(404);
  });

  it("lists tenant-scoped enrollment strength and validates report filters", async () => {
    const report = await request(`/reports/enrollment-strength?academicYearId=${year._id}`, { token: admin.token });
    expect(report.status).toBe(200);
    expect(report.body.summary.totalStudents).toBe(2);
    expect((await request("/reports/enrollment-strength?academicYearId=bad", { token: admin.token })).status).toBe(400);
    const otherReport = await request(`/reports/enrollment-strength?academicYearId=${year._id}`, { token: otherAdmin.token });
    expect(otherReport.status).toBe(404);
  });
});
