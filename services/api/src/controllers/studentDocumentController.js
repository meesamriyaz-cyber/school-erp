import crypto from "node:crypto";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import StudentDocument from "../models/StudentDocument.js";

const categories = ["birth_certificate", "identity_proof", "address_proof", "previous_school", "transfer_certificate", "medical", "photograph", "other"];
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const cloudinaryConfig = () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  apiKey: process.env.CLOUDINARY_API_KEY?.trim(),
  apiSecret: process.env.CLOUDINARY_API_SECRET?.trim(),
});

async function getStudent(req, res) {
  if (!mongoose.isValidObjectId(req.params.studentId)) {
    fail(res, 400, "Invalid student ID"); return null;
  }
  const student = await Student.findOne({ _id: req.params.studentId, tenantId: req.tenantId }).select("_id").lean();
  if (!student) fail(res, 404, "Student not found");
  return student;
}

export const createStudentDocumentSignature = async (req, res, next) => {
  try {
    const student = await getStudent(req, res);
    if (!student) return;
    const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
    if (!cloudName || !apiKey || !apiSecret) return fail(res, 503, "Cloudinary is not configured on the API server");
    const { category } = req.body || {};
    if (!categories.includes(category)) return fail(res, 400, "Select a valid document category");
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `school-erp/${req.tenantId}/students/${student._id}/documents/${category}`;
    const publicId = `${Date.now()}-${crypto.randomUUID()}`;
    const params = { allowed_formats: "pdf,jpg,jpeg,png", folder, public_id: publicId, timestamp };
    const signatureBase = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
    const signature = crypto.createHash("sha1").update(signatureBase + apiSecret).digest("hex");
    return res.json({ success: true, data: { cloudName, apiKey, timestamp, folder, publicId, signature, allowedFormats: params.allowed_formats, resourceType: "auto" } });
  } catch (error) { return next(error); }
};

export const listStudentDocuments = async (req, res, next) => {
  try {
    const student = await getStudent(req, res);
    if (!student) return;
    const documents = await StudentDocument.find({ tenantId: req.tenantId, studentId: student._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: documents });
  } catch (error) { return next(error); }
};

export const createStudentDocument = async (req, res, next) => {
  try {
    const student = await getStudent(req, res);
    if (!student) return;
    const { name, category, fileUrl, publicId, resourceType, format, bytes, notes = "", setAsProfilePhoto = false } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.length > 180) return fail(res, 400, "A valid document name is required");
    if (!categories.includes(category)) return fail(res, 400, "Select a valid document category");
    let parsedUrl;
    try { parsedUrl = new URL(fileUrl); } catch { return fail(res, 400, "A valid Cloudinary file URL is required"); }
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "res.cloudinary.com") return fail(res, 400, "Document URL must be a secure Cloudinary URL");
    const { cloudName } = cloudinaryConfig();
    if (!cloudName || !parsedUrl.pathname.startsWith(`/${cloudName}/`)) return fail(res, 400, "Document URL does not belong to the configured Cloudinary account");
    if (typeof publicId !== "string" || !publicId.startsWith(`school-erp/${req.tenantId}/students/${student._id}/documents/`) || publicId.length > 255) return fail(res, 400, "Invalid Cloudinary public ID");
    if (!["image", "raw"].includes(resourceType)) return fail(res, 400, "Invalid Cloudinary resource type");
    if (typeof format !== "string" || !/^[a-z0-9]{1,20}$/i.test(format)) return fail(res, 400, "Invalid file format");
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > 10485760) return fail(res, 400, "File size must not exceed 10 MB");
    if (typeof notes !== "string" || notes.length > 500) return fail(res, 400, "Notes must not exceed 500 characters");
    if (typeof setAsProfilePhoto !== "boolean") return fail(res, 400, "Invalid profile photo selection");
    if (setAsProfilePhoto && (category !== "photograph" || resourceType !== "image" || !["jpg", "jpeg", "png"].includes(format.toLowerCase()))) {
      return fail(res, 400, "Only an uploaded JPG or PNG photograph can be used as the student profile photo");
    }
    const document = await StudentDocument.create({
      tenantId: req.tenantId, studentId: student._id, name: name.trim(), category, fileUrl: parsedUrl.toString(),
      publicId, resourceType, format: format.toLowerCase(), bytes, notes: notes.trim(), uploadedBy: req.auth.userId,
    });
    if (setAsProfilePhoto) {
      await Student.updateOne({ _id: student._id, tenantId: req.tenantId }, { $set: { photoUrl: document.fileUrl } }, { runValidators: true });
    }
    return res.status(201).json({ success: true, data: document, profilePhotoUpdated: setAsProfilePhoto });
  } catch (error) { return next(error); }
};

export const deleteStudentDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.documentId)) return fail(res, 400, "Invalid document ID");
    const document = await StudentDocument.findOne({
      _id: req.params.documentId, tenantId: req.tenantId, studentId: req.params.studentId,
    });
    if (!document) return fail(res, 404, "Document not found");
    const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
    if (!cloudName || !apiKey || !apiSecret) return fail(res, 503, "Cloudinary is not configured on the API server");
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureBase = `public_id=${document.publicId}&timestamp=${timestamp}`;
    const signature = crypto.createHash("sha1").update(signatureBase + apiSecret).digest("hex");
    const form = new URLSearchParams({ public_id: document.publicId, timestamp: String(timestamp), api_key: apiKey, signature });
    const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${document.resourceType}/destroy`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const cloudResult = await cloudResponse.json();
    if (!cloudResponse.ok || !["ok", "not found"].includes(cloudResult.result)) {
      return fail(res, 502, cloudResult.error?.message || "Cloudinary could not delete the file");
    }
    await document.deleteOne();
    await Student.updateOne({ _id: document.studentId, tenantId: req.tenantId, photoUrl: document.fileUrl }, { $set: { photoUrl: null } });
    return res.json({ success: true, message: "Document and Cloudinary file deleted" });
  } catch (error) { return next(error); }
};
