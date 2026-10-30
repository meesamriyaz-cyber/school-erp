import app from "./app.js";
import env from "./config/env.js";
import { startAuditOutboxWorker, stopAuditOutboxWorker } from "./services/auditLogService.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";

let server;

const startServer = async () => {
  await connectDatabase();
  startAuditOutboxWorker();

  server = app.listen(env.port, () => {
    console.log(
      `School ERP API running on port ${env.port} [${env.nodeEnv}]`
    );
  });
};

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down...`);

  try {
    // Stop accepting new HTTP requests and wait for in-flight handlers to finish.
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    // All request handlers have completed; now stop polling and drain the active worker cycle.
    await stopAuditOutboxWorker();
    await disconnectDatabase();
    process.exitCode = 0;
  } catch (error) {
    console.error("Shutdown failed:", error.message);
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

startServer().catch(async (error) => {
  console.error("Failed to start School ERP API:", error.message);

  try {
    await stopAuditOutboxWorker();
    await disconnectDatabase();
  } finally {
    process.exitCode = 1;
  }
});