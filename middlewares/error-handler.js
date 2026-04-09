function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === "EBADCSRFTOKEN") {
    if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
      return res.status(403).json({ ok: false, message: "Invalid or expired security token. Refresh the page and try again." });
    }
    return res.status(403).render("shared/form-retry", {
      pageTitle: "Orbit | Try again",
      message: "Your session changed or the form expired. Refresh the page and try again.",
      backHref: req.get("Referer") || "/",
      backLabel: "Go back",
    });
  }
  if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
    return res.status(500).json({ ok: false, message: error.message || "Unexpected error" });
  }
  res.status(500).render("shared/500", { errorMessage: error.message || "Unexpected error" });
}

module.exports = errorHandler;
