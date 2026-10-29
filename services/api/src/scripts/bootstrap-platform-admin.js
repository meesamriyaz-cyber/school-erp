
import mongoose from "mongoose";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import env from "../config/env.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { hashPassword } from "../utils/password.js";

const getDatabaseName = (uri) => {
  const match = uri.match(
    /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/
  );

  return match?.[1]
    ? decodeURIComponent(match[1])
    : "";
};

const databaseName = getDatabaseName(env.mongoUri);

if (
  env.nodeEnv === "production" ||
  !databaseName ||
  !/test/i.test(databaseName)
) {
  console.error(
    "Refusing to run: this script only permits a non-production database whose name includes 'test'."
  );
  process.exit(1);
}

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  console.error("Run this script in an interactive terminal.");
  process.exit(1);
}

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
});

const ask = async (prompt) =>
  (await rl.question(prompt)).trim();

const askHidden = (prompt) =>
  new Promise((resolve, reject) => {
    stdout.write(prompt);
    let value = "";

    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };

    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }

        if (
          character === "\u0008" ||
          character === "\u007f"
        ) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }

        if (character >= " ") {
          value += character;
          stdout.write("*");
        }
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });

try {
  console.log("School ERP platform-admin recovery");
  console.log(`Environment: ${env.nodeEnv}`);
  console.log(`Database: ${databaseName}`);

  const email = (
    await ask("Platform-admin email: ")
  ).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  const existing = await User.findOne({ email }).select(
    "_id role tenantId firstName lastName"
  );

  if (
    existing &&
    (
      existing.role !== "platform_admin" ||
      existing.tenantId != null
    )
  ) {
    throw new Error(
      "This email belongs to a non-platform account. Choose another email; its role will not be changed."
    );
  }

  const action = existing ? "RESET" : "CREATE";

  const confirmation = await ask(
    existing
      ? "Platform admin exists. Type RESET to reset its password: "
      : "No account found. Type CREATE to create a platform admin: "
  );

  if (confirmation !== action) {
    console.log("Cancelled. No account changes made.");
  } else {
    let firstName = existing?.firstName;
    let lastName = existing?.lastName ?? "";

    if (!existing) {
      firstName = await ask("First name: ");
      lastName = await ask("Last name (optional): ");

      if (!firstName) {
        throw new Error("First name is required.");
      }
    }

    // Close readline before enabling masked terminal input.
    rl.close();

    const password = await askHidden(
      "New password (8–72 UTF-8 bytes): "
    );

    const passwordHash = await hashPassword(password);
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        if (existing) {
          const updated = await User.findOneAndUpdate(
            {
              _id: existing._id,
              role: "platform_admin",
              tenantId: null,
            },
            {
              $set: {
                passwordHash,
                status: "active",
              },
              $inc: {
                authVersion: 1,
              },
            },
            {
              new: true,
              runValidators: true,
              session,
            }
          ).select("_id");

          if (!updated) {
            throw new Error(
              "Account changed during recovery. No changes committed."
            );
          }

          await Session.updateMany(
            {
              userId: existing._id,
              revokedAt: null,
            },
            {
              $set: { revokedAt: new Date() },
            },
            { session }
          );
        } else {
          await User.create(
            [{
              tenantId: null,
              firstName,
              lastName,
              email,
              passwordHash,
              role: "platform_admin",
              status: "active",
              authVersion: 0,
            }],
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }

    console.log(
      existing
        ? "Platform-admin password reset. Existing sessions revoked."
        : "Platform-admin account created and activated."
    );

    console.log(`Login email: ${email}`);
    console.log("Use the new password you entered.");
  }
} catch (error) {
  console.error(`Recovery failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect().catch(() => {});
}
