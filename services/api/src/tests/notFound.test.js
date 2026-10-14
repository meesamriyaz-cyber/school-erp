
import { describe, expect, it, vi } from "vitest";

import notFound from "../middleware/NotFound.js";

describe("notFound middleware", () => {
  it("returns 404 with the request method and URL", () => {
    const req = {
      method: "GET",
      originalUrl: "/api/unknown",
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    notFound(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Route not found: GET /api/unknown",
    });
  });

  it("includes different methods and URLs correctly", () => {
    const req = {
      method: "POST",
      originalUrl: "/api/students/invalid",
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    notFound(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Route not found: POST /api/students/invalid",
    });
  });
});
