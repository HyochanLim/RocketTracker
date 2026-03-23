function protectRoutes(req, res, next) {
  if (!res.locals.isAuth) return res.status(401).render("shared/401");
  next();
}

module.exports = protectRoutes;
