
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const candidateStatus = Number(err.statusCode);

  const statusCode =
    Number.isInteger(candidateStatus) &&
    candidateStatus >= 400 &&
    candidateStatus <= 599
      ? candidateStatus
      : 500;

  // Log a minimal diagnostic rather than the entire error object.
  console.error("API error:", {
    method: req.method,
    path: req.originalUrl?.split("?")[0],
    statusCode,
    name: typeof err.name === "string" ? err.name : "Error",
  });

  const clientMessage =
    statusCode >= 500
      ? "Internal server error"
      : typeof err.message === "string" && err.message
        ? err.message
        : "Request failed";

  return res.status(statusCode).json({
    success: false,
    message: clientMessage,
  });
};

export default errorHandler;
