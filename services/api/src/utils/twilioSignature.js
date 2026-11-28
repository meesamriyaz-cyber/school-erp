import { createHmac, timingSafeEqual } from "node:crypto";

export function buildTwilioSignature(url, params, authToken) {
  const data = Object.keys(params || {}).sort().reduce((value, key) => {
    const raw = params[key];
    const values = Array.isArray(raw) ? raw : [raw];
    return value + key + values.map((item) => String(item ?? "")).join("");
  }, url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function isValidTwilioSignature({ url, params, signature, authToken }) {
  if (!url || !signature || !authToken) return false;
  const expected = buildTwilioSignature(url, params, authToken);
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
