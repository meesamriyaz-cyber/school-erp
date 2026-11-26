import crypto from "node:crypto";
import mongoose from "mongoose";
import Guardian from "../models/Guardian.js";

const fail = (res, status, message) => res.status(status).json({ success: false, message });

export const createGuardianPhotoSignature = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.guardianId)) return fail(res, 400, "Invalid guardian ID");
    const guardian = await Guardian.findOne({ _id: req.params.guardianId, tenantId: req.tenantId }).select("_id").lean();
    if (!guardian) return fail(res, 404, "Guardian not found");
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloudName || !apiKey || !apiSecret) return fail(res, 503, "Cloudinary is not configured on the API server");
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `school-erp/${req.tenantId}/guardians/${guardian._id}/profile`;
    const publicId = `parent-${Date.now()}-${crypto.randomUUID()}`;
    const params = { allowed_formats: "jpg,jpeg,png", folder, public_id: publicId, timestamp };
    const signatureBase = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
    const signature = crypto.createHash("sha1").update(signatureBase + apiSecret).digest("hex");
    return res.json({ success: true, data: { cloudName, apiKey, timestamp, folder, publicId, signature, allowedFormats: params.allowed_formats } });
  } catch (error) { return next(error); }
};
