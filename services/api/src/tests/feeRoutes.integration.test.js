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
import FeeStructure from "../models/FeeStructure.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import { createAccessToken } from "../utils/tokens.js";

let server, baseUrl, school, otherSchool, admin, otherAdmin, year, schoolClass, student, enrollment;
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
    const match = env.mongoUri.match(/^mongodb(?:\\+srv)?:\\/\\/[^/]+\\/([^?]+)(?:\\?.*)?$/);
    if (!match || decodeURIComponent(match[1]) !== "school-erp-test") throw new Error("Safety stop: expected school-erp-test database.");
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== "school-erp-test") throw new Error("Safety stop: unexpected database.");
    await Promise.all([Tenant.init(), User.init(), Student.init(), AcademicYear.init(), SchoolClass.init(), Enrollment.init(), FeeStructure.init(), FeeInvoice.init(), FeePayment.init()]);
    school = await makeSchool("main"); otherSchool = await makeSchool("other");
    admin = await makeAdmin(school); otherAdmin = await makeAdmin(otherSchool);
    year = await AcademicYear.create({ tenantId: school._id, name: `AY-${randomUUID().slice(0, 8)}`, startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    schoolClass = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class 5" });
    student = await Student.create({ tenantId: school._id, admissionNumber: `FEE-${randomUUID().slice(0, 8)}`, firstName: "Test", lastName: "Pupil", admissionDate: new Date("2026-04-01") });
    enrollment = await Enrollment.create({ tenantId: school._id, studentId: student._id, academicYearId: year._id, classId: schoolClass._id, status: "active" });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (school?._id && otherSchool?._id) {
        await FeePayment.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await FeeInvoice.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await FeeStructure.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
        await Enrollment.deleteMany({ tenantId: { $in: [school._id, otherSchool._id] } });
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
    expect((await request("/fees/invoices", { token: otherAdmin.token })).body.data).toHaveLength(0);
    expect((await post("/fees/invoices", otherAdmin.token, {
      enrollmentId: String(enrollment._id), feeStructureId: structure.body.data._id,
      invoiceNumber: "CROSS-TENANT", dueDate: "2026-05-10",
    })).status).toBe(404);
    this.invoiceId = invoice.body.data._id;
  });

  it("records partial and final payments, prevents overpayment, and exposes receipt history", async () => {
    const structure = await FeeStructure.findOne({ tenantId: school._id });
    const invoice = await FeeInvoice.findOne({ tenantId: school._id });
    expect(structure).toBeTruthy(); expect(invoice).toBeTruthy();
    const first = await post(`/fees/invoices/${invoice._id}/payments`, admin.token, { amount: 500, method: "cash", paymentDate: "2026-05-01" });
    expect(first.status).toBe(201);
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
  });
});
