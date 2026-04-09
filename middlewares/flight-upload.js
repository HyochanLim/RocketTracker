const path = require("path");
const fs = require("fs");
const multer = require("multer");
const layout = require("../util/user-data-layout");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uid = req.session && req.session.uid;
    if (!uid) {
      return cb(new Error("Not authenticated"));
    }
    try {
      const dir = layout.userRawDir(uid);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path.basename(file.originalname || "flight-data", ext).replace(/[^a-zA-Z0-9_-]/g, "");
    const safeBase = base || "flight-data";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBase}-${unique}${ext}`);
  },
});

const allowedTypes = new Set([
  "text/csv",
  "application/json",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const allowedExt = new Set([".csv", ".json", ".xls", ".xlsx"]);

const uploadFlightFile = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedExt.has(ext) || allowedTypes.has(file.mimetype)) return cb(null, true);
    req.fileValidationError = "Only .csv, .json, .xls, and .xlsx flight data files are allowed.";
    cb(null, false);
  },
});

module.exports = uploadFlightFile;
