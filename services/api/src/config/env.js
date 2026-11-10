import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  override: false,
});

const nodeEnv = process.env.NODE_ENV || "development";

if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error(
    "NODE_ENV must be development, test, or production"
  );
}

const mongoVariableByEnvironment = {
  development: "MONGO_DEV_URI",
  test: "MONGO_TEST_URI",
  production: "MONGO_URI",
};

const selectedMongoVariable = mongoVariableByEnvironment[nodeEnv];
const selectedMongoUri = process.env[selectedMongoVariable]?.trim() || "";

if (!selectedMongoUri) {
  throw new Error(
    `${selectedMongoVariable} is required when NODE_ENV=${nodeEnv}`
  );
}

if (!/^mongodb(?:\+srv)?:\/\//.test(selectedMongoUri)) {
  throw new Error(
    `${selectedMongoVariable} must start with "mongodb://" or "mongodb+srv://"`
  );
}

const getMongoTarget = (uri) => {
  try {
    const parsed = new URL(uri);
    const databaseName = decodeURIComponent(
      parsed.pathname.replace(/^\/+/, "").split("/")[0] || ""
    );

    if (!parsed.hostname || !databaseName) return "";

    return `${parsed.hostname.toLowerCase()}/${databaseName}`;
  } catch {
    return "";
  }
};

const selectedMongoTarget = getMongoTarget(selectedMongoUri);

if (!selectedMongoTarget) {
  throw new Error(
    `${selectedMongoVariable} must include a MongoDB host and database name`
  );
}

for (const [variable, value] of Object.entries({
  MONGO_DEV_URI: process.env.MONGO_DEV_URI,
  MONGO_TEST_URI: process.env.MONGO_TEST_URI,
  MONGO_URI: process.env.MONGO_URI,
})) {
  if (variable === selectedMongoVariable || !value?.trim()) continue;

  if (getMongoTarget(value.trim()) === selectedMongoTarget) {
    throw new Error(
      `${selectedMongoVariable} must not target the same MongoDB host and database as ${variable}`
    );
  }
}

if (nodeEnv === "test") {
  const databaseName = decodeURIComponent(
    new URL(selectedMongoUri).pathname.replace(/^\/+/, "").split("/")[0] || ""
  );

  if (!/test/i.test(databaseName)) {
    throw new Error(
      "MONGO_TEST_URI must target a database whose name includes 'test' (expected school-erp-test)"
    );
  }
}

const requiredEnv = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(
      `Missing required environment variable: ${key}`
    );
  }
}

if (
  Buffer.byteLength(process.env.JWT_ACCESS_SECRET, "utf8") < 32 ||
  Buffer.byteLength(process.env.JWT_REFRESH_SECRET, "utf8") < 32
) {
  throw new Error(
    "JWT secrets must each contain at least 32 bytes"
  );
}

if (
  process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET
) {
  throw new Error(
    "Access and refresh JWT secrets must be different"
  );
}

const port = Number(process.env.PORT || 5000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

const webUrl = process.env.WEB_URL || "http://localhost:5173";

let parsedWebUrl;

try {
  parsedWebUrl = new URL(webUrl);
} catch {
  throw new Error("WEB_URL must be a valid absolute URL");
}

if (
  !["http:", "https:"].includes(parsedWebUrl.protocol) ||
  parsedWebUrl.username ||
  parsedWebUrl.password ||
  parsedWebUrl.pathname !== "/" ||
  parsedWebUrl.search ||
  parsedWebUrl.hash
) {
  throw new Error(
    "WEB_URL must contain only the frontend origin, without credentials, path, query, or fragment"
  );
}

if (
  nodeEnv === "production" &&
  parsedWebUrl.protocol !== "https:"
) {
  throw new Error("WEB_URL must use HTTPS in production");
}

console.log("Environment diagnostic:", {
  nodeEnv,
  selectedMongoVariable,
  selectedUriConfigured: Boolean(selectedMongoUri),
  selectedUriScheme:
    selectedMongoUri.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)?.[0] ?? "unrecognized",
});

const env = Object.freeze({
  nodeEnv,
  port,
  mongoUri: selectedMongoUri,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  webUrl: parsedWebUrl.origin,
});

export default env;
