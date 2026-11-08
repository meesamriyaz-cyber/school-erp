import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url), override: false });
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import GradingScale from "../models/GradingScale.js";
import { createAccessToken } from "../utils/tokens.js";

const EXPECTED_TEST_DATABASE = "school-erp-test";
let server, baseUrl, schoolA, schoolB, adminA, principalA, teacherA, adminB;
const tenantIds = [], userIds = [];

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
    name: `Grading Test ${label} ${suffix}`,
    slug: `grading-test-${label}-${suffix}`,
    status: "active",
  });
  tenantIds.push(tenant._id);
  return tenant;
};

const createUser = async (tenant, role) => {
  const user = await User.create({
    tenantId: tenant._id,
    firstName: "Grading",
    lastName: "Tester",
    email: `grading-${randomUUID()}@example.test`,
    passwordHash: "test-only-not-a-real-password-hash",
    role,
    status: "active",
    authVersion: 0,
  });
  userIds.push(user._id);
  return { user, token: createAccessToken(user) };
};

const bands = [
  { grade: "F", minPercentage: 0, maxPercentage: 35 },
  { grade: "D", minPercentage: 35, maxPercentage: 50 },
  { grade: "C", minPercentage: 50, maxPercentage: 65 },
  { grade: "B", minPercentage: 65, maxPercentage: 80 },
  { grade: "A", minPercentage: 80, maxPercentage: 100 },
];

describe("Grading scale API", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") throw new Error("Safety stop: run tests with NODE_ENV=test");
    const match = typeof env.mongoUri === "string"
      ? env.mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/)
      : null;
    if (!match || decodeURIComponent(match[1]) !== EXPECTED_TEST_DATABASE) {
      throw new Error(`Safety stop: expected ${EXPECTED_TEST_DATABASE}`);
    }
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
      await mongoose.disconnect();
      throw new Error(`Safety stop: connected to unexpected database ${mongoose.connection.name}`);
    }
    await Promise.all([Tenant.init(), User.init(), GradingScale.init()]);
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
    if (server) await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
    if (mongoose.connection.readyState === 1) {
      if (tenantIds.length) {
        await GradingScale.deleteMany({ tenantId: { $in: tenantIds } });
        await User.deleteMany({ _id: { $in: userIds } });
        await Tenant.deleteMany({ _id: { $in: tenantIds } });
      }
      await mongoose.disconnect();
    }
  }, 30000);

  const payload = (name = "School grading") => ({ name, bands });

  it("creates a draft scale and exposes it only within its tenant", async () => {
    const created = await request("/grading-scales", {
      method: "POST", token: adminA.token, body: JSON.stringify(payload()),
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "School grading", status: "draft" });
    expect(String(created.body.data.tenantId)).toBe(String(schoolA._id));
    expect(String(created.body.data.createdBy)).toBe(String(adminA.user._id));

    const listed = await request("/grading-scales", { token: teacherA.token });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect((await request("/grading-scales", { token: adminB.token })).body.data).toHaveLength(0);
    expect((await request("/grading-scales/active", { token: adminA.token })).body.data).toBeNull();
  });

  it("rejects invalid bands and client-supplied ownership or lifecycle fields", async () => {
    const gapBands = [
      { grade: "F", minPercentage: 0, maxPercentage: 40 },
      { grade: "A", minPercentage: 41, maxPercentage: 100 },
    ];
    const invalidBands = await request("/grading-scales", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ name: "Invalid bands", bands: gapBands }),
    });
    expect(invalidBands.status).toBe(400);

    const spoofed = await request("/grading-scales", {
      method: "POST", token: adminA.token,
      body: JSON.stringify({ ...payload("Spoofed"), tenantId: String(schoolB._id), status: "active" }),
    });
    expect(spoofed.status).toBe(400);
  });

  it("allows draft edits, activates one scale per school and locks active configuration", async () => {
    const created = await request("/grading-scales", {
      method: "POST", token: adminA.token, body: JSON.stringify(payload("Editable scale")),
    });
    const id = created.body.data._id;
    const edited = await request(`/grading-scales/${id}`, {
      method: "PATCH", token: principalA.token,
      body: JSON.stringify({ description: "School-defined percentage bands" }),
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.description).toBe("School-defined percentage bands");

    const activated = await request(`/grading-scales/${id}/status`, {
      method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "active" }),
    });
    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe("active");

    const lockedEdit = await request(`/grading-scales/${id}`, {
      method: "PATCH", token: adminA.token,
      body: JSON.stringify({ name: "Changed after activation" }),
    });
    expect(lockedEdit.status).toBe(409);

    const second = await request("/grading-scales", {
      method: "POST", token: adminA.token, body: JSON.stringify(payload("Second scale")),
    });
    const conflict = await request(`/grading-scales/${second.body.data._id}/status`, {
      method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "active" }),
    });
    expect(conflict.status).toBe(409);
  });

  it("archives the active scale before allowing another scale to become active", async () => {
    const active = await GradingScale.findOne({ tenantId: schoolA._id, status: "active" });
    expect(active).toBeTruthy();
    const archived = await request(`/grading-scales/${active._id}/status`, {
      method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "archived" }),
    });
    expect(archived.status).toBe(200);
    const draft = await GradingScale.findOne({ tenantId: schoolA._id, status: "draft" });
    const activated = await request(`/grading-scales/${draft._id}/status`, {
      method: "PATCH", token: adminA.token, body: JSON.stringify({ status: "active" }),
    });
    expect(activated.status).toBe(200);
  });

  it("enforces management roles and tenant-scoped resource lookup", async () => {
    const teacherWrite = await request("/grading-scales", {
      method: "POST", token: teacherA.token, body: JSON.stringify(payload("Teacher attempt")),
    });
    expect(teacherWrite.status).toBe(403);
    const foreignScale = await GradingScale.create({
      tenantId: schoolB._id, name: "Other school scale", bands,
      createdBy: adminB.user._id, updatedBy: adminB.user._id,
    });
    const hidden = await request(`/grading-scales/${foreignScale._id}`, {
      method: "PATCH", token: adminA.token, body: JSON.stringify({ name: "Cross-tenant edit" }),
    });
    expect(hidden.status).toBe(404);
  });
});
