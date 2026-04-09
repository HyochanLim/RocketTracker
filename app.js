const path = require("path");
const fs = require("fs");
const mongodb = require("mongodb");
const express = require("express");
const csrf = require("csurf");
const expressSession = require("express-session");

const db = require("./data/database");
const createSessionConfig = require("./config/session");
const checkAuthStatus = require("./middlewares/check-auth");
const attachEntitlements = require("./middlewares/attach-entitlements");
const addCsrfToken = require("./middlewares/csrf-token");
const errorHandler = require("./middlewares/error-handler");
const userDataLayout = require("./util/user-data-layout");

const baseRoutes = require("./routes/base.routes");
const authRoutes = require("./routes/auth.routes");
const trackerRoutes = require("./routes/tracker.routes");
const billingRoutes = require("./routes/billing.routes");
const billingController = require("./controllers/billing.controller");

const app = express();
const sessionConfig = createSessionConfig(expressSession);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// PayPal webhooks cannot send CSRF tokens; use raw body before csurf/json.
app.post(
  "/billing/paypal/webhook",
  express.raw({ type: "application/json" }),
  billingController.postPayPalWebhook
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(expressSession(sessionConfig));
app.use(csrf());
app.use(checkAuthStatus);
app.use(attachEntitlements);
app.use(addCsrfToken);

app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/logic", express.static(path.join(__dirname, "logic")));
const uploadsRoot = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsRoot, { recursive: true });
app.use("/uploads", express.static(uploadsRoot));

app.get("/profile-media/:userId/:filename", function (req, res, next) {
  const uid = String(req.params.userId || "");
  const filename = String(req.params.filename || "");
  const safeName = path.basename(filename);
  if (!mongodb.ObjectId.isValid(uid) || !safeName || safeName !== filename || filename.includes("..")) {
    return res.sendStatus(404);
  }
  const root = path.resolve(userDataLayout.userProfileDir(uid));
  const abs = path.resolve(userDataLayout.userProfileDir(uid), safeName);
  if (!abs.startsWith(root + path.sep)) {
    return res.sendStatus(404);
  }
  res.sendFile(abs, function (err) {
    if (err) next(err);
  });
});

const legacyRoot = path.join(__dirname, "..", "rocket_Tracker-main");
if (fs.existsSync(legacyRoot)) {
  app.use("/legacy/js", express.static(path.join(legacyRoot, "js")));
  app.use("/legacy/styles", express.static(path.join(legacyRoot, "styles")));
  app.use("/legacy/data", express.static(path.join(legacyRoot, "data")));
}

app.use(authRoutes);
app.use(baseRoutes);
app.use(trackerRoutes);
app.use(billingRoutes);

app.use(errorHandler);

db.connectToDatabase()
  .then(function () {
    app.listen(3000);
    console.log("Orbit running on http://localhost:3000");
  })
  .catch(function (error) {
    console.error("DB connection failed:", error);
  });
