function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
    return res.status(500).json({ ok: false, message: error.message || "Unexpected error" });
  }
  res.status(500).render("shared/500", { errorMessage: error.message || "Unexpected error" });
}

module.exports = errorHandler;
