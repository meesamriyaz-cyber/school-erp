import { getDatabaseStatus } from "../config/database.js";
import { getBackgroundWorkerHealth } from "../services/workerHealth.js";

export const getPlatformOperationalHealth = (_req, res) => {
  const database = getDatabaseStatus();
  const workers = getBackgroundWorkerHealth();
  const ready = database === "connected" && workers.ready;
  return res.status(200).json({
    success: true,
    data: {
      status: ready ? "healthy" : "attention_required",
      ready,
      database,
      workers,
      sampledAt: new Date().toISOString(),
    },
  });
};
