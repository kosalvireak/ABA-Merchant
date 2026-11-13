/**
 * Central error handler. Everything ends here: thrown errors, next(err)
 * and rate-limit rejections. Always answers JSON, never leaks a stack trace.
 */
export function errorHandler(err, req, res, _next) {
  // Small typed-error family so specific services can carry a status/code.
  const status = err.status || err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";

  // Don't spam the log with expected client errors.
  if (status >= 500) {
    console.error("[error]", err);
  }

  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? "Something went wrong generating the payment." : err.message,
    },
  });
}
