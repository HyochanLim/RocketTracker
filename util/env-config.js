"use strict";

function trimOrEmpty(v) {
  return v == null ? "" : String(v).trim();
}

/**
 * MongoDB connection string. Cloud: set MONGODB_URI or MONGODB_URL in .env / hosting.
 * If unset, defaults to local mongod on 27017.
 */
function mongoUri() {
  const u = trimOrEmpty(process.env.MONGODB_URI) || trimOrEmpty(process.env.MONGODB_URL);
  if (u) return u;
  return "mongodb://127.0.0.1:27017";
}

function mongoDbName() {
  const n = trimOrEmpty(process.env.MONGODB_DB_NAME);
  return n || "orbit";
}

/**
 * Session signing secret. Must be set in production; do not commit real values.
 */
function sessionSecret() {
  const s = trimOrEmpty(process.env.SESSION_SECRET);
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in the environment when NODE_ENV=production.");
  }
  return "orbit-dev-session-secret";
}

/** Public site origin for canonical URLs, Open Graph, sitemap (no trailing slash). */
function publicSiteUrl() {
  const u = trimOrEmpty(process.env.PUBLIC_SITE_URL) || trimOrEmpty(process.env.SITE_URL);
  return u.replace(/\/$/, "");
}

module.exports = {
  trimOrEmpty,
  mongoUri,
  mongoDbName,
  sessionSecret,
  publicSiteUrl,
};
