
import dotenv from "dotenv";

dotenv.config({
  path: new URL("../../.env", import.meta.url),
  override: false,
});

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import app from "../app.js";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import StudentGuardian from "../models/StudentGuardian.js";
import { createAccessToken } from "../utils/tokens.js";

const EXPECTED_TEST_DATABASE = "school-erp-test";

let server;
let baseUrl;

const createdTenantIds = [];
const createdUserIds = [];

let schoolA;
let schoolB;
let adminA;
let principalA;
let teacherA;
let adminB;

const request = async (path, { token, ...options } = {}) => {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  return {
    status: response.status,
    body: await response.json(),
  };
};

const createSchool = async (label) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

  const tenant = await Tenant.create({
    name: `Guardian Test School ${label} ${suffix}`,
    slug: `guardian-test-${label}-${suffix}`,
    status: "active",
  });

  createdTenantIds.push(tenant._id);
  return tenant;
};

const createTestUser = async (tenant, role) => {
  const suffix = randomUUID();

  const user = await User.create({
    tenantId: tenant._id,
    firstName: "Guardian",
    lastName: "Tester",
    email: `guardian-test-${suffix}@example.test`,
    passwordHash: "test-only-not-a-real-password-hash",
    role,
    status: "active",
    authVersion: 0,
  });

  createdUserIds.push(user._id);

  return {
    user,
    token: createAccessToken(user),
  };
};

const createStudent = async (token) => {
  const response = await request("/students", {
    method: "POST",
    token,
    body: JSON.stringify({
      admissionNumber: `GUARD-${randomUUID()}`,
      firstName: "Test Student",
      lastName: "Guardian",
      admissionDate: "2026-04-01",
      gender: "not_specified",
    }),
  });

  expect(response.status).toBe(201);
  return response.body.data;
};

const guardianPayload = (firstName = "Imran") => ({
  firstName,
  lastName: "Khan",
  phone: "9999999999",
  email: `guardian-${randomUUID()}@example.test`,
});

const createGuardian = async (token, payload = guardianPayload()) => {
  const response = await request("/guardians", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });

  expect(response.status).toBe(201);
  return response.body.data;
};

describe("Guardian API integration tests", () => {
  beforeAll(async () => {
    if (env.nodeEnv !== "test") {
      throw new Error(
        "Safety stop: run tests with NODE_ENV=test",
      );
    }

    if (
      typeof env.mongoUri !== "string" ||
      !/^mongodb(?:\+srv)?:\/\//.test(env.mongoUri)
    ) {
      throw new Error(
        "Safety stop: MONGO_TEST_URI must be a valid MongoDB connection string.",
      );
    }

    const uriMatch = env.mongoUri.match(
      /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/,
    );

    if (!uriMatch) {
      throw new Error(
        "Safety stop: could not verify the database name in MONGO_TEST_URI.",
      );
    }

    const configuredDatabase = decodeURIComponent(uriMatch[1]);

    if (configuredDatabase !== EXPECTED_TEST_DATABASE) {
      throw new Error(
        `Safety stop: expected ${EXPECTED_TEST_DATABASE}, received ${configuredDatabase}`,
      );
    }

    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
      await mongoose.disconnect();

      throw new Error(
        `Safety stop: connected to unexpected database ${mongoose.connection.name}`,
      );
    }

    await Promise.all([
      Tenant.init(),
      User.init(),
      Student.init(),
      Guardian.init(),
      StudentGuardian.init(),
    ]);

    schoolA = await createSchool("alpha");
    schoolB = await createSchool("beta");

    adminA = await createTestUser(schoolA, "school_admin");
    principalA = await createTestUser(schoolA, "principal");
    teacherA = await createTestUser(schoolA, "teacher");
    adminB = await createTestUser(schoolB, "school_admin");

    server = app.listen(0, "127.0.0.1");

    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  }, 30000);

  afterAll(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) =>
          error ? reject(error) : resolve(),
        );
      });
    }

    if (mongoose.connection.readyState === 1) {
      if (createdTenantIds.length) {
        await StudentGuardian.deleteMany({
          tenantId: { $in: createdTenantIds },
        });

        await Guardian.deleteMany({
          tenantId: { $in: createdTenantIds },
        });

        await Student.deleteMany({
          tenantId: { $in: createdTenantIds },
        });

        await User.deleteMany({
          _id: { $in: createdUserIds },
        });

        await Tenant.deleteMany({
          _id: { $in: createdTenantIds },
        });
      }

      await mongoose.disconnect();
    }
  }, 30000);

  it("rejects requests without authentication", async () => {
    const response = await request("/guardians");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("allows a school administrator to create a guardian", async () => {
    const payload = guardianPayload();

    const response = await request("/guardians", {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.firstName).toBe(payload.firstName);
    expect(String(response.body.data.tenantId)).toBe(
      String(schoolA._id),
    );
  });

  it("allows a principal to create a guardian", async () => {
    const response = await request("/guardians", {
      method: "POST",
      token: principalA.token,
      body: JSON.stringify(guardianPayload("Sara")),
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("prevents a teacher from creating a guardian", async () => {
    const response = await request("/guardians", {
      method: "POST",
      token: teacherA.token,
      body: JSON.stringify(guardianPayload()),
    });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects a client-supplied tenantId", async () => {
    const response = await request("/guardians", {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify({
        ...guardianPayload(),
        tenantId: String(schoolB._id),
      }),
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects a guardian without a first name", async () => {
    const response = await request("/guardians", {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify({
        lastName: "Khan",
      }),
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("allows a teacher to list guardians", async () => {
    const response = await request("/guardians", {
      token: teacherA.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("returns only guardians belonging to the requesting school", async () => {
    const guardianA = await createGuardian(adminA.token);
    const guardianB = await createGuardian(adminB.token);

    const response = await request("/guardians", {
      token: adminA.token,
    });

    expect(response.status).toBe(200);

    const ids = response.body.data.map((guardian) =>
      String(guardian._id),
    );

    expect(ids).toContain(String(guardianA._id));
    expect(ids).not.toContain(String(guardianB._id));
  });

  it("allows retrieval of a guardian within the same school", async () => {
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/guardians/${guardian._id}`,
      { token: adminA.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(String(response.body.data._id)).toBe(
      String(guardian._id),
    );
  });

  it("prevents cross-school guardian retrieval", async () => {
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/guardians/${guardian._id}`,
      { token: adminB.token },
    );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it("allows a school administrator to update a guardian", async () => {
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/guardians/${guardian._id}`,
      {
        method: "PATCH",
        token: adminA.token,
        body: JSON.stringify({
          firstName: "Updated",
          phone: "8888888888",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.data.firstName).toBe("Updated");
    expect(response.body.data.phone).toBe("8888888888");
  });

  it("prevents a teacher from updating a guardian", async () => {
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/guardians/${guardian._id}`,
      {
        method: "PATCH",
        token: teacherA.token,
        body: JSON.stringify({
          firstName: "Unauthorized",
        }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("prevents cross-school guardian updates", async () => {
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/guardians/${guardian._id}`,
      {
        method: "PATCH",
        token: adminB.token,
        body: JSON.stringify({
          firstName: "Unauthorized",
        }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("rejects an invalid guardian ID", async () => {
    const response = await request(
      "/guardians/not-a-valid-id",
      { token: adminA.token },
    );

    expect(response.status).toBe(400);
  });

  it("rejects an empty guardian update", async () => {
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/guardians/${guardian._id}`,
      {
        method: "PATCH",
        token: adminA.token,
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(400);
  });

  it("allows a school administrator to link a guardian to a student", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardian._id),
          relationship: "father",
          isPrimary: true,
          isEmergencyContact: true,
          canPickup: true,
          receivesCommunication: true,
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(String(response.body.data.studentId)).toBe(
      String(student._id),
    );
    expect(String(response.body.data.guardianId)).toBe(
      String(guardian._id),
    );
    expect(response.body.data.relationship).toBe("father");
  });

  it("allows a student to have multiple guardians", async () => {
    const student = await createStudent(adminA.token);
    const guardianOne = await createGuardian(adminA.token);
    const guardianTwo = await createGuardian(adminA.token);

    const first = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardianOne._id),
          relationship: "father",
        }),
      },
    );

    const second = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardianTwo._id),
          relationship: "mother",
        }),
      },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("allows one guardian to be linked to multiple students", async () => {
    const guardian = await createGuardian(adminA.token);
    const studentOne = await createStudent(adminA.token);
    const studentTwo = await createStudent(adminA.token);

    const first = await request(
      `/students/${studentOne._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardian._id),
          relationship: "father",
        }),
      },
    );

    const second = await request(
      `/students/${studentTwo._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardian._id),
          relationship: "father",
        }),
      },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("rejects a guardian from another school when creating a link", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminB.token);

    const response = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardian._id),
          relationship: "father",
        }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("rejects linking a guardian to a student from another school", async () => {
    const student = await createStudent(adminB.token);
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardian._id),
          relationship: "father",
        }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("rejects duplicate student-guardian relationships", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);

    const payload = {
      guardianId: String(guardian._id),
      relationship: "father",
    };

    const first = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify(payload),
      },
    );

    const second = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify(payload),
      },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it("rejects a second active primary guardian for the same student", async () => {
    const student = await createStudent(adminA.token);
    const guardianOne = await createGuardian(adminA.token);
    const guardianTwo = await createGuardian(adminA.token);

    const first = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardianOne._id),
          relationship: "father",
          isPrimary: true,
        }),
      },
    );

    const second = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardianTwo._id),
          relationship: "mother",
          isPrimary: true,
        }),
      },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it("rejects an unsupported relationship type", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardian._id),
          relationship: "unknown",
        }),
      },
    );

    expect(response.status).toBe(400);
  });

  it("allows a teacher to view a student's guardians", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);

    const linkResponse = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: adminA.token,
        body: JSON.stringify({
          guardianId: String(guardian._id),
          relationship: "father",
        }),
      },
    );

    expect(linkResponse.status).toBe(201);

    const response = await request(
      `/students/${student._id}/guardians`,
      { token: teacherA.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
  });

  it("prevents a teacher from creating a student-guardian link", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);

    const response = await request(
      `/students/${student._id}/guardians`,
      {
        method: "POST",
        token: teacherA.token,
        body: JSON.stringify({
          guardianId: String(guardian._id),
          relationship: "father",
        }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("prevents cross-school access to a student's guardian list", async () => {
    const student = await createStudent(adminA.token);

    const response = await request(
      `/students/${student._id}/guardians`,
      { token: adminB.token },
    );

    expect(response.status).toBe(404);
  });

  it("allows an administrator to update a student-guardian relationship", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);
    const linked = await request(`/students/${student._id}/guardians`, {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify({
        guardianId: String(guardian._id),
        relationship: "father",
      }),
    });
    expect(linked.status).toBe(201);

    const response = await request(
      `/students/${student._id}/guardians/${linked.body.data._id}`,
      {
        method: "PATCH",
        token: adminA.token,
        body: JSON.stringify({
          relationship: "legal_guardian",
          canPickup: true,
          isEmergencyContact: true,
          receivesCommunication: false,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.data.relationship).toBe("legal_guardian");
    expect(response.body.data.canPickup).toBe(true);
    expect(response.body.data.isEmergencyContact).toBe(true);
    expect(response.body.data.receivesCommunication).toBe(false);
  });

  it("prevents a teacher from updating a student-guardian relationship", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);
    const linked = await request(`/students/${student._id}/guardians`, {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify({
        guardianId: String(guardian._id),
        relationship: "father",
      }),
    });
    expect(linked.status).toBe(201);

    const response = await request(
      `/students/${student._id}/guardians/${linked.body.data._id}`,
      {
        method: "PATCH",
        token: teacherA.token,
        body: JSON.stringify({ canPickup: true }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("deactivates a student-guardian link without deleting its history", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);
    const linked = await request(`/students/${student._id}/guardians`, {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify({
        guardianId: String(guardian._id),
        relationship: "mother",
        isPrimary: true,
      }),
    });
    expect(linked.status).toBe(201);

    const response = await request(
      `/students/${student._id}/guardians/${linked.body.data._id}`,
      {
        method: "PATCH",
        token: adminA.token,
        body: JSON.stringify({ status: "inactive" }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("inactive");

    const list = await request(`/students/${student._id}/guardians`, {
      token: adminA.token,
    });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(String(list.body.data[0]._id)).toBe(String(linked.body.data._id));
    expect(list.body.data[0].status).toBe("inactive");
  });

  it("allows a new primary guardian after the previous primary link is deactivated", async () => {
    const student = await createStudent(adminA.token);
    const firstGuardian = await createGuardian(adminA.token);
    const secondGuardian = await createGuardian(adminA.token);
    const firstLink = await request(`/students/${student._id}/guardians`, {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify({
        guardianId: String(firstGuardian._id),
        relationship: "father",
        isPrimary: true,
      }),
    });
    expect(firstLink.status).toBe(201);

    const deactivated = await request(
      `/students/${student._id}/guardians/${firstLink.body.data._id}`,
      {
        method: "PATCH",
        token: adminA.token,
        body: JSON.stringify({ status: "inactive" }),
      },
    );
    expect(deactivated.status).toBe(200);

    const secondLink = await request(`/students/${student._id}/guardians`, {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify({
        guardianId: String(secondGuardian._id),
        relationship: "mother",
        isPrimary: true,
      }),
    });

    expect(secondLink.status).toBe(201);
    expect(secondLink.body.data.isPrimary).toBe(true);
  });

  it("rejects unsupported student-guardian update fields", async () => {
    const student = await createStudent(adminA.token);
    const guardian = await createGuardian(adminA.token);
    const linked = await request(`/students/${student._id}/guardians`, {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify({
        guardianId: String(guardian._id),
        relationship: "father",
      }),
    });
    expect(linked.status).toBe(201);

    const response = await request(
      `/students/${student._id}/guardians/${linked.body.data._id}`,
      {
        method: "PATCH",
        token: adminA.token,
        body: JSON.stringify({ tenantId: String(schoolB._id) }),
      },
    );

    expect(response.status).toBe(400);
  });

});
