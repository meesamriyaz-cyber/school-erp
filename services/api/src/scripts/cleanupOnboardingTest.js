import "dotenv/config";

import mongoose from "mongoose";

import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Session from "../models/Session.js";

const SCHOOL_ID = "6acb5132ccf1ce038b184068";
const ADMIN_ID = "6acb5132ccf1ce038b184069";
const SCHOOL_SLUG = "tenant-context-test-988ef89e";
const ADMIN_EMAIL = "tenant-test-988ef89e@example.com";

const cleanup = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  let dbSession;

  try {
    dbSession = await mongoose.startSession();

    await dbSession.withTransaction(async () => {
      const school = await Tenant.findOne({
        _id: SCHOOL_ID,
        slug: SCHOOL_SLUG,
      }).session(dbSession);

      if (!school) {
        throw new Error("Expected test school was not found.");
      }

      const admin = await User.findOne({
        _id: ADMIN_ID,
        tenantId: school._id,
        email: ADMIN_EMAIL,
        role: "school_admin",
      }).session(dbSession);

      if (!admin) {
        throw new Error("Expected test administrator was not found.");
      }

      await Session.deleteMany(
        { userId: admin._id },
        { session: dbSession }
      );

      await User.deleteOne(
        { _id: admin._id, tenantId: school._id },
        { session: dbSession }
      );

      await Tenant.deleteOne(
        { _id: school._id, slug: SCHOOL_SLUG },
        { session: dbSession }
      );
    });

    console.log("Temporary tenant-context test records removed.");
  } finally {
    if (dbSession) {
      await dbSession.endSession();
    }

    await mongoose.disconnect();
  }
};

try {
  await cleanup();
} catch (error) {
  console.error("Cleanup failed:", error.message);
  process.exitCode = 1;
}