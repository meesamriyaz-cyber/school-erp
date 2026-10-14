import mongoose from "mongoose";
import env from "../config/env.js";
import User from "../models/User.js";

const tenantId = "6acb564cde0c5106698095de";
const email = "isolation-admin-1383375035@example.com";

try {
  await mongoose.connect(env.mongoUri);

  const user = await User.findOne({
    tenantId,
    email: email.toLowerCase(),
  })
    .select("_id tenantId email role status authVersion")
    .lean();

  if (!user) {
    console.log("Test administrator not found for this tenant and email.");
  } else {
    console.log("Test administrator found:");
    console.log({
      id: String(user._id),
      tenantId: String(user.tenantId),
      email: user.email,
      role: user.role,
      status: user.status,
      authVersion: user.authVersion,
    });
  }
} catch (error) {
  console.error("Diagnostic failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}