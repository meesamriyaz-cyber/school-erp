
import { afterAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import User, { USER_ROLES } from "../models/User.js";

describe("User model", () => {
  afterAll(async () => {
    await mongoose.deleteModel(/User/);
  });

  it("exports all supported user roles", () => {
    expect(USER_ROLES).toContain("platform_admin");
    expect(USER_ROLES).toContain("school_admin");
    expect(USER_ROLES).toContain("teacher");
    expect(USER_ROLES).toContain("student");
    expect(USER_ROLES).toContain("parent");
  });

  it("allows a platform administrator without a tenant", async () => {
    const user = new User({
      firstName: "Platform",
      email: "platform@example.com",
      passwordHash: "test-hash",
      role: "platform_admin",
      tenantId: null,
    });

    await expect(user.validate()).resolves.toBeUndefined();
  });

  it("rejects a platform administrator with a tenant", async () => {
    const user = new User({
      firstName: "Platform",
      email: "platform@example.com",
      passwordHash: "test-hash",
      role: "platform_admin",
      tenantId: new mongoose.Types.ObjectId(),
    });

    await expect(user.validate()).rejects.toThrow(
      "School users must belong to a school; platform administrators must not belong to a school."
    );
  });

  it("allows a school user with a tenant", async () => {
    const user = new User({
      firstName: "Teacher",
      email: "teacher@example.com",
      passwordHash: "test-hash",
      role: "teacher",
      tenantId: new mongoose.Types.ObjectId(),
    });

    await expect(user.validate()).resolves.toBeUndefined();
  });

  it("rejects a school user without a tenant", async () => {
    const user = new User({
      firstName: "Teacher",
      email: "teacher@example.com",
      passwordHash: "test-hash",
      role: "teacher",
      tenantId: null,
    });

    await expect(user.validate()).rejects.toThrow(
      "School users must belong to a school; platform administrators must not belong to a school."
    );
  });
});
