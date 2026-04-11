/**
 * Shared helpers for interpreting Express request shape (AJAX vs full page).
 */

function isAjaxRequest(req) {
  return !!(req && (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest"));
}

module.exports = {
  isAjaxRequest,
};
