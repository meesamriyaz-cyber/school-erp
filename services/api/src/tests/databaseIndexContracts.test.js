import { describe, expect, it } from "vitest";

import Student from "../models/Student.js";
import Enrollment from "../models/Enrollment.js";
import Attendance from "../models/Attendance.js";
import Examination from "../models/Examination.js";
import ExamMark from "../models/ExamMark.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import Notification from "../models/Notification.js";
import Message from "../models/Message.js";
import Homework from "../models/Homework.js";
import HomeworkSubmission from "../models/HomeworkSubmission.js";
import AuditOutbox from "../models/AuditOutbox.js";

const hasIndex = (model, expectedKeys) =>
  model.schema.indexes().some(([keys]) =>
    JSON.stringify(Object.entries(keys)) === JSON.stringify(Object.entries(expectedKeys))
  );

describe("database query index contracts", () => {
  it.each([
    ["student tenant/status listing", Student, { tenantId: 1, status: 1 }],
    ["enrollment year/status listing", Enrollment, { tenantId: 1, academicYearId: 1, status: 1 }],
    ["enrollment class/section roster", Enrollment, { tenantId: 1, classId: 1, sectionId: 1, status: 1 }],
    ["attendance daily class roster", Attendance, { tenantId: 1, classId: 1, sectionId: 1, date: 1 }],
    ["attendance academic-year history", Attendance, { tenantId: 1, academicYearId: 1, date: -1 }],
    ["examination class schedule", Examination, { tenantId: 1, academicYearId: 1, classId: 1, status: 1, startDate: 1 }],
    ["exam marks by examination and student", ExamMark, { tenantId: 1, examinationId: 1, studentId: 1 }],
    ["fee invoices by enrollment and year", FeeInvoice, { tenantId: 1, enrollmentId: 1, academicYearId: 1 }],
    ["fee payments by invoice and date", FeePayment, { tenantId: 1, invoiceId: 1, paymentDate: -1 }],
    ["recipient notification delivery queue", Notification, { tenantId: 1, recipientUserId: 1, deliveryStatus: 1, createdAt: -1 }],
    ["conversation message timeline", Message, { tenantId: 1, conversationId: 1, createdAt: 1, _id: 1 }],
    ["homework class/section due-date listing", Homework, { tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1, dueDate: 1 }],
    ["homework submission roster", HomeworkSubmission, { tenantId: 1, homeworkId: 1, enrollmentId: 1 }],
    ["audit outbox retry polling", AuditOutbox, { status: 1, nextAttemptAt: 1, createdAt: 1 }],
  ])("retains the %s index", (_label, model, keys) => {
    expect(hasIndex(model, keys)).toBe(true);
  });
});
