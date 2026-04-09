"use strict";

const { publicSiteUrl } = require("../util/env-config");

/**
 * Sets res.locals used by shared/head for canonical URLs when PUBLIC_SITE_URL is set.
 */
function attachSeo(req, res, next) {
  const base = publicSiteUrl();
  res.locals.seoBaseUrl = base;
  const pathOnly = req.path || "/";
  res.locals.seoCanonicalUrl = base ? base + pathOnly : "";
  next();
}

module.exports = attachSeo;
