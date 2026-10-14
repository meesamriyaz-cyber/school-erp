import dotenv from "dotenv";

dotenv.config({
  path: new URL("../../.env", import.meta.url),
  override: false,  
});
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import app from "../app.js";
import env from "../config/env.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import { createAccessToken } from "../utils/tokens.js";
import jwt from "jsonwebtoken";
const EXPECTED_TEST_DATABASE = "school-erp-test";

let server;
let baseUrl;

const createdTenantIds = [];
const createdUserIds = [];

let schoolA;
let schoolB;
let adminA;
let teacherA;
let adminB;

const studentPayload = (admissionNumber, firstName) => ({
  admissionNumber,
  firstName,
  lastName: "Test",
  admissionDate: "2026-04-01",
  gender: "not_specified",
});

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
    name: `API Test School ${label} ${suffix}`,
    slug: `api-test-${label}-${suffix}`,
    status: "active",
  });

  createdTenantIds.push(tenant._id);

  return tenant;
};

const createTestUser = async (tenant, role) => {
  const suffix = randomUUID();

  const user = await User.create({
    tenantId: tenant._id,
    firstName: "API",
    lastName: "Tester",
    email: `api-test-${suffix}@example.test`,
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

describe("Student API integration tests", () => {
  beforeAll(async () => {
    // Refuse to run unless the process is explicitly in test mode.
    if (env.nodeEnv !== "test") {
      throw new Error(
        "Safety stop: run tests with NODE_ENV=test"
      );
    }

    if (!env.mongoUri) {
      throw new Error("Test database URI is missing");
    }

    // Check the database encoded in the URI before connecting.
   

    // Validate the selected test database before connecting.
    if (
      typeof env.mongoUri !== "string" ||
      !/^mongodb(?:\+srv)?:\/\//.test(env.mongoUri)
    ) {
      throw new Error(
        "Safety stop: MONGO_TEST_URI must be a valid MongoDB connection string."
      );
    }

    
const uriMatch = env.mongoUri.match(
  /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?.*)?$/
);

if (!uriMatch) {
  throw new Error(
    "Safety stop: could not verify the database name in MONGO_TEST_URI."
  );
}

const configuredDatabase = decodeURIComponent(uriMatch[1]);


    if (configuredDatabase !== EXPECTED_TEST_DATABASE) {
      throw new Error(
        `Safety stop: expected ${EXPECTED_TEST_DATABASE}, ` +
        `received ${configuredDatabase || "(no database name)"}`
      );
    }


    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    // Verify the database MongoDB actually selected.
    if (mongoose.connection.name !== EXPECTED_TEST_DATABASE) {
      await mongoose.disconnect();

      throw new Error(
        `Safety stop: connected to unexpected database ` +
        `${mongoose.connection.name}`
      );
    }

    await Promise.all([
      Tenant.init(),
      User.init(),
      Student.init(),
    ]);

    schoolA = await createSchool("alpha");
    schoolB = await createSchool("beta");

    adminA = await createTestUser(schoolA, "school_admin");
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
          error ? reject(error) : resolve()
        );
      });
    }

    // Remove only records created by this test run.
    if (mongoose.connection.readyState === 1) {
      if (createdTenantIds.length) {
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

  it("rejects requests without an access token", async () => {
    const response = await request("/students");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("allows a school admin to create a student", async () => {
    const response = await request("/students", {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify(
        studentPayload("api-001", "Amina")
      ),
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.admissionNumber).toBe("API-001");
    expect(String(response.body.data.tenantId)).toBe(
      String(schoolA._id)
    );
  });

  it("prevents a teacher from creating a student", async () => {
    const response = await request("/students", {
      method: "POST",
      token: teacherA.token,
      body: JSON.stringify(
        studentPayload("api-002", "Omar")
      ),
    });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

it("prevents School B from accessing School A's student", async () => {
  // Create a student in School A.
  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`TENANT-${randomUUID()}`, "Isolation")
    ),
  });

  expect(createResponse.status).toBe(201);

  const studentId = createResponse.body.data._id;

  // School B's administrator attempts to access School A's student.
  const accessResponse = await request(
    `/students/${studentId}`,
    {
      token: adminB.token,
    }
  );

  expect(accessResponse.status).toBe(404);
  expect(accessResponse.body.success).toBe(false);
});

it("rejects a student without an admission number", async () => {
  const payload = {
    firstName: "Invalid",
    lastName: "Student",
    admissionDate: "2026-04-01",
    gender: "not_specified",
  };

  const response = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(payload),
  });

  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
});

it("rejects duplicate admission numbers within the same school", async () => {
  const admissionNumber = `DUP-${randomUUID()}`;

  const firstResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(admissionNumber, "First")
    ),
  });

  expect(firstResponse.status).toBe(201);

  const secondResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(admissionNumber, "Second")
    ),
  });

  expect(secondResponse.status).toBe(409);
  expect(secondResponse.body.success).toBe(false);
});

it("prevents a teacher from updating a student", async () => {
  // Create a student using School A's administrator.
  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`UPDATE-${randomUUID()}`, "Original")
    ),
  });

  expect(createResponse.status).toBe(201);

  const studentId = createResponse.body.data._id;

  // Attempt to update the student using School A's teacher.
  const updateResponse = await request(`/students/${studentId}`, {
    method: "PATCH",
    token: teacherA.token,
    body: JSON.stringify({
      firstName: "Changed",
    }),
  });

  expect(updateResponse.status).toBe(403);
  expect(updateResponse.body.success).toBe(false);
});

it("prevents School B from updating School A's student", async () => {
  // School A creates a student.
  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`CROSS-${randomUUID()}`, "Protected")
    ),
  });

  expect(createResponse.status).toBe(201);

  const studentId = createResponse.body.data._id;

  // School B attempts to change that student's record.
  const updateResponse = await request(`/students/${studentId}`, {
    method: "PATCH",
    token: adminB.token,
    body: JSON.stringify({
      firstName: "Unauthorized Change",
    }),
  });

  expect(updateResponse.status).toBe(404);
  expect(updateResponse.body.success).toBe(false);

  // Verify the original record remains unchanged.
  const ownerResponse = await request(`/students/${studentId}`, {
    token: adminA.token,
  });

  expect(ownerResponse.status).toBe(200);
  expect(ownerResponse.body.data.firstName).toBe("Protected");
});

it("returns only students belonging to the requesting school", async () => {
  const uniqueSuffix = randomUUID();

  // Create one student in School A.
  const studentAResponse = await request("/students?page=1&limit=100", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`LIST-A-${uniqueSuffix}`, "SchoolAStudent")
    ),
  });

  expect(studentAResponse.status).toBe(201);

  // Create one student in School B.
  const studentBResponse = await request("/students", {
    method: "POST",
    token: adminB.token,
    body: JSON.stringify(
      studentPayload(`LIST-B-${uniqueSuffix}`, "SchoolBStudent")
    ),
  });

  expect(studentBResponse.status).toBe(201);

  // School A lists its students.
  const listResponse = await request("/students", {
    token: adminA.token,
  });

  expect(listResponse.status).toBe(200);
  expect(listResponse.body.success).toBe(true);

  const students = listResponse.body.data;

  expect(Array.isArray(students)).toBe(true);
  expect(
    students.some((student) => student.firstName === "SchoolAStudent")
  ).toBe(true);
  expect(
    students.some((student) => student.firstName === "SchoolBStudent")
  ).toBe(false);
});


it("paginates the student list correctly", async () => {
  // Create three students in School A.
  for (let i = 1; i <= 3; i++) {
    const response = await request("/students", {
      method: "POST",
      token: adminA.token,
      body: JSON.stringify(
        studentPayload(`PAGE-${randomUUID()}`, `PageStudent${i}`)
      ),
    });

    expect(response.status).toBe(201);
  }

  // Request a page containing two students.
  const response = await request("/students?page=1&limit=2", {
    token: adminA.token,
  });

  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.data).toHaveLength(2);

  expect(response.body.pagination.page).toBe(1);
  expect(response.body.pagination.limit).toBe(2);
  expect(response.body.pagination.total).toBeGreaterThanOrEqual(3);
  expect(response.body.pagination.totalPages).toBeGreaterThanOrEqual(2);
});

it("searches students by first name", async () => {
  const uniqueName = `Search${randomUUID().replaceAll("-", "").slice(0, 8)}`;

  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`SEARCH-${randomUUID()}`, uniqueName)
    ),
  });

  expect(createResponse.status).toBe(201);

  const searchResponse = await request(
    `/students?search=${encodeURIComponent(uniqueName)}`,
    {
      token: adminA.token,
    }
  );

  expect(searchResponse.status).toBe(200);
  expect(searchResponse.body.success).toBe(true);
  expect(Array.isArray(searchResponse.body.data)).toBe(true);

  expect(
    searchResponse.body.data.some(
      (student) => student.firstName === uniqueName
    )
  ).toBe(true);
});


it("filters students by status", async () => {
  const admissionNumber = `STATUS-${randomUUID()}`;

  // Create a student with the default status.
  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(admissionNumber, "StatusStudent")
    ),
  });

  expect(createResponse.status).toBe(201);

  // Change the student's status to inactive.
  const studentId = createResponse.body.data._id;

  const updateResponse = await request(`/students/${studentId}`, {
    method: "PATCH",
    token: adminA.token,
    body: JSON.stringify({
      status: "inactive",
    }),
  });

  expect(updateResponse.status).toBe(200);
  expect(updateResponse.body.data.status).toBe("inactive");

  // Request only inactive students.
  const listResponse = await request("/students?status=inactive", {
    token: adminA.token,
  });

  expect(listResponse.status).toBe(200);
  expect(listResponse.body.success).toBe(true);
  expect(Array.isArray(listResponse.body.data)).toBe(true);

  expect(
    listResponse.body.data.some(
      (student) => student._id === studentId
    )
  ).toBe(true);

  expect(
    listResponse.body.data.every(
      (student) => student.status === "inactive"
    )
  ).toBe(true);
});


it("rejects invalid student list query parameters", async () => {
  const invalidQueries = [
    "/students?page=0",
    "/students?limit=101",
    "/students?status=unknown",
  ];

  for (const path of invalidQueries) {
    const response = await request(path, {
      token: adminA.token,
    });

    expect(response.status, `Expected 400 for ${path}`).toBe(400);
    expect(response.body.success).toBe(false);
  }
});


it("rejects a client-supplied tenantId when creating a student", async () => {
  const response = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify({
      ...studentPayload(`TENANT-ID-${randomUUID()}`, "TenantTest"),
      tenantId: String(schoolB._id),
    }),
  });

  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
});

it("searches students by admission number", async () => {
  const admissionNumber = `ADM-${randomUUID()}`;

  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(admissionNumber, "AdmissionSearch")
    ),
  });

  expect(createResponse.status).toBe(201);

  const searchResponse = await request(
    `/students?search=${encodeURIComponent(admissionNumber)}`,
    {
      token: adminA.token,
    }
  );

  expect(searchResponse.status).toBe(200);
  expect(searchResponse.body.success).toBe(true);
  expect(Array.isArray(searchResponse.body.data)).toBe(true);

  expect(
    searchResponse.body.data.some(
      (student) => student.admissionNumber === admissionNumber.toUpperCase()
    )
  ).toBe(true);
});


it("rejects an invalid student ID", async () => {
  const response = await request("/students/not-a-valid-id", {
    token: adminA.token,
  });

  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
});

it("rejects invalid student values during update", async () => {
  // Create a valid student first.
  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`INVALID-${randomUUID()}`, "ValidStudent")
    ),
  });

  expect(createResponse.status).toBe(201);

  const studentId = createResponse.body.data._id;

  // Attempt to set an unsupported status.
  const updateResponse = await request(`/students/${studentId}`, {
    method: "PATCH",
    token: adminA.token,
    body: JSON.stringify({
      status: "suspended",
    }),
  });

  expect(updateResponse.status).toBe(400);
  expect(updateResponse.body.success).toBe(false);
});


it("rejects attempts to change a student's tenantId", async () => {
  // Create a student belonging to School A.
  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`REASSIGN-${randomUUID()}`, "ProtectedStudent")
    ),
  });

  expect(createResponse.status).toBe(201);

  const studentId = createResponse.body.data._id;

  // Attempt to reassign the student to School B.
  const updateResponse = await request(`/students/${studentId}`, {
    method: "PATCH",
    token: adminA.token,
    body: JSON.stringify({
      tenantId: String(schoolB._id),
    }),
  });

  expect(updateResponse.status).toBe(400);
  expect(updateResponse.body.success).toBe(false);

  // Verify the student still belongs to School A.
  const verifyResponse = await request(`/students/${studentId}`, {
    token: adminA.token,
  });

  expect(verifyResponse.status).toBe(200);
  expect(String(verifyResponse.body.data.tenantId)).toBe(
    String(schoolA._id)
  );
});

it("rejects a malformed access token", async () => {
  const response = await request("/students", {
    token: "this-is-not-a-valid-jwt",
  });

  expect(response.status).toBe(401);
  expect(response.body.success).toBe(false);
});

it("rejects an expired access token", async () => {
  const expiredToken = jwt.sign(
    {
      tokenType: "access",
      tenantId: String(schoolA._id),
      role: "school_admin",
      authVersion: 0,
    },
    env.jwtAccessSecret,
    {
      algorithm: "HS256",
      issuer: "school-erp-api",
      audience: "school-erp-clients",
      subject: String(adminA.user._id),
      expiresIn: -1,
    }
  );

  const response = await request("/students", {
    token: expiredToken,
  });

  expect(response.status).toBe(401);
  expect(response.body.success).toBe(false);
});


it("rejects an empty student update payload", async () => {
  // Create a student first.
  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`EMPTY-${randomUUID()}`, "EmptyUpdateTest")
    ),
  });

  expect(createResponse.status).toBe(201);

  const studentId = createResponse.body.data._id;

  // Attempt an update with an empty object.
  const updateResponse = await request(`/students/${studentId}`, {
    method: "PATCH",
    token: adminA.token,
    body: JSON.stringify({}),
  });

  expect(updateResponse.status).toBe(400);
  expect(updateResponse.body.success).toBe(false);
});

it("rejects a search query longer than 100 characters", async () => {
  const { status, body } = await request(
    `/students?search=${"a".repeat(101)}`,
    { token: adminA.token }
  );

  expect(status).toBe(400);
  expect(body.success).toBe(false);
  expect(body.message).toBe("Search must not exceed 100 characters");
});

it("returns 404 when retrieving a nonexistent student", async () => {
  const nonexistentStudentId = new mongoose.Types.ObjectId().toString();

  const { status, body } = await request(
    `/students/${nonexistentStudentId}`,
    { token: adminA.token }
  );

  expect(status).toBe(404);
  expect(body.success).toBe(false);
  expect(body.message).toBe("Student not found");
});

it("rejects a search query longer than 100 characters", async () => {
  const { status, body } = await request(
    `/students?search=${"a".repeat(101)}`,
    { token: adminA.token }
  );

  expect(status).toBe(400);
  expect(body.success).toBe(false);
  expect(body.message).toBe("Search must not exceed 100 characters");
});


it("returns 404 when updating a nonexistent student", async () => {
  const nonexistentStudentId = new mongoose.Types.ObjectId().toString();

  const result = await request(
    `/students/${nonexistentStudentId}`,
    {
      method: "PATCH",
      token: adminA.token,
      body: JSON.stringify({ firstName: "UpdatedName" }),
    }
  );

  console.log(
    "\nDEBUG UPDATE RESPONSE:",
    JSON.stringify(result, null, 2)
  );

  expect(result.status).toBe(404);
  expect(result.body.success).toBe(false);
  expect(result.body.message).toBe("Student not found");
});

it("rejects student creation when the request body is missing", async () => {
  const response = await request("/students", {
    method: "POST",
    token: adminA.token,
  });

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    success: false,
    message: "Provide student details",
  });
});

it("rejects an invalid student ID during update", async () => {
  const response = await request("/students/not-a-valid-id", {
    method: "PATCH",
    token: adminA.token,
    body: JSON.stringify({
      firstName: "UpdatedName",
    }),
  });

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    success: false,
    message: "Invalid student ID",
  });
});

it("rejects a student update when the request body is missing", async () => {
  const createResponse = await request("/students", {
    method: "POST",
    token: adminA.token,
    body: JSON.stringify(
      studentPayload(`NO-BODY-${randomUUID()}`, "MissingBody")
    ),
  });

  expect(createResponse.status).toBe(201);

  const studentId = createResponse.body.data._id;

  const response = await request(`/students/${studentId}`, {
    method: "PATCH",
    token: adminA.token,
  });

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    success: false,
    message: "Provide student fields to update",
  });
});

});
