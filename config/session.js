const mongoDbStore = require("connect-mongodb-session");

function mongoUri() {
  return String(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017").trim();
}

function mongoDbName() {
  return String(process.env.MONGODB_DB_NAME || "orbit").trim();
}

function sessionSecret() {
  const s = String(process.env.SESSION_SECRET || "").trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set SESSION_SECRET in production (strong random string).");
  }
  return "orbit-dev-session-secret";
}

function sessionCookieSameSite() {
  const v = String(process.env.SESSION_COOKIE_SAMESITE || "lax").toLowerCase();
  return ["strict", "lax", "none"].includes(v) ? v : "lax";
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
  const secure = String(process.env.SESSION_COOKIE_SECURE || "").toLowerCase() === "true";
  return {
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(session),
    cookie: { maxAge, secure, sameSite: sessionCookieSameSite() },
  };
}

module.exports = createSessionConfig;
