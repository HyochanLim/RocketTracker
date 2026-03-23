const path = require("path");
const fs = require("fs");
const multer = require("multer");

const avatarDir = path.join(__dirname, "..", "uploads", "avatars");
fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const base = path.basename(file.originalname || "avatar", ext).replace(/[^a-zA-Z0-9_-]/g, "");
    const safeBase = base || "avatar";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBase}-${unique}${ext}`);
  },
});

const allowedTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const uploadAvatar = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (allowedTypes.has(file.mimetype)) return cb(null, true);
    req.fileValidationError = "Only png, jpg/jpeg, gif, and webp images are allowed.";
    cb(null, false);
  },
});

module.exports = uploadAvatar;
