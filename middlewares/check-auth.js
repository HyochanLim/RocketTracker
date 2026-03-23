const { getDefaultAvatarUrl } = require("../util/authentication");

function checkAuth(req, res, next) {
  res.locals.isAuth = false;
  res.locals.user = null;

  if (req.session.uid) {
    res.locals.isAuth = true;
    const sessionUser = req.session.user || {};
    const fallbackName = sessionUser.displayName || sessionUser.email || "User";
    res.locals.user = {
      id: req.session.uid,
      email: sessionUser.email || "",
      displayName: fallbackName,
      imageUrl: sessionUser.imageUrl || getDefaultAvatarUrl(fallbackName),
    };
  }

  next();
}

module.exports = checkAuth;
