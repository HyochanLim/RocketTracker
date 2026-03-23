const path = require("path");
const fs = require("fs");
const express = require("express");
const csrf = require("csurf");
const expressSession = require("express-session");

const db = require("./data/database");
const createSessionConfig = require("./config/session");
const checkAuthStatus = require("./middlewares/check-auth");
const addCsrfToken = require("./middlewares/csrf-token");
const errorHandler = require("./middlewares/error-handler");

const baseRoutes = require("./routes/base.routes");
const authRoutes = require("./routes/auth.routes");
const trackerRoutes = require("./routes/tracker.routes");

const app = express();
const sessionConfig = createSessionConfig(expressSession);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(expressSession(sessionConfig));
app.use(csrf());
app.use(checkAuthStatus);
app.use(addCsrfToken);

app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/logic", express.static(path.join(__dirname, "logic")));
const uploadsRoot = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsRoot, { recursive: true });
app.use("/uploads", express.static(uploadsRoot));

// Reuse legacy tracker assets as reference source.
const legacyRoot = path.join(__dirname, "..", "rocket_Tracker-main");
app.use("/legacy/js", express.static(path.join(legacyRoot, "js")));
app.use("/legacy/styles", express.static(path.join(legacyRoot, "styles")));
app.use("/legacy/data", express.static(path.join(legacyRoot, "data")));

app.use(authRoutes);
app.use(baseRoutes);
app.use(trackerRoutes);

app.use(errorHandler);

db.connectToDatabase()
  .then(function () {
    app.listen(3000);
    console.log("Rocket tracker site running on http://localhost:3000");
  })
  .catch(function (error) {
    console.error("DB connection failed:", error);
  });
