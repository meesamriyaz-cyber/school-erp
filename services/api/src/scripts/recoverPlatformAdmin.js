
import "dotenv/config";

import mongoose from "mongoose";

import User from "../models/User.js";
import Session from "../models/Session.js";
import { hashPassword } from "../utils/password.js";

const recoverPlatformAdmin = async () => {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_RECOVERY_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_RECOVERY_PASSWORD in services/api/.env"
    );
  }

  if (password.length < 6) {
    throw new Error("Recovery password must contain at least 12 characters");
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Recovery password exceeds the bcrypt limit of 72 bytes");
  }

  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing from services/api/.env");
  }

  await mongoose.connect(mongoUri);

  let dbSession;

  try {
    const passwordHash = await hashPassword(password);

    dbSession = await mongoose.startSession();

    await dbSession.withTransaction(async () => {
      const admins = await User.find({
    role: "platform_admin",
    tenantId: null,
    })
    .select("+passwordHash _id email role tenantId authVersion")
    .session(dbSession);

      const matchingAdmins = admins.filter(
        (admin) => admin.email === email
      );

      if (matchingAdmins.length !== 1) {
        throw new Error(
          "Recovery cancelled: the configured email must match exactly one existing platform administrator."
        );
      }

      const admin = matchingAdmins[0];

      
const result = await User.updateOne(
  {
    _id: admin._id,
    role: "platform_admin",
    tenantId: null,
    email,
    passwordHash: admin.passwordHash,
    $or: [
      { authVersion: admin.authVersion },
      { authVersion: { $exists: false } },
    ],
  },
  {
    $set: { passwordHash },
    $inc: { authVersion: 1 },
  },
  {
    session: dbSession,
    runValidators: true,
  }
);


      if (result.matchedCount !== 1) {
        throw new Error(
          "Recovery cancelled: the administrator account changed during recovery."
        );
      }

      const now = new Date();

      await Session.updateMany(
        {
          userId: admin._id,
          revokedAt: null,
        },
        {
          $set: { revokedAt: now },
        },
        { session: dbSession }
      );

      console.log("Platform administrator password reset completed.");
      console.log({
        email: admin.email,
        role: admin.role,
        authVersionIncremented: true,
        existingSessionsRevoked: true,
      });
    });
  } finally {
    if (dbSession) {
      await dbSession.endSession();
    }
  }
};

try {
  await recoverPlatformAdmin();
} catch (error) {
  console.error("Platform admin recovery failed:", error.message);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
