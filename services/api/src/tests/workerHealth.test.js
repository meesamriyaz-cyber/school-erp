import { describe, expect, it } from "vitest";

import {
  getBackgroundWorkerHealth,
  markWorkerStarted,
  markWorkerCycleStarted,
  markWorkerCycleSucceeded,
  markWorkerCycleFailed,
  markWorkerStopped,
} from "../services/workerHealth.js";

describe("background worker health", () => {
  it("moves through starting, healthy, degraded, recovery and stopped states", () => {
    const worker = "auditOutbox";
    markWorkerStarted(worker);
    let health = getBackgroundWorkerHealth();
    expect(health.workers[worker].status).toBe("starting");
    expect(health.ready).toBe(false);

    markWorkerCycleStarted(worker);
    markWorkerCycleSucceeded(worker, 4);
    health = getBackgroundWorkerHealth();
    expect(health.workers[worker]).toMatchObject({
      status: "healthy",
      started: true,
      running: false,
      lastProcessed: 4,
      lastErrorName: null,
    });
    expect(health.ready).toBe(false);

    markWorkerStarted("notificationDelivery");
    markWorkerCycleStarted("notificationDelivery");
    markWorkerCycleSucceeded("notificationDelivery", 0);
    expect(getBackgroundWorkerHealth().ready).toBe(true);

    markWorkerCycleFailed(worker, Object.assign(new Error("sensitive database connection string"), { name: "MongoNetworkError" }));
    health = getBackgroundWorkerHealth();
    expect(health.ready).toBe(false);
    expect(health.workers[worker]).toMatchObject({
      status: "degraded",
      lastErrorName: "MongoNetworkError",
    });
    expect(JSON.stringify(health)).not.toContain("sensitive database connection string");

    markWorkerCycleStarted(worker);
    markWorkerCycleSucceeded(worker, 1);
    expect(getBackgroundWorkerHealth().workers[worker].status).toBe("healthy");

    markWorkerStopped(worker);
    expect(getBackgroundWorkerHealth().workers[worker].status).toBe("stopped");
    expect(getBackgroundWorkerHealth().ready).toBe(false);
    markWorkerStopped("notificationDelivery");
  });
});
