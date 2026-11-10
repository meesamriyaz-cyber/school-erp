import { describe, expect, it, vi } from "vitest";

import {
  getBackgroundWorkerHealth,
  markWorkerStarted,
  markWorkerCycleStarted,
  markWorkerCycleSucceeded,
  markWorkerCycleFailed,
  markWorkerStopped,
  WORKER_HEARTBEAT_TIMEOUT_MS,
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
  it("marks a worker not ready when its heartbeat becomes stale", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-10T10:00:00.000Z"));
      const worker = "auditOutbox";
      markWorkerStarted(worker);
      markWorkerCycleStarted(worker);
      markWorkerCycleSucceeded(worker, 0);
      expect(getBackgroundWorkerHealth().workers[worker].status).toBe("healthy");

      vi.advanceTimersByTime(WORKER_HEARTBEAT_TIMEOUT_MS + 1);
      const health = getBackgroundWorkerHealth();
      expect(health.workers[worker]).toMatchObject({
        status: "stale",
        started: true,
        running: false,
      });
      expect(health.ready).toBe(false);

      markWorkerCycleStarted(worker);
      markWorkerCycleSucceeded(worker, 2);
      expect(getBackgroundWorkerHealth().workers[worker].status).toBe("healthy");
      markWorkerStopped(worker);
    } finally {
      vi.useRealTimers();
    }
  });

});
