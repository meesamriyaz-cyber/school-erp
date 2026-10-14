
import {
  hashPassword,
  verifyPassword,
} from "../utils/password.js";

const testPassword = async () => {
  try {
    const password = "SchoolERP-Test-2026!";
    const hash = await hashPassword(password);

    if (hash === password) {
      throw new Error("Password was not hashed");
    }

    console.log("PASS: Password is hashed");

    if (!(await verifyPassword(password, hash))) {
      throw new Error("Correct password was rejected");
    }

    console.log("PASS: Correct password is accepted");

    if (await verifyPassword("WrongPassword-2026!", hash)) {
      throw new Error("Incorrect password was accepted");
    }

    console.log("PASS: Incorrect password is rejected");

    try {
      await hashPassword("short");
      throw new Error("Short password was accepted");
    } catch (error) {
      if (
        error.message !==
        "Password must be a string containing at least 8 characters"
      ) {
        throw error;
      }
    }

    console.log("PASS: Short password is rejected");
    console.log("All password utility tests passed.");
  } catch (error) {
    console.error("Password test failed:", error.message);
    process.exitCode = 1;
  }
};

await testPassword();
