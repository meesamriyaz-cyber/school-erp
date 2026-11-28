import { describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_WORKER_NAMES,
  getBackgroundWorkerHealth,
  markWorkerStarted,
  markWorkerCycleStarted,
  markWorkerCycleSucceeded,
  markWorkerCycleFailed,
  markWorkerStopped,
  WORKER_HEARTBEAT_TIMEOUT_MS,
} from "../services/workerHealth.js";

const startAllWorkers = () => {
  for (const name of BACKGROUND_WORKER_NAMES) {
    markWorkerStarted(name);
    markWorkerCycleStarted(name);
    markWorkerCycleSucceeded(name, 0);
  }
};
const stopAllWorkers = () => BACKGROUND_WORKER_NAMES.forEach(markWorkerStopped);

describe("background worker health", () => {
  it("tracks all critical workers and requires each to complete an initial cycle", () => {
    stopAllWorkers();
    expect(BACKGROUND_WORKER_NAMES).toEqual([
      "auditOutbox", "notificationDelivery", "trialExpiry", "pastDueGrace",
    ]);
    markWorkerStarted("auditOutbox");
    expect(getBackgroundWorkerHealth().workers.auditOutbox.status).toBe("starting");
    expect(getBackgroundWorkerHealth().ready).toBe(false);

    markWorkerCycleStarted("auditOutbox");
    markWorkerCycleSucceeded("auditOutbox", 4);
    expect(getBackgroundWorkerHealth().workers.auditOutbox).toMatchObject({
      status: "healthy", started: true, running: false, lastProcessed: 4, lastErrorName: null,
    });
    expect(getBackgroundWorkerHealth().ready).toBe(false);

    for (const name of BACKGROUND_WORKER_NAMES.filter((name) => name !== "auditOutbox")) {
      markWorkerStarted(name);
      markWorkerCycleStarted(name);
      markWorkerCycleSucceeded(name, 0);
    }
    expect(getBackgroundWorkerHealth().ready).toBe(true);
    stopAllWorkers();
  });

  it("marks failures degraded without exposing raw error messages and recovers", () => {
    stopAllWorkers();
    startAllWorkers();
    markWorkerCycleFailed("trialExpiry", Object.assign(
      new Error("sensitive database connection string"), { name: "MongoNetworkError" },
    ));
    const health = getBackgroundWorkerHealth();
    expect(health.ready).toBe(false);
    expect(health.workers.trialExpiry).toMatchObject({
      status: "degraded", lastErrorName: "MongoNetworkError",
    });
    expect(JSON.stringify(health)).not.toContain("sensitive database connection string");

    markWorkerCycleStarted("trialExpiry");
    markWorkerCycleSucceeded("trialExpiry", 2);
    expect(getBackgroundWorkerHealth().workers.trialExpiry).toMatchObject({
      status: "healthy", lastProcessed: 2, lastErrorName: null,
    });
    stopAllWorkers();
  });

  it("marks workers stale when their heartbeat exceeds the timeout", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-10T10:00:00.000Z"));
      stopAllWorkers();
      startAllWorkers();
      vi.advanceTimersByTime(WORKER_HEARTBEAT_TIMEOUT_MS + 1);
      const health = getBackgroundWorkerHealth();
      expect(health.workers.pastDueGrace).toMatchObject({
        status: "stale", started: true, running: false,
      });
      expect(health.ready).toBe(false);
      markWorkerCycleStarted("pastDueGrace");
      markWorkerCycleSucceeded("pastDueGrace", 1);
      expect(getBackgroundWorkerHealth().workers.pastDueGrace.status).toBe("healthy");
      stopAllWorkers();
    } finally {
      vi.useRealTimers();
    }
  });
});
