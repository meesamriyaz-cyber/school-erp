
import mongoose from "mongoose";

import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { hashPassword } from "../utils/password.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const createSchool = async (req, res, next) => {
  let dbSession;

  try {
    const {
      school,
      admin,
    } = req.body ?? {};

    if (
      !school ||
      typeof school !== "object" ||
      Array.isArray(school) ||
      !admin ||
      typeof admin !== "object" ||
      Array.isArray(admin)
    ) {
      throw createHttpError(
        400,
        "Provide school and admin details"
      );
    }

    const name =
      typeof school.name === "string" ? school.name.trim() : "";

    const slug =
      typeof school.slug === "string"
        ? school.slug.trim().toLowerCase()
        : "";

    const contactEmail =
      typeof school.contactEmail === "string"
        ? school.contactEmail.trim().toLowerCase()
        : "";

    const timezone =
      typeof school.timezone === "string"
        ? school.timezone.trim()
        : "Asia/Kolkata";

    const firstName =
      typeof admin.firstName === "string"
        ? admin.firstName.trim()
        : "";

    const lastName =
      typeof admin.lastName === "string"
        ? admin.lastName.trim()
        : "";

    const email =
      typeof admin.email === "string"
        ? admin.email.trim().toLowerCase()
        : "";

    const password = admin.password;

    if (!name || name.length > 150) {
      throw createHttpError(
        400,
        "School name is required and must not exceed 150 characters"
      );
    }

    if (!SLUG_REGEX.test(slug) || slug.length > 80) {
      throw createHttpError(
        400,
        "Slug must contain lowercase letters, numbers, and single hyphens"
      );
    }

    if (
      contactEmail &&
      (contactEmail.length > 254 ||
        !EMAIL_REGEX.test(contactEmail))
    ) {
      throw createHttpError(
        400,
        "Provide a valid school contact email"
      );
    }

    if (!timezone || timezone.length > 100) {
      throw createHttpError(400, "Provide a valid timezone");
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      throw createHttpError(400, "Provide a valid timezone");
    }

    if (!firstName || firstName.length > 80) {
      throw createHttpError(
        400,
        "Administrator first name is required and must not exceed 80 characters"
      );
    }

    if (lastName.length > 80) {
      throw createHttpError(
        400,
        "Administrator last name must not exceed 80 characters"
      );
    }

    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      throw createHttpError(
        400,
        "Provide a valid administrator email"
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      throw createHttpError(
        400,
        "Administrator password must contain at least 8 characters"
      );
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      throw createHttpError(
        400,
        "Administrator password must not exceed 72 UTF-8 bytes"
      );
    }

    const passwordHash = await hashPassword(password);

    dbSession = await mongoose.startSession();

    let createdSchool;
    let createdAdmin;

    await dbSession.withTransaction(async () => {
      [createdSchool] = await Tenant.create(
        [
          {
            name,
            slug,
            contactEmail: contactEmail || null,
            timezone,
            status: "active",
          },
        ],
        { session: dbSession }
      );

      [createdAdmin] = await User.create(
        [
          {
            tenantId: createdSchool._id,
            firstName,
            lastName,
            email,
            passwordHash,
            role: "school_admin",
            status: "active",
          },
        ],
        { session: dbSession }
      );
    });

    return res.status(201).json({
      success: true,
      message: "School and school administrator created successfully",
      data: {
        school: {
          id: String(createdSchool._id),
          name: createdSchool.name,
          slug: createdSchool.slug,
          status: createdSchool.status,
        },
        admin: {
          id: String(createdAdmin._id),
          firstName: createdAdmin.firstName,
          lastName: createdAdmin.lastName,
          email: createdAdmin.email,
          role: createdAdmin.role,
          status: createdAdmin.status,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A school with this slug or an administrator with this email already exists in the school",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "One or more school or administrator fields are invalid",
      });
    }

    return next(error);
  } finally {
    if (dbSession) {
      await dbSession.endSession();
    }
  }
};


const SCHOOL_STATUSES = ["pending", "active", "suspended"];

// GET /api/v1/platform/schools
export const listSchools = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page ?? "1", 10);
    const limit = Number.parseInt(req.query.limit ?? "20", 10);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Page must be positive and limit must be between 1 and 100",
      });
    }

    const filter = {};
    if (req.query.status !== undefined) {
      if (
        typeof req.query.status !== "string" ||
        !SCHOOL_STATUSES.includes(req.query.status)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid school status filter",
        });
      }
      filter.status = req.query.status;
    }

    if (req.query.search !== undefined) {
      if (
        typeof req.query.search !== "string" ||
        req.query.search.trim().length > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Search must not exceed 100 characters",
        });
      }

      const search = req.query.search.trim();
      if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(escapedSearch, "i");
        filter.$or = [{ name: pattern }, { slug: pattern }];
      }
    }

    const [schools, total] = await Promise.all([
      Tenant.find(filter)
        .select("_id name slug status contactEmail timezone createdAt updatedAt")
        .sort({ name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Tenant.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: schools.map((school) => ({
        ...school,
        id: String(school._id),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

// PATCH /api/v1/platform/schools/:schoolId/status
export const updateSchoolStatus = async (req, res, next) => {
  try {
    const { schoolId } = req.params ?? {};
    const { status } = req.body ?? {};

    if (!mongoose.isObjectIdOrHexString(schoolId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid school ID",
      });
    }

    if (typeof status !== "string" || !SCHOOL_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be pending, active, or suspended",
      });
    }

    const school = await Tenant.findById(schoolId)
      .select("_id name slug status contactEmail timezone createdAt updatedAt")
      .lean();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    if (school.status === status) {
      return res.status(200).json({
        success: true,
        message: "School already has the requested status",
        data: { school: { ...school, id: String(school._id) } },
      });
    }

    const allowedTransitions = {
      pending: ["active"],
      active: ["suspended"],
      suspended: ["active"],
    };

    if (!allowedTransitions[school.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change school status from ${school.status} to ${status}`,
      });
    }

    // If an earlier suspension could not revoke every session, retry before
    // reactivation. A revocation error must leave the school suspended.
    if (school.status === "suspended" && status === "active") {
      await Session.updateMany(
        { tenantId: school._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }

    // Include the current status in the update filter to prevent stale writes.
    const updatedSchool = await Tenant.findOneAndUpdate(
      { _id: school._id, status: school.status },
      { $set: { status } },
      {
        new: true,
        runValidators: true,
      },
    )
      .select("_id name slug status contactEmail timezone createdAt updatedAt")
      .lean();

    if (!updatedSchool) {
      return res.status(409).json({
        success: false,
        message: "School status changed during this request; reload and try again",
      });
    }

    // Revoke every outstanding school session when suspending it. Access-token
    // checks block use immediately; revocation also prevents old refresh tokens
    // from becoming usable if the school is later reactivated.
    if (status === "suspended") {
      await Session.updateMany(
        { tenantId: school._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }

    return res.status(200).json({
      success: true,
      message: `School status updated to ${status}`,
      data: { school: { ...updatedSchool, id: String(updatedSchool._id) } },
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/v1/platform/schools/:schoolId
export const getSchoolDetails = async (req, res, next) => {
  try {
    const { schoolId } = req.params ?? {};

    if (!mongoose.isObjectIdOrHexString(schoolId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid school ID",
      });
    }

    const school = await Tenant.findById(schoolId)
      .select("_id name slug status contactEmail timezone createdAt updatedAt")
      .lean();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    const administrators = await User.find({
      tenantId: school._id,
      role: "school_admin",
    })
      .select("_id firstName lastName email status lastLoginAt createdAt")
      .sort({ firstName: 1, lastName: 1, _id: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        school: {
          ...school,
          id: String(school._id),
        },
        administrators: administrators.map((administrator) => ({
          ...administrator,
          id: String(administrator._id),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};
