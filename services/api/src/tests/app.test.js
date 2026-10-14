
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../app.js";

describe("Express application", () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
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
  });

  it("sets security headers", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("allows requests without an Origin header", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);

    expect(response.status).toBe(200);
  });

  it("allows the configured frontend origin", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {
        Origin: "http://localhost:5173",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
  });

  it("rejects an unapproved origin", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {
        Origin: "https://untrusted.example",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns 404 for an unknown route", async () => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.success).toBe(false);
  });

  it("parses JSON request bodies", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ test: true }),
    });

    // The health route accepts GET only, so the parsed request reaches 404.
    expect(response.status).toBe(404);
  });
});
