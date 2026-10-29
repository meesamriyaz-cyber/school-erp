import mongoose from "mongoose";

import Tenant from "../models/Tenant.js";
import User, { USER_ROLES } from "../models/User.js";
import Session from "../models/Session.js";
import { hashPassword } from "../utils/password.js";
import { writeUserAudit, withAuditTransaction } from "../services/auditLogService.js";

const STATUSES = ["pending", "active", "suspended"];
const SCHOOL_ROLES = USER_ROLES.filter(
  (role) => role !== "platform_admin" && role !== "school_admin",
);
const PROFILE_FIELDS = ["firstName", "lastName", "email", "phone"];
const sendError = (res, status, message) => res.status(status).json({ success: false, message });

// authVersion is incremented atomically with role/status changes, so stale access
// tokens are invalid immediately. Session revocation is cleanup; if the database
// cleanup fails, report it to server logs without misreporting the committed change.
async function revokeSessionsAfterAuthChange(userId) {
  try {
    await Session.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  } catch (error) {
    console.error("Failed to revoke sessions after user authorization change", {
      userId: String(userId),
      error,
    });
  }
}

const isPlatformAdmin = (req) => req.auth?.role === "platform_admin";
const scopeFor = (req) => isPlatformAdmin(req)
  ? { tenantId: { $ne: null }, role: { $ne: "platform_admin" } }
  : { tenantId: req.auth.tenantId, role: { $nin: ["platform_admin", "school_admin"] } };

const serializeUser = (user) => ({
  id: String(user._id),
  tenantId: user.tenantId ? String(user.tenantId) : null,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone ?? null,
  role: user.role,
  status: user.status,
  lastLoginAt: user.lastLoginAt ?? null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const validId = (id) => mongoose.isObjectIdOrHexString(id);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function allowedRolesFor(req) {
  return isPlatformAdmin(req) ? SCHOOL_ROLES.concat("school_admin") : SCHOOL_ROLES;
}

function parsePageQuery(query) {
  const page = Number.parseInt(query.page ?? "1", 10);
  const limit = Number.parseInt(query.limit ?? "20", 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { error: "Page must be positive and limit must be between 1 and 100" };
  }
  return { page, limit };
}

function buildListFilter(req) {
  const filter = { ...scopeFor(req) };
  if (req.query.role !== undefined) {
    if (typeof req.query.role !== "string" || !allowedRolesFor(req).includes(req.query.role)) {
      return { error: "Invalid role filter" };
    }
    filter.role = req.query.role;
  }
  if (req.query.status !== undefined) {
    if (typeof req.query.status !== "string" || !STATUSES.includes(req.query.status)) {
      return { error: "Invalid status filter" };
    }
    filter.status = req.query.status;
  }
  if (req.query.tenantId !== undefined) {
    if (!isPlatformAdmin(req) || typeof req.query.tenantId !== "string" || !validId(req.query.tenantId)) {
      return { error: "Invalid school filter" };
    }
    filter.tenantId = new mongoose.Types.ObjectId(req.query.tenantId);
  }
  if (req.query.search !== undefined) {
    if (typeof req.query.search !== "string" || req.query.search.trim().length > 100) {
      return { error: "Search must not exceed 100 characters" };
    }
    const search = req.query.search.trim();
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ firstName: pattern }, { lastName: pattern }, { email: pattern }];
    }
  }
  return { filter };
}

export const listUsers = async (req, res, next) => {
  try {
    const pagination = parsePageQuery(req.query ?? {});
    if (pagination.error) return sendError(res, 400, pagination.error);
    const parsed = buildListFilter(req);
    if (parsed.error) return sendError(res, 400, parsed.error);
    const { page, limit } = pagination;
    const [users, total] = await Promise.all([
      User.find(parsed.filter)
        .select("_id tenantId firstName lastName email phone role status lastLoginAt createdAt updatedAt")
        .sort({ firstName: 1, lastName: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(parsed.filter),
    ]);
    return res.status(200).json({
      success: true,
      data: users.map(serializeUser),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : null;
    const role = body.role;
    const password = body.password;

    if (!firstName || firstName.length > 80) return sendError(res, 400, "First name is required and must not exceed 80 characters");
    if (lastName.length > 80) return sendError(res, 400, "Last name must not exceed 80 characters");
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 400, "Provide a valid email address");
    if (phone !== null && phone.length > 20) return sendError(res, 400, "Phone must not exceed 20 characters");
    if (typeof role !== "string" || !allowedRolesFor(req).includes(role)) return sendError(res, 400, "You cannot assign this role");
    if (typeof password !== "string" || password.length < 8) return sendError(res, 400, "Password must contain at least 8 characters");
    if (Buffer.byteLength(password, "utf8") > 72) return sendError(res, 400, "Password must not exceed 72 UTF-8 bytes");

    let tenantId;
    if (isPlatformAdmin(req)) {
      if (typeof body.tenantId !== "string" || !validId(body.tenantId)) return sendError(res, 400, "A valid school ID is required");
      tenantId = new mongoose.Types.ObjectId(body.tenantId);
    } else {
      tenantId = new mongoose.Types.ObjectId(req.auth.tenantId);
      if (body.tenantId !== undefined && String(body.tenantId) !== String(tenantId)) {
        return sendError(res, 403, "You cannot create users for another school");
      }
    }

    const tenant = await Tenant.findById(tenantId).select("_id status").lean();
    if (!tenant) return sendError(res, 404, "School not found");
    if (tenant.status !== "active") return sendError(res, 409, "Users can only be created for an active school");

    const passwordHash = await hashPassword(password);
    const user = await withAuditTransaction(async (session) => {
      const [createdUser] = await User.create([{
        tenantId, firstName, lastName, email, phone: phone || null,
        passwordHash, role, status: "pending", authVersion: 0,
      }], { session });
      await writeUserAudit({
        actorUserId: req.auth.userId,
        actorRole: req.auth.role,
        tenantId: req.auth.tenantId,
        targetUserId: createdUser._id,
        targetTenantId: createdUser.tenantId,
        action: "USER_CREATED",
        changedFields: ["firstName", "lastName", "email", "phone", "role", "status"],
        newValue: "pending",
      }, { session });
      return createdUser;
    });
    return res.status(201).json({
      success: true,
      message: "User created and awaiting activation",
      data: { user: serializeUser(user) },
    });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, "A user with this email already exists in this school");
    if (error.name === "ValidationError") return sendError(res, 400, "One or more user fields are invalid");
    return next(error);
  }
};

async function findScopedUser(req) {
  if (!validId(req.params.userId)) return { error: { status: 400, message: "Invalid user ID" } };
  const user = await User.findOne({ _id: req.params.userId, ...scopeFor(req) })
    .select("_id tenantId firstName lastName email phone role status authVersion lastLoginAt createdAt updatedAt")
    .lean();
  return user ? { user } : { error: { status: 404, message: "User not found" } };
}

export const getUserDetails = async (req, res, next) => {
  try {
    const result = await findScopedUser(req);
    if (result.error) return sendError(res, result.error.status, result.error.message);
    return res.status(200).json({ success: true, data: { user: serializeUser(result.user) } });
  } catch (error) {
    return next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const keys = Object.keys(body);
    if (!keys.length || keys.some((key) => !PROFILE_FIELDS.includes(key))) {
      return sendError(res, 400, "Only firstName, lastName, email, and phone may be updated");
    }
    const update = {};
    for (const field of PROFILE_FIELDS) {
      if (!(field in body)) continue;
      if (field === "firstName") {
        if (typeof body[field] !== "string" || !body[field].trim() || body[field].trim().length > 80) return sendError(res, 400, "First name is required and must not exceed 80 characters");
        update[field] = body[field].trim();
      } else if (field === "lastName") {
        if (typeof body[field] !== "string" || body[field].trim().length > 80) return sendError(res, 400, "Last name must not exceed 80 characters");
        update[field] = body[field].trim();
      } else if (field === "email") {
        if (typeof body[field] !== "string" || body[field].trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body[field].trim())) return sendError(res, 400, "Provide a valid email address");
        update[field] = body[field].trim().toLowerCase();
      } else {
        if (body[field] !== null && (typeof body[field] !== "string" || body[field].trim().length > 20)) return sendError(res, 400, "Phone must not exceed 20 characters");
        update[field] = typeof body[field] === "string" ? body[field].trim() || null : null;
      }
    }
    const result = await findScopedUser(req);
    if (result.error) return sendError(res, result.error.status, result.error.message);
    const user = await withAuditTransaction(async (session) => {
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.params.userId, ...scopeFor(req) },
        { $set: update },
        { new: true, runValidators: true, session },
      ).select("_id tenantId firstName lastName email phone role status authVersion lastLoginAt createdAt updatedAt").lean();
      if (!updatedUser) return null;
      await writeUserAudit({
        actorUserId: req.auth.userId, actorRole: req.auth.role, tenantId: req.auth.tenantId,
        targetUserId: updatedUser._id, targetTenantId: updatedUser.tenantId,
        action: "USER_PROFILE_UPDATED", changedFields: Object.keys(update),
      }, { session });
      return updatedUser;
    });
    if (!user) return sendError(res, 404, "User not found");
    return res.status(200).json({ success: true, message: "User profile updated", data: { user: serializeUser(user) } });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, "A user with this email already exists in this school");
    if (error.name === "ValidationError") return sendError(res, 400, "One or more user fields are invalid");
    return next(error);
  }
};

export const updateUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params ?? {};
    const { status } = req.body ?? {};
    if (!validId(userId)) return sendError(res, 400, "Invalid user ID");
    if (typeof status !== "string" || !STATUSES.includes(status)) return sendError(res, 400, "Status must be pending, active, or suspended");
    if (String(req.auth.userId) === String(userId)) return sendError(res, 403, "You cannot change your own account status");

    const current = await User.findOne({ _id: userId, ...scopeFor(req) })
      .select("_id tenantId firstName lastName email phone role status authVersion lastLoginAt createdAt updatedAt")
      .lean();
    if (!current) return sendError(res, 404, "User not found");
    if (current.status === status) return res.status(200).json({ success: true, message: "User already has the requested status", data: { user: serializeUser(current) } });
    const transitions = { pending: ["active"], active: ["suspended"], suspended: ["active"] };
    if (!transitions[current.status]?.includes(status)) return sendError(res, 400, `Cannot change user status from ${current.status} to ${status}`);

    const updated = await User.findOneAndUpdate(
      { _id: userId, ...scopeFor(req), status: current.status, $or: [{ authVersion: current.authVersion ?? 0 }, { authVersion: { $exists: false } }] },
      { $set: { status }, $inc: { authVersion: 1 } },
      { new: true, runValidators: true },
    ).select("_id tenantId firstName lastName email phone role status lastLoginAt createdAt updatedAt").lean();
    if (!updated) return sendError(res, 409, "User changed during this request; reload and try again");
    await revokeSessionsAfterAuthChange(updated._id);
    await writeUserAudit({
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
      tenantId: req.auth.tenantId,
      targetUserId: updated._id,
      targetTenantId: updated.tenantId,
      action: "USER_STATUS_CHANGED",
      changedFields: ["status"],
      previousValue: current.status,
      newValue: updated.status,
    });
    return res.status(200).json({ success: true, message: `User status updated to ${status}`, data: { user: serializeUser(updated) } });
  } catch (error) {
    return next(error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const { userId } = req.params ?? {};
    const { role } = req.body ?? {};
    if (!isPlatformAdmin(req)) return sendError(res, 403, "Only platform administrators may change user roles");
    if (!validId(userId)) return sendError(res, 400, "Invalid user ID");
    if (String(req.auth.userId) === String(userId)) return sendError(res, 403, "You cannot change your own role");
    if (typeof role !== "string" || !allowedRolesFor(req).includes(role)) return sendError(res, 400, "You cannot assign this role");
    const current = await User.findOne({ _id: userId, ...scopeFor(req) }).select("_id tenantId role status authVersion").lean();
    if (!current) return sendError(res, 404, "User not found");
    const updated = await User.findOneAndUpdate(
      { _id: userId, ...scopeFor(req), status: current.status, $or: [{ authVersion: current.authVersion ?? 0 }, { authVersion: { $exists: false } }] },
      { $set: { role }, $inc: { authVersion: 1 } },
      { new: true, runValidators: true },
    ).select("_id tenantId firstName lastName email phone role status lastLoginAt createdAt updatedAt").lean();
    if (!updated) return sendError(res, 409, "User changed during this request; reload and try again");
    await revokeSessionsAfterAuthChange(updated._id);
    await writeUserAudit({
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
      tenantId: req.auth.tenantId,
      targetUserId: updated._id,
      targetTenantId: updated.tenantId,
      action: "USER_ROLE_CHANGED",
      changedFields: ["role"],
      previousValue: current.role,
      newValue: updated.role,
    });
    return res.status(200).json({ success: true, message: "User role updated", data: { user: serializeUser(updated) } });
  } catch (error) {
    if (error.name === "ValidationError") return sendError(res, 400, "One or more user fields are invalid");
    return next(error);
  }
};
