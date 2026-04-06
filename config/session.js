const mongoDbStore = require("connect-mongodb-session");

function createSessionStore(session) {
  const MongoDBStore = mongoDbStore(session);
  return new MongoDBStore({
    uri: "mongodb://localhost:27017",
    databaseName: "orbit",
    collection: "sessions",
  });
}

function createSessionConfig(session) {
  return {
    secret: "orbit-site-secret",
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(session),
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
  };
}

module.exports = createSessionConfig;
