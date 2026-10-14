
import mongoose from "mongoose";
import env from "../config/env.js";
import User from "../models/User.js";
import { hashPassword } from "../utils/password.js";

const adminId = "6acb564cde0c5106698095df";
const tenantId = "6acb564cde0c5106698095de";
const email = "isolation-admin-1383375035@example.com";
const temporaryPassword = "TemporaryIsolationPass123!";

try {
  await mongoose.connect(env.mongoUri);

  const passwordHash = await hashPassword(temporaryPassword);

  const result = await User.updateOne(
    {
      _id: new mongoose.Types.ObjectId(adminId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      email,
      role: "school_admin",
      status: "active",
    },
    {
      $set: { passwordHash },
      $inc: { authVersion: 1 },
    }
  );

  if (result.matchedCount !== 1) {
    throw new Error(
      "The expected active test administrator was not found. No password was reset."
    );
  }

  console.log("Temporary School B administrator password reset successfully.");
  console.log("Email:", email);
  console.log("Password: TemporaryIsolationPass123!");
  console.log("Only the specified test account was targeted.");
} catch (error) {
  console.error("Password reset failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
