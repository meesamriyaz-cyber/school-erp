import mongoose from "mongoose";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import GuardianCommunication from "../models/GuardianCommunication.js";
import { sendGuardianChannel } from "../services/guardianCommunicationService.js";

const validId = mongoose.isValidObjectId;
const invalid = (res, message) => res.status(400).json({ success: false, message });
const channels = ["sms", "whatsapp", "email"];

export const listStudentGuardianCommunication = async (req, res, next) => {
  try {
    if (!validId(req.params.studentId)) return invalid(res, "Invalid student ID");
    const student = await Student.findOne({ _id: req.params.studentId, tenantId: req.tenantId }).select("_id firstName lastName admissionNumber").lean();
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const relationships = await StudentGuardian.find({ tenantId: req.tenantId, studentId: student._id, status: "active" })
      .populate({ path: "guardianId", select: "firstName lastName phone email status", match: { tenantId: req.tenantId } })
      .sort({ isPrimary: -1, createdAt: 1 }).lean();
    const data = relationships.filter((item) => item.guardianId).map((item) => ({
      relationshipId: item._id, guardian: item.guardianId, relationship: item.relationship,
      isPrimary: item.isPrimary, isEmergencyContact: item.isEmergencyContact,
      receivesCommunication: item.receivesCommunication,
      communicationChannels: item.communicationChannels || [],
      preferredLanguage: item.preferredLanguage || "en",
      availableChannels: [
        ...(item.guardianId.phone ? ["sms", "whatsapp"] : []),
        ...(item.guardianId.email ? ["email"] : []),
      ],
    }));
    const history = await GuardianCommunication.find({ tenantId: req.tenantId, studentId: student._id })
      .populate("guardianId", "firstName lastName").populate("sentBy", "firstName lastName")
      .sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    return res.status(200).json({ success: true, student, data, history });
  } catch (error) { return next(error); }
};

export const sendGuardianCommunication = async (req, res, next) => {
  try {
    const body = req.body;
    if (!validId(req.params.studentId)) return invalid(res, "Invalid student ID");
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some((key) => !["guardianIds", "channels", "subject", "message"].includes(key))) {
      return invalid(res, "Provide only guardianIds, channels, subject and message");
    }
    if (!Array.isArray(body.guardianIds) || !body.guardianIds.length || body.guardianIds.length > 30 || body.guardianIds.some((id) => !validId(id))) return invalid(res, "Select between 1 and 30 valid guardians");
    if (!Array.isArray(body.channels) || !body.channels.length || body.channels.some((channel) => !channels.includes(channel)) || new Set(body.channels).size !== body.channels.length) return invalid(res, "Select one or more supported channels: sms, whatsapp, email");
    if (typeof body.message !== "string" || !body.message.trim() || body.message.trim().length > 5000) return invalid(res, "Message is required and cannot exceed 5,000 characters");
    if (body.subject !== undefined && (typeof body.subject !== "string" || body.subject.trim().length > 160)) return invalid(res, "Email subject must not exceed 160 characters");

    const student = await Student.findOne({ _id: req.params.studentId, tenantId: req.tenantId, status: "active" }).select("_id").lean();
    if (!student) return res.status(404).json({ success: false, message: "Active student not found" });
    const relationships = await StudentGuardian.find({
      tenantId: req.tenantId, studentId: student._id, guardianId: { $in: body.guardianIds },
      status: "active", receivesCommunication: true,
    }).populate({ path: "guardianId", select: "firstName lastName phone email status", match: { tenantId: req.tenantId, status: "active" } }).lean();
    const unique = new Map(relationships.filter((item) => item.guardianId).map((item) => [String(item.guardianId._id), item]));
    if (unique.size !== new Set(body.guardianIds).size) return res.status(403).json({ success: false, message: "One or more selected guardians are not linked, active, or opted in to school communications" });

    const records = [];
    for (const relationship of unique.values()) {
      const guardian = relationship.guardianId;
      const outcomes = [];
      for (const channel of body.channels) {
        const recipient = channel === "email" ? guardian.email : guardian.phone;
        if (!(relationship.communicationChannels || []).includes(channel)) {
          outcomes.push({ channel, recipient: recipient || "", status: "skipped", error: "Channel is not enabled in guardian preferences", attemptedAt: new Date() });
          continue;
        }
        if (!recipient) {
          outcomes.push({ channel, recipient: "", status: "skipped", error: "No contact detail available", attemptedAt: new Date() });
          continue;
        }
        try {
          const providerMessageId = await sendGuardianChannel({
            channel, recipient, message: body.message.trim(), subject: body.subject?.trim(),
          });
          outcomes.push({ channel, recipient, status: "accepted", providerMessageId, error: null, attemptedAt: new Date() });
        } catch (error) {
          outcomes.push({ channel, recipient, status: "failed", error: String(error?.message || "Provider error").slice(0, 240), attemptedAt: new Date() });
        }
      }
      const [record] = await GuardianCommunication.create([{
        tenantId: req.tenantId, studentId: student._id, guardianId: guardian._id,
        relationshipId: relationship._id, sentBy: req.auth.userId,
        subject: body.subject?.trim() || "", message: body.message.trim(), channels: outcomes,
      }]);
      records.push(record);
    }
    const summary = records.flatMap((record) => record.channels).reduce((result, item) => {
      result[item.status] += 1;
      return result;
    }, { accepted: 0, failed: 0, skipped: 0 });
    return res.status(201).json({ success: true, data: records, summary, message: "Provider acceptance is recorded per channel; final delivery depends on provider status callbacks." });
  } catch (error) { return next(error); }
};
