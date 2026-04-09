const mongoDbStore = require("connect-mongodb-session");
const { mongoUri, mongoDbName, sessionSecret } = require("../util/env-config");

function createSessionStore(session) {
  const MongoDBStore = mongoDbStore(session);
  return new MongoDBStore({
    uri: mongoUri(),
    databaseName: mongoDbName(),
    collection: "sessions",
  });
}

function createSessionConfig(session) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(session),
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: isProd,
      sameSite: "lax",
    },
  };
}

module.exports = createSessionConfig;
