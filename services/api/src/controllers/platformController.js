
import mongoose from "mongoose";

import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
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
