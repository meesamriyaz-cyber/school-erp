
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import errorHandler from "../middleware/errorHandler.js";

describe("errorHandler middleware", () => {
  let req;
  let res;
  let next;
  let consoleErrorSpy;

  beforeEach(() => {
    req = {
      method: "GET",
      originalUrl: "/api/v1/students?page=2&limit=10",
    };

    res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the error to next when headers have already been sent", () => {
    res.headersSent = true;
    const error = new Error("Response already started");

    errorHandler(error, req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("uses a valid 4xx status code and the error message", () => {
    const error = Object.assign(new Error("Student not found"), {
      statusCode: 404,
    });

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Student not found",
    });
  });

  it("uses a valid 5xx status code but hides the internal error message", () => {
    const error = Object.assign(new Error("Database credentials leaked"), {
      statusCode: 503,
    });

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Internal server error",
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(
      "Database credentials leaked",
    );
  });

  it("defaults to 500 when the status code is missing", () => {
    errorHandler(new Error("Unexpected failure"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Internal server error",
    });
  });

  it.each([399, 600, 200, 400.5, "not-a-status"])(
    "defaults to 500 for an invalid status code: %s",
    (statusCode) => {
      const error = Object.assign(new Error("Failure"), { statusCode });

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Internal server error",
      });
    },
  );

  it("uses Request failed when a client error has no message", () => {
    const error = { statusCode: 400, message: "" };

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Request failed",
    });
  });

  it("logs a minimal diagnostic without query parameters", () => {
    const error = Object.assign(new Error("Bad request"), {
      statusCode: 400,
      name: "ValidationError",
    });

    errorHandler(error, req, res, next);

    expect(consoleErrorSpy).toHaveBeenCalledWith("API error:", {
      method: "GET",
      path: "/api/v1/students",
      statusCode: 400,
      name: "ValidationError",
    });
  });

  it("uses Error when the error name is not a string", () => {
    const error = {
      statusCode: 400,
      message: "Invalid input",
      name: 123,
    };

    errorHandler(error, req, res, next);

    expect(consoleErrorSpy).toHaveBeenCalledWith("API error:", {
      method: "GET",
      path: "/api/v1/students",
      statusCode: 400,
      name: "Error",
    });
  });

  it("handles a missing original URL when logging", () => {
    req.originalUrl = undefined;

    errorHandler(new Error("Unexpected failure"), req, res, next);

    expect(consoleErrorSpy).toHaveBeenCalledWith("API error:", {
      method: "GET",
      path: undefined,
      statusCode: 500,
      name: "Error",
    });
  });

  it("does not expose a client error message when it is not a string", () => {
    const error = { statusCode: 400, message: { detail: "Sensitive" } };

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Request failed",
    });
  });
});
