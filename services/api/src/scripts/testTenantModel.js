
import "dotenv/config";

import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";

const testTenantModel = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const tenant = new Tenant({
      name: "Green Valley Public School",
      slug: "green-valley-srinagar",
      contactEmail: "admin@example.com",
    });

    await tenant.validate();

    console.log("Tenant model validation successful.");
    console.log({
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      timezone: tenant.timezone,
    });
  } catch (error) {
    console.error("Tenant model validation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

await testTenantModel();
