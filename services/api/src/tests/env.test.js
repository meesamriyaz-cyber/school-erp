
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const validEnv = {
  NODE_ENV: "test",
  MONGO_URI: "mongodb://localhost:27017/school-erp",
  MONGO_TEST_URI: "mongodb://localhost:27017/school-erp-test",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  PORT: "5000",
  WEB_URL: "http://localhost:5173",
};

async function importEnv(overrides = {}) {
  vi.resetModules();

  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, validEnv, overrides);

  return import("../config/env.js");
}

afterEach(() => {
  vi.resetModules();

  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, originalEnv);

  vi.restoreAllMocks();
});

describe("environment configuration", () => {
  it("loads valid test configuration", async () => {
    const { default: env } = await importEnv();

    expect(env.nodeEnv).toBe("test");
    expect(env.port).toBe(5000);
    expect(env.mongoUri).toBe(validEnv.MONGO_TEST_URI);
    expect(env.webUrl).toBe("http://localhost:5173");
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("uses defaults for NODE_ENV, PORT, and WEB_URL", async () => {
    const { default: env } = await importEnv({
      NODE_ENV: "",
      PORT: "",
      WEB_URL: "",
    });

    expect(env.nodeEnv).toBe("development");
    expect(env.port).toBe(5000);
    expect(env.webUrl).toBe("http://localhost:5173");
  });

  it.each([
    "MONGO_URI",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
  ])("rejects missing required variable %s", async (key) => {
    await expect(
      importEnv({ [key]: "" }),
    ).rejects.toThrow(
      `Missing required environment variable: ${key}`,
    );
  });

  it("rejects an unsupported NODE_ENV", async () => {
    await expect(
      importEnv({ NODE_ENV: "staging" }),
    ).rejects.toThrow(
      "NODE_ENV must be development, test, or production",
    );
  });

  it.each([
    ["short access secret", { JWT_ACCESS_SECRET: "a".repeat(31) }],
    ["short refresh secret", { JWT_REFRESH_SECRET: "b".repeat(31) }],
  ])("rejects a %s", async (_label, overrides) => {
    await expect(
      importEnv(overrides),
    ).rejects.toThrow(
      "JWT secrets must each contain at least 32 bytes",
    );
  });

  it("rejects identical JWT secrets", async () => {
    const secret = "c".repeat(32);

    await expect(
      importEnv({
        JWT_ACCESS_SECRET: secret,
        JWT_REFRESH_SECRET: secret,
      }),
    ).rejects.toThrow(
      "Access and refresh JWT secrets must be different",
    );
  });

  it.each(["0", "-1", "65536", "1.5", "abc"])(
    "rejects invalid PORT value %s",
    async (PORT) => {
      await expect(
        importEnv({ PORT }),
      ).rejects.toThrow("PORT must be a valid TCP port");
    },
  );

  it("accepts the highest valid TCP port", async () => {
    const { default: env } = await importEnv({ PORT: "65535" });

    expect(env.port).toBe(65535);
  });

  it("rejects an invalid WEB_URL", async () => {
    await expect(
      importEnv({ WEB_URL: "not-a-url" }),
    ).rejects.toThrow("WEB_URL must be a valid absolute URL");
  });

  it.each([
    "ftp://localhost",
    "http://user:pass@localhost",
    "http://localhost/path",
    "http://localhost?query=1",
    "http://localhost#fragment",
  ])("rejects an invalid frontend origin: %s", async (WEB_URL) => {
    await expect(
      importEnv({ WEB_URL }),
    ).rejects.toThrow(
      "WEB_URL must contain only the frontend origin, without credentials, path, query, or fragment",
    );
  });

  it("requires HTTPS in production", async () => {
    await expect(
      importEnv({
        NODE_ENV: "production",
        WEB_URL: "http://example.com",
      }),
    ).rejects.toThrow("WEB_URL must use HTTPS in production");
  });

  it("accepts HTTPS in production", async () => {
    const { default: env } = await importEnv({
      NODE_ENV: "production",
      WEB_URL: "https://example.com",
    });

    expect(env.webUrl).toBe("https://example.com");
    expect(env.mongoUri).toBe(validEnv.MONGO_URI);
  });

  it("requires MONGO_TEST_URI in test mode", async () => {
    await expect(
      importEnv({ MONGO_TEST_URI: "" }),
    ).rejects.toThrow(
      "MONGO_TEST_URI is required when NODE_ENV=test",
    );
  });

  it("trims whitespace around the selected test URI", async () => {
    const uri = "mongodb://localhost:27017/school-erp-test";
    const { default: env } = await importEnv({
      MONGO_TEST_URI: `  ${uri}  `,
    });

    expect(env.mongoUri).toBe(uri);
  });

  it("rejects a test URI with an unsupported scheme", async () => {
    await expect(
      importEnv({ MONGO_TEST_URI: "localhost:27017/school-erp-test" }),
    ).rejects.toThrow(
      'MONGO_TEST_URI must start with "mongodb://" or "mongodb+srv://"',
    );
  });

  it("refuses a test URI that targets a non-test database", async () => {
    await expect(
      importEnv({ MONGO_TEST_URI: "mongodb://localhost:27017/school-erp" }),
    ).rejects.toThrow(
      "MONGO_TEST_URI must target a database whose name includes 'test' (expected school-erp-test)",
    );
  });

  it("uses MONGO_URI outside test mode", async () => {
    const { default: env } = await importEnv({
      NODE_ENV: "development",
    });

    expect(env.mongoUri).toBe(validEnv.MONGO_URI);
  });
});
