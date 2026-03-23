const path = require("path");
const fs = require("fs");
const multer = require("multer");

const flightDir = path.join(__dirname, "..", "data", "uploads", "flight");
fs.mkdirSync(flightDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, flightDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path.basename(file.originalname || "flight-data", ext).replace(/[^a-zA-Z0-9_-]/g, "");
    const safeBase = base || "flight-data";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBase}-${unique}${ext}`);
  },
});

const allowedTypes = new Set(["text/csv", "application/json", "text/plain"]);
const allowedExt = new Set([".csv", ".json"]);

const uploadFlightFile = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedExt.has(ext) || allowedTypes.has(file.mimetype)) return cb(null, true);
    req.fileValidationError = "Only .csv and .json flight data files are allowed.";
    cb(null, false);
  },
});

module.exports = uploadFlightFile;
