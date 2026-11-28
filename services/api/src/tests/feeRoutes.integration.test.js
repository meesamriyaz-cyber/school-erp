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
import Section from "../models/Section.js";
import FeeStructure from "../models/FeeStructure.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import Notification from "../models/Notification.js";
import { createAccessToken } from "../utils/tokens.js";

let server, baseUrl, school, otherSchool, admin, otherAdmin, year, schoolClass, student, enrollment, studentAccount;
const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(baseUrl + path, { ...options, headers: {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
  }});
  return { status: response.status, body: await response.json() };
};
const post = (path, token, body) => request(path, { token, method: "POST", body: JSON.stringify(body) });
const makeSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  return Tenant.create({ name: `Fee Test ${label} ${suffix}`, slug: `fee-test-${label}-${suffix}`, status: "active" });
};
const makeAdmin = async (tenant) => {
  const user = await User.create({ tenantId: tenant._id, firstName: "Fee", lastName: "Admin", email: `fee-${randomUUID()}@example.test`, passwordHash: "test-only", role: "school_admin", status: "active", authVersion: 0 });
  return { user, token: createAccessToken(user) };
};

describe("Fee management API", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test" || !env.mongoUri) throw new Error("Safety stop: configure the test environment.");
    const mongoUriWithoutScheme = env.mongoUri.replace(/^mongodb(?:\+srv)?:\/\//i, "");
    const databasePathStart = mongoUriWithoutScheme.indexOf("/");
    const databaseName = databasePathStart === -1
      ? ""
      : decodeURIComponent(mongoUriWithoutScheme.slice(databasePathStart + 1).split("?")[0]);
    if (databaseName !== "school-erp-test") throw new Error("Safety stop: expected school-erp-test database.");
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== "school-erp-test") throw new Error("Safety stop: unexpected database.");
    await Promise.all([Tenant.init(), User.init(), Student.init(), AcademicYear.init(), SchoolClass.init(), Enrollment.init(), FeeStructure.init(), FeeInvoice.init(), FeePayment.init(), Section.init(), Notification.init()]);
    school = await makeSchool("main"); otherSchool = await makeSchool("other");
    admin = await makeAdmin(school); otherAdmin = await makeAdmin(otherSchool);
    year = await AcademicYear.create({ tenantId: school._id, name: `AY-${randomUUID().slice(0, 8)}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    schoolClass = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class 5" });
    studentAccount = await User.create({ tenantId: school._id, firstName: "Portal", lastName: "Student", email: `fee-student-${randomUUID()}@example.test`, passwordHash: "test-only", role: "student", status: "active", authVersion: 0 });
    student = await Student.create({ tenantId: school._id, userId: studentAccount._id, admissionNumber: `FEE-${randomUUID().slice(0, 8)}`, firstName: "Test", lastName: "Pupil", admissionDate: new Date("2026-04-01") });
    enrollment = await Enrollment.create({ tenantId: school._id, studentId: student._id, academicYearId: year._id, classId: schoolClass._id, status: "active" });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (school?._id && otherSchool?._id) {
        await Notification.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await FeePayment.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await FeeInvoice.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await FeeStructure.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await Enrollment.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await Section.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await Student.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await SchoolClass.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await AcademicYear.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await User.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await Tenant.deleteMany({ _id: { $in: [school._id, otherSchool._id] } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  it("creates class fee structures and issues an enrollment-bound invoice", async () => {
    const structure = await post("/fees/structures", admin.token, {
      academicYearId: String(year._id), classId: String(schoolClass._id), name: "Class 5 Standard",
      items: [{ name: "Tuition Fee", amount: 1200, frequency: "monthly" }, { name: "Library Fee", amount: 300, frequency: "annually" }],
    });
    expect(structure.status).toBe(201);
    expect(structure.body.data.tenantId).toBe(String(school._id));
    const invoice = await post("/fees/invoices", admin.token, {
      enrollmentId: String(enrollment._id), feeStructureId: structure.body.data._id,
      invoiceNumber: `INV-${randomUUID().slice(0, 8)}`, dueDate: "2026-05-10",
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.data.totalAmount).toBe(1500);
    expect(String(invoice.body.data.studentId)).toBe(String(student._id));
    const invoiceNotice = await Notification.findOne({ tenantId: school._id, recipientUserId: studentAccount._id, eventType: "fee_invoice_created", sourceId: invoice.body.data._id }).lean();
    expect(invoiceNotice).toMatchObject({ recipientRole: "student", deliveryStatus: "pending", link: "/portal?tab=fees" });
    expect((await request("/fees/invoices", { token: otherAdmin.token })).body.data).toHaveLength(0);
    expect((await post("/fees/invoices", otherAdmin.token, {
      enrollmentId: String(enrollment._id), feeStructureId: structure.body.data._id,
      invoiceNumber: "CROSS-TENANT", dueDate: "2026-05-10",
    })).status).toBe(404);
    const secondStudent = await Student.create({ tenantId: school._id, admissionNumber: `FEE-${randomUUID().slice(0, 8)}`, firstName: "Second", lastName: "Pupil", admissionDate: new Date("2026-04-01") });
    const secondEnrollment = await Enrollment.create({ tenantId: school._id, studentId: secondStudent._id, academicYearId: year._id, classId: schoolClass._id, status: "active" });
    const bulk = await post("/fees/invoices/bulk", admin.token, {
      academicYearId: String(year._id), classId: String(schoolClass._id),
      feeStructureId: structure.body.data._id, dueDate: "2026-05-10", invoiceNumberPrefix: "MAY26",
    });
    expect(bulk.status).toBe(201);
    expect(bulk.body.data.totalEligible).toBe(2);
    expect(bulk.body.data.created).toBe(1);
    expect(bulk.body.data.skipped).toBe(1);
    expect(bulk.body.data.results.some((item) => item.enrollmentId === String(secondEnrollment._id) && item.status === "created")).toBe(true);
    expect(await Notification.countDocuments({ tenantId: school._id, eventType: "fee_invoice_created" })).toBe(1);
    const repeated = await post("/fees/invoices/bulk", admin.token, {
      academicYearId: String(year._id), classId: String(schoolClass._id),
      feeStructureId: structure.body.data._id, dueDate: "2026-05-10", invoiceNumberPrefix: "MAY26",
    });
    expect(repeated.body.data.created).toBe(0);
    expect(repeated.body.data.skipped).toBe(2);

    const anotherClass = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class 6" });
    const wrongSection = await Section.create({ tenantId: school._id, classId: anotherClass._id, name: "A", status: "active" });
    const invalidSectionBulk = await post("/fees/invoices/bulk", admin.token, {
      academicYearId: String(year._id), classId: String(schoolClass._id), sectionId: String(wrongSection._id),
      feeStructureId: structure.body.data._id, dueDate: "2026-06-10", invoiceNumberPrefix: "JUN26",
    });
    expect(invalidSectionBulk.status).toBe(400);
    expect(invalidSectionBulk.body.message).toMatch(/active section belonging to the chosen class/i);
  });

  it("records partial and final payments, prevents overpayment, and exposes receipt history", async () => {
    const structure = await FeeStructure.findOne({ tenantId: school._id });
    const invoice = await FeeInvoice.findOne({ tenantId: school._id });
    expect(structure).toBeTruthy(); expect(invoice).toBeTruthy();
    const first = await post(`/fees/invoices/${invoice._id}/payments`, admin.token, { amount: 500, method: "cash", paymentDate: "2026-05-01" });
    expect(first.status).toBe(201);
    expect(await Notification.countDocuments({ tenantId: school._id, recipientUserId: studentAccount._id, eventType: "fee_payment_received" })).toBe(1);
    const partial = await FeeInvoice.findById(invoice._id);
    expect(partial.paidAmount).toBe(500); expect(partial.status).toBe("partial");
    expect((await post(`/fees/invoices/${invoice._id}/payments`, admin.token, { amount: 1001, method: "upi" })).status).toBe(400);
    const final = await post(`/fees/invoices/${invoice._id}/payments`, admin.token, { amount: 1000, method: "upi", reference: "UPI-TEST-1" });
    expect(final.status).toBe(201);
    const paid = await FeeInvoice.findById(invoice._id);
    expect(paid.paidAmount).toBe(1500); expect(paid.status).toBe("paid");
    const history = await request(`/fees/invoices/${invoice._id}/payments`, { token: admin.token });
    expect(history.status).toBe(200); expect(history.body.data).toHaveLength(2);
    expect(history.body.data.every((payment) => payment.receiptNumber)).toBe(true);
    const paymentToReverse = history.body.data.find((payment) => payment.method === "cash");
    const reversal = await request(`/fees/invoices/${invoice._id}/payments/${paymentToReverse._id}/reverse`, {
      token: admin.token, method: "PATCH", body: JSON.stringify({ reason: "Duplicate cash receipt entry" }),
    });
    expect(reversal.status).toBe(200);
    expect(reversal.body.data.status).toBe("reversed");
    expect(reversal.body.data.reversalReason).toBe("Duplicate cash receipt entry");
    expect(reversal.body.data.reversedAt).toBeTruthy();
    expect(await Notification.countDocuments({ tenantId: school._id, recipientUserId: studentAccount._id, eventType: "fee_payment_reversed" })).toBe(1);
    expect(String(reversal.body.data.reversedBy)).toBe(String(admin.user._id));
    const adjusted = await FeeInvoice.findById(invoice._id);
    expect(adjusted.paidAmount).toBe(1000);
    expect(adjusted.status).toBe("partial");
    const duplicateReversal = await request(`/fees/invoices/${invoice._id}/payments/${paymentToReverse._id}/reverse`, {
      token: admin.token, method: "PATCH", body: JSON.stringify({ reason: "Trying to reverse again" }),
    });
    expect(duplicateReversal.status).toBe(409);
    const crossTenant = await request(`/fees/invoices/${invoice._id}/payments/${paymentToReverse._id}/reverse`, {
      token: otherAdmin.token, method: "PATCH", body: JSON.stringify({ reason: "Cross tenant attempt" }),
    });
    expect(crossTenant.status).toBe(404);
    const updatedHistory = await request(`/fees/invoices/${invoice._id}/payments`, { token: admin.token });
    expect(updatedHistory.body.data).toHaveLength(2);
    expect(updatedHistory.body.data.find((payment) => payment._id === paymentToReverse._id).status).toBe("reversed");
    const outstanding = await request(`/fees/outstanding?academicYearId=${year._id}&overdueOnly=true`, { token: admin.token });
    expect(outstanding.status).toBe(200);
    expect(outstanding.body.data.some((item) => String(item._id) === String(invoice._id))).toBe(true);
    expect(outstanding.body.summary.invoiceCount).toBeGreaterThan(0);
    expect(outstanding.body.summary.overdueCount).toBeGreaterThan(0);
    expect(outstanding.body.summary.totalOutstanding).toBeGreaterThanOrEqual(500);
    expect((await request(`/fees/outstanding?academicYearId=${otherSchool._id}`, { token: admin.token })).status).toBe(404);
  });
});
