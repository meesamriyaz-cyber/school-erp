
import mongoose from "mongoose";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Session from "../models/Session.js";

const testSchoolSlugs = [
  "student-api-test-2b875db1",
  "student-isolation-test-1196597193",
];

const testAdminEmails = [
  "student-admin-2b875db1@example.com",
  "isolation-admin-1383375035@example.com",
];

try {
  await mongoose.connect(env.mongoUri);

  // Resolve only the explicitly named test schools.
  const tenants = await Tenant.find({
    slug: { $in: testSchoolSlugs },
  })
    .select("_id slug")
    .lean();

  const tenantIds = tenants.map((tenant) => tenant._id);

  // Safety check: do not delete anything if the expected test
  // schools cannot be identified.
  if (tenantIds.length !== testSchoolSlugs.length) {
    throw new Error(
      `Expected ${testSchoolSlugs.length} test schools, found ${tenantIds.length}. Nothing was deleted.`
    );
  }

  const users = await User.find({
    tenantId: { $in: tenantIds },
    email: { $in: testAdminEmails },
    role: "school_admin",
  })
    .select("_id email tenantId")
    .lean();

  if (users.length !== testAdminEmails.length) {
    throw new Error(
      `Expected ${testAdminEmails.length} test administrators, found ${users.length}. Nothing was deleted.`
    );
  }

  const userIds = users.map((user) => user._id);

  // Remove sessions and students only within these test tenants.
  await Session.deleteMany({ userId: { $in: userIds } });
  const studentResult = await Student.deleteMany({
    tenantId: { $in: tenantIds },
  });

  await User.deleteMany({
    _id: { $in: userIds },
    tenantId: { $in: tenantIds },
    role: "school_admin",
    email: { $in: testAdminEmails },
  });

  await Tenant.deleteMany({
    _id: { $in: tenantIds },
    slug: { $in: testSchoolSlugs },
  });

  console.log("Temporary Student API test data cleaned up.");
  console.log("Test schools removed:", tenants.length);
  console.log("Test administrators removed:", users.length);
  console.log("Test students removed:", studentResult.deletedCount);
} catch (error) {
  console.error("Cleanup failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
