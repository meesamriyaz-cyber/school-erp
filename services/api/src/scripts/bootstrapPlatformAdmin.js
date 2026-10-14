
import "dotenv/config";

import mongoose from "mongoose";

import User from "../models/User.js";
import { hashPassword } from "../utils/password.js";

const bootstrapPlatformAdmin = async () => {
  const firstName = process.env.PLATFORM_ADMIN_FIRST_NAME?.trim();
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!firstName || !email || !password) {
    throw new Error(
      "Set PLATFORM_ADMIN_FIRST_NAME, PLATFORM_ADMIN_EMAIL, and PLATFORM_ADMIN_PASSWORD in services/api/.env"
    );
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Platform admin password exceeds the bcrypt limit");
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const existingAdmin = await User.exists({
      role: "platform_admin",
    });

    if (existingAdmin) {
      throw new Error(
        "A platform administrator already exists. Bootstrap cancelled."
      );
    }

    const passwordHash = await hashPassword(password);

    const admin = await User.create({
      firstName,
      email,
      passwordHash,
      role: "platform_admin",
      tenantId: null,
      status: "active",
    });

    console.log("Platform administrator created successfully.");
    console.log({
      id: String(admin._id),
      email: admin.email,
      role: admin.role,
      status: admin.status,
    });
  } finally {
    await mongoose.disconnect();
  }
};

try {
  await bootstrapPlatformAdmin();
} catch (error) {
  console.error("Platform admin bootstrap failed:", error.message);
  process.exitCode = 1;
}
