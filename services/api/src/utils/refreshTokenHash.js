
import { createHash } from "node:crypto";

export const hashRefreshToken = (token) => {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("A refresh token is required");
  }

  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
};
