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
    // WHATWG URL does not support MongoDB's comma-separated replica-set hosts.
    // Parse the MongoDB authority and database path without altering the URI.
    const schemeEnd = uri.indexOf("://");
    if (schemeEnd < 0) return "";

    const remainder = uri.slice(schemeEnd + 3);
    const authorityEnd = remainder.search(/[/?#]/);
    const authority = authorityEnd === -1
      ? remainder
      : remainder.slice(0, authorityEnd);
    const pathAndQuery = authorityEnd === -1 ? "" : remainder.slice(authorityEnd);
    const hostList = authority.slice(authority.lastIndexOf("@") + 1);
    const hosts = hostList.split(",").map((host) => host.trim());

    if (!hosts.length || hosts.some((host) => !host)) return "";

    const firstHost = hosts[0];
    const normalizedHost = firstHost.startsWith("[")
      ? firstHost.slice(1, firstHost.indexOf("]")).toLowerCase()
      : firstHost.replace(/:\d+$/, "").toLowerCase();
    const databasePath = pathAndQuery.split(/[?#]/, 1)[0];
    const databaseName = decodeURIComponent(
      databasePath.replace(/^\/+/, "").split("/")[0] || ""
    );

    if (!normalizedHost || !databaseName) return "";
    return `${normalizedHost}/${databaseName}`;
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
  // getMongoTarget already parsed the MongoDB URI without WHATWG URL,
  // which cannot handle comma-separated replica-set hosts.
  const databaseName = selectedMongoTarget.slice(
    selectedMongoTarget.lastIndexOf("/") + 1
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
