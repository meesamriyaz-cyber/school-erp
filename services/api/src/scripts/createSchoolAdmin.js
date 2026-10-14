import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import Tenant from "../models/Tenant.js";
import User from "../models/User.js";

const rl = readline.createInterface({ input: stdin, output: stdout });

const ask = (question) => rl.question(question);

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from the API environment.");
  }

  const schoolName = (await ask("School name: ")).trim();
  const slug = (await ask("School ID / slug (e.g. demo-school): "))
    .trim()
    .toLowerCase();
  const firstName = (await ask("Administrator first name: ")).trim();
  const lastName = (await ask("Administrator last name: ")).trim();
  const email = (await ask("Administrator email: ")).trim().toLowerCase();
  const password = await ask("Administrator password (12+ characters): ");
  const confirmation = await ask("Confirm password: ");

  if (!schoolName || !firstName || !email || !password || !slug) {
    throw new Error("School name, slug, administrator name, email and password are required.");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Slug must use lowercase letters, numbers and single hyphens.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (password.length < 6|| Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Password must be at least 12 characters and no more than 72 UTF-8 bytes.");
  }

  if (password !== confirmation) {
    throw new Error("Passwords do not match.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existingSchool = await Tenant.findOne({ slug }).select("_id").lean();

  if (existingSchool) {
    throw new Error(
      "That school slug already exists. Choose another slug; this script does not modify existing accounts.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const session = await mongoose.startSession();

  let createdSchool;
  let createdAdmin;

  try {
    await session.withTransaction(async () => {
      [createdSchool] = await Tenant.create(
        [
          {
            name: schoolName,
            slug,
            status: "active",
          },
        ],
        { session },
      );

      [createdAdmin] = await User.create(
        [
          {
            tenantId: createdSchool._id,
            firstName,
            lastName,
            email,
            passwordHash,
            role: "school_admin",
            status: "active",
            authVersion: 0,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  console.log("\nSchool and administrator created successfully.");
  console.log("-----------------------------------------------");
  console.log(`School: ${createdSchool.name}`);
  console.log(`School ID / slug: ${createdSchool.slug}`);
  console.log(`Administrator email: ${createdAdmin.email}`);
  console.log(`Role: ${createdAdmin.role}`);
  console.log("-----------------------------------------------");
  console.log("Use the slug, email and password you entered to sign in.");
}

main()
  .catch((error) => {
    console.error("\nSetup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });