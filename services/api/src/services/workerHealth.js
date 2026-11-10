const createWorkerState = () => ({
  started: false,
  running: false,
  startedAt: null,
  lastCycleAt: null,
  lastProcessed: 0,
  lastErrorName: null,
});

const states = {
  auditOutbox: createWorkerState(),
  notificationDelivery: createWorkerState(),
};

function getState(name) {
  const state = states[name];
  if (!state) throw new Error(`Unknown background worker: ${name}`);
  return state;
}

export function markWorkerStarted(name) {
  const state = getState(name);
  state.started = true;
  state.startedAt = new Date();
  state.lastErrorName = null;
}

export function markWorkerCycleStarted(name) {
  getState(name).running = true;
}

export function markWorkerCycleSucceeded(name, processed = 0) {
  const state = getState(name);
  state.running = false;
  state.lastCycleAt = new Date();
  state.lastProcessed = Number.isFinite(processed) ? processed : 0;
  state.lastErrorName = null;
}

export function markWorkerCycleFailed(name, error) {
  const state = getState(name);
  state.running = false;
  state.lastCycleAt = new Date();
  state.lastErrorName = typeof error?.name === "string" ? error.name.slice(0, 80) : "Error";
}

export function markWorkerStopped(name) {
  const state = getState(name);
  state.started = false;
  state.running = false;
}

export function getBackgroundWorkerHealth() {
  const workers = Object.fromEntries(Object.entries(states).map(([name, state]) => {
    const status = !state.started
      ? "stopped"
      : state.lastErrorName
        ? "degraded"
        : !state.lastCycleAt
          ? "starting"
          : state.running
            ? "running"
            : "healthy";
    return [name, {
      status,
      started: state.started,
      running: state.running,
      startedAt: state.startedAt?.toISOString() ?? null,
      lastCycleAt: state.lastCycleAt?.toISOString() ?? null,
      lastProcessed: state.lastProcessed,
      lastErrorName: state.lastErrorName,
    }];
  }));
  const ready = Object.values(workers).every((worker) =>
    worker.started && worker.status !== "degraded" && worker.status !== "stopped"
  );
  return { status: ready ? "healthy" : "not_ready", ready, workers };
}
