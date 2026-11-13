/** JSON 404 for any unmatched route. */
export function notFound(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route for ${req.method} ${req.originalUrl}`,
    },
  });
}
