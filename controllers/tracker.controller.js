const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const mongodb = require("mongodb");
const FlightFile = require("../models/flight-file.model");

async function getTracker(req, res, next) {
  try {
    const files = await FlightFile.findByUser(req.session.uid);
    const message = req.query.uploaded
      ? { type: "success", text: "Flight data uploaded and saved." }
      : req.query.duplicate
        ? { type: "success", text: "This file already exists. Reused existing saved file." }
        : req.query.error
          ? { type: "error", text: req.query.error }
          : null;
    res.render("tracker/index", { files, message });
  } catch (error) {
    next(error);
  }
}

function computeFileHash(filePath) {
  return new Promise(function (resolve, reject) {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", function (chunk) {
      hash.update(chunk);
    });
    stream.on("end", function () {
      resolve(hash.digest("hex"));
    });
  });
}

async function uploadTrackerFile(req, res, next) {
  if (req.fileValidationError) return res.redirect(`/tracker?error=${encodeURIComponent(req.fileValidationError)}`);
  if (!req.file) return res.redirect("/tracker?error=Please%20select%20a%20file.");

  try {
    const absolutePath = req.file.path;
    const relativeStoredPath = path.relative(path.join(__dirname, ".."), absolutePath).replace(/\\/g, "/");
    const fileHash = await computeFileHash(absolutePath);

    const existing = await FlightFile.findByUserAndHash(req.session.uid, fileHash);
    if (existing) {
      fs.unlink(absolutePath, function () {});
      return res.redirect("/tracker?duplicate=1");
    }

    await FlightFile.create({
      userId: new mongodb.ObjectId(req.session.uid),
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      storedPath: relativeStoredPath,
      fileHash,
      createdAt: new Date(),
    });

    return res.redirect("/tracker?uploaded=1");
  } catch (error) {
    next(error);
  }
}

module.exports = { getTracker, uploadTrackerFile };
