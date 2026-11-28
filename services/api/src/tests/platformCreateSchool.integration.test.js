import "dotenv/config";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import { createSchool } from "../controllers/platformController.js";

const testMongoUri = process.env.MONGO_TEST_URI;
const integrationDescribe = testMongoUri ? describe : describe.skip;

const getDatabaseName = (uri) => {
  try {
    const match = uri.match(
      /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/
    );

    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
};

integrationDescribe("createSchool MongoDB transaction integration", () => {
  let schoolSlug;
  let adminEmail;

  beforeAll(async () => {
    if (!testMongoUri) return;

    const databaseName = getDatabaseName(testMongoUri);
    if (!databaseName || !/test/i.test(databaseName)) {
      throw new Error(
        "Refusing integration test: MONGO_TEST_URI must target a database whose name includes 'test'."
      );
    }

    await mongoose.connect(testMongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
  }, 20000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it("rolls back school creation when administrator creation fails", async () => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    schoolSlug = `rollback-test-${uniqueSuffix}`;
    adminEmail = `rollback-${uniqueSuffix}@example.test`;

    const req = {
      body: {
        school: {
          name: "Rollback Integration Test School",
          slug: schoolSlug,
          contactEmail: `school-${uniqueSuffix}@example.test`,
          timezone: "Asia/Kolkata",
        },
        admin: {
          firstName: "Integration",
          lastName: "Test",
          email: adminEmail,
          password: "IntegrationTestPassword123",
        },
      },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();
    const injectedError = new Error("Intentional administrator creation failure");
    const userCreateSpy = vi
      .spyOn(User, "create")
      .mockRejectedValueOnce(injectedError);

    try {
      await createSchool(req, res, next);

      expect(next).toHaveBeenCalledWith(injectedError);
      expect(res.status).not.toHaveBeenCalled();

      const persistedSchool = await Tenant.findOne({ slug: schoolSlug }).lean();
      const persistedAdmin = await User.findOne({ email: adminEmail }).lean();

      expect(persistedSchool).toBeNull();
      expect(persistedAdmin).toBeNull();
    } finally {
      userCreateSpy.mockRestore();
      await Tenant.deleteOne({ slug: schoolSlug });
      await User.deleteOne({ email: adminEmail });
    }
  }, 30000);
});
