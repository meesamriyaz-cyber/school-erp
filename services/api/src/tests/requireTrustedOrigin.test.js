
import { describe, it, expect, vi, beforeEach } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    webUrl: "https://school.example.com",
    nodeEnv: "test",
  },
}));

vi.mock("../config/env.js", () => ({
  default: envMock,
}));

import requireTrustedOrigin from "../middleware/requireTrustedOrigin.js";

describe("requireTrustedOrigin middleware", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      get: vi.fn((header) =>
        header.toLowerCase() === "origin" ? undefined : undefined,
      ),
      cookies: {},
      body: {},
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
  });

  it("allows a request from the configured web origin", () => {
    req.get.mockReturnValue("https://school.example.com");

    requireTrustedOrigin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows localhost in non-production environments", () => {
    req.get.mockReturnValue("http://localhost:5173");

    requireTrustedOrigin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects an untrusted origin", () => {
    req.get.mockReturnValue("https://attacker.example");

    requireTrustedOrigin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Request origin is not permitted",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an untrusted origin even when clientType is mobile", () => {
    req.get.mockReturnValue("https://attacker.example");
    req.body.clientType = "mobile";

    requireTrustedOrigin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a request without an origin when a refresh cookie exists", () => {
    req.cookies.school_erp_refresh = "refresh-token";
    req.body.clientType = "mobile";

    requireTrustedOrigin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Request origin is required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an originless request without mobile clientType", () => {
    req.body.clientType = "web";

    requireTrustedOrigin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Request origin is required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an originless request when clientType is missing", () => {
    requireTrustedOrigin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows an originless native mobile request without a refresh cookie", () => {
    req.body.clientType = "mobile";

    requireTrustedOrigin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects an originless request with a refresh cookie regardless of clientType", () => {
    req.cookies.school_erp_refresh = "refresh-token";
    req.body.clientType = "web";

    requireTrustedOrigin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects localhost as an origin in production", async () => {
    vi.resetModules();

    envMock.nodeEnv = "production";

    try {
      const { default: productionMiddleware } = await import(
        "../middleware/requireTrustedOrigin.js"
      );

      req.get.mockReturnValue("http://localhost:5173");

      productionMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    } finally {
      envMock.nodeEnv = "test";
      vi.resetModules();
    }
  });
});
