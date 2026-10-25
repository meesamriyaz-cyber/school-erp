
import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import { hashPassword } from "../utils/password.js";
import { createSchool } from "../controllers/platformController.js";

vi.mock("../models/Tenant.js", () => ({
  default: {
    create: vi.fn(),
  },
}));

vi.mock("../models/User.js", () => ({
  default: {
    create: vi.fn(),
  },
}));

vi.mock("../utils/password.js", () => ({
  hashPassword: vi.fn(),
}));



describe("createSchool controller", () => {
  let req;
  let res;
  let next;
  let dbSession;
  let withTransaction;

  const validBody = () => ({
    school: {
      name: "Test School",
      slug: "test-school",
      contactEmail: "school@example.com",
      timezone: "Asia/Kolkata",
    },
    admin: {
      firstName: "School",
      lastName: "Administrator",
      email: "admin@example.com",
      password: "StrongPassword123",
    },
  });

  vi.spyOn(mongoose, "startSession").mockResolvedValue(dbSession);

  beforeEach(() => {
    vi.clearAllMocks();

    req = { body: validBody() };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();

    withTransaction = vi.fn(async (callback) => callback());

    dbSession = {
      withTransaction,
      endSession: vi.fn().mockResolvedValue(undefined),
    };

    mongoose.startSession.mockResolvedValue(dbSession);

    hashPassword.mockResolvedValue("hashed-password");

    Tenant.create.mockImplementation(async ([school]) => [
      {
        _id: new mongoose.Types.ObjectId(),
        ...school,
      },
    ]);

    User.create.mockImplementation(async ([admin]) => [
      {
        _id: new mongoose.Types.ObjectId(),
        ...admin,
      },
    ]);
  });

  it("creates a school and administrator in a transaction", async () => {
    await createSchool(req, res, next);

    expect(hashPassword).toHaveBeenCalledWith("StrongPassword123");
    expect(withTransaction).toHaveBeenCalledOnce();
    expect(Tenant.create).toHaveBeenCalledOnce();
    expect(User.create).toHaveBeenCalledOnce();

    expect(Tenant.create.mock.calls[0][1]).toEqual({
      session: dbSession,
    });
    expect(User.create.mock.calls[0][1]).toEqual({
      session: dbSession,
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "School and school administrator created successfully",
        data: expect.objectContaining({
          school: expect.objectContaining({
            name: "Test School",
            slug: "test-school",
            status: "active",
          }),
          admin: expect.objectContaining({
            firstName: "School",
            email: "admin@example.com",
            role: "school_admin",
            status: "active",
          }),
        }),
      }),
    );

    expect(next).not.toHaveBeenCalled();
    expect(dbSession.endSession).toHaveBeenCalledOnce();
  });

  it("normalizes school and administrator fields", async () => {
    req.body.school.name = "  Test School  ";
    req.body.school.slug = "  TEST-SCHOOL  ";
    req.body.school.contactEmail = "  SCHOOL@EXAMPLE.COM  ";
    req.body.admin.firstName = "  School  ";
    req.body.admin.email = "  ADMIN@EXAMPLE.COM  ";

    await createSchool(req, res, next);

    expect(Tenant.create.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({
        name: "Test School",
        slug: "test-school",
        contactEmail: "school@example.com",
      }),
    );

    expect(User.create.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({
        firstName: "School",
        email: "admin@example.com",
        passwordHash: "hashed-password",
      }),
    );
  });

  it("uses the default timezone when none is supplied", async () => {
    delete req.body.school.timezone;

    await createSchool(req, res, next);

    expect(Tenant.create.mock.calls[0][0][0].timezone).toBe(
      "Asia/Kolkata",
    );
  });

  it.each([
    ["missing body", undefined],
    ["null body", null],
    ["missing school", { admin: validBody().admin }],
    ["school is an array", { school: [], admin: validBody().admin }],
    ["missing administrator", { school: validBody().school }],
    ["administrator is an array", { school: validBody().school, admin: [] }],
  ])("rejects invalid request structure: %s", async (_label, body) => {
    req.body = body;

    await createSchool(req, res, next);
    
   
    expect(next).toHaveBeenCalledWith(
    expect.objectContaining({
        statusCode: 400,
        message: "Provide school and admin details",
    }),
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();

    expect(hashPassword).not.toHaveBeenCalled();
    expect(Tenant.create).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
    expect(dbSession.endSession).not.toHaveBeenCalled();
  });

  it.each([
    ["empty school name", { name: "   " }, "School name is required and must not exceed 150 characters"],
    ["school name too long", { name: "S".repeat(151) }, "School name is required and must not exceed 150 characters"],
    ["invalid slug", { slug: "Bad Slug" }, "Slug must contain lowercase letters, numbers, and single hyphens"],
    ["slug too long", { slug: "a".repeat(81) }, "Slug must contain lowercase letters, numbers, and single hyphens"],
    ["invalid contact email", { contactEmail: "not-an-email" }, "Provide a valid school contact email"],
    ["empty timezone", { timezone: "   " }, "Provide a valid timezone"],
    ["unknown timezone", { timezone: "Mars/Olympus_Mons" }, "Provide a valid timezone"],
    ["first name missing", { adminFirstName: "   " }, "Administrator first name is required and must not exceed 80 characters"],
    ["last name too long", { adminLastName: "L".repeat(81) }, "Administrator last name must not exceed 80 characters"],
    ["invalid administrator email", { adminEmail: "bad-email" }, "Provide a valid administrator email"],
    ["password too short", { password: "short" }, "Administrator password must contain at least 8 characters"],
    ["password missing", { password: undefined }, "Administrator password must contain at least 8 characters"],
    ["password is not a string", { password: 12345678 }, "Administrator password must contain at least 8 characters"],
    ["school name is not a string", { name: 123 }, "School name is required and must not exceed 150 characters"],
    ["slug is not a string", { slug: 123 }, "Slug must contain lowercase letters, numbers, and single hyphens"],
    ["first name is not a string", { adminFirstName: 123 }, "Administrator first name is required and must not exceed 80 characters"],
    ["administrator email is not a string", { adminEmail: 123 }, "Provide a valid administrator email"],
  ])("validates input: %s", async (_label, changes, message) => {
    if ("name" in changes) req.body.school.name = changes.name;
    if ("slug" in changes) req.body.school.slug = changes.slug;
    if ("contactEmail" in changes) req.body.school.contactEmail = changes.contactEmail;
    if ("timezone" in changes) req.body.school.timezone = changes.timezone;
    if ("adminFirstName" in changes) req.body.admin.firstName = changes.adminFirstName;
    if ("adminLastName" in changes) req.body.admin.lastName = changes.adminLastName;
    if ("adminEmail" in changes) req.body.admin.email = changes.adminEmail;
    if ("password" in changes) req.body.admin.password = changes.password;

    await createSchool(req, res, next);

   
    expect(next).toHaveBeenCalledWith(
    expect.objectContaining({
        statusCode: 400,
        message,
    }),
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();

    expect(hashPassword).not.toHaveBeenCalled();
    expect(Tenant.create).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a duplicate key error occurs", async () => {
    Tenant.create.mockRejectedValue(
      Object.assign(new Error("Duplicate key"), { code: 11000 }),
    );

    await createSchool(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        "A school with this slug or an administrator with this email already exists in the school",
    });
    expect(dbSession.endSession).toHaveBeenCalledOnce();
  });

  it("returns 400 for a Mongoose validation error", async () => {
    Tenant.create.mockRejectedValue(
      Object.assign(new Error("Invalid model"), {
        name: "ValidationError",
      }),
    );

    await createSchool(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "One or more school or administrator fields are invalid",
    });
    expect(dbSession.endSession).toHaveBeenCalledOnce();
  });

  it("passes unexpected errors to next", async () => {
    Tenant.create.mockRejectedValue(new Error("Unexpected failure"));

    await createSchool(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Unexpected failure" }),
    );
    expect(dbSession.endSession).toHaveBeenCalledOnce();
  });

  it("passes transaction failures to next and ends the session", async () => {
    withTransaction.mockRejectedValue(new Error("Transaction failed"));

    await createSchool(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Transaction failed" }),
    );
    expect(dbSession.endSession).toHaveBeenCalledOnce();
  });

 
it("rejects passwords exceeding 72 UTF-8 bytes", async () => {
  req.body.admin.password = "é".repeat(37);

  await createSchool(req, res, next);

  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({
      statusCode: 400,
      message: "Administrator password must not exceed 72 UTF-8 bytes",
    }),
  );

  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).not.toHaveBeenCalled();
  expect(hashPassword).not.toHaveBeenCalled();
  expect(Tenant.create).not.toHaveBeenCalled();
  expect(User.create).not.toHaveBeenCalled();
  expect(mongoose.startSession).not.toHaveBeenCalled();
});

it("passes password hashing failures to next", async () => {
  hashPassword.mockRejectedValue(new Error("Password hashing failed"));

  await createSchool(req, res, next);

  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Password hashing failed" }),
  );
  expect(mongoose.startSession).not.toHaveBeenCalled();
  expect(Tenant.create).not.toHaveBeenCalled();
  expect(dbSession.endSession).not.toHaveBeenCalled();
});

it("passes session creation failures to next", async () => {
  mongoose.startSession.mockRejectedValue(
    new Error("Session creation failed"),
  );

  await createSchool(req, res, next);

  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Session creation failed" }),
  );
  expect(Tenant.create).not.toHaveBeenCalled();
  expect(User.create).not.toHaveBeenCalled();
  expect(dbSession.endSession).not.toHaveBeenCalled();
});
it("uses fallbacks for non-string optional fields", async () => {
  req.body.school.contactEmail = 123;
  req.body.school.timezone = 123;
  req.body.admin.lastName = 123;

  await createSchool(req, res, next);

  expect(res.status).toHaveBeenCalledWith(201);

  expect(Tenant.create.mock.calls[0][0][0]).toEqual(
    expect.objectContaining({
      contactEmail: null,
      timezone: "Asia/Kolkata",
    }),
  );

  expect(User.create.mock.calls[0][0][0]).toEqual(
    expect.objectContaining({
      lastName: "",
    }),
  );

  expect(next).not.toHaveBeenCalled();
});
});
