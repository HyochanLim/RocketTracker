const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const mongodb = require("mongodb");
const FlightFile = require("../models/flight-file.model");
const { parseFlightFileToJson } = require("../logic/parsing/flight-data.parser");
const { parseRowsWithAiAgent } = require("../logic/parsing/ai-parsing-agent");

function isAjaxRequest(req) {
  return req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";
}

function makeSafeBaseName(filename) {
  return String(filename || "flight-data")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80) || "flight-data";
}

function getCesiumIonAccessToken() {
  if (process.env.CESIUM_ION_ACCESS_TOKEN && String(process.env.CESIUM_ION_ACCESS_TOKEN).trim()) {
    return String(process.env.CESIUM_ION_ACCESS_TOKEN).trim();
  }
  try {
    const cfg = require("../config/cesium-ion.local");
    if (cfg && typeof cfg.accessToken === "string" && cfg.accessToken.trim()) return cfg.accessToken.trim();
  } catch {
    /* optional local file */
  }
  return "";
}

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
    res.render("tracker/index", { files, message, cesiumIonToken: getCesiumIonAccessToken() });
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
  if (req.fileValidationError) {
    if (isAjaxRequest(req)) return res.status(422).json({ ok: false, message: req.fileValidationError });
    return res.redirect(`/tracker?error=${encodeURIComponent(req.fileValidationError)}`);
  }
  if (!req.file) {
    if (isAjaxRequest(req)) return res.status(422).json({ ok: false, message: "Please select a file." });
    return res.redirect("/tracker?error=Please%20select%20a%20file.");
  }

  try {
    const absolutePath = req.file.path;
    const fileHash = await computeFileHash(absolutePath);

    const existing = await FlightFile.findByUserAndHash(req.session.uid, fileHash);
    if (existing) {
      fs.unlink(absolutePath, function () {});
      if (isAjaxRequest(req)) {
        return res.json({
          ok: true,
          duplicate: true,
          file: {
            _id: existing._id.toString(),
            originalName: existing.originalName,
            size: existing.size,
            storedPath: existing.storedPath,
          },
        });
      }
      return res.redirect("/tracker?duplicate=1");
    }

    const parsedRecords = await parseFlightFileToJson(absolutePath);
    const aiParsed = await parseRowsWithAiAgent(parsedRecords, {
      filename: req.file.originalname,
    });
    const standardizedRecords =
      aiParsed && Array.isArray(aiParsed.standardizedRecords) && aiParsed.standardizedRecords.length > 0
        ? aiParsed.standardizedRecords
        : parsedRecords;
    const parsedDir = path.join(__dirname, "..", "data", "storage", "parsed_json", req.session.uid);
    await fsp.mkdir(parsedDir, { recursive: true });

    const safeBase = makeSafeBaseName(req.file.originalname);
    const parsedFilename = `${safeBase}-${Date.now()}.json`;
    const parsedAbsolutePath = path.join(parsedDir, parsedFilename);
    await fsp.writeFile(parsedAbsolutePath, JSON.stringify(standardizedRecords, null, 2), "utf-8");

    const relativeStoredPath = path.relative(path.join(__dirname, ".."), parsedAbsolutePath).replace(/\\/g, "/");

    const rawDir = path.join(__dirname, "..", "data", "storage", "raw_uploads", req.session.uid);
    await fsp.mkdir(rawDir, { recursive: true });
    const rawExt = path.extname(req.file.originalname || "").toLowerCase() || ".dat";
    const rawFilename = `${fileHash.slice(0, 16)}-${safeBase}${rawExt}`;
    const rawPermanentPath = path.join(rawDir, rawFilename);
    await fsp.copyFile(absolutePath, rawPermanentPath);
    await fsp.unlink(absolutePath);
    const relativeRawPath = path.relative(path.join(__dirname, ".."), rawPermanentPath).replace(/\\/g, "/");

    const insertResult = await FlightFile.create({
      userId: new mongodb.ObjectId(req.session.uid),
      originalName: req.file.originalname,
      mimeType: "application/json",
      size: req.file.size,
      storedPath: relativeStoredPath,
      rawStoredPath: relativeRawPath,
      fileHash,
      sourceExt: path.extname(req.file.originalname || "").toLowerCase(),
      recordCount: Array.isArray(standardizedRecords) ? standardizedRecords.length : 0,
      createdAt: new Date(),
    });

    if (isAjaxRequest(req)) {
      return res.json({
        ok: true,
        uploaded: true,
        file: {
          _id: insertResult.insertedId.toString(),
          originalName: req.file.originalname,
          size: req.file.size,
          storedPath: relativeStoredPath,
        },
      });
    }

    return res.redirect("/tracker?uploaded=1");
  } catch (error) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, function () {});
    }
    next(error);
  }
}

const projectRoot = path.join(__dirname, "..");

async function rebuildParsedJsonFromRaw(fileDoc) {
  if (!fileDoc.rawStoredPath) {
    return null;
  }
  const rawAbs = path.join(projectRoot, fileDoc.rawStoredPath);
  const parsedAbs = path.join(projectRoot, fileDoc.storedPath);
  const parsedRecords = await parseFlightFileToJson(rawAbs);
  const aiParsed = await parseRowsWithAiAgent(parsedRecords, {
    filename: fileDoc.originalName,
  });
  const standardizedRecords =
    aiParsed && Array.isArray(aiParsed.standardizedRecords) && aiParsed.standardizedRecords.length > 0
      ? aiParsed.standardizedRecords
      : parsedRecords;
  await fsp.mkdir(path.dirname(parsedAbs), { recursive: true });
  await fsp.writeFile(parsedAbs, JSON.stringify(standardizedRecords, null, 2), "utf-8");
  return standardizedRecords;
}

async function getFlightData(req, res, next) {
  try {
    const fileId = req.params.fileId;
    const fileDoc = await FlightFile.findByIdForUser(req.session.uid, fileId);
    if (!fileDoc) {
      return res.status(404).json({ ok: false, message: "Saved file not found." });
    }

    const parsedAbs = path.join(projectRoot, fileDoc.storedPath);
    let records;
    try {
      const text = await fsp.readFile(parsedAbs, "utf-8");
      records = JSON.parse(text);
    } catch (err) {
      if (err && err.code === "ENOENT") {
        try {
          const rebuilt = await rebuildParsedJsonFromRaw(fileDoc);
          if (!rebuilt) {
            return res.status(404).json({
              ok: false,
              message: "Stored flight data is missing and cannot be rebuilt. Please upload the file again.",
            });
          }
          records = rebuilt;
        } catch {
          return res.status(404).json({
            ok: false,
            message: "Stored flight data is missing and could not be rebuilt. Please upload the file again.",
          });
        }
      } else {
        throw err;
      }
    }

    return res.json({
      ok: true,
      file: {
        _id: fileDoc._id.toString(),
        originalName: fileDoc.originalName,
      },
      records: Array.isArray(records) ? records : [],
    });
  } catch (error) {
    next(error);
  }
}

function isSafeRelativeStoragePath(rel) {
  if (!rel || typeof rel !== "string") return false;
  if (rel.includes("..")) return false;
  if (path.isAbsolute(rel)) return false;
  return true;
}

async function unlinkIfExists(absPath) {
  try {
    await fsp.unlink(absPath);
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
  }
}

async function deleteTrackerFile(req, res, next) {
  if (!isAjaxRequest(req)) {
    return res.status(400).json({ ok: false, message: "Invalid request." });
  }
  try {
    const fileId = req.params.fileId;
    if (!mongodb.ObjectId.isValid(fileId)) {
      return res.status(422).json({ ok: false, message: "Invalid file id." });
    }

    const fileDoc = await FlightFile.findByIdForUser(req.session.uid, fileId);
    if (!fileDoc) {
      return res.status(404).json({ ok: false, message: "Saved file not found." });
    }

    const relPaths = [fileDoc.storedPath, fileDoc.rawStoredPath].filter(Boolean);
    for (let i = 0; i < relPaths.length; i += 1) {
      const rel = relPaths[i];
      if (!isSafeRelativeStoragePath(rel)) {
        return res.status(500).json({ ok: false, message: "Invalid stored path." });
      }
      await unlinkIfExists(path.join(projectRoot, rel));
    }

    const delResult = await FlightFile.deleteByIdForUser(req.session.uid, fileId);
    if (!delResult.deletedCount) {
      return res.status(404).json({ ok: false, message: "Saved file not found." });
    }

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTracker, uploadTrackerFile, getFlightData, deleteTrackerFile };
