
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  override: false,
});

const requiredEnv = [
  "MONGO_URI",
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

const nodeEnv = process.env.NODE_ENV || "development";

if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error(
    "NODE_ENV must be development, test, or production"
  );
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
  testUriConfigured: Boolean(process.env.MONGO_TEST_URI),
  selectedUriConfigured: Boolean(
    nodeEnv === "test"
      ? process.env.MONGO_TEST_URI
      : process.env.MONGO_URI
  ),
  selectedUriScheme:
    (nodeEnv === "test"
      ? process.env.MONGO_TEST_URI
      : process.env.MONGO_URI
    )?.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)?.[0] ?? "unrecognized",
});

const env = Object.freeze({
  nodeEnv,
  port,
  mongoUri:
    nodeEnv === "test"
      ? process.env.MONGO_TEST_URI
      : process.env.MONGO_URI,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  webUrl: parsedWebUrl.origin,
});

if (nodeEnv === "test" && !process.env.MONGO_TEST_URI) {
  throw new Error(
    "MONGO_TEST_URI is required when NODE_ENV=test"
  );
}


export default env;
