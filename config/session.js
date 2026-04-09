const mongoDbStore = require("connect-mongodb-session");
const { mongoUri, mongoDbName, sessionSecret } = require("../util/env-config");

function sessionCookieSameSite() {
  const v = String(process.env.SESSION_COOKIE_SAMESITE || "lax").toLowerCase();
  return ["strict", "lax", "none"].includes(v) ? v : "lax";
}

/** Prefer explicit SESSION_COOKIE_SECURE; otherwise secure only in production (HTTPS). */
function sessionCookieSecure() {
  const raw = String(process.env.SESSION_COOKIE_SECURE || "").trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
}

function createSessionStore(session) {
  const MongoDBStore = mongoDbStore(session);
  return new MongoDBStore({
    uri: mongoUri(),
    databaseName: mongoDbName(),
    collection: String(process.env.MONGODB_SESSION_COLLECTION || "sessions").trim(),
  });
}

function createSessionConfig(session) {
  const maxAgeRaw = String(process.env.SESSION_MAX_AGE_MS || String(7 * 24 * 60 * 60 * 1000)).trim();
  const maxAge = Number.parseInt(maxAgeRaw, 10) || 7 * 24 * 60 * 60 * 1000;
  const sameSite = sessionCookieSameSite();
  let secure = sessionCookieSecure();
  if (sameSite === "none" && !secure) secure = true;
  return {
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(session),
    cookie: { maxAge, secure, sameSite },
  };
}

module.exports = createSessionConfig;
