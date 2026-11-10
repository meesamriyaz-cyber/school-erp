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
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import AcademicYear from "../models/AcademicYear.js";
import SchoolClass from "../models/SchoolClass.js";
import Enrollment from "../models/Enrollment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import { createAccessToken } from "../utils/tokens.js";
import { processPendingNotifications } from "../services/notificationDeliveryService.js";

const TEST_DATABASE = "school-erp-test";
let server, baseUrl, school, otherSchool, admin, parent, teacher, outsider, student, guardian, enrollment, assignment, link;

const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return { status: response.status, body: await response.json() };
};
const suffix = () => randomUUID().replaceAll("-", "").slice(0, 10);
const createSchool = async (name) => Tenant.create({ name: `Messaging ${name} ${suffix()}`, slug: `messaging-${name}-${suffix()}`, status: "active" });
const createUser = async (tenant, role) => {
  const user = await User.create({
    tenantId: tenant._id, firstName: role, lastName: "Messaging",
    email: `${role}-${suffix()}@example.test`, passwordHash: "test-only",
    role, status: "active", authVersion: 0,
  });
  return { user, token: createAccessToken(user) };
};

describe("Parent teacher messaging API integration", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: NODE_ENV=test is required.");
    const match = typeof env.mongoUri === "string" ? env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/) : null;
    if (!match || decodeURIComponent(match[1]) !== TEST_DATABASE) throw new Error(`Safety stop: expected ${TEST_DATABASE} database.`);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== TEST_DATABASE) throw new Error("Safety stop: connected to an unexpected database.");
    await Promise.all([
      Tenant.init(), User.init(), Student.init(), Guardian.init(), StudentGuardian.init(),
      AcademicYear.init(), SchoolClass.init(), Enrollment.init(), TeacherAssignment.init(),
      Conversation.init(), Message.init(), Notification.init(),
    ]);
    school = await createSchool("primary");
    otherSchool = await createSchool("other");
    [admin, parent, teacher, outsider] = await Promise.all([
      createUser(school, "school_admin"), createUser(school, "parent"),
      createUser(school, "teacher"), createUser(otherSchool, "teacher"),
    ]);
    const year = await AcademicYear.create({
      tenantId: school._id, name: `2026-27-${suffix()}`,
      startDate: "2026-04-01", endDate: "2027-03-31", status: "active",
    });
    const schoolClass = await SchoolClass.create({ tenantId: school._id, academicYearId: year._id, name: "Class 6" });
    student = await Student.create({
      tenantId: school._id, admissionNumber: `MSG-${suffix()}`,
      firstName: "Messaging", lastName: "Student", admissionDate: new Date("2026-04-01"),
    });
    guardian = await Guardian.create({
      tenantId: school._id, userId: parent.user._id, firstName: "Parent",
      lastName: "Messaging", status: "active",
    });
    link = await StudentGuardian.create({
      tenantId: school._id, studentId: student._id, guardianId: guardian._id,
      relationship: "mother", isPrimary: true, canAccessPortal: true,
      receivesCommunication: true, status: "active",
    });
    enrollment = await Enrollment.create({
      tenantId: school._id, studentId: student._id, academicYearId: year._id,
      classId: schoolClass._id, status: "active",
    });
    assignment = await TeacherAssignment.create({
      tenantId: school._id, teacherId: teacher.user._id, subjectId: new mongoose.Types.ObjectId(),
      academicYearId: year._id, classId: schoolClass._id, sectionId: null,
      assignedBy: admin.user._id, status: "active",
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (school?._id) {
        await Notification.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await Message.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await Conversation.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await TeacherAssignment.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await StudentGuardian.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await Enrollment.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await Student.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await Guardian.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await AcademicYear.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await SchoolClass.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await User.deleteMany({ tenantId: { $in: [school._id, otherSchool?._id] } });
        await Tenant.deleteMany({ _id: { $in: [school._id, otherSchool?._id] } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  it("allows an authorized parent to initiate a conversation with an assigned teacher", async () => {
    const contacts = await request("/messaging/contacts", { token: parent.token });
    expect(contacts.status).toBe(200);
    expect(contacts.body.data.some((item) => String(item.teacher._id) === String(teacher.user._id)
      && item.students.some((entry) => String(entry._id) === String(student._id)))).toBe(true);
    const created = await request("/messaging/conversations", {
      method: "POST", token: parent.token,
      body: JSON.stringify({ studentId: String(student._id), teacherId: String(teacher.user._id), message: "Could we discuss the homework?" }),
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("open");
    expect(String(created.body.data.studentId._id)).toBe(String(student._id));
    const stored = await Message.findOne({ tenantId: school._id, conversationId: created.body.data._id }).lean();
    expect(stored).toMatchObject({ senderRole: "parent", body: "Could we discuss the homework?" });
    const teacherNotice = await Notification.findOne({ tenantId: school._id, recipientUserId: teacher.user._id, eventType: "message_received" });
    expect(teacherNotice).toBeTruthy();
    await processPendingNotifications({ notificationId: teacherNotice._id });
    await teacherNotice.reload?.();
    expect((await Notification.findById(teacherNotice._id).lean()).deliveryStatus).toBe("delivered");
  });

  it("allows the assigned teacher to reply and tracks unread and read state", async () => {
    const conversation = await Conversation.findOne({ tenantId: school._id, studentId: student._id }).lean();
    const sent = await request(`/messaging/conversations/${conversation._id}/messages`, {
      method: "POST", token: teacher.token, body: JSON.stringify({ body: "Certainly. Let us discuss after class." }),
    });
    expect(sent.status).toBe(201);
    const refreshed = await Conversation.findById(conversation._id).lean();
    expect(refreshed.parentUnreadCount).toBe(1);
    const read = await request(`/messaging/conversations/${conversation._id}/read`, { method: "PATCH", token: parent.token });
    expect(read.status).toBe(200);
    const afterRead = await Conversation.findById(conversation._id).lean();
    expect(afterRead.parentUnreadCount).toBe(0);
    expect(await Notification.countDocuments({ tenantId: school._id, recipientUserId: parent.user._id, eventType: "message_received", readAt: null })).toBe(0);
  });

  it("denies cross-tenant and unrelated teacher access to conversation content", async () => {
    const conversation = await Conversation.findOne({ tenantId: school._id, studentId: student._id }).lean();
    const response = await request(`/messaging/conversations/${conversation._id}/messages`, { token: outsider.token });
    expect(response.status).toBe(404);
  });

  it("revokes parent access immediately when the guardian relationship is deactivated", async () => {
    const conversation = await Conversation.findOne({ tenantId: school._id, studentId: student._id }).lean();
    await StudentGuardian.updateOne({ _id: link._id }, { $set: { status: "inactive" } });
    const response = await request(`/messaging/conversations/${conversation._id}/messages`, { token: parent.token });
    expect(response.status).toBe(404);
  });

  it("revokes teacher access when the related teaching assignment is deactivated", async () => {
    const conversation = await Conversation.findOne({ tenantId: school._id, studentId: student._id }).lean();
    await TeacherAssignment.updateOne({ _id: assignment._id }, { $set: { status: "inactive" } });
    const response = await request(`/messaging/conversations/${conversation._id}/messages`, { token: teacher.token });
    expect(response.status).toBe(404);
  });

  it("rejects unsupported conversation and message payload fields", async () => {
    const conversation = await Conversation.findOne({ tenantId: school._id, studentId: student._id }).lean();
    const create = await request("/messaging/conversations", {
      method: "POST", token: parent.token,
      body: JSON.stringify({ studentId: String(student._id), teacherId: String(teacher.user._id), message: "Hello", tenantId: String(otherSchool._id) }),
    });
    const send = await request(`/messaging/conversations/${conversation._id}/messages`, {
      method: "POST", token: teacher.token, body: JSON.stringify({ body: "Hello", senderRole: "parent" }),
    });
    expect(create.status).toBe(400);
    expect(send.status).toBe(400);
  });

  it("exposes only conversation metadata to school administrators", async () => {
    const response = await request("/messaging/oversight", { token: admin.token });
    expect(response.status).toBe(200);
    expect(response.body.contentAccess).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("Could we discuss the homework?");
    expect(JSON.stringify(response.body)).not.toContain("Let us discuss after class");
  });
});
