import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import User from "../models/User.js";

const rl = readline.createInterface({ input: stdin, output: stdout });

async function main() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing from the API environment.");
  }

  const firstName = (await rl.question("Administrator first name: ")).trim();
  const lastName = (await rl.question("Administrator last name: ")).trim();
  const email = (
    await rl.question("Administrator email address: ")
  ).trim().toLowerCase();

  const password = await rl.question("New administrator password: ");
  const confirmPassword = await rl.question("Confirm password: ");

  if (!firstName || !email || !password) {
    throw new Error("First name, email, and password are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Password must not exceed 72 UTF-8 bytes.");
  }

  if (password.length < 6) {
    throw new Error("Use a password of at least 6 characters.");
  }

  if (password !== confirmPassword) {
    throw new Error("Passwords do not match.");
  }

  await mongoose.connect(mongoUri);

  // Refuse duplicates; this script creates accounts but does not
  // silently reset existing accounts or change their privileges.
  const existing = await User.findOne({
    email,
    role: "platform_admin",
    tenantId: null,
  }).select("_id email");

  if (existing) {
    throw new Error(
      "A platform administrator with this email already exists. " +
        "Use your existing account or a separate, reviewed recovery procedure.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await User.create({
    tenantId: null,
    firstName,
    lastName,
    email,
    passwordHash,
    role: "platform_admin",
    status: "active",
    authVersion: 0,
  });

  console.log("\nPlatform administrator created successfully.");
  console.log(`Email: ${admin.email}`);
  console.log(`Role: ${admin.role}`);
  console.log(`User ID: ${admin._id}`);
  console.log("\nKeep the password private; it is not displayed again.");
}

main()
  .catch((error) => {
    console.error("\nCreation failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });