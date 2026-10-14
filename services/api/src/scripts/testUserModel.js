
import mongoose from "mongoose";
import User from "../models/User.js";

const testUserModel = async () => {
  const tenantId = new mongoose.Types.ObjectId();

  try {
    // Test 1: A school-level user with a tenant ID.
    const teacher = new User({
      tenantId,
      firstName: "Test",
      lastName: "Teacher",
      email: "teacher@example.com",
      passwordHash: "test-hash-not-a-real-password",
      role: "teacher",
    });

    await teacher.validate();

    console.log("PASS: School user validation");

    // Test 2: A platform administrator without a tenant ID.
    const platformAdmin = new User({
      firstName: "Platform",
      lastName: "Admin",
      email: "platform-admin@example.com",
      passwordHash: "test-hash-not-a-real-password",
      role: "platform_admin",
    });

    await platformAdmin.validate();

    console.log("PASS: Platform administrator validation");

    // Test 3: A school user without a tenant ID must fail.
    const invalidUser = new User({
      firstName: "Invalid",
      email: "invalid@example.com",
      passwordHash: "test-hash",
      role: "teacher",
    });

    try {
      await invalidUser.validate();
      throw new Error(
        "FAIL: School user without tenantId was accepted"
      );
    } catch (error) {
      if (error.name !== "ValidationError") {
        throw error;
      }

      console.log("PASS: School user without tenantId rejected");
    }

    console.log("All User model validation tests passed.");
  } catch (error) {
    console.error("User model test failed:", error.message);
    process.exitCode = 1;
  }
};

await testUserModel();
