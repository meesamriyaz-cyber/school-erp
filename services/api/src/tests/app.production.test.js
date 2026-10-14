import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Express application in production mode", () => {
  let app;
  let server;
  let baseUrl;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../config/env.js", () => ({
      default: {
        nodeEnv: "production",
        webUrl: "https://school.example.com",
      },
    }));

    const module = await import("../app.js");
    app = module.default;

    server = app.listen(0);

    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    vi.doUnmock("../config/env.js");
    vi.resetModules();
  });

  it("allows the configured HTTPS frontend origin", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {
        Origin: "https://school.example.com",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://school.example.com",
    );
  });

  it("does not allow the development localhost origin", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {
        Origin: "http://localhost:5173",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});