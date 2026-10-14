
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export const hashPassword = async (password) => {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error(
      "Password must be a string containing at least 8 characters"
    );
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error(
      "Password must not exceed 72 bytes when encoded as UTF-8"
    );
  }

  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password, passwordHash) => {
  if (
    typeof password !== "string" ||
    typeof passwordHash !== "string"
  ) {
    return false;
  }

  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
};
