import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url), override: false });

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Subject from "../models/Subject.js";
import { createAccessToken } from "../utils/tokens.js";

const EXPECTED_TEST_DATABASE = "school-erp-test";
let server;
let baseUrl;
const tenantIds = [];
const userIds = [];
let schoolA;
let schoolB;
let adminA;
let principalA;
let teacherA;
let adminB;

const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return { status: response.status, body: await response.json() };
};

const createSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenant = await Tenant.create({
    name: `Subject Test School ${label} ${suffix}`,
    slug: `subject-test-${label}-${suffix}`,
    status: "active",
  });
  tenantIds.push(tenant._id);
  return tenant;
};

const createUser = async (tenant, role) => {
  const user = await User.create({
    tenantId: tenant._id,
    firstName: "Subject",
    lastName: "Tester",
    email: `subject-${randomUUID()}@example.test`,
    passwordHash: "test-only-not-a-real-password-hash",
    role,
    status: "active",
    authVersion: 0,
  });
  userIds.push(user._id);
  return { user, token: createAccessToken(user) };
};

describe("Subject API integration", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: run tests with NODE_ENV=test");
    const match = typeof env.mongoUri === "string"
      ? env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/)
      : null;
    if (!match || decodeURIComponent(match[1]) !== EXPECTED_TEST_DATABASE) {
      throw new Error(`Safety stop: expected MONGO_TEST_URI database ${EXPECTED_TEST_DATABASE}`);
    }
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
      await mongoose.disconnect();
      throw new Error(`Safety stop: connected to unexpected database ${mongoose.connection.name}`);
    }
    await Promise.all([Tenant.init(), User.init(), Subject.init()]);
    schoolA = await createSchool("alpha");
    schoolB = await createSchool("beta");
    [adminA, principalA, teacherA, adminB] = await Promise.all([
      createUser(schoolA, "school_admin"),
      createUser(schoolA, "principal"),
      createUser(schoolA, "teacher"),
      createUser(schoolB, "school_admin"),
    ]);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      if (tenantIds.length) {
        await Subject.deleteMany({ tenantId: { $in: tenantIds } });
        await User.deleteMany({ _id: { $in: userIds } });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  it("requires authentication", async () => {
    const response = await request("/subjects");
    expect(response.status).toBe(401);
  });

  it("allows school administrators and principals to create subjects", async () => {
    const adminResponse = await request("/subjects", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ name: "Mathematics", code: "MATH" }),
    });
    const principalResponse = await request("/subjects", {
      method: "POST", token: principalA.token,
      body: JSON.stringify({ name: "English", category: "core" }),
    });
    expect(adminResponse.status).toBe(201);
    expect(String(adminResponse.body.data.tenantId)).toBe(String(schoolA._id));
    expect(principalResponse.status).toBe(201);
  });

  it("prevents teachers from creating or updating subjects", async () => {
    const created = await request("/subjects", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ name: "Science" }),
    });
    const response = await request(`/subjects/${created.body.data._id}`, {
      method: "PATCH", token: teacherA.token,
      body: JSON.stringify({ name: "General Science" }),
    });
    expect(response.status).toBe(403);
  });

  it("rejects a client-supplied tenantId", async () => {
    const response = await request("/subjects", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ name: "History", tenantId: String(schoolB._id) }),
    });
    expect(response.status).toBe(400);
  });

  it("returns only the requesting school's subjects", async () => {
    await request("/subjects", { method: "POST", token: adminA.token, body: JSON.stringify({ name: "Physics" }) });
    await request("/subjects", { method: "POST", token: adminB.token, body: JSON.stringify({ name: "Biology" }) });
    const response = await request("/subjects", { token: adminA.token });
    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.name)).toContain("Physics");
    expect(response.body.data.map((item) => item.name)).not.toContain("Biology");
  });

  it("prevents cross-school subject retrieval", async () => {
    const created = await request("/subjects", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ name: "Geography" }),
    });
    const response = await request(`/subjects/${created.body.data._id}`, { token: adminB.token });
    expect(response.status).toBe(404);
  });

  it("rejects duplicate names and codes within a school", async () => {
    const first = await request("/subjects", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ name: "Computer Science", code: "CS" }),
    });
    const duplicateName = await request("/subjects", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ name: "computer science", code: "CSE" }),
    });
    const duplicateCode = await request("/subjects", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ name: "Computing", code: "cs" }),
    });
    expect(first.status).toBe(201);
    expect(duplicateName.status).toBe(409);
    expect(duplicateCode.status).toBe(409);
  });

  it("allows teachers to search the subject catalogue", async () => {
    const response = await request("/subjects?search=math", { token: teacherA.token });
    expect(response.status).toBe(200);
    expect(response.body.data.some((item) => item.name === "Mathematics")).toBe(true);
  });
});
